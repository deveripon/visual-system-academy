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
      what: "A product-listing component in our e-commerce SPA executes `await fetch('https://api.shop.dev/products?limit=20')`. One line of JavaScript is about to mobilize two compilers, a sandboxed browser process, the Linux kernel, your home router, a chunk of the global Internet, and a PostgreSQL server. Right now, though, exactly zero network bytes exist.",
      why: 'Every network request starts as an ordinary function call in user space. Understanding the full journey starts with respecting how far this call is from an actual wire.',
      component: 'Application JavaScript (products.js in the SPA bundle)',
      layer: 'User space · Application code (above OSI L7)',
      abstraction: 'One await = an entire distributed system round trip',
      protocol: 'None yet — pure ECMAScript semantics',
      misconception: '"fetch() sends the request" — calling fetch() merely *initiates* a chain of work. The HTTP request will not hit the wire until DNS, TCP, and TLS have all completed, dozens of steps from now.',
      analogy: 'Dropping a letter in your outbox. The letter exists, but no truck, plane, or postal worker has moved yet.',
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
      what: 'Before any of this "runs", the script is nothing but a UTF-8 byte buffer sitting in the renderer heap — it arrived earlier over the network as the SPA bundle. V8 receives a pointer, a length, and an encoding. The characters f-e-t-c-h are the bytes 66 65 74 63 68; no meaning has been assigned yet.',
      why: 'Compilation pipelines start from raw bytes, and V8 does real engineering here: one-byte vs two-byte string representations, streaming compilation while the script still downloads, and code caching keyed on the source bytes.',
      component: 'V8 source handling (v8::ScriptCompiler, streamed compilation)',
      layer: 'User space · Renderer process heap',
      abstraction: 'Text ≠ program. A program is what a parser agrees the text means.',
      protocol: 'None — UTF-8 encoded source (ECMA-262 §11 source text)',
      misconception: '"The browser reads my code line by line as it executes" — V8 scans and parses whole scripts (lazily for inner functions) before a single statement runs.',
      analogy: 'Sheet music in a sealed envelope. Until someone opens it and reads notation, it is just paper and ink.',
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
      what: "The string 'https://api.shop.dev/products?limit=20' will be parsed (per the WHATWG URL Standard) into: scheme `https`, host `api.shop.dev`, an *implicit* port 443, path `/products`, and query `limit=20`. Each piece steers a different subsystem: the scheme selects TLS, the host drives DNS and the TLS SNI + Host header, the port targets a socket, and path + query only matter to the far-away application server.",
      why: 'The URL is the routing table of the entire journey. Misread one component and you debug the wrong layer.',
      component: 'WHATWG URL parser (url.spec.whatwg.org; GURL in Chromium)',
      layer: 'User space · Application data',
      abstraction: 'One string encoding decisions for five different layers',
      protocol: 'URL (WHATWG URL Standard, obsoletes RFC 3986 for browsers)',
      misconception: '"The path /products gets used for routing the packet" — routers and the kernel never see the path. Only the destination IP routes packets; the path is payload, encrypted inside TLS.',
      analogy: 'An address on an envelope: country (scheme) picks the postal system, city (host) picks the route, street (path) only matters to the local mail carrier at the destination.',
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
      what: 'fetch() returns immediately — with a Promise in state *pending*. The `await` suspends loadProducts: V8 packages its live registers and locals into a heap object (the generator-like closure state), wires a resumption onto the promise, and returns control to the caller. The JS thread is now free; nothing is blocked.',
      why: 'This suspension is the entire concurrency model of JS: one thread, no blocking I/O, continuations scheduled as microtasks. The response, seconds and thousands of kilometers away, will resume this exact frame.',
      component: 'V8 promise machinery + async function suspension (JSPromise, await = suspend/resume)',
      layer: 'User space · JS engine heap',
      abstraction: 'A placeholder for a value that does not exist yet',
      protocol: 'ECMAScript (ECMA-262 §27.2 Promise Objects, §27.7 AsyncFunction)',
      misconception: '"await pauses the browser" — await pauses only this async function. The event loop keeps pumping: clicks, timers, rendering all continue while the promise is pending.',
      analogy: 'A restaurant buzzer. You get the buzzer (promise) instantly, wander off (thread continues), and get buzzed (microtask) when the food is ready.',
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
      what: "V8's scanner walks the UTF-8 buffer once, producing tokens: `Token::AWAIT`, `Token::IDENTIFIER \"fetch\"`, `Token::LPAREN`, `Token::STRING`. The parser consumes them with a recursive-descent grammar. Crucially, V8 is lazy: functions not immediately invoked only get *pre-parsed* — a quick validity scan that records scope info but builds nothing, deferring the real parse until first call.",
      why: 'Parsing is expensive (it can dominate startup on big bundles), so V8 spends effort only where code actually runs. Roughly 2x faster to pre-parse than parse.',
      component: 'V8 Scanner + Parser (v8/src/parsing/scanner.cc, parser.cc, preparser.cc)',
      layer: 'User space · JS engine, renderer main or background thread',
      abstraction: 'Flat characters → grammatical structure',
      protocol: 'ECMA-262 grammar (Annex B included, regrettably)',
      misconception: '"JavaScript is not compiled" — it is compiled at least once and possibly four times (Ignition, Sparkplug, Maglev, TurboFan). The scan/parse you are watching is a compiler frontend, full stop.',
      analogy: 'Skimming a contract: the pre-parser checks every clause is well-formed English; the full parser actually diagrams the sentences you intend to enforce.',
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
      what: 'The parser emits an AST: our line becomes an `Await` expression wrapping a `Call` whose callee is a `VariableProxy` for the unresolved name `fetch` and whose single argument is a string `Literal`. Scope analysis runs alongside — deciding that `fetch` is not any local or closure binding, so it must be looked up on the global object at runtime.',
      why: 'Every later stage — bytecode generation, optimization, even error messages with line numbers — is a walk over this tree. The AST is where "text" officially becomes "program".',
      component: 'V8 AST + scope resolution (v8/src/ast/ast.h, scopes.cc)',
      layer: 'User space · JS engine heap (zone-allocated, thrown away after codegen)',
      abstraction: 'Program as a tree of intent, stripped of syntax trivia',
      protocol: 'None — internal compiler IR',
      misconception: '"The AST is kept around while the program runs" — V8 discards it right after bytecode generation. It lives in a temporary zone allocator measured in microseconds.',
      analogy: 'The exploded-view diagram of a flat-pack shelf: not the shelf, but the structure you assemble the shelf from — recycled once assembly is done.',
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
      what: "Ignition's BytecodeGenerator walks the AST and emits compact bytecode for a *register machine* — a bank of virtual registers r0, r1… plus a special accumulator register that most instructions implicitly read or write. Our call becomes: load global `fetch`, store to a register, load the URL constant, and issue a call bytecode.",
      why: 'Bytecode is 25–50x smaller than optimized machine code and cheap to produce — perfect for code that runs once or twice, which is most code on the web.',
      component: 'Ignition BytecodeGenerator (v8/src/interpreter/bytecode-generator.cc)',
      layer: 'User space · JS engine',
      abstraction: 'A portable instruction set that exists in no silicon',
      protocol: 'None — V8 internal bytecode (changes between versions, never serialize it)',
      misconception: '"Bytecode is slow fallback code" — Ignition bytecode plus inline caches is startlingly fast, and it is the single source of truth: even deoptimized TurboFan code falls back TO this bytecode, never to source text.',
      analogy: 'IKEA pictogram instructions: not machine-specific, dense, and any worker (interpreter) or robot (compiler) can execute the same sheet.',
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
      what: 'Here is (lightly simplified) the real listing: `LdaGlobal` fetches the global `fetch` into the accumulator, `Star r1` stashes it, `CallUndefinedReceiver1 r1, r2` performs the call with one argument, and because of `await`, a `SuspendGenerator` follows — freezing register state into the closure object from chapter 1. Each `[n]` is a feedback-vector slot index; remember those.',
      why: 'Reading real bytecode demystifies the engine: there is no magic, just a small instruction set (~180 opcodes) shuffling values between registers and the accumulator.',
      component: 'Ignition bytecode array (BytecodeArray object on the JS heap)',
      layer: 'User space · JS engine heap',
      abstraction: 'Your async function as ~10 machine-agnostic instructions',
      protocol: 'None — internal representation',
      misconception: '"One line of JS = one operation" — one line became a global lookup, a constant load, a register move, a call with receiver semantics, and a full coroutine suspension.',
      analogy: 'Sheet music vs a piano roll: same tune, but the roll (bytecode) is unambiguous, mechanical, and directly playable.',
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
      what: 'Ignition "interprets" bytecode, but the interpreter itself is machine code: every bytecode has a handler generated at V8 build time (via Torque/CodeStubAssembler), and dispatch is an indirect jump through a handler table — handler executes, loads the next bytecode, jumps to its handler. Your CPU, in ring 3 (user mode), is executing real x86-64 the whole time.',
      why: 'This kills the "interpreted vs compiled" false binary: interpretation IS execution of machine code, just machine code that treats your program as data.',
      component: 'Ignition dispatch loop (Builtins_*Handler, generated from v8/src/interpreter/interpreter-generator.cc)',
      layer: 'User space · CPU ring 3',
      abstraction: 'A CPU pretending to be a different, friendlier CPU',
      protocol: 'x86-64 ISA (or ARM64) — unprivileged instructions only',
      misconception: '"JS runs in a VM, not on my CPU" — every single JS operation is retired x86-64 instructions on a physical core. The "VM" is a control-flow discipline, not a separate machine.',
      analogy: 'A simultaneous translator: the audience (CPU) only ever hears their own language (native code); the translator (interpreter) reads the foreign text (bytecode) and speaks natively, phrase by phrase.',
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
      what: 'While interpreting, V8 records type feedback into the feedback vector slots we saw as `[0]`, `[2]`: which hidden class (map) did each object have? Which target did each call site invoke? A site seeing one shape is *monomorphic* (fast), a few shapes *polymorphic*, too many *megamorphic* (gives up, generic lookup). This gossip is the fuel for the optimizer.',
      why: 'JS is dynamically typed, but real programs are boringly consistent. ICs turn observed consistency into speculative certainty.',
      component: 'Feedback vectors + inline caches (v8/src/ic/, FeedbackVector on-heap)',
      layer: 'User space · JS engine heap',
      abstraction: 'A profiler built into every call site and property access',
      protocol: 'None — internal heuristics',
      misconception: '"V8 optimizes your code by reading it" — it optimizes by *watching it run*. Cold code is never optimized no matter how cleverly written; hot code with chaotic types cannot be.',
      analogy: 'A barista noting that the 8am customer orders the same flat white daily — by Friday the cup is ready before they speak. A new order (type change) forces the slow path again.',
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
      what: 'If loadProducts (or code around it) runs hot, V8 tiers up: Sparkplug (baseline machine code, no types), then Maglev, then TurboFan — which reads the bytecode *plus* the feedback vectors and builds a sea-of-nodes graph, speculating: "fetch is always this function; res is always this map". It runs typer, redundancy elimination, escape analysis, and instruction selection — on a background thread, while Ignition keeps interpreting the same function.',
      why: 'Speculative compilation is the only way a dynamic language reaches near-native speed: assume the observed types, verify cheaply, bail out if wrong.',
      component: 'TurboFan (v8/src/compiler/), concurrent compilation on the compiler dispatcher thread',
      layer: 'User space · Background thread',
      abstraction: 'Betting machine code on the future looking like the past',
      protocol: 'None — internal',
      misconception: '"The JIT compiles everything eventually" — over 90% of typical web code only ever runs in Ignition/Sparkplug. TurboFan is reserved for proven-hot functions; compiling everything would cost more than it saves.',
      analogy: 'A courier who, after a week of identical routes, memorizes one optimal path — and keeps a fallback map in the glovebox for the day a bridge closes.',
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
      explain: 'TurboFan code guards its speculations with cheap type checks. A failed check triggers deopt: the frame is reconstructed for Ignition, feedback updates, and the function may later be re-optimized with the new reality baked in.'
    },
    explain: {
      what: 'TurboFan emits raw x86-64 into executable memory: property loads become single MOVs at fixed offsets, the call to fetch becomes a direct call. But every speculation is guarded — a one-instruction map check before that MOV. If a guard fails, *deoptimization* fires: the optimized frame is translated back into an Ignition frame mid-flight and execution continues in the interpreter, correctness intact.',
      why: 'Deopt is the safety net that makes speculation legal. Without a sound fallback path, a JIT for JS could only make conservative (slow) assumptions.',
      component: 'TurboFan codegen + Deoptimizer (v8/src/deoptimizer/)',
      layer: 'User space · CPU ring 3, JIT executable pages (W^X)',
      abstraction: 'Fast path with a provably-correct escape hatch',
      protocol: 'x86-64 ISA, unprivileged',
      misconception: '"Once compiled, JS is as static as C" — the machine code is tentative. One `products.legacy_field = 1` on a previously stable shape can invalidate code across the codebase.',
      analogy: 'A stunt with a hidden airbag: the trick (fast path) is real, and so is the guarantee that a miss lands you unharmed on something slower but safe.',
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
        { value: 'browser', label: 'Chrome (browser)', hint: 'fetch via Blink Web APIs → sandboxed renderer → network service process over Mojo IPC' },
        { value: 'node', label: 'Node.js', hint: 'fetch via undici on top of libuv — one process, PID 1337, talks to the kernel directly' }
      ]
    },
    explain: {
      what: 'Identical source, two very different hosts. V8 only does language; everything I/O — timers, fetch, files — belongs to the *embedder*. In Chrome that means Blink bindings, a multi-process sandbox, and a dedicated network service. In Node it means libuv and the undici HTTP client inside a single process.',
      why: 'This is the single most misunderstood boundary in JS: the runtime, not the language, decides how your code touches the outside world.',
      component: 'Embedder boundary (Chrome: Blink + //services/network · Node: node core + libuv + undici)',
      layer: 'User space · Process architecture',
      abstraction: 'One language, pluggable universes',
      protocol: 'None — architectural decision point',
      misconception: '"Node runs JavaScript in a browser without a UI" — Node shares only V8 with Chrome. No DOM, no Blink, no renderer sandbox, entirely different event loop and networking.',
      analogy: 'The same play performed in two theaters: same script (JS), but different stagehands, rigging, and fire codes (runtime APIs).',
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
      what: 'Search ECMA-262 for "fetch": zero hits. fetch lives in the WHATWG Fetch Standard and is implemented by Blink in C++, exposed to V8 through generated IDL bindings. When our bytecode executed `LdaGlobal "fetch"`, the value it loaded was a function object whose body is native code that crosses from the JS heap into the browser.',
      why: 'The global object is the airlock between the language and the platform. Everything interesting — DOM, timers, storage, network — enters JS through it.',
      component: 'Blink Fetch API (third_party/blink/renderer/core/fetch/) + V8 IDL bindings',
      layer: 'User space · Renderer process, Blink side',
      abstraction: 'Platform capabilities disguised as ordinary functions',
      protocol: 'Fetch Standard (fetch.spec.whatwg.org)',
      misconception: '"fetch is part of the JS language, like Array" — Array is ECMA-262; fetch is a host API. That is why Node needed to *add* it (v18, via undici) decades after the language existed.',
      analogy: 'A hotel room phone: the handset (fetch) is in your room, but dialing 0 connects to hotel staff (browser internals) who do things no guest is allowed to do directly.',
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
      what: 'The renderer main thread runs one loop: take a task (input event, timer, parsing), run it to completion, then drain the *entire* microtask queue, maybe render, repeat. Promise reactions — including resuming our suspended loadProducts — are microtasks: they run after the current task but before the next one, with priority over rendering and timers.',
      why: 'This ordering is why await-heavy code stays responsive, and also why a microtask loop can freeze a page harder than any setTimeout storm — microtasks starve everything.',
      component: 'Blink scheduler + V8 microtask queue (base::sequence_manager, MicrotaskQueue)',
      layer: 'User space · Renderer main thread',
      abstraction: 'Cooperative multitasking with two priority classes',
      protocol: 'HTML Standard §8.1 event loops (html.spec.whatwg.org)',
      misconception: '"setTimeout(fn, 0) runs immediately after the current code" — every pending microtask (all settled promise chains) runs first, and the timer task also waits for the loop to come around, with 4ms clamping in nested cases.',
      analogy: 'A doctor who, after each appointment (task), first answers every sticky note on the door (microtasks) before calling the next patient — and only tidies the room (render) between patients.',
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
      what: 'The renderer (PID 4821) is sandboxed: seccomp-bpf filters forbid it from calling socket() or connect() at all — a compromised tab must not own a network stack. So Blink serializes the request (URL, method, headers, options) into a Mojo message and sends it over a shared-memory message pipe to the *network service*, a separate utility process (PID 4903) that does all actual networking for every tab.',
      why: 'Process isolation converts "renderer exploited" from "attacker owns your network" into "attacker is stuck in a box". The cost is an IPC hop on every request — a deliberate trade.',
      component: 'Mojo IPC + services/network (URLLoaderFactory::CreateLoaderAndStart)',
      layer: 'User space · Cross-process IPC (UNIX domain socket + shared memory)',
      abstraction: 'A function call that happens to cross a security boundary',
      protocol: 'Mojo (Chromium IPC), message pipes over socketpair(2)',
      misconception: '"The tab process opens the TCP connection" — the renderer literally cannot: its seccomp sandbox rejects socket syscalls. Only the network service (and browser process) hold that privilege.',
      analogy: 'A bank teller behind glass: you (renderer) fill out a slip (Mojo message) and pass it through the tray; only staff (network service) touch the vault (sockets).',
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
      what: 'In the Node path there is exactly one process: node, PID 1337. It embeds the same V8 that just compiled our function, but the embedder API surface is Node core: no DOM, no sandbox, no separate network process. `fetch` has been a global since Node 18 (stable in 21), implemented in JavaScript by undici, not in C++ by Blink.',
      why: 'Server runtimes optimize for throughput and direct kernel access, not for containing hostile web pages — so the multi-process armor is simply absent.',
      component: 'Node.js core (lib/internal/, node_bootstrap) embedding V8',
      layer: 'User space · Single process, PID 1337',
      abstraction: 'The same engine wearing a server uniform',
      protocol: 'None — runtime architecture',
      misconception: '"Node is single-threaded" — the JS thread is single, but PID 1337 also runs a libuv worker pool (default 4 threads) plus V8 GC and compiler threads. `top -H -p 1337` shows a dozen threads.',
      analogy: 'The same chef (V8) moving from a hotel with room service protocols (Chrome) to a food truck (Node): fewer safety rails, direct access to the flame.',
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
      what: 'libuv runs the loop phases — timers, pending callbacks, poll (epoll_wait on Linux), check (setImmediate), close — and owns a small worker thread pool. Network sockets are fully non-blocking via epoll, but two things secretly run on pool threads: filesystem calls and, importantly for us, `getaddrinfo` DNS lookups, because glibc offers no true async resolver interface.',
      why: 'Everything scalable about Node reduces to this: one thread multiplexing thousands of non-blocking sockets through epoll, with blocking work exiled to the pool.',
      component: 'libuv (deps/uv/, uv__io_poll → epoll_wait; uv_getaddrinfo → threadpool)',
      layer: 'User space · Event loop thread + worker pool',
      abstraction: 'Turning "wait for any of 10,000 things" into one blocking call',
      protocol: 'None — epoll(7), POSIX threads underneath',
      misconception: '"Node never blocks" — DNS via dns.lookup()/fetch defaults to getaddrinfo on a 4-thread pool. Four slow DNS lookups (unreachable resolver, 5s timeouts) block the pool and stall fs.readFile too. dns.resolve() uses c-ares and avoids the pool.',
      analogy: 'A restaurant with one maître d’ (event loop) watching every table via a pager board (epoll), and four runners (threadpool) sent out for anything requiring a walk.',
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
      what: 'undici (an HTTP/1.1 client written in JS, named after Italian for 11) implements the WHATWG fetch spec on top of Node sockets: its Agent keeps per-origin connection pools, its own llhttp-based parser reads responses, and it speaks keep-alive and pipelining. Our fetch call lands in undici, which asks: do I have a pooled connection to api.shop.dev:443? No → resolve DNS, open a TCP socket, do TLS. From here, both runtime branches converge: someone must resolve a name and connect a socket.',
      why: 'Implementing HTTP in JS (not C++) made the client hackable, testable (MockAgent), and spec-faithful — and it still outruns the old http module thanks to pooling discipline.',
      component: 'undici (deps/undici/, Agent → Pool → Client → net.Socket/TLSSocket)',
      layer: 'User space · Node process, JS + net bindings',
      abstraction: 'A browser-grade fetch grown in a server lab',
      protocol: 'HTTP/1.1 (RFC 9112) client behavior, Fetch Standard semantics',
      misconception: '"Node fetch is just a wrapper over http.request" — it is a from-scratch client with different pooling, different defaults (no CORS, no cookies jar), and notably faster header parsing via llhttp.',
      analogy: 'A courier company that reuses warm delivery routes (pooled keep-alive connections) instead of hiring a new driver per parcel.',
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
      what: 'Inside the network service (undici Agent in the Node branch), the request becomes a concrete object: method GET, url https://api.shop.dev/products?limit=20, and assembled headers — Host: api.shop.dev, User-Agent, Accept, Accept-Encoding: gzip, deflate, br, plus cookie and credentials policy. A URLLoader drives it through a pipeline of checks before any socket work is allowed.',
      why: 'Everything the server will eventually read is fixed here, in user space, long before encryption or transmission. Request bugs are almost always born at this desk.',
      component: 'net::URLRequest + URLLoader (Chromium //net, //services/network)',
      layer: 'User space · Network service process',
      abstraction: 'The request as a checklist, not yet a message',
      protocol: 'HTTP semantics (RFC 9110) — not yet serialized',
      misconception: '"Headers are sent as you set them" — the stack adds, reorders, and normalizes headers (Host, Content-Length, Accept-Encoding), and forbidden headers set from JS are silently dropped per the Fetch spec.',
      analogy: 'Airport check-in before security: ticket printed, bags tagged — but you have not moved toward the gate yet.',
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
      what: 'First real optimization gate: the HTTP disk cache. The key is roughly method + URL, and since 2020 it is *partitioned* by top-level site (cache key includes shop.dev) so one site cannot probe another’s cache timing. Lookup for GET https://api.shop.dev/products?limit=20 under partition shop.dev: cold cache — MISS. Had it hit with a fresh max-age, the journey would end here in microseconds.',
      why: 'The fastest request is the one never sent. HTTP caching is the web’s primary load-shedding mechanism, honored before DNS is even considered.',
      component: 'Chromium HTTP cache (net/http/http_cache_transaction.cc, disk_cache backend)',
      layer: 'User space · Network service, disk-backed',
      abstraction: 'Memoization keyed on the request line',
      protocol: 'HTTP caching (RFC 9111)',
      misconception: '"The DNS cache and the HTTP cache are the same thing" — entirely separate: this one stores response *bodies* by URL; DNS caching (chapter 5) stores IP addresses by hostname, in different processes with different TTL rules.',
      analogy: 'Checking your fridge before ordering delivery. Empty fridge → the whole restaurant chain must now mobilize.',
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
      what: 'Before connecting, the stack consults HSTS (HTTP Strict Transport Security). Fun fact with teeth: the *entire .dev TLD* is on the hardcoded HSTS preload list shipped inside Chrome — every .dev hostname is upgraded to HTTPS before any network I/O, with no opt-out. We already asked for https://, so nothing changes, but even `http://api.shop.dev` could never produce a cleartext request.',
      why: 'HSTS closes the ssl-strip window: without preload, the very first http:// request is interceptable, and one downgrade is all an on-path attacker needs.',
      component: 'TransportSecurityState + preload list (net/http/transport_security_state_static.json)',
      layer: 'User space · Network service policy',
      abstraction: 'A promise about the future, compiled into the browser binary',
      protocol: 'HSTS (RFC 6797)',
      misconception: '"Typing https:// is what makes a site secure" — for preloaded domains the browser enforces HTTPS regardless of what you type, what a link says, or what a captive portal injects.',
      analogy: 'A club whose name is printed on the "members only" list at every door in the city — bouncers reject street clothes before you reach the club.',
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
      what: 'The stack checks its socket pools for an idle, still-alive connection in group `ssl/api.shop.dev:443` (undici: the Pool for that origin). Limits in Chrome: 6 sockets per group, 256 total. Result: zero idle sockets — this is our first request to this origin. A warm hit here would have skipped DNS, TCP, and TLS entirely; instead we must pay for all three.',
      why: 'Connection reuse is the biggest latency lever in HTTP: a warm connection saves 1 RTT (TCP) + 1 RTT (TLS 1.3) + DNS time — often 100ms+ on mobile.',
      component: 'ClientSocketPool (net/socket/transport_client_socket_pool.cc) · undici Pool',
      layer: 'User space · Network service',
      abstraction: 'Expensive things, kept warm and shared',
      protocol: 'HTTP/1.1 keep-alive (RFC 9112 §9.3) / HTTP/2 multiplexing',
      misconception: '"Each fetch() opens a connection" — browsers aggressively reuse: with HTTP/2 a single connection carries ALL concurrent requests to an origin. The 6-connection limit is an HTTP/1.1-era artifact you mostly never hit anymore.',
      analogy: 'Taxi rank outside a station: if a cab is waiting (idle socket), you leave in seconds; empty rank means calling dispatch (DNS) and waiting for a car to drive over (TCP+TLS).',
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
      what: 'Last gate: proxy resolution. The service checks configured proxies and PAC scripts (and WPAD if enabled) — result here: DIRECT, no proxy. Now the plan is fixed, and it is the expensive one: (1) resolve api.shop.dev to an IP, (2) open a TCP connection to it on port 443, (3) negotiate TLS, (4) only then transmit HTTP. Chrome will also race an early DNS+TCP preconnect; either way, chapter 5 is DNS.',
      why: 'A proxy would replace steps 1–2 with "connect to the proxy instead" — which is why proxy misconfiguration breaks networking so *early* and so completely.',
      component: 'ProxyResolutionService (net/proxy_resolution/) → HttpStreamFactory job controller',
      layer: 'User space · Network service',
      abstraction: 'Planning the route before starting the engine',
      protocol: 'PAC (proxy auto-config), else none',
      misconception: '"The browser just connects to the URL" — it connects to whatever proxy policy says, which in corporate fleets is rarely the origin. Half of enterprise "the internet is down" is a dead PAC endpoint.',
      analogy: 'Checking whether company policy makes you ship packages via the internal mailroom (proxy) or lets you drive to the post office yourself (DIRECT).',
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
      what: 'Name resolution starts on the laptop. The stub resolver path (glibc getaddrinfo, or Chrome’s built-in async resolver) consults /etc/nsswitch.conf — `hosts: files resolve dns` — meaning: try /etc/hosts first (no entry for api.shop.dev), then systemd-resolved, the local caching daemon listening on 127.0.0.53, which holds a per-machine DNS cache and forwards misses to the configured upstream: 1.1.1.1.',
      why: 'This chain — files, local cache, upstream — exists so that the common case never leaves the machine. Understanding it explains 90% of "DNS works in dig but not in my app" mysteries (dig skips nsswitch entirely).',
      component: 'glibc NSS + systemd-resolved (stub listener 127.0.0.53, /etc/nsswitch.conf, /etc/hosts)',
      layer: 'User space · Local resolution chain',
      abstraction: 'Ask the nearest person who might know before phoning the library',
      protocol: 'NSS (glibc), DNS (RFC 1035) toward upstream',
      misconception: '"The OS just sends DNS queries to 8.8.8.8 or whatever" — several layers may answer first: /etc/hosts, resolved’s cache, an mDNS responder for .local. Tools that bypass nsswitch (dig, nslookup) can disagree with apps that honor it.',
      analogy: 'Looking for a phone number: your fridge sticky notes (/etc/hosts), then your own address book (resolved cache), and only then calling directory services (1.1.1.1).',
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
        { value: 'hit', label: 'Cache HIT', hint: 'someone resolved this recently — instant answer, zero packets, skip to the syscall' },
        { value: 'miss', label: 'Cache MISS', hint: 'cold name — walk the full hierarchy: resolver → root → TLD → authoritative' }
      ]
    },
    explain: {
      what: 'systemd-resolved keys its cache on (name, type): api.shop.dev IN A. If a previous lookup stored an answer whose TTL has not expired, resolution completes in microseconds without a single packet. If not, we must ask 1.1.1.1 — and possibly it must ask the root, the .dev TLD, and Cloudflare’s authoritative servers.',
      why: 'DNS is the most aggressively cached system humanity operates: without caching at every hop, thirteen root server letters would need to answer for every page load on Earth.',
      component: 'systemd-resolved cache (per name+type, TTL-bounded)',
      layer: 'User space · Local DNS cache',
      abstraction: 'Memoization with an expiry date set by the data owner',
      protocol: 'DNS (RFC 1034/1035), TTL semantics',
      misconception: '"DNS lookup happens on every request" — after one cold lookup, subsequent requests hit some cache (browser, resolved, or recursive) until TTL expiry. That first cold lookup is what you pay after deploys and cache flushes.',
      analogy: 'Asking for directions: if you asked five minutes ago, you just recall it (hit). If it has been a year, you ask again — and the answer might have changed (TTL expiry exists because buildings move).',
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
      what: 'resolved finds api.shop.dev IN A in its cache: 104.18.32.7, stored 179 seconds ago with TTL 300 → still valid for 121 more seconds. The answer returns to the caller in ~50 microseconds. No socket, no packet, no router — the entire global DNS apparatus stays asleep. Next stop: the socket() syscall, armed with an IP.',
      why: 'This is the payoff of TTL-based caching: the second, third, and thousandth lookup cost effectively nothing, and the authoritative operator chose exactly how stale "nothing" is allowed to be.',
      component: 'systemd-resolved in-memory cache',
      layer: 'User space · Local daemon',
      abstraction: 'A shelf-life-labeled fact',
      protocol: 'DNS TTL semantics (RFC 1035 §3.2.1)',
      misconception: '"Cached DNS answers might be stale forever" — caches MUST evict at TTL expiry. What CAN linger: browser-internal caches with their own clamps (Chrome caps entries at 60s precisely to limit this) and negative caches holding NXDOMAIN.',
      analogy: 'Milk with a printed date: the store (authoritative server) decides the expiry; your fridge (cache) is trusted to serve it only until then.',
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
      what: 'Cache MISS — resolved builds a real wire message: a 12-byte DNS header with transaction ID 0x8f3a (random, anti-spoofing) and the RD flag set, plus one question: api.shop.dev, class IN, type A. It goes in a UDP datagram from a *randomized* source port (48213) to 1.1.1.1:53. An AAAA query for IPv6 is fired in parallel — Happy Eyeballs starts at the resolver.',
      why: 'UDP fits DNS: one question, one answer, no connection state — retry logic lives in the resolver. TXID + source-port randomization are what stand between you and Kaminsky-style cache poisoning.',
      component: 'systemd-resolved query engine (DnsTransaction, sd-resolve)',
      layer: 'User space builds it · will cross every layer below (OSI L7 payload in L4 UDP)',
      abstraction: 'A question small enough to fit in one datagram',
      protocol: 'DNS over UDP (RFC 1035), EDNS(0) (RFC 6891)',
      misconception: '"DNS always uses UDP" — TCP is mandatory-to-support and used on truncation (TC bit) and for zone transfers; and modern stubs increasingly speak DoT (853) or DoH (443/HTTPS) instead, precisely to encrypt this very packet.',
      analogy: 'A stamped postcard with a random serial number: anyone can read it in transit (plain DNS!), and the serial is how you match the reply to your question.',
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
      what: 'The datagram leaves the laptop, gets NATed at the home router (source becomes 203.0.113.77), and rides the ISP toward 1.1.1.1 — an *anycast* address: BGP advertises it from 300+ Cloudflare data centers, and routing physics deliver us to the nearest one, maybe 5–8ms away. Fire and forget: if no answer in ~5s, resolved retransmits or fails over.',
      why: 'Anycast turns "one IP" into "the closest of hundreds of sites" with zero client configuration — it is how a public resolver can serve the planet at single-digit millisecond medians.',
      component: 'The Internet, briefly — and Cloudflare anycast edge',
      layer: 'On the wire · OSI L3/L4 transit',
      abstraction: 'One address that means "whichever of us is nearest"',
      protocol: 'DNS over UDP in transit; BGP anycast underneath',
      misconception: '"1.1.1.1 is a big server somewhere" — it is hundreds of sites answering as the same IP. Two queries from two cities hit different machines; even two queries from one city can, mid-failover.',
      analogy: 'Dialing a national emergency number: same digits everywhere, but you always reach the *local* dispatch center.',
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
      what: 'Cloudflare’s resolver checks its own colossal shared cache — warmed by millions of users. Today: expired or never seen. So it must *recurse*: walk the DNS hierarchy from the top on our behalf. Modern touch: with QNAME minimization (RFC 9156) it will not tell the root servers the full name — it asks each level only for the next label it needs.',
      why: 'Recursion is the resolver’s job description: the stub asked one question with RD=1 and will accept only a final answer; all the iterative legwork happens here.',
      component: 'Cloudflare recursive resolver (knot-resolver lineage), cache + iterator',
      layer: 'Remote infrastructure · Resolver data center',
      abstraction: 'A librarian who chases citations so you do not have to',
      protocol: 'DNS iterative resolution (RFC 1034 §5), QNAME minimization (RFC 9156)',
      misconception: '"The resolver knows where every domain lives" — it knows one thing cold: where the root servers are (a compiled-in hints file). Everything else is discovered, then cached with TTLs.',
      analogy: 'A reference librarian holding only the master index (root hints): from there it is card catalog → floor → shelf, and they photocopy each pointer for next time.',
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
      explain: 'Root servers are authoritative ONLY for the root zone: the list of TLD delegations. They never recurse and never know about individual domains — they answer every question with "ask the .dev servers, here they are", plus glue addresses.'
    },
    explain: {
      what: 'The resolver asks a root server — logically one of 13 letters, a through m.root-servers.net, physically ~1900 anycast instances worldwide. Thanks to QNAME minimization it asks only: `dev. IN NS?`. The root does not know api.shop.dev and never will; it replies with a *referral*: the NS records for the .dev TLD plus glue A records, TTL 172800 (2 days).',
      why: 'The hierarchy exists so no single system needs the whole namespace: the root delegates ~1500 TLDs, each TLD delegates millions of domains. Referrals are the edges of that tree.',
      component: 'Root server system (a–m.root-servers.net, 12 operators, anycast; root zone signed by ICANN KSK)',
      layer: 'Remote infrastructure · DNS hierarchy apex',
      abstraction: 'A tree walked one delegation at a time',
      protocol: 'DNS iterative referral (RFC 1034), DNSSEC-signed root zone',
      misconception: '"There are literally 13 root servers, so DDoSing 13 boxes kills the internet" — 13 is an ancient UDP-packet-size limit on *names*. Behind them: ~1900 anycast instances, and caches mean the internet would coast for days even if all were unreachable.',
      analogy: 'The lobby directory of an infinite office tower: it lists only which floor each company is on (TLD referral) — never the person you actually want.',
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
      what: 'Next rung: the .dev TLD servers, operated by Google Registry (Charleston Road Registry — .dev is the TLD that ships HTTPS-only by policy). Asked for shop.dev, they consult the registry zone and return another referral: shop.dev is delegated to Cloudflare’s nameservers, chad.ns.cloudflare.com and uma.ns.cloudflare.com, TTL 86400. Still no IP address for api — one more hop.',
      why: 'The TLD layer is where domain *registration* becomes technically real: buying shop.dev means precisely "the registry writes your NS records into the .dev zone".',
      component: '.dev TLD authoritative servers (Google Registry / Charleston Road Registry, ns-tld1..5)',
      layer: 'Remote infrastructure · DNS second tier',
      abstraction: 'The registry as a routing table for authority',
      protocol: 'DNS referral (RFC 1034), DNSSEC delegation (DS records)',
      misconception: '"My registrar hosts my DNS" — the registrar merely files your NS records with the registry. Your actual DNS answers come from whoever runs those NS targets (here: Cloudflare), which you can change without changing registrar.',
      analogy: 'The floor receptionist: does not know the person you want either, but points to the exact suite (Cloudflare NS) that keeps its own staff directory.',
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
      what: 'Finally: chad.ns.cloudflare.com is *authoritative* for shop.dev — it holds the zone itself. It answers with the AA bit set: api.shop.dev. 300 IN A 104.18.32.7. Note both facts in one record: the address is a Cloudflare anycast edge IP (the record is proxied — orange cloud), and the TTL is 300 seconds, Cloudflare’s standard for proxied records. This is the ground truth every cache upstream will now hold.',
      why: 'Authority is the root of trust in DNS (DNSSEC formalizes it with signatures): every cached copy anywhere ultimately traces to an AA answer like this one.',
      component: 'Cloudflare authoritative DNS (chad/uma.ns.cloudflare.com, anycast)',
      layer: 'Remote infrastructure · DNS leaf authority',
      abstraction: 'The single writable source in a world of copies',
      protocol: 'DNS authoritative answer (RFC 1035), AA bit; DNSSEC RRSIG if signed',
      misconception: '"DNS gave us the server’s address" — it gave us Cloudflare’s *edge*. The origin (198.51.100.10) stays hidden behind the proxy; the browser will never learn it. DNS answers are whatever the zone owner wants them to be.',
      analogy: 'The suite’s own receptionist finally saying "yes, she works here — but all visitors go through the front-desk escort" (the proxy IP, not the office door).',
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
      what: 'The resolver sends our answer back — TXID 0x8f3a and destination port 48213 both matching what we sent, which is precisely what makes off-path forgery hard. And the whole path just got smarter: 1.1.1.1 cached the A record (plus the root and TLD referrals), systemd-resolved caches it for 300s, and Chrome’s own host cache keeps it briefly too (clamped ≤60s). The next person asking anywhere near us gets a hit.',
      why: 'One cold lookup subsidizes thousands of warm ones. This return trip is the moment the global cache hierarchy gets written.',
      component: 'Response validation + cache insertion (resolved DnsTransaction, Chrome HostCache)',
      layer: 'On the wire, then user space caches · OSI L7 over L4',
      abstraction: 'Answers propagating as copies with countdown timers',
      protocol: 'DNS (RFC 1035); spoofing resistance per RFC 5452',
      misconception: '"flushing my local DNS cache gets me fresh data" — resolved forgets, but 1.1.1.1 still holds the old record until ITS TTL runs out. You cleared the sticky note, not the library’s card catalog.',
      analogy: 'A relay of librarians walking your answer back, each photocopying it for their own desk — every copy stamped "discard after 300 seconds".',
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
      what: 'Pause. Every DNS packet in this chapter — stub→resolver, resolver→root, →TLD, →authoritative, and each reply — was itself a real packet that traversed a full network stack TWICE: built by a user-space process, pushed through a kernel (socket → UDP → IP → netfilter → routing → qdisc → driver → NIC), across cables and routers, then UP a receiving kernel on the far side. Roughly eight complete traversals of everything chapters 6–10 are about to show you, just to learn one integer: 104.18.32.7.',
      why: 'This is the recursive beauty of the stack: the machinery is so uniform that we can zoom into ONE packet (our TCP SYN, next) and you will understand what happened to all of these too.',
      component: 'Every layer at once',
      layer: 'All of them — that is the point',
      abstraction: 'Turtles all the way down, but the turtles are identical',
      protocol: 'DNS riding on UDP riding on IP riding on Ethernet — the full lasagna',
      misconception: '"DNS is a lookup in some global table that just… happens" — there is no table and no magic: only packets, caches, and fifteen thousand kilometers of glass, each hop paying full kernel fare on both ends.',
      analogy: 'Asking a friend for a restaurant address and ignoring that your text messages each crossed cell towers, fiber backbones, and four data centers. The question rode the same roads the dinner trip will.',
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
      what: 'With an IP in hand, the network code needs a socket — and user space cannot create one. It calls the libc wrapper socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, IPPROTO_TCP). glibc does almost nothing here: it loads the syscall number 41 into rax, arguments into rdi/rsi/rdx per the x86-64 System V ABI, and executes one instruction. (Chrome and Go famously bypass much of libc; Node uses it via libuv.)',
      why: 'libc is a thin, well-documented shim over an ABI contract. Knowing it is thin is what lets you read strace output and see your program’s intent one-to-one.',
      component: 'glibc syscall wrappers (sysdeps/unix/sysv/linux/, syscall-template.S)',
      layer: 'User space · CPU ring 3, C library',
      abstraction: 'A C function signature stretched over a hardware trap',
      protocol: 'x86-64 System V ABI syscall convention',
      misconception: '"libc implements sockets" — libc implements *asking the kernel* for sockets. All state, buffers, and TCP logic live in the kernel; libc contributes register shuffling and errno bookkeeping.',
      analogy: 'The form on the government office counter: the clerk behind the glass does the work, the form just gets your request into the right boxes.',
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
      what: 'One instruction, two bytes: 0F 05. The CPU saves RIP into rcx and RFLAGS into r11, loads the kernel entry point from the MSR_LSTAR model-specific register (set at boot to entry_SYSCALL_64), masks flags via MSR_SFMASK, and jumps — all in hardware, no memory lookup, no interrupt vector. This is the door between your program and the operating system.',
      why: '`syscall` replaced the old `int 0x80` software interrupt precisely because it is fast: no IDT walk, no stack switch by microcode — just MSR-driven control transfer.',
      component: 'x86-64 SYSCALL instruction + MSR_LSTAR / MSR_STAR / MSR_SFMASK',
      layer: 'Hardware boundary · leaving ring 3',
      abstraction: 'A hardware-enforced doorway with exactly one address',
      protocol: 'x86-64 ISA (Intel SDM Vol. 2B, SYSCALL/SYSRET)',
      misconception: '"System calls are just function calls into kernel code" — a plain `call` into kernel memory faults instantly. Only this instruction (or a trap/interrupt) can legally raise privilege, and it lands only where MSR_LSTAR says.',
      analogy: 'An airlock with one button: you cannot walk into the clean room, and pressing the button always deposits you at the same reception desk.',
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
      explain: 'Ring 0 exists to arbitrate shared resources. One NIC, one port space, one set of routing tables serve every process; if user space could program them directly, any process could hijack port 443, read another process’s packets, or DMA over kernel memory.'
    },
    explain: {
      what: 'The CPU’s Current Privilege Level flips from 3 to 0. Everything changes: privileged instructions unlock, kernel-only pages become readable (under KPTI, an entirely different page table is loaded via CR3), and execution continues on the kernel stack for this thread. Same core, same process context — but now the code running is the kernel, acting on our behalf.',
      why: 'This boundary is the fundamental security architecture of every modern OS. Everything a program cannot be trusted to do alone happens on the other side of it.',
      component: 'x86-64 protection rings + KPTI page-table isolation',
      layer: 'Hardware · CPU privilege model, kernel space begins',
      abstraction: 'One CPU wearing two hats, switched by hardware',
      protocol: 'x86-64 protection model (rings 0–3; 1 and 2 unused by Linux)',
      misconception: '"Switching to kernel mode is a context switch" — no! Same process, same address space (mostly), same thread. A *context switch* swaps to a different task and costs microseconds; a mode switch costs tens of nanoseconds.',
      analogy: 'A nurse becoming a surgeon by stepping through the scrub room: same person, same hospital, but now authorized to hold the scalpel — and bound by stricter rules.',
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
      what: 'The kernel’s entry stub runs: `swapgs` swaps the GS base to the per-CPU kernel area (so `current` and per-CPU variables resolve), the stack pointer switches to this thread’s kernel stack, user registers are pushed into a `struct pt_regs`, and with KPTI the CR3 register is rewritten to the kernel page tables. Only then is it safe to call C code.',
      why: 'This assembly is some of the most security-critical in Linux: getting entry/exit wrong (as several CVEs did) means user-controlled state leaking into kernel context.',
      component: 'arch/x86/entry/entry_64.S — entry_SYSCALL_64, do_syscall_64',
      layer: 'Kernel space · Architecture entry code',
      abstraction: 'Establishing a trustworthy execution environment from scratch',
      protocol: 'Linux x86-64 syscall ABI',
      misconception: '"The kernel runs on the same stack as my program" — every thread has TWO stacks: the user stack and a separate kernel stack (16KB by default). Kernel code never trusts or touches the user stack pointer.',
      analogy: 'A courtroom: before proceedings begin, everyone is searched, seated at official benches, and the official record (pt_regs) is opened — nothing from outside is taken at face value.',
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
      what: 'do_syscall_64 validates the number in rax (41) against the table size, then calls sys_call_table[41] — which is `__x64_sys_socket`. Before that, seccomp filters run: this is exactly where a sandboxed Chrome *renderer* would have been killed with EPERM/SIGSYS for daring to call socket. Our network service process (PID 4903) has a policy that permits it.',
      why: 'A flat array of ~450 function pointers is the entire kernel API surface — small, auditable, and the natural chokepoint for sandboxing (seccomp), auditing, and tracing.',
      component: 'do_syscall_64 + sys_call_table (arch/x86/entry/syscall_64.c, syscalls/syscall_64.tbl)',
      layer: 'Kernel space · Syscall dispatch',
      abstraction: 'The kernel as a numbered menu of ~450 services',
      protocol: 'Linux syscall numbering (stable ABI — numbers are never reused)',
      misconception: '"Syscall numbers are the same everywhere" — 41 is socket on x86-64 but something else entirely on i386 (which multiplexes via socketcall) and on ARM64. Static binaries and seccomp policies are architecture-specific for this reason.',
      analogy: 'Room service by number: dial 41 for a socket, 42 to connect, 1 to write. The menu never renumbers, or every existing binary would order the wrong dish.',
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
      what: 'The kernel now executes *on behalf of* PID 4903: the macro `current` points at that task_struct, so credentials, namespaces, cgroup limits, and the fd table it will allocate from are all this process’s. Critically, this is **process context** — the code may sleep, take mutexes, and be preempted. Later, when packets arrive, kernel code runs in *interrupt* context where sleeping is forbidden.',
      why: 'Process vs interrupt context is the dividing line for what kernel code is allowed to do — the source of half of all kernel-development bugs and of the softirq design in chapter 23.',
      component: 'task_struct / `current` (include/linux/sched.h), per-CPU current_task',
      layer: 'Kernel space · Scheduling context',
      abstraction: 'The kernel as a contractor doing work billed to your process',
      protocol: 'None — kernel execution model',
      misconception: '"Kernel code runs as a separate process" — mostly it does not. Time spent here is charged to PID 4903 as *system* time; `top` shows it under %sy for that very process.',
      analogy: 'A lawyer acting under power of attorney: their actions are legally yours, billed to your account, constrained by your permissions.',
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
      what: 'A round-trip user→kernel→user is roughly 50–100ns on modern x86-64: ~25ns of raw instruction cost, plus KPTI page-table switches (2 CR3 writes, TLB pressure), plus Spectre mitigations (retpolines, IBPB). Cheap in isolation — but a server doing 500k syscalls/sec is burning entire cores on doorway traffic alone.',
      why: 'This number is the economic reason behind io_uring, sendfile, mmap-based I/O, and kernel-bypass stacks like DPDK. All of them are answers to "the door is fast, but not free".',
      component: 'CPU pipeline + KPTI + spectre_v2 mitigations',
      layer: 'Hardware · Cost accounting',
      abstraction: 'Safety has a price, quoted in nanoseconds',
      protocol: 'None',
      misconception: '"System calls are expensive, so avoid them" — mode switches are ~100ns; the truly expensive things are *blocking* (microseconds to milliseconds) and context switches (~1–5μs). Optimize the waiting, not the doorway, unless you are at millions/sec.',
      analogy: 'A revolving door: two seconds each pass. Irrelevant for one person, catastrophic for a stadium exiting through it.',
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
      what: 'The generic socket layer takes over. sock_create validates the family, then looks up AF_INET in the `net_families` array and dispatches to inet_create, which scans the `inetsw` list for a SOCK_STREAM entry — that is TCP, whose protocol operations table (tcp_prot) gets attached. The socket is being assembled from generic parts plus a protocol personality.',
      why: 'This layering is why the same read()/write() work over TCP, UDP, and UNIX sockets: one generic object, swappable protocol operations underneath.',
      component: 'net/socket.c (__sys_socket, sock_create) → net/ipv4/af_inet.c (inet_create)',
      layer: 'Kernel space · Socket layer (BSD sockets API)',
      abstraction: 'Polymorphism in C via function-pointer tables',
      protocol: 'BSD sockets API (POSIX.1-2017), TCP (RFC 9293) selected here',
      misconception: '"socket() connects to something" — it allocates a completely unconnected object. No IP, no port, no packets. connect() is a separate syscall and a separate story (two steps from now).',
      analogy: 'Buying a phone handset. It exists, it is yours, it is plugged into nothing and knows no numbers.',
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
      what: 'Two objects, forever confused: `struct socket` is the thin VFS-facing shell (ops, file, type). `struct sock` is the real protocol control block — send/receive buffers, state, backlog — and for TCP it is really the larger `struct tcp_sock` (~2KB) holding the congestion window, RTT estimators, SACK bookkeeping, and sequence numbers. Right now the TCP state machine sits in CLOSED.',
      why: 'Every TCP tunable you have ever set (rmem, wmem, congestion control) lives in these bytes, per connection. This is where memory-per-connection math comes from.',
      component: 'include/linux/net.h (struct socket) · include/net/sock.h (struct sock) · include/linux/tcp.h (tcp_sock)',
      layer: 'Kernel space · Slab-allocated protocol state',
      abstraction: 'A connection as a struct with a state machine inside',
      protocol: 'TCP state machine (RFC 9293 §3.3.2) — currently CLOSED',
      misconception: '"A socket is a file" — it *appears* as one through the VFS (hence read/write/close), but there is no filesystem inode you can path to; it is an anonymous inode whose ops are network code.',
      analogy: 'A phone handset (struct socket) versus the exchange line card that actually tracks your call (struct sock). You hold the handset; the line card holds the truth.',
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
      what: 'The socket needs a user-space handle. get_unused_fd_flags() finds the lowest free index in this process’s fd table — 42 — and fd_install() publishes the struct file there. Because we passed SOCK_NONBLOCK, O_NONBLOCK is set atomically at creation (avoiding a separate fcntl and its race). The number 42 returns in rax to user space.',
      why: 'File descriptors are the kernel’s universal capability token: an integer that grants access to a resource within one process. Everything — files, sockets, epoll, timers, signals — is reachable this way.',
      component: 'fs/file.c (get_unused_fd_flags, fd_install), files_struct/fdtable per process',
      layer: 'Kernel space · Per-process descriptor table',
      abstraction: 'A capability as a small integer',
      protocol: 'POSIX file descriptor semantics',
      misconception: '"File descriptors are global" — they are strictly per-process. fd 42 in PID 4903 and fd 42 in PID 1337 are unrelated; passing the *number* to another process is meaningless (you need SCM_RIGHTS to pass the real reference).',
      analogy: 'A coat-check ticket: the number means everything at this counter and nothing anywhere else.',
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
      what: 'The event loop must learn when fd 42 becomes writable (connection established) without blocking. epoll_ctl(3, EPOLL_CTL_ADD, 42, {EPOLLOUT|EPOLLET}) inserts an epitem into the epoll instance behind fd 3, and — the clever part — hooks a callback (ep_poll_callback) into the socket’s wait queue. When TCP later changes state, the kernel *pushes* fd 42 onto the ready list instead of anyone polling for it. The thread then parks in epoll_wait.',
      why: 'This inversion (kernel notifies, app sleeps) is what makes C10K+ possible: O(1) readiness notification regardless of how many thousands of sockets are registered.',
      component: 'fs/eventpoll.c (ep_insert, ep_poll_callback, ep_poll) — epoll(7)',
      layer: 'Kernel space · Event notification subsystem',
      abstraction: 'Do not call us, we will call you — at scale',
      protocol: 'None — Linux-specific API (kqueue on BSD, IOCP on Windows)',
      misconception: '"epoll polls the sockets" — despite the name it never polls. It registers callbacks on wait queues; readiness is delivered by whichever kernel path changes the socket, usually a softirq handling a packet.',
      analogy: 'Instead of checking the mailbox every minute for 10,000 addresses, you install a bell on each — and sit next to one bell board.',
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
      what: 'Syscall 42: connect(42, {AF_INET, 104.18.32.7:443}, 16). The kernel copies the sockaddr from user memory with copy_from_user (never trusting or dereferencing a user pointer directly), validates it, and dispatches through inet_stream_ops to tcp_v4_connect. Because the socket is O_NONBLOCK, this call will return -EINPROGRESS almost immediately — the handshake proceeds in the background.',
      why: 'copy_from_user is the hard boundary of kernel security: user memory can vanish, be unmapped, or be concurrently modified, so it is copied and validated exactly once.',
      component: 'net/socket.c (__sys_connect) → inet_stream_connect → tcp_v4_connect',
      layer: 'Kernel space · Socket layer, user↔kernel copy',
      abstraction: 'Crossing the trust boundary by value, never by reference',
      protocol: 'BSD sockets connect(2); TCP active open (RFC 9293 §3.10.1)',
      misconception: '"connect() returns when connected" — for non-blocking sockets it returns -EINPROGRESS instantly. Completion arrives as EPOLLOUT, and you must then check SO_ERROR: a *writable* socket can still be a failed one.',
      analogy: 'Handing a written address through a slot: the clerk photocopies it (copy_from_user) rather than keeping your original, which you could swap at any moment.',
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
      what: 'A TCP connection is identified by a 4-tuple, and we have three quarters of it. The kernel picks the missing source port from net.ipv4.ip_local_port_range (32768–60999): inet_hash_connect walks the range with a randomized offset, checking the bind hash for collisions, and claims **51324**. The tuple is now 192.168.1.23:51324 → 104.18.32.7:443.',
      why: 'The 4-tuple is how one machine multiplexes thousands of simultaneous conversations over one IP — and why port exhaustion is a real, countable limit.',
      component: 'net/ipv4/inet_hashtables.c (inet_hash_connect, __inet_check_established)',
      layer: 'Kernel space · TCP/IP · OSI L4 identity',
      abstraction: 'Multiplexing many conversations onto one address',
      protocol: 'TCP port semantics (RFC 9293), IANA ephemeral range',
      misconception: '"You can only have ~28,000 outbound connections" — per *destination* tuple, yes. Different destination IPs or ports each get a fresh port space, so the real ceiling is per (src IP, dst IP, dst port) combination.',
      analogy: 'Extension numbers at an office: one public phone number (your IP), thousands of simultaneous calls distinguished by extension.',
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
      what: 'Which of the laptop’s addresses should be the source? The kernel does not guess — it asks the routing table *before* sending anything: ip_route_connect finds that 104.18.32.7 matches only the default route (via 192.168.1.1 dev wlp3s0), and the preferred source address for that interface is 192.168.1.23. The 4-tuple is now complete, and the route is cached in the socket (sk_dst_cache) so every subsequent packet skips this lookup.',
      why: 'Routing decides source selection, not the other way around — the mechanism behind multihoming quirks, VPN split-tunnel behavior, and "why did my packet leave the wrong interface".',
      component: 'net/ipv4/route.c (ip_route_connect, fib_lookup), FIB trie',
      layer: 'Kernel space · OSI L3 decision',
      abstraction: 'The destination chooses your return address',
      protocol: 'IPv4 routing (RFC 1812), Linux FIB/policy routing',
      misconception: '"My machine has an IP" — it has an IP *per interface per route decision*. `ip route get` is the authoritative answer for any given destination; assumptions about "the" local IP break on VPNs and multihomed hosts.',
      analogy: 'Choosing which of your mailboxes to print as the return address, based on which post office will actually carry the letter.',
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
      what: 'tcp_v4_connect finishes wiring the socket — destination, source, port, cached route — then calls tcp_set_state(sk, TCP_SYN_SENT) and arms the retransmission timer. The connection legally exists now, half-open, waiting. connect() returns -EINPROGRESS to user space; V8’s event loop keeps running, our promise still pending, and the kernel owns the next move.',
      why: 'The TCP state machine is the contract: from here only three outcomes exist — SYN-ACK (→ESTABLISHED), RST (→ECONNREFUSED), or silence (→retransmit, then ETIMEDOUT).',
      component: 'net/ipv4/tcp.c (tcp_set_state) + inet_csk retransmit timer',
      layer: 'Kernel space · OSI L4 state machine',
      abstraction: 'A connection as a formally specified state machine',
      protocol: 'TCP (RFC 9293 §3.3.2, active open)',
      misconception: '"SYN_SENT means the packet was sent" — the state is set *before* transmission completes; the segment still has to be built, filtered, routed, ARP-resolved, queued, and DMAed. All of chapter 8, in fact.',
      analogy: 'Pressing dial: your phone shows "calling…" before any ring reaches the other side — and it will keep retrying on its own schedule.',
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
      what: 'tcp_connect allocates an sk_buff — the kernel’s universal packet container — with generous headroom so lower layers can prepend their headers without ever copying the payload. It writes a 20-byte TCP header plus 20 bytes of options: the Initial Sequence Number **1128394821** (randomized per RFC 6528 to resist blind injection), MSS 1460, SACK-permitted, timestamps, and window scale 7. Payload length: zero bytes.',
      why: 'The SYN is a negotiation, not a transfer: everything about how this connection will behave for its lifetime — segment size, window scaling, selective ACK — is proposed right here, once.',
      component: 'net/ipv4/tcp_output.c (tcp_connect, tcp_transmit_skb) · struct sk_buff',
      layer: 'Kernel space · OSI L4',
      abstraction: 'Reliable ordered byte stream, bootstrapped from one datagram',
      protocol: 'TCP (RFC 9293), options per RFC 7323 (WS/TS), RFC 2018 (SACK)',
      misconception: '"The SYN carries the HTTP request" — not one application byte may be sent before the handshake completes (TCP Fast Open is the narrow, cookie-gated exception). Our GET has not even been serialized yet.',
      analogy: 'A phone call opening with "can you hear me? I speak English, I can handle long sentences, and let us number our turns from 1128394821."',
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
      what: 'ip_queue_xmit prepends a 20-byte IPv4 header in front of the TCP header — no copy, just a pointer move into the reserved headroom. TTL starts at 64 (Linux default), the Don’t Fragment bit is set so Path MTU Discovery can work, protocol is 6 (TCP), and the header checksum is computed. The datagram is now 60 bytes and addressed end-to-end.',
      why: 'IP is the universal envelope: every router between here and Cloudflare will read exactly this header and nothing above it.',
      component: 'net/ipv4/ip_output.c (ip_queue_xmit, ip_local_out)',
      layer: 'Kernel space · OSI L3',
      abstraction: 'Best-effort global addressing on top of local links',
      protocol: 'IPv4 (RFC 791, updated by RFC 6864 for the ID field)',
      misconception: '"TTL is a time in seconds" — it is a hop counter, decremented once per router; it was *specified* as seconds in 1981 and no implementation ever honored that. At 0 the packet dies and an ICMP Time Exceeded comes back (that is literally how traceroute works).',
      analogy: 'A courier envelope stamped "return if not delivered within 64 handoffs" — counted in relay stations, not minutes.',
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
      what: 'Before the packet may leave, it passes NF_INET_LOCAL_OUT — one of netfilter’s five hook points where registered callbacks may accept, drop, queue to user space, or mangle it. Locally generated traffic traverses LOCAL_OUT then POSTROUTING; forwarded traffic instead goes PREROUTING → FORWARD → POSTROUTING. Every firewall, NAT, container network, and VPN you have ever used plugs in here.',
      why: 'Netfilter is the kernel’s programmable packet policy layer. Knowing which hooks a packet crosses tells you exactly why a rule did or did not apply.',
      component: 'net/netfilter/core.c (nf_hook_slow), hook NF_INET_LOCAL_OUT',
      layer: 'Kernel space · OSI L3 policy',
      abstraction: 'Programmable interception points in the packet path',
      protocol: 'None — Linux netfilter framework',
      misconception: '"iptables INPUT blocks my outgoing traffic" — locally generated packets never touch INPUT. Outbound traffic sees OUTPUT and POSTROUTING only; blocking the *reply* is what INPUT would do.',
      analogy: 'Customs desks placed at specific corridors of an airport: which desks you pass depends entirely on whether you are departing, arriving, or transferring.',
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
      what: 'At the filter table’s OUTPUT chain the rules are evaluated in order, top to bottom, first match wins. Our SYN is checked against each: a conntrack RELATED,ESTABLISHED fast-path rule (no match — this connection is brand new), a loopback rule (no), then the chain policy: ACCEPT. On a laptop this is microseconds; on a hardened server it can be hundreds of rules deep.',
      why: 'Rule order is semantics, not style: one misplaced ACCEPT above a DROP silently opens a hole, and one DROP above your ESTABLISHED rule kills every reply.',
      component: 'net/ipv4/netfilter/ip_tables.c (ipt_do_table) — or nft_do_chain for nftables',
      layer: 'Kernel space · OSI L3/L4 filtering',
      abstraction: 'Firewall as an ordered decision list',
      protocol: 'None — iptables/nftables rule semantics',
      misconception: '"iptables is still the firewall" — on modern distros iptables is a compatibility shim over nftables (iptables-nft). `nft list ruleset` shows the truth; mixing legacy and nft backends produces genuinely invisible rules.',
      analogy: 'A bouncer with a clipboard, reading top to bottom and acting on the first line that matches — never reading further, no matter what is below.',
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
      what: 'The connection tracker creates an entry for our 4-tuple in state NEW, storing both the original direction (192.168.1.23:51324 → 104.18.32.7:443) and the expected reply direction — pre-computed so return packets are matched in O(1) by hash lookup. Until the SYN-ACK arrives the entry is UNREPLIED with a short timeout (60s); after the handshake it becomes ESTABLISHED with a famously long one (5 days by default).',
      why: 'Conntrack is what makes stateful firewalls and NAT possible: it converts "is this packet part of a conversation I allowed?" into a hash lookup.',
      component: 'net/netfilter/nf_conntrack_core.c (nf_conntrack_in), nf_conntrack_proto_tcp',
      layer: 'Kernel space · Stateful L3/L4 tracking',
      abstraction: 'Flows, reconstructed from stateless packets',
      protocol: 'None — Linux conntrack (mirrors the TCP state machine)',
      misconception: '"Conntrack is the same as the TCP socket state" — separate universes. Conntrack tracks flows even for UDP and ICMP, and on a *router* it tracks connections it does not own at all. A socket can be closed while conntrack still holds the flow in TIME_WAIT.',
      analogy: 'A doorman noting who left so he recognizes them returning — even for visitors whose apartments he has never entered.',
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
      explain: 'Longest-prefix match: 104.18.32.7 does not fall inside 192.168.1.0/24, so the only matching entry is the default route 0.0.0.0/0 (prefix length 0). Next hop = 192.168.1.1 — so the packet is addressed to Cloudflare at L3 but to the *router* at L2.'
    },
    explain: {
      what: 'The route was cached on the socket, but this is the decision that matters for the next step: the FIB (a compressed LC-trie) is searched for the longest prefix matching 104.18.32.7. The /24 does not contain it; the default route /0 does. Next hop: 192.168.1.1, dev wlp3s0. This is the moment the packet learns it must be handed to a *local machine* that is not its destination.',
      why: 'Every router on earth runs this same algorithm on this same header. Understanding L3 destination vs L2 next hop is the single most clarifying idea in networking.',
      component: 'net/ipv4/fib_trie.c (fib_table_lookup), LC-trie FIB',
      layer: 'Kernel space · OSI L3 forwarding decision',
      abstraction: 'Global reachability from purely local knowledge',
      protocol: 'IPv4 routing / longest-prefix match (RFC 1812)',
      misconception: '"The packet is addressed to the router" — only at layer 2. The IP destination stays 104.18.32.7 for the entire journey; only the Ethernet destination MAC changes at every hop. Two different addresses, two different scopes, same packet.',
      analogy: 'Mailing to Tokyo from a village: you hand it to the local post office (next hop) though the envelope says Tokyo (destination). Every office repeats that decision.',
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
      what: 'To build an Ethernet frame the kernel needs the next hop’s MAC address. The neighbour table has no valid entry for 192.168.1.1, so the entry goes INCOMPLETE and our SYN is *parked in the neighbour’s queue* while an ARP request is broadcast to ff:ff:ff:ff:ff:ff: "who has 192.168.1.1? tell 192.168.1.23". Every device on the LAN receives it; only the router should answer.',
      why: 'ARP is the glue between the logical world (IP) and the physical one (MAC). Without it, layer 3 addressing cannot be delivered by layer 2 hardware.',
      component: 'net/core/neighbour.c + net/ipv4/arp.c (neigh_resolve_output, arp_send)',
      layer: 'Kernel space · OSI L2/L3 boundary',
      abstraction: 'Shouting into the local room to translate an address',
      protocol: 'ARP (RFC 826)',
      misconception: '"ARP happens for the destination IP" — never for a remote one. You ARP only for the *next hop* on your own link. Nobody on your LAN can answer for 104.18.32.7, and nobody tries.',
      analogy: 'Standing in an open-plan office shouting "who sits at desk 1?" — everyone hears, one person answers, and you note their face for later.',
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
      what: 'The home router replies — unicast, straight back to us: 192.168.1.1 is-at a4:91:b1:0c:44:e2. The neighbour entry flips to REACHABLE (valid ~30s of idle before going STALE), and the queued SYN is released and finally handed to the neighbour output path, which stamps that MAC into the Ethernet header. The frame is now completely addressed.',
      why: 'One tiny broadcast exchange unlocked the entire connection. Its cost is why the neighbour cache exists, and why the first packet to a cold gateway is measurably slower.',
      component: 'net/ipv4/arp.c (arp_process) → neigh_update → __neigh_event_send flush',
      layer: 'Kernel space · OSI L2 resolution complete',
      abstraction: 'Cached translation from logical to physical identity',
      protocol: 'ARP reply (RFC 826)',
      misconception: '"ARP entries last until reboot" — they age out. REACHABLE decays to STALE after ~30s idle, and the next send triggers a quiet unicast re-probe. That is why intermittent LAN issues often correlate suspiciously with idle periods.',
      analogy: 'Your colleague answers "that is me at desk 1" — you write it on a sticky note, and only re-ask when the note yellows.',
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
      what: 'dev_queue_xmit hands the frame to the interface’s queueing discipline — on modern Linux, fq_codel: flow queueing plus controlled delay. It hashes the 4-tuple into one of 1024 flow queues (so our new connection cannot be starved by a bulk download), and CoDel watches how long packets *linger*, dropping or ECN-marking when sojourn time exceeds 5ms. With an idle link, our SYN is dequeued essentially immediately.',
      why: 'This is the kernel’s answer to bufferbloat: fairness between flows plus latency-aware queue management, rather than dumb FIFO buffers that fill up and add hundreds of milliseconds.',
      component: 'net/sched/sch_fq_codel.c (fq_codel_enqueue/dequeue) via net/core/dev.c dev_queue_xmit',
      layer: 'Kernel space · Traffic control (between L3 and the driver)',
      abstraction: 'Fair, low-latency scheduling of a shared link',
      protocol: 'None — Linux tc / CoDel algorithm (RFC 8289), FQ-CoDel (RFC 8290)',
      misconception: '"Bigger buffers prevent packet loss and are therefore good" — oversized buffers cause bufferbloat: TCP needs timely loss/ECN signals to find the right rate. A full 1000-packet buffer means a full second of added latency, which is worse than dropping.',
      analogy: 'A supermarket with per-customer lanes and a rule that nobody waits more than five minutes — instead of one enormous queue where the person with 200 items blocks everyone.',
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
      what: 'The qdisc dequeues and calls the driver’s ndo_start_xmit. The driver grabs the next free TX descriptor in its ring buffer, writes the DMA address and length of the sk_buff data, marks it owned-by-hardware, and rings the doorbell register. Our journey through software is over: 74 bytes of frame, describing one JavaScript line’s intent, are now the NIC’s problem. Every layer from V8 down has contributed, and not a single byte has been copied since the sk_buff was allocated.',
      why: 'This is the software/hardware boundary — the last moment the CPU touches this packet. Everything past it is descriptors, DMA, and electrical signalling.',
      component: 'Driver ndo_start_xmit (e.g. drivers/net/ethernet/intel/igc/igc_main.c, or iwlwifi for Wi-Fi)',
      layer: 'Kernel space → hardware boundary · OSI L2',
      abstraction: 'Handing memory to a device that reads RAM by itself',
      protocol: 'Ethernet II framing (IEEE 802.3); device-specific descriptor format',
      misconception: '"The CPU writes the packet to the NIC" — it writes a *descriptor*: an address and a length. The NIC then DMAs the bytes out of RAM on its own, without the CPU touching the data at all.',
      analogy: 'Leaving a parcel on the loading dock with a manifest slip. You do not carry it onto the truck; you tell the truck where it sits, and the loaders (DMA engine) do the rest.',
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
