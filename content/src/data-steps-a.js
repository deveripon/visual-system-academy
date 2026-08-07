// data-steps-a.js — Packet Odyssey, chapters 1–8
// JS code → V8 → runtime branch → fetch() internals → DNS → syscall → socket → TCP SYN egress.
// Defines window.STEPS_A. Plain ES2019, no imports, no trailing calls.

window.STEPS_A = [

  // ════════════════════════ Chapter 1 · JavaScript Code ════════════════════════

  {
    id: 'js-fetch-call',
    chapter: 1,
    title: 'The app calls fetch()',
    node: 'appcode',
    mode: 'user',
    state: { mode: 'user', proc: 'chrome renderer PID 4821', mem: 'user' },
    explain: {
      what: "One line of JavaScript runs on your laptop, and so far nothing has left the machine. A product-listing component in our shop app executes await fetch('https://api.shop.dev/products?limit=20') — a single function call that is about to wake up two compilers, a sandboxed browser process, the Linux kernel, your home router, a good chunk of the internet, and a PostgreSQL server on the far side of it. At this exact instant, the number of network bytes in existence is zero.",
      why: "Every network request in the world starts like this — as an ordinary function call sitting in memory — and the distance between that call and an actual copper wire is the whole story we are about to walk.",
      component: 'Application JavaScript (products.js in the SPA bundle)',
      layer: 'User space · Application code (above OSI L7)',
      abstraction: 'One await = an entire distributed system round trip',
      protocol: 'None yet — pure ECMAScript semantics',
      misconception: "You might think fetch() sends the request. Actually it only starts a chain of work: the HTTP request will not touch the wire until DNS, TCP, and TLS have all finished, dozens of steps from now.",
      analogy: "Dropping a letter into your own outbox tray. The letter is real and addressed, but no van, no plane, and no postal worker has moved a centimetre yet.",
      command: 'pgrep -a chrome | head -5',
      production: 'Real apps never call bare fetch(): they wrap it with AbortController timeouts, retry budgets, and tracing headers (traceparent), because everything downstream of this line can and will fail.'
    },
    code: [
      {
        title: 'products.js — where it all begins',
        lang: 'js',
        code: "async function loadProducts() {\n  const res = await fetch('https://api.shop.dev/products?limit=20');\n  if (!res.ok) throw new Error('HTTP ' + res.status);\n  const products = await res.json();\n  renderGrid(products);\n}\nloadProducts();"
      }
    ],
    prod: {
      title: 'Island Tours asks for its tour list',
      explain: { production: "On the Island Tours booking site the same line reads `await fetch('https://api.islandtours.io/tours')`. Same physics, different domain — and downstream it will hit Caddy instead of nginx, and `prisma.tour.findMany({ take: 20 })` instead of the products query." },
      code: [
        {
          title: 'tours.js — Island Tours edition',
          lang: 'js',
          code: "async function loadTours() {\n  const res = await fetch('https://api.islandtours.io/tours');\n  const tours = await res.json();\n  renderTourCards(tours);\n}\nloadTours();"
        }
      ]
    }
  },

  {
    id: 'js-source-bytes',
    chapter: 1,
    title: 'Your code is just bytes',
    node: 'appcode',
    mode: 'user',
    explain: {
      what: "Before anything \"runs\", your script is just a blob of text sitting in memory — it arrived earlier over the network as part of the app bundle. V8, the JavaScript engine inside Chrome, is handed three things: a pointer to where those bytes live, how many there are, and how they are encoded (UTF-8). The characters f-e-t-c-h are, at this moment, literally the numbers 66 65 74 63 68, and nobody has decided what they mean.",
      why: "Turning text into a running program is real engineering, and V8 sweats the details here — one-byte versus two-byte string storage, compiling while the script is still downloading, and a code cache keyed on these exact bytes.",
      component: 'V8 source handling (v8::ScriptCompiler, streamed compilation)',
      layer: 'User space · Renderer process heap',
      abstraction: 'Text ≠ program. A program is what a parser agrees the text means.',
      protocol: 'None — UTF-8 encoded source (ECMA-262 §11 source text)',
      misconception: "You might think the browser reads your code line by line as it goes. Actually V8 scans and parses whole scripts up front (lazily for the functions inside them) before a single statement runs.",
      analogy: "A handful of Scrabble tiles laid out to spell a sentence: every letter is there in order, but until someone reads them they are just wooden squares.",
      command: 'curl -s https://shop.dev/assets/app.js | head -c 200 | xxd | head',
      production: 'Ship smaller bytes: minification, compression (brotli), and code-splitting all attack this exact buffer. V8 also persists a code cache on the third load of the same script bytes, skipping parse entirely.'
    },
    code: [
      {
        title: 'The same fetch call, as the machine first sees it',
        lang: 'bash',
        code: '$ echo -n "await fetch(" | xxd\n00000000: 6177 6169 7420 6665 7463 6828            await fetch('
      }
    ]
  },

  {
    id: 'js-url-anatomy',
    chapter: 1,
    title: 'Anatomy of the URL',
    node: 'appcode',
    mode: 'user',
    explain: {
      what: "The URL gets taken apart into labelled pieces, and each piece is a job order for a different part of the system. Parsed by the rules browsers follow (the WHATWG URL Standard), 'https://api.shop.dev/products?limit=20' becomes: scheme https, host api.shop.dev, an implicit port 443 (nobody typed it — https means 443), path /products, and query limit=20. The scheme decides that TLS encryption is required; the host drives DNS and later the TLS SNI field and the Host header; the port picks which door to knock on; and the path and query mean nothing to anyone until they reach the application server thousands of kilometres away.",
      why: "This one string is the routing plan for the entire journey — misread one piece and you will happily spend an afternoon debugging the wrong layer.",
      component: 'WHATWG URL parser (url.spec.whatwg.org; GURL in Chromium)',
      layer: 'User space · Application data',
      abstraction: 'One string encoding decisions for five different layers',
      protocol: 'URL (WHATWG URL Standard, obsoletes RFC 3986 for browsers)',
      misconception: "You might think the path /products is used to route the packet. Actually routers and the kernel never see the path at all: only the destination IP address routes packets, and the path rides along as payload, encrypted inside TLS.",
      analogy: "A rail ticket: the operator (scheme) decides whose network you are on, the destination station (host) decides how the train is routed, and the seat number (path) only matters once you are aboard.",
      command: 'node -e "console.log(new URL(\'https://api.shop.dev/products?limit=20\'))"',
      production: 'Watch for URL parser mismatches: proxies, WAFs, and apps that disagree on parsing (e.g. backslash handling, double-encoding) are a classic SSRF/bypass class. Normalize once, early.'
    },
    code: [
      {
        title: 'What the URL parser produces',
        lang: 'js',
        code: "const u = new URL('https://api.shop.dev/products?limit=20');\nu.protocol  // 'https:'  → TLS handshake required\nu.hostname  // 'api.shop.dev' → DNS lookup + SNI + Host header\nu.port      // ''  → default 443 for https\nu.pathname  // '/products'  → only the origin server cares\nu.search    // '?limit=20'  → ditto"
      }
    ],
    prod: {
      title: 'Anatomy of the URL — Island Tours',
      explain: { production: "For `https://api.islandtours.io/tours`: same implicit 443, host `api.islandtours.io` drives DNS/SNI, and `/tours` is only meaningful to the NestJS route handler behind Caddy. Note `.io` vs `.dev` — that TLD difference will matter at the HSTS step." },
      code: [
        {
          title: 'Island Tours URL, parsed',
          lang: 'js',
          code: "const u = new URL('https://api.islandtours.io/tours');\nu.hostname  // 'api.islandtours.io'\nu.port      // '' → 443\nu.pathname  // '/tours'"
        }
      ]
    }
  },

  {
    id: 'js-promise-pending',
    chapter: 1,
    title: 'A Promise is born (pending)',
    node: 'appcode',
    mode: 'user',
    explain: {
      what: "fetch() hands something back instantly — but it is not the data, it is an IOU. That IOU is a Promise in the pending state: no value yet, and a slot where one will eventually appear. The await in front of it suspends loadProducts: V8 sweeps up the function's live local variables and its exact place in the code, parcels them into an object on the heap, attaches a \"wake me up\" hook to the promise, and hands control back to whatever called us. The JavaScript thread is now completely free; nothing is blocked.",
      why: "This little suspension is the entire concurrency model of JavaScript — one thread, no sitting around waiting — and the response, seconds and thousands of kilometres from now, will resume this exact frozen frame.",
      component: 'V8 promise machinery + async function suspension (JSPromise, await = suspend/resume)',
      layer: 'User space · JS engine heap',
      abstraction: 'A placeholder for a value that does not exist yet',
      protocol: 'ECMAScript (ECMA-262 §27.2 Promise Objects, §27.7 AsyncFunction)',
      misconception: "You might think await pauses the browser. Actually it pauses only this one async function; the event loop keeps pumping, so clicks, timers, and rendering all carry on while the promise is pending.",
      analogy: "A restaurant pager. You get the buzzer the moment you order, wander off and chat while the kitchen works, and it lights up when your food is ready.",
      command: 'node -e "const p = fetch(\'https://api.shop.dev/products?limit=20\'); console.log(p)"',
      production: 'Pending promises are where memory leaks hide: a promise that never settles pins its whole closure chain forever. Always pair fetch with AbortSignal.timeout() so pending cannot mean eternal.'
    },
    code: [
      {
        title: 'What await roughly desugars to',
        lang: 'js',
        code: "// async/await is generator-shaped under the hood (simplified):\nfunction loadProducts() {\n  return fetch(URL).then(function resume(res) {\n    // ← execution re-enters HERE later, via the microtask queue\n    if (!res.ok) throw new Error('HTTP ' + res.status);\n    return res.json();\n  });\n}\n// fetch returned: Promise { <pending> } — and the thread moves on"
      }
    ]
  },

  // ════════════════════════ Chapter 2 · V8 Compilation ════════════════════════

  {
    id: 'v8-scan-parse',
    chapter: 2,
    title: 'Scanner and parser eat the bytes',
    node: 'parser',
    mode: 'user',
    explain: {
      what: "Now something finally reads those letters and decides what they mean. V8's scanner walks the text once and chops it into tokens — small labelled pieces like \"the keyword await\", \"the name fetch\", \"an open bracket\", \"a string\". The parser then reads that stream and works out the grammar, the way you would diagram a sentence. And V8 is deliberately lazy: functions that are not called immediately get only pre-parsed — a quick check that the code is at least well formed, recording where variables live but building nothing — with the real parse deferred until the function is actually called.",
      why: "Parsing costs real time, and on big bundles it can dominate startup, so V8 spends the effort only where code actually runs; a pre-parse is roughly twice as fast as the full job.",
      component: 'V8 Scanner + Parser (v8/src/parsing/scanner.cc, parser.cc, preparser.cc)',
      layer: 'User space · JS engine, renderer main or background thread',
      abstraction: 'Flat characters → grammatical structure',
      protocol: 'ECMA-262 grammar (Annex B included, regrettably)',
      misconception: "You might think JavaScript is not compiled. Actually it is compiled at least once and possibly four times over (Ignition, Sparkplug, Maglev, TurboFan) — what you are watching right now is the front end of a real compiler.",
      analogy: "A proofreader with two speeds: a quick skim to check every paragraph is at least grammatical, and a slow careful read — only on the pages that matter — to work out what the sentences actually say.",
      command: 'node --v8-options | grep -i lazy | head -5',
      production: 'Bundlers exploit laziness: wrapping hot-path functions in parens as IIFEs (or using explicit "eager" hints) avoids the double parse penalty of pre-parse-then-parse for code called during startup.'
    },
    code: [
      {
        title: 'Token stream for our line (conceptual)',
        lang: 'bash',
        code: 'await fetch ( "https://api.shop.dev/products?limit=20" )\n  │     │   │                  │                          │\n  │     │   └─ Token::LPAREN   └─ Token::STRING           └─ Token::RPAREN\n  │     └─ Token::IDENTIFIER "fetch"\n  └─ Token::AWAIT'
      }
    ]
  },

  {
    id: 'v8-ast',
    chapter: 2,
    title: 'The Abstract Syntax Tree',
    node: 'ast',
    mode: 'user',
    explain: {
      what: "The parser hands back a tree: the shape of your program with all the punctuation thrown away. This is the AST, short for Abstract Syntax Tree. Our line becomes an Await node wrapping a Call node, whose callee is a placeholder for the name fetch (a VariableProxy — \"some variable called fetch, to be identified later\") and whose single argument is a string Literal. Alongside, scope analysis works out where every name lives and concludes that fetch is not a local variable and not captured from an enclosing function, so it will have to be looked up on the global object at runtime.",
      why: "Everything after this — generating instructions, optimising them, even printing an error message with a line number — is a walk over this tree. The AST is the moment text officially becomes program.",
      component: 'V8 AST + scope resolution (v8/src/ast/ast.h, scopes.cc)',
      layer: 'User space · JS engine heap (zone-allocated, thrown away after codegen)',
      abstraction: 'Program as a tree of intent, stripped of syntax trivia',
      protocol: 'None — internal compiler IR',
      misconception: "You might think the AST sticks around while your program runs. Actually V8 throws it away the instant instructions have been generated from it; it lives in a scratch memory area for a few microseconds.",
      analogy: "The exploded-view diagram in flat-pack furniture instructions: not the shelf, but the structure that tells you how a shelf goes together — and useless the moment assembly is finished.",
      command: 'out/Debug/d8 --print-ast app.js   # requires a V8 debug build',
      production: 'Tools you rely on daily — Babel, ESLint, terser, Prettier — are all AST walkers of exactly this shape. Parse cost is why lint/format runs are CPU-bound on large monorepos.'
    },
    code: [
      {
        title: 'AST for: await fetch(url)  (simplified)',
        lang: 'bash',
        code: 'ExpressionStatement\n└── Await\n    └── Call\n        ├── VariableProxy "fetch"      (unresolved → global lookup)\n        └── Literal "https://api.shop.dev/products?limit=20"'
      }
    ]
  },

  {
    id: 'v8-ignition-gen',
    chapter: 2,
    title: 'Ignition generates bytecode',
    node: 'ignition',
    mode: 'user',
    explain: {
      what: "V8 now turns that tree into a short list of very simple instructions. The part doing the work is called Ignition, and what it produces is bytecode: instructions not for your actual processor but for an imaginary machine that has a bank of numbered slots (registers r0, r1, and so on) plus one special slot, the accumulator, that most instructions quietly read from or write to. Our single line becomes roughly: fetch the global called fetch, park it in a slot, load the URL text, issue a call.",
      why: "Bytecode is 25 to 50 times smaller than fully optimised machine code and cheap to produce — exactly right for code that runs once or twice, which describes most code on the web.",
      component: 'Ignition BytecodeGenerator (v8/src/interpreter/bytecode-generator.cc)',
      layer: 'User space · JS engine',
      abstraction: 'A portable instruction set that exists in no silicon',
      protocol: 'None — V8 internal bytecode (changes between versions, never serialize it)',
      misconception: "You might think bytecode is the slow fallback an engine settles for. Actually Ignition bytecode plus inline caches is startlingly fast, and it is the single source of truth: when heavily optimised code gives up, it falls back to this bytecode, never to your source text.",
      analogy: "Turning a chatty recipe into a numbered list a kitchen robot can follow: shorter, blunter, and executable without any judgement calls.",
      command: 'node --print-bytecode --print-bytecode-filter=loadProducts app.js',
      production: 'Bytecode size shows up in memory profiles as "bytecode" in heap snapshots. Huge bundles pay here twice: parse time and resident bytecode. Chrome flushes bytecode of functions unused for a few GCs.'
    },
    code: [
      {
        title: 'Compiler pipeline position',
        lang: 'bash',
        code: 'source bytes → Scanner → Parser → AST → BytecodeGenerator → Ignition bytecode\n                                              (you are here) ─────┘'
      }
    ]
  },

  {
    id: 'v8-bytecode',
    chapter: 2,
    title: 'The bytecode itself',
    node: 'bytecode',
    mode: 'user',
    explain: {
      what: "Here is the actual list, lightly tidied. LdaGlobal grabs the global fetch and drops it into the accumulator; Star r1 stashes it in slot 1; CallUndefinedReceiver1 r1, r2 makes the call with one argument; and because we wrote await, a SuspendGenerator follows, freezing that whole set of slots into the heap object we met in chapter 1. Those little [n] numbers beside each instruction are indexes into a notebook called the feedback vector — remember them, they matter two steps from now.",
      why: "Reading real bytecode dissolves the mystery: no magic, just a small instruction set of around 180 opcodes shuffling values between numbered slots and one accumulator.",
      component: 'Ignition bytecode array (BytecodeArray object on the JS heap)',
      layer: 'User space · JS engine heap',
      abstraction: 'Your async function as ~10 machine-agnostic instructions',
      protocol: 'None — internal representation',
      misconception: "You might think one line of JavaScript is one operation. Actually our line became a global lookup, a constant load, a slot move, a call with receiver rules, and a complete freeze of the function's execution.",
      analogy: "Sheet music versus a piano roll: the same tune, but the roll is mechanical and unambiguous — a machine can play it with no interpretation at all.",
      command: 'node --print-bytecode -e "async function f(){ await fetch(\'https://api.shop.dev/\') } f()" 2>/dev/null | head -30',
      production: 'When profiling shows time in `Builtins_InterpreterEntryTrampoline`, you are watching Ignition execute exactly this kind of listing — a signal the function never got hot enough to tier up, or keeps deoptimizing.'
    },
    code: [
      {
        title: 'Ignition bytecode for await fetch(url) — simplified',
        lang: 'bash',
        code: '[generated bytecode for function: loadProducts]\n Parameter count 1\n Register count 4\n   LdaGlobal [0], [0]            ; acc ← globalThis.fetch  (slot 0 feedback)\n   Star r1                       ; r1 ← acc\n   LdaConstant [1]               ; acc ← "https://api.shop.dev/products?limit=20"\n   Star r2                       ; r2 ← acc\n   CallUndefinedReceiver1 r1, r2, [2]   ; acc ← fetch(url)\n   SuspendGenerator r0, r0-r2 [3]       ; freeze frame, yield to caller (await)\n   ...\n   ResumeGenerator r0, r0-r2     ; ← re-entry point when promise settles'
      }
    ]
  },

  {
    id: 'v8-interpreter-cpu',
    chapter: 2,
    title: 'The interpreter is machine code on a real CPU',
    node: 'cpu',
    mode: 'user',
    explain: {
      what: "Something has to actually perform those instructions, and that something is ordinary machine code on your real processor. Ignition \"interprets\" the bytecode, but the interpreter itself is native code: every bytecode has its own handler, generated when V8 was built, and running the program means jumping from handler to handler through a lookup table — do the work, read the next bytecode, jump to its handler. Your CPU, sitting in ring 3 (the unprivileged mode where normal programs live), is executing real x86-64 instructions the whole time.",
      why: "This kills the false split between \"interpreted\" and \"compiled\" languages: interpreting is simply executing machine code that happens to treat your program as data.",
      component: 'Ignition dispatch loop (Builtins_*Handler, generated from v8/src/interpreter/interpreter-generator.cc)',
      layer: 'User space · CPU ring 3',
      abstraction: 'A CPU pretending to be a different, friendlier CPU',
      protocol: 'x86-64 ISA (or ARM64) — unprivileged instructions only',
      misconception: "You might think JavaScript runs in a virtual machine rather than on your CPU. Actually every JS operation you ever wrote retires as real x86-64 instructions on a physical core — the \"virtual machine\" is a discipline about how control flows, not a second computer.",
      analogy: "A simultaneous interpreter at a conference: the audience only ever hears their own language spoken by a human voice, while the foreign text on the page is read and re-spoken phrase by phrase.",
      command: 'perf top -p 1337   # look for Builtins_ * Handler and InterpreterEntryTrampoline symbols',
      production: 'On-CPU profilers (perf, pprof) show interpreter frames as builtins, not your function names, unless you enable --perf-basic-prof (Node) to emit a JIT symbol map for perf to resolve.'
    },
    code: [
      {
        title: 'Dispatch, conceptually',
        lang: 'c',
        code: '/* every handler ends by dispatching to the next one — threaded interpretation */\nhandler_LdaGlobal:\n    acc = LoadGlobalIC(name, feedback_slot);\n    opcode = *++bytecode_ptr;\n    goto *dispatch_table[opcode];   /* indirect jump, ring 3, real CPU */\nhandler_Star:\n    registers[operand0] = acc;\n    opcode = *++bytecode_ptr;\n    goto *dispatch_table[opcode];'
      }
    ]
  },

  {
    id: 'v8-feedback-ic',
    chapter: 2,
    title: 'Inline caches take notes',
    node: 'ignition',
    mode: 'user',
    explain: {
      what: "While the program runs, V8 quietly takes notes on what it sees. Into those [0] and [2] slots — the feedback vector — it records things like: what shape did this object have, and which function did this call site actually call? A spot in the code that only ever sees one shape is called monomorphic and can be made very fast; a few shapes is polymorphic; too many and it goes megamorphic, at which point V8 gives up and falls back to a slow generic lookup. This gossip is the raw material the optimiser will burn.",
      why: "JavaScript lets a value be anything, but real programs are boringly consistent — and these notes are how the engine turns \"it has always been this way\" into a bet worth taking.",
      component: 'Feedback vectors + inline caches (v8/src/ic/, FeedbackVector on-heap)',
      layer: 'User space · JS engine heap',
      abstraction: 'A profiler built into every call site and property access',
      protocol: 'None — internal heuristics',
      misconception: "You might think V8 optimises your code by reading it cleverly. Actually it optimises by watching it run: code that never gets hot is never optimised however elegantly you wrote it, and hot code fed chaotic types cannot be.",
      analogy: "A barista who notices the same person orders the same flat white every morning at eight, and starts pulling the shot before they reach the counter — until the day they ask for tea, and everything drops back to the careful path.",
      command: 'node --trace-ic -e "function g(o){return o.x} g({x:1}); g({x:2}); g({x:3,y:4})" | head',
      production: 'Megamorphic call sites are a real perf bug class: mixing many object shapes through one hot helper (common with "options bag" objects of varying key order) silently degrades every access to a dictionary lookup.'
    },
    code: [
      {
        title: 'IC states at our call site',
        lang: 'js',
        code: "// site: fetch(url)\n// feedback slot [2] records: target = the same global fetch, every time\n//   → monomorphic call site. TurboFan can inline or direct-call it.\n// site: res.ok / res.json()\n// feedback: every Response object has the same hidden class\n//   → property offset can be baked in as a single memory load."
      }
    ]
  },

  {
    id: 'v8-turbofan-optimize',
    chapter: 2,
    title: 'TurboFan compiles the hot path',
    node: 'turbofan',
    mode: 'user',
    explain: {
      what: "If this code runs often enough, V8 stops being polite and rebuilds it as fast machine code. It climbs a ladder: Sparkplug produces quick, unambitious native code; then Maglev; then TurboFan, the heavy optimiser, which reads the bytecode plus all those notes from the feedback vector and builds a graph of the program so it can rearrange it freely. Then it bets on what it saw — \"fetch is always this same function\", \"res always has this shape\" — runs type inference, deletes redundant work, works out which values never escape, and picks real instructions. All of that happens on a background thread while the interpreter keeps running the same function, unbothered.",
      why: "Betting on the past is the only way a language this flexible gets near native speed: assume the types you have actually observed, check the assumption cheaply, and bail out if you were wrong.",
      component: 'TurboFan (v8/src/compiler/), concurrent compilation on the compiler dispatcher thread',
      layer: 'User space · Background thread',
      abstraction: 'Betting machine code on the future looking like the past',
      protocol: 'None — internal',
      misconception: "You might think the JIT compiles everything eventually. Actually over 90% of typical web code only ever runs in Ignition or Sparkplug — TurboFan is reserved for proven-hot functions, because compiling everything would cost more than it saves.",
      analogy: "A courier who, after a week of identical deliveries, memorises one perfect route and stops consulting the map — while keeping the map in the glovebox for the morning a bridge is closed.",
      command: 'node --trace-opt app.js 2>&1 | grep -m5 "optimizing"',
      production: 'Node flags --trace-opt/--trace-deopt are safe in production triage. Frequent recompile/deopt cycles ("deopt loops") show up as CPU burn with no throughput — usually one call site fed with alternating shapes.'
    },
    code: [
      {
        title: 'The tiering ladder',
        lang: 'bash',
        code: 'Ignition (interpret, gather feedback)      tier 0 — everyone starts here\n  ↓ warm\nSparkplug (dumb fast baseline machine code) tier 1\n  ↓ hot\nMaglev (fast mid-tier optimizer)            tier 2\n  ↓ very hot\nTurboFan (speculative, sea-of-nodes)        tier 3 — deopt drops you back to 0'
      }
    ]
  },

  {
    id: 'v8-machinecode-deopt',
    chapter: 2,
    title: 'Optimized machine code — with an ejector seat',
    node: 'machinecode',
    mode: 'user',
    quiz: {
      q: 'A hot function suddenly runs slow for a moment, then speeds back up. What most likely happened inside V8?',
      options: [
        'The garbage collector moved the function in memory',
        'A value with an unexpected type hit a check → deoptimization back to bytecode, then re-optimization',
        'The CPU switched the process to an efficiency core'
      ],
      answer: 1,
      explain: "Optimized machine code checks its own assumptions with cheap one-instruction guards. When a guard fails, deoptimization fires: the stack frame is rebuilt for the interpreter and execution carries on there — slower, but correct — the engine updates its notes, and the function may be re-optimized later with the new reality baked in."
    },
    explain: {
      what: "TurboFan writes genuine x86-64 instructions into memory marked executable. Reading a property becomes a single MOV from a fixed offset; the call to fetch becomes a direct jump to a known address. But every assumption is fenced by a guard — one cheap instruction just before the fast operation, asking \"is this object still the shape I bet on?\". When a guard fails, deoptimization fires: mid-flight, the optimised stack frame is translated back into an interpreter frame and execution simply continues in Ignition, slower but never wrong.",
      why: "That ejector seat is what makes the whole gamble legal — without a guaranteed way to fall back, a JavaScript compiler could only ever make timid, slow assumptions.",
      component: 'TurboFan codegen + Deoptimizer (v8/src/deoptimizer/)',
      layer: 'User space · CPU ring 3, JIT executable pages (W^X)',
      abstraction: 'Fast path with a provably-correct escape hatch',
      protocol: 'x86-64 ISA, unprivileged',
      misconception: "You might think that once compiled, JavaScript is as fixed as C. Actually the machine code is provisional: one stray products.legacy_field = 1 on a previously stable object shape can invalidate optimised code right across your program.",
      analogy: "A stunt jump with a hidden airbag under the landing: the trick is genuinely being performed, and the guarantee is that a miss puts you down safely on something slower and softer.",
      command: 'node --trace-deopt app.js 2>&1 | head',
      production: 'JIT pages are why Node/Chrome need W^X-aware hardening (and why some lockdown environments run --jitless). Security teams care: JIT spray was a classic exploitation primitive.'
    },
    code: [
      {
        title: 'What a guarded fast path looks like (annotated asm)',
        lang: 'c',
        code: '/* res.ok — optimized, speculating res has map M1 */\nmov  rax, [rbp-0x18]        ; load res\ncmp  [rax-1], M1_ADDR       ; guard: is the hidden class still M1?\njne  deopt_bailout_42       ; no → eject to Ignition, frame rebuilt\nmov  rbx, [rax+0x1f]        ; yes → res.ok is one load at fixed offset\n/* deopt_bailout_42 → Deoptimizer::TranslateFrame → interpreter resumes */'
      }
    ]
  },

  // ════════════════════════ Chapter 3 · Runtime (BRANCH) ════════════════════════

  {
    id: 'rt-branch',
    chapter: 3,
    title: 'Fork in the road: who hosts this JavaScript?',
    node: 'appcode',
    mode: 'user',
    branch: {
      key: 'runtime',
      question: 'Where is this JavaScript actually running?',
      options: [
        { value: 'browser', label: 'Chrome (browser)', hint: 'fetch is a browser API: a locked-down tab hands the job to Chrome\'s separate network process' },
        { value: 'node', label: 'Node.js', hint: 'fetch is plain JavaScript here (undici on libuv) — one process, PID 1337, talking straight to the kernel' }
      ]
    },
    explain: {
      what: "The very same file of JavaScript can run in two completely different worlds, and they part company right here. V8 knows only the language itself — grammar, objects, numbers. Anything that touches the outside world (timers, files, the network) belongs to whoever is hosting V8, the embedder. In Chrome that host is Blink, plus a multi-process sandbox and a dedicated network process. In Node.js it is libuv and an HTTP client called undici, all inside one process.",
      why: "This is the most misunderstood line in all of JavaScript: the runtime, not the language, decides how your code is allowed to touch the world.",
      component: 'Embedder boundary (Chrome: Blink + //services/network · Node: node core + libuv + undici)',
      layer: 'User space · Process architecture',
      abstraction: 'One language, pluggable universes',
      protocol: 'None — architectural decision point',
      misconception: "You might think Node is a browser without a window. Actually Node shares only V8 with Chrome — no DOM, no Blink, no renderer sandbox, a different event loop and completely different networking.",
      analogy: "The same play staged in two theatres: identical script, but different stagehands, rigging, lighting desks, and fire regulations.",
      command: 'node -p "typeof window === \'undefined\' ? \'this is node\' : \'this is a browser\'"',
      production: 'Isomorphic code that assumes browser-only or node-only globals (window, process) is a steady source of SSR crashes. Feature-detect the host, never assume it.'
    }
  },

  {
    id: 'rt-webapi-fetch',
    chapter: 3,
    title: 'fetch() is a Web API, not JavaScript',
    node: 'webapi',
    mode: 'user',
    when: { runtime: 'browser' },
    explain: {
      what: "fetch is not part of the JavaScript language at all — it is something the browser lends you. Search the language standard (ECMA-262) for \"fetch\" and you get zero hits; it is defined in a separate document, the WHATWG Fetch Standard, implemented inside Chrome in C++ by Blink, and exposed to JavaScript through generated glue code. So when our bytecode ran LdaGlobal \"fetch\", the thing it loaded was a function object whose body is native browser code, waiting to be entered.",
      why: "The global object is the airlock between the language and the platform — the DOM, timers, storage and the network all get into your program through that one door.",
      component: 'Blink Fetch API (third_party/blink/renderer/core/fetch/) + V8 IDL bindings',
      layer: 'User space · Renderer process, Blink side',
      abstraction: 'Platform capabilities disguised as ordinary functions',
      protocol: 'Fetch Standard (fetch.spec.whatwg.org)',
      misconception: "You might think fetch is part of JavaScript, like Array. Actually Array is in the language standard and fetch is a host feature — which is exactly why Node had to add it (in v18, using undici) decades after the language existed.",
      analogy: "The phone on a hotel room desk: the handset is yours to pick up, but dialling 0 reaches staff who can do things no guest is allowed to do themselves.",
      command: 'node -p "typeof fetch + \' — provided by the host, not by ECMA-262\'"',
      production: 'Because fetch is host-defined, semantics differ subtly across hosts: browser fetch enforces CORS and cookies; Node/undici fetch has no CORS (it is not a browser security boundary) — a recurring source of "works in curl, fails in browser" tickets.'
    },
    code: [
      {
        title: 'Where the call leaves JavaScript',
        lang: 'cpp',
        code: '// Blink (C++), reached via V8 IDL bindings when JS calls fetch():\nScriptPromise<Response> WindowOrWorkerGlobalScopeFetch::fetch(\n    ScriptState* script_state, const V8RequestInfo* input,\n    const RequestInit* init, ExceptionState& exception_state) {\n  // build Request, consult CORS, hand off to the FetchManager…\n}'
      }
    ]
  },

  {
    id: 'rt-event-loop',
    chapter: 3,
    title: 'The event loop and the microtask queue',
    node: 'eventloop',
    mode: 'user',
    when: { runtime: 'browser' },
    explain: {
      what: "The browser tab has one main thread, and it runs a very simple loop for its whole life: pick up a job, finish it completely, then work through a to-do list of small follow-ups, maybe draw the screen, repeat. The jobs are tasks — a click, a timer firing, parsing HTML. The follow-ups are microtasks, and every promise reaction is one of them, including waking up our suspended loadProducts: they run after the current task finishes but before the next one begins, ahead of both rendering and timers.",
      why: "This ordering is why await-heavy code stays smooth and responsive — and also why a runaway microtask loop can freeze a page far harder than any storm of setTimeout ever could.",
      component: 'Blink scheduler + V8 microtask queue (base::sequence_manager, MicrotaskQueue)',
      layer: 'User space · Renderer main thread',
      abstraction: 'Cooperative multitasking with two priority classes',
      protocol: 'HTML Standard §8.1 event loops (html.spec.whatwg.org)',
      misconception: "You might think setTimeout(fn, 0) runs right after the current code. Actually every pending microtask goes first, and then the timer still has to wait for the loop to come round again — with a 4ms floor once timers are nested.",
      analogy: "A doctor who, after each appointment, answers every sticky note left on the door before calling the next patient in — and only tidies the room between patients.",
      command: 'node -e "setTimeout(() => console.log(\'macrotask\'), 0); Promise.resolve().then(() => console.log(\'microtask first\'))"',
      production: 'Long-task monitoring (PerformanceObserver "longtask", INP metric) is effectively event-loop observability. Any task > 50ms delays input; the fix is chunking work with scheduler.yield() or postTask.'
    },
    code: [
      {
        title: 'One turn of the loop',
        lang: 'js',
        code: "// loop: (simplified)\nwhile (true) {\n  task = taskQueues.takeHighestPriority();  // click, timer, network chunk…\n  run(task);                                 // to completion, nothing preempts\n  while (microtasks.length) run(microtasks.shift()); // ALL promise reactions\n  if (shouldRender()) renderFrame();         // style/layout/paint\n}\n// our await resumption enters via that middle line — the microtask drain"
      }
    ]
  },

  {
    id: 'rt-mojo-ipc',
    chapter: 3,
    title: 'Mojo IPC: renderer → network service',
    node: 'netservice',
    mode: 'user',
    when: { runtime: 'browser' },
    state: { proc: 'chrome network service PID 4903' },
    effects: ['ctx'],
    explain: {
      what: "The tab that ran your code is not allowed anywhere near the network. The renderer process (PID 4821) lives inside a sandbox: a kernel-level filter called seccomp-bpf simply refuses to let it create a socket or connect at all, because a hacked tab must not come with a network stack attached. So Blink packs the request — URL, method, headers, options — into a message and posts it down a shared-memory pipe (Chrome's IPC system, Mojo) to the network service: a separate process, PID 4903, that does the actual networking for every tab in the browser.",
      why: "Process isolation turns \"someone exploited a tab\" from \"they own your network\" into \"they are stuck in a box\" — at the cost of one message hop per request, which Chrome pays deliberately.",
      component: 'Mojo IPC + services/network (URLLoaderFactory::CreateLoaderAndStart)',
      layer: 'User space · Cross-process IPC (UNIX domain socket + shared memory)',
      abstraction: 'A function call that happens to cross a security boundary',
      protocol: 'Mojo (Chromium IPC), message pipes over socketpair(2)',
      misconception: "You might think the tab process opens the TCP connection. Actually it literally cannot: its sandbox rejects socket-related system calls outright, and only the network service and the browser process hold that privilege.",
      analogy: "A bank teller behind thick glass: you fill in a slip and push it through the tray, and only staff ever go near the vault.",
      command: 'pgrep -af "type=utility.*NetworkService" ',
      production: 'This is why chrome://net-export captures traffic for ALL tabs in one log — a single network service sees everything. It is also a shared failure domain: one network-service crash drops every in-flight request in the browser.'
    },
    code: [
      {
        title: 'The IPC hop (conceptual)',
        lang: 'cpp',
        code: '// renderer (PID 4821) — sandboxed, no socket() allowed:\nurl_loader_factory->CreateLoaderAndStart(\n    std::move(loader), request_id, options,\n    resource_request /* URL, GET, headers */,\n    std::move(client), traffic_annotation);\n// ── Mojo message pipe (shared memory + socketpair) ──▶\n// network service (PID 4903) — owns sockets, cache, DNS, TLS for all tabs'
      }
    ]
  },

  {
    id: 'rt-nodejs',
    chapter: 3,
    title: 'Node.js: V8 without the browser',
    node: 'nodejs',
    mode: 'user',
    when: { runtime: 'node' },
    state: { proc: 'node PID 1337' },
    explain: {
      what: "In the Node path there is exactly one process: node, PID 1337. It contains the same V8 that compiled our function a moment ago, but everything around V8 is different — no DOM, no sandbox, no separate network process. fetch has been a global here since Node 18 (stable in 21), and it is written in JavaScript, by a library called undici, rather than in C++ by Blink.",
      why: "Server runtimes are built for throughput and direct access to the kernel, not for containing a hostile web page, so all that multi-process armour is simply absent.",
      component: 'Node.js core (lib/internal/, node_bootstrap) embedding V8',
      layer: 'User space · Single process, PID 1337',
      abstraction: 'The same engine wearing a server uniform',
      protocol: 'None — runtime architecture',
      misconception: "You might think Node is single-threaded. Actually only the JavaScript is: PID 1337 also runs a libuv worker pool (4 threads by default) plus V8's garbage-collection and compiler threads — top -H -p 1337 shows about a dozen of them.",
      analogy: "The same engine block in two vehicles: a family car packed with airbags and child locks (Chrome), and a stripped-out rally car (Node) — identical power, far fewer things in the way.",
      command: 'node -p "process.versions"   # v8, uv, undici versions in one object',
      production: 'One process means one failure domain: an uncaught exception or OOM kills all in-flight requests. Hence clustering (SO_REUSEPORT workers), pm2/systemd restarts, and k8s liveness probes as standard practice.'
    },
    code: [
      {
        title: 'Proof fetch is JS here, not C++',
        lang: 'js',
        code: "// node --experimental-repl-await\n> fetch.toString().slice(0, 60)\n'async function fetch(input, init = undefined) {\\n  return netl…'\n// a real JS function from undici — compare Chrome: 'function fetch() { [native code] }'"
      }
    ]
  },

  {
    id: 'rt-libuv',
    chapter: 3,
    title: 'libuv: the event loop with a day job',
    node: 'libuv',
    mode: 'user',
    when: { runtime: 'node' },
    explain: {
      what: "One thread watching thousands of connections at once — this is the machine that pulls it off. libuv runs a loop with fixed phases: timers, pending callbacks, poll, check (setImmediate), close. Network sockets never block, because the poll phase parks inside a single kernel call, epoll_wait, that sleeps until any watched socket has news. But two kinds of work secretly run on a small pool of extra threads: filesystem calls, and — important for us — DNS lookups through getaddrinfo, because the C library offers no genuinely asynchronous way to resolve a name.",
      why: "Everything scalable about Node reduces to this one trick: a single thread juggling thousands of non-blocking sockets, with anything that insists on waiting exiled to a handful of worker threads.",
      component: 'libuv (deps/uv/, uv__io_poll → epoll_wait; uv_getaddrinfo → threadpool)',
      layer: 'User space · Event loop thread + worker pool',
      abstraction: 'Turning "wait for any of 10,000 things" into one blocking call',
      protocol: 'None — epoll(7), POSIX threads underneath',
      misconception: "You might think Node never blocks. Actually DNS lookups from dns.lookup() and from fetch land on that 4-thread pool, so four slow lookups against an unreachable resolver occupy all of them for five seconds each and stall your file reads too. dns.resolve() uses a different resolver (c-ares) and skips the pool entirely.",
      analogy: "A restaurant with one maitre d' who never leaves the floor, watching every table through a board of call lights, and four runners sent out for anything that needs someone to physically walk somewhere.",
      command: 'UV_THREADPOOL_SIZE=16 node app.js   # default is 4 — a classic tuning knob',
      production: 'Symptoms of threadpool starvation: fs and dns latency spiking together while CPU is idle. Fix: raise UV_THREADPOOL_SIZE, or move DNS to dns.resolve()/undici with a caching resolver in front.'
    },
    code: [
      {
        title: 'One iteration of uv_run',
        lang: 'c',
        code: '/* deps/uv/src/unix/core.c — uv_run(), simplified */\nuv__update_time(loop);\nuv__run_timers(loop);        /* setTimeout/setInterval */\nuv__run_pending(loop);\nuv__io_poll(loop, timeout);  /* epoll_wait — sockets live here */\nuv__run_check(loop);         /* setImmediate */\nuv__run_closing_handles(loop);\n/* getaddrinfo? not here — uv_queue_work → one of 4 pool threads */'
      }
    ]
  },

  {
    id: 'rt-undici',
    chapter: 3,
    title: 'undici: fetch, implemented in JavaScript',
    node: 'undici',
    mode: 'user',
    when: { runtime: 'node' },
    explain: {
      what: "In Node, fetch is ordinary JavaScript you could sit down and read: a library called undici (Italian for eleven, as in HTTP/1.1). It implements the same Fetch standard the browser follows, but on top of Node's sockets — an Agent keeps pools of open connections per server, a fast parser called llhttp reads responses, and it speaks keep-alive so connections get reused. Our call lands there and it asks one question: do I already have a live connection to api.shop.dev:443? No. So it must resolve the name, open a TCP socket, and do TLS. From here the browser path and the Node path converge: somebody has to turn a name into an address and open a connection.",
      why: "Writing the HTTP client in JavaScript rather than C++ made it hackable, testable, and faithful to the spec — and its disciplined connection pooling still beats the old http module.",
      component: 'undici (deps/undici/, Agent → Pool → Client → net.Socket/TLSSocket)',
      layer: 'User space · Node process, JS + net bindings',
      abstraction: 'A browser-grade fetch grown in a server lab',
      protocol: 'HTTP/1.1 (RFC 9112) client behavior, Fetch Standard semantics',
      misconception: "You might think Node's fetch is a thin wrapper over http.request. Actually it is a from-scratch client with its own pooling, different defaults (no CORS, no cookie jar), and noticeably faster header parsing.",
      analogy: "A courier firm that keeps its vans on established routes with the engines warm, instead of hiring a fresh driver for every single parcel.",
      command: 'node -p "process.versions.undici"',
      production: 'Tune the global dispatcher: setGlobalDispatcher(new Agent({ connections: 128, keepAliveTimeout: 4000 })). The default connection cap per origin and keep-alive timing dominate tail latency under load.'
    },
    code: [
      {
        title: 'Where undici goes next',
        lang: 'js',
        code: "// inside undici (simplified):\nconst dispatcher = getGlobalDispatcher();       // Agent with per-origin pools\ndispatcher.dispatch({\n  origin: 'https://api.shop.dev',\n  method: 'GET',\n  path: '/products?limit=20'\n}, handler);\n// Pool for api.shop.dev:443 → empty → new Client\n//   → dns lookup → net.connect → tls.connect   // ← converges with Chrome path"
      }
    ]
  },

  // ════════════════════════ Chapter 4 · fetch() Internals ════════════════════════

  {
    id: 'fetch-netservice-request',
    chapter: 4,
    title: 'A URLRequest takes shape',
    node: 'netservice',
    mode: 'user',
    explain: {
      what: "The request stops being an idea and becomes a filled-in form. Inside the network service (or undici's Agent, in the Node branch) it now exists as a concrete object: method GET, url https://api.shop.dev/products?limit=20, and a full set of headers assembled around it — Host: api.shop.dev, User-Agent, Accept, Accept-Encoding: gzip, deflate, br — plus decisions about cookies and credentials. A component called a URLLoader will now push it through a series of checks before any socket work is permitted.",
      why: "Everything the server will eventually read is decided here, in ordinary memory, long before anything is encrypted or transmitted — which is why request bugs are nearly always born at this desk.",
      component: 'net::URLRequest + URLLoader (Chromium //net, //services/network)',
      layer: 'User space · Network service process',
      abstraction: 'The request as a checklist, not yet a message',
      protocol: 'HTTP semantics (RFC 9110) — not yet serialized',
      misconception: "You might think headers go out exactly as you set them. Actually the stack adds, reorders, and normalises them (Host, Content-Length, Accept-Encoding), and headers the Fetch spec forbids you to set from JavaScript are silently dropped.",
      analogy: "Airport check-in: ticket printed, bag tagged, seat assigned — and you have not taken a single step toward the gate.",
      command: 'google-chrome --log-net-log=/tmp/netlog.json   # then inspect with netlog-viewer',
      production: 'chrome://net-export plus https://netlog-viewer.appspot.com is the definitive answer to "what did the browser ACTUALLY send" — including every internal event this chapter walks through.'
    },
    code: [
      {
        title: 'The request as the stack now holds it',
        lang: 'bash',
        code: 'GET /products?limit=20 HTTP/1.1        ← not serialized yet, just fields\nHost: api.shop.dev\nUser-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0\nAccept: */*\nAccept-Encoding: gzip, deflate, br\nAccept-Language: en-US,en;q=0.9\nsec-fetch-mode: cors · sec-fetch-site: same-site'
      }
    ]
  },

  {
    id: 'fetch-httpcache-miss',
    chapter: 4,
    title: 'HTTP cache lookup: MISS',
    node: 'httpcache',
    mode: 'user',
    explain: {
      what: "First chance to skip the entire journey: has the browser already got this response saved on disk? The key is roughly the method plus the URL, and since 2020 it is also partitioned by the site you are visiting — shop.dev is baked into the key — so one website cannot time another site's cached files to work out where you have been. The lookup for GET https://api.shop.dev/products?limit=20 under the shop.dev partition finds nothing: a MISS. Had a still-fresh copy been sitting there, this whole story would have ended here, in microseconds.",
      why: "The fastest request is the one you never send, so HTTP caching is the web's main way of shedding load — and it gets consulted before anyone even thinks about DNS.",
      component: 'Chromium HTTP cache (net/http/http_cache_transaction.cc, disk_cache backend)',
      layer: 'User space · Network service, disk-backed',
      abstraction: 'Memoization keyed on the request line',
      protocol: 'HTTP caching (RFC 9111)',
      misconception: "You might think the DNS cache and the HTTP cache are the same thing. Actually they are entirely separate: this one stores response bodies keyed by URL, while the DNS cache in the next chapter stores IP addresses keyed by hostname, in a different process with different expiry rules.",
      analogy: "Checking your own fridge before ordering dinner. An empty fridge means a restaurant, a kitchen, and a delivery rider all have to get involved.",
      command: 'ls ~/.cache/google-chrome/Default/Cache/Cache_Data | head',
      production: 'API responses are typically Cache-Control: no-store (like this one), so real-world wins come from CDNs honoring s-maxage + stale-while-revalidate at the edge rather than from browser caches.'
    },
    code: [
      {
        title: 'Cache decision',
        lang: 'bash',
        code: 'key    : 1/0/_dk_https://shop.dev https://shop.dev https://api.shop.dev/products?limit=20\nlookup : MISS (no entry)\npolicy : response will carry Cache-Control: no-store → will not be stored either\nverdict: proceed to network'
      }
    ]
  },

  {
    id: 'fetch-hsts-check',
    chapter: 4,
    title: 'HSTS: this hostname is HTTPS, period',
    node: 'netservice',
    mode: 'user',
    explain: {
      what: "Before connecting, the browser checks a list it carries inside its own binary: hostnames that may only ever be reached over HTTPS. The list is HSTS — HTTP Strict Transport Security — and here is the fun part with teeth: the entire .dev top-level domain is on the hardcoded preload list shipped inside Chrome. Every .dev hostname on Earth is upgraded to HTTPS before a single byte of network traffic, with no way to opt out. We already asked for https://, so nothing visibly changes — but even typing http://api.shop.dev could never have produced an unencrypted request.",
      why: "This slams shut the window an attacker needs: without preloading, that very first http:// request is interceptable, and a single downgrade is all somebody sitting on your network requires.",
      component: 'TransportSecurityState + preload list (net/http/transport_security_state_static.json)',
      layer: 'User space · Network service policy',
      abstraction: 'A promise about the future, compiled into the browser binary',
      protocol: 'HSTS (RFC 6797)',
      misconception: "You might think typing https:// is what makes a site secure. Actually for preloaded domains the browser enforces HTTPS whatever you type, whatever a link says, and whatever a cafe's captive portal tries to inject.",
      analogy: "A members-only club whose name is printed on the door policy of every venue in the city — you are turned away in street clothes long before you reach that particular door.",
      command: 'curl -s "https://hstspreload.org/api/v2/status?domain=shop.dev"',
      production: 'Rolling out HSTS: start with a short max-age, then ramp to 31536000 with includeSubDomains, and only then submit for preload — preload removal takes browser release cycles, so a mistake is very sticky.'
    },
    prod: {
      title: 'HSTS — Island Tours on .io has no TLD safety net',
      explain: { production: 'api.islandtours.io gets no free ride: .io is NOT a preloaded TLD. Island Tours must earn HSTS dynamically — Caddy sends Strict-Transport-Security: max-age=31536000; includeSubDomains on every response, and the very first-ever visit remains the one theoretically strippable window (unless islandtours.io is individually submitted to hstspreload.org).' },
      code: [
        {
          title: 'Caddyfile — HSTS by hand',
          lang: 'bash',
          code: 'api.islandtours.io {\n  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"\n  reverse_proxy 172.17.0.2:3000\n}'
        }
      ]
    },
    code: [
      {
        title: 'Preload list entry covering our host',
        lang: 'js',
        code: '// transport_security_state_static.json (ships inside the Chrome binary):\n{ "name": "dev", "policy": "public-suffix", "mode": "force-https",\n  "include_subdomains": true }\n// → api.shop.dev matches: scheme is pinned to https before any socket exists'
      }
    ]
  },

  {
    id: 'fetch-socketpool-empty',
    chapter: 4,
    title: 'Socket pool: no warm connection to reuse',
    node: 'socketpool',
    mode: 'user',
    explain: {
      what: "Maybe we already have a connection open to this server and can skip straight to sending. The stack keeps pools of live connections grouped by destination, so it looks in the group for api.shop.dev:443 (in Node, undici's Pool for that origin). Chrome's limits: 6 connections per group, 256 in total. Result: zero idle connections — this is our first request to this server. A hit here would have skipped DNS, TCP, and TLS entirely; instead we pay for all three.",
      why: "Reusing a connection is the single biggest latency win in HTTP: it saves a DNS lookup plus one round trip for TCP and another for TLS — often well over 100ms on a phone.",
      component: 'ClientSocketPool (net/socket/transport_client_socket_pool.cc) · undici Pool',
      layer: 'User space · Network service',
      abstraction: 'Expensive things, kept warm and shared',
      protocol: 'HTTP/1.1 keep-alive (RFC 9112 §9.3) / HTTP/2 multiplexing',
      misconception: "You might think every fetch() opens its own connection. Actually browsers reuse aggressively, and over HTTP/2 one connection carries all your concurrent requests to a server — the 6-connection limit is a leftover from the HTTP/1.1 era that you rarely bump into now.",
      analogy: "The taxi rank outside a station: if a cab is idling there you are away in seconds, but an empty rank means phoning dispatch and waiting for a car to drive across town.",
      command: 'ss -tnp 2>/dev/null | grep -c chrome   # live sockets owned by the browser',
      production: 'Server side, mirror this with keep-alive timeouts LONGER than your load balancer’s idle timeout (classic 502 source when inverted), and watch connection-reuse ratio in your metrics — it should be >90% for API traffic.'
    },
    code: [
      {
        title: 'Pool state right now',
        lang: 'bash',
        code: 'group ssl/api.shop.dev:443\n  active sockets   : 0\n  idle sockets     : 0        ← nothing to reuse\n  pending requests : 1        ← us\n  limits           : 6 per group / 256 per pool\nverdict: establish new connection (DNS → TCP → TLS)'
      }
    ]
  },

  {
    id: 'fetch-connection-plan',
    chapter: 4,
    title: 'Proxy check, then the verdict: full journey required',
    node: 'netservice',
    mode: 'user',
    explain: {
      what: "One last question before anything happens: are we allowed to go direct, or must we go through a proxy? The service checks configured proxies, any PAC script (a little JavaScript file some networks use to decide routing per URL), and WPAD if it is enabled. Verdict here: DIRECT, no proxy. So the plan is fixed, and it is the expensive one: turn api.shop.dev into an IP address, open a TCP connection to it on port 443, negotiate TLS, and only then send any HTTP at all. Chrome may also race ahead with an early DNS and TCP preconnect; either way, chapter 5 is DNS.",
      why: "A proxy would replace steps one and two with \"connect to the proxy instead\", which is why a broken proxy configuration takes networking down so early and so completely.",
      component: 'ProxyResolutionService (net/proxy_resolution/) → HttpStreamFactory job controller',
      layer: 'User space · Network service',
      abstraction: 'Planning the route before starting the engine',
      protocol: 'PAC (proxy auto-config), else none',
      misconception: "You might think the browser simply connects to the URL. Actually it connects wherever proxy policy tells it to, which in a corporate network is rarely the real server — half of all \"the internet is down\" tickets in big companies are a dead PAC file.",
      analogy: "Checking the company handbook before posting a parcel: does everything have to go through the internal mailroom, or may you drive to the post office yourself?",
      command: 'env | grep -i proxy; echo "—"; scutil --proxy 2>/dev/null || cat /etc/environment | grep -i proxy',
      production: 'PAC files execute JavaScript on the network path of every request — slow or flaky PAC = browser-wide latency. Fleet debugging starts at chrome://net-internals/#proxy.'
    },
    code: [
      {
        title: 'The plan of record',
        lang: 'bash',
        code: 'proxy  : DIRECT (no PAC, no system proxy)\ncache  : MISS          → cannot skip network\npool   : empty         → cannot skip connection setup\nplan   : DNS(api.shop.dev) → TCP(ip:443) → TLS(SNI api.shop.dev) → HTTP GET\nnext   : chapter 5 — name resolution'
      }
    ]
  },

  // ════════════════════════ Chapter 5 · DNS Resolution (BRANCH) ════════════════════════

  {
    id: 'dns-stub-lookup',
    chapter: 5,
    title: 'The stub resolver checks close to home',
    node: 'stubresolver',
    mode: 'user',
    explain: {
      what: "Turning api.shop.dev into a number starts right here on the laptop, with the nearest source that might know. The stub resolver — the small piece of the system that asks DNS questions on your behalf — reads /etc/nsswitch.conf, which says hosts: files resolve dns, meaning: try the local /etc/hosts file first (no entry for api.shop.dev), then ask systemd-resolved, the little caching service listening on 127.0.0.53, which keeps a machine-wide DNS cache and forwards anything it does not know to the configured upstream resolver, 1.1.1.1.",
      why: "This chain exists so that the common case never leaves your machine — and understanding it explains almost every \"but it works in dig and not in my app\" mystery, because dig skips the chain entirely.",
      component: 'glibc NSS + systemd-resolved (stub listener 127.0.0.53, /etc/nsswitch.conf, /etc/hosts)',
      layer: 'User space · Local resolution chain',
      abstraction: 'Ask the nearest person who might know before phoning the library',
      protocol: 'NSS (glibc), DNS (RFC 1035) toward upstream',
      misconception: "You might think the OS just fires DNS queries straight at 8.8.8.8 or whatever is configured. Actually several layers get to answer first: /etc/hosts, the local cache, even an mDNS responder for .local names — which is why tools that bypass that order, like dig and nslookup, can cheerfully disagree with your application.",
      analogy: "Looking up a phone number: the sticky notes on your fridge first, then your own address book, and only then ringing directory enquiries.",
      command: 'getent hosts api.shop.dev   # honors nsswitch, unlike dig',
      production: 'Kubernetes and containers rewrite /etc/resolv.conf and add search domains + ndots:5 — a notorious source of 5x amplified DNS load. Always check resolv.conf *inside* the failing container, not on the host.'
    },
    code: [
      {
        title: 'The local resolution chain',
        lang: 'bash',
        code: '$ cat /etc/nsswitch.conf | grep ^hosts\nhosts: files resolve [!UNAVAIL=return] dns\n\n$ grep api.shop.dev /etc/hosts\n(no output — not pinned locally)\n\n$ cat /etc/resolv.conf\nnameserver 127.0.0.53        # systemd-resolved stub\noptions edns0 trust-ad\n\n$ resolvectl status | grep "DNS Servers"\nDNS Servers: 1.1.1.1'
      }
    ]
  },

  {
    id: 'dns-branch',
    chapter: 5,
    title: 'Fork in the road: is the answer already cached?',
    node: 'stubresolver',
    mode: 'user',
    branch: {
      key: 'dnscache',
      question: 'Does the local DNS cache already know api.shop.dev?',
      options: [
        { value: 'hit', label: 'Cache HIT', hint: 'someone looked this up recently: instant answer, no packets at all, straight on to the system call' },
        { value: 'miss', label: 'Cache MISS', hint: 'never seen before — walk the whole chain: resolver, root, the .dev registry, then Cloudflare' }
      ]
    },
    explain: {
      what: "Everything now hinges on one question: has this machine looked up api.shop.dev recently? systemd-resolved files its cache by name and record type — here, api.shop.dev IN A, meaning \"the IPv4 address of api.shop.dev\". If a previous lookup stored an answer and its countdown (the TTL, or time to live) has not run out, we are done in microseconds without sending a single packet. If not, we have to ask 1.1.1.1 — and it may in turn have to ask the root servers, then the .dev registry, then Cloudflare's own name servers.",
      why: "DNS is the most heavily cached system humanity runs; without caching at every level, the servers at the very top of the naming system would have to answer for every page load on Earth.",
      component: 'systemd-resolved cache (per name+type, TTL-bounded)',
      layer: 'User space · Local DNS cache',
      abstraction: 'Memoization with an expiry date set by the data owner',
      protocol: 'DNS (RFC 1034/1035), TTL semantics',
      misconception: "You might think a DNS lookup happens on every request. Actually after one cold lookup, later requests hit a cache somewhere — the browser's, your machine's, or the resolver's — until the countdown expires. That cold lookup is the one you pay for after a deploy or a cache flush.",
      analogy: "A train timetable pinned to your wall: perfectly right this morning, quietly wrong after the summer schedule change — which is exactly why the printed one carries a valid-until date.",
      command: 'resolvectl query api.shop.dev   # shows answer + where it came from (cache/network)',
      production: 'The classic incident: lowering a TTL from 300 to 60 *after* you need to fail over does nothing — remote caches hold the old value for the old TTL. Lower TTLs a full old-TTL window before planned migrations.'
    }
  },

  {
    id: 'dns-cache-hit',
    chapter: 5,
    title: 'Cache HIT: the answer was on the shelf',
    node: 'stubresolver',
    mode: 'user',
    when: { dnscache: 'hit' },
    explain: {
      what: "The answer was already sitting on this machine. resolved finds api.shop.dev IN A in its cache: 104.18.32.7, stored 179 seconds ago with a TTL of 300 seconds, so it is good for another 121. It comes back to the caller in about 50 microseconds. No socket, no packet, no router touched — the entire global DNS apparatus stays asleep. Next stop: asking the kernel for a socket, this time with an IP address already in hand.",
      why: "This is the whole payoff of putting an expiry date on answers: the second, third and thousandth lookup cost essentially nothing, and the owner of the domain got to decide exactly how stale \"nothing\" is allowed to be.",
      component: 'systemd-resolved in-memory cache',
      layer: 'User space · Local daemon',
      abstraction: 'A shelf-life-labeled fact',
      protocol: 'DNS TTL semantics (RFC 1035 §3.2.1)',
      misconception: "You might think a cached DNS answer could be stale forever. Actually caches must throw entries away when the countdown ends. What can linger is different: browser caches with their own rules (Chrome caps entries at 60 seconds precisely to limit this) and negative caches remembering that a name did not exist.",
      analogy: "A carton of milk: the dairy prints the date, and your fridge just has to stop serving it when that date arrives.",
      command: 'resolvectl statistics   # cache hit/miss counters for the local resolver',
      production: 'Cache-hit ratio at the resolver tier is a first-class SLI: at Cloudflare/Google resolver scale it exceeds 90%+, which is why authoritative DNS outages take hours to fully bite — the internet coasts on caches.'
    },
    code: [
      {
        title: 'The cached record',
        lang: 'bash',
        code: '$ resolvectl query api.shop.dev\napi.shop.dev: 104.18.32.7            -- link: wlp3s0\n    (cached, 121s of TTL 300 remaining)\n\n-- Information acquired via protocol DNS in 54.2us.\n-- Data from: cache'
      }
    ]
  },

  {
    id: 'dns-query-build',
    chapter: 5,
    title: 'Building the DNS query datagram',
    node: 'stubresolver',
    mode: 'user',
    when: { dnscache: 'miss' },
    packet: {
      label: 'DNS query: api.shop.dev A? · TXID 0x8f3a',
      layers: ['eth', 'ip', 'udp', 'dns'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800 (IPv4)' },
        ip: { 'Src': '192.168.1.23', 'Dst': '1.1.1.1', 'TTL': '64', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '48213 (random)', 'Dst Port': '53', 'Length': '58' },
        dns: { 'TXID': '0x8f3a', 'Flags': 'RD (recursion desired)', 'Question': 'api.shop.dev IN A', 'EDNS': 'UDP payload 1232' }
      }
    },
    explain: {
      what: "Nobody on this computer knows the address, so it writes a tiny letter to the internet's phone book: \"what number is api.shop.dev?\". The letter is just a few dozen bytes: a random ticket number (the transaction ID, 0x8f3a) so we can match the answer to our question, a flag politely asking \"please look this up for me\" (RD, recursion desired), and the question itself — api.shop.dev, type A, meaning \"give me the IPv4 address\". It travels as a UDP datagram — postcard-style, no connection needed — from a randomized port (48213) to the resolver at 1.1.1.1, port 53. A second letter goes out at the same time asking for the IPv6 address (type AAAA): the race between the two address families, Happy Eyeballs, starts right here.",
      why: "A quick question deserves a postcard, not a phone call — and that random ticket number is not decoration: it is what stops strangers from mailing us fake answers (the famous Kaminsky cache-poisoning attack).",
      component: 'systemd-resolved query engine (DnsTransaction, sd-resolve)',
      layer: 'User space builds it · will cross every layer below (OSI L7 payload in L4 UDP)',
      abstraction: 'A question small enough to fit in one datagram',
      protocol: 'DNS over UDP (RFC 1035), EDNS(0) (RFC 6891)',
      misconception: "You might think DNS always uses UDP. Actually TCP is required to be supported and gets used whenever an answer is too big to fit (the truncation bit) or for transferring whole zones — and modern systems increasingly wrap the whole thing in encryption instead, as DNS over TLS on port 853 or DNS over HTTPS on 443, precisely to hide this packet.",
      analogy: "A postcard dropped in a letterbox with a serial number scribbled in the corner: everyone who handles it can read every word, and that serial is the only way you will know the reply is genuinely yours.",
      command: 'dig +qr api.shop.dev A | head -20   # +qr prints the outgoing query too',
      production: 'This packet is plaintext: your ISP reads every hostname you visit unless you deploy DoT/DoH (resolved supports DNSOverTLS=yes). Enterprises conversely *depend* on reading it for security monitoring — a genuine tug-of-war.'
    },
    code: [
      {
        title: 'DNS header + question on the wire',
        lang: 'c',
        code: 'struct dns_header {            /* RFC 1035 §4.1.1 — 12 bytes */\n    uint16_t id;               /* 0x8f3a — must match in the reply */\n    uint16_t flags;            /* QR=0 (query), RD=1 (recurse please) */\n    uint16_t qdcount;          /* 1 question */\n    uint16_t ancount, nscount, arcount;   /* 0, 0, 1 (OPT/EDNS) */\n};\n/* question encodes labels with length prefixes — no dots on the wire: */\n/* 03 a p i 04 s h o p 03 d e v 00 | 00 01 (A) | 00 01 (IN) */'
      }
    ]
  },

  {
    id: 'dns-flight-to-recursive',
    chapter: 5,
    title: 'Flight to 1.1.1.1',
    node: 'recursive',
    from: 'stubresolver',
    mode: 'net',
    when: { dnscache: 'miss' },
    packet: {
      label: 'UDP 192.168.1.23:48213 → 1.1.1.1:53 · api.shop.dev A?',
      layers: ['ip', 'udp', 'dns'],
      fields: {
        ip: { 'Src': '192.168.1.23 → NAT → 203.0.113.77', 'Dst': '1.1.1.1', 'TTL': '64 → decrements each hop', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '48213', 'Dst Port': '53' },
        dns: { 'TXID': '0x8f3a', 'Question': 'api.shop.dev IN A', 'Flags': 'RD' }
      }
    },
    explain: {
      what: "The postcard leaves the laptop and heads out into the world. On the way through the home router the sender address is rewritten to the single address the whole household shares in public, 203.0.113.77 — that is what NAT does — and the packet rides the ISP's network toward 1.1.1.1. That address is unusual: it is anycast, meaning Cloudflare announces it from over 300 data centres at once, and ordinary internet routing simply delivers you to whichever one is nearest, often 5 to 8 milliseconds away. Then we wait, because nothing guarantees delivery: if no answer comes back within about 5 seconds, resolved sends it again or gives up.",
      why: "Anycast turns one memorable address into \"whichever of our hundreds of sites is closest to you\", with nothing at all to configure — it is how a public resolver serves the whole planet with single-digit millisecond answers.",
      component: 'The Internet, briefly — and Cloudflare anycast edge',
      layer: 'On the wire · OSI L3/L4 transit',
      abstraction: 'One address that means "whichever of us is nearest"',
      protocol: 'DNS over UDP in transit; BGP anycast underneath',
      misconception: "You might think 1.1.1.1 is one big server somewhere. Actually it is hundreds of sites all answering to the same address: two queries from two cities reach different machines, and even two queries from one city can, if a failover happens in between.",
      analogy: "Dialling the national emergency number: the same three digits everywhere in the country, and you always reach your own local dispatch centre.",
      command: 'mtr --report -c 20 1.1.1.1   # note how few hops — anycast is close by design',
      production: 'Resolver choice is a latency AND privacy decision. Measure p95 resolution time per resolver (1.1.1.1 vs ISP vs internal); mobile networks especially punish distant resolvers on every cold lookup.'
    }
  },

  {
    id: 'dns-recursive-miss',
    chapter: 5,
    title: 'The recursive resolver must earn its name',
    node: 'recursive',
    mode: 'remote',
    when: { dnscache: 'miss' },
    explain: {
      what: "1.1.1.1 checks its own enormous shared cache first — warmed by queries from millions of people — and today it comes up empty for us: either never asked, or the entry has expired. So now it must do the thing its name promises and recurse: walk the naming system from the top on our behalf, one question at a time. A modern refinement: with QNAME minimisation it will not tell the servers at the top the full name we want; it asks each level only for the next piece it needs.",
      why: "That legwork is the resolver's entire job description: our stub asked one question with \"please handle this for me\" set, and it will accept nothing less than a final answer.",
      component: 'Cloudflare recursive resolver (knot-resolver lineage), cache + iterator',
      layer: 'Remote infrastructure · Resolver data center',
      abstraction: 'A librarian who chases citations so you do not have to',
      protocol: 'DNS iterative resolution (RFC 1034 §5), QNAME minimization (RFC 9156)',
      misconception: "You might think the resolver knows where every domain lives. Actually it knows exactly one thing without asking: where the root servers are, from a small hints file compiled into it. Everything else is discovered, then cached with a countdown attached.",
      analogy: "A reference librarian who starts with nothing but the master index: index to floor, floor to shelf, shelf to book — photocopying each pointer on the way so the next person gets there faster.",
      command: 'dig @1.1.1.1 api.shop.dev A +stats | tail -6   # Query time exposes hit (~1ms) vs full recursion (~50ms+)',
      production: 'Run your own recursion (unbound/knot-resolver) for internal zones and independence from public-resolver outages — the 2021-scale incidents where "half the internet was down" were often just one shared resolver tier failing.'
    },
    code: [
      {
        title: 'The walk about to happen',
        lang: 'bash',
        code: 'cache[api.shop.dev A]   → MISS\ncache[shop.dev NS]      → MISS\ncache[dev NS]           → MISS (expired)\ncache[. NS]             → root hints, always present\nplan: ask root for "dev" → ask .dev for "shop.dev" → ask shop.dev NS for full name'
      }
    ]
  },

  {
    id: 'dns-root-referral',
    chapter: 5,
    title: 'The root: 13 names, hundreds of servers, one referral',
    node: 'rootns',
    from: 'recursive',
    mode: 'remote',
    when: { dnscache: 'miss' },
    packet: {
      label: 'Query → a.root-servers.net: dev. NS?',
      layers: ['ip', 'udp', 'dns'],
      fields: {
        ip: { 'Src': '1.1.1.1 (resolver)', 'Dst': '198.41.0.4 (a.root-servers.net)', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '39604', 'Dst Port': '53' },
        dns: { 'TXID': '0x3b91 (fresh per hop)', 'Question': 'dev. IN NS', 'Flags': 'iterative (RD not honored)' }
      }
    },
    quiz: {
      q: 'What does a root name server return when the resolver asks about api.shop.dev?',
      options: [
        'The final answer: 104.18.32.7',
        'A referral: the list of name servers for the .dev TLD',
        'Nothing — root servers only answer for .com and .net'
      ],
      answer: 1,
      explain: "Root servers know exactly one thing: which servers run each top-level domain. They never look anything up for you and never learn about individual domains — every question gets the same shape of answer: \"ask the .dev servers, here they are\", plus their addresses."
    },
    explain: {
      what: "The resolver asks a root server — one of the servers sitting at the very top of the naming system. By name there are 13 of them, a through m.root-servers.net; in reality that is about 1900 machines worldwide answering to those names. Thanks to QNAME minimisation it asks only the narrow question: dev. IN NS, \"who serves .dev?\". The root has never heard of api.shop.dev and never will; it sends back a referral — the NS records naming the .dev servers, plus their addresses as glue records, good for 172800 seconds, which is two days.",
      why: "The hierarchy exists so nobody has to hold the whole namespace: the root delegates around 1500 top-level domains, each of which delegates millions of names, and referrals are the arrows in that tree.",
      component: 'Root server system (a–m.root-servers.net, 12 operators, anycast; root zone signed by ICANN KSK)',
      layer: 'Remote infrastructure · DNS hierarchy apex',
      abstraction: 'A tree walked one delegation at a time',
      protocol: 'DNS iterative referral (RFC 1034), DNSSEC-signed root zone',
      misconception: "You might think there are literally 13 root servers, so knocking over 13 boxes would kill the internet. Actually 13 is an ancient limit on how many names fit in one small packet — behind those names sit roughly 1900 machines, and caching means the internet would coast for days even if every one of them vanished.",
      analogy: "The directory board in the lobby of an enormous office tower: it tells you which floor a company is on, and it will never, ever know which desk your person sits at.",
      command: 'dig @a.root-servers.net dev. NS +norecurse',
      production: 'Root referral TTLs are 2 days, so real resolvers touch the root astonishingly rarely. If your monitoring shows frequent root queries, your resolver cache is broken or being flushed — that is a bug, not normal.'
    },
    code: [
      {
        title: 'The referral, verbatim shape',
        lang: 'bash',
        code: '$ dig @a.root-servers.net dev. NS +norecurse\n;; AUTHORITY SECTION:\ndev.  172800  IN  NS  ns-tld1.charlestonroadregistry.com.\ndev.  172800  IN  NS  ns-tld2.charlestonroadregistry.com.\ndev.  172800  IN  NS  ns-tld3.charlestonroadregistry.com.\n;; ADDITIONAL SECTION (glue):\nns-tld1.charlestonroadregistry.com. 172800 IN A 216.239.32.105\n;; ← no ANSWER section: this is a referral, not an answer'
      }
    ]
  },

  {
    id: 'dns-tld-referral',
    chapter: 5,
    title: '.dev TLD: one level down, one referral more',
    node: 'tldns',
    from: 'recursive',
    mode: 'remote',
    when: { dnscache: 'miss' },
    packet: {
      label: 'Query → .dev TLD servers: shop.dev NS?',
      layers: ['ip', 'udp', 'dns'],
      fields: {
        ip: { 'Src': '1.1.1.1', 'Dst': '216.239.32.105 (ns-tld1.charlestonroadregistry.com)', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '52117', 'Dst Port': '53' },
        dns: { 'TXID': '0x74c6', 'Question': 'shop.dev IN NS', 'Answer': 'referral → chad.ns.cloudflare.com, uma.ns.cloudflare.com' }
      }
    },
    explain: {
      what: "One rung down: the servers for the .dev top-level domain, run by Google Registry (formally Charleston Road Registry — .dev is the TLD that is HTTPS-only by policy). Asked about shop.dev, they look in the registry's zone and hand back another referral: shop.dev has been delegated to Cloudflare's name servers, chad.ns.cloudflare.com and uma.ns.cloudflare.com, cacheable for 86400 seconds, a day. Still no address for api — one more hop to go.",
      why: "This layer is where registering a domain becomes technically real: buying shop.dev means precisely that the registry writes your NS records into the .dev zone, and nothing more than that.",
      component: '.dev TLD authoritative servers (Google Registry / Charleston Road Registry, ns-tld1..5)',
      layer: 'Remote infrastructure · DNS second tier',
      abstraction: 'The registry as a routing table for authority',
      protocol: 'DNS referral (RFC 1034), DNSSEC delegation (DS records)',
      misconception: "You might think your registrar hosts your DNS. Actually the registrar only files your NS records with the registry; the answers themselves come from whoever runs those name servers — here, Cloudflare — which you can change without changing registrar at all.",
      analogy: "A phone network's number-portability database: it has no idea who will pick up, only which company now owns that block of numbers and should be asked next.",
      command: 'dig @ns-tld1.charlestonroadregistry.com shop.dev NS +norecurse',
      production: 'Expired-domain and lame-delegation incidents live here: NS records at the TLD pointing at dead servers take 86400s of TTL to purge globally. Monitor delegation health from OUTSIDE your own infra (e.g. dnsviz).'
    },
    code: [
      {
        title: 'Delegation chain so far',
        lang: 'bash',
        code: '.        (root)  →  "dev. is served by charlestonroadregistry.com servers"\ndev.     (TLD)   →  "shop.dev is served by chad + uma .ns.cloudflare.com"\nshop.dev (auth)  →  ← next hop finally holds the A record\n\n# each arrow was one round trip, each answer now cached with its TTL'
      }
    ]
  },

  {
    id: 'dns-auth-answer',
    chapter: 5,
    title: 'Authoritative answer: 104.18.32.7',
    node: 'authns',
    from: 'recursive',
    mode: 'remote',
    when: { dnscache: 'miss' },
    packet: {
      label: 'AA answer: api.shop.dev A 104.18.32.7 · TTL 300',
      layers: ['ip', 'udp', 'dns'],
      fields: {
        ip: { 'Src': '173.245.59.108 (chad.ns.cloudflare.com)', 'Dst': '1.1.1.1', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '53', 'Dst Port': '41988' },
        dns: { 'TXID': '0xa1d3', 'Flags': 'QR AA (authoritative answer)', 'Answer': 'api.shop.dev. 300 IN A 104.18.32.7' }
      }
    },
    explain: {
      what: "At last, a server that actually holds the answer. chad.ns.cloudflare.com is authoritative for shop.dev — it has the zone itself, not a copy of somebody else's — so it replies with the AA bit set, meaning \"this is the real thing, straight from the source\": api.shop.dev. 300 IN A 104.18.32.7. Two facts hide inside that one line. The address is a Cloudflare edge machine, because this record is proxied (the orange cloud in the dashboard). And the TTL is 300 seconds, Cloudflare's standard for proxied records. This is the ground truth that every cache upstream is about to copy.",
      why: "Authority is where trust in DNS bottoms out — DNSSEC makes it formal with signatures — because every cached copy anywhere in the world traces back to an answer exactly like this one.",
      component: 'Cloudflare authoritative DNS (chad/uma.ns.cloudflare.com, anycast)',
      layer: 'Remote infrastructure · DNS leaf authority',
      abstraction: 'The single writable source in a world of copies',
      protocol: 'DNS authoritative answer (RFC 1035), AA bit; DNSSEC RRSIG if signed',
      misconception: "You might think DNS gave us the server's address. Actually it gave us Cloudflare's front door: the real origin (198.51.100.10) stays hidden behind the proxy and the browser will never learn it. A DNS answer is whatever the owner of the zone decides it should be.",
      analogy: "A publisher confirming that yes, that author is one of theirs — and that all post goes care of the publisher's office, which is the only address the outside world ever gets.",
      command: 'dig @chad.ns.cloudflare.com api.shop.dev A +norecurse   # note the aa flag in the header',
      production: 'TTL 300 is the availability/agility compromise: failover completes globally within 5 minutes, while caches still absorb the vast majority of query load. Records used for failover should NEVER carry day-long TTLs.'
    },
    prod: {
      title: 'Authoritative answer — api.islandtours.io',
      explain: { production: 'Island Tours resolves identically in shape: api.islandtours.io. 300 IN A 104.18.32.7 from its Cloudflare-assigned pair of nameservers — same anycast edge IP, because the edge disambiguates tenants later, by TLS SNI and Host header, not by IP. One IP, millions of proxied hostnames.' }
    },
    code: [
      {
        title: 'The zone file line that answered',
        lang: 'bash',
        code: '; shop.dev zone (as managed in the Cloudflare dashboard/API)\napi.shop.dev.    300   IN  A     104.18.32.7   ; proxied (orange cloud)\n; the real origin lives in a different record the public never sees:\n; origin.shop.dev. 300 IN A 198.51.100.10      ; DNS only (grey cloud)'
      }
    ]
  },

  {
    id: 'dns-response-caching',
    chapter: 5,
    title: 'The answer swims home, caching at every hop',
    node: 'stubresolver',
    from: 'recursive',
    mode: 'net',
    when: { dnscache: 'miss' },
    packet: {
      label: 'DNS response: 104.18.32.7 · TXID 0x8f3a matches',
      layers: ['ip', 'udp', 'dns'],
      fields: {
        ip: { 'Src': '1.1.1.1', 'Dst': '203.0.113.77 → NAT → 192.168.1.23', 'Proto': '17 (UDP)' },
        udp: { 'Src Port': '53', 'Dst Port': '48213 (must match our query)' },
        dns: { 'TXID': '0x8f3a ✓', 'Flags': 'QR RA', 'Answer': 'api.shop.dev. 300 IN A 104.18.32.7' }
      }
    },
    explain: {
      what: "The answer comes home, and it has to prove it belongs to us: the ticket number 0x8f3a and the destination port 48213 both have to match what we sent, which is precisely what makes forging an answer from outside so hard. And the whole path just got smarter on the way back: 1.1.1.1 stored the A record along with the root and .dev referrals it collected, systemd-resolved stores it for its full 300 seconds, and Chrome keeps its own short-lived copy too, capped at 60 seconds. The next person near us who asks gets an instant answer.",
      why: "One cold lookup pays for thousands of warm ones — this return trip is the moment the world's cache hierarchy actually gets written.",
      component: 'Response validation + cache insertion (resolved DnsTransaction, Chrome HostCache)',
      layer: 'On the wire, then user space caches · OSI L7 over L4',
      abstraction: 'Answers propagating as copies with countdown timers',
      protocol: 'DNS (RFC 1035); spoofing resistance per RFC 5452',
      misconception: "You might think flushing your local DNS cache gets you fresh data. Actually your machine forgets, but 1.1.1.1 still holds the old record until its own countdown ends. You tore up your sticky note, not the library's card index.",
      analogy: "A courier carrying the answer home through every depot on the route, each one taking a photocopy for its own wall and stamping it \"shred after 300 seconds\".",
      command: 'resolvectl query api.shop.dev && resolvectl query api.shop.dev   # second call: cache, microseconds',
      production: 'TXID + port randomization is table stakes, not sufficient: for actual integrity you need DNSSEC validation (resolved DNSSEC=yes) or an encrypted channel (DoT/DoH) to a validating resolver.'
    }
  },

  {
    id: 'dns-full-stack-reveal',
    chapter: 5,
    title: 'Plot twist: you just watched eight full journeys',
    node: 'stubresolver',
    mode: 'user',
    when: { dnscache: 'miss' },
    explain: {
      what: "Stop and look at what just happened. Every DNS packet in this chapter — laptop to resolver, resolver to root, to the .dev servers, to Cloudflare, and every reply — was a real packet that went all the way down one network stack and all the way up another: built by a program, pushed through a kernel (socket, UDP, IP, firewall, routing, queue, driver, network card), out across cables and routers, then up through the kernel at the far end. That is roughly eight complete traversals of everything chapters 6 through 10 are about to show you in slow motion, all to learn one number: 104.18.32.7.",
      why: "This is the quietly beautiful part: the machinery is so uniform that we can zoom right into ONE packet — our TCP SYN, coming next — and you will understand what happened to all of those too.",
      component: 'Every layer at once',
      layer: 'All of them — that is the point',
      abstraction: 'Turtles all the way down, but the turtles are identical',
      protocol: 'DNS riding on UDP riding on IP riding on Ethernet — the full lasagna',
      misconception: "You might think DNS is a lookup in some global table that simply happens. Actually there is no table and no magic: only packets, caches, and fifteen thousand kilometres of glass, with every hop paying full kernel fare at both ends.",
      analogy: "Texting a friend for a restaurant address and forgetting that the text itself crossed a phone mast, a fibre backbone, and four data centres. The question travelled the same roads the dinner trip is about to.",
      command: 'sudo tcpdump -ni any udp port 53 -c 4   # watch real resolution traffic flow',
      production: 'This is why DNS belongs in your latency budget: a cold HTTPS request spends its first 20–120ms here, before TCP even starts. RUM tools break it out as dns_time; treat regressions there as seriously as backend p99s.'
    }
  },

  // ════════════════════════ Chapter 6 · The System Call ════════════════════════

  {
    id: 'sys-libc-wrapper',
    chapter: 6,
    title: 'libc: the last stop in user space',
    node: 'libc',
    mode: 'user',
    explain: {
      what: "We have an IP address; now we need a socket — and a normal program is not allowed to make one. So the code calls a small C library function, socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, IPPROTO_TCP), and glibc does almost nothing with it: it puts the number 41 (the kernel's number for \"create a socket\") into the rax register, drops the arguments into rdi, rsi and rdx exactly as the x86-64 calling convention demands, and executes one single instruction. (Chrome and Go famously bypass much of libc; Node reaches it through libuv.)",
      why: "It helps enormously to know this layer is paper-thin: that is why strace output reads one-to-one as your program's intentions, with nothing invented in between.",
      component: 'glibc syscall wrappers (sysdeps/unix/sysv/linux/, syscall-template.S)',
      layer: 'User space · CPU ring 3, C library',
      abstraction: 'A C function signature stretched over a hardware trap',
      protocol: 'x86-64 System V ABI syscall convention',
      misconception: "You might think libc implements sockets. Actually it implements asking the kernel for sockets: all the state, the buffers, and every line of TCP logic live on the other side, and libc contributes some register shuffling and an errno.",
      analogy: "The form on the counter at a government office. The clerk behind the glass does the actual work; the form just gets your request into the right boxes.",
      command: 'strace -f -e trace=socket,connect -p 4903',
      production: 'Syscall-level tracing (strace, bpftrace, perf trace) is the ground truth when application logs lie. In prod prefer eBPF-based tools — strace stops the process on every syscall and can halve throughput.'
    },
    code: [
      {
        title: 'The call, and the ABI it becomes',
        lang: 'c',
        code: '/* user space */\nint fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, IPPROTO_TCP);\n\n/* glibc, essentially: */\n    mov  $41, %eax      /* __NR_socket */\n    mov  $2,  %edi      /* AF_INET */\n    mov  $2049, %esi    /* SOCK_STREAM(1) | SOCK_NONBLOCK(0x800) */\n    mov  $6,  %edx      /* IPPROTO_TCP */\n    syscall             /* ← ring 3 ends on the next instruction */\n    /* returns fd in %rax, or -errno */'
      }
    ]
  },

  {
    id: 'sys-syscall-insn',
    chapter: 6,
    title: 'The `syscall` instruction fires',
    node: 'syscallgate',
    mode: 'user',
    effects: ['flash'],
    explain: {
      what: "The whole crossing into the operating system is one instruction, two bytes long: 0F 05. When the CPU reaches it, it saves where it was (the return address into rcx, the flags into r11), reads the kernel's entry address out of a special register set once at boot (MSR_LSTAR, pointing at entry_SYSCALL_64), masks some flags via MSR_SFMASK, and jumps there — all in hardware, with no memory lookup and no interrupt table walk. This is the door between your program and the operating system, and there is exactly one of it.",
      why: "This instruction replaced the older, slower way in (a software interrupt, int 0x80) precisely because it is quick: no table walk, no microcode juggling stacks — just a control transfer driven by a register.",
      component: 'x86-64 SYSCALL instruction + MSR_LSTAR / MSR_STAR / MSR_SFMASK',
      layer: 'Hardware boundary · leaving ring 3',
      abstraction: 'A hardware-enforced doorway with exactly one address',
      protocol: 'x86-64 ISA (Intel SDM Vol. 2B, SYSCALL/SYSRET)',
      misconception: "You might think a system call is just a function call into kernel code. Actually a plain call into kernel memory faults instantly: only this instruction, or a trap or interrupt, is allowed to raise your privilege level, and it lands only where that special register says it may.",
      analogy: "The one door in a stadium marked STAFF ONLY: it opens for a badge and never for a shove, and it always deposits you in the same corridor.",
      command: 'sudo bpftrace -e \'tracepoint:raw_syscalls:sys_enter /pid == 4903/ { @[args->id] = count(); }\'',
      production: 'Syscall count is a real performance dimension. High-throughput servers cut it deliberately: sendfile/splice instead of read+write, io_uring instead of epoll+read, batched writev instead of per-message write.'
    },
    code: [
      {
        title: 'Where the CPU is told to go',
        lang: 'c',
        code: '/* arch/x86/kernel/cpu/common.c — configured once at boot, per CPU */\nwrmsrl(MSR_LSTAR, (unsigned long)entry_SYSCALL_64);\nwrmsrl(MSR_SYSCALL_MASK, X86_EFLAGS_IF | X86_EFLAGS_TF | X86_EFLAGS_DF | ...);\n\n/* so the two bytes 0F 05 in user code mean, in hardware: */\n/*   rcx = RIP_next ; r11 = RFLAGS ; RIP = MSR_LSTAR ; CPL = 0 */'
      }
    ]
  },

  {
    id: 'sys-ring-switch',
    chapter: 6,
    title: 'Ring 3 → Ring 0: the privilege flip',
    node: 'cpu',
    mode: 'kernel',
    state: { mode: 'kernel', mem: 'kernel' },
    effects: ['flash'],
    quiz: {
      q: 'Why must creating a socket happen in ring 0 rather than in your process?',
      options: [
        'Because socket code is written in C, which needs kernel privileges',
        'Because the socket is shared state on a shared device — the kernel must arbitrate ports, memory, and NIC access between all processes',
        'Because ring 3 has no access to RAM'
      ],
      answer: 1,
      explain: "Ring 0 exists to referee shared hardware. There is one network card, one set of port numbers, and one routing table serving every process on the machine — if programs could drive them directly, any process could seize port 443, read another program's packets, or have the card write straight over kernel memory."
    },
    explain: {
      what: "The processor changes what it is allowed to do. Its Current Privilege Level flips from 3 (ordinary programs) to 0 (the kernel), and with that everything changes: privileged instructions become legal, kernel-only memory becomes readable — under KPTI an entirely different page table is loaded by writing the CR3 register — and execution continues on this thread's kernel stack. Same core, same process, but the code running now is the operating system, working on our behalf.",
      why: "This boundary is the fundamental security architecture of every modern operating system: everything a program cannot be trusted to do alone happens on the far side of it.",
      component: 'x86-64 protection rings + KPTI page-table isolation',
      layer: 'Hardware · CPU privilege model, kernel space begins',
      abstraction: 'One CPU wearing two hats, switched by hardware',
      protocol: 'x86-64 protection model (rings 0–3; 1 and 2 unused by Linux)',
      misconception: "You might think switching to kernel mode is a context switch. Actually it is not: same process, same address space, same thread. Swapping to a different task costs microseconds; this mode flip costs tens of nanoseconds.",
      analogy: "A nurse stepping through the scrub room and coming out a surgeon: same person, same hospital, but now permitted to hold the scalpel — and bound by much stricter rules.",
      command: 'grep -c "pti" /proc/cpuinfo; cat /sys/devices/system/cpu/vulnerabilities/meltdown',
      production: 'Mode-switch cost is why syscall-heavy workloads regressed 5–30% after Meltdown mitigations. Measure with `perf stat -e raw_syscalls:sys_enter` — if you are doing millions per second, batching APIs pay for themselves immediately.'
    },
    code: [
      {
        title: 'The privilege ladder Linux actually uses',
        lang: 'bash',
        code: 'Ring 0  kernel      ← we just arrived: all instructions, all memory, all devices\nRing 1  (unused)\nRing 2  (unused)\nRing 3  user space  ← where V8, our JS, and the whole browser live\n\nring 3 CANNOT: program the NIC · touch another process\'s pages · disable interrupts\n                · execute HLT/LGDT/WRMSR · open a socket'
      }
    ]
  },

  {
    id: 'sys-entry64',
    chapter: 6,
    title: 'entry_SYSCALL_64: swapgs and the kernel stack',
    node: 'syscallgate',
    mode: 'kernel',
    explain: {
      what: "On the kernel side of the door, a short piece of assembly makes the environment trustworthy before any C code is allowed to run. swapgs points a CPU register at this processor's private kernel data, so that \"which task is running?\" resolves correctly; the stack pointer moves to this thread's kernel stack; all the user registers are pushed into a structure called pt_regs; and with KPTI the CR3 register is rewritten to the kernel's page tables. Only then does it call into C.",
      why: "This handful of assembly is among the most security-critical code in Linux: several real CVEs came from getting entry or exit subtly wrong and letting user-controlled state leak into kernel context.",
      component: 'arch/x86/entry/entry_64.S — entry_SYSCALL_64, do_syscall_64',
      layer: 'Kernel space · Architecture entry code',
      abstraction: 'Establishing a trustworthy execution environment from scratch',
      protocol: 'Linux x86-64 syscall ABI',
      misconception: "You might think the kernel runs on the same stack as your program. Actually every thread has two stacks — the user one and a separate 16KB kernel stack — and kernel code never trusts or even touches your stack pointer.",
      analogy: "A courtroom before proceedings begin: everyone searched at the door, seated on official benches, the record opened fresh. Nothing that walked in from outside is taken at face value.",
      command: 'sudo cat /proc/4903/stack   # kernel stack trace of a thread currently in a syscall',
      production: 'Entry-code overhead (swapgs, CR3 writes, retpolines, IBPB) is exactly what mitigation flags tune. `mitigations=off` is measurable and, on shared infrastructure, unacceptable — know which one you are buying.'
    },
    code: [
      {
        title: 'The real entry path',
        lang: 'c',
        code: 'entry_SYSCALL_64:                    /* arch/x86/entry/entry_64.S */\n    swapgs                           /* GS → per-CPU kernel data */\n    movq %rsp, PER_CPU_VAR(cpu_tss_rw + TSS_sp2)\n    movq PER_CPU_VAR(cpu_current_top_of_stack), %rsp   /* kernel stack */\n    SWITCH_TO_KERNEL_CR3             /* KPTI: swap page tables */\n    PUSH_AND_CLEAR_REGS              /* build struct pt_regs, scrub regs */\n    call do_syscall_64               /* ← C code takes over */'
      }
    ]
  },

  {
    id: 'sys-table-dispatch',
    chapter: 6,
    title: 'The syscall table dispatch',
    node: 'syscalltable',
    mode: 'kernel',
    explain: {
      what: "The kernel looks up what number 41 means and calls it. do_syscall_64 first checks that the number in rax is within range, then calls entry 41 of a big array of function pointers, which is __x64_sys_socket. Just before that, seccomp filters run — and this is the exact spot where a sandboxed Chrome renderer would have been shot down for daring to ask for a socket. Our network service process, PID 4903, has a policy that permits it.",
      why: "A flat array of roughly 450 function pointers is the kernel's entire public API — small enough to audit, and the natural chokepoint for sandboxing, auditing, and tracing.",
      component: 'do_syscall_64 + sys_call_table (arch/x86/entry/syscall_64.c, syscalls/syscall_64.tbl)',
      layer: 'Kernel space · Syscall dispatch',
      abstraction: 'The kernel as a numbered menu of ~450 services',
      protocol: 'Linux syscall numbering (stable ABI — numbers are never reused)',
      misconception: "You might think syscall numbers are the same everywhere. Actually 41 is socket on x86-64 and something else entirely on 32-bit x86 (which bundles all socket calls behind one number) and on ARM64 — which is why static binaries and seccomp policies are always tied to one architecture.",
      analogy: "Room service by number: dial 41 for a socket, 42 to connect, 1 to write. The menu can grow but it never renumbers, or every guest in the building would order the wrong dish.",
      command: 'grep -w "41\\|42" /usr/src/linux/arch/x86/entry/syscalls/syscall_64.tbl || ausyscall --dump | head -50',
      production: 'seccomp-bpf policies (Docker’s default blocks ~44 syscalls; Chrome’s renderer policy is far stricter) are written against this table. "Operation not permitted" in a container with root is usually seccomp, not file permissions.'
    },
    code: [
      {
        title: 'Number → function',
        lang: 'c',
        code: '/* arch/x86/entry/syscalls/syscall_64.tbl */\n41  common  socket    sys_socket\n42  common  connect   sys_connect\n\n/* arch/x86/entry/common.c */\n__visible noinstr void do_syscall_64(struct pt_regs *regs, int nr) {\n    nr = syscall_enter_from_user_mode(regs, nr);   /* seccomp, audit, ptrace */\n    if (likely(nr < NR_syscalls))\n        regs->ax = sys_call_table[nr](regs);        /* → __x64_sys_socket */\n    syscall_exit_to_user_mode(regs);\n}'
      }
    ]
  },

  {
    id: 'sys-process-context',
    chapter: 6,
    title: 'Running in process context, as `current`',
    node: 'process',
    mode: 'kernel',
    explain: {
      what: "The kernel is now working as PID 4903, not as some anonymous system entity. A macro called current points at that process's record, so the credentials it checks, the namespaces and cgroup limits it obeys, and the descriptor table it is about to allocate from all belong to this process. And because it arrived through a system call, this is process context: the code may sleep, take locks, and be preempted by the scheduler. Later, when packets arrive from the network, kernel code runs in interrupt context instead — where sleeping is forbidden.",
      why: "Process context versus interrupt context decides what kernel code is legally allowed to do; it is behind half of all kernel bugs and the entire reason softirqs exist in chapter 23.",
      component: 'task_struct / `current` (include/linux/sched.h), per-CPU current_task',
      layer: 'Kernel space · Scheduling context',
      abstraction: 'The kernel as a contractor doing work billed to your process',
      protocol: 'None — kernel execution model',
      misconception: "You might think kernel code runs as a separate process of its own. Actually most of the time it does not: this time is billed to PID 4903 as system time, which is exactly the %sy column top shows against that very process.",
      analogy: "A lawyer acting under power of attorney: their signature is legally yours, the bill lands on your account, and they cannot do anything your own authority does not cover.",
      command: 'cat /proc/4903/status | grep -E "State|Threads|Cpus_allowed_list"; pidstat -p 4903 1 3',
      production: 'High %sy for a process usually means syscall storms or lock contention in kernel paths on its behalf — profile with `perf record -g -p PID` and look for kernel frames, not just user ones.'
    }
  },

  {
    id: 'sys-mode-cost',
    chapter: 6,
    title: 'What that crossing actually cost',
    node: 'cpu',
    mode: 'kernel',
    explain: {
      what: "That crossing is fast, but it is not free. A round trip from your program into the kernel and back is roughly 50 to 100 nanoseconds on a modern x86-64 chip: about 25 nanoseconds of raw instructions, plus the KPTI page-table switches (two CR3 writes and the cache pressure that follows), plus the Spectre mitigations bolted on since. Trivial once. But a server doing 500,000 system calls a second is burning entire CPU cores purely on doorway traffic.",
      why: "This number is the reason io_uring, sendfile, memory-mapped I/O, and kernel-bypass stacks like DPDK exist at all — every one of them is an answer to \"the door is fast, but not free\".",
      component: 'CPU pipeline + KPTI + spectre_v2 mitigations',
      layer: 'Hardware · Cost accounting',
      abstraction: 'Safety has a price, quoted in nanoseconds',
      protocol: 'None',
      misconception: "You might think system calls are expensive and should be avoided. Actually at around 100 nanoseconds they are cheap; what really costs you is blocking (microseconds to milliseconds) and switching between tasks (1 to 5 microseconds). Optimise the waiting, not the doorway — unless you genuinely are doing millions per second.",
      analogy: "A revolving door: two seconds per person, irrelevant for a single visitor, catastrophic for a stadium trying to leave through it.",
      command: 'perf stat -e raw_syscalls:sys_enter -p 4903 -- sleep 5',
      production: 'io_uring exists to amortize this: submit N operations and reap N completions with (nearly) zero syscalls via shared ring buffers. Node 20+ and modern proxies are adopting it exactly where syscall rate dominates.'
    },
    code: [
      {
        title: 'Rough cost ladder (modern x86-64)',
        lang: 'bash',
        code: 'L1 cache hit                    ~1 ns\nfunction call (user space)      ~2 ns\nsyscall round trip             ~50–100 ns   ← we just paid this\ncontext switch (task → task)  ~1000–5000 ns\nLAN round trip                ~500,000 ns   (0.5 ms)\nour full journey to origin  ~50,000,000 ns  (50 ms) ← the real enemy'
      }
    ]
  },

  // ════════════════════════ Chapter 7 · Socket Creation ════════════════════════

  {
    id: 'sock-create',
    chapter: 7,
    title: '__sys_socket → sock_create → inet_create',
    node: 'socketlayer',
    mode: 'kernel',
    explain: {
      what: "The kernel starts assembling the socket out of generic parts plus a protocol personality. sock_create checks the family is one it knows, looks AF_INET up in an array of registered address families, and hands off to inet_create. That in turn scans a list for the SOCK_STREAM entry — which is TCP — and attaches TCP's table of operations, tcp_prot, to the new object. Nothing is connected to anything: we are building the handset, not making a call.",
      why: "This layering is why the same read() and write() work over TCP, UDP, and local UNIX sockets: one generic object with swappable protocol machinery bolted underneath.",
      component: 'net/socket.c (__sys_socket, sock_create) → net/ipv4/af_inet.c (inet_create)',
      layer: 'Kernel space · Socket layer (BSD sockets API)',
      abstraction: 'Polymorphism in C via function-pointer tables',
      protocol: 'BSD sockets API (POSIX.1-2017), TCP (RFC 9293) selected here',
      misconception: "You might think socket() connects to something. Actually it allocates a completely unconnected object — no IP, no port, no packets. Connecting is a separate system call and a separate story, two steps from now.",
      analogy: "Buying a telephone handset. It exists, it is yours, it is plugged into nothing and it knows nobody's number.",
      command: 'sudo bpftrace -e \'kprobe:inet_create { printf("%s created an inet socket\\n", comm); }\'',
      production: 'Socket allocation is cheap but not free (~2μs + slab memory). Servers under connection storms hit limits at the *table* level first: file-max, per-process RLIMIT_NOFILE, and tcp_max_orphans.'
    },
    code: [
      {
        title: 'Kernel call path',
        lang: 'c',
        code: '__sys_socket(AF_INET, SOCK_STREAM|SOCK_NONBLOCK, IPPROTO_TCP)\n  → sock_create(family, type, protocol, &sock)\n      → __sock_create()\n          → pf = net_families[AF_INET]            /* inet_family_ops */\n          → pf->create()  ==  inet_create()\n              → lookup inetsw[SOCK_STREAM] → tcp_prot\n              → sk_alloc(net, PF_INET, GFP_KERNEL, &tcp_prot, kern)\n              → sock->ops = &inet_stream_ops'
      }
    ]
  },

  {
    id: 'sock-structs',
    chapter: 7,
    title: 'struct socket, struct sock, struct tcp_sock',
    node: 'socketobj',
    mode: 'kernel',
    state: { sock: 'CLOSED' },
    explain: {
      what: "There are two objects here, and people confuse them forever. struct socket is the thin outer shell the rest of the operating system sees: its type, its operations, the file that represents it. struct sock is the real thing — the protocol control block holding send and receive buffers, connection state, and backlogs. And for TCP it is really a bigger structure still, struct tcp_sock, around 2KB, carrying the congestion window, the round-trip-time estimators, the selective-acknowledgement bookkeeping, and the sequence numbers. Right now the TCP state machine inside it reads CLOSED.",
      why: "Every TCP setting you have ever tuned — receive buffers, send buffers, congestion control — lives in these bytes, once per connection, which is where all memory-per-connection arithmetic comes from.",
      component: 'include/linux/net.h (struct socket) · include/net/sock.h (struct sock) · include/linux/tcp.h (tcp_sock)',
      layer: 'Kernel space · Slab-allocated protocol state',
      abstraction: 'A connection as a struct with a state machine inside',
      protocol: 'TCP state machine (RFC 9293 §3.3.2) — currently CLOSED',
      misconception: "You might think a socket is a file. Actually it only looks like one from outside, which is why read, write and close work on it — but there is no file on any disk you could point at, just an anonymous object whose operations happen to be networking code.",
      analogy: "The nameplate on an office door versus the personnel file behind it: one is the bit everybody sees, the other holds everything anyone actually acts on.",
      command: 'sudo cat /proc/slabinfo | grep -E "^TCP|sock_inode"; ss -m -t   # -m shows per-socket memory',
      production: 'Memory per connection is roughly tcp_sock + buffers: with default net.ipv4.tcp_rmem 4k/128k/6M, 100k connections can balloon into gigabytes under load. Autotuning helps; unbounded rmem does not.'
    },
    code: [
      {
        title: 'The nesting (simplified)',
        lang: 'c',
        code: 'struct socket {                 /* VFS-facing shell */\n    socket_state        state;\n    struct file        *file;\n    struct sock        *sk;         /* ↓ the real thing */\n    const struct proto_ops *ops;    /* inet_stream_ops */\n};\n\nstruct tcp_sock {               /* ~2KB — the connection itself */\n    struct inet_connection_sock inet_conn;  /* embeds struct sock */\n    u32 rcv_nxt, snd_nxt, snd_una;          /* sequence bookkeeping */\n    u32 snd_cwnd, snd_ssthresh;             /* congestion control */\n    u32 srtt_us, mdev_us;                   /* RTT estimation */\n};  /* sk_state = TCP_CLOSE for now */'
      }
    ]
  },

  {
    id: 'sock-fd-alloc',
    chapter: 7,
    title: 'File descriptor 42 is born',
    node: 'fdtable',
    mode: 'kernel',
    state: { fds: [['0', 'pipe:[38210]'], ['1', 'pipe:[38211]'], ['2', 'pipe:[38212]'], ['3', 'anon_inode:[eventpoll]'], ['42', 'socket:[TCP CLOSED]']] },
    explain: {
      what: "Now user space needs a handle it can refer to. The kernel asks for the lowest unused index in this process's descriptor table — it comes back 42 — and publishes the new socket there. Because we passed SOCK_NONBLOCK at creation, the non-blocking flag is set at that same instant rather than by a second call afterwards, which closes a small race window. The number 42 travels back out through rax into user space, and from here on that one integer means \"our socket\".",
      why: "A file descriptor is the kernel's universal token of permission: a small integer that grants one process access to one resource. Files, sockets, epoll instances, timers, even signals are all reachable this way.",
      component: 'fs/file.c (get_unused_fd_flags, fd_install), files_struct/fdtable per process',
      layer: 'Kernel space · Per-process descriptor table',
      abstraction: 'A capability as a small integer',
      protocol: 'POSIX file descriptor semantics',
      misconception: "You might think file descriptors are global. Actually they are strictly per-process: fd 42 in PID 4903 and fd 42 in PID 1337 have nothing to do with each other, and telling another process the number means nothing — handing over the real thing needs a special mechanism (SCM_RIGHTS).",
      analogy: "A coat-check ticket. The number means everything at this one counter and absolutely nothing anywhere else in the city.",
      command: 'ls -l /proc/4903/fd/ | head; cat /proc/4903/limits | grep "open files"',
      production: '"EMFILE: too many open files" is this table hitting RLIMIT_NOFILE. Raise it deliberately (LimitNOFILE in systemd units) and fix the leak — leaked fds show up as an ever-growing /proc/PID/fd listing full of CLOSE_WAIT sockets.'
    },
    code: [
      {
        title: 'Allocation and publication',
        lang: 'c',
        code: '/* net/socket.c — __sys_socket() tail */\nretval = sock_map_fd(sock, flags & (O_CLOEXEC | O_NONBLOCK));\n  → fd = get_unused_fd_flags(flags);        /* lowest free index → 42 */\n  → newfile = sock_alloc_file(sock, flags, NULL);\n  → fd_install(fd, newfile);                /* fdtable[42] = file */\nreturn fd;                                   /* → rax → user space */'
      }
    ]
  },

  {
    id: 'sock-epoll-register',
    chapter: 7,
    title: 'Registering with epoll',
    node: 'fdtable',
    mode: 'kernel',
    effects: ['ctx'],
    explain: {
      what: "Nobody is going to sit and wait for this connection. The event loop tells the kernel: wake me when fd 42 becomes writable, which for a connecting socket means \"connected\". The call epoll_ctl(3, EPOLL_CTL_ADD, 42, {EPOLLOUT|EPOLLET}) adds an entry to the epoll instance behind fd 3 — and here is the clever part: it hooks a callback into the socket's own wait queue. So when TCP later changes state, the kernel pushes fd 42 onto a ready list itself; nobody has to keep asking. The thread then goes to sleep inside epoll_wait, using no CPU at all.",
      why: "This inversion — the kernel notifies, the application sleeps — is what makes tens of thousands of simultaneous connections possible: being told about readiness costs the same whether you are watching 10 sockets or 100,000.",
      component: 'fs/eventpoll.c (ep_insert, ep_poll_callback, ep_poll) — epoll(7)',
      layer: 'Kernel space · Event notification subsystem',
      abstraction: 'Do not call us, we will call you — at scale',
      protocol: 'None — Linux-specific API (kqueue on BSD, IOCP on Windows)',
      misconception: "You might think epoll polls the sockets. Actually, despite the name, it never polls anything: it registers callbacks, and readiness is delivered by whichever piece of kernel code changed the socket — usually a softirq handling an incoming packet.",
      analogy: "Rather than checking 10,000 mailboxes every minute, you fit each one with a bell wired to a single board, and sit next to the board.",
      command: 'ls -l /proc/4903/fd/3   # anon_inode:[eventpoll];  strace -e epoll_ctl,epoll_wait -p 4903',
      production: 'Level- vs edge-triggered (EPOLLET) is the classic epoll footgun: with ET you MUST drain until EAGAIN or you hang forever on a socket the kernel considers already reported. libuv and undici use level-triggered for exactly this reason.'
    },
    code: [
      {
        title: 'The registration and the parked thread',
        lang: 'c',
        code: 'struct epoll_event ev = { .events = EPOLLOUT | EPOLLET, .data.fd = 42 };\nepoll_ctl(3, EPOLL_CTL_ADD, 42, &ev);\n\n/* fs/eventpoll.c */\nep_insert()\n  → init_poll_funcptr(&epq.pt, ep_ptable_queue_proc);\n  → sock_poll()                 /* attach to sk->sk_wq wait queue */\n  → ep_ptable_queue_proc()      /* → ep_poll_callback fires on state change */\n\n/* then the loop thread blocks — off-CPU until something happens: */\nepoll_wait(3, events, 1024, -1);   /* scheduler: TASK_INTERRUPTIBLE */'
      }
    ]
  },

  {
    id: 'sock-connect-enter',
    chapter: 7,
    title: 'connect() enters the kernel',
    node: 'socketlayer',
    mode: 'kernel',
    state: { mem: 'copy' },
    explain: {
      what: "Now we ask the kernel to actually connect: connect(42, {AF_INET, 104.18.32.7:443}, 16). The kernel does not simply read that address out of our memory — user memory can be unmapped or changed underneath it at any moment — so copy_from_user copies it in and validates it exactly once, then dispatches down through inet_stream_ops to TCP's tcp_v4_connect. And because the socket is non-blocking, this call returns almost immediately with -EINPROGRESS: the handshake is now the kernel's project, not ours.",
      why: "That copy is the hard edge of kernel security: anything crossing from user space comes over by value and is checked once, never trusted where it lies.",
      component: 'net/socket.c (__sys_connect) → inet_stream_connect → tcp_v4_connect',
      layer: 'Kernel space · Socket layer, user↔kernel copy',
      abstraction: 'Crossing the trust boundary by value, never by reference',
      protocol: 'BSD sockets connect(2); TCP active open (RFC 9293 §3.10.1)',
      misconception: "You might think connect() returns when you are connected. Actually on a non-blocking socket it returns -EINPROGRESS straight away; completion arrives later as a writable event, and you must then check SO_ERROR — a socket that reports writable can still be a failed one.",
      analogy: "Passing a written address through a slot in a window: the clerk photocopies it rather than keeping your sheet, because you could swap what you are holding at any moment.",
      command: 'strace -e trace=connect -p 4903   # look for: connect(42, ...) = -1 EINPROGRESS',
      production: 'Connect timeouts are NOT set by connect(): the kernel retries SYN per net.ipv4.tcp_syn_retries (6 → ~127s). Applications must impose their own deadline (AbortSignal.timeout, undici connectTimeout) or inherit that eternity.'
    },
    code: [
      {
        title: 'The address crossing the boundary',
        lang: 'c',
        code: 'struct sockaddr_in addr = {\n    .sin_family = AF_INET,\n    .sin_port   = htons(443),          /* network byte order! */\n    .sin_addr   = { .s_addr = inet_addr("104.18.32.7") },\n};\nconnect(42, (struct sockaddr *)&addr, sizeof addr);   /* = -1 EINPROGRESS */\n\n/* kernel side */\n__sys_connect()\n  → move_addr_to_kernel()   /* copy_from_user + sanity checks */\n  → sock->ops->connect()  ==  inet_stream_connect()\n      → tcp_v4_connect(sk, uaddr, addr_len)'
      }
    ]
  },

  {
    id: 'sock-ephemeral-port',
    chapter: 7,
    title: 'Ephemeral port 51324 is claimed',
    node: 'tcp',
    mode: 'kernel',
    explain: {
      what: "A TCP connection is identified by four things — your address and port, their address and port — and we have three of them. The kernel picks the missing one, our source port, out of the range 32768 to 60999: inet_hash_connect walks that range from a randomised starting point, checking a hash table so it does not collide with a connection that already exists, and claims 51324. The full identity is now 192.168.1.23:51324 talking to 104.18.32.7:443.",
      why: "That four-part identity is how one machine holds thousands of conversations at once through a single IP address — and why running out of ports is a real, countable limit rather than a myth.",
      component: 'net/ipv4/inet_hashtables.c (inet_hash_connect, __inet_check_established)',
      layer: 'Kernel space · TCP/IP · OSI L4 identity',
      abstraction: 'Multiplexing many conversations onto one address',
      protocol: 'TCP port semantics (RFC 9293), IANA ephemeral range',
      misconception: "You might think you can only ever have about 28,000 outbound connections. Actually that ceiling is per destination: a different destination address or port gets a fresh set of source ports, so the real limit applies separately to each combination of (your IP, their IP, their port).",
      analogy: "Extension numbers in an office: one public phone number for the whole building, thousands of simultaneous conversations kept apart by the extension.",
      command: 'sysctl net.ipv4.ip_local_port_range; ss -tan | awk \'{print $4}\' | grep -c 51324',
      production: 'Port exhaustion hits NAT gateways and busy proxies first, usually strangled by TIME_WAIT. Fixes: widen ip_local_port_range, enable tcp_tw_reuse (outbound only), use SO_REUSEPORT servers, or add source IPs — never tcp_tw_recycle, which was removed for good reason.'
    },
    code: [
      {
        title: 'The tuple takes shape',
        lang: 'bash',
        code: '$ sysctl net.ipv4.ip_local_port_range\nnet.ipv4.ip_local_port_range = 32768  60999\n\nconnection identity (the 4-tuple):\n  src ip   192.168.1.23   ← chosen next, by routing\n  src port 51324          ← just claimed\n  dst ip   104.18.32.7    ← from DNS\n  dst port 443            ← from the URL scheme'
      }
    ]
  },

  {
    id: 'sock-route-source',
    chapter: 7,
    title: 'Routing picks the source IP',
    node: 'routing',
    mode: 'kernel',
    explain: {
      what: "Which of this laptop's addresses should the packet claim to come from? The kernel does not guess — it asks the routing table before sending anything. ip_route_connect looks up 104.18.32.7, finds that only the default route matches (via 192.168.1.1, out of the wlp3s0 interface), and the address preferred for that interface is 192.168.1.23. The four-part identity is now complete, and the route is cached on the socket so every later packet skips this lookup entirely.",
      why: "Routing chooses your source address, not the other way around — which is the mechanism behind multi-homing surprises, VPN split-tunnel behaviour, and every \"why did my packet leave the wrong interface\" evening.",
      component: 'net/ipv4/route.c (ip_route_connect, fib_lookup), FIB trie',
      layer: 'Kernel space · OSI L3 decision',
      abstraction: 'The destination chooses your return address',
      protocol: 'IPv4 routing (RFC 1812), Linux FIB/policy routing',
      misconception: "You might think your machine has an IP address. Actually it has one per interface, and which one gets used is decided per destination: \"ip route get\" is the only authoritative answer, and assumptions about \"the\" local IP fall apart the moment a VPN appears.",
      analogy: "Choosing which of your several PO boxes to print as the return address, based on which depot is actually going to carry this particular letter.",
      command: 'ip route get 104.18.32.7',
      production: 'When traffic must leave a specific interface (dual-homed hosts, WireGuard, cloud secondary NICs), use policy routing (ip rule + a separate table) — bind-to-IP alone does not change which route is chosen.'
    },
    code: [
      {
        title: 'The decision, verbatim',
        lang: 'bash',
        code: '$ ip route get 104.18.32.7\n104.18.32.7 via 192.168.1.1 dev wlp3s0 src 192.168.1.23 uid 1000\n    cache\n\n$ ip route\ndefault via 192.168.1.1 dev wlp3s0 proto dhcp metric 600\n192.168.1.0/24 dev wlp3s0 proto kernel scope link src 192.168.1.23'
      }
    ]
  },

  {
    id: 'sock-syn-sent',
    chapter: 7,
    title: 'CLOSED → SYN_SENT',
    node: 'tcp',
    mode: 'kernel',
    state: { sock: 'SYN_SENT', mem: 'kernel' },
    explain: {
      what: "The connection now officially exists, even though nothing has been sent. tcp_v4_connect finishes wiring the socket together — destination, source address, source port, cached route — then calls tcp_set_state(sk, TCP_SYN_SENT) and arms a retransmission timer. connect() returns -EINPROGRESS to user space; the event loop carries on, our promise from chapter 1 is still pending, and the next move belongs entirely to the kernel.",
      why: "The TCP state machine is the contract, and from here exactly three futures exist: a SYN-ACK comes back and we are established, a RST comes back and the app sees ECONNREFUSED, or nothing comes back and we retransmit until we give up with ETIMEDOUT.",
      component: 'net/ipv4/tcp.c (tcp_set_state) + inet_csk retransmit timer',
      layer: 'Kernel space · OSI L4 state machine',
      abstraction: 'A connection as a formally specified state machine',
      protocol: 'TCP (RFC 9293 §3.3.2, active open)',
      misconception: "You might think SYN_SENT means the packet has been sent. Actually the state is set before transmission even finishes: the segment still has to be built, filtered, routed, ARP-resolved, queued and handed to the network card — which is the whole of chapter 8.",
      analogy: "The moment you press dial: your phone says \"calling...\" long before anything rings at the other end, and it keeps trying on its own schedule whether you watch or not.",
      command: 'ss -tan state syn-sent',
      production: 'Sockets stuck in SYN_SENT mean the SYN is disappearing: DROP-policy firewall, blackholed route, or a dead host. Retries follow tcp_syn_retries with exponential backoff (1s, 2s, 4s…) — ~127 seconds before ETIMEDOUT by default.'
    },
    code: [
      {
        title: 'Kernel call path to SYN_SENT',
        lang: 'c',
        code: 'tcp_v4_connect(sk, uaddr, addr_len)\n  → ip_route_connect()              /* route + source IP */\n  → inet_hash_connect()             /* ephemeral port 51324 */\n  → tcp_set_state(sk, TCP_SYN_SENT)\n  → tcp_connect(sk)\n      → tcp_connect_init()          /* ISN, MSS, window, options */\n      → tcp_transmit_skb()          /* ← chapter 8 begins here */\n      → inet_csk_reset_xmit_timer(sk, ICSK_TIME_RETRANS, 1s, TCP_RTO_MAX)'
      }
    ]
  },

  // ════════════════════════ Chapter 8 · TCP SYN Egress ════════════════════════

  {
    id: 'syn-tcp-build',
    chapter: 8,
    title: 'TCP builds the SYN segment',
    node: 'tcp',
    from: 'socketobj',
    mode: 'kernel',
    packet: {
      label: 'SYN seq=1128394821',
      layers: ['tcp'],
      fields: {
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Ack': '0', 'Flags': 'SYN', 'Window': '64240', 'Options': 'MSS 1460, SACK permitted, TS, WS 7 (×128)' }
      }
    },
    explain: {
      what: "The kernel now writes the actual first packet. tcp_connect allocates an sk_buff — the universal packet container in Linux — with deliberately generous space at the front so every lower layer can push its own header on without ever copying the data. It fills in a 20-byte TCP header plus 20 bytes of options: the Initial Sequence Number 1128394821 (randomly chosen, per RFC 6528, so an outsider cannot guess it and inject data), a maximum segment size of 1460, permission to use selective acknowledgements, timestamps, and a window scale of 7. Application payload: zero bytes.",
      why: "The SYN is a negotiation, not a delivery: how big the segments will be, how far the window may grow, whether losses can be reported selectively — the entire personality of this connection is proposed here, once.",
      component: 'net/ipv4/tcp_output.c (tcp_connect, tcp_transmit_skb) · struct sk_buff',
      layer: 'Kernel space · OSI L4',
      abstraction: 'Reliable ordered byte stream, bootstrapped from one datagram',
      protocol: 'TCP (RFC 9293), options per RFC 7323 (WS/TS), RFC 2018 (SACK)',
      misconception: "You might think the SYN carries the HTTP request. Actually not one byte of application data may be sent before the handshake completes (TCP Fast Open is the narrow, cookie-gated exception) — and our GET has not even been written out as text yet.",
      analogy: "Two people meeting across a language barrier and opening with the ground rules: we will speak English, I can handle long sentences, and let us number our turns starting at 1128394821 so nothing gets lost.",
      command: 'sudo tcpdump -ni any "tcp[tcpflags] & tcp-syn != 0 and port 443" -c 1 -v',
      production: 'Window scale 7 (×128) is what allows windows beyond 64KB — mandatory for bandwidth-delay products on any long fat network. Middleboxes that strip options silently cap throughput; that is a classic "fast link, slow transfer" root cause.'
    },
    code: [
      {
        title: 'sk_buff: allocated once, carried all the way down',
        lang: 'c',
        code: '/* one allocation, headroom reserved for every header still to come */\nskb = tcp_stream_alloc_skb(sk, 0, GFP_KERNEL, false);\nskb_reserve(skb, MAX_TCP_HEADER);   /* room for TCP + IP + Ethernet */\n\n/* the skb travels: tcp_transmit_skb → ip_queue_xmit → netfilter →\n   dev_queue_xmit → qdisc → ndo_start_xmit → DMA. Headers get *prepended*;\n   the buffer itself is never copied — pointers move, data stays put. */\nstruct sk_buff { unsigned char *head, *data, *tail, *end; /* … */ };'
      }
    ]
  },

  {
    id: 'syn-ip-wrap',
    chapter: 8,
    title: 'IP wraps it: TTL 64, Don\'t Fragment',
    node: 'ip',
    mode: 'kernel',
    packet: {
      label: 'IP 192.168.1.23 → 104.18.32.7 · SYN',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Version': '4', 'IHL': '5 (20 bytes)', 'Total Length': '60', 'ID': '0x4a1c', 'Flags': 'DF (Don\'t Fragment)', 'TTL': '64', 'Proto': '6 (TCP)', 'Src': '192.168.1.23', 'Dst': '104.18.32.7' },
          tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "A second header goes on the front, and this is the one every router in the world will read. ip_queue_xmit pushes a 20-byte IPv4 header in front of the TCP header — no copying, it simply moves a pointer back into the space reserved earlier. TTL starts at 64 (Linux's default), the Don't Fragment bit is set so the largest safe packet size along the path can be discovered, the protocol field says 6 for TCP, and a checksum over the header is computed. The datagram is now 60 bytes and carries its full end-to-end address.",
      why: "IP is the universal envelope: every router between this laptop and Cloudflare reads exactly this header and nothing above it.",
      component: 'net/ipv4/ip_output.c (ip_queue_xmit, ip_local_out)',
      layer: 'Kernel space · OSI L3',
      abstraction: 'Best-effort global addressing on top of local links',
      protocol: 'IPv4 (RFC 791, updated by RFC 6864 for the ID field)',
      misconception: "You might think TTL is a time in seconds. Actually it is a hop counter, knocked down by one at every router; it was described in seconds back in 1981 and no implementation ever honoured that. At zero the packet is destroyed and an ICMP Time Exceeded comes back, which is literally how traceroute works.",
      analogy: "A courier envelope stamped \"destroy if not delivered within 64 handoffs\" — counted in depots, not in minutes.",
      command: 'sysctl net.ipv4.ip_default_ttl; ping -c1 104.18.32.7 | grep ttl',
      production: 'DF + PMTUD breaks when middleboxes drop ICMP "Fragmentation Needed" — the infamous PMTU black hole: handshake fine, big responses hang. Mitigate with MSS clamping (TCPMSS --clamp-mss-to-pmtu) on tunnels and VPNs.'
    },
    code: [
      {
        title: 'Header prepend, in place',
        lang: 'c',
        code: '/* net/ipv4/ip_output.c — __ip_queue_xmit() */\nskb_push(skb, sizeof(struct iphdr));   /* move data pointer back 20 bytes */\niph = ip_hdr(skb);\niph->version = 4;  iph->ihl = 5;\niph->ttl      = ip_select_ttl(inet, &rt->dst);   /* 64 */\niph->protocol = IPPROTO_TCP;                     /* 6 */\niph->saddr = saddr; iph->daddr = daddr;\niph->frag_off = htons(IP_DF);                    /* PMTUD enabled */\nip_send_check(iph);                              /* header checksum */'
      }
    ]
  },

  {
    id: 'syn-netfilter-output',
    chapter: 8,
    title: 'Netfilter hook: NF_INET_LOCAL_OUT',
    node: 'netfilter',
    mode: 'kernel',
    packet: {
      label: 'SYN at LOCAL_OUT hook',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "Before the packet may leave, Linux gives your firewall a chance to look at it. It passes NF_INET_LOCAL_OUT, one of netfilter's five fixed inspection points, where any registered rule may accept it, drop it, hand it up to a user-space program, or rewrite it. Packets your own machine created take the path LOCAL_OUT then POSTROUTING; packets merely passing through take a different one (PREROUTING, FORWARD, POSTROUTING). Every firewall, NAT setup, container network and VPN you have ever used plugs in at these points.",
      why: "Netfilter is the kernel's programmable policy layer for packets, and knowing which of the five points a packet actually crosses tells you immediately why a rule did or did not fire.",
      component: 'net/netfilter/core.c (nf_hook_slow), hook NF_INET_LOCAL_OUT',
      layer: 'Kernel space · OSI L3 policy',
      abstraction: 'Programmable interception points in the packet path',
      protocol: 'None — Linux netfilter framework',
      misconception: "You might think an iptables INPUT rule blocks your outgoing traffic. Actually packets your machine generates never touch INPUT at all — they see OUTPUT and POSTROUTING. INPUT is where you would block the reply.",
      analogy: "Customs desks placed along specific corridors of an airport: which ones you walk past depends entirely on whether you are departing, arriving, or connecting.",
      command: 'sudo nft list ruleset | head -40   # or: iptables -L -v -n --line-numbers',
      production: 'On busy boxes nf_hook_slow shows up in `perf top`. Deep rule sets cost per-packet CPU; nftables sets/maps and eBPF/XDP exist to collapse thousands of linear rules into hash lookups.'
    },
    code: [
      {
        title: 'The five hooks, and our path',
        lang: 'bash',
        code: '            ┌── PREROUTING ──┬── FORWARD ──┬── POSTROUTING ──┐\n  incoming ─┘                └── INPUT     └── OUTPUT ──┘\n\nlocally generated (us):     LOCAL_OUT ──▶ POSTROUTING ──▶ wire\n                              ▲ we are here\ntables at each hook: raw → conntrack → mangle → nat → filter'
      }
    ]
  },

  {
    id: 'syn-iptables-walk',
    chapter: 8,
    title: 'Walking the OUTPUT chain',
    node: 'iptables',
    mode: 'kernel',
    explain: {
      what: "Now the rules themselves get read, in order, top to bottom, and the first one that matches decides everything. Our SYN is tested against each rule in the filter table's OUTPUT chain: a fast-path rule for packets belonging to connections already allowed (no match — this connection is brand new), a rule for local loopback traffic (no), and then it falls off the end onto the chain's default policy, ACCEPT. On a laptop that walk takes microseconds; on a hardened server the same walk can be hundreds of rules deep.",
      why: "Rule order is meaning, not tidiness: one ACCEPT misplaced above a DROP quietly opens a hole, and one DROP above your established-connections rule kills every reply you were waiting for.",
      component: 'net/ipv4/netfilter/ip_tables.c (ipt_do_table) — or nft_do_chain for nftables',
      layer: 'Kernel space · OSI L3/L4 filtering',
      abstraction: 'Firewall as an ordered decision list',
      protocol: 'None — iptables/nftables rule semantics',
      misconception: "You might think iptables is still the firewall. Actually on modern distributions iptables is a compatibility front end over nftables, and \"nft list ruleset\" shows the truth — mixing the legacy and new backends produces rules that are genuinely invisible from one side.",
      analogy: "A bouncer with a clipboard, reading from the top and acting on the first line that matches — and never reading a word further down, whatever it says.",
      command: 'sudo iptables -L OUTPUT -v -n --line-numbers; sudo nft list chain inet filter output',
      production: 'Always keep the conntrack fast path first: `-m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT` at rule 1 means the other 200 rules are consulted once per *connection*, not once per packet.'
    },
    code: [
      {
        title: 'The walk, with our verdict',
        lang: 'bash',
        code: '$ sudo iptables -L OUTPUT -v -n --line-numbers\nChain OUTPUT (policy ACCEPT 8123 packets)\nnum  target  prot  source        destination   state\n1    ACCEPT  all   0.0.0.0/0     0.0.0.0/0     ctstate RELATED,ESTABLISHED  ✗ (NEW)\n2    ACCEPT  all   0.0.0.0/0     0.0.0.0/0     lo interface                 ✗\n3    (no further rules)\n→ falls through to policy ACCEPT ✓  packet may proceed'
      }
    ]
  },

  {
    id: 'syn-conntrack-new',
    chapter: 8,
    title: 'Conntrack records a NEW flow',
    node: 'conntrack',
    mode: 'kernel',
    explain: {
      what: "The kernel starts keeping notes on this conversation. The connection tracker creates an entry for our four-part identity in state NEW, and it stores both directions: the one we are sending (192.168.1.23:51324 to 104.18.32.7:443) and the reply we expect, worked out in advance so that return packets are recognised by a single hash lookup instead of a search. Until the SYN-ACK arrives the entry is marked UNREPLIED with a short 60-second timeout; once the handshake completes it becomes ESTABLISHED with a famously generous one — five days by default.",
      why: "Conntrack is what makes stateful firewalls and NAT possible at all: it turns \"is this packet part of a conversation I already allowed?\" into a hash lookup.",
      component: 'net/netfilter/nf_conntrack_core.c (nf_conntrack_in), nf_conntrack_proto_tcp',
      layer: 'Kernel space · Stateful L3/L4 tracking',
      abstraction: 'Flows, reconstructed from stateless packets',
      protocol: 'None — Linux conntrack (mirrors the TCP state machine)',
      misconception: "You might think conntrack is the same thing as the TCP socket's state. Actually they are separate universes: conntrack tracks flows for UDP and ICMP too, and on a router it tracks connections it has no socket for at all — a socket can be long closed while conntrack still holds the flow in TIME_WAIT.",
      analogy: "A car park barrier that photographs every plate on the way in so it can lift automatically on the way out — including for cars whose drivers it has never met.",
      command: 'sudo conntrack -L | grep 51324; sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max',
      production: '"nf_conntrack: table full, dropping packet" is a top-tier production outage: silent packet loss at high connection rates. Raise nf_conntrack_max, shrink tcp_timeout_established (5 days is absurd for most gateways), or NOTRACK bulk flows in the raw table.'
    },
    code: [
      {
        title: 'The entry, both directions',
        lang: 'bash',
        code: '$ sudo conntrack -L -p tcp --dport 443\ntcp 6 60 SYN_SENT src=192.168.1.23 dst=104.18.32.7 sport=51324 dport=443\n              [UNREPLIED] src=104.18.32.7 dst=192.168.1.23 sport=443 dport=51324\n              mark=0 use=1\n#                    ▲ reply tuple pre-computed: the SYN-ACK will hash straight to this'
      }
    ]
  },

  {
    id: 'syn-fib-lookup',
    chapter: 8,
    title: 'FIB lookup: longest prefix wins',
    node: 'routing',
    mode: 'kernel',
    quiz: {
      q: 'The routing table holds 192.168.1.0/24 (link) and 0.0.0.0/0 via 192.168.1.1. Where does a packet for 104.18.32.7 go?',
      options: [
        'Directly to 104.18.32.7 — it is on the internet, so it goes straight there',
        'Out via the gateway 192.168.1.1, because only the default route 0.0.0.0/0 matches',
        'It is dropped: no specific route exists for that address'
      ],
      answer: 1,
      explain: "The most specific matching entry wins. 104.18.32.7 does not fall inside 192.168.1.0/24, so the only entry that matches is the default route 0.0.0.0/0, which matches everything. Next hop: 192.168.1.1 — meaning the packet is addressed to Cloudflare at layer 3, but handed to the router at layer 2."
    },
    explain: {
      what: "Where does this packet physically go next? The route was already cached on the socket, but this is the decision that matters for the step after: the forwarding table (a compressed trie) is searched for the most specific entry containing 104.18.32.7. The local 192.168.1.0/24 does not contain it. The default route, 0.0.0.0/0, contains everything, so it wins. Next hop: 192.168.1.1, out of interface wlp3s0. This is the moment the packet learns it must be handed to a nearby machine that is not its destination.",
      why: "Every router on Earth runs this same algorithm on this same header, and the split between \"who it is ultimately for\" and \"who I hand it to next\" is the single most clarifying idea in networking.",
      component: 'net/ipv4/fib_trie.c (fib_table_lookup), LC-trie FIB',
      layer: 'Kernel space · OSI L3 forwarding decision',
      abstraction: 'Global reachability from purely local knowledge',
      protocol: 'IPv4 routing / longest-prefix match (RFC 1812)',
      misconception: "You might think the packet is addressed to the router. Actually only at layer 2: the IP destination stays 104.18.32.7 for the whole journey, while the Ethernet destination changes at every single hop. Two addresses, two scopes, one packet.",
      analogy: "Posting a letter to Tokyo from a village: you hand it to the village post office even though the envelope says Tokyo, and every office along the way makes the same kind of decision again.",
      command: 'ip route get 104.18.32.7; ip -s route show table main',
      production: 'On hosts with VPNs, containers, or cloud routing, check `ip rule` too — policy routing consults multiple tables in priority order, and a stray rule sending traffic to a dead table looks exactly like a blackhole.'
    },
    code: [
      {
        title: 'Matching, longest prefix first',
        lang: 'bash',
        code: 'destination 104.18.32.7 → 01101000.00010010.00100000.00000111\n\n192.168.1.0/24   prefix 24  → no match\n169.254.0.0/16   prefix 16  → no match\n0.0.0.0/0        prefix 0   → MATCH (matches everything)\n\nnext hop = 192.168.1.1 dev wlp3s0\nL3 dst stays 104.18.32.7  ·  L2 dst must become the router\'s MAC → ARP'
      }
    ]
  },

  {
    id: 'syn-arp-request',
    chapter: 8,
    title: 'ARP: who has 192.168.1.1?',
    node: 'arp',
    mode: 'kernel',
    packet: {
      label: 'ARP who-has 192.168.1.1 tell 192.168.1.23',
      layers: ['eth'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'ff:ff:ff:ff:ff:ff (broadcast)', 'EtherType': '0x0806 (ARP)', 'Operation': '1 (request)', 'Target IP': '192.168.1.1', 'Sender IP': '192.168.1.23' }
      }
    },
    explain: {
      what: "To build the Ethernet frame the kernel needs one more thing: the hardware address of the router next door. There is no valid entry for 192.168.1.1 in the neighbour table, so the entry goes INCOMPLETE, our SYN is parked in a little queue attached to it, and an ARP request goes out to the broadcast address ff:ff:ff:ff:ff:ff — heard by every device on the local network: \"who has 192.168.1.1? tell 192.168.1.23\". Everyone listens; only the router should answer.",
      why: "ARP is the glue between the logical world of IP addresses and the physical world of hardware addresses — without it, layer 3 has no way of being carried by layer 2 hardware.",
      component: 'net/core/neighbour.c + net/ipv4/arp.c (neigh_resolve_output, arp_send)',
      layer: 'Kernel space · OSI L2/L3 boundary',
      abstraction: 'Shouting into the local room to translate an address',
      protocol: 'ARP (RFC 826)',
      misconception: "You might think ARP asks about the destination IP. Actually it never does that for a remote address: you only ever ARP for the next hop on your own network. Nobody on your LAN could answer for 104.18.32.7, and nothing tries.",
      analogy: "Standing up in an open-plan office and calling out \"who sits at desk one?\" — everyone hears it, one person answers, and you note their face for next time.",
      command: 'ip neigh show; sudo tcpdump -ni any arp -c 4',
      production: 'ARP is unauthenticated — anyone can claim any IP, which is exactly how ARP spoofing on shared LANs works. Enterprise switches counter with Dynamic ARP Inspection and DHCP snooping; on hosts you can pin static neighbours for critical gateways.'
    },
    code: [
      {
        title: 'Neighbour state, mid-resolution',
        lang: 'bash',
        code: '$ ip neigh show 192.168.1.1\n192.168.1.1 dev wlp3s0  INCOMPLETE       ← SYN queued behind this\n\n# neighbour states:\n#   INCOMPLETE → REACHABLE → STALE → DELAY → PROBE → FAILED\n# packets queue on INCOMPLETE (up to unres_qlen_bytes), drop on FAILED'
      }
    ]
  },

  {
    id: 'syn-arp-reply',
    chapter: 8,
    title: 'The router answers: 192.168.1.1 is at a4:91:b1:0c:44:e2',
    node: 'arp',
    from: 'homerouter',
    mode: 'net',
    packet: {
      label: 'ARP reply: 192.168.1.1 is-at a4:91:b1:0c:44:e2',
      layers: ['eth'],
      fields: {
        eth: { 'Src MAC': 'a4:91:b1:0c:44:e2 (router)', 'Dst MAC': '3c:07:54:6a:2b:91 (us, unicast)', 'EtherType': '0x0806 (ARP)', 'Operation': '2 (reply)', 'Sender IP': '192.168.1.1' }
      }
    },
    explain: {
      what: "The router answers, and it answers only us — a unicast reply straight back: 192.168.1.1 is at a4:91:b1:0c:44:e2. The neighbour entry flips to REACHABLE (good for about 30 seconds of idleness before it goes STALE), the SYN parked behind it is released and handed to the neighbour output path, and that hardware address is stamped into the Ethernet header. The frame is now completely addressed.",
      why: "One tiny broadcast exchange unlocked the whole connection — its cost is exactly why the neighbour cache exists, and why the very first packet to a cold gateway is measurably slower than the second.",
      component: 'net/ipv4/arp.c (arp_process) → neigh_update → __neigh_event_send flush',
      layer: 'Kernel space · OSI L2 resolution complete',
      abstraction: 'Cached translation from logical to physical identity',
      protocol: 'ARP reply (RFC 826)',
      misconception: "You might think ARP entries last until reboot. Actually they age out: REACHABLE decays to STALE after roughly 30 seconds of silence, and the next send quietly re-checks. That is why flaky local network problems so often correlate with idle periods.",
      analogy: "The stallholder two pitches down calls back \"that's me\" — you scribble the pitch number in the margin of your list, and only ask again once the ink has faded.",
      command: 'ip neigh show dev wlp3s0   # look for REACHABLE with the gateway MAC',
      production: 'Gateway failover (VRRP/HSRP) works by having the new active router send a gratuitous ARP so every host updates this cache instantly. Hosts that ignore gratuitous ARP (arp_accept=0 in some setups) get stuck sending to a dead MAC.'
    },
    code: [
      {
        title: 'The cache, now warm',
        lang: 'bash',
        code: '$ ip neigh show\n192.168.1.1 dev wlp3s0 lladdr a4:91:b1:0c:44:e2 REACHABLE\n\n# and the frame our SYN will wear:\n#   dst  a4:91:b1:0c:44:e2   (the router — next hop, layer 2)\n#   src  3c:07:54:6a:2b:91   (our NIC)\n#   type 0x0800              (IPv4 inside)'
      }
    ]
  },

  {
    id: 'syn-qdisc-enqueue',
    chapter: 8,
    title: 'Queueing discipline: fq_codel takes the frame',
    node: 'qdisc',
    mode: 'kernel',
    effects: ['queue+'],
    packet: {
      label: 'SYN queued in fq_codel',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The finished frame does not go straight to the hardware; it joins a queue with opinions. dev_queue_xmit hands it to the interface's queueing discipline, which on modern Linux is fq_codel: fair queueing plus controlled delay. It hashes our four-part connection identity into one of 1024 separate little queues, so a brand-new connection cannot be buried behind somebody's bulk download, and the CoDel half watches how long packets actually sit there, dropping or ECN-marking them when the wait passes about 5 milliseconds. Our link is idle, so the SYN is picked back up almost the instant it lands.",
      why: "This is the kernel's answer to bufferbloat: fairness between conversations plus a close eye on waiting time, instead of one dumb queue that fills to the brim and adds hundreds of milliseconds to everything.",
      component: 'net/sched/sch_fq_codel.c (fq_codel_enqueue/dequeue) via net/core/dev.c dev_queue_xmit',
      layer: 'Kernel space · Traffic control (between L3 and the driver)',
      abstraction: 'Fair, low-latency scheduling of a shared link',
      protocol: 'None — Linux tc / CoDel algorithm (RFC 8289), FQ-CoDel (RFC 8290)',
      misconception: "You might think bigger buffers prevent packet loss and are therefore good. Actually oversized buffers cause bufferbloat: TCP needs timely loss or ECN signals to find the right speed, and a full 1000-packet buffer means a full second of added delay — far worse than simply dropping a packet.",
      analogy: "Ramp metering on a motorway: every on-ramp gets its own light instead of one giant queue at the entrance, and the system watches how long drivers are actually waiting rather than just how many are stacked up.",
      command: 'tc -s qdisc show dev wlp3s0   # watch backlog, drops, and ce_mark counters',
      production: 'fq_codel (or CAKE at the router) is the single highest-impact latency fix for home and edge links. On servers, `fq` pairs with BBR and enables pacing — net.core.default_qdisc=fq is standard for high-throughput hosts.'
    },
    code: [
      {
        title: 'Queue state at this instant',
        lang: 'bash',
        code: '$ tc -s qdisc show dev wlp3s0\nqdisc fq_codel 0: root refcnt 2 limit 10240p flows 1024\n                  quantum 1514 target 5ms interval 100ms memory_limit 32Mb\n Sent 41283991 bytes 39218 pkt (dropped 0, overlimits 0 requeues 12)\n backlog 0b 0p requeues 12       ← idle link: our SYN passes straight through\n  maxpacket 1514 drop_overlimit 0 new_flow_count 812 ecn_mark 0'
      }
    ]
  },

  {
    id: 'syn-driver-handoff',
    chapter: 8,
    title: 'The driver takes the frame',
    node: 'driver',
    mode: 'kernel',
    packet: {
      label: 'Frame ready for TX · SYN seq=1128394821',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800', 'Frame size': '74 bytes' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)', 'Total Length': '60' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN', 'Window': '64240', 'Options': 'MSS 1460, SACK, TS, WS 7' }
      }
    },
    explain: {
      what: "The last thing software does is tell the hardware where the packet is, and then let go. The queue dequeues the frame and calls the driver's ndo_start_xmit; the driver takes the next free slot in its ring of transmit descriptors, writes into it the memory address and length of the sk_buff data, marks the slot as owned by the hardware, and pokes a register on the card — the doorbell. That is it. 74 bytes of frame, carrying the intent of one line of JavaScript, are now the network card's problem. Every layer from V8 downward contributed something, and not a single byte has been copied since the sk_buff was allocated.",
      why: "This is the software-hardware boundary — the last moment a CPU touches this packet. Everything past it is descriptors, direct memory access, and electrical signalling.",
      component: 'Driver ndo_start_xmit (e.g. drivers/net/ethernet/intel/igc/igc_main.c, or iwlwifi for Wi-Fi)',
      layer: 'Kernel space → hardware boundary · OSI L2',
      abstraction: 'Handing memory to a device that reads RAM by itself',
      protocol: 'Ethernet II framing (IEEE 802.3); device-specific descriptor format',
      misconception: "You might think the CPU writes the packet to the network card. Actually it writes a note: an address and a length. The card then fetches the bytes out of RAM by itself, without the processor touching the data at all.",
      analogy: "Leaving a parcel on the loading dock with a docket saying where it sits and how heavy it is. You do not carry it onto the truck; the loaders do that while you walk back inside.",
      command: 'ethtool -S wlp3s0 | grep -E "tx_packets|tx_bytes"; ethtool -g wlp3s0',
      production: 'Ring sizes (ethtool -g/-G), interrupt coalescing (-c/-C), and XPS/RSS queue mapping are the driver-level knobs. Under-sized TX rings show up as tx_dropped and requeues; that is the metric to watch before blaming the network.'
    },
    code: [
      {
        title: 'Handing off to hardware',
        lang: 'c',
        code: '/* net/core/dev.c → driver */\n__dev_queue_xmit(skb, NULL)\n  → __dev_xmit_skb(skb, q, dev, txq)      /* fq_codel enqueue/dequeue */\n      → sch_direct_xmit()\n          → netdev_start_xmit(skb, dev, txq, more)\n              → ops->ndo_start_xmit(skb, dev);   /* the driver */\n\n/* inside the driver: describe, do not copy */\ndma = dma_map_single(dev, skb->data, skb->len, DMA_TO_DEVICE);\ntx_desc->buffer_addr = cpu_to_le64(dma);\ntx_desc->cmd_type_len = cpu_to_le32(len | E1000_TXD_CMD_EOP | ...);\nwmb();\nwritel(tx_ring->next_to_use, tx_ring->tail);   /* doorbell — NIC, you are up */\n/* ▶ Agent B continues here: ring buffer, DMA, NIC, wire */'
      }
    ]
  }

];
