// Packet Odyssey — component encyclopedia: one entry per node id from the content spec.
window.COMPONENTS = {
  appcode: {
    name: 'Application JavaScript',
    tagline: "The one line you wrote — and the 87 machines that rush to keep its promise",
    description: "This is the one line of code you actually wrote: ask the shop's server for a list of products. It looks like a single sentence — await fetch('https://api.shop.dev/products?limit=20') — but the moment it runs, two compilers, an operating system, your router, and a database far away all get to work keeping that little promise.",
    history: "JavaScript was famously written in ten days. In May 1995 Brendan Eich, at Netscape, shipped it as LiveScript, and marketing promptly renamed it JavaScript to ride the coattails of Java, a completely unrelated language. It was handed to a standards body as ECMA-262 in 1997 and has been growing ever since: Promises in ES2015, async/await in ES2017, and fetch() — specified by the WHATWG and shipped in Chrome 42 in 2015 — which finally retired the awkwardly named XMLHttpRequest.",
    purpose: "To let you ask for data in one plain sentence, and hand every genuinely hard part of that wish — encoding, routing, retrying, decrypting — down to the layers below.",
    responsibilities: [
      'Construct the request: URL, method, headers, body',
      'Suspend at await, yielding the thread back to the event loop',
      'Consume the eventual Response object and parse JSON',
      'Handle rejection: network errors, aborts, non-2xx statuses (which fetch does NOT reject on)'
    ],
    commands: [
      { cmd: 'node --inspect app.js', note: 'run with the V8 inspector attached; open chrome://inspect to step through your fetch call' },
      { cmd: "node -e \"fetch('https://api.shop.dev/products?limit=20').then(r => r.json()).then(console.log)\"", note: 'the entire journey, reproduced in one shell line (Node 18+)' },
      { cmd: 'npx eslint src/', note: 'static analysis catches unhandled promises before they catch you' }
    ],
    production: 'Real teams wrap fetch with timeouts (AbortController — fetch has no default timeout), retries with jittered backoff, and tracing headers (traceparent) so this one line is observable across every hop below it.',
    interview: [
      'Does fetch() reject on a 404? (No — only on network failure; check response.ok.)',
      'What happens to the thread between calling fetch and the await resuming?',
      'How would you add a timeout to fetch, and why does AbortController exist?'
    ],
    sources: ['WHATWG Fetch Standard (fetch.spec.whatwg.org)', 'ECMA-262', 'MDN: Using the Fetch API'],
    related: ['parser', 'eventloop', 'webapi']
  },
  parser: {
    name: 'V8 Parser',
    tagline: "Reads your code like a sentence — and skims the parts you may never run",
    description: "This is the part of V8 that reads your source code the way you read a sentence: first it works out where each word ends, then what the grammar means. The scanner chops the text into tokens, and the parser assembles them into an AST, a tree that captures the structure of the program, while noting which variable belongs to which scope. It is also deliberately lazy: a fast PreParser skims each function body just far enough to catch syntax errors, and leaves the real reading until the function is actually called.",
    history: "V8 was unveiled alongside Chrome on 2 September 2008, the work of a team in Aarhus led by Lars Bak, a veteran of the Self and HotSpot virtual machines. Lazy parsing and the PreParser came early, from a simple observation: a typical page ships far more code than it will ever actually run, so why pay to understand all of it?",
    purpose: "To turn a wall of characters into an organized shape the rest of the engine can reason about — and to do it as cheaply as it possibly can.",
    responsibilities: [
      'Tokenize the character stream (scanner) including string/number literal decoding',
      'Build AST nodes for full-parsed functions',
      'PreParse deferred functions: validate syntax, record scope info, skip the rest',
      'Resolve variable scopes and detect eval/with poisoning of optimizations'
    ],
    commands: [
      { cmd: 'out/x64.debug/d8 --print-ast -e "function f(a){return a+1} f(2)"', note: 'dump the AST (requires a debug build of V8/d8)' },
      { cmd: 'node --v8-options | grep -i parse', note: 'list parser-related V8 flags available in your Node build' },
      { cmd: "perf record -g node app.js && perf report --comms=node", note: 'parse time shows up as v8::internal::Parser frames during startup profiles' }
    ],
    production: 'Parse cost is startup cost: teams ship smaller bundles, use code-splitting, and rely on V8 code caching so the browser can skip re-parsing on repeat visits.',
    interview: [
      'Why does V8 pre-parse instead of fully parsing everything eagerly?',
      'What is the cost of wrapping every module in an IIFE that runs immediately?',
      'How do source maps relate to what the parser actually sees?'
    ],
    sources: ['v8/src/parsing/parser.cc', 'v8/src/parsing/scanner.cc', 'v8.dev/blog/preparser'],
    related: ['appcode', 'ast', 'ignition']
  },
  ast: {
    name: 'Abstract Syntax Tree',
    tagline: "Your program as a tree — all of the meaning, none of the punctuation",
    description: "Once your code has been read, this is what is left: a tree. Every piece of the program becomes a labeled branch — a CallExpression for the fetch(...) call, a MemberExpression for the dot in between, an AwaitExpression for await, a plain string literal for the URL. Spaces, comments and brackets are gone, because they were only ever there to help humans; what remains is pure structure, and it is what compilers, linters and bundlers all read.",
    history: "Syntax trees come from 1960s compiler theory, from the Algol era that split compilers into a front end that understands and a back end that emits. JavaScript's own family tree of ASTs — the de facto ESTree format — descends from Mozilla's SpiderMonkey Parser API around 2010-2012, which Esprima, Acorn and Babel picked up and extended into the shared shape tools speak today.",
    purpose: "To hand every tool that touches your code — interpreter, optimizer, linter, minifier — one clear, unambiguous picture of what the program actually says.",
    responsibilities: [
      'Represent every construct as typed nodes (FunctionDeclaration, CallExpression, AwaitExpression)',
      'Carry scope and position metadata for errors and source maps',
      'Serve as the input to Ignition bytecode generation',
      'Enable transforms: Babel, TypeScript, and minifiers are AST-to-AST rewrites'
    ],
    commands: [
      { cmd: "npx acorn --ecma2022 --module app.js | head -50", note: 'print an ESTree-style AST as JSON' },
      { cmd: "node -e \"console.log(JSON.stringify(require('acorn').parse('1+2', {ecmaVersion: 2022}), null, 1))\"", note: 'a two-node BinaryExpression, spelled out' },
      { cmd: 'npx eslint --print-config app.js', note: 'ESLint is an AST visitor engine; this shows what rules will walk the tree' }
    ],
    production: "Everything in a modern JS toolchain — linting, bundling, tree-shaking, coverage instrumentation — is an AST pass. Slow builds are usually too many independent parse+transform passes over the same trees.",
    interview: [
      'Why do minifiers operate on ASTs instead of regexes?',
      'What information present in source is lost in the AST, and why is that fine?',
      'How does tree-shaking use the AST to prove code is dead?'
    ],
    sources: ['v8/src/ast/ast.h', 'ESTree spec (github.com/estree/estree)', 'astexplorer.net'],
    related: ['parser', 'ignition', 'bytecode']
  },
  ignition: {
    name: 'Ignition Interpreter',
    tagline: "Every function's first home: quick to start, and quietly taking notes",
    description: "Ignition is V8's interpreter, and it is what actually runs your code the very first time. It walks the tree once and writes out bytecode — a compact list of simple instructions — then executes them on a pretend CPU with numbered registers and one special scratch slot called the accumulator. While it runs it keeps notes in feedback vectors, a record of what kinds of values really turned up at each call site, and those notes are the raw material the optimizing compiler later gambles on.",
    history: "Ignition shipped in 2016, replacing an older baseline compiler called full-codegen. The motivation was memory rather than speed: full-codegen's machine code was bloating the heap on phones, and bytecode is roughly 4-8x smaller. Together with TurboFan it completed V8's modern pipeline in 2017.",
    purpose: "To get your code running immediately with very little memory, while quietly collecting the evidence that makes real optimization possible later.",
    responsibilities: [
      'Generate bytecode from the AST in a single pass',
      'Execute bytecode via handler stubs written in TurboFan macro-assembly',
      'Record type feedback (which shapes, which targets) per call site',
      'Tier up hot functions to Sparkplug/Maglev/TurboFan; serve as the deopt landing pad'
    ],
    commands: [
      { cmd: "node --print-bytecode --print-bytecode-filter=main app.js", note: 'dump Ignition bytecode for a specific function' },
      { cmd: "node --trace-ignition -e '1+1' 2>/dev/null | head", note: 'trace bytecode execution (debug builds)' },
      { cmd: 'node --v8-options | grep -A1 interpreted-frames', note: 'inspect interpreter-related tunables' }
    ],
    production: 'Cold-start-sensitive workloads (serverless, CLIs) live mostly in Ignition; V8 snapshot and code cache features exist to skip repeated parse+bytecode work.',
    interview: [
      'Why is bytecode smaller than machine code for the same function?',
      'What is a feedback vector and who consumes it?',
      'Why does V8 interpret first instead of compiling everything eagerly?'
    ],
    sources: ['v8/src/interpreter/', 'v8.dev/blog/ignition-interpreter', 'v8/src/interpreter/bytecode-generator.cc'],
    related: ['ast', 'bytecode', 'turbofan']
  },
  bytecode: {
    name: 'V8 Bytecode',
    tagline: "LdaSmi, Star, CallProperty — your program rewritten as tiny, blunt commands",
    description: "This is your JavaScript boiled down to a list of very small, very dumb instructions, each one just a byte or a few long. LdaSmi [20] loads the number 20, Star r0 stores it into register zero, CallProperty1 calls a method with one argument. It is an invented instruction set for an invented machine, which is exactly why it runs identically on any real CPU, and every instruction carries the index of the feedback slot where the interpreter files its notes.",
    history: "The idea of portable bytecode goes back to the Pascal p-machine of the 1970s and to Smalltalk-80. V8 resisted it for its first eight years — from 2008 to 2016 it compiled straight to machine code — until memory pressure on mobile devices made Ignition's compact encoding the better bargain.",
    purpose: "To hold the meaning of your program in a form that is cheap to produce, small to keep around, and quick enough to run directly.",
    responsibilities: [
      'Represent operations with implicit accumulator semantics to keep encoding dense',
      'Reference feedback vector slots so execution and profiling stay fused',
      'Remain the source of truth a deoptimized function falls back to',
      'Feed Sparkplug, Maglev, and TurboFan as their compilation input'
    ],
    commands: [
      { cmd: "node --print-bytecode -e 'function add(a,b){return a+b}; add(1,2)' | grep -A20 'add'", note: 'see LdaNamedProperty/Add/Return sequences for a real function' },
      { cmd: 'node --print-bytecode --print-bytecode-filter=handler server.js', note: 'filter the dump to one hot function in a real app' }
    ],
    production: 'Bytecode is flushed under memory pressure (bytecode flushing, enabled since V8 8.4) and regenerated on demand — a reason long-idle lambdas can see latency spikes on first re-invocation.',
    interview: [
      'What does the accumulator register buy in encoding size?',
      'When a function deoptimizes, what does it resume executing?',
      'Why can bytecode be flushed but feedback vectors kept?'
    ],
    sources: ['v8/src/interpreter/bytecodes.h', 'v8.dev/blog/ignition-interpreter', 'v8/src/interpreter/interpreter-generator.cc'],
    related: ['ignition', 'turbofan', 'machinecode']
  },
  turbofan: {
    name: 'TurboFan Optimizing Compiler',
    tagline: "Bets on what your code usually does — and pays up honestly when it is wrong",
    description: "TurboFan is the optimizing compiler: once a function has run often enough to count as hot, it takes that function's bytecode plus the interpreter's notes and produces genuinely fast machine code. It builds the program as a graph — a sea of nodes — and rearranges it freely: inlining small functions into their callers, proving via escape analysis that some objects never outlive the function and so never need allocating at all, deleting work it can show is redundant. Every speedup is really a bet, guarded by a small check; when a check fails the code deoptimizes and execution drops calmly back into the interpreter.",
    history: "TurboFan shipped in 2015 and, together with Ignition, finished off the 2010-era Crankshaft compiler in 2017. Its sea-of-nodes representation traces back to Cliff Click's 1995 work. The ladder later grew extra rungs beneath it: Sparkplug, a fast baseline compiler, in 2021, and the mid-tier Maglev in 2023.",
    purpose: "To make a language with no type declarations run about as fast as one that has them — at least along the paths where your program behaves consistently.",
    responsibilities: [
      'Build and optimize a sea-of-nodes graph from bytecode + feedback',
      'Speculate on types/shapes and insert guard checks',
      'Inline hot callees and eliminate allocations via escape analysis',
      'Deoptimize (bail out) to Ignition when speculation fails, updating feedback'
    ],
    commands: [
      { cmd: 'node --trace-opt --trace-deopt app.js 2>&1 | head -40', note: 'watch functions get optimized and — more interesting — why they deopt' },
      { cmd: "node --allow-natives-syntax -e 'function f(x){return x+1}; f(1); %OptimizeFunctionOnNextCall(f); f(2); console.log(%GetOptimizationStatus(f))'", note: 'force optimization and query status bits' },
      { cmd: 'node --trace-turbo app.js && ls turbo-*.json', note: 'emit graphs viewable in Turbolizer' }
    ],
    production: "Deopt loops (optimize, deopt, reoptimize) are a real production pathology — usually caused by megamorphic call sites or shape churn from objects built with differing key orders. --trace-deopt is the diagnostic.",
    interview: [
      'What is a deoptimization and what triggers one?',
      'Why does changing the order of object property assignment affect performance?',
      'What does monomorphic vs megamorphic mean at a call site?'
    ],
    sources: ['v8/src/compiler/', 'v8.dev/blog/launching-ignition-and-turbofan', 'Cliff Click, "A Simple Graph-Based Intermediate Representation" (1995)'],
    related: ['ignition', 'bytecode', 'machinecode']
  },
  machinecode: {
    name: 'JIT Machine Code',
    tagline: "The actual x86-64 instructions your JavaScript turned into",
    description: "This is the finish line: real CPU instructions, written into a page of memory marked executable, and jumped straight into on the next call. It is code tailored to what your program has been doing so far, sprinkled with inline caches and guard branches that check those assumptions still hold, and the engine can throw the whole thing away at a moment's notice — on a failed guard, or when the garbage collector wants the space back.",
    history: "Compiling at runtime goes back to LC^2 in the 1960s and to the Smalltalk and Self projects at Xerox PARC and Stanford; Self's 1991 adaptive optimization is V8's direct ancestor, handed down through HotSpot and the same Lars Bak. In the 2010s security reshaped the craft: W^X policies, write XOR execute, mean a page of memory may be writable or executable but never both at once, so JIT compilers learned to flip pages back and forth.",
    purpose: "To close the loop: a flexible, dynamic language finally running at the speed of the bare metal underneath it.",
    responsibilities: [
      'Occupy V8 code space pages flipped between writable and executable',
      'Embed inline caches and guard branches to validate speculation',
      'Support on-stack replacement so hot loops swap tiers mid-execution',
      'Publish frame metadata so profilers and deopt can walk JIT frames'
    ],
    commands: [
      { cmd: 'node --perf-basic-prof app.js & perf record -F 99 -p $! -g -- sleep 10 && perf report', note: 'V8 writes /tmp/perf-PID.map so perf can symbolize JIT frames' },
      { cmd: "node --print-opt-code --code-comments -e 'for(let i=0;i<1e6;i++)Math.sqrt(i)' | head -60", note: 'dump actual optimized assembly' }
    ],
    production: 'JIT memory is a real cost: V8 code space counts against heap limits, and hardened environments (iOS, some lambdas) forbid writable+executable pages entirely, forcing interpreter-only modes.',
    interview: [
      'Why must JIT pages be marked executable, and what is W^X?',
      'How does a CPU profiler attribute samples to JavaScript function names?',
      'What is on-stack replacement and when is it needed?'
    ],
    sources: ['v8/src/codegen/', 'v8/src/heap/code-range.cc', 'Hölzle & Ungar, "Optimizing Dynamically-Dispatched Calls with Run-Time Type Feedback" (1994)'],
    related: ['turbofan', 'cpu', 'memmap']
  },
  eventloop: {
    name: 'Event Loop',
    tagline: "One worker, several to-do lists, and a very convincing illusion of doing everything at once",
    description: "JavaScript runs on a single thread, so the event loop is the small piece of bookkeeping that makes it feel like more. It takes one task off a queue, runs it all the way to the end without interruption, then empties the entire microtask queue — where promise callbacks wait — before it will so much as glance at the next task. Your await fetch() parks the rest of your function as a microtask; the loop is what eventually picks it up and carries on where you left off.",
    history: "Event-driven single-threaded interfaces are decades old, but the browser's loop was only written down rigorously in the WHATWG HTML specification from the mid-2000s onward, with the task-versus-microtask distinction formalized alongside Promises around 2013-2015. Node.js took its own version in 2009, built on libuv with named phases: timers, pending callbacks, poll, check, close.",
    purpose: "To let one thread juggle hundreds of half-finished operations at once, with no chance of two of them touching the same data at the same moment.",
    responsibilities: [
      'Dequeue and run macrotasks (events, timers, I/O callbacks) one at a time',
      'Drain microtasks completely after every task — promises always beat setTimeout',
      'Coordinate with rendering in browsers (rAF, style/layout between tasks)',
      'In Node: cycle phases and block in epoll_wait/kqueue when idle'
    ],
    commands: [
      { cmd: "node -e \"setTimeout(()=>console.log('timeout'),0); Promise.resolve().then(()=>console.log('micro')); console.log('sync')\"", note: 'prints sync, micro, timeout — the ordering contract in one line' },
      { cmd: 'strace -e epoll_wait,epoll_ctl -f node server.js 2>&1 | head', note: 'the "loop" at rest is a thread blocked in epoll_wait' },
      { cmd: "node -e \"const h=require('perf_hooks').monitorEventLoopDelay(); h.enable(); setTimeout(()=>{h.disable(); console.log(h.max/1e6+'ms')},1000)\"", note: 'measure event loop delay — the canonical Node health metric' }
    ],
    production: 'Event loop lag is the first metric to alarm on in Node services: one synchronous JSON.parse of a 50MB body stalls every request in flight. Browsers flag long tasks >50ms for the same reason.',
    interview: [
      'Explain the output ordering of setTimeout(0) vs Promise.then vs synchronous code.',
      'What is the difference between microtasks and macrotasks?',
      'How does await suspend a function without blocking the thread?'
    ],
    sources: ['WHATWG HTML spec §event-loops', 'libuv docs: Design overview', 'nodejs.org: The Node.js Event Loop'],
    related: ['appcode', 'webapi', 'libuv', 'nodejs']
  },
  webapi: {
    name: 'Web APIs',
    tagline: "The half of JavaScript that is not JavaScript at all",
    description: "fetch(), setTimeout, the DOM, WebSocket — none of these are part of the JavaScript language, and you will not find one of them in ECMA-262. They are powers the browser lends to your code, implemented in C++ inside the renderer and exposed through a thin generated bridge called bindings. When you call fetch() you hand the request across that bridge; V8 itself has never heard of a network.",
    history: "The pattern was set by XMLHttpRequest, which Microsoft built for Outlook Web Access in 1999 as an ActiveX control, Mozilla cloned, and the industry rebranded as Ajax when the term was coined in 2005. The WHATWG, founded in 2004, later specified fetch as the modern promise-based replacement in 2015.",
    purpose: "To give sandboxed, untrusted JavaScript careful and permissioned access to the real machine: the network, storage, the screen, devices.",
    responsibilities: [
      'Implement fetch per the WHATWG spec: request construction, CORS, redirects, streaming bodies',
      'Bridge V8 to Blink/browser internals via bindings (IDL-generated glue)',
      'Enforce the same-origin policy and CORS preflights before any packet exists',
      'Queue completion callbacks/microtasks back onto the event loop'
    ],
    commands: [
      { cmd: "curl -s -o /dev/null -w '%{http_code}\\n' -H 'Origin: https://evil.example' https://api.shop.dev/products", note: 'CORS is enforced by the browser, not the server — curl happily ignores it' },
      { cmd: 'chrome --user-data-dir=/tmp/profile --log-net-log=/tmp/netlog.json', note: 'capture a NetLog of every fetch the browser performs (view at netlog-viewer)' }
    ],
    production: 'CORS misconfiguration is the top "the API works in curl but not the browser" ticket. Preflight OPTIONS requests also add a full RTT unless Access-Control-Max-Age caches them.',
    interview: [
      'Is setTimeout part of JavaScript? Where does it actually live?',
      'Walk through what the browser does before fetch() sends a cross-origin POST.',
      'Why can curl call an API that the browser blocks?'
    ],
    sources: ['WHATWG Fetch Standard', 'WHATWG HTML spec §timers', 'chromium/src/third_party/blink/renderer/core/fetch/'],
    related: ['appcode', 'eventloop', 'netservice']
  },
  netservice: {
    name: 'Chrome Network Service',
    tagline: "A whole separate process, PID 4903, that owns every socket the browser has",
    description: "Chrome does not let the tab running your JavaScript touch the network at all. Networking lives in its own sandboxed process, and your fetch request travels there over Mojo, Chrome's internal messaging system, before a single packet exists. That process owns everything network-shaped: DNS lookups, the pool of open connections, the HTTP cache on disk, your cookies, and TLS.",
    history: "Chrome shipped as a multi-process browser in 2008, splitting tabs apart for crash-safety and security, but networking stayed in the privileged browser process for another decade. The long servicification effort finally moved it into a separate network service around Chrome 70 in 2018 — restartable when it crashes, and lockable behind a tighter sandbox.",
    purpose: "To keep every scrap of network state in one isolated place, so web pages stay powerless and a networking crash takes down one process instead of the whole browser.",
    responsibilities: [
      'Terminate all HTTP/HTTPS: header policy, HTTP/2 and HTTP/3 framing, redirects',
      'Own the socket pools, DNS host resolver cache, and HTTP disk cache',
      'Apply cookie policy and certificate verification for all renderers',
      'Broker each renderer request via Mojo URLLoader interfaces'
    ],
    commands: [
      { cmd: "ps -ef | grep -E 'chrome.*type=utility.*NetworkService' | head -3", note: 'find the actual network service process (our PID 4903)' },
      { cmd: 'chrome --log-net-log=/tmp/net.json --net-log-capture-mode=IncludeSensitive', note: 'record every DNS lookup, socket, and TLS handshake it performs' },
      { cmd: 'ss -tanp | grep chrome', note: 'sockets belong to the network service PID, not renderer PIDs' }
    ],
    production: 'The chrome://net-export NetLog is the definitive tool for "why is this request slow": it timestamps queueing, DNS, TCP, TLS, and TTFB per request — the waterfall behind the waterfall.',
    interview: [
      'Why does the renderer process not open sockets itself?',
      'Where does Chrome cache DNS results relative to the OS resolver?',
      'What crosses the Mojo IPC boundary for a single fetch?'
    ],
    sources: ['chromium/src/services/network/', 'chromium.org: Network Service design doc', 'chrome://net-internals'],
    related: ['webapi', 'httpcache', 'socketpool', 'stubresolver']
  },
  httpcache: {
    name: 'Browser HTTP Cache',
    tagline: "The fastest request in the world is the one that quietly becomes a disk read",
    description: "This is the browser's memory of things it has already downloaded. Chrome keeps responses on disk in the Simple Cache, keyed by URL and, since 2020, also by which site you were on when you fetched them, so one site cannot learn what you loaded on another. Headers decide what happens next: Cache-Control says how long a copy stays fresh, and ETag or Last-Modified let the browser ask has this changed? with an If-None-Match header and get back a tiny 304 instead of the whole file.",
    history: "HTTP caching rules date back to HTTP/1.0 in 1996 and were refined through RFC 2616 in 1999, RFC 7234 in 2014, and now RFC 9111 in 2022. Chrome swapped its original blockfile storage for the Simple Cache, one file per entry, during the 2010s, and cache partitioning — double-keying by top-level site — shipped in Chrome 86 in 2020.",
    purpose: "To skip the network entirely when a stored copy is provably still good, and to shrink the trip to almost nothing when it merely might be.",
    responsibilities: [
      'Store responses with their validators (ETag, Last-Modified) and freshness lifetime',
      'Serve fresh hits with zero network; issue conditional revalidations otherwise',
      'Honor no-store, private, and Vary correctly',
      'Partition entries by top-level site (double-keyed cache)'
    ],
    commands: [
      { cmd: "ls ~/.cache/google-chrome/Default/Cache/Cache_Data | head", note: 'the Simple Cache: one file per cached entry, plus an index' },
      { cmd: "curl -sI https://api.shop.dev/products | grep -iE 'cache-control|etag|age'", note: 'the headers that decide cacheability' },
      { cmd: "curl -s -H 'If-None-Match: \"abc123\"' -o /dev/null -w '%{http_code}\\n' https://api.shop.dev/products", note: 'a revalidation: 304 means the body never crossed the wire' }
    ],
    production: "The expensive bug is caching what you should not: a Cache-Control: public on an authenticated API response, or a missing Vary: Origin, leaks data between users via shared caches. Immutable+hashed filenames for assets, no-store for personalized APIs.",
    interview: [
      'Difference between no-cache and no-store?',
      'How does an ETag revalidation save bandwidth but not latency?',
      'Why did browsers move to a double-keyed (partitioned) HTTP cache?'
    ],
    sources: ['RFC 9111', 'chromium/src/net/disk_cache/', 'web.dev: HTTP cache'],
    related: ['netservice', 'cfcache', 'socketpool']
  },
  socketpool: {
    name: 'Connection Pool',
    tagline: "Six lanes to each server for old HTTP — or one wide highway for the modern kind",
    description: "Opening a connection is expensive, so the browser keeps the ones it has and lends them out again. With HTTP/1.1 it will hold up to 6 parallel TCP connections per origin group and queue everything beyond that; with HTTP/2 and HTTP/3 one connection is enough, because those protocols carry many requests down it simultaneously as separate streams. Reusing a warm connection skips DNS, TCP and TLS — the three slowest steps of the entire journey.",
    history: "HTTP/1.0 opened a fresh connection for every single request; keep-alive in HTTP/1.1 in 1997 made reuse normal. RFC 2616 politely suggested two connections per host, browsers ignored it and settled on six, and RFC 7230 dropped the recommendation altogether in 2014. Google's SPDY proved multiplexing in 2009 and became HTTP/2 in RFC 7540 in 2015, with HTTP/3 over QUIC following in RFC 9114 in 2022.",
    purpose: "To spread the cost of setting up a connection across many requests, while stopping any single site from claiming all your bandwidth at once.",
    responsibilities: [
      'Group connections by scheme + host + port (plus proxy and partition key)',
      'Queue requests when the per-group limit (6) is reached',
      'Keep idle connections warm; reap them on timeout',
      'Prefer H2/H3 multiplexing when ALPN negotiates it'
    ],
    commands: [
      { cmd: "ss -tan dst :443 | grep -c ESTAB", note: 'count live connections — reload a busy page and watch the pool fill' },
      { cmd: "curl -sv https://api.shop.dev/products -o /dev/null 2>&1 | grep -E 'Re-using|ALPN'", note: 'curl shows connection reuse and negotiated protocol' },
      { cmd: "curl -s -w 'connect:%{time_connect} tls:%{time_appconnect} total:%{time_total}\\n' -o /dev/null https://api.shop.dev/products", note: 'what pooling saves: connect+TLS drop to ~0 on reuse' }
    ],
    production: 'Domain sharding — splitting assets across hostnames to dodge the 6-connection cap — was a 2010s best practice that became an anti-pattern under HTTP/2, where it defeats multiplexing and prioritization.',
    interview: [
      'Why 6 connections per host, and what changes under HTTP/2?',
      'What is head-of-line blocking in HTTP/1.1 pipelining vs HTTP/2 vs HTTP/3?',
      'What handshakes does connection reuse eliminate, and how many RTTs is that?'
    ],
    sources: ['chromium/src/net/socket/client_socket_pool_manager.cc', 'RFC 9113 (HTTP/2)', 'RFC 9114 (HTTP/3)'],
    related: ['netservice', 'tcp', 'cftls', 'httpcache']
  },
  nodejs: {
    name: 'Node.js Runtime',
    tagline: "V8 plus a way to talk to the operating system — JavaScript let out of the sandbox",
    description: "Node.js is the same JavaScript engine Chrome uses, taken out of the browser and handed the keys to the machine. It pairs V8 with libuv, a C library for event-driven input and output, and adds a standard library for files, sockets and servers. In node mode our fetch() runs right here, in PID 1337: identical V8, but the browser's sandbox and Web APIs are replaced by direct access to the kernel through C++ bindings.",
    history: "Ryan Dahl presented Node.js at JSConf EU in November 2009, built on V8 with non-blocking I/O as its founding principle. npm arrived in 2010 from Isaac Schlueter. A governance dispute split the project as io.js in 2014, and the two merged back in 2015 as Node 4 under the Node.js Foundation. fetch() finally became a global in Node 18 in 2022, powered by undici.",
    purpose: "To make JavaScript a genuine server-side language, with an event-driven way of handling thousands of things at once.",
    responsibilities: [
      'Embed and configure V8 (heap limits, snapshots, flags)',
      'Bind JS to the OS: fs, net, dns, crypto via internal C++ bindings',
      'Drive the libuv event loop and thread pool',
      'Provide the module systems (CommonJS and ESM) and npm ecosystem contract'
    ],
    commands: [
      { cmd: 'node -p "process.versions"', note: 'the exact V8, libuv, and OpenSSL versions bundled in your Node' },
      { cmd: 'strace -c -f node -e "fetch(\'https://api.shop.dev/\')" 2>&1 | tail -20', note: 'syscall census of a single fetch: socket, connect, epoll, read, write' },
      { cmd: 'node --max-old-space-size=4096 server.js', note: 'raise the V8 old-generation heap limit (default ~2-4GB depending on version)' }
    ],
    production: 'Node scales by process, not thread: one event loop per core via cluster/PM2/container replicas. The classic outage is blocking that single loop — crypto, compression, and huge JSON belong in worker_threads or the libuv pool.',
    interview: [
      'Node is single-threaded — true, false, or both? Defend your answer.',
      'What does Node use instead of the browser event loop, and how do the phases differ?',
      'When does Node code actually run in parallel?'
    ],
    sources: ['nodejs/node: src/node.cc', 'nodejs.org docs', 'Dahl, JSConf EU 2009 talk'],
    related: ['libuv', 'undici', 'eventloop', 'libc'],
  },
  libuv: {
    name: 'libuv',
    tagline: "The C library that gives Node its heartbeat — epoll on Linux, kqueue on BSD, IOCP on Windows",
    description: "Every operating system has its own way of saying wake me when this socket has data, and no two of them agree. libuv hides all of that behind one loop: it waits in epoll on Linux, kqueue on the BSDs and macOS, IOCP on Windows. Work the kernel offers no asynchronous version of — reading files, resolving hostnames with getaddrinfo, some crypto — is handed instead to a small pool of threads, four by default. Node's event loop phases are literally the stages of libuv's uv_run().",
    history: "libuv was created in 2011 for Node 0.5, when porting Node to Windows made libev — designed around epoll and kqueue — untenable. Microsoft funded the work, because Windows' IOCP needed a fundamentally different abstraction. It went on to have a life of its own inside Julia and Neovim, and version 1.45 in 2023 added io_uring support for file I/O.",
    purpose: "To give Node one portable way to wait for the world, so its core never has to write a line of platform-specific I/O code.",
    responsibilities: [
      'Run the loop phases: timers, pending, poll (block in epoll_wait), check, close',
      'Watch socket fds for readiness and dispatch callbacks',
      'Offload fs, dns (getaddrinfo), and crypto work to the thread pool',
      'Provide async handles, timers, signals, and process spawning'
    ],
    commands: [
      { cmd: 'UV_THREADPOOL_SIZE=16 node server.js', note: 'grow the thread pool (default 4, max 1024) — the fix for fs/dns/crypto contention' },
      { cmd: "strace -f -e trace=epoll_create1,epoll_ctl,epoll_wait node -e 'setTimeout(()=>{},100)' 2>&1 | grep epoll | head", note: 'watch libuv build and drive its epoll instance' },
      { cmd: "node -e \"console.log(process.env.UV_THREADPOOL_SIZE || 'default 4')\"", note: 'check the pool size the process actually got' }
    ],
    production: 'The thread pool is a hidden global bottleneck: four slow DNS lookups (getaddrinfo is synchronous under the hood) can starve all file I/O. Monitor with uv_metrics and raise UV_THREADPOOL_SIZE deliberately.',
    interview: [
      'Which Node operations use the libuv thread pool vs epoll readiness?',
      'Why is fs.readFile not truly async at the kernel level (pre-io_uring)?',
      'What happens in the poll phase when there are no timers due?'
    ],
    sources: ['libuv/libuv: src/unix/linux.c', 'docs.libuv.org: Design overview', 'man 7 epoll'],
    related: ['nodejs', 'eventloop', 'fdtable', 'syscallgate']
  },
  undici: {
    name: 'undici HTTP Client',
    tagline: "Node's built-in fetch, named eleven in Italian — as in HTTP/1.1",
    description: "undici is the HTTP client hiding behind fetch() in Node. It is a from-scratch rewrite rather than a wrapper: its own spec-compliant fetch, its own connection pooling and pipelining, and a parser built on llhttp, deliberately bypassing Node's older http.request stack and everything it had accumulated. The name is a small joke — undici is Italian for eleven, as in one point one.",
    history: "Matteo Collina started it around 2018 to escape the performance and design debt of Node's core HTTP client. It became an official Node.js project, and Node 18 shipped it in April 2022 as the engine behind global fetch, which was marked stable in Node 21 in 2023.",
    purpose: "To give Node an HTTP client that is fast, faithful to the WHATWG fetch spec, and honest about exactly how it pools connections.",
    responsibilities: [
      'Implement WHATWG fetch semantics (Request/Response/Headers, streams, redirects)',
      'Pool and reuse keep-alive connections per origin (Agent/Pool/Client classes)',
      'Parse HTTP with llhttp; enforce header and body framing rules strictly',
      'Expose escape hatches: interceptors, dispatchers, mockAgent for tests'
    ],
    commands: [
      { cmd: "node -e \"fetch('https://api.shop.dev/products?limit=20').then(r=>r.json()).then(t=>console.log(t.length))\"", note: 'global fetch in Node — this is undici underneath' },
      { cmd: "NODE_DEBUG=undici node app.js 2>&1 | head", note: 'debug logging from the undici dispatcher' },
      { cmd: "node -e \"const {Agent,setGlobalDispatcher}=require('undici'); setGlobalDispatcher(new Agent({connections:128})); console.log('pool widened')\"", note: 'tune per-origin connection limits for high-fanout services' }
    ],
    production: 'Default pool limits and keep-alive timeouts matter under load: server-side fanout to one upstream origin serializes on the pool. Also watch for UND_ERR_HEADERS_TIMEOUT/BODY_TIMEOUT — undici enforces timeouts legacy http never had.',
    interview: [
      'How does Node fetch differ from browser fetch (CORS, cache, credentials)?',
      'Why did Node need a new HTTP client instead of fixing http.request?',
      'What is a dispatcher in undici and why do tests love MockAgent?'
    ],
    sources: ['nodejs/undici', 'nodejs/llhttp', 'WHATWG Fetch Standard'],
    related: ['nodejs', 'libuv', 'socketpool', 'tcp']
  },
  libc: {
    name: 'C Library (glibc)',
    tagline: "The last stop in userspace: turns connect() into an instruction the CPU understands",
    description: "glibc is the layer of C code that nearly every program on Linux leans on for the basics: connect(), getaddrinfo(), malloc(). Node's C++ eventually calls these, and their real job is small but essential — put the right numbers in the right CPU registers, run the syscall instruction that enters the kernel, and translate the kernel's negative return value back into the familiar errno. It also owns name resolution, consulting nsswitch.conf and /etc/hosts before DNS is ever considered.",
    history: "Roland McGrath started the GNU C Library in 1987 for the GNU project, and Ulrich Drepper carried it through the Linux boom from 1995 to 2012. A leaner alternative, musl libc, arrived from Rich Felker in 2011 and became the base of Alpine Linux — and therefore of countless Docker images, which is why subtle glibc-versus-musl differences in DNS behavior still ruin people's evenings.",
    purpose: "To offer a stable, human-shaped API over the kernel, so no program ever has to hand-write syscall assembly or invent its own resolver.",
    responsibilities: [
      'Wrap syscalls: load the number and args, execute syscall, set errno on failure',
      'Implement the resolver: getaddrinfo consults nsswitch.conf, /etc/hosts, then DNS',
      'Provide malloc, pthreads (NPTL), locale, and stdio',
      'Use the vDSO so hot calls like clock_gettime skip the kernel entirely'
    ],
    commands: [
      { cmd: 'ldd $(which node)', note: 'see the dynamic link to libc.so.6 (and friends)' },
      { cmd: "ltrace -e 'connect+getaddrinfo' node app.js 2>&1 | head", note: 'trace library calls — one level above strace' },
      { cmd: '/lib/x86_64-linux-gnu/libc.so.6', note: 'glibc is executable: prints its own version banner' }
    ],
    production: 'glibc vs musl bites in containers: musl has no nscd, historically limited DNS behaviors (TCP fallback, search domains), and different malloc characteristics under thread churn. Pin your base image with eyes open.',
    interview: [
      'What does errno actually hold, and why is it thread-local?',
      'Trace getaddrinfo: which files does it read before any packet is sent?',
      'Why do some binaries break on Alpine but run on Debian?'
    ],
    sources: ['glibc: sysdeps/unix/sysv/linux/', 'man 7 libc', 'man 5 nsswitch.conf'],
    related: ['syscallgate', 'nodejs', 'stubresolver', 'process']
  },
  syscallgate: {
    name: 'Syscall Gate',
    tagline: "One CPU instruction, and your program briefly becomes the most powerful thing on the machine",
    description: "This is the door between your program and the kernel. The syscall instruction makes the CPU jump to an address the kernel registered at boot in a special register called LSTAR, land on entry_SYSCALL_64, switch to a private kernel stack with swapgs, and save your registers so it can hand them back afterwards. It is not a function call — it is a controlled change of privilege, and it is the only legitimate way in.",
    history: "Linux originally entered the kernel through the software interrupt int 0x80. Then in 1997 Intel added SYSENTER with the Pentium II and AMD added SYSCALL with the K6, and AMD's became the x86-64 standard. In January 2018 the Meltdown disclosure forced KPTI, which splits the page tables at exactly this boundary — and made every single syscall measurably more expensive, forever.",
    purpose: "To let untrusted code ask for privileged work — open this socket, send these bytes — without ever being trusted with a privileged instruction itself.",
    responsibilities: [
      'Transition CPL 3 to CPL 0 and switch to the kernel stack (swapgs)',
      'Save the user register frame (pt_regs) for the return trip',
      'Switch page tables under KPTI and apply entry mitigations',
      'Dispatch to do_syscall_64 with the number from rax'
    ],
    commands: [
      { cmd: 'strace -e trace=%net -f node app.js 2>&1 | head -20', note: 'every line is one trip through this gate' },
      { cmd: "perf stat -e raw_syscalls:sys_enter -a sleep 5", note: 'count system-wide syscall entries for 5 seconds' },
      { cmd: "grep -E 'pti|meltdown' /sys/devices/system/cpu/vulnerabilities/* 2>/dev/null; dmesg | grep -i 'page table isolation'", note: 'is KPTI active on this box?' }
    ],
    production: 'Syscall overhead (~100-300ns, worse with KPTI) is why high-performance networking batches (sendmmsg), maps (io_uring rings), or bypasses (DPDK) the gate. seccomp filters also hook here — each filter adds per-syscall cost.',
    interview: [
      'What is the difference between a syscall and a function call at the CPU level?',
      'What does swapgs do and why is it needed?',
      'Why did Meltdown mitigations slow down syscall-heavy workloads specifically?'
    ],
    sources: ['arch/x86/entry/entry_64.S', 'Documentation/arch/x86/pti.rst', 'man 2 syscall'],
    related: ['syscalltable', 'cpu', 'libc', 'memmap']
  },
  syscalltable: {
    name: 'Syscall Table',
    tagline: "A numbered menu of kernel services: 41 is socket, 42 is connect",
    description: "The kernel does not look up system calls by name — it looks them up by number. Your program puts a number in the rax register, and the kernel uses it as an index into sys_call_table to find the handler to run: on x86-64, 41 is socket, 42 is connect, 44 is sendto, 232 is epoll_wait. The table is generated at build time from a plain text file called syscall_64.tbl and is read-only once running, a lesson learned from rootkits that used to quietly rewrite entries.",
    history: "Numbered syscall tables go back to the earliest UNIX, where V6 had around fifty of them. Linux on x86-64 took the chance to renumber cleanly when it launched between 2001 and 2003, shedding the old int 0x80 legacy. Since then numbers are only ever appended, never reused or reordered, because of Linus' prime directive: never break userspace.",
    purpose: "To map a small, permanent set of numbers onto the kernel's services — one number per service, unchanged for decades.",
    responsibilities: [
      'Index rax to the __x64_sys_* handler and validate the range',
      'Preserve ABI: numbers are append-only across decades',
      'Anchor seccomp-bpf filtering, which allow/denies by number',
      'Route compat (32-bit) syscalls through their own table'
    ],
    commands: [
      { cmd: 'ausyscall --dump | head -20', note: 'print the name-to-number mapping for this architecture' },
      { cmd: "grep -E '^(41|42|44|232)\\b' /usr/src/linux/arch/x86/entry/syscalls/syscall_64.tbl 2>/dev/null || echo '41 socket / 42 connect / 44 sendto / 232 epoll_wait'", note: 'the table source of truth in the kernel tree' },
      { cmd: "strace -qq -e trace=socket,connect -e raw=socket,connect node -e \"fetch('http://example.com')\" 2>&1 | head", note: 'raw mode shows the actual numbers in registers' }
    ],
    production: "seccomp profiles (Docker's default blocks ~44 syscalls) and SELinux hook at this layer; a container failing with EPERM on a perfectly good syscall usually means the profile never heard of it (a classic with new calls like clone3 in 2019-2021).",
    interview: [
      'Why are syscall numbers never reused or renumbered?',
      'How does seccomp decide to allow or kill a syscall?',
      'What happens if rax holds a number beyond the table?'
    ],
    sources: ['arch/x86/entry/syscalls/syscall_64.tbl', 'kernel/seccomp.c', 'man 2 syscalls'],
    related: ['syscallgate', 'socketlayer', 'process']
  },
  cpu: {
    name: 'CPU & Privilege Rings',
    tagline: "Ring 0 and ring 3 — the line drawn in silicon between the kernel and everybody else",
    description: "The processor itself knows there are two kinds of code. x86 chips define four privilege rings and Linux uses just two, running the kernel in ring 0 and everything else in ring 3. The current level lives in the CS register, and instructions that could take over the machine — loading page tables, talking directly to devices — simply fault if attempted from ring 3. That hardware refusal is what makes an operating system possible at all.",
    history: "Protection rings come from Multics in the 1960s, which had eight of them. x86 got rings with protected mode on the 286 in 1982, and paging with the 386 in 1985. Later eras added the NX bit in 2004 and SMEP and SMAP around 2011-2012 — and then came 2018, when Spectre and Meltdown showed the CPU could be coaxed into leaking across the ring boundary through pure speculation, and the boundary had to be redrawn in microcode.",
    purpose: "To enforce in silicon, rather than by good manners, that ordinary programs cannot read kernel memory or command hardware.",
    responsibilities: [
      'Track CPL and fault on privileged instructions from ring 3',
      'Walk page tables (MMU/TLB) with user/supervisor bits per page',
      'Deliver interrupts and exceptions through the IDT, elevating to ring 0',
      'Provide atomic instructions and memory ordering the kernel builds locks from'
    ],
    commands: [
      { cmd: 'lscpu', note: 'topology, flags (look for smep smap pti), and cache sizes' },
      { cmd: 'grep -m1 flags /proc/cpuinfo | tr " " "\\n" | grep -E "smep|smap|nx" ', note: 'which ring-boundary hardening features this CPU has' },
      { cmd: 'perf top -g', note: 'watch time split between userspace symbols and kernel (k) symbols live' }
    ],
    production: 'The user/kernel split is visible in monitoring as %usr vs %sys: a web server burning 40% sys time is spending it in this boundary — syscalls, softirqs, memcpy — and that is where tuning goes next.',
    interview: [
      'Why does Linux use only rings 0 and 3 of the four available?',
      'What stops user code from simply jumping to a kernel address?',
      'What do SMEP and SMAP protect against?'
    ],
    sources: ['Intel SDM Vol. 3, ch. 5 (Protection)', 'arch/x86/kernel/cpu/', 'Documentation/arch/x86/'],
    related: ['syscallgate', 'scheduler', 'irq', 'memmap']
  },
  process: {
    name: 'Process (task_struct)',
    tagline: "One struct in the kernel that holds everything a running program is",
    description: "To Linux, a process is a single C structure called task_struct, and everything about your program hangs off it: its address space in an mm_struct, its table of open files in a files_struct, its credentials, which namespaces it can see, and where it stands in the queue for the CPU. Our node process is PID 1337; inside the container the server runs as PID 1 — the same structure, an entirely different view of the world.",
    history: "fork() appeared in first-edition UNIX in 1971, an idea inherited from Project Genie. Linux later generalized creation into clone(), where the caller chooses exactly which resources to share — the one mechanism that gives us both threads and containers. Copy-on-write made forking cheap enough that shells and prefork servers could be built on it without a second thought.",
    purpose: "To gather in one place everything the kernel needs in order to run, schedule, isolate and account for a single program.",
    responsibilities: [
      'Own the address space (mm_struct) and fd table (files_struct)',
      'Carry credentials, rlimits, cgroup membership, and namespace pointers',
      'Track state: R (running), S (sleeping), D (uninterruptible), Z (zombie)',
      'Parent/child bookkeeping: wait(), exit codes, orphan reparenting'
    ],
    commands: [
      { cmd: 'cat /proc/1337/status | head -20', note: 'name, state, PIDs across namespaces, memory, threads' },
      { cmd: 'ps -o pid,ppid,stat,wchan:30,comm -p 1337', note: 'wchan shows which kernel wait queue a sleeping process is on' },
      { cmd: 'pstree -p 1337', note: 'the process tree — every process but PID 1 has a parent' }
    ],
    production: 'Zombies (Z state) mean a parent not reaping children — the classic container bug when an app runs as PID 1 without signal handling; tini/dumb-init exist for exactly this. D-state pileups mean stuck I/O, not CPU.',
    interview: [
      'What is copy-on-write fork and why is fork+exec still fast?',
      'What is a zombie process and who is at fault?',
      'What differs between a process and a thread in Linux terms?'
    ],
    sources: ['include/linux/sched.h', 'kernel/fork.c', 'man 2 fork', 'man 5 proc'],
    related: ['thread', 'scheduler', 'fdtable', 'memmap', 'netns']
  },
  thread: {
    name: 'Thread',
    tagline: "In Linux there is no such thing as a thread — only a task that shares its memory",
    description: "Other systems have a separate thread object; Linux does not. When you call pthread_create it calls clone() with flags that say share the address space, share the open files, join the same thread group — and out comes another ordinary task_struct with its own stack and registers. Node uses this to run V8 on the main thread and libuv's workers on others, and the kernel schedules every one of them independently.",
    history: "The first attempt, LinuxThreads by Xavier Leroy in 1996, faked POSIX threads out of processes and had famously strange signal behavior. NPTL — from Ulrich Drepper and Ingo Molnar in 2003, landing in kernel 2.6 — fixed the model properly with futexes and real thread groups. A benchmark creating 100,000 threads went from about 15 minutes to 2 seconds.",
    purpose: "To let several lines of execution run at once inside a single shared pool of memory.",
    responsibilities: [
      'Share mm, fds, and signal handlers with the thread group; keep own stack and registers',
      'Present one PID (tgid) to userspace while each thread has its own tid',
      'Synchronize via futexes — uncontended locks never enter the kernel',
      'Carry per-thread state: errno, TLS, scheduling policy'
    ],
    commands: [
      { cmd: 'ps -eLf | awk "\\$2==1337"', note: 'all threads (LWP column) of PID 1337 — Node typically shows 7+: V8, libuv pool, GC helpers' },
      { cmd: 'ls /proc/1337/task/', note: 'one directory per thread; this IS the thread list' },
      { cmd: 'top -H -p 1337', note: 'per-thread CPU — find which thread is actually burning' }
    ],
    production: 'Thread-per-request died at scale (10k threads = 10k stacks and scheduler pressure); event loops and small pools won. But CPU-bound JS still needs worker_threads — one event loop cannot use two cores.',
    interview: [
      'What does clone() share to make a thread vs a process?',
      'Why is gettid() different from getpid() and when does it matter?',
      'What is a futex and why does an uncontended mutex cost no syscall?'
    ],
    sources: ['kernel/fork.c (copy_process)', 'man 2 clone', 'man 7 pthreads', 'Drepper & Molnar, NPTL design paper (2003)'],
    related: ['process', 'scheduler', 'libuv']
  },
  scheduler: {
    name: 'CPU Scheduler',
    tagline: "Decides, thousands of times a second, who gets a CPU next",
    description: "There are always more things wanting to run than there are cores, and the scheduler is the referee. It keeps a queue per CPU and tracks how much time each task has already had — a measure called virtual runtime — then simply runs whoever has had the least. When our node process blocks waiting in epoll_wait it leaves the queue entirely and costs nothing at all; a packet arriving later, and the interrupt it causes, makes it runnable again.",
    history: "Linux's scheduler has been rewritten repeatedly: an O(n) design gave way to Ingo Molnar's O(1) scheduler in 2002, then to CFS in 2007 in kernel 2.6.23 — Molnar again, after Con Kolivas made the case that desktop fairness genuinely mattered — and then to EEVDF in kernel 6.6 in 2023 from Peter Zijlstra, an implementation of a 1995 virtual-deadline algorithm by Stoica and Abdel-Wahab that offers better latency guarantees.",
    purpose: "To share a handful of CPUs among everything that wants them, fairly, without letting anything wait too long or lose the cache it was warming.",
    responsibilities: [
      'Maintain per-CPU runqueues ordered by vruntime/virtual deadline',
      'Preempt on timer tick or wakeup of a more-deserving task',
      'Balance load across cores while respecting cache and NUMA locality',
      'Honor policies: SCHED_OTHER, SCHED_FIFO/RR (realtime), nice, cgroup CPU weights'
    ],
    commands: [
      { cmd: 'cat /proc/1337/sched | head -15', note: 'vruntime, switch counts, wait time for one task' },
      { cmd: 'perf sched record -- sleep 5 && perf sched latency | head', note: 'measure real scheduling latency per task' },
      { cmd: 'chrt -p 1337', note: 'query scheduling policy and priority' }
    ],
    production: "In containers the scheduler interacts with CFS bandwidth control: cpu.max quotas cause throttling visible in /sys/fs/cgroup/.../cpu.stat — the notorious 'my pod has CPU but stalls every 100ms' issue.",
    interview: [
      'What is vruntime and how does nice affect it?',
      'Why can a container be throttled while the node has idle CPU?',
      'Voluntary vs involuntary context switch — what does each indicate?'
    ],
    sources: ['kernel/sched/fair.c', 'Documentation/scheduler/sched-design-CFS.rst', 'kernel/sched/core.c'],
    related: ['process', 'thread', 'cpu', 'softirq']
  },
  fdtable: {
    name: 'File Descriptor Table',
    tagline: "Small numbers with enormous powers: fd 42 is a live connection to another continent",
    description: "Every process has a little array that turns small integers into kernel objects. Slots 0, 1 and 2 are always standard input, output and error; when node calls socket() the kernel picks the lowest free slot and hands back that number — for us, fd 42, pointing at a struct socket for TCP 51324 to 443. UNIX's oldest idea is that everything is a file, so sockets, pipes, timers and epoll instances all live side by side in this one table.",
    history: "File descriptors are original UNIX, from Ritchie and Thompson in 1971, and were the unifying abstraction that made the whole system feel coherent. Linux keeps the table in files_struct and resizes it under RCU so readers never block. The everything-is-a-file doctrine then kept expanding: epoll in 2002, followed by signalfd, timerfd and eventfd, so that even signals and timers could be waited on exactly like sockets.",
    purpose: "To give programs one uniform kind of handle for every kernel object they might read from or write to.",
    responsibilities: [
      'Allocate lowest-available fd on open/socket/accept/epoll_create',
      'Map fd to struct file to inode/socket on every read/write/sendto',
      'Enforce RLIMIT_NOFILE and close-on-exec flags',
      'Support duplication (dup2) and passing fds over UNIX sockets (SCM_RIGHTS)'
    ],
    commands: [
      { cmd: 'ls -l /proc/1337/fd | head', note: 'live fd table — sockets show as socket:[inode]' },
      { cmd: 'lsof -p 1337 -a -i', note: 'just the network fds, resolved to endpoints' },
      { cmd: 'ulimit -n; cat /proc/sys/fs/file-max', note: 'per-process soft limit vs system-wide ceiling' }
    ],
    production: "EMFILE ('too many open files') is the classic leak signature: connections opened without close, or the 1024 default soft limit meeting a 10k-connection service. systemd units set LimitNOFILE; check actual usage with ls /proc/PID/fd | wc -l.",
    interview: [
      'What happens to fd numbering when you close fd 5 and open a file?',
      'How does one process hand a live socket to another?',
      'Why does select() break above fd 1023 while epoll does not?'
    ],
    sources: ['fs/file.c', 'include/linux/fdtable.h', 'man 2 dup2', 'man 7 unix (SCM_RIGHTS)'],
    related: ['process', 'socketobj', 'socketlayer', 'libuv']
  },
  memmap: {
    name: 'Virtual Memory Map',
    tagline: "Every process is handed 128 TiB of make-believe; the page tables decide what is real",
    description: "Each program gets its own private map of memory — its code, its heap, the libraries it mapped in, its stacks — described by a list of regions the kernel calls VMAs and keeps in mm_struct. The kernel itself is mapped into the upper half of every map, but marked so that only ring 0 may look at it. Almost none of it is real when you ask for it: physical pages appear only when you first touch an address and trigger a page fault, and a small CPU cache called the TLB remembers translations so it need not walk the tables twice.",
    history: "Paged virtual memory first ran on the Atlas at Manchester in 1962. On x86-64, Linux splits the canonical space down the middle — 128 TiB for the process, 128 TiB for the kernel — using four levels of page tables, or five since 2017 for those who need more. The bookkeeping of memory regions moved from a red-black tree to a maple tree in kernel 6.1 in 2022. And Meltdown in 2018 forced KPTI, which unmaps nearly all of the kernel while user code is running.",
    purpose: "To let every process believe it owns the whole machine's memory, while the kernel quietly arbitrates who actually gets which physical page.",
    responsibilities: [
      'Track VMAs: ranges, permissions (rwx), backing (anon or file)',
      'Handle page faults: allocate, COW-copy, or swap in on demand',
      'Maintain page tables and TLB coherence across CPUs',
      'Enforce user/supervisor separation on every access'
    ],
    commands: [
      { cmd: 'cat /proc/1337/maps | head -15', note: 'the VMA list: node binary, libc, V8 heap, JIT code pages (rwxp!)' },
      { cmd: 'pmap -x 1337 | tail -5', note: 'RSS vs virtual — the difference is the make-believe' },
      { cmd: 'grep -E "VmRSS|VmSize" /proc/1337/status', note: 'quick RSS/virtual snapshot' }
    ],
    production: "RSS is what OOM-killers act on, not virtual size — V8 reserves huge virtual ranges harmlessly. In containers, the memory cgroup's accounting (including page cache!) is what triggers OOM kills; watch memory.current vs memory.max.",
    interview: [
      'What exactly happens on a page fault for a freshly malloc()ed page?',
      'Why is virtual size often 10x RSS for a JVM or Node process?',
      'What does copy-on-write share between parent and child after fork?'
    ],
    sources: ['mm/mmap.c', 'mm/memory.c', 'Documentation/arch/x86/x86_64/mm.rst', 'man 5 proc (maps)'],
    related: ['process', 'cpu', 'dma', 'machinecode']
  },
  socketlayer: {
    name: 'BSD Socket Layer',
    tagline: "The 1983 API that every networked program on earth still speaks",
    description: "This is the front desk of the kernel's network stack, and it deliberately knows nothing about protocols. When you call socket(), net/socket.c allocates a generic struct socket, ties it to a file descriptor, and then reads what you asked for — AF_INET plus SOCK_STREAM — to decide who should take over, which for us means inet_create handing the connection to TCP. Forty years of programs, one small set of verbs.",
    history: "The socket API arrived in 4.2BSD in 1983, designed by Bill Joy and the CSRG at Berkeley under DARPA funding to give the new TCP/IP a programming interface. It was so successful that Microsoft adopted it as Winsock in 1992 and POSIX standardized it — a rare API that comfortably outlived every operating system it was written for.",
    purpose: "To keep applications completely ignorant of protocol internals: the same handful of calls work for TCP, UDP, UNIX sockets, netlink and everything invented since.",
    responsibilities: [
      'Implement socket/bind/listen/accept/connect/sendmsg/recvmsg entry points',
      'Map family+type+protocol to the right proto_ops (inet_stream_ops for us)',
      'Tie sockets into the VFS so they are fds like everything else (sockfs)',
      'Copy data between user buffers and kernel sk_buffs at the boundary'
    ],
    commands: [
      { cmd: 'ss -s', note: 'socket census by family and state across the whole system' },
      { cmd: "strace -e trace=%net node -e \"fetch('http://example.com')\" 2>&1 | grep -E 'socket|connect' | head", note: 'the exact API sequence one fetch performs' },
      { cmd: 'cat /proc/net/protocols | head', note: 'registered protocols and their memory footprints' }
    ],
    production: 'Socket API misuse patterns dominate netcode bugs: forgetting SO_REUSEADDR on servers (bind fails in TIME_WAIT), ignoring partial writes on non-blocking sockets, or leaking fds by skipping close on error paths.',
    interview: [
      'What does socket(AF_INET, SOCK_STREAM, 0) actually allocate?',
      'Why does bind() fail with EADDRINUSE right after a server restart?',
      'What differs between struct socket and struct sock?'
    ],
    sources: ['net/socket.c', 'net/ipv4/af_inet.c', 'man 2 socket', '4.2BSD release notes (1983)'],
    related: ['socketobj', 'fdtable', 'tcp', 'udp', 'syscalltable']
  },
  socketobj: {
    name: 'Socket Object (struct sock)',
    tagline: "Everything the kernel remembers about your connection, and it remembers a great deal",
    description: "Behind the file descriptor sits struct sock — for TCP, the much larger tcp_sock, carrying sequence numbers, congestion state and round-trip time estimates. Two queues hang off it: sk_receive_queue holding data that has arrived and not yet been read, and sk_write_queue holding data you have written that has not yet been acknowledged, which is where backpressure actually comes from. This object is what ss -tmi prints, and it is what lingers in TIME_WAIT long after you have called close() and moved on.",
    history: "The layered hierarchy of sock, then inet_sock, then inet_connection_sock, then tcp_sock grew through the 2.x series as Linux networking was rewritten under Alan Cox and later David Miller. Automatically sized socket buffers arrived in 2.4 and 2.6, drawn from 1998 research by Semke and colleagues, replacing a flat 64KB default that had aged badly.",
    purpose: "To hold every piece of per-connection state — sent, acked, received, buffered, negotiated — in one place the whole stack can consult.",
    responsibilities: [
      'Buffer inbound data (sk_receive_queue) until the app reads it',
      'Buffer outbound data (sk_write_queue) until acked — backpressure lives here',
      'Track sk_rcvbuf/sk_sndbuf limits with autotuning (tcp_rmem/tcp_wmem)',
      'Wake waiting processes (epoll callbacks) when readable/writable state changes'
    ],
    commands: [
      { cmd: 'ss -tmenpi dst 104.18.32.7', note: 'per-socket memory (skmem), RTT, cwnd, pacing rate — the whole object exposed' },
      { cmd: 'cat /proc/net/tcp | head -3', note: 'the raw socket table: hex addresses, queues, inode linking back to the fd' },
      { cmd: 'sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem', note: 'min/default/max autotuned buffer sizes' }
    ],
    production: 'Recv-Q growing means the app is slow (event loop stalled); Send-Q growing means the network or peer is slow. This one distinction, read from ss, localizes half of all latency incidents.',
    interview: [
      'Where does data live between NIC arrival and your read() call?',
      'What do Recv-Q and Send-Q in ss output tell you about who is slow?',
      'Why does the socket persist after close() returns (TIME_WAIT)?'
    ],
    sources: ['include/net/sock.h', 'include/linux/tcp.h (tcp_sock)', 'net/core/sock.c'],
    related: ['socketlayer', 'tcp', 'fdtable', 'eventloop']
  },
  tcp: {
    name: 'TCP Stack',
    tagline: "Turns a network that loses, reorders and duplicates things into a tidy stream of bytes",
    description: "IP will happily drop your packet, deliver it twice, or hand it over out of order; TCP is the code that hides every bit of that. It runs a handshake to open the connection, numbers each byte so the far end can put them back in order, sets timers to notice when something never arrived, and continuously estimates how fast it may send without collapsing the network. Our opening SYN, carrying the initial sequence number 1128394821, leaves from tcp_v4_connect — and everything after it happens without the application noticing a thing.",
    history: "Vint Cerf and Bob Kahn described TCP in 1974 in RFC 675; it split into separate TCP and IP layers in 1978 and was standardized by Jon Postel as RFC 793 in 1981, now updated as RFC 9293 in 2022. When the internet suffered congestion collapse in 1986, Van Jacobson's 1988 slow start and AIMD work rescued it. Linux switched its default congestion control to CUBIC in 2006, and Google published BBR in 2016.",
    purpose: "To take a best-effort, unreliable network and give you something you can actually write a program against: an ordered, reliable, well-mannered stream of bytes.",
    responsibilities: [
      'Run the state machine: LISTEN, SYN_SENT, ESTABLISHED, FIN_WAIT, TIME_WAIT...',
      'Segment the stream, assign sequence numbers, ack received data',
      'Retransmit on loss (RTO, fast retransmit, SACK) and estimate RTT',
      'Congestion control: cwnd growth/collapse per CUBIC or BBR',
      'Flow control via the advertised receive window'
    ],
    commands: [
      { cmd: 'ss -tan state syn-sent', note: 'connections mid-handshake right now' },
      { cmd: 'ss -ti dst 104.18.32.7', note: 'live cwnd, rtt, retrans, and congestion algorithm per connection' },
      { cmd: 'nstat -az TcpRetransSegs TcpExtTCPTimeouts', note: 'retransmission counters — the pulse of network health' },
      { cmd: 'sysctl net.ipv4.tcp_congestion_control net.ipv4.tcp_available_congestion_control', note: 'active and available congestion algorithms' }
    ],
    production: 'SREs watch retransmit rate above all; tune tcp_rmem/tcp_wmem for BDP on fat pipes, enable BBR on lossy paths, and manage TIME_WAIT pressure (tcp_max_tw_buckets, never tcp_tw_recycle — removed in 4.12 for breaking NAT).',
    interview: [
      'Walk through the three-way handshake and what state each side holds when.',
      'Why does TIME_WAIT exist and why is it 2*MSL?',
      'CUBIC vs BBR: what signal does each treat as congestion?'
    ],
    sources: ['net/ipv4/tcp.c', 'net/ipv4/tcp_input.c', 'net/ipv4/tcp_output.c', 'RFC 9293', 'man 7 tcp'],
    related: ['ip', 'socketobj', 'qdisc', 'conntrack']
  },
  udp: {
    name: 'UDP',
    tagline: "Eight bytes of header and zero promises — which is exactly why DNS and QUIC chose it",
    description: "UDP is what remains of a transport protocol once you remove everything optional. It adds port numbers and an optional checksum on top of IP, and nothing else: no handshake, no ordering, no retransmission, no idea whether anything arrived. Our DNS question to 1.1.1.1 travels this way because one small question and one small answer need none of TCP's machinery — and QUIC later rebuilt all that machinery on top of UDP, in userspace, where it could keep evolving.",
    history: "David Reed specified UDP in RFC 768 in August 1980, preserving end-to-end simplicity for applications that wanted datagrams rather than streams. Decades later that same minimalism made it the foundation for QUIC — started at Google in 2012 and standardized as RFC 9000 in 2021 — precisely because middleboxes had ossified TCP so thoroughly that nothing new could be added to it.",
    purpose: "To deliver one message to one port on one host, and then get out of the way.",
    responsibilities: [
      'Attach src/dst ports and checksum; hand to IP',
      'Demultiplex inbound datagrams to bound sockets',
      'Drop silently when the socket buffer overflows (no backpressure)',
      'Support multicast/broadcast and SO_REUSEPORT load balancing (kernel 3.9, 2013)'
    ],
    commands: [
      { cmd: 'ss -uanp', note: 'UDP sockets — note there is no state column worth reading' },
      { cmd: 'nstat -az UdpInDatagrams UdpInErrors UdpRcvbufErrors', note: 'RcvbufErrors counting up = application not draining fast enough' },
      { cmd: "tcpdump -ni any 'udp port 53' -c 4", note: 'catch the DNS query/response pair in flight' }
    ],
    production: 'UDP loss is silent: monitor UdpRcvbufErrors and raise net.core.rmem_max for busy DNS/QUIC/metrics receivers. Also expect middleboxes to time out UDP "flows" in 30s, which is why QUIC and WireGuard send keepalives.',
    interview: [
      'Why does DNS use UDP, and when does it fall back to TCP?',
      'What happens when a UDP datagram arrives for a full socket buffer?',
      'Why was QUIC built on UDP instead of a new IP protocol number?'
    ],
    sources: ['net/ipv4/udp.c', 'RFC 768', 'man 7 udp'],
    related: ['ip', 'stubresolver', 'socketlayer', 'recursive']
  },
  ip: {
    name: 'IP Layer',
    tagline: "Addresses on the envelope, and a hop counter that runs out if it gets lost",
    description: "IP is the layer that gives every machine an address and every packet a destination. It writes our source 192.168.1.23 and destination 104.18.32.7 into the header, sets a TTL of 64 — a countdown decremented by every router, so a lost packet eventually dies rather than circling forever — and passes it onward with no guarantee whatsoever that it arrives. Fragmentation for links too small to carry it, the DF bit that forbids it, the ICMP messages that report trouble, and a header checksum recomputed at every hop all live here.",
    history: "IPv4 was standardized as RFC 791 in 1981, after the 1978 split placed addressing and delivery below reliability. Running out of addresses then shaped everything that followed: CIDR in 1993, NAT in 1994, and IPv6 in RFC 2460 in 1998, now RFC 8200. Choosing 32 bits for an address turned out to be the most consequential design constraint in the history of networking.",
    purpose: "To give the entire world one addressing scheme and one simple rule: pass this toward that address, and do your best.",
    responsibilities: [
      'Build/validate headers: addresses, TTL, protocol, checksum, DF/fragment fields',
      'Decrement TTL and emit ICMP Time Exceeded at zero (what traceroute exploits)',
      'Fragment when packet exceeds MTU and DF is clear; run PMTUD when set',
      'Hand payloads up by protocol number: 6 to TCP, 17 to UDP, 1 to ICMP'
    ],
    commands: [
      { cmd: 'ip addr show', note: 'addresses and MTUs per interface' },
      { cmd: 'ping -c3 -M do -s 1472 104.18.32.7', note: 'PMTUD probe: 1472+28=1500; raise -s and watch it fail' },
      { cmd: 'traceroute -n api.shop.dev', note: 'TTL-stepping to reveal every router on the path' }
    ],
    production: 'PMTUD blackholes (a middlebox eating ICMP) cause the maddening "small requests work, big uploads hang" bug; fixes are TCP MSS clamping or net.ipv4.tcp_mtu_probing=1. IPv6 dual-stack adds Happy Eyeballs behavior to debug.',
    interview: [
      'What happens, exactly, when TTL hits zero — and how does traceroute use it?',
      'Why is IP fragmentation considered harmful?',
      'What guarantee does IP make about ordering or delivery? (None — who fixes that?)'
    ],
    sources: ['net/ipv4/ip_output.c', 'net/ipv4/ip_input.c', 'RFC 791', 'RFC 1191 (PMTUD)'],
    related: ['tcp', 'udp', 'routing', 'arp', 'nat']
  },
  routing: {
    name: 'Routing Table (FIB)',
    tagline: "One lookup per packet, and the most specific answer always wins",
    description: "The Forwarding Information Base answers a single question, several million times a second: for this destination, which way out, and who is next? Our laptop finds nothing local matching 104.18.32.7, so the catch-all default route — 0.0.0.0/0 via 192.168.1.1, the home router — wins by being the only match at all. The rule is always longest prefix first: a more specific route beats a vaguer one, and the default route is simply the vaguest possible.",
    history: "Linux keeps IPv4 routes in an LC-trie, the level-compressed trie from a 1999 paper by Nilsson and Karlsson, merged in 2005 and made the sole implementation in 2.6.39 — which keeps lookups fast even in core routers whose tables run to a million routes. Policy routing, with ip rule and multiple tables, arrived earlier in the 2.2-era rewrite.",
    purpose: "To turn any destination address in the world into a next hop and an outgoing interface, in nanoseconds.",
    responsibilities: [
      'Longest-prefix match across connected, static, and learned routes',
      'Select source address and resolve the next hop for new flows',
      'Support multiple tables + rules (policy routing, VRFs)',
      'Cache per-destination results (dst_entry) with PMTU and metrics'
    ],
    commands: [
      { cmd: 'ip route show', note: 'the FIB: default via 192.168.1.1 dev wlan0, plus connected 192.168.1.0/24' },
      { cmd: 'ip route get 104.18.32.7', note: 'ask the kernel to run the exact lookup a packet would' },
      { cmd: 'ip rule show; ip route show table all | head', note: 'policy routing: rules select among tables before LPM runs' }
    ],
    production: 'Asymmetric routing plus rp_filter=1 silently drops replies — the classic multi-homed server mystery. On k8s nodes, thousands of routes from CNI plugins make ip route get the fastest truth-teller during incidents.',
    interview: [
      'Given routes for 10.0.0.0/8 and 10.0.1.0/24, which wins for 10.0.1.5 and why?',
      'What is a default route, in prefix terms?',
      'How does the kernel choose a source IP for an outbound connection?'
    ],
    sources: ['net/ipv4/fib_trie.c', 'net/ipv4/route.c', 'man 8 ip-route', 'RFC 1812'],
    related: ['ip', 'arp', 'bgp', 'netns']
  },
  arp: {
    name: 'ARP / Neighbor Cache',
    tagline: "Shouting into the room: who has 192.168.1.1? — and remembering the answer",
    description: "IP addresses are for the whole world; Ethernet only understands hardware addresses burned into each card. So before the very first frame can leave, the kernel must find out which card owns the next hop, 192.168.1.1. ARP does it by broadcasting the question to everyone on the local network and waiting for the one machine that answers — a4:91:b1:0c:44:e2 — then files it in the neighbor cache with a small state machine (REACHABLE, STALE, DELAY, PROBE) so it rarely has to ask again.",
    history: "David Plummer defined ARP in RFC 826 in November 1982, at the moment Ethernet met IP. IPv6 later replaced it with Neighbor Discovery, carried over ICMPv6 in RFC 4861. ARP's trusting nature — it believes any reply it hears — made ARP spoofing the classic attack on a local network, which switches now counter with dynamic ARP inspection.",
    purpose: "To connect the world of IP addresses to the world of hardware addresses, and to remember the mapping so the question is asked rarely.",
    responsibilities: [
      'Broadcast who-has requests; process replies into the neighbor table',
      'Age entries through REACHABLE → STALE → DELAY → PROBE states',
      'Queue outbound packets while resolution is in flight',
      'Send gratuitous ARP on address changes (failover/VRRP relies on this)'
    ],
    commands: [
      { cmd: 'ip neigh show', note: 'the neighbor cache with per-entry state (REACHABLE/STALE)' },
      { cmd: 'tcpdump -eni any arp -c 4', note: 'watch the who-has/is-at exchange live' },
      { cmd: 'arping -I eth0 192.168.1.1', note: 'ARP-level ping: works even when ICMP is filtered' }
    ],
    production: 'Gratuitous ARP is how VIP failover propagates (keepalived/VRRP) — when failover "takes 30 seconds", a switch ignoring GARP is usually why. In cloud VPCs, ARP is often answered by the hypervisor, not real peers.',
    interview: [
      'Your packet is for 8.8.8.8 — whose MAC goes in the frame, and why?',
      'What is gratuitous ARP and what operational trick depends on it?',
      'How does ARP spoofing enable a man-in-the-middle?'
    ],
    sources: ['net/ipv4/arp.c', 'net/core/neighbour.c', 'RFC 826', 'man 8 ip-neighbour'],
    related: ['routing', 'ethframe', 'switch', 'homerouter']
  },
  netns: {
    name: 'Network Namespace',
    tagline: "A whole private internet stack in a box — the trick containers are built from",
    description: "A network namespace is a complete second copy of the kernel's networking: its own interfaces, its own routing table, its own ARP cache, its own iptables rules, its own connection tracking, its own /proc/net. A process inside one can see nothing else, and believes that is all there is. Docker hands each container a namespace of its own, then wires them back to the world with virtual cables and a software switch.",
    history: "Network namespaces were merged around kernel 2.6.24 in 2008, driven by Eric Biederman and building on the OpenVZ lineage of container work. They joined the PID, mount, UTS, IPC and user namespaces as the isolation primitives that LXC in 2008, and then Docker in 2013, assembled into what we now call a container — which, notably, is not a kernel object at all.",
    purpose: "To give a group of processes a completely independent network stack while sharing one kernel and one machine.",
    responsibilities: [
      'Scope interfaces, addresses, routes, and sockets to the namespace',
      'Maintain per-ns netfilter rules, conntrack tables, and sysctls',
      'Support interface migration between namespaces (ip link set netns)',
      'Destroy the stack when the last process/reference exits'
    ],
    commands: [
      { cmd: 'lsns -t net', note: 'every network namespace on the host with its owning process' },
      { cmd: 'ip netns add lab && ip netns exec lab ip link', note: 'create a namespace: it starts with only a down loopback' },
      { cmd: 'nsenter -t $(docker inspect -f "{{.State.Pid}}" api) -n ss -tlnp', note: 'run host tools inside a container network namespace' }
    ],
    production: 'Namespace leaks (netns held by a stray mount or process) leave ghost interfaces and conntrack tables. Debug container networking from the host with nsenter -n rather than installing tools in images.',
    interview: [
      'What networking state is per-namespace vs global to the kernel?',
      'Why does a new namespace have no connectivity until you add a veth?',
      'How do Kubernetes pods share one network namespace between containers?'
    ],
    sources: ['net/core/net_namespace.c', 'man 7 network_namespaces', 'man 8 ip-netns'],
    related: ['veth', 'cnetns', 'bridge', 'process']
  },
  netfilter: {
    name: 'Netfilter Hooks',
    tagline: "Five checkpoints along the packet's path where the kernel lets you interrupt",
    description: "Netfilter is not a firewall — it is the set of hooks a firewall plugs into. Five points are woven into the packet's journey through the IP layer: PREROUTING as it arrives, LOCAL_IN as it is delivered here, FORWARD as it passes through, LOCAL_OUT as it is created, and POSTROUTING as it leaves. Code registered at any of them can accept a packet, drop it, hand it to userspace, or rewrite it — and iptables, nftables and connection tracking are all simply customers of these five hooks.",
    history: "Rusty Russell began netfilter in 1998 and it shipped with kernel 2.4 in January 2001, replacing ipchains from 2.2, which had replaced ipfwadm from 2.0. Its founding insight — keep the hook infrastructure separate from the rule engine — is exactly why nftables could replace iptables in 2014 without disturbing the hooks at all.",
    purpose: "To offer a few well-chosen interception points, so firewalling, address translation and packet mangling can coexist without anyone patching the network stack itself.",
    responsibilities: [
      'Invoke registered hook functions in priority order at each of the 5 points',
      'Honor verdicts: ACCEPT, DROP, QUEUE (to userspace), STOLEN',
      'Host conntrack (priority -200) and NAT (priority -100/100) as hook clients',
      'Expose the same hooks per network namespace'
    ],
    commands: [
      { cmd: 'nft list ruleset | head -30', note: 'the modern view of everything attached to the hooks' },
      { cmd: 'iptables -L -v -n --line-numbers | head', note: 'legacy view with per-rule packet counters' },
      { cmd: 'dmesg | grep -i netfilter', note: 'hook registration at boot' }
    ],
    production: 'Hook order explains real bugs: DNAT happens in PREROUTING before routing, so FORWARD rules must match the post-DNAT (container) address, not the public one. Rule counters (-v) are the fastest way to find which rule eats your packets.',
    interview: [
      'Name the five netfilter hooks and which a forwarded vs local packet traverses.',
      'Why must firewall rules for DNATed traffic match the translated address?',
      'How do conntrack and NAT order themselves relative to your rules?'
    ],
    sources: ['net/netfilter/core.c', 'include/linux/netfilter.h', 'netfilter.org documentation'],
    related: ['iptables', 'conntrack', 'nat', 'dnat']
  },
  iptables: {
    name: 'iptables / nftables',
    tagline: "The rulebook bolted onto the hooks: chains of rules, one verdict per packet",
    description: "iptables is the rule engine that decides what actually happens at each netfilter hook. Rules are grouped into tables by purpose — filter for allow and deny, nat for rewriting addresses, mangle and raw for the more exotic cases — and each table hangs chains off particular hooks. A packet walks its chain rule by rule until one matches and delivers a final verdict. Docker writes its own DOCKER chain into the nat table; your distribution's firewall writes into filter.",
    history: "iptables shipped with kernel 2.4 in 2001, written by Rusty Russell. Its per-rule kernel structures aged badly at scale, so Patrick McHardy's nftables replaced the engine with a small in-kernel virtual machine in kernel 3.13 in 2014; modern distributions run iptables-nft, which quietly translates the familiar old syntax onto the new engine. Kubernetes hit the same wall from the other side and moved kube-proxy toward IPVS and nftables for exactly the same scaling reasons.",
    purpose: "To let you state firewall and address-translation policy as ordered, stateful rules that the kernel then applies to every packet.",
    responsibilities: [
      'Evaluate rules per chain with first-match-wins terminal verdicts',
      'Provide jump/return semantics for user-defined chains (DOCKER, KUBE-SERVICES)',
      'Program NAT decisions that conntrack then applies per-flow',
      'Count packets/bytes per rule for observability'
    ],
    commands: [
      { cmd: 'iptables-save | head -40', note: 'the complete ruleset in restorable form — the canonical dump' },
      { cmd: 'iptables -t nat -L -n -v', note: 'NAT rules with counters: find Docker DNAT and MASQUERADE here' },
      { cmd: 'nft list table ip nat 2>/dev/null | head', note: 'same policy through the nftables lens' },
      { cmd: 'iptables -V', note: 'reveals legacy vs nf_tables backend — mixing them causes ghost rules' }
    ],
    production: 'The legacy/nft split is a real footgun: rules added with iptables-legacy are invisible to iptables-nft listings. At scale, thousands of sequential rules cost real latency — hence ipset, IPVS, and eBPF replacements.',
    interview: [
      'A packet arrives for a published container port: which tables/chains touch it, in order?',
      'What does MASQUERADE do differently from SNAT?',
      'Why did nftables replace iptables, and what is iptables-nft?'
    ],
    sources: ['net/netfilter/nf_tables_api.c', 'man 8 iptables', 'man 8 nft', 'net/ipv4/netfilter/'],
    related: ['netfilter', 'conntrack', 'dnat', 'nat']
  },
  conntrack: {
    name: 'Connection Tracking',
    tagline: "The router's address book — how replies ever find their way home",
    description: "A firewall that judged each packet alone would be nearly useless: it could never tell a reply you asked for from a stranger knocking. Connection tracking fixes that by remembering every conversation as a pair of tuples — how the packet went out, and what its reply will look like coming back — and labeling the flow NEW, ESTABLISHED or RELATED. It is also what makes NAT possible: the translation rules are consulted only for the very first packet, and conntrack replays that same decision for every packet afterwards, in both directions, for the life of the connection.",
    history: "Connection tracking arrived alongside netfilter in kernel 2.4 in 2001, and it is what made Linux a stateful firewall. Its helpers understand protocols like FTP and SIP well enough to spot the extra connections they spawn. Its failure message — nf_conntrack: table full, dropping packet — has since become one of the most-Googled kernel log lines in the history of operations.",
    purpose: "To give the kernel a memory, so rules can talk about conversations rather than isolated packets.",
    responsibilities: [
      'Hash and track tuples for TCP/UDP/ICMP flows in both directions',
      'Classify packets: NEW, ESTABLISHED, RELATED, INVALID',
      'Store and apply NAT bindings for the lifetime of each flow',
      'Expire entries by protocol-aware timeouts (established TCP: 5 days by default)'
    ],
    commands: [
      { cmd: 'conntrack -L | head', note: 'live flow table — find our 51324→443 flow with both tuples' },
      { cmd: 'conntrack -E -o timestamp | head', note: 'event stream of flows being created and destroyed' },
      { cmd: 'sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max', note: 'utilization vs capacity — alert well before they meet' }
    ],
    production: 'A full conntrack table drops NEW connections while established ones sail on — a uniquely confusing failure. High-churn proxies and DNS burn entries fast; raise nf_conntrack_max, cut established timeouts, or use NOTRACK for stateless workloads.',
    interview: [
      'Why does NAT need conntrack at all?',
      'What happens to new vs existing connections when the table fills?',
      'What are the two tuples stored per flow, and why two?'
    ],
    sources: ['net/netfilter/nf_conntrack_core.c', 'man 8 conntrack', '/proc/sys/net/netfilter/'],
    related: ['netfilter', 'nat', 'iptables', 'dnat']
  },
  qdisc: {
    name: 'Queueing Discipline',
    tagline: "The queue with opinions: decides what waits, what goes next, and what gets thrown away",
    description: "Between the IP stack and the driver sits a queue, and it is far cleverer than the line at a shop. The modern default, fq_codel, keeps a separate little queue per flow so one bulk upload cannot bury your tiny SYN, and deliberately drops or ECN-marks packets that have been waiting too long — because a permanently full buffer adds delay without adding throughput. Its sibling fq does per-flow pacing, spacing packets out smoothly for congestion controls like BBR. This is the exact spot where the bufferbloat war was fought and won.",
    history: "Linux traffic control goes back to Alexey Kuznetsov's work in the late 1990s, with CBQ and pfifo_fast. Jim Gettys named bufferbloat in 2010; Kathleen Nichols and Van Jacobson answered with CoDel in 2012, and Eric Dumazet's fq_codel and sch_fq in 2013 — together with byte queue limits in 2011 — rebuilt the Linux egress path around it. systemd made fq_codel the default qdisc in 2017.",
    purpose: "To keep the link busy without letting the queue in front of it swell into seconds of pointless delay.",
    responsibilities: [
      'Enqueue packets from the stack; dequeue toward the driver at link/pacing rate',
      'Isolate flows (fq) so one bulk upload cannot starve your SYN',
      'Drop or ECN-mark early (CoDel) to keep standing queues near 5ms',
      'Enforce shaping/priorities (htb, taprio) and TCP pacing rates'
    ],
    commands: [
      { cmd: 'tc qdisc show', note: 'which discipline each interface runs' },
      { cmd: 'tc -s qdisc show dev eth0', note: 'queue depth, drops, overlimits, marks — the bufferbloat evidence' },
      { cmd: 'sysctl net.core.default_qdisc', note: 'system default for new interfaces (fq_codel or fq)' }
    ],
    production: 'Router-side fq_codel (or CAKE) transforms loaded-link latency from seconds to milliseconds. Server-side, BBR requires fq or pacing support; drops counted here are often the first sign an uplink is saturated.',
    interview: [
      'What is bufferbloat and why do big FIFO buffers cause it?',
      'How does CoDel decide to drop with the queue nowhere near full?',
      'Why does BBR want the fq qdisc specifically?'
    ],
    sources: ['net/sched/sch_fq_codel.c', 'RFC 8290 (fq_codel)', 'man 8 tc', 'Gettys & Nichols, "Bufferbloat" (ACM Queue 2011)'],
    related: ['tcp', 'driver', 'ip', 'homerouter']
  },
  driver: {
    name: 'NIC Driver',
    tagline: "The kernel module that speaks one particular chip's private language",
    description: "Every network card is different, and the driver — e1000e, igb, mlx5_core and hundreds of others — is the translator. It fills in a fixed set of functions the kernel calls: ndo_start_xmit to hand a frame to the hardware, a NAPI poll function to gather up the frames that have arrived, ethtool operations to report counters and toggle offloads. Underneath those tidy names it is having the register-level conversation with the silicon, writing descriptors, ringing doorbells, and knowing every one of that chip's quirks.",
    history: "Donald Becker's NE2000 and Tulip drivers in the early 1990s bootstrapped Linux's support for network hardware. The modern split — generic code in net/core, silicon-specific code under drivers/net/ethernet per vendor — together with NAPI in 2001 and BQL in 2011, turned drivers into thin, fast shovels of descriptors rather than sprawling stacks of their own.",
    purpose: "To turn the kernel's one abstract idea of a network interface into the specific registers, rings and rituals of a single chipset.",
    responsibilities: [
      'Map sk_buffs to DMA descriptors and ring doorbell registers on transmit',
      'Allocate RX buffers and replenish rings as NAPI consumes them',
      'Configure offloads (checksum, TSO/GRO), queues (RSS), and interrupt moderation',
      'Report stats, link state, and firmware handshakes'
    ],
    commands: [
      { cmd: 'ethtool -i eth0', note: 'driver name, version, firmware, PCI bus address' },
      { cmd: 'ethtool -S eth0 | grep -iE "drop|err|miss" | head', note: 'silicon-level drop counters the generic stack cannot see' },
      { cmd: 'lspci -vk | grep -A3 Ethernet', note: 'which kernel module claimed the NIC' }
    ],
    production: 'Driver/firmware pairs matter: a mismatch shows up as watchdog resets and inexplicable drops (dmesg tells the story). ethtool -S is per-vendor gold — rx_missed means the ring overflowed, tx_timeout means the hardware wedged.',
    interview: [
      'Trace one packet from ndo_start_xmit to the wire.',
      'What is interrupt moderation and its latency/throughput trade?',
      'Where would you look when the NIC drops packets the kernel never counts?'
    ],
    sources: ['drivers/net/ethernet/intel/e1000e/netdev.c', 'include/linux/netdevice.h', 'Documentation/networking/'],
    related: ['nic', 'ringbuffer', 'napi', 'qdisc']
  },
  ringbuffer: {
    name: 'RX/TX Ring Buffers',
    tagline: "A circular to-do list that the CPU and the network card share",
    description: "The CPU and the network card run at completely different speeds, so they talk through rings: circular arrays of small descriptors, each pointing at a buffer of packet data, with two indices marking how far one side has filled and how far the other has drained. On transmit the driver fills and the NIC drains; on receive the NIC fills and NAPI drains. When packets arrive faster than the kernel can empty the ring, they die right here — counted precisely as rx_missed or no_buffer, and mourned by nobody.",
    history: "Descriptor rings became the standard shape of a network card in the 1990s, in the DEC Tulip era, as programmed I/O gave way to bus-mastering DMA. Ring sizing became a first-class tuning knob as 10, 40 and 100GbE arrived, and BQL in 2011 finally capped how many bytes could sit in flight, so transmit rings stopped being a hidden reservoir of bufferbloat.",
    purpose: "To let two independent pieces of hardware hand work to each other continuously, without either one ever waiting for the other.",
    responsibilities: [
      'Hold TX descriptors until the NIC DMAs and completes them',
      'Hold ready RX buffers for the NIC to fill with arriving frames',
      'Signal completion via index updates the other side polls',
      'Absorb bursts up to ring size; drop beyond it (rx_missed/no_buffer)'
    ],
    commands: [
      { cmd: 'ethtool -g eth0', note: 'current vs maximum ring sizes' },
      { cmd: 'ethtool -G eth0 rx 4096', note: 'grow the RX ring — the standard fix for microburst drops' },
      { cmd: 'ethtool -S eth0 | grep -iE "rx_missed|rx_no_buffer|fifo"', note: 'the ring-overflow body count' }
    ],
    production: 'Bigger rings absorb microbursts but add worst-case latency and memory; low-latency trading systems shrink rings, packet-capture boxes max them. Pair ring sizing with interrupt coalescing (ethtool -c) — they trade against each other.',
    interview: [
      'Why rings rather than a linked list of buffers?',
      'What exactly happens when the RX ring is full and a frame arrives?',
      'How do ring size and interrupt coalescing interact?'
    ],
    sources: ['drivers/net/ethernet/intel/e1000e/netdev.c (e1000_clean_rx_irq)', 'Documentation/networking/driver.rst', 'ethtool(8)'],
    related: ['driver', 'dma', 'napi', 'nic']
  },
  dma: {
    name: 'DMA Engine',
    tagline: "The card moves the memory itself; the CPU only says where",
    description: "Direct Memory Access is the arrangement that lets the network card read and write system RAM on its own. The driver maps a buffer's address into a descriptor so the device can see it, the card takes over the PCIe bus and moves the bytes itself, and the CPU is bothered only once the transfer is finished. Data moves; the CPU merely conducts.",
    history: "DMA long predates networking — it comes from 1960s mainframe channel I/O — and PCI bus mastering made it universal for network cards in the 1990s. The IOMMU era, with Intel VT-d from 2007 onward, added address translation and isolation so a device can no longer scribble anywhere in RAM it fancies, closing a door DMA had left wide open. See also: the Thunderbolt attacks.",
    purpose: "To move packet data between device and memory at full bus speed while costing the CPU almost nothing.",
    responsibilities: [
      'Translate buffer addresses via dma_map_single/page for device visibility',
      'Bus-master transfers over PCIe per descriptor instructions',
      'Maintain cache coherence around transfers (sync APIs on non-coherent platforms)',
      'Respect IOMMU mappings that sandbox device memory access'
    ],
    commands: [
      { cmd: 'dmesg | grep -iE "iommu|dmar" | head', note: 'is the IOMMU on, and in which mode' },
      { cmd: 'cat /proc/iomem | grep -i -A1 ether', note: 'the NIC BAR windows mapped into physical address space' },
      { cmd: 'lspci -vv -s $(lspci | awk "/Ethernet/{print \\$1; exit}") | grep -E "BusMaster|MSI"', note: 'confirm bus mastering is enabled for the NIC' }
    ],
    production: 'IOMMU on = isolation but per-mapping overhead (a real % at 100GbE — hence iommu passthrough modes); IOMMU off = speed and a security trade. Zero-copy paths (sendfile, io_uring registered buffers) exist to keep the CPU out of data movement.',
    interview: [
      'Why does the CPU not copy packet data to the NIC?',
      'What problem does the IOMMU solve for DMA-capable devices?',
      'What does it mean to DMA-map a buffer, and why is unmapping mandatory?'
    ],
    sources: ['Documentation/core-api/dma-api.rst', 'kernel/dma/', 'drivers/iommu/'],
    related: ['ringbuffer', 'nic', 'memmap', 'driver']
  },
  irq: {
    name: 'Hardware Interrupt (IRQ)',
    tagline: "The card taps the CPU on the shoulder — and says as little as it possibly can",
    description: "When frames have finished arriving, the network card raises an MSI-X interrupt and the CPU drops whatever it was doing to run the handler. That handler is deliberately tiny: acknowledge the device, ask the kernel to schedule the real work for later via NAPI, switch off further receive interrupts so a flood cannot drown the machine, and return — all within microseconds. Interrupts are for waking up, not for working.",
    history: "Interrupts date to the UNIVAC 1103 in 1953. Shared, level-triggered PCI line interrupts gave way to MSI and MSI-X around 2003, which gave each queue on a card its own vector that could be steered at a particular CPU — the foundation of multi-core packet processing, and the entire reason the irqbalance daemon exists.",
    purpose: "To deliver news from hardware with the lowest possible latency and the shortest possible stay in the one context where nothing else can run.",
    responsibilities: [
      'Vector the CPU to the registered handler on device signal',
      'Acknowledge the device and mask further interrupts for the queue',
      'Schedule the softirq/NAPI context that will do the actual work',
      'Distribute across cores via per-queue MSI-X affinity'
    ],
    commands: [
      { cmd: 'grep -E "eth0|CPU" /proc/interrupts | head', note: 'per-queue interrupt counts per CPU — spot the hot core' },
      { cmd: 'cat /proc/irq/*/smp_affinity_list | head', note: 'which CPUs each vector may target' },
      { cmd: 'watch -d -n1 "grep eth0 /proc/interrupts"', note: 'watch interrupt rate live; -d highlights changes' }
    ],
    production: 'IRQ affinity is real capacity engineering: pin NIC queues to cores sharing L3 with the app, keep them off the cores running latency-critical threads, and verify irqbalance is not fighting your pinning.',
    interview: [
      'Why do IRQ handlers do as little as possible?',
      'What did MSI-X change versus shared PCI line interrupts?',
      'What is interrupt livelock and which mechanism prevents it?'
    ],
    sources: ['kernel/irq/', '/proc/interrupts', 'Documentation/core-api/genericirq.rst'],
    related: ['softirq', 'napi', 'cpu', 'nic']
  },
  softirq: {
    name: 'SoftIRQ',
    tagline: "The work the interrupt handler was too polite to do",
    description: "The interrupt handler does almost nothing and returns; the real work is deferred to a softirq, the kernel's bottom half. Moments later, with interrupts enabled again, do_softirq runs NET_RX: it polls the card, carries packets up through IP and TCP, and delivers them into socket queues, all in a per-CPU context that can be interrupted. When there is more work than a softirq is allowed to finish, it is handed to the ksoftirqd threads you can see sitting in top.",
    history: "Splitting interrupt work into a fast top half and a deferred bottom half is classic UNIX. Linux formalized softirqs during the 2.3 and 2.4 rewrite between 1999 and 2001, replacing the old bottom halves with per-CPU contexts that could run in parallel. Networking has lived in NET_RX and NET_TX ever since, and ksoftirqd exists precisely to cap how badly they can starve userspace.",
    purpose: "To do the heavy per-packet work outside interrupt context — batched, per-CPU and preemptible-ish — so ordinary programs still get a turn.",
    responsibilities: [
      'Run NET_RX/NET_TX processing after hard IRQs return',
      'Execute NAPI poll loops within budget limits',
      'Punt sustained load to ksoftirqd threads so userspace still runs',
      'Track per-CPU counts (/proc/softirqs) and time-squeeze events'
    ],
    commands: [
      { cmd: 'grep -E "NET_RX|NET_TX|CPU" /proc/softirqs', note: 'per-CPU softirq counts — imbalance means bad IRQ steering' },
      { cmd: 'mpstat -I SCPU 1 3', note: 'softirq CPU share per core over time' },
      { cmd: 'ps -eo pid,comm | grep ksoftirqd', note: 'one deferral thread per CPU, busy only under real load' }
    ],
    production: 'A core at 100% si in top is the packet-processing bottleneck signature — fix with RSS/RPS spreading, GRO, and coalescing. The third column of /proc/net/softnet_stat counts time squeezes: budget exhausted with work remaining.',
    interview: [
      'Why does packet processing not happen in the hard IRQ handler?',
      'What does high %si on one core indicate and how do you spread it?',
      'When does ksoftirqd take over softirq work?'
    ],
    sources: ['kernel/softirq.c', 'net/core/dev.c (net_rx_action)', '/proc/softirqs'],
    related: ['irq', 'napi', 'scheduler', 'cpu']
  },
  napi: {
    name: 'NAPI',
    tagline: "Interrupt when quiet, poll when busy — the 2001 cure for a machine drowning in its own interrupts",
    description: "At high packet rates, taking an interrupt for every arrival is a catastrophe: the machine spends all its time answering the door and never reads the mail. NAPI switches modes on its own — the first packet raises an interrupt, then the kernel masks interrupts for that queue and simply asks the driver's poll() for packets in batches, up to a weight of 64 per pass and a budget of 300 per softirq round. Under load the per-packet interrupt cost quietly disappears, and when things go quiet interrupts return so latency stays low.",
    history: "NAPI came from Jamal Hadi Salim, Robert Olsson and Alexey Kuznetsov, published as Beyond Softnet at USENIX in 2001 and mainlined in 2.4.20 and 2.5. It cured interrupt livelock, the gigabit-era failure where a machine sat at 100% CPU handling interrupts while accomplishing nothing at all. GRO later stacked on top, merging small packets into larger ones during the same poll.",
    purpose: "To keep the cost per packet near zero when traffic is heavy, without adding any delay when it is not.",
    responsibilities: [
      'Disable per-queue RX interrupts on first packet; schedule the poll',
      'Drain rings in poll() up to weight/budget; do GRO merging',
      'Re-enable interrupts only when the ring runs empty',
      'Account budget exhaustion (softnet time squeeze) for observability'
    ],
    commands: [
      { cmd: 'sysctl net.core.netdev_budget net.core.netdev_budget_usecs', note: 'the global per-round polling budget' },
      { cmd: 'cat /proc/net/softnet_stat | head -4', note: 'col1 processed, col2 dropped, col3 time squeeze — per CPU, in hex' },
      { cmd: 'ethtool -c eth0', note: 'interrupt coalescing settings that interact with NAPI behavior' }
    ],
    production: 'Rising time-squeeze counters mean the budget runs dry — raise netdev_budget or add RX queues/CPUs. Busy-polling (SO_BUSY_POLL) trades CPU burn for microseconds where it matters; XDP hooks into this same poll loop.',
    interview: [
      'What is interrupt livelock and how does NAPI break it?',
      'What do NAPI weight and netdev_budget each limit?',
      'When do RX interrupts get re-enabled after polling starts?'
    ],
    sources: ['net/core/dev.c (__napi_poll, napi_schedule)', 'Salim/Olsson/Kuznetsov, "Beyond Softnet" (USENIX 2001)', 'Documentation/networking/napi.rst'],
    related: ['softirq', 'irq', 'ringbuffer', 'driver']
  },
  nic: {
    name: 'Network Interface Card',
    tagline: "Where software ends and physics begins",
    description: "The network interface card is the silicon that turns instructions into signals. It fetches the frame out of RAM by itself over DMA, computes checksums in hardware, chops oversized sends into wire-sized frames (TSO), appends the trailing FCS check code, and hands the bits to the PHY. Modern cards do far more besides: hashing arriving flows across multiple receive queues with RSS so several CPUs can share the load, timestamping packets, and absorbing more of the stack every year as individual CPU cores stopped getting faster.",
    history: "Robert Metcalfe and David Boggs built Ethernet at Xerox PARC in 1973; 3Com, which Metcalfe founded in 1979, sold the first Ethernet cards, and IEEE 802.3 standardized it in 1983. Speeds climbed from 10Mb to 100 in 1995, to 1G in 1999, 10G in 2002, and past 100G today — and NICs absorbed ever more of the stack as CPUs stopped getting faster per core.",
    purpose: "To carry the kernel's neat abstractions across the boundary into a physical medium, and to do in silicon whatever silicon does better.",
    responsibilities: [
      'DMA frames to/from host memory via descriptor rings',
      'Compute/verify checksums; segment large sends (TSO) and coalesce receives (LRO/GRO assist)',
      'Hash flows across RX queues (RSS) and raise MSI-X interrupts',
      'Append/verify the Ethernet FCS and manage the MAC-layer protocol'
    ],
    commands: [
      { cmd: 'ip -s link show eth0', note: 'link state, MAC, MTU, and packet/error/drop counters' },
      { cmd: 'ethtool -k eth0 | grep -E "segmentation|checksum|scatter"', note: 'which offloads are on — disable when debugging odd captures' },
      { cmd: 'ethtool -m eth0 2>/dev/null | head', note: 'read SFP/optical transceiver diagnostics (power levels, temperature)' },
      { cmd: 'ethtool eth0 | grep -E "Speed|Duplex|Link"', note: 'the classic duplex/speed mismatch check' }
    ],
    production: 'Offloads make tcpdump lie: you will see 64KB "packets" because TSO/GRO happened around the capture point. Disable with ethtool -K when investigating MTU/fragmentation. Half-duplex negotiation on a gigabit link is still a real, career-defining bug.',
    interview: [
      'What is TSO and why does tcpdump show packets larger than the MTU?',
      'How does RSS decide which CPU handles a given flow?',
      'What does the FCS protect, and who computes it?'
    ],
    sources: ['IEEE 802.3', 'Documentation/networking/segmentation-offloads.rst', 'man 8 ethtool'],
    related: ['driver', 'phy', 'ethframe', 'dma']
  },
  ethframe: {
    name: 'Ethernet Frame',
    tagline: "14 bytes of header, up to 1500 of cargo, 4 bytes of checksum — repeated a trillion times",
    description: "This is the envelope a packet travels in across a single link. The front says who it is for and who it is from, using 48-bit hardware addresses — a4:91:b1:0c:44:e2 and 3c:07:54:6a:2b:91 — followed by a two-byte EtherType saying what is inside, where 0x0800 means an IPv4 packet. Then the payload, then a 32-bit CRC so a corrupted frame is discarded rather than believed, with a preamble and an interframe gap wrapping it on the wire. The crucial subtlety: that destination address is only the next machine along, never the final one — that is IP's job.",
    history: "Metcalfe's 1973 memo described stations sharing one coaxial cable and listening before speaking, CSMA/CD. The DIX Ethernet II standard from DEC, Intel and Xerox in 1982 fixed the EtherType field still used today, and IEEE 802.3 in 1983 standardized an alternative framing that treats the same field as a length. Switching in the 1990s made collisions history, but the frame format itself has survived every leap in speed unchanged.",
    purpose: "To carry a payload safely from one machine to the machine standing right next to it, and to notice if it got scrambled on the way.",
    responsibilities: [
      'Address the next hop via 48-bit MAC addresses',
      'Identify the payload protocol via EtherType (0x0800 IPv4, 0x0806 ARP, 0x86DD IPv6)',
      'Protect integrity with a 32-bit FCS/CRC — corrupt frames are dropped, never repaired',
      'Carry optional 802.1Q VLAN tags (4 extra bytes) for segmentation'
    ],
    commands: [
      { cmd: 'tcpdump -e -ni eth0 -c 5', note: '-e prints the Ethernet header: MACs and EtherType' },
      { cmd: 'tcpdump -ni eth0 -XX -c 1', note: 'hex dump starting at the L2 header — see the bytes themselves' },
      { cmd: 'ip -d link show eth0 | grep -E "mtu|vlan"', note: 'MTU and VLAN configuration for the interface' }
    ],
    production: 'MTU mismatches (1500 vs 9000 jumbo vs 1450 in overlays like VXLAN/WireGuard) are the endemic cloud networking bug: small packets fine, large packets vanish. Always test with ping -M do -s before blaming the application.',
    interview: [
      'Whose MAC address is in the destination field for a packet headed to the internet?',
      'What is the minimum Ethernet frame size and why does padding exist?',
      'How much overhead does an 802.1Q VLAN tag add and what breaks?'
    ],
    sources: ['IEEE 802.3 clause 3', 'RFC 894 (IP over Ethernet)', 'include/uapi/linux/if_ether.h'],
    related: ['nic', 'arp', 'switch', 'ip']
  },
  wififrame: {
    name: '802.11 Frame',
    tagline: "Four address fields, an acknowledgement for every frame, and a room where everyone must take turns",
    description: "A Wi-Fi frame looks like an Ethernet frame that has been through something. It can carry up to four MAC addresses rather than two, because the access point relays between the air and the wired network, plus a sequence control field and QoS headers. Two things make it fundamentally different: every unicast frame is individually acknowledged and retried at the MAC layer, entirely invisibly to IP, and no station may transmit at all until it has listened, waited and won a random backoff — because the medium belongs to everyone at once.",
    history: "IEEE 802.11 arrived in 1997 at a stately 2 Mbps; 802.11b in 1999 made it a consumer reality and Wi-Fi Alliance branding made it a household word. Security lived several lifetimes: WEP, broken in 2001, then WPA in 2003, WPA2 with CCMP in 2004, and WPA3 with SAE in 2018. Speed followed its own path: MIMO with 802.11n in 2009, wider channels with ac in 2013, and scheduled OFDMA access with ax, better known as Wi-Fi 6, in 2019.",
    purpose: "To move link-layer frames across a shared, lossy radio channel with retries, encryption, and an orderly way of taking turns.",
    responsibilities: [
      'Contend for the medium: CSMA/CA, DIFS, random backoff, optional RTS/CTS',
      'Acknowledge and retransmit at the MAC layer, invisible to IP',
      'Encrypt per-frame (CCMP/GCMP under WPA2/WPA3)',
      'Adapt modulation and coding rate to signal quality; buffer for power-save clients'
    ],
    commands: [
      { cmd: 'iw dev wlan0 link', note: 'associated BSSID, signal dBm, current TX bitrate' },
      { cmd: 'iw dev wlan0 station dump | grep -E "signal|tx bitrate|tx retries|tx failed"', note: 'retry and failure counts — the real Wi-Fi health metric' },
      { cmd: 'iw dev wlan0 scan | grep -E "SSID|freq|signal" | head -20', note: 'the RF neighborhood you are competing with' }
    ],
    production: 'Wi-Fi latency variance comes from retries and airtime contention, not bandwidth: -75 dBm with 30% retries beats no bars, but jitter wrecks interactive traffic. Fixes are channel planning (non-overlapping 1/6/11), 5/6 GHz, and airtime-fair queueing on the AP.',
    interview: [
      'Why does Wi-Fi ACK at layer 2 when TCP already retransmits?',
      'What is the hidden node problem and how does RTS/CTS address it?',
      'Why do more clients on an AP hurt even when total bandwidth is unused?'
    ],
    sources: ['IEEE 802.11-2020', 'net/mac80211/', 'man 8 iw'],
    related: ['phy', 'signal', 'homerouter', 'nic']
  },
  phy: {
    name: 'PHY / Transceiver',
    tagline: "Turns bits into voltage, light or radio — and negotiates the link before any of it",
    description: "The PHY is the last piece of digital logic before the world turns analog. It converts the frame's bits into whatever the medium actually carries: 4D-PAM5 across four copper pairs for gigabit Ethernet, PAM4 on fiber at higher rates, OFDM subcarriers for Wi-Fi. It also does everything that makes a cable just work when you plug it in — agreeing speed and duplex with the other end, training the link, and recovering the sender's clock from the signal itself.",
    history: "10BASE-T used Manchester encoding in 1990; 100BASE-TX brought 4B/5B in 1995; and 1000BASE-T in 1999 wrung a full gigabit out of ordinary Cat5 by running all four pairs at once in both directions with 4D-PAM5 and echo cancellation — an achievement in digital signal processing as much as in networking. Auto-negotiation, standardized in 802.3u in 1995, ended the miserable era of manually matching duplex at both ends.",
    purpose: "To make an inherently analog medium behave reliably enough that every layer above it can pretend the world is digital.",
    responsibilities: [
      'Modulate/demodulate: line coding, symbol mapping, forward error correction',
      'Auto-negotiate speed, duplex, and flow control with the link partner',
      'Recover clock and maintain synchronization; report link up/down',
      'Manage cable/optical diagnostics and power (PoE, EEE low-power idle)'
    ],
    commands: [
      { cmd: 'ethtool eth0 | grep -A5 "Supported link modes"', note: 'what the PHY can negotiate vs what it settled on' },
      { cmd: 'ethtool --cable-test eth0', note: 'TDR cable test: finds the distance to a break or short' },
      { cmd: 'ethtool -S eth0 | grep -iE "crc|symbol|carrier"', note: 'CRC/symbol errors point at physical problems, not software' }
    ],
    production: 'Physical layer faults masquerade as application problems: rising rx_crc_errors means a bad cable, dirty optic, or EMI — no amount of TCP tuning will fix it. Check optical power with ethtool -m before touching anything above L1.',
    interview: [
      'What does auto-negotiation exchange and what happens when one side is forced?',
      'Why do CRC errors indicate a physical problem rather than a software one?',
      'Why can gigabit run over the same Cat5 that carried 100Mb?'
    ],
    sources: ['IEEE 802.3 clause 40 (1000BASE-T)', 'drivers/net/phy/', 'man 8 ethtool'],
    related: ['nic', 'signal', 'ethframe', 'wififrame']
  },
  signal: {
    name: 'Physical Signal',
    tagline: "The packet, briefly, as physics: electrons, photons, or 2.4 GHz in the air",
    description: "Here the frame stops being data and becomes energy — a differential voltage across a twisted pair, a pulse of laser light down single-mode fiber, or a modulated radio wave. Light in glass travels at roughly two-thirds of its vacuum speed, about 200,000 km/s, which works out to some 5 microseconds per kilometer. That number is the floor: no engineer, no protocol and no amount of money moves a request across an ocean faster than light in glass allows.",
    history: "Telegraph signaling in the 1830s established that symbols could be sent as electricity. Claude Shannon's 1948 information theory set the capacity ceiling every modulation scheme since has tried to approach. And in 1966 Charles Kao and George Hockham predicted glass could be made pure enough to carry light for kilometers — an idea that won Kao a share of the 2009 Nobel Prize and built the intercontinental optical backbone the internet now rides on.",
    purpose: "To physically carry information across distance, within the hard limits set by the medium and by the speed of light.",
    responsibilities: [
      'Carry modulated symbols with sufficient SNR for the receiver to decode',
      'Impose propagation delay (~5 µs/km fiber) and attenuation over distance',
      'Suffer noise, interference, dispersion — the reason FEC and CRCs exist',
      'Define the capacity ceiling per Shannon for a given bandwidth and SNR'
    ],
    commands: [
      { cmd: 'ping -c 20 1.1.1.1 | tail -2', note: 'the min RTT is mostly propagation physics; the jitter is everything else' },
      { cmd: 'ethtool -m eth0 | grep -iE "power|temperature"', note: 'actual optical transmit/receive power in dBm' },
      { cmd: 'iw dev wlan0 station dump | grep signal', note: 'radio signal strength and noise floor in dBm' }
    ],
    production: 'Light in fiber covers roughly 200 km/ms, so New York to London is ~28ms one way at best — no CDN, protocol, or budget beats that. This is why edge presence, not bandwidth, dominates latency architecture.',
    interview: [
      'Why is latency between continents irreducible below a certain floor?',
      'Why is fiber propagation slower than c, and by how much?',
      'How does Shannon capacity relate to why Wi-Fi slows at range?'
    ],
    sources: ['Shannon, "A Mathematical Theory of Communication" (1948)', 'ITU-T G.652 (fiber)', 'IEEE 802.3'],
    related: ['phy', 'fiber', 'wififrame', 'nic']
  },
  switch: {
    name: 'Ethernet Switch',
    tagline: "Learns who lives where by listening, and only shouts when it truly has to",
    description: "A switch forwards frames between ports, and the charming part is how it learns where everyone is: it simply watches the source address of every frame that passes and notes which port that machine is on, filling a CAM table. If it does not yet know where a destination lives, it floods the frame out of every port and lets the reply teach it. It never looks at IP addresses and never decrements TTL — as far as a switch is concerned, IP does not exist.",
    history: "Kalpana shipped the first Ethernet switch, the EtherSwitch, in 1990, replacing hubs and the shared collision domains they imposed on everyone; Cisco acquired the company in 1994. Radia Perlman's Spanning Tree Protocol from 1985, later standardized as 802.1D, made redundant switch topologies survivable by pruning the links that would form a loop — necessary because Ethernet frames, unlike IP packets, have no TTL to save them from circling forever.",
    purpose: "To send each frame only where it actually needs to go, giving every port its own full-duplex, collision-free link.",
    responsibilities: [
      'Learn source MAC to port mappings into the CAM table with aging timers',
      'Forward known unicast to one port; flood unknown/broadcast/multicast',
      'Run STP/RSTP to keep the topology loop-free',
      'Segment with VLANs (802.1Q) and enforce port security'
    ],
    commands: [
      { cmd: 'bridge fdb show', note: 'the MAC table of a Linux software bridge — same concept as switch CAM' },
      { cmd: 'ip -d link show type bridge', note: 'bridge configuration including STP state' },
      { cmd: 'tcpdump -eni eth0 "ether broadcast" -c 5', note: 'the flooded traffic every port sees regardless of switching' }
    ],
    production: 'CAM table exhaustion (attack or scale) turns a switch into a hub — everyone sees everything. Broadcast storms from L2 loops without STP saturate links in seconds; this is why cloud networks abandoned large L2 domains for routed fabrics.',
    interview: [
      'What does a switch do with a frame whose destination MAC it has never seen?',
      'Why does Ethernet need spanning tree when IP has TTL?',
      'Hub vs switch vs router — what does each examine?'
    ],
    sources: ['IEEE 802.1D / 802.1Q', 'net/bridge/br_fdb.c', 'Perlman, "An Algorithm for Distributed Computation of a Spanning Tree" (1985)'],
    related: ['ethframe', 'arp', 'homerouter', 'bridge']
  },
  homerouter: {
    name: 'Home Router / Gateway',
    tagline: "Switch, access point, DHCP server, DNS forwarder, firewall and NAT box in one plastic shell",
    description: "The little box at 192.168.1.1 does a startling number of jobs at once. For our packet it is the default gateway: it accepts the frame addressed to its own MAC a4:91:b1:0c:44:e2, looks at the IP inside, rewrites the source to the single public address the ISP gave it (203.0.113.77), notes the flow so the reply can be sent back to the right machine, and forwards it toward the internet. In its spare moments it is handing out DHCP leases and answering DNS questions, usually via dnsmasq.",
    history: "Consumer NAT routers arrived with broadband around 1999 and 2000 — the Linksys BEFSR41 and its cousins — and most of them ran Linux. A GPL compliance fight over the source code of the WRT54G in 2003 forced that code into the open and gave birth to OpenWrt and DD-WRT, arguably the most consequential open-source firmware lineage in home networking.",
    purpose: "To let a house full of devices share one public address, one connection and one set of names, with the front door firmly shut by default.",
    responsibilities: [
      'Route between LAN and WAN; be the default gateway for all clients',
      'Perform NAT/PAT so many private hosts share one public IP',
      'Serve DHCP leases and forward DNS (dnsmasq) for the LAN',
      'Firewall inbound traffic by default; run the Wi-Fi AP and LAN switch'
    ],
    commands: [
      { cmd: 'ip route | grep default', note: 'confirm the gateway your traffic actually uses' },
      { cmd: 'ip neigh show 192.168.1.1', note: 'the gateway MAC your frames are addressed to' },
      { cmd: 'traceroute -n -m 3 1.1.1.1', note: 'hop 1 is the router; hop 2 is usually the ISP edge' },
      { cmd: 'nmap -Pn -p 53,80,443 192.168.1.1', note: 'what services the gateway exposes to the LAN' }
    ],
    production: 'Consumer routers are the weakest link in home latency: undersized buffers cause bufferbloat (fix with SQM/fq_codel in OpenWrt), and small conntrack tables break heavy-connection workloads. Firmware is also chronically unpatched — a real attack surface.',
    interview: [
      'List every distinct network function a home router performs.',
      'Why does the router rewrite your source port, not just your source IP?',
      'How does a device on the LAN discover the gateway address at boot?'
    ],
    sources: ['OpenWrt documentation', 'RFC 2131 (DHCP)', 'RFC 3022 (traditional NAT)'],
    related: ['nat', 'switch', 'modem', 'arp']
  },
  nat: {
    name: 'NAT (Network Address Translation)',
    tagline: "One public address, many private machines — the hack that bought IPv4 an extra thirty years",
    description: "There were never enough IPv4 addresses for every device, so your router tells a small lie on your behalf. As the packet leaves, NAT rewrites the source from your private 192.168.1.23:51324 to the public 203.0.113.77:51324, remapping the port if it collides with someone else's, and writes the swap down. When the reply comes back addressed to the public side, the router looks up the note and puts the original address back. Your laptop never knows — and that same mechanism is exactly why nobody on the internet can start a connection to it.",
    history: "Kjeld Egevang and Paul Francis proposed NAT in RFC 1631 in 1994 as an explicit stopgap for address exhaustion, and RFC 3022 in 2001 documented the port-translating NAPT form everyone actually uses. It broke the end-to-end principle so thoroughly that a whole generation of protocols — SIP, FTP, peer-to-peer everything — needed helpers, STUN, TURN and ICE simply to survive it.",
    purpose: "To let a whole network of machines share a single routable address, buying the internet several extra decades of breathing room.",
    responsibilities: [
      'Rewrite source address/port on egress and restore on ingress',
      'Maintain the translation table with per-flow timeouts',
      'Recompute IP/TCP/UDP checksums after rewriting',
      'Provide implicit inbound blocking (unsolicited traffic has no mapping)'
    ],
    commands: [
      { cmd: 'conntrack -L -n | head', note: 'the -n filter shows NATed flows with both tuples' },
      { cmd: 'iptables -t nat -L POSTROUTING -n -v', note: 'the MASQUERADE/SNAT rules doing the rewriting' },
      { cmd: 'curl -s ifconfig.me; ip addr show | grep "inet "', note: 'the public address the world sees vs your private one' }
    ],
    production: 'CGNAT at the ISP (RFC 6598 100.64/10) stacks a second NAT on top, breaking port forwarding and confusing geolocation. Port exhaustion is real: one public IP has ~64k ports per destination tuple, which CGNAT and busy NAT gateways genuinely hit.',
    interview: [
      'Why does NAT require connection tracking while routing does not?',
      'What is hairpinning/NAT loopback and why does it often fail?',
      'How do two hosts behind NATs establish a direct P2P connection?'
    ],
    sources: ['RFC 3022', 'RFC 6598 (CGNAT space)', 'net/netfilter/nf_nat_core.c'],
    related: ['homerouter', 'conntrack', 'iptables', 'ip']
  },
  modem: {
    name: 'Modem / ONT',
    tagline: "Translates your Ethernet into whatever the last mile actually speaks",
    description: "Your home network speaks Ethernet; the cable, fiber or phone line to your provider does not. The modem is the translator: RF channels on coax for DOCSIS cable, laser bursts on a shared fiber for PON, tones on copper for DSL. It is also the point where your traffic joins a medium shared with the whole neighborhood, and where you discover that the upstream direction is usually far narrower than the downstream one.",
    history: "Dial-up modems began with the Bell 103 in 1962 and eventually topped out at 56k. DOCSIS 1.0, from CableLabs in 1997, put IP traffic on cable TV plant; ADSL in 1998 reused the existing phone copper. GPON, standardized as ITU-T G.984 in 2003, and now XGS-PON brought symmetric gigabit fiber, while DOCSIS 3.1 in 2013 added OFDM and full-duplex ambitions to keep coax competitive.",
    purpose: "To convert continuously between the home network and the provider's access network, in both directions.",
    responsibilities: [
      'Convert Ethernet frames to the access-layer encapsulation (DOCSIS/PON/DSL)',
      'Request upstream transmit grants from the CMTS/OLT — the medium is scheduled, not free',
      'Maintain sync, power levels, and error correction on the physical plant',
      'Report diagnostics: SNR, correctable/uncorrectable codewords, optical power'
    ],
    commands: [
      { cmd: 'curl -s http://192.168.100.1/ | head -20', note: 'most cable modems serve a status page at this fixed address' },
      { cmd: 'ping -c 50 -i 0.2 192.168.1.1 | tail -3', note: 'baseline the LAN before blaming the modem for latency' },
      { cmd: 'mtr -rwc 100 1.1.1.1', note: 'loss appearing at the first ISP hop points to the access link' }
    ],
    production: 'On DOCSIS, upstream is a scheduled, contended resource: request-grant cycles add several ms of latency and evening congestion is shared-segment congestion. High uncorrectable codeword counts mean plant problems the ISP must fix — no configuration change will help.',
    interview: [
      'Why is cable upstream typically much slower than downstream?',
      'What does a modem do that a router does not?',
      'Why does PON mean you share capacity with neighbors, and how is it arbitrated?'
    ],
    sources: ['CableLabs DOCSIS 3.1 specifications', 'ITU-T G.984 (GPON)', 'RFC 4639 (DOCSIS management)'],
    related: ['homerouter', 'headend', 'signal', 'phy']
  },
  headend: {
    name: 'ISP Headend / CMTS',
    tagline: "Where a whole neighborhood's connections land and turn into ordinary internet traffic",
    description: "Every access line in an area terminates in one place: a CMTS for cable, an OLT for fiber. It is the far end of your modem's conversation, and it does the scheduling — because on a shared medium, somebody has to decide which modem may transmit in which moment, and it grants those slots. Once frames arrive it strips the access-layer encapsulation and hands plain IP traffic to the provider's routed core, applying your subscription's rate limits on the way past.",
    history: "Cable headends began life in the 1950s and 60s as places to aggregate television signals. DOCSIS in 1997 added the CMTS and turned them into two-way IP infrastructure. In the 2010s distributed access architecture, notably Remote PHY, pushed the digital termination deep into neighborhoods to shorten the analog runs and increase capacity.",
    purpose: "To gather hundreds of homes onto the provider's network at once, while policing how much of it each one may use.",
    responsibilities: [
      'Schedule upstream grants and downstream channel bonding per modem',
      'Terminate access encapsulation and route/bridge into the ISP core',
      'Provision service tiers: rate shaping, QoS, DHCP option handling',
      'Aggregate a service group — typically hundreds of homes per segment'
    ],
    commands: [
      { cmd: 'mtr -rwc 100 8.8.8.8 | head -8', note: 'hop 2-3 is usually the headend/aggregation router' },
      { cmd: 'traceroute -n -q3 1.1.1.1', note: 'the first hops with provider rDNS reveal access topology' },
      { cmd: 'ping -c 100 -i 0.2 <hop2-ip> | tail -3', note: 'evening latency inflation here means shared segment congestion' }
    ],
    production: 'Neighborhood congestion shows as time-of-day latency and loss at hop 2-3 while hop 1 stays clean — proof the problem is upstream of the customer. ISPs fix it by node splitting, not by anything a subscriber can configure.',
    interview: [
      'Why is broadband a shared medium and where is the contention point?',
      'How would you prove congestion is in the access network, not the home?',
      'What does the CMTS schedule and why must upstream be granted?'
    ],
    sources: ['CableLabs DOCSIS 3.1 MULPI spec', 'ITU-T G.984', 'RFC 7626 (privacy considerations)'],
    related: ['modem', 'ispcore', 'fiber', 'bgp']
  },
  ispcore: {
    name: 'ISP Core Network',
    tagline: "The provider's own motorway network between your street and the rest of the internet",
    description: "Once traffic leaves the neighborhood it enters the provider's core: very high capacity regional and national links between large routers. Inside, packets are often not routed hop by hop on IP addresses at all but label-switched with MPLS, which lets the operator steer traffic down chosen paths, while an interior protocol such as IS-IS or OSPF keeps everyone's map of the network current. Our packet to 104.18.32.7 crosses the whole thing in a few milliseconds and is handed off at a border router.",
    history: "Backbones grew out of NSFNET, the academic core that ran from 1985 to 1995 and climbed from 56 kbps to 45 Mbps, before the 1995 privatization handed the internet to commercial providers. MPLS began as Cisco's tag switching in 1996 and was standardized as RFC 3031 in 2001, blending ATM-style traffic engineering with IP routing; segment routing, RFC 8402 in 2018, is now simplifying it all over again.",
    purpose: "To move enormous aggregated traffic between edges reliably, with real engineering control over which path it takes and what happens when a link fails.",
    responsibilities: [
      'Route/label-switch aggregated traffic across the provider footprint',
      'Run IGP (IS-IS/OSPF) for topology and iBGP for external route distribution',
      'Traffic-engineer paths and reconverge fast on link failure',
      'Enforce capacity planning, QoS classes, and DDoS scrubbing diversion'
    ],
    commands: [
      { cmd: 'traceroute -A -n api.shop.dev', note: '-A annotates each hop with its AS number — watch the network change hands' },
      { cmd: 'mtr -rwzc 100 104.18.32.7', note: 'per-hop loss/latency with ASN labels over 100 probes' },
      { cmd: 'whois -h whois.radb.net 203.0.113.77 | head', note: 'routing registry data for the prefix and its operator' }
    ],
    production: 'Mid-path routers often deprioritize ICMP, so traceroute loss at an intermediate hop that does not persist to the destination is a red herring — only end-to-end loss counts. Real core problems show as loss at every hop from a point onward.',
    interview: [
      'How do you read a traceroute and distinguish real loss from ICMP rate limiting?',
      'What does MPLS give an operator that plain IP routing does not?',
      'Where does an ISP hand traffic to another network, and how is that decided?'
    ],
    sources: ['RFC 3031 (MPLS)', 'RFC 8402 (segment routing)', 'RFC 1812 (router requirements)'],
    related: ['headend', 'bgp', 'fiber', 'tier1a']
  },
  bgp: {
    name: 'BGP',
    tagline: "The protocol that glues 75,000 independent networks into one internet, largely on trust",
    description: "Nobody runs the internet, so the networks that make it up have to tell each other what they can reach. BGP is that conversation: AS 13335 announces that it can get to 104.18.0.0/20, along with the list of networks the traffic would pass through on the way. Crucially, the best path is not the shortest or the fastest one — it is whichever each network's own policy prefers, ranked by local preference, then AS path length, then MED. The full table now exceeds 950,000 IPv4 prefixes.",
    history: "Kirk Lougheed and Yakov Rekhter sketched BGP on three napkins at an IETF meeting in 1989, which is why RFC 1105 is remembered as the two-napkin protocol. BGP-4, with support for CIDR, arrived in RFC 1654 and RFC 4271 between 1994 and 1995, and still runs the internet today. Security came late and partially: RPKI origin validation was specified in RFC 6480 in 2012 and is only now being widely deployed.",
    purpose: "To spread reachability information between independent networks, and let each of them apply its own commercial judgment to the result.",
    responsibilities: [
      'Advertise owned prefixes and propagate learned routes with AS path attributes',
      'Select best paths by policy: local pref, AS path length, origin, MED, IGP cost',
      'Detect loops via AS path; withdraw routes on failure and reconverge',
      'Enforce filtering, prefix limits, and RPKI origin validation'
    ],
    commands: [
      { cmd: 'whois -h whois.cymru.com " -v 104.18.32.7"', note: 'origin ASN, prefix, and registry for any IP' },
      { cmd: 'traceroute -A -n 104.18.32.7 | head', note: 'see AS boundaries being crossed hop by hop' },
      { cmd: 'curl -s https://stat.ripe.net/data/routing-status/data.json?resource=104.18.0.0/20 | head -c 400', note: 'RIPEstat: who announces this prefix, from where' }
    ],
    production: 'BGP failures are spectacular and global: the 2008 Pakistan/YouTube hijack, the 2021 Facebook outage (withdrawn prefixes made DNS unreachable), the 2019 Verizon/Cloudflare leak. Defenses are prefix filters, max-prefix limits, RPKI ROAs, and MANRS practices.',
    interview: [
      'Does BGP choose the fastest path? What does it actually optimize?',
      'How does a BGP hijack work and what stops it today?',
      'Why did Facebook’s 2021 BGP withdrawal take down DNS and everything else?'
    ],
    sources: ['RFC 4271', 'RFC 1105 (1989)', 'RFC 6480 (RPKI)', 'MANRS.org'],
    related: ['ispcore', 'tier1a', 'ixp', 'anycast']
  },
  fiber: {
    name: 'Long-Haul Fiber',
    tagline: "Strands of glass carrying terabits — and a propagation delay you cannot argue with",
    description: "Long-haul fiber is how continents are joined. One strand carries dozens of separate colors of light at once, a technique called DWDM, each color a channel of 100 to 800 Gbps, with EDFA optical amplifiers boosting them roughly every 80 km without ever converting back to electricity. Light in glass travels at about two-thirds of its vacuum speed, near enough 5 microseconds per kilometer, and that is the irreducible cost of every intercontinental request you will ever make.",
    history: "Charles Kao predicted low-loss fiber in 1966 and shared the 2009 Nobel Prize for it; Corning produced glass clear enough, at 20 dB/km, in 1970. TAT-8, the first transatlantic fiber cable, opened in 1988 carrying 280 Mbps. Erbium-doped amplifiers in 1987 and DWDM through the 1990s multiplied capacity by orders of magnitude, and today roughly 600 submarine cables carry well over 99% of all intercontinental traffic.",
    purpose: "To carry staggering aggregate bandwidth across continents and oceans with very little lost along the way.",
    responsibilities: [
      'Carry many wavelengths simultaneously via DWDM multiplexing',
      'Amplify optically (EDFA) without converting to electrical signals',
      'Impose ~5 µs/km propagation delay — the physics floor of RTT',
      'Provide protection switching over diverse paths when a cable is cut'
    ],
    commands: [
      { cmd: 'ping -c 20 <london-host> | tail -2', note: 'compare min RTT with distance/200,000 km-per-second: it will be close' },
      { cmd: 'ethtool -m eth0 | grep -iE "wavelength|power|type"', note: 'read the optical module: wavelength and TX/RX power' },
      { cmd: 'traceroute -n <intercontinental-host>', note: 'the big latency jump is the ocean crossing, always' }
    ],
    production: 'Submarine cable cuts (anchors, earthquakes) reroute traffic thousands of km and add tens of ms — visible instantly in global RTT dashboards. Financial firms pay enormous premiums for shorter physical paths because milliseconds are literally geography.',
    interview: [
      'Estimate the minimum possible RTT between New York and London. Show your reasoning.',
      'What is DWDM and why does it beat laying more fiber?',
      'Why is fiber slower than light in vacuum?'
    ],
    sources: ['ITU-T G.652 / G.694.1 (DWDM grid)', 'TeleGeography Submarine Cable Map', 'Kao & Hockham (1966)'],
    related: ['signal', 'ispcore', 'tier1a', 'ixp']
  },
  tier1a: {
    name: 'Tier 1 Transit (AS 3356 class)',
    tagline: "The rare networks that reach the whole internet without paying anyone a penny",
    description: "Most networks buy transit from somebody bigger. A Tier 1 network — Lumen at AS 3356, Arelion at AS 1299, GTT, NTT, Telia and a handful of others — has nobody to buy from: it reaches every destination on the internet purely through its own customers and settlement-free peering with the other Tier 1s. Our packet may well cross one on its way to Cloudflare, although Cloudflare peers so widely that it often does not need the favor.",
    history: "The Tier 1 idea took shape after NSFNET was privatized in 1995, when commercial backbones suddenly had to interconnect voluntarily rather than through a government-funded core. In 2005 a depeering dispute between Level 3 and Cogent split the internet into partitions that could not reach each other for weeks — vivid proof that full reachability is a business relationship, not a technical property.",
    purpose: "To sell global reachability as a product: transit downstream to everyone else, and traffic swapped as equals with the other giants.",
    responsibilities: [
      'Peer settlement-free with other Tier 1 networks',
      'Sell IP transit to ISPs, CDNs, and enterprises',
      'Operate high-capacity backbone and traffic engineering',
      'Enforce routing policy, prefix filtering, and DDoS mitigation at scale'
    ],
    commands: [
      { cmd: 'traceroute -A -n 104.18.32.7', note: 'watch the AS path: eyeball ISP → transit → destination network' },
      { cmd: 'whois -h whois.cymru.com " -v 4.2.2.2"', note: 'look up a well-known Tier 1 address and its ASN' },
      { cmd: 'curl -s "https://stat.ripe.net/data/asn-neighbours/data.json?resource=AS3356" | head -c 300', note: 'RIPEstat view of an AS peering graph' }
    ],
    production: 'Transit is bought in Mbps commit with 95th-percentile billing; multihoming to two transits plus IXP peering is standard resilience design. Depeering disputes are business events with packet-level consequences — always have a second path.',
    interview: [
      'What makes a network Tier 1, and why is it a commercial rather than technical status?',
      'Peering vs transit: who pays whom, and why?',
      'What happened when Level 3 and Cogent depeered in 2005?'
    ],
    sources: ['RFC 4271', 'CAIDA AS Rank', 'Norton, "The Internet Peering Playbook"'],
    related: ['bgp', 'tier1b', 'ixp', 'ispcore']
  },
  tier1b: {
    name: 'Peer Backbone (second transit hop)',
    tagline: "The other side of the handshake — a peer network carrying the packet the rest of the way",
    description: "This is the second large network on the path, reached over a settlement-free peering link or across an IXP fabric. No money moves in either direction here: each side carries the other's traffic because doing so is cheaper and faster for both than paying a third party to relay it. The packet crosses a boundary between two entirely separate companies without so much as an invoice being raised.",
    history: "Settlement-free peering was formalized at the original NAPs in 1994 and 1995 and matured through the IXP movement — LINX in 1994, DE-CIX in 1995, AMS-IX in 1997. In the 2010s the content networks (Google, Netflix, Cloudflare, Meta) became the largest traffic sources in the world, inverting the old ISP-centric hierarchy into today's flatter, far more directly peered internet.",
    purpose: "To exchange traffic directly with another large network, cutting cost, latency and hop count in one move.",
    responsibilities: [
      'Maintain settlement-free peering sessions and capacity with equals',
      'Honor traffic ratio and policy agreements',
      'Carry traffic to its own customers and downstream networks',
      'Reroute around failures without depending on a single upstream'
    ],
    commands: [
      { cmd: 'traceroute -A -n 104.18.32.7 | tail -8', note: 'the last AS transitions before the destination network' },
      { cmd: 'curl -s "https://api.bgpview.io/asn/13335/peers" | head -c 400', note: 'enumerate an AS peering set (Cloudflare = AS13335)' },
      { cmd: 'mtr -rwzc 50 104.18.32.7', note: 'ASN-annotated per-hop loss across the peering boundary' }
    ],
    production: 'Congested peering links are a classic asymmetric-performance cause: fine in one direction, terrible in the other, at a fixed time of day. Diagnosis needs both-direction traceroutes — the return path may cross an entirely different network.',
    interview: [
      'Why might traffic to a host take a different path than traffic from it?',
      'How would you demonstrate a congested peering link with public tools?',
      'What incentives make settlement-free peering stable?'
    ],
    sources: ['PeeringDB', 'CAIDA AS relationships dataset', 'RFC 7454 (BGP operations security)'],
    related: ['tier1a', 'ixp', 'bgp', 'anycast']
  },
  ixp: {
    name: 'Internet Exchange Point',
    tagline: "A very large switch in a building where hundreds of networks meet to trade traffic",
    description: "An internet exchange point is, at heart, a shared switching fabric — DE-CIX in Frankfurt, AMS-IX in Amsterdam, LINX in London — that members plug into with a single port. From that one port a network can peer with hundreds of others, often through a route server that hands out everybody's routes in one BGP session. It replaces what would otherwise be an impossible tangle of individual cross-connects between every pair of networks.",
    history: "IXPs descend from the NAPs built for the NSFNET privatization in the 1990s. LINX in 1994, DE-CIX in 1995 and AMS-IX in 1997 grew into the largest, with DE-CIX peaking above 17 Tbps. Their importance is easiest to see when one has a bad day: an outage at a major IXP degrades the latency of an entire continent.",
    purpose: "To make peering so cheap and so dense that regional traffic stays regional instead of touring the globe by way of somebody's transit.",
    responsibilities: [
      'Operate the shared L2 fabric and member ports',
      'Run route servers so one BGP session reaches many peers',
      'Enforce fabric hygiene: MAC limits, no proxy ARP, broadcast control',
      'Publish traffic statistics and support member peering policy'
    ],
    commands: [
      { cmd: 'curl -s "https://www.peeringdb.com/api/net?asn=13335" | head -c 400', note: 'PeeringDB: where a network is present and its peering policy' },
      { cmd: 'traceroute -A -n 104.18.32.7 | grep -iE "ix|cix|linx|decix"', note: 'IXP hops often carry the exchange name in rDNS' },
      { cmd: 'whois -h whois.radb.net AS13335 | head', note: 'routing policy (RPSL) declared by a network' }
    ],
    production: 'Peering at an IXP typically cuts both latency and transit cost for regional traffic — the core reason CDNs deploy in exchange-adjacent data centers. Fabric incidents (a member leaking a full table, an L2 loop) have historically caused multi-country disruptions.',
    interview: [
      'Why does peering at an IXP reduce latency compared to buying transit?',
      'What is a route server and what problem does it solve?',
      'Why do CDNs colocate in IXP facilities?'
    ],
    sources: ['PeeringDB', 'Euro-IX best practices', 'RFC 7948 (IXP route server)'],
    related: ['tier1a', 'tier1b', 'bgp', 'anycast']
  },
  stubresolver: {
    name: 'Stub Resolver',
    tagline: "The tiny piece of your computer that knows exactly one thing: who to ask about names",
    description: "Your machine does not look up hostnames itself — it asks someone who will. The stub resolver, whether that is glibc's getaddrinfo, systemd-resolved or Chrome's own async resolver, checks the local rules in nsswitch.conf, glances at /etc/hosts and any cache, and then sends one small UDP question, tagged with a random transaction ID (ours is 0x8f3a), to a recursive resolver like 1.1.1.1. It does none of the walking itself; it delegates the entire job.",
    history: "The split between a simple stub and a hard-working recursive server was in the original DNS design, from Paul Mockapetris' RFC 882 and 883 in 1983: hosts stay dumb, servers do the walking. Linux long used the plain glibc resolver, which just reads /etc/resolv.conf; systemd-resolved arrived in 2014 with caching, DNSSEC validation and per-link DNS, making a once-trivial picture considerably more interesting to debug.",
    purpose: "To answer what address is this name? for applications with as little machinery on your own computer as possible.",
    responsibilities: [
      'Apply nsswitch.conf order: files (hosts), mdns, dns',
      'Append search domains and honor ndots/timeout/attempts options',
      'Send A/AAAA queries to configured recursive resolvers with a random TXID',
      'Cache results per TTL (in resolved/browser; classic glibc does not cache)'
    ],
    commands: [
      { cmd: 'cat /etc/resolv.conf; cat /etc/nsswitch.conf | grep hosts', note: 'which servers, which order — start every DNS debug here' },
      { cmd: 'resolvectl query api.shop.dev', note: 'systemd-resolved answer with source (network/cache) shown' },
      { cmd: 'getent hosts api.shop.dev', note: 'resolves the way the application does (nsswitch path), unlike dig' },
      { cmd: 'strace -e trace=network -f getent hosts api.shop.dev 2>&1 | grep -E "sendto|connect" | head', note: 'watch the actual UDP query leave' }
    ],
    production: 'dig works but the app fails is nearly always nsswitch/hosts/search-domain divergence — dig bypasses all of it. In Kubernetes, ndots:5 in resolv.conf makes short names generate 4+ failed lookups before the real one; it is a top source of DNS load.',
    interview: [
      'Why can dig succeed while your application cannot resolve the same name?',
      'What does the search domain list do and what is the ndots option?',
      'Where does DNS caching actually happen on a typical Linux host?'
    ],
    sources: ['man 5 resolv.conf', 'man 5 nsswitch.conf', 'RFC 1034/1035', 'glibc resolv/'],
    related: ['recursive', 'libc', 'udp', 'netservice']
  },
  recursive: {
    name: 'Recursive Resolver (1.1.1.1)',
    tagline: "Does the walking so your laptop does not: root, then TLD, then the answer — and remembers all of it",
    description: "This is the server your computer actually asks, and the one that does the work. Given api.shop.dev and nothing in its cache, it climbs down the hierarchy: the root servers say who handles .dev, the .dev servers say who handles shop.dev, and shop.dev's own authoritative servers finally produce the address. Every answer along the way is cached for exactly as long as its owner permitted, so the next person to ask gets it instantly, and DNSSEC signatures are verified wherever they exist.",
    history: "Recursion was part of Paul Mockapetris' DNS design from 1983. Public recursive resolvers became infrastructure with OpenDNS in 2006, Google Public DNS at 8.8.8.8 in 2009, and Cloudflare's 1.1.1.1 in April 2018, launched with APNIC and a promise to keep logs for only 24 hours. Encrypting the last mile came later: DNS over TLS in RFC 7858 in 2016, and DNS over HTTPS in RFC 8484 in 2018.",
    purpose: "To do the expensive lookup once, then hand the answer instantly to everyone who asks next.",
    responsibilities: [
      'Iteratively query root, TLD, and authoritative servers following referrals',
      'Cache positive and negative answers by TTL (negative per RFC 2308)',
      'Validate DNSSEC chains and return SERVFAIL on bogus data',
      'Randomize source ports and TXIDs (post-Kaminsky) to resist spoofing'
    ],
    commands: [
      { cmd: 'dig +trace api.shop.dev', note: 'perform the recursion yourself, referral by referral — the single best DNS teaching tool' },
      { cmd: 'dig @1.1.1.1 api.shop.dev A +stats', note: 'query time reveals cache hit (~1ms) vs full recursion (~50-200ms)' },
      { cmd: 'dig @1.1.1.1 api.shop.dev +norecurse', note: 'ask without recursion: an answer means it was cached' },
      { cmd: 'dig @1.1.1.1 api.shop.dev +dnssec | grep -E "RRSIG|ad"', note: 'check DNSSEC signatures and the AD (authenticated data) flag' }
    ],
    production: 'Resolver choice affects CDN steering: EDNS Client Subnet (RFC 7871) lets the resolver leak a client subnet so authoritative servers return nearby answers — resolvers that omit it can send users to distant edges. Cache TTLs are also your blast-radius control during migrations: lower them days ahead.',
    interview: [
      'Walk through resolving api.shop.dev from an empty cache.',
      'What was the Kaminsky attack and what fixed it?',
      'Why is a low TTL both useful and expensive?'
    ],
    sources: ['RFC 1034/1035', 'RFC 8484 (DoH)', 'RFC 2308 (negative caching)', 'RFC 7871 (ECS)'],
    related: ['stubresolver', 'rootns', 'tldns', 'authns']
  },
  rootns: {
    name: 'Root Nameservers',
    tagline: "Thirteen names, 1,900+ machines, and an answer that is always: ask someone else",
    description: "The root servers sit at the very top of DNS and know almost nothing — certainly not where api.shop.dev lives. What they know is which nameservers are responsible for each top-level domain, so our question about .dev comes back as a polite referral. There are 13 root server identities, a through m.root-servers.net, run by 12 organizations, and each identity is really hundreds of machines around the world sharing one address; every recursive resolver ships their addresses baked into a hints file.",
    history: "The root zone dates to the original DNS deployment in 1984 and 1985, and the number 13 comes from a mundane constraint — that was how many server addresses fit in a 512-byte UDP priming response. Anycast, from 2002 onward and accelerated by the October 2002 DDoS attack on the roots, turned those 13 addresses into hundreds of physical sites. The root zone was signed with DNSSEC in July 2010, in a public key ceremony still held in front of witnesses.",
    purpose: "To serve the apex of the naming hierarchy: the pointer from every top-level domain to the servers that actually handle it.",
    responsibilities: [
      'Answer with NS referrals for TLDs plus glue records',
      'Serve the DNSSEC-signed root zone and its trust anchor',
      'Stay available under sustained attack via massive anycast replication',
      'Provide the priming answer resolvers use to refresh their hints'
    ],
    commands: [
      { cmd: 'dig +norecurse @a.root-servers.net api.shop.dev', note: 'a referral to .dev nameservers — the root never answers directly' },
      { cmd: 'dig . NS +short', note: 'the 13 root server names' },
      { cmd: 'dig . DNSKEY +multi | head -20', note: 'the root trust anchor that anchors all DNSSEC validation' }
    ],
    production: 'Root queries are rare in practice — resolvers cache TLD delegations for days (48h TTL). Excessive root traffic in your logs means a broken resolver or a flood of nonexistent TLD lookups (the classic .local/.corp leakage).',
    interview: [
      'Why exactly 13 root servers, and why is that not really 13 machines?',
      'What does the root server return for a query it cannot answer?',
      'What is the DNS trust anchor and where is it stored?'
    ],
    sources: ['root-servers.org', 'RFC 1034', 'RFC 8109 (priming queries)', 'IANA root zone'],
    related: ['recursive', 'tldns', 'anycast']
  },
  tldns: {
    name: 'TLD Nameservers (.dev)',
    tagline: "One level down: knows every domain in .dev, and nothing whatsoever about their contents",
    description: "The .dev nameservers hold exactly one kind of knowledge: which nameservers each registered domain uses. Ask them about api.shop.dev and they will not know the address, but they will tell you precisely who does — shop.dev's own authoritative servers — along with the DS records that let you verify the next step is genuine. They are operated by Google Registry, which made .dev unusual by preloading the whole top-level domain into browsers' HSTS lists, so every .dev site is HTTPS whether it likes it or not.",
    history: "The original top-level domains were defined in RFC 920 in 1984: .com, .edu, .gov, .mil, .org, .net, plus a country code for each nation. ICANN's new gTLD program, whose application round opened in 2012, added hundreds more; Google bought .dev at auction for $25M in 2015 and launched it publicly in 2019, notable for being HSTS-preloaded — every .dev site is HTTPS-only by browser enforcement.",
    purpose: "To hold the delegation for every second-level domain under one top-level domain, and move each query one step closer to its answer.",
    responsibilities: [
      'Return NS referrals and glue for delegated domains',
      'Publish DS records linking child zones into the DNSSEC chain',
      'Reflect registry state changes (registration, nameserver updates, EPP)',
      'Serve at extreme scale with anycast and heavy caching'
    ],
    commands: [
      { cmd: 'dig +norecurse @$(dig dev. NS +short | head -1) api.shop.dev', note: 'the .dev referral to the zone nameservers' },
      { cmd: 'dig shop.dev NS +short', note: 'the delegated authoritative nameservers' },
      { cmd: 'dig shop.dev DS +short', note: 'the DNSSEC delegation signer linking parent to child' },
      { cmd: 'whois shop.dev | head -20', note: 'registry data: registrar, nameservers, status codes' }
    ],
    production: 'Domain expiry and registrar lock status are operational risks hiding at this layer — a lapsed renewal removes the delegation and no amount of correct zone configuration matters. Monitor expiry dates and enable clientTransferProhibited/registry lock.',
    interview: [
      'What is glue and why is it required for in-bailiwick nameservers?',
      'How does DNSSEC chain trust from the root to a leaf zone?',
      'What makes .dev special from a browser security standpoint?'
    ],
    sources: ['RFC 1034', 'RFC 4034 (DNSSEC records)', 'ICANN gTLD program documentation'],
    related: ['rootns', 'authns', 'recursive']
  },
  authns: {
    name: 'Authoritative Nameserver',
    tagline: "Where the answer actually lives: the zone file for shop.dev",
    description: "This is the end of the DNS journey — the server that genuinely owns the answer, and says so by setting the AA, authoritative answer, flag in its reply. For us it says api.shop.dev resolves, via a CNAME or an A record, to the Cloudflare anycast address 104.18.32.7. It may not be reading that from a file at all: modern authoritative servers often compute the reply on the spot, steering different visitors to different addresses depending on where they are or which backends are currently healthy.",
    history: "BIND, the Berkeley Internet Name Domain, began as a UC Berkeley student project in 1984 and was the reference implementation for decades — and, being vast and venerable, the source of a great many CVEs. PowerDNS in 1999, NSD in 2003 and Knot in 2011 followed, and then cloud providers like Route 53 in 2010 and Cloudflare DNS moved authority into API-driven anycast fleets where a change propagates in under a minute.",
    purpose: "To hold the definitive records for a zone, and to decide where traffic for those names is actually steered.",
    responsibilities: [
      'Answer queries for the zone with AA set; return NXDOMAIN for nonexistent names',
      'Serve SOA, NS, A/AAAA, CNAME, MX, TXT, CAA and DNSSEC signatures',
      'Support zone transfers (AXFR/IXFR) or API-driven replication to secondaries',
      'Implement traffic policy: latency/geo routing, weighted answers, health checks'
    ],
    commands: [
      { cmd: 'dig @$(dig shop.dev NS +short | head -1) api.shop.dev +noall +answer +authority', note: 'the authoritative answer with the AA flag' },
      { cmd: 'dig shop.dev SOA +short', note: 'serial number and timers — serial mismatch across NS means transfer trouble' },
      { cmd: 'dig api.shop.dev CAA +short; dig api.shop.dev TXT +short', note: 'CAA controls who may issue certificates; TXT holds SPF/verification' },
      { cmd: 'for ns in $(dig shop.dev NS +short); do echo -n "$ns "; dig @$ns shop.dev SOA +short | awk "{print \\$3}"; done', note: 'compare serials across all authoritative servers' }
    ],
    production: 'Keep TTLs low (60-300s) before a migration and raise them after; ensure every authoritative server has identical serials. CAA records are quietly load-bearing — a stale CAA blocks certificate issuance and takes down TLS renewals weeks later.',
    interview: [
      'What does the AA flag mean and which servers set it?',
      'Difference between NXDOMAIN and NOERROR with an empty answer?',
      'How do you safely change a record with a 24-hour TTL?'
    ],
    sources: ['RFC 1034/1035', 'RFC 8659 (CAA)', 'RFC 5936 (AXFR)', 'BIND ARM'],
    related: ['tldns', 'recursive', 'anycast', 'cftls']
  },
  anycast: {
    name: 'Anycast Edge',
    tagline: "One IP announced from 300+ cities — the routing table quietly becomes the load balancer",
    description: "104.18.32.7 is not a machine. Cloudflare announces the same prefix to the internet from every data center it operates, and ordinary BGP best-path selection sends each visitor to whichever instance is nearest in network terms. There is no DNS trick and no logic in your browser: the internet's own routing decisions do the balancing, which is why the same address feels local in Sydney and in Stockholm.",
    history: "Anycast was described in RFC 1546 in 1993 and first hardened at scale on the DNS root servers from 2002. Cloudflare launched in September 2010 built entirely on it, for both DNS and HTTP — an unusual bet at the time, since running stateful TCP over anycast was considered risky. In practice routes turn out to be stable enough that mid-connection resets are rare.",
    purpose: "To place the service close to every user on earth simultaneously, using routing rather than redirection to get them there.",
    responsibilities: [
      'Announce the same prefix via BGP from many PoPs',
      'Absorb and disperse DDoS traffic across the whole footprint',
      'Terminate TCP/TLS at the nearest PoP for RTT reduction',
      'Withdraw announcements to drain a PoP for maintenance or failure'
    ],
    commands: [
      { cmd: 'curl -sI https://api.shop.dev/ | grep -i "cf-ray"', note: 'the CF-Ray suffix names the colo that served you (e.g. FRA, LHR)' },
      { cmd: 'dig +short CHAOS TXT id.server @1.1.1.1', note: 'anycast servers report which instance answered' },
      { cmd: 'traceroute -n 104.18.32.7', note: 'surprisingly few hops — the destination is nearby, wherever you are' },
      { cmd: 'curl -s https://1.1.1.1/cdn-cgi/trace | grep -E "colo|loc"', note: 'Cloudflare tells you which PoP and country it thinks you are in' }
    ],
    production: 'Anycast + long-lived TCP means route flaps can reset connections mid-flight (rare but real). PoP draining is done by withdrawing BGP announcements, which takes seconds to converge globally — a far faster failover mechanism than DNS TTLs allow.',
    interview: [
      'How can one IP address be served from hundreds of locations without breaking TCP?',
      'Anycast vs GeoDNS: what are the trade-offs?',
      'How does anycast help absorb a DDoS attack?'
    ],
    sources: ['RFC 1546', 'RFC 4786 (anycast operations)', 'blog.cloudflare.com anycast posts'],
    related: ['bgp', 'ddos', 'cftls', 'ixp']
  },
  ddos: {
    name: 'DDoS Mitigation',
    tagline: "Throws the flood away before it can cost anybody a socket",
    description: "When an attack arrives, the cheapest packet is the one you never process. At the edge, traffic passes through fingerprinting and rate-limiting layers that recognize attack patterns and discard them in kernel-bypass paths — Cloudflare's L3/L4 mitigation, historically the BPF-based Gatebot and now XDP-driven l4drop, matches signatures and drops matching packets at line rate, long before any TCP state exists or any application worker is woken.",
    history: "DDoS became a mass phenomenon with the February 2000 attacks on Yahoo, eBay and CNN. Then came the amplification eras, each larger than the last: DNS in the 2013 Spamhaus attack at 300 Gbps, NTP in 2014, memcached in 2018 at 1.7 Tbps, and HTTP/2 Rapid Reset, CVE-2023-44487, which peaked at 398 million requests per second. XDP, added in kernel 4.8 in 2016, finally gave defenders line-rate packet dropping in ordinary software.",
    purpose: "To keep a service reachable straight through a flood, without making legitimate visitors pay for the attack.",
    responsibilities: [
      'Detect anomalies by flow sampling and behavioral fingerprinting',
      'Drop attack traffic at XDP/hardware level — before conntrack or socket allocation',
      'Apply SYN cookies and challenge/rate-limit suspicious sources',
      'Disperse volumetric load across the anycast footprint'
    ],
    commands: [
      { cmd: 'sysctl net.ipv4.tcp_syncookies net.ipv4.tcp_max_syn_backlog', note: 'the kernel’s own first line of SYN-flood defense' },
      { cmd: 'ss -n state syn-recv | wc -l', note: 'half-open connections — a SYN flood shows here first' },
      { cmd: 'nstat -az TcpExtSyncookiesSent TcpExtListenDrops TcpExtListenOverflows', note: 'cookies issued and accept-queue overflows under attack' },
      { cmd: 'ip -s link show eth0; ethtool -S eth0 | grep -i drop', note: 'where volumetric traffic is being discarded' }
    ],
    production: 'Mitigation is a trade against false positives: aggressive rate limits block real users, and challenge pages break API clients. Layer 7 attacks (expensive queries, cache-busting query strings) need application-aware rules, not bandwidth.',
    interview: [
      'What are SYN cookies and what do they sacrifice?',
      'How does an amplification attack achieve 50x leverage, and how is it prevented?',
      'Why is a 1 Tbps volumetric attack sometimes easier to survive than 100k requests/sec at L7?'
    ],
    sources: ['RFC 4987 (SYN flood mitigations)', 'net/ipv4/syncookies.c', 'CVE-2023-44487 (Rapid Reset)'],
    related: ['anycast', 'waf', 'tcp', 'cftls']
  },
  waf: {
    name: 'Web Application Firewall',
    tagline: "Reads the request itself and decides whether it smells like an attack",
    description: "A web application firewall inspects the parts of a request a network firewall never sees: the method, the path, the headers, the body. It matches them against rule sets for the classic attacks — SQL injection, path traversal, probes for known vulnerabilities such as Log4Shell and Struts — and layers bot scores and rate limits on top. Our GET /products?limit=20 is thoroughly boring, which is precisely the quality that gets it waved through.",
    history: "ModSecurity, written by Ivan Ristic in 2002, created the open WAF category, and the OWASP Core Rule Set gave it a shared body of rules from 2006. Cloud WAFs — Cloudflare, and AWS WAF from 2015 — made rule deployment global and instant, which became decisive in December 2021, when Log4Shell mitigations reached millions of sites within hours of disclosure.",
    purpose: "To block application-layer attacks at the edge, buying the time that patching every server yourself would have cost you.",
    responsibilities: [
      'Match requests against managed and custom rule sets',
      'Score bots and enforce rate limits per IP/JA3/fingerprint',
      'Normalize/decode inputs to defeat evasion (double encoding, case games)',
      'Log and expose blocked events with rule IDs for tuning'
    ],
    commands: [
      { cmd: "curl -s -o /dev/null -w '%{http_code}\\n' \"https://api.shop.dev/products?id=1' OR '1'='1\"", note: 'a classic injection probe: expect 403 from a live WAF' },
      { cmd: "curl -sI https://api.shop.dev/products | grep -iE 'cf-ray|server'", note: 'edge headers identify who is inspecting your traffic' },
      { cmd: "curl -s -A 'sqlmap/1.7' -o /dev/null -w '%{http_code}\\n' https://api.shop.dev/products", note: 'user-agent based blocking is often the first rule to fire' }
    ],
    production: 'Every WAF rollout starts in log-only mode: real traffic contains strings that look like attacks (a product description with "SELECT", base64 blobs). False positives on legitimate POST bodies are the top rollback cause; keep per-rule metrics and exception paths ready.',
    interview: [
      'How does a WAF differ from a network firewall in what it can see?',
      'Why can a WAF not replace fixing the vulnerability?',
      'How would you deploy a new rule set without breaking production?'
    ],
    sources: ['OWASP Core Rule Set', 'ModSecurity reference manual', 'OWASP Top 10'],
    related: ['ddos', 'cfcache', 'proxy', 'cftls']
  },
  cfcache: {
    name: 'Edge Cache',
    tagline: "Answers from a datacenter 20ms away instead of an origin 200ms away",
    description: "The edge cache keeps copies of responses close to users, keyed by URL and by whichever headers the origin named in Vary. Whether it may answer at all is decided by the origin's Cache-Control headers and the site's own edge rules. Our /products?limit=20 is an API response, and Cloudflare does not cache those by default, so this one is recorded as a MISS and travels onward to the origin — a verdict you can read for yourself in the CF-Cache-Status header.",
    history: "CDNs began with Akamai in 1998, commercializing MIT research on consistent hashing by Karger, Leighton and colleagues to serve static assets from nearby. Cloudflare in 2010 fused caching with security at the same anycast edge. Modern edges add tiered caching, stale-while-revalidate (RFC 5861, 2010) and cache reservation, cutting origin load by orders of magnitude.",
    purpose: "To finish as many requests as possible at the edge, saving the visitor's time and the origin's money at once.",
    responsibilities: [
      'Store and serve responses per Cache-Control/Expires and edge rules',
      'Report status via CF-Cache-Status: HIT, MISS, EXPIRED, BYPASS, DYNAMIC',
      'Coalesce concurrent misses so one origin request serves many clients',
      'Support purge (by URL, tag, or everything) and stale-while-revalidate'
    ],
    commands: [
      { cmd: "curl -sI https://api.shop.dev/products | grep -iE 'cf-cache-status|age|cache-control'", note: 'the three headers that explain any CDN caching question' },
      { cmd: "curl -sI https://api.shop.dev/products?cb=$RANDOM | grep -i cf-cache-status", note: 'cache-busting query string forces a MISS — and is how attackers bypass caches' },
      { cmd: "for i in 1 2; do curl -sI https://api.shop.dev/logo.png | grep -i cf-cache-status; done", note: 'MISS then HIT: watch the cache fill' }
    ],
    production: 'Cache hit ratio is the CDN’s core metric; origin load is inversely proportional to it. The dangerous failure is cache poisoning via unkeyed input (an X-Forwarded-Host reflected into a response) — always align Vary and cache keys with what actually varies the body.',
    interview: [
      'What does CF-Cache-Status: DYNAMIC mean versus BYPASS?',
      'How does stale-while-revalidate improve tail latency?',
      'How would a cache-busting query parameter be abused in an attack?'
    ],
    sources: ['RFC 9111', 'RFC 5861 (stale-while-revalidate)', 'Cloudflare cache documentation'],
    related: ['httpcache', 'waf', 'originpull', 'anycast']
  },
  cftls: {
    name: 'Edge TLS Termination',
    tagline: "The handshake finishes 20ms away, so encryption stops costing a transatlantic round trip",
    description: "TLS is what puts the S in HTTPS, and its handshake costs round trips — which is why it matters enormously where the far end of it sits. Here the edge, not the distant origin, presents the certificate for api.shop.dev, agrees on TLS 1.3 with X25519 key exchange and AES-128-GCM encryption, and proves it holds the matching private key. Because the edge is close by, the whole negotiation takes one short round trip instead of one very long one.",
    history: "Netscape created SSL 2.0 in 1995 and SSL 3.0 in 1996, the latter from Freier, Karlton and Kocher; the IETF took it over and renamed it TLS 1.0 in RFC 2246 in 1999. A decade of attacks — BEAST, CRIME, POODLE, Heartbleed, between 2011 and 2014 — forced a great deal of hardening. TLS 1.3, RFC 8446 in August 2018, cut the handshake to 1-RTT, removed RSA key transport and static keys entirely, and encrypted most of the handshake itself.",
    purpose: "To give you secrecy, integrity and proof of who you are talking to, while spending as little time on the wire as possible.",
    responsibilities: [
      'Present the certificate chain and prove key possession',
      'Negotiate version, cipher suite, and ALPN (h2/http1.1) in ClientHello/ServerHello',
      'Derive session keys via ECDHE (forward secrecy) and switch to encrypted records',
      'Support session resumption (tickets, PSK) and 0-RTT early data with replay caveats'
    ],
    commands: [
      { cmd: 'openssl s_client -connect api.shop.dev:443 -servername api.shop.dev -tls1_3 </dev/null 2>&1 | head -30', note: 'full handshake transcript: chain, cipher, protocol' },
      { cmd: "echo | openssl s_client -connect api.shop.dev:443 2>/dev/null | openssl x509 -noout -dates -subject -issuer", note: 'validity window and issuer — expiry is still the #1 TLS outage' },
      { cmd: "curl -sv https://api.shop.dev/ -o /dev/null 2>&1 | grep -E 'SSL connection|ALPN|subject'", note: 'negotiated version, cipher, and protocol in one line' },
      { cmd: 'openssl s_client -connect api.shop.dev:443 -tlsextdebug -status </dev/null 2>&1 | grep -i ocsp', note: 'OCSP stapling: the server proving the cert is not revoked' }
    ],
    production: 'Certificate expiry remains the most common self-inflicted outage — automate with ACME and alert 30/14/7 days out. SNI is sent in cleartext (until ECH deploys), so hostnames are visible to observers even when payloads are not.',
    interview: [
      'What does TLS 1.3 remove from 1.2 and why is the handshake one RTT shorter?',
      'What is forward secrecy and which key exchange provides it?',
      'What exactly does the certificate prove, and to whom?'
    ],
    sources: ['RFC 8446 (TLS 1.3)', 'RFC 5246 (TLS 1.2)', 'RFC 6066 (SNI)', 'man 1 s_client'],
    related: ['anycast', 'originpull', 'socketpool', 'proxy']
  },
  originpull: {
    name: 'Origin Pull',
    tagline: "A second, completely separate connection from the edge to your real server",
    description: "When the edge has no cached answer, it becomes a client itself. It opens its own TCP connection and its own TLS session to the origin at 198.51.100.10 — nothing of your connection is forwarded — and adds headers so your application can still tell who really asked: X-Forwarded-For, CF-Connecting-IP, X-Forwarded-Proto. This is the leg where the transcontinental round trip is finally paid for, which is exactly why these connections are pooled and kept alive as long as they can be.",
    history: "Pulling from an origin is as old as CDNs themselves, going back to Akamai in 1998, but the security model matured slowly. Cloudflare added Authenticated Origin Pulls, which uses mTLS client certificates so an origin can refuse anyone but the edge, and Argo Smart Routing in 2017 to optimize this leg; Tunnel and cloudflared in 2018 removed the need for the origin to be publicly reachable at all.",
    purpose: "To fetch fresh content from your server while preserving who the real visitor was, and keeping that server out of the public eye.",
    responsibilities: [
      'Establish and pool TCP+TLS connections to origin servers',
      'Inject forwarding headers: X-Forwarded-For, CF-Connecting-IP, X-Forwarded-Proto',
      'Apply origin health checks, failover, and retry policy',
      'Optionally authenticate to origin with client certificates (mTLS)'
    ],
    commands: [
      { cmd: "curl -sI --resolve api.shop.dev:443:198.51.100.10 https://api.shop.dev/products", note: 'bypass the edge and talk to origin directly — the essential is-it-the-CDN test' },
      { cmd: "curl -s https://api.shop.dev/debug/headers | jq '{xff: .\"x-forwarded-for\", cfip: .\"cf-connecting-ip\"}'", note: 'confirm which header carries the real client IP' },
      { cmd: 'tcpdump -ni any host 198.51.100.10 and port 443 -c 10', note: 'observe the origin-side leg from the origin server' }
    ],
    production: 'Origins must firewall to CDN IP ranges (or use mTLS/Tunnel) or attackers bypass the WAF entirely by hitting the origin IP — leaked via old DNS records or mail headers. Also: trusting X-Forwarded-For unconditionally lets clients forge their own IP; only trust it from known proxies.',
    interview: [
      'Why is X-Forwarded-For dangerous to trust and how do you do it safely?',
      'How would an attacker find and hit your origin directly, and how do you prevent it?',
      'How many TLS handshakes exist between browser and app in a CDN setup?'
    ],
    sources: ['RFC 7239 (Forwarded header)', 'Cloudflare Authenticated Origin Pulls docs', 'RFC 9110'],
    related: ['cfcache', 'cftls', 'lb', 'proxy']
  },
  lb: {
    name: 'Load Balancer',
    tagline: "Spreads the work across your servers, and notices the moment one stops answering",
    description: "A load balancer stands in front of a group of interchangeable servers and decides which one handles each arrival — round-robin, or fewest current connections, or a consistent hash so the same user keeps landing on the same backend. Just as importantly, it keeps checking that each member is still healthy and quietly removes any that is not. An L4 balancer forwards packets without looking inside; an L7 balancer parses the HTTP and can route by path, header or cookie.",
    history: "The category began in hardware, with Cisco's LocalDirector in 1996 and F5's BIG-IP in 1997. Wensong Zhang brought L4 balancing into the Linux kernel itself as LVS/IPVS in 1998. HAProxy, from Willy Tarreau in 2001, and nginx, from Igor Sysoev in 2004, made software L7 balancing the default choice, and Google's Maglev (NSDI 2016) and Meta's Katran (2018) showed consistent hashing running at XDP speed.",
    purpose: "To turn a pile of individually fallible servers into one endpoint that stays up, and that grows simply by adding more.",
    responsibilities: [
      'Select a backend per connection/request using the configured algorithm',
      'Run active and passive health checks; eject and re-admit members',
      'Maintain session affinity when required (cookie or hash based)',
      'Drain connections gracefully during deploys and provide per-backend metrics'
    ],
    commands: [
      { cmd: 'ipvsadm -Ln --stats', note: 'kernel IPVS virtual services, real servers, and per-backend counters' },
      { cmd: "echo 'show stat' | socat /var/run/haproxy.sock stdio | cut -d, -f1,2,5,18 | head", note: 'HAProxy runtime stats: sessions and backend status' },
      { cmd: "curl -sI https://api.shop.dev/health -H 'Host: api.shop.dev'", note: 'the endpoint health checks hit — keep it cheap and dependency-aware' },
      { cmd: 'ss -tan state established | awk "{print \\$5}" | sort | uniq -c | sort -rn | head', note: 'verify connections are actually spread across backends' }
    ],
    production: 'Health check design decides your failure mode: too shallow and you route to broken apps, too deep (checking the DB) and one DB blip ejects the whole fleet. Least-connections beats round-robin when request costs vary widely.',
    interview: [
      'L4 vs L7 load balancing: what does each see and what can each do?',
      'How do you deploy without dropping in-flight requests?',
      'Why can a deep health check turn a partial outage into a total one?'
    ],
    sources: ['HAProxy configuration manual', 'net/netfilter/ipvs/', 'Google Maglev paper (NSDI 2016)'],
    related: ['originpull', 'proxy', 'dnat', 'appserver']
  },
  proxy: {
    name: 'Reverse Proxy (nginx/Caddy)',
    tagline: "Deals with the messy public internet so your application never has to",
    description: "A reverse proxy sits in front of your app and absorbs everything unpleasant about being on the internet. It accepts the connection, terminates TLS, tidies and buffers the HTTP request, and only then passes something clean and complete to the app at 172.17.0.2:3000 over plain HTTP. Clients that dribble a request out over several minutes, compression, static files, header hygiene — all handled here, so your code only ever meets well-behaved requests.",
    history: "Igor Sysoev wrote nginx for Rambler to solve the C10K problem — Dan Kegel's 1999 challenge of handling ten thousand simultaneous connections — and released it in October 2004 with an event-driven architecture that was the exact opposite of Apache's process-per-connection model. Caddy, from Matt Holt in 2015, went a step further by making automatic HTTPS via ACME the default, so there is no certificate configuration at all.",
    purpose: "To absorb the realities of the open internet so application code can be written as though everyone were polite.",
    responsibilities: [
      'Terminate TLS and negotiate HTTP/1.1, HTTP/2, HTTP/3',
      'Buffer slow request bodies and slow client reads (Slowloris defense)',
      'Route by host/path to upstreams; set X-Forwarded-* headers',
      'Serve static assets, compress responses, and enforce timeouts/limits'
    ],
    commands: [
      { cmd: 'nginx -T | head -60', note: 'dump the fully resolved configuration including all includes' },
      { cmd: 'nginx -t && nginx -s reload', note: 'validate then hot-reload with zero dropped connections' },
      { cmd: "tail -f /var/log/nginx/access.log | awk '{print \\$9, \\$NF}'", note: 'live status codes and upstream response times' },
      { cmd: 'curl -sI -H "Host: api.shop.dev" http://127.0.0.1/products', note: 'test virtual-host routing from the proxy host itself' }
    ],
    production: 'Timeouts are the tuning surface: proxy_read_timeout shorter than the app’s own timeout produces 504s that hide real errors. Buffering protects Node from slow clients — turning it off (for streaming/SSE) means the app now owns that risk.',
    interview: [
      'Why put a reverse proxy in front of a Node app at all?',
      'What is a 502 vs 504 from nginx telling you about the upstream?',
      'How does request buffering protect an application server?'
    ],
    sources: ['nginx.org documentation', 'Caddy documentation', 'RFC 9110', 'Kegel, "The C10K problem" (1999)'],
    related: ['lb', 'appserver', 'dnat', 'originpull']
  },
  dnat: {
    name: 'Port Publishing (DNAT)',
    tagline: "docker -p 443:3000 is really just one firewall rule rewriting an address",
    description: "A container lives in its own network namespace, so its port 3000 is not reachable from outside. Publishing a port installs a destination NAT rule in the nat table's PREROUTING chain: traffic arriving at the host's port 443 has its destination rewritten to 172.17.0.2:3000 before routing even happens. Only the first packet of each flow is touched by the rule — connection tracking remembers the decision and applies it to everything that follows, including the replies going back the other way.",
    history: "Destination NAT arrived with netfilter in kernel 2.4 in 2001. Docker built port publishing straight onto it in 2013, generating its own DOCKER chains. Kubernetes did the same thing at vastly larger scale through kube-proxy, until walking thousands of rules linearly per packet became untenable and drove the move to IPVS mode and later to nftables and eBPF dataplanes such as Cilium.",
    purpose: "To make a service hidden inside an isolated namespace reachable at an address and port on the host.",
    responsibilities: [
      'Rewrite destination address/port on the first packet of a flow (PREROUTING)',
      'Let conntrack replay the translation for the rest of the flow, both directions',
      'Handle host-local traffic via the OUTPUT chain too (not just PREROUTING)',
      'Coordinate with MASQUERADE so container-originated replies route correctly'
    ],
    commands: [
      { cmd: 'iptables -t nat -L DOCKER -n -v', note: 'the actual DNAT rules Docker generated for published ports' },
      { cmd: 'docker port api', note: 'the published port mapping as Docker sees it' },
      { cmd: 'conntrack -L -d 172.17.0.2 2>/dev/null | head', note: 'flows currently being translated to the container' },
      { cmd: 'ss -tlnp | grep :443', note: 'on a Docker host you may see docker-proxy here — the userland fallback' }
    ],
    production: 'Two subtleties bite constantly: published ports bypass the host firewall because DNAT happens before the FILTER INPUT chain (use the DOCKER-USER chain), and docker-proxy exists only for hairpin/localhost cases — its presence surprises people reading ss output.',
    interview: [
      'Why does a published container port bypass your host UFW rules?',
      'Which netfilter chain does DNAT run in, and why must it be before routing?',
      'What is docker-proxy and when is it actually in the data path?'
    ],
    sources: ['net/netfilter/nf_nat_core.c', 'Docker networking documentation', 'man 8 iptables-extensions'],
    related: ['iptables', 'conntrack', 'bridge', 'netfilter']
  },
  bridge: {
    name: 'docker0 Bridge',
    tagline: "A software Ethernet switch living inside your kernel at 172.17.0.1",
    description: "docker0 is a switch made of code. It behaves exactly like the physical switch in an office — learning which MAC address sits on which port and forwarding frames accordingly — except its ports are virtual cables leading into containers, and the entire thing runs inside the host kernel. It also holds the address 172.17.0.1, which is the default gateway every container on 172.17.0.0/16 sends its traffic to.",
    history: "The Linux bridge goes back to the 2.4 series and Lennert Buytenhek's implementation, written so a PC could act as an Ethernet switch. Docker adopted it as its default network driver in 2013. Open vSwitch from 2009, and eBPF-based dataplanes such as Cilium from 2016 onward, offer richer alternatives, but docker0 remains the mental model everybody learns first.",
    purpose: "To connect containers to each other at the Ethernet level, and to give them a route out to the rest of the world.",
    responsibilities: [
      'Learn and forward by MAC across attached veth ports (FDB)',
      'Act as the default gateway IP for the container subnet',
      'Cooperate with iptables for NAT/isolation between networks',
      'Support per-network isolation (user-defined bridges) with embedded DNS'
    ],
    commands: [
      { cmd: 'ip -d link show docker0; bridge link show', note: 'bridge config and which veth interfaces are enslaved' },
      { cmd: 'bridge fdb show br docker0', note: 'the MAC table — a real switch CAM table you can read' },
      { cmd: 'docker network inspect bridge | head -40', note: 'subnet, gateway, and connected containers with their IPs' },
      { cmd: 'sysctl net.ipv4.ip_forward net.bridge.bridge-nf-call-iptables', note: 'the two toggles that decide whether container traffic routes and is filtered' }
    ],
    production: 'The default bridge has no service discovery — user-defined networks add embedded DNS by container name, which is why compose files always create one. bridge-nf-call-iptables=1 makes bridged traffic traverse iptables, which is essential for policy but a measurable performance cost.',
    interview: [
      'How does a container reach the internet if 172.17.0.2 is not routable?',
      'Why does DNS-by-container-name work on user-defined networks but not the default bridge?',
      'What is the difference between a Linux bridge and a router?'
    ],
    sources: ['net/bridge/', 'Docker network driver documentation', 'man 8 bridge'],
    related: ['veth', 'cnetns', 'dnat', 'switch']
  },
  veth: {
    name: 'veth Pair',
    tagline: "A virtual patch cable: whatever goes in one end comes out the other",
    description: "A veth pair is two network interfaces created together and permanently joined, like a cable with a plug at each end. One end, vethXXXX, is enslaved to the docker0 bridge in the host; the other is moved into the container's namespace, where it turns up as an ordinary eth0. Anything transmitted on one end is instantly received on the other, entirely inside the kernel — there is no wire, no card and no signal, only a very convincing impression of all three.",
    history: "veth landed in kernel 2.6.24 in 2008 alongside network namespaces, contributed as part of the same container infrastructure effort, and became the universal plumbing of container networking. Setups that care intensely about performance later reached for alternatives — macvlan and ipvlan, which take fewer hops, or eBPF redirection that skips the bridge entirely.",
    purpose: "To join two otherwise isolated network namespaces with something that looks and behaves exactly like an Ethernet link.",
    responsibilities: [
      'Deliver frames written on one end to its peer, in-kernel',
      'Allow one end to be moved into another namespace (ip link set netns)',
      'Present normal net_device semantics: MAC, MTU, statistics, offloads',
      'Both ends must be UP for the link to carry traffic'
    ],
    commands: [
      { cmd: 'ip -d link show type veth', note: 'all veth interfaces with their peer indexes' },
      { cmd: 'ip link add v0 type veth peer name v1 && ip link set v1 netns lab', note: 'build container networking by hand in two commands' },
      { cmd: 'cat /sys/class/net/eth0/iflink', note: 'run inside a container: the number identifies the host-side peer' },
      { cmd: 'nsenter -t $(docker inspect -f "{{.State.Pid}}" api) -n ip -s link show eth0', note: 'container-side interface counters from the host' }
    ],
    production: 'Matching a container interface to its host veth (iflink to ifindex) is the essential skill for capturing container traffic with tcpdump from the host. veth adds a per-packet copy and softirq hop — high-PPS workloads use macvlan, SR-IOV, or eBPF bypass.',
    interview: [
      'How do you tcpdump traffic for one specific container from the host?',
      'What happens to a veth pair when its namespace is deleted?',
      'Why does veth cost more CPU than macvlan for high packet rates?'
    ],
    sources: ['drivers/net/veth.c', 'man 4 veth', 'man 8 ip-link'],
    related: ['bridge', 'cnetns', 'netns', 'nic']
  },
  cnetns: {
    name: 'Container Network Namespace',
    tagline: "Inside the container it looks like a whole machine: one eth0, one route, one firewall",
    description: "This is the container's private view of networking. It holds a single interface, eth0 — really the far end of a veth pair — carrying the address 172.17.0.2/16, a default route pointing at the bridge at 172.17.0.1, and its own separate iptables and conntrack state. To the Node process running as PID 1 inside, this is indistinguishable from being alone on a small computer with exactly one network card.",
    history: "This is network namespaces, merged in kernel 2.6.24 in 2008, put to work: Docker creates one per container from 2013 and wires it up with veth. Kubernetes went a step further in 2015 by putting all the containers in a pod into one shared namespace, so they can reach each other over localhost — which is the reason the sidecar pattern works at all.",
    purpose: "To give the container a complete, isolated network of its own, so its ports and routes can never collide with the host's or another container's.",
    responsibilities: [
      'Own the container’s interfaces, addresses, routes, and neighbor cache',
      'Isolate listening ports — port 3000 inside is not port 3000 on the host',
      'Maintain namespace-scoped iptables/conntrack state',
      'Provide loopback for intra-pod/intra-container communication'
    ],
    commands: [
      { cmd: 'docker exec api ip addr show eth0', note: 'the container’s own address, 172.17.0.2' },
      { cmd: 'docker exec api ip route', note: 'default via 172.17.0.1 — the bridge is its gateway' },
      { cmd: 'nsenter -t $(docker inspect -f "{{.State.Pid}}" api) -n ss -tlnp', note: 'see listeners inside without installing tools in the image' },
      { cmd: 'docker exec api cat /proc/net/dev', note: 'per-interface counters from inside the namespace' }
    ],
    production: 'Distroless/slim images have no ss, ip, or curl — nsenter from the host (or a debug sidecar / kubectl debug ephemeral container) is how you inspect them. Remember conntrack limits are per-namespace-visible but often share host resources.',
    interview: [
      'Two containers both listen on port 3000 — why is there no conflict?',
      'How do you debug networking in an image with no shell tools?',
      'Why do containers in a Kubernetes pod reach each other over localhost?'
    ],
    sources: ['man 7 network_namespaces', 'man 1 nsenter', 'Docker networking documentation'],
    related: ['netns', 'veth', 'bridge', 'appserver']
  },
  appserver: {
    name: 'Node HTTP Server',
    tagline: "PID 1 inside the container, sitting on port 3000, waiting for someone to knock",
    description: "This is the Node process at the end of the journey. It holds a listening socket bound to 0.0.0.0:3000; when libuv's epoll reports a completed connection, accept() returns a fresh file descriptor for it, and llhttp — a parser written to be both fast and strict — turns the incoming bytes into headers and a body before a single line of Express or Nest code runs. All the unglamorous safety settings live here too: how many pending connections may queue in the backlog, how long a client may take to send its headers, how large those headers may be.",
    history: "Node's http module has been core since 2009. Its parser moved from Joyent's http_parser, written by Ryan Dahl in 2009, to llhttp from Fedor Indutny in 2018, for both maintainability and speed. From Node 12 onward the header and timeout defaults were tightened after a run of DoS CVEs — Slowloris-style attacks and HTTP request smuggling — which is why headersTimeout and requestTimeout became settings every operator has to know.",
    purpose: "To accept raw TCP connections and hand the framework above a clean request and a response to fill in.",
    responsibilities: [
      'Bind and listen (backlog defaults to 511 in Node) and accept connections',
      'Parse requests with llhttp; enforce max header size and timeouts',
      'Manage keep-alive connections and their idle timeouts',
      'Serialize responses with correct framing (Content-Length or chunked)'
    ],
    commands: [
      { cmd: 'docker exec api ss -tlnp | grep 3000', note: 'confirm it binds 0.0.0.0 not 127.0.0.1 — the #1 container connectivity bug' },
      { cmd: 'ss -tln | awk "NR==1 || /:3000/ {print}"', note: 'Send-Q on a listening socket is the accept backlog size' },
      { cmd: 'nstat -az TcpExtListenOverflows TcpExtListenDrops', note: 'nonzero means the accept queue overflowed — connections silently dropped' },
      { cmd: 'strace -f -e trace=accept4,epoll_wait -p 1 2>&1 | head', note: 'watch the accept loop from inside the container' }
    ],
    production: 'Binding to 127.0.0.1 inside a container makes it unreachable through the bridge — always 0.0.0.0. Tune server.keepAliveTimeout above the load balancer’s idle timeout or you get sporadic 502s from races on connection close.',
    interview: [
      'Why must a containerized server bind 0.0.0.0 instead of localhost?',
      'What are the SYN queue and accept queue, and what happens when each fills?',
      'Why does keepAliveTimeout mismatch with a proxy cause intermittent 502s?'
    ],
    sources: ['nodejs/node lib/_http_server.js', 'nodejs/llhttp', 'man 2 listen', 'RFC 9112'],
    related: ['middleware', 'cnetns', 'tcp', 'nodejs']
  },
  middleware: {
    name: 'Express/Nest Middleware',
    tagline: "A queue of functions, each one holding the next one's coat",
    description: "Before your route handler ever runs, the request is passed hand to hand through a chain of small functions. helmet adds security headers, cors decides whether this origin is welcome, body-parser reads the body and decodes the JSON, and logging and tracing wrap timing around the whole affair. Each one either calls next() to pass the request along, or answers it there and then and stops the chain dead.",
    history: "The pattern came to Node from Ruby's Rack in 2007, by way of Connect, written by TJ Holowaychuk in 2010, and then Express in 2010, which became the default Node web framework. NestJS, created by Kamil Mysliwiec in 2017, layered a structured lifecycle on top — guards, interceptors, pipes, filters — bringing Angular-style dependency injection and firm ordering guarantees to the same underlying Express or Fastify plumbing.",
    purpose: "To handle the concerns that apply to every single request in one ordered, reusable pipeline, instead of scattering them through your handlers.",
    responsibilities: [
      'Parse bodies, cookies, and multipart uploads with size limits',
      'Authenticate/authorize (guards) and reject early with 401/403',
      'Set security headers, CORS policy, and correlation/trace IDs',
      'Wrap timing/metrics and centralize error handling (exception filters)'
    ],
    commands: [
      { cmd: "curl -sI -X OPTIONS https://api.shop.dev/products -H 'Origin: https://shop.dev' -H 'Access-Control-Request-Method: GET'", note: 'exercise the CORS preflight path through the middleware chain' },
      { cmd: "curl -s -o /dev/null -w '%{http_code}\\n' -X POST https://api.shop.dev/products -H 'Content-Type: application/json' -d @big.json", note: '413 means the body-parser limit fired before your handler ever ran' },
      { cmd: 'docker logs -f --tail 50 api', note: 'the logging middleware output — usually the fastest request-level truth' }
    ],
    production: 'Order is behavior: authentication after body parsing means unauthenticated clients can make you parse 10MB payloads. Keep body limits tight, put rate limiting first, and make sure the error-handling middleware is registered last or it never runs.',
    interview: [
      'What happens if a middleware forgets to call next() and never responds?',
      'Why does middleware ordering matter for security and cost?',
      'In Nest, what is the execution order of guards, interceptors, and pipes?'
    ],
    sources: ['expressjs.com guide: Using middleware', 'docs.nestjs.com: Middleware and Guards', 'Rack specification'],
    related: ['appserver', 'controller', 'service']
  },
  controller: {
    name: 'NestJS Controller',
    tagline: "Maps a URL to a method, checks the input is sane, and hands back an object",
    description: 'The controller is the thin translation layer between HTTP and your actual code. Decorators declare the mapping — @Controller("products") and @Get() together say that GET /products lands here — a ValidationPipe backed by class-validator checks and converts the query parameters into the shape you asked for, and then it calls a service and returns a plain object that Nest serializes to JSON. Deliberately, it contains no business logic at all: only routing and shape.',
    history: "NestJS was created by Kamil Mysliwiec in 2017, importing Angular's decorator-driven dependency injection and module system to the server. It runs on Express by default, with Fastify as an option, and its real contribution was turning what had been ad-hoc Express project structure into a standard arrangement of modules, providers and controllers, with testability designed in from the start.",
    purpose: "To turn an HTTP request into an ordinary typed method call and the result back into a response, keeping transport concerns out of the domain.",
    responsibilities: [
      'Declare route paths, methods, and parameter bindings via decorators',
      'Validate and coerce input with pipes (DTOs + class-validator)',
      'Delegate to injected services; never touch the database directly',
      'Shape the response DTO and set status codes/headers'
    ],
    commands: [
      { cmd: 'npx nest generate controller products', note: 'scaffold a controller with its spec file' },
      { cmd: "curl -s 'https://api.shop.dev/products?limit=abc' | jq .", note: 'ValidationPipe should reject with 400 and a field-level message' },
      { cmd: 'curl -s https://api.shop.dev/products?limit=20 | jq "length"', note: 'the contract this controller promises' }
    ],
    production: 'Enable ValidationPipe globally with whitelist:true and forbidNonWhitelisted:true — it strips unexpected fields and prevents mass-assignment. Fat controllers are the standard drift; if it queries the DB, it belongs in a service.',
    interview: [
      'How does Nest know which method handles GET /products?',
      'What is dependency injection buying you in a controller?',
      'Where should validation live, and why not inside the service?'
    ],
    sources: ['docs.nestjs.com: Controllers', 'docs.nestjs.com: Pipes and validation', 'TypeScript decorators (TC39 proposal)'],
    related: ['middleware', 'service', 'prisma']
  },
  service: {
    name: 'Service Layer',
    tagline: "Where the actual business rules live — no HTTP allowed past this door",
    description: "The service is the part that knows what your application means: which tours are visible, how large a page of results may be, what gets cached, what is simply not allowed. It calls Prisma when it needs data, and it is marked @Injectable() so Nest can build it and hand it its dependencies. It knows nothing whatsoever about HTTP, which is precisely why you can unit-test it without starting a server.",
    history: "Separating services from repositories descends from Domain-Driven Design, in Eric Evans' 2003 book, and from the layered architecture patterns Martin Fowler catalogued in Patterns of Enterprise Application Architecture in 2002. Nest made the idea idiomatic in Node by shipping a real DI container, so services arrive through constructors and can be swapped for fakes in a test without ceremony.",
    purpose: "To keep the rules of the business in one place, entirely independent of how anyone happens to be calling them.",
    responsibilities: [
      'Implement domain rules, authorization decisions, and invariants',
      'Orchestrate repositories/Prisma calls and transactions',
      'Apply caching, retries, and idempotency where appropriate',
      'Emit domain events and metrics; stay free of HTTP concepts'
    ],
    commands: [
      { cmd: 'npx jest src/products/products.service.spec.ts', note: 'unit test with a mocked Prisma client — no DB, no HTTP' },
      { cmd: 'npx nest generate service products', note: 'scaffold service plus test file' },
      { cmd: 'node --prof dist/main.js && node --prof-process isolate-*.log | head -30', note: 'find where service-layer CPU time actually goes' }
    ],
    production: 'Guard against N+1 queries here: a loop calling findUnique per item turns one request into 200 round trips. Prisma include/select or a single findMany with a where-in is the fix — and query logging is how you catch it.',
    interview: [
      'Why separate service from controller if the app is small?',
      'How do you handle a transaction spanning multiple service methods?',
      'What is an N+1 query and how do you detect it in production?'
    ],
    sources: ['docs.nestjs.com: Providers', 'Evans, "Domain-Driven Design" (2003)', 'Fowler, PoEAA (2002)'],
    related: ['controller', 'prisma', 'pool']
  },
  prisma: {
    name: 'Prisma ORM',
    tagline: "You describe your data once; it writes the SQL and the TypeScript types for you",
    description: "Prisma sits between your code and the database. You write prisma.tour.findMany({ take: 20 }), and the generated client turns it into real SQL — a SELECT with a LIMIT 20 — sends it through a query engine written in Rust, and maps the rows that come back into typed objects. The schema.prisma file is the single source of truth: your migrations, your client's API and your TypeScript types all descend from it.",
    history: "Prisma began life as Graphcool in 2016, became Prisma 1 in 2018, and in 2020 shipped the architecture known as Prisma 2 — dropping the separate proxy server in favor of a client library backed by a Rust query engine. Prisma 5 in 2023 and the versions after it moved toward a lighter engine and eventually a WASM and TypeScript path, answering long-standing complaints about binary size in serverless deployments.",
    purpose: "To give a TypeScript application type-safe, migration-driven access to its data without hand-writing SQL for every ordinary query.",
    responsibilities: [
      'Generate a typed client from schema.prisma',
      'Translate query builder calls into SQL and map rows to objects',
      'Manage connection pooling to PostgreSQL via the engine',
      'Run and track schema migrations (prisma migrate) with a history table'
    ],
    commands: [
      { cmd: 'npx prisma studio', note: 'browse the live database through the schema' },
      { cmd: 'DEBUG="prisma:query" node dist/main.js', note: 'log every generated SQL statement — the only way to see what you really sent' },
      { cmd: 'npx prisma migrate dev --name add_tours', note: 'generate and apply a migration from schema changes' },
      { cmd: 'npx prisma db pull && npx prisma generate', note: 'introspect an existing database and regenerate the client' }
    ],
    production: 'Serverless is where ORMs meet reality: each lambda instance opens its own pool and exhausts PostgreSQL max_connections — hence PgBouncer or Prisma Accelerate. Always inspect generated SQL for hot endpoints; convenient nested reads can become expensive joins or N+1 patterns.',
    interview: [
      'What SQL does a findMany with a nested include actually generate?',
      'How do you avoid connection exhaustion from serverless functions?',
      'What are the trade-offs of an ORM versus hand-written SQL at scale?'
    ],
    sources: ['prisma.io/docs', 'prisma/prisma (query engine)', 'Prisma schema reference'],
    related: ['service', 'pool', 'postgres']
  },
  pool: {
    name: 'Connection Pool',
    tagline: "Keeps a few expensive database connections warm rather than buying a new one each time",
    description: "Connecting to PostgreSQL is not cheap: a TCP handshake, TLS, authentication, and then the server forks an entire operating system process just for you — 10 to 50 milliseconds and real memory, every single time. The pool opens a fixed set of these connections to 10.0.0.12:5432 once and lends them out per query, taking each one back when the query finishes. When they are all busy your query waits in line, which is exactly where pool timeout errors come from.",
    history: "Connection pooling entered mainstream practice with J2EE DataSources in the late 1990s. PostgreSQL's process-per-connection model made external poolers essential: PgBouncer, written at Skype in 2007, and pgpool-II became standard infrastructure. The serverless era from 2018 onward revived the whole problem in a new shape, as hundreds of short-lived instances each opened their own pool against one fixed max_connections.",
    purpose: "To pay the cost of connecting a handful of times instead of once per request, and to put a firm ceiling on how much work the database is asked to do at once.",
    responsibilities: [
      'Maintain min/max idle connections and hand them out per query',
      'Queue requests when all connections are busy (the source of pool timeouts)',
      'Validate and recycle dead connections after network or DB restarts',
      'Enforce statement/idle timeouts so one bad query does not hold a slot forever'
    ],
    commands: [
      { cmd: "psql -h 10.0.0.12 -c \"SELECT state, count(*) FROM pg_stat_activity GROUP BY state\"", note: 'active vs idle vs idle-in-transaction — the pool from the server side' },
      { cmd: "psql -h 10.0.0.12 -c 'SHOW max_connections'", note: 'the hard ceiling every pool must respect collectively' },
      { cmd: "psql -p 6432 -U pgbouncer pgbouncer -c 'SHOW POOLS'", note: 'PgBouncer view: client vs server connections per pool' },
      { cmd: 'ss -tan dst 10.0.0.12:5432 | tail -n +2 | wc -l', note: 'count actual TCP connections this instance holds' }
    ],
    production: 'Sizing rule of thumb: connections ≈ (2 × cores) + effective_spindles, not hundreds — more connections means more contention, not more throughput. Watch for idle in transaction, which pins a backend and blocks vacuum; set idle_in_transaction_session_timeout.',
    interview: [
      'Why does PostgreSQL suffer more from many connections than MySQL?',
      'What does idle in transaction mean and why is it dangerous?',
      'How do you size a pool, and why is bigger not better?'
    ],
    sources: ['PostgreSQL docs: Connections and Authentication', 'PgBouncer documentation', 'PostgreSQL wiki: Number of database connections'],
    related: ['prisma', 'postgres', 'tcp', 'service']
  },
  postgres: {
    name: 'PostgreSQL',
    tagline: "A process per connection, snapshots instead of locks, and 35 years of caring about correctness",
    description: "PostgreSQL is the database at the end of the road. When our connection reaches PostgreSQL 16 at 10.0.0.12:5432 it forks a dedicated backend process, PID 8842, to serve it, checks the rules in pg_hba.conf to decide whether we are allowed in, and runs the query over the extended wire protocol. Its central trick is MVCC: instead of locking rows it keeps multiple versions of each one, tagged with the transaction that created it and the transaction that deleted it, so readers never block writers and writers never block readers.",
    history: "The lineage runs from Michael Stonebraker's Ingres at Berkeley in 1974 to POSTGRES in 1986, which gained SQL and became Postgres95, then PostgreSQL 6.0 in 1996 under an open community; Stonebraker won the 2014 Turing Award for the work. The milestones read like a history of the craft: WAL in 7.1 in 2001, point-in-time recovery in 8.0, streaming replication in 9.0 in 2010, JSONB in 9.4 in 2014, parallel query in 9.6, and logical replication in 10.",
    purpose: "To store data and answer questions about it with guarantees you can build a business on: correctness, durability, rich types, and room to extend.",
    responsibilities: [
      'Fork a backend per connection; authenticate via pg_hba.conf rules',
      'Parse, plan, and execute SQL over the extended wire protocol',
      'Enforce ACID with MVCC snapshots and WAL durability',
      'Run background workers: autovacuum, checkpointer, WAL writer, bgwriter'
    ],
    commands: [
      { cmd: "psql -h 10.0.0.12 -U app -c 'SELECT version()'", note: 'first connectivity and version check' },
      { cmd: "psql -c 'SELECT pid, state, wait_event_type, wait_event, query FROM pg_stat_activity ORDER BY state'", note: 'what every backend is doing and waiting on, right now' },
      { cmd: "psql -c 'SELECT * FROM pg_stat_database WHERE datname = current_database()'", note: 'cache hit ratio, deadlocks, rollbacks, temp files' },
      { cmd: 'pg_isready -h 10.0.0.12 -p 5432', note: 'the health check that does not consume a real connection slot' }
    ],
    production: 'Transaction ID wraparound and bloat are the classic PostgreSQL emergencies — autovacuum tuning is not optional at write scale. Monitor cache hit ratio (>99% healthy), long-running transactions, and replication lag; enable pg_stat_statements before you need it.',
    interview: [
      'How does MVCC let readers avoid blocking writers, and what does it cost?',
      'What is transaction ID wraparound and why does VACUUM prevent it?',
      'Walk through what happens between COMMIT and the data being durable.'
    ],
    sources: ['postgresql.org/docs', 'src/backend/postmaster/postmaster.c', 'Stonebraker & Rowe, "The Design of POSTGRES" (1986)'],
    related: ['planner', 'executor', 'sharedbuf', 'wal', 'pool']
  },
  planner: {
    name: 'Query Planner',
    tagline: "You say what you want; it decides, by pricing the options, how to actually get it",
    description: "SQL says nothing at all about how to find data — only what you want back. Inventing the how is the planner's job. It rewrites the parse tree, considers different join orders and different ways to reach rows, and prices each candidate using statistics it keeps in pg_statistic: how many rows, how many distinct values, how they are distributed. Counter-intuitively, for our SELECT with LIMIT 20 over a small table it will usually choose to read the whole table sequentially, because the index everybody expects it to use would genuinely be slower.",
    history: "Cost-based optimization was invented for IBM's System R by Selinger and colleagues in 1979, and that paper's ideas — dynamic-programming join ordering and selectivity estimation — are still in use today. PostgreSQL added a genetic algorithm, GEQO, for queries with too many joins to enumerate, extended statistics in version 10 in 2017, and parallel-aware costing in 9.6.",
    purpose: "To find a good-enough plan quickly, because searching for the perfect one takes longer than simply running a decent one.",
    responsibilities: [
      'Estimate row counts and selectivity from collected statistics',
      'Choose access paths: seq scan, index scan, index-only, bitmap heap scan',
      'Choose join algorithms and order: nested loop, hash join, merge join',
      'Cost with tunables (random_page_cost, work_mem, effective_cache_size) and decide parallelism'
    ],
    commands: [
      { cmd: 'psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM tours ORDER BY id LIMIT 20"', note: 'estimated vs actual rows — divergence means stale or missing statistics' },
      { cmd: 'psql -c "ANALYZE tours"', note: 'refresh statistics; the fix for a suddenly terrible plan' },
      { cmd: 'psql -c "SELECT * FROM pg_stats WHERE tablename = \'tours\' LIMIT 5"', note: 'the histograms and n_distinct the planner actually reads' },
      { cmd: 'psql -c "SHOW random_page_cost; SHOW effective_cache_size"', note: 'on SSDs random_page_cost 4 is a lie — 1.1 is the common correction' }
    ],
    production: 'When a query "suddenly" got slow, compare estimated to actual rows first: a 1000x underestimate usually means stale stats, correlated columns needing extended statistics, or a parameter-sniffing issue with generic plans.',
    interview: [
      'Why would PostgreSQL choose a sequential scan over an available index?',
      'What does a big gap between estimated and actual rows in EXPLAIN ANALYZE indicate?',
      'Nested loop vs hash join: when is each the right choice?'
    ],
    sources: ['src/backend/optimizer/', 'Selinger et al., "Access Path Selection in a RDBMS" (SIGMOD 1979)', 'postgresql.org/docs: Using EXPLAIN'],
    related: ['postgres', 'executor', 'sharedbuf']
  },
  executor: {
    name: 'Query Executor',
    tagline: "Pulls rows up through the plan, one at a time, only when asked",
    description: "The executor runs the plan the planner chose. That plan is a tree, and every node knows how to produce its next tuple on demand through ExecProcNode, pulling from its children as needed — a scan node reads pages, a sort node gathers and orders, a join node matches. Along the way it fetches pages from shared buffers, checks each row's creation and deletion transaction ids against the snapshot to decide whether this version should be visible at all, and hands the survivors on to be encoded for the wire.",
    history: "The pull-based iterator model comes from Goetz Graefe's Volcano system, built between 1990 and 1994, which is why plans read as trees of nodes. PostgreSQL added parallel workers in 9.6 in 2016 so a single plan node could fan out across processes, and JIT compilation of expressions via LLVM in version 11 in 2018 to cut the cost of interpreting the same expression millions of times over.",
    purpose: "To carry out the plan efficiently, honoring transaction visibility and staying inside its memory budget.",
    responsibilities: [
      'Drive the plan tree node by node, materializing tuples lazily',
      'Apply MVCC visibility checks (xmin/xmax vs the snapshot) per tuple',
      'Manage work_mem: sort/hash in memory or spill to temp files on disk',
      'Coordinate parallel workers and merge their results (Gather nodes)'
    ],
    commands: [
      { cmd: 'psql -c "EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT * FROM tours LIMIT 20"', note: 'per-node actual time, loops, and buffer hits/reads' },
      { cmd: 'psql -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5"', note: 'the slowest statements by average execution time' },
      { cmd: 'psql -c "SELECT temp_files, temp_bytes FROM pg_stat_database WHERE datname=current_database()"', note: 'nonzero temp bytes means work_mem is too small for your sorts' },
      { cmd: 'psql -c "SHOW work_mem"', note: 'per-node, per-worker allocation — total usage multiplies fast' }
    ],
    production: 'work_mem is per sort/hash node per worker, not per query: a 100MB setting with 8 parallel workers and 3 sort nodes can allocate 2.4GB for one query. Spills to temp files are visible in EXPLAIN and in pg_stat_database.',
    interview: [
      'What is the Volcano iterator model and why is it pull-based?',
      'How does the executor decide a tuple is visible to your transaction?',
      'Why is work_mem a dangerous setting to raise globally?'
    ],
    sources: ['src/backend/executor/', 'Graefe, "Volcano — An Extensible and Parallel Query Evaluation System" (1994)', 'postgresql.org/docs: Resource Consumption'],
    related: ['planner', 'sharedbuf', 'postgres', 'disk']
  },
  sharedbuf: {
    name: 'Shared Buffers',
    tagline: "PostgreSQL's own memory of the disk — 8KB pages, and a clock hand deciding what to forget",
    description: "shared_buffers is a fixed region of shared memory holding recently used 8KB pages of tables and indexes. When the executor needs a page it asks here first, by buffer tag: a hit costs a memory read, a miss means going out to the OS page cache or the disk itself. Pages that have been modified are not written out immediately — they sit here dirty until the checkpointer or the background writer flushes them, which is only safe because the write-ahead log already recorded what changed.",
    history: "PostgreSQL deliberately keeps a modest buffer cache and leans on the operating system's page cache as a second tier — an unusual choice next to Oracle or MySQL's InnoDB, which prefer to manage nearly all the machine's memory themselves. Its clock-sweep replacement algorithm, which approximates least-recently-useful by sweeping a hand around the buffers, replaced a simple LRU in version 8.1 in 2005 to reduce contention on the hottest pages.",
    purpose: "To keep the pages your queries actually use in memory, so most queries never touch storage at all.",
    responsibilities: [
      'Cache 8KB pages with pin counts and usage counters',
      'Evict via clock-sweep when the free list is empty',
      'Track dirty pages for the checkpointer/bgwriter to flush',
      'Serve as the write staging area whose changes WAL protects'
    ],
    commands: [
      { cmd: 'psql -c "SHOW shared_buffers"', note: 'typical guidance: 25% of RAM, leaving the rest for the OS page cache' },
      { cmd: 'psql -c "SELECT sum(blks_hit)*100/nullif(sum(blks_hit+blks_read),0) AS hit_pct FROM pg_stat_database"', note: 'cache hit ratio — below 99% on an OLTP box deserves investigation' },
      { cmd: 'psql -c "CREATE EXTENSION IF NOT EXISTS pg_buffercache; SELECT c.relname, count(*) FROM pg_buffercache b JOIN pg_class c ON b.relfilenode=pg_relation_filenode(c.oid) GROUP BY 1 ORDER BY 2 DESC LIMIT 5"', note: 'which relations actually occupy the cache' },
      { cmd: 'psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM tours LIMIT 20"', note: 'shared hit vs read per node: the truth about caching for one query' }
    ],
    production: 'Because PostgreSQL double-caches with the OS, huge shared_buffers can hurt; 25% of RAM is the durable rule with huge pages enabled for large settings. Sudden hit-ratio drops usually mean a new query scanning a cold, large table.',
    interview: [
      'Why does PostgreSQL not just cache everything itself like InnoDB?',
      'What is clock-sweep and how does it approximate LRU cheaply?',
      'What does "shared hit" vs "read" mean in EXPLAIN BUFFERS output?'
    ],
    sources: ['src/backend/storage/buffer/bufmgr.c', 'postgresql.org/docs: Resource Consumption', 'pg_buffercache documentation'],
    related: ['executor', 'wal', 'disk', 'postgres']
  },
  wal: {
    name: 'Write-Ahead Log',
    tagline: "Write down what you are about to do before you do it — the rule that makes crash recovery possible",
    description: "Before any data page may be written to disk, a record describing the change is written to the write-ahead log in pg_wal and flushed to storage. That is the whole rule, and everything else follows from it: a COMMIT waits for its WAL record to reach the disk before it answers you, and after a crash the database replays the log from the last checkpoint and reconstructs exactly what was going on. The same stream is then reused for streaming replication and for restoring the database to any chosen moment in the past.",
    history: "Write-ahead logging was formalized as ARIES by Mohan and colleagues at IBM in 1992 — the recovery algorithm behind very nearly every modern database. PostgreSQL gained WAL in 7.1 in 2001, replacing the earlier approach of syncing whole files; point-in-time recovery followed in 8.0 in 2005, streaming replication in 9.0 in 2010, and logical decoding in 9.4 in 2014.",
    purpose: "To guarantee that a committed transaction survives a power cut, without paying for a random write to every affected page at the moment of commit.",
    responsibilities: [
      'Record physical/logical changes as sequential WAL records with LSNs',
      'Flush and fsync WAL at commit (synchronous_commit) before acknowledging',
      'Checkpoint periodically so recovery has a bounded starting point',
      'Stream to replicas and archive segments for point-in-time recovery'
    ],
    commands: [
      { cmd: 'psql -c "SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn())"', note: 'current write position and segment file' },
      { cmd: 'psql -c "SELECT application_name, state, pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes FROM pg_stat_replication"', note: 'replication lag in bytes — the number that matters for failover' },
      { cmd: 'pg_waldump -n 5 $(psql -Atc "SELECT pg_walfile_name(pg_current_wal_lsn())")', note: 'decode actual WAL records — see the log entries themselves' },
      { cmd: 'psql -c "SHOW synchronous_commit; SHOW wal_level; SHOW max_wal_size"', note: 'the three settings that define your durability/performance trade' }
    ],
    production: 'synchronous_commit=off gives a large write speedup while risking the last ~200ms of transactions on crash (never corruption) — an acceptable trade for some workloads, catastrophic for others. Watch for WAL accumulation from inactive replication slots filling the disk: a top-3 PostgreSQL outage cause.',
    interview: [
      'Why is writing the log before the data page faster than writing the page directly?',
      'What exactly is guaranteed when COMMIT returns?',
      'How can an abandoned replication slot take down a primary?'
    ],
    sources: ['src/backend/access/transam/xlog.c', 'Mohan et al., "ARIES" (ACM TODS 1992)', 'postgresql.org/docs: Write-Ahead Logging'],
    related: ['postgres', 'sharedbuf', 'disk', 'executor']
  },
  disk: {
    name: 'Storage (block layer + SSD)',
    tagline: "The last stop, where a promise finally becomes physics",
    description: "Beneath the filesystem sits the block layer, queueing and scheduling requests across many hardware queues, and beneath that an NVMe SSD whose controller maps the logical blocks the OS asks for onto real flash pages while spreading wear evenly across them. This is where durability is kept or broken: when WAL calls fsync, the data must genuinely reach non-volatile media — the flash itself, or a cache with power-loss protection — or the promise was only ever a rumor.",
    history: "Linux's I/O schedulers evolved from the original elevator through CFQ and deadline to blk-mq in 2013, from Jens Axboe, which finally matched the multi-queue NVMe hardware that had arrived; the single-queue schedulers were removed in 5.0 in 2019. NVMe, whose 1.0 spec landed in 2011, replaced AHCI's single 32-command queue with 64k queues of 64k commands each. io_uring, added in 5.1 in 2019, at last gave userspace genuinely asynchronous file I/O.",
    purpose: "To hold bytes safely through a power cut, and return them quickly enough that the database above stays fast.",
    responsibilities: [
      'Queue, merge, and schedule block requests (blk-mq)',
      'Honor flush/FUA semantics so fsync means what it says',
      'Manage flash translation, wear leveling, and garbage collection in the SSD',
      'Report latency, queue depth, and utilization for capacity planning'
    ],
    commands: [
      { cmd: 'iostat -xz 1 3', note: 'r_await/w_await and %util per device — the storage latency truth' },
      { cmd: 'cat /sys/block/nvme0n1/queue/scheduler', note: 'active I/O scheduler (none/mq-deadline is typical for NVMe)' },
      { cmd: 'biolatency-bpfcc 10 1', note: 'BCC histogram of block I/O latency distribution — averages hide the tail' },
      { cmd: 'fio --name=wal --rw=write --bs=8k --fsync=1 --size=1G --runtime=30', note: 'simulate WAL fsync patterns before trusting a volume with a database' }
    ],
    production: 'Cloud volume IOPS/throughput limits and burst-credit exhaustion cause the classic "database was fine for an hour then fell over" incident. Never run PostgreSQL on storage that lies about fsync; verify write barriers and disable volatile write caches without power-loss protection.',
    interview: [
      'What does fsync guarantee, and how can hardware break that guarantee?',
      'Why did blk-mq replace the older single-queue schedulers?',
      'How would you tell whether slow queries are CPU-bound or I/O-bound?'
    ],
    sources: ['block/blk-mq.c', 'Documentation/block/', 'man 2 fsync', 'NVMe Base Specification'],
    related: ['wal', 'sharedbuf', 'postgres', 'executor']
  }
};
