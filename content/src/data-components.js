// Packet Odyssey — component encyclopedia: one entry per node id from the content spec.
window.COMPONENTS = {
  appcode: {
    name: 'Application JavaScript',
    tagline: "Your fetch() call — the single line that sets 87 machines in motion",
    description: "The application source: an e-commerce SPA executing await fetch('https://api.shop.dev/products?limit=20'). To the developer it is one expression; to the system it is a contract that will be honored by compilers, kernels, routers, and a database on another continent.",
    history: "JavaScript was written by Brendan Eich at Netscape in ten days in May 1995, shipped as LiveScript and renamed JavaScript for marketing adjacency to Java. Standardized as ECMA-262 in 1997. Promises landed in ES2015, async/await in ES2017, and the fetch() API was specified by WHATWG and shipped in Chrome 42 (2015), replacing XMLHttpRequest.",
    purpose: 'Express intent — request data over the network — at the highest possible abstraction, delegating every hard problem downward.',
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
    tagline: 'Turns UTF-16 characters into a syntax tree — lazily, because parsing is expensive',
    description: 'The V8 scanner tokenizes source text and the parser builds an AST while performing scope analysis. V8 parses lazily: a fast PreParser skims function bodies for syntax errors only, deferring full parsing until a function is actually called.',
    history: 'V8 was unveiled with Chrome on 2 September 2008, built by a team in Aarhus led by Lars Bak, veteran of Self and HotSpot. Lazy parsing and the PreParser were early answers to the observation that a typical page parses far more code than it ever runs.',
    purpose: 'Convert raw source into a structured form the compiler pipeline can analyze, as cheaply as possible.',
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
    tagline: 'The program as a tree: structure without the punctuation',
    description: "The AST is the parsed representation of your code: a CallExpression wrapping a MemberExpression, an AwaitExpression, string literals. Whitespace, comments, and parentheses are gone; what remains is pure structure that compilers, linters, and bundlers all consume.",
    history: 'Syntax trees date to 1960s compiler theory (the front end/back end split of Algol-era compilers). In the JS world, the de facto ESTree format descends from the Mozilla SpiderMonkey Parser API (circa 2010-2012), which tools like Esprima, Acorn, and Babel adopted and extended.',
    purpose: 'Give every downstream tool — interpreter, optimizer, linter, minifier — one unambiguous structural view of the program.',
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
    tagline: "V8's register-machine interpreter — every function starts life here",
    description: 'Ignition walks the AST once to generate compact bytecode, then executes it on a register machine with an accumulator. It also collects type feedback in feedback vectors — the raw material TurboFan later uses to speculate.',
    history: 'Ignition shipped in 2016, replacing the old full-codegen baseline compiler. The motivation was memory: full-codegen machine code was bloating heap on mobile devices, and bytecode is roughly 4-8x smaller. It completed the modern pipeline alongside TurboFan in 2017.',
    purpose: 'Start executing code fast with minimal memory, while gathering the profiling data that makes later optimization possible.',
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
    tagline: 'LdaSmi, Star, CallProperty — the compact instruction set of a virtual register machine',
    description: "Ignition bytecode is a sequence of one-to-few-byte instructions for a register machine with a special accumulator register: LdaSmi [20] loads a small integer, Star r0 stores it, CallProperty1 invokes a method. It is dense, portable across CPUs, and annotated with feedback slot indices.",
    history: "Bytecode as portable instruction encoding traces to the Pascal p-machine (1970s) and Smalltalk-80. V8 resisted bytecode for its first eight years (2008-2016), compiling straight to machine code, until mobile memory pressure made Ignition's compact encoding the better trade.",
    purpose: 'Encode program semantics in a form that is cheap to generate, small in memory, and fast enough to interpret.',
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
    tagline: 'Speculates from type feedback, compiles hot code, deoptimizes when proven wrong',
    description: 'TurboFan takes bytecode plus feedback vectors for hot functions and builds a sea-of-nodes graph, applying inlining, escape analysis, and redundancy elimination to emit near-native machine code. Every optimization is a bet guarded by checks; a failed check triggers deoptimization back to Ignition.',
    history: "TurboFan shipped in 2015 and, with Ignition, fully replaced the 2010-era Crankshaft compiler in 2017. Its sea-of-nodes IR follows Cliff Click's 1995 work. The tiering ladder later grew Sparkplug (2021, baseline) and Maglev (2023, mid-tier) beneath it.",
    purpose: 'Make dynamically-typed JavaScript run at speeds competitive with statically-typed code — for the code paths that stay monomorphic.',
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
    tagline: 'The x86-64 your JavaScript becomes — living in executable heap pages',
    description: "TurboFan's output: raw CPU instructions written into executable memory in V8's code space, entered directly on the next call. It is specialized to observed types, laced with guard checks, and can be discarded wholesale on deopt or GC.",
    history: "JIT compilation traces to LC^2 (1960s) and Smalltalk/Self at PARC and Stanford — Self's 1991 adaptive optimization is V8's direct ancestor, via HotSpot and the same Lars Bak lineage. W^X security policies (write XOR execute) reshaped JIT design in the 2010s.",
    purpose: 'Close the loop: dynamic language semantics executed at native instruction speed.',
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
    tagline: 'One thread, an ordered set of queues, and the illusion of concurrency',
    description: 'The event loop repeatedly pulls a task from the task queues, runs it to completion, then drains the entire microtask queue (promise reactions) before touching the next task. Your await fetch() parks a continuation on the microtask queue; the loop is what eventually runs it.',
    history: 'Event-driven single-threaded UIs go back decades, but the browser event loop was only rigorously specified in the WHATWG HTML spec (mid-2000s onward, task vs microtask formalized alongside Promises circa 2013-2015). Node.js (2009) implemented its variant on libuv with distinct phases: timers, pending callbacks, poll, check, close.',
    purpose: 'Multiplex many pending operations onto one JS thread without data races, by making all JS run-to-completion.',
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
    tagline: 'The browser-provided half of "JavaScript": fetch, timers, DOM — none of it in ECMA-262',
    description: 'fetch(), setTimeout, DOM, WebSocket: capabilities the browser exposes to JS but which live outside the JS engine, implemented in C++ in the renderer. Calling fetch() hands the request across this boundary; V8 itself has no idea what a network is.',
    history: 'The pattern was set by XMLHttpRequest — built by Microsoft for Outlook Web Access in 1999 as an ActiveX control, cloned by Mozilla, and the seed of Ajax (term coined 2005). WHATWG (founded 2004) later specified fetch (2015) as the modern, promise-based replacement.',
    purpose: 'Give sandboxed JavaScript controlled, permissioned access to platform capabilities: network, storage, rendering, devices.',
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
    tagline: 'A dedicated process (PID 4903) that owns every socket the browser opens',
    description: "Chrome's network stack runs in its own sandboxed utility process: the renderer running your JS never touches a socket. The fetch request crosses process boundaries over Mojo IPC to the network service, which owns DNS, connection pools, the HTTP cache, cookies, and TLS.",
    history: 'Chrome shipped multi-process in 2008 (site isolation for crashes and security), but networking stayed in the browser process until the servicification effort moved it into a separate network service around Chrome 70 (2018) — restartable on crash and lockable with a tighter sandbox.',
    purpose: 'Centralize and isolate all network state so renderers stay unprivileged and a networking crash does not take down the browser.',
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
    tagline: 'The fastest request is the one that becomes a disk read instead',
    description: "Chrome's HTTP cache (the Simple Cache backend on disk) stores responses keyed by URL — and since 2020, partitioned by top-level site to stop cross-site tracking. Cache-Control, ETag, and Last-Modified decide whether a request is served locally, revalidated with If-None-Match, or sent in full.",
    history: 'HTTP caching semantics date to HTTP/1.0 (1996) and were refined through RFC 2616 (1999), RFC 7234 (2014), and now RFC 9111 (2022). Chrome replaced its original blockfile backend with the Simple Cache (one file per entry) in the 2010s; cache partitioning (double-keying) shipped in Chrome 86 (2020).',
    purpose: 'Eliminate network round trips entirely when a stored response is provably fresh, and shrink them to 304s when it is not.',
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
    tagline: 'Six lanes per origin for HTTP/1.1 — or one multiplexed highway for H2/H3',
    description: 'The network service maintains pools of reusable connections: for HTTP/1.1, up to 6 parallel TCP connections per origin group with requests queued behind them; for HTTP/2 and HTTP/3, a single connection carrying many concurrent streams. Reuse skips DNS, TCP, and TLS entirely — the three most expensive round trips.',
    history: 'HTTP/1.0 opened a connection per request; keep-alive (1.1, 1997) made reuse standard. RFC 2616 suggested 2 connections per host — browsers ignored it and settled on 6 (a limit RFC 7230 dropped in 2014). SPDY (2009) proved multiplexing, becoming HTTP/2 in RFC 7540 (2015); HTTP/3 over QUIC followed in RFC 9114 (2022).',
    purpose: 'Amortize connection setup cost across requests and bound per-origin parallelism.',
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
    tagline: 'V8 plus libuv plus a standard library — JavaScript with the OS on speed dial',
    description: 'Node.js embeds V8 and pairs it with libuv for event-driven I/O, exposing servers, files, and sockets to JavaScript. In node mode our fetch() runs here (PID 1337): same V8, but the browser sandbox and its Web APIs are replaced by direct syscall access via C++ bindings.',
    history: "Ryan Dahl presented Node.js at JSConf EU in November 2009, built on V8 with non-blocking I/O as the founding principle. npm arrived in 2010 (Isaac Schlueter). The io.js fork (2014) over governance merged back in 2015 as Node 4 under the Node.js Foundation. fetch() became global in Node 18 (2022), powered by undici.",
    purpose: 'Run JavaScript as a first-class server-side language with an event-driven concurrency model.',
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
    tagline: 'The C library that gives Node its event loop — epoll on Linux, kqueue on BSD, IOCP on Windows',
    description: "libuv abstracts platform async I/O behind one loop API: sockets are watched with epoll on Linux, and operations without non-blocking kernel interfaces (file I/O, getaddrinfo) run on a default-4-thread pool. Node's event loop phases are literally libuv's uv_run() stages.",
    history: 'libuv was created in 2011 for Node 0.5, when porting Node to Windows made libev (epoll/kqueue-centric) untenable — Microsoft funded the work, and IOCP required a new abstraction. It became independently popular (Julia, Neovim use it). Version 1.45 (2023) added io_uring support for file I/O.',
    purpose: 'One portable event loop API over epoll, kqueue, IOCP, and event ports — so Node core never writes platform-specific I/O code.',
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
    tagline: "Node's built-in fetch — a from-scratch HTTP/1.1 client named 'eleven' in Italian",
    description: 'undici is the HTTP client that powers global fetch() in Node: its own spec-compliant fetch implementation, connection pooling, pipelining, and an llhttp-based parser — bypassing the legacy http.request stack entirely. The name is Italian for eleven: HTTP/1.1.',
    history: 'Started by Matteo Collina around 2018 to escape the performance and design debt of the core http client, undici became an official Node.js project; Node 18 (April 2022) shipped it as the engine behind global fetch, which was marked stable in Node 21 (2023).',
    purpose: 'Give Node a fast, correct, WHATWG-fetch-compatible HTTP client with explicit pooling semantics.',
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
    tagline: 'The last userspace stop: wraps raw syscalls in functions with names and errno',
    description: "glibc is the C runtime every process leans on: connect(), getaddrinfo(), malloc(). Node's C++ layer ultimately calls these wrappers, which marshal arguments into registers and execute the syscall instruction — then translate negative kernel returns into errno.",
    history: 'The GNU C Library was started in 1987 by Roland McGrath for the GNU project; Ulrich Drepper drove it through the Linux boom (1995-2012). The leaner musl libc (Rich Felker, 2011) powers Alpine — the base of countless Docker images, and the source of subtle glibc-vs-musl DNS behavior differences.',
    purpose: 'Provide the stable POSIX/C API surface so programs never hand-roll syscall assembly or resolver logic.',
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
    tagline: 'The syscall instruction: one CPU op that swaps ring 3 for ring 0',
    description: 'The syscall instruction jumps to the kernel entry point stored in the LSTAR MSR (entry_SYSCALL_64), swaps to a kernel stack via swapgs, and saves user registers. It is not a function call — it is a controlled privilege transition, the only legitimate door into the kernel.',
    history: 'Linux originally entered the kernel via int 0x80; Intel added SYSENTER (Pentium II, 1997) and AMD added SYSCALL (K6, 1997), which became the x86-64 standard. The Meltdown disclosure (January 2018) forced KPTI, which splits page tables at this boundary and made every syscall measurably pricier.',
    purpose: 'Let untrusted user code request privileged services without ever executing privileged instructions itself.',
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
    tagline: 'rax=41 means socket, 42 means connect — a numbered menu of kernel services',
    description: 'The kernel dispatches syscalls by indexing sys_call_table with the number from rax: on x86-64, socket is 41, connect 42, sendto 44, epoll_wait 232. The table is generated from syscall_64.tbl at build time and is read-only at runtime — rootkits historically loved patching it.',
    history: "Numbered syscall tables date to earliest UNIX (V6 had ~50 calls). Linux x86-64 launched with a clean renumbering in 2001-2003 (no more int 0x80 legacy numbers). New calls are appended, never renumbered — ABI stability is Linus' prime directive: never break userspace.",
    purpose: 'Map a stable numeric ABI to in-kernel handler functions, one number per service, forever.',
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
    tagline: 'Ring 0 and ring 3: the hardware line between the kernel and everyone else',
    description: 'x86 defines four privilege rings; Linux uses two: kernel in ring 0, everything else in ring 3. The current privilege level lives in the CS register, and privileged instructions (loading page tables, talking to devices) fault outside ring 0 — the mechanism that makes an OS possible at all.',
    history: 'Protection rings come from Multics (1960s, eight rings); x86 got protected mode rings with the 286 (1982) and paging with the 386 (1985). Modern eras added NX (2004), SMEP/SMAP (2011-2012), and the 2018 speculative-execution reckoning (Spectre/Meltdown) that redrew the ring boundary in microcode.',
    purpose: 'Enforce, in silicon, that user code cannot touch kernel memory, devices, or control registers.',
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
    tagline: 'A task_struct: address space, fd table, credentials — the unit of isolation',
    description: 'Every process is a task_struct: its mm_struct (address space), files_struct (fd table), credentials, namespaces, and scheduling state. Our node process is PID 1337; in the container the server runs as PID 1 — same struct, different pid namespace view.',
    history: 'fork() shipped in first-edition UNIX (1971), inherited conceptually from Project Genie. Linux generalized creation into clone() with shareable resources — the foundation for both threads and containers. Copy-on-write fork made process creation cheap enough to build shells and prefork servers on.',
    purpose: 'Bundle everything the kernel must know to run, schedule, isolate, and account for one program.',
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
    tagline: 'In Linux, a thread is just a task that shares its mm — clone() with benefits',
    description: 'Linux has no separate thread object: pthread_create calls clone(CLONE_VM|CLONE_FILES|CLONE_THREAD...), producing another task_struct sharing the address space and fd table. Node runs V8 on the main thread plus libuv workers; the kernel schedules each independently.',
    history: 'LinuxThreads (Xavier Leroy, 1996) faked POSIX threads with processes and had famous signal-handling warts. NPTL (Drepper & Molnar, 2003, kernel 2.6) fixed the model with futexes and proper thread groups — a 100k-thread benchmark went from 15 minutes to 2 seconds.',
    purpose: 'Concurrency within one address space: multiple schedulable contexts over shared memory.',
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
    tagline: 'Decides, thousands of times a second, which task each core runs next',
    description: 'The scheduler picks runnable tasks per-CPU using fair queuing: each task accrues virtual runtime and the one that has run least goes next. When our node process blocks in epoll_wait it leaves the runqueue entirely; a NIC interrupt later makes it runnable again.',
    history: 'Linux went O(n) → O(1) (Ingo Molnar, 2002) → CFS (Molnar, 2007, kernel 2.6.23, provoked by Con Kolivas showing desktop fairness mattered) → EEVDF (Peter Zijlstra, kernel 6.6, 2023), which implements a 1995 Stoica/Abdel-Wahab virtual-deadline algorithm for better latency guarantees.',
    purpose: 'Share finite CPUs among competing tasks with fairness, latency bounds, and cache-affinity awareness.',
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
    tagline: 'Small integers with superpowers: fd 42 is your TCP connection',
    description: "Per-process array mapping small ints to struct file: 0/1/2 are stdio, and when node calls socket() the kernel hands back the lowest free slot — our fd 42 pointing at socket:[TCP 51324→443]. Everything is a file: sockets, pipes, timers, epoll instances all live here.",
    history: "File descriptors are original UNIX (1971) — Ritchie and Thompson's unifying abstraction. Linux keeps the table in files_struct with RCU-protected resizing; the 'everything is a file' doctrine later absorbed epoll (2002), signalfd, timerfd, and eventfd so all of them can be select()ed together.",
    purpose: 'Give processes uniform, capability-like handles to every kernel I/O object.',
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
    tagline: 'Every process gets 128 TiB of make-believe; page tables make it real',
    description: 'Each process sees a private virtual address space — text, heap, mmapped libraries, stacks — described by VMAs in mm_struct, with the kernel mapped (but ring-0-only) in the upper half. Physical pages materialize lazily on fault; the TLB caches translations.',
    history: 'Paged virtual memory debuted on the Atlas (Manchester, 1962). x86-64 Linux splits the canonical space at 128 TiB user / 128 TiB kernel (4-level tables; 5-level since 2017 extends further). VMA bookkeeping moved from red-black tree to maple tree in kernel 6.1 (2022). Meltdown (2018) forced KPTI to unmap most of the kernel from user page tables.',
    purpose: 'Isolation and abstraction: every process believes it owns memory, and the kernel arbitrates the physical truth.',
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
    tagline: 'The 1983 API every network program still speaks: socket, connect, send, recv',
    description: "net/socket.c is the protocol-agnostic front door: sys_socket allocates a struct socket bound to an fd, then dispatches by family and type — AF_INET + SOCK_STREAM finds TCP via inet_create. Forty years of programs, one API.",
    history: 'The socket API shipped in 4.2BSD (1983), designed by Bill Joy and the CSRG at Berkeley under DARPA funding to give TCP/IP a programming interface. It was so successful that Windows adopted it as Winsock (1992) and POSIX standardized it — the rare API that outlived every OS it started on.',
    purpose: 'Decouple applications from protocol internals: one verb set for TCP, UDP, UNIX, netlink, and beyond.',
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
    tagline: 'The kernel-side connection: queues, buffers, timers, and state for fd 42',
    description: 'Beneath the fd sits struct sock — for TCP, the full tcp_sock embedding congestion state, sequence numbers, and RTT estimates — with sk_receive_queue and sk_write_queue holding sk_buffs in flight. This object is what ss -tmi prints and what lives on after close() in TIME_WAIT.',
    history: 'The layered sock hierarchy (sock → inet_sock → inet_connection_sock → tcp_sock) evolved through the 2.x series as Linux networking was rewritten (Alan Cox, David Miller era). Autotuned socket buffers arrived in 2.4/2.6 (Semke et al. research, 1998), replacing fixed 64KB defaults.',
    purpose: 'Hold all per-connection kernel state: what has been sent, acked, received, buffered, and negotiated.',
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
    tagline: 'Reliable, ordered byte streams over an unreliable network',
    description: 'The kernel TCP implementation: handshake state machine, sequence/ack bookkeeping, retransmission timers, and congestion control. Our SYN with ISN 1128394821 leaves tcp_v4_connect; everything after — loss recovery, pacing, windows — happens here without the application ever knowing.',
    history: 'Cerf & Kahn described TCP in 1974 (RFC 675); it split into TCP/IP in 1978 and was standardized as RFC 793 (Postel, 1981), now RFC 9293 (2022). The 1986 congestion collapse led to Van Jacobson slow start/AIMD (1988). Linux defaulted to CUBIC in 2006; Google published BBR in 2016.',
    purpose: 'Turn best-effort packets into a reliable, ordered, congestion-controlled byte stream.',
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
    tagline: 'Eight bytes of header and no promises — which is exactly why DNS and QUIC use it',
    description: 'UDP adds only ports and an optional checksum to IP: no handshake, no ordering, no retransmission. Our DNS query to 1.1.1.1 rides UDP because one small request/response pair needs none of TCP’s machinery — and QUIC rebuilt reliability on top of it in userspace.',
    history: 'David Reed specified UDP in RFC 768 (August 1980), preserving end-to-end simplicity for applications that wanted datagrams, not streams. Decades later that minimalism made it the substrate for QUIC (Google 2012, RFC 9000 in 2021) precisely because middleboxes ossified TCP.',
    purpose: 'Deliver individual datagrams with port-level demultiplexing and nothing else.',
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
    tagline: 'Addressing and best-effort forwarding: every hop decrements TTL and hopes',
    description: 'The IP layer stamps each packet with source 192.168.1.23 and destination 104.18.32.7, sets TTL 64, and forwards hop by hop with no delivery guarantee. Fragmentation, ICMP errors, and the DF bit live here; so does the header checksum recomputed at every router.',
    history: 'IPv4 was standardized in RFC 791 (1981) after the 1978 TCP/IP split put addressing and delivery below the reliability layer. Address exhaustion drove CIDR (1993), NAT (1994), and IPv6 (RFC 2460 in 1998, now RFC 8200) — with 32 bits proving to be the most consequential design constraint in networking history.',
    purpose: 'Global addressing plus stateless, best-effort, hop-by-hop packet delivery.',
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
    tagline: 'Longest-prefix match: the one lookup that decides where every packet goes',
    description: 'The Forwarding Information Base answers one question per packet: which next hop and interface for this destination? 104.18.32.7 matches nothing local on our laptop, so the default route 0.0.0.0/0 via 192.168.1.1 wins — longest prefix always, default as the zero-length fallback.',
    history: 'Linux stores IPv4 routes in an LC-trie (level-compressed trie, from a 1999 Nilsson & Karlsson paper) — merged in 2005 and made the sole implementation in 2.6.39 — delivering O(log n)-ish lookups over what is a million-route table in BGP routers. Policy routing (ip rule, multiple tables) arrived with the 2.2-era rewrite.',
    purpose: 'Map every destination address to a next hop and egress interface in nanoseconds.',
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
    tagline: 'Bridges L3 to L2: "who has 192.168.1.1? Tell 192.168.1.23"',
    description: 'Before the first frame can leave, the kernel must map the next-hop IP 192.168.1.1 to MAC a4:91:b1:0c:44:e2. ARP broadcasts the question; the neighbor cache stores the answer with a state machine (REACHABLE, STALE, PROBE) so it is asked rarely.',
    history: 'David Plummer defined ARP in RFC 826 (November 1982) as Ethernet met IP. IPv6 replaced it with Neighbor Discovery (NDP over ICMPv6, RFC 4861). Its trusting design — believe any reply — made ARP spoofing the canonical LAN attack, countered today by switch-level dynamic ARP inspection.',
    purpose: 'Resolve on-link IP addresses to hardware addresses, and cache the answers.',
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
    tagline: 'A complete private network stack per namespace — the trick containers are made of',
    description: 'A network namespace is a full copy of the stack: own interfaces, routes, ARP cache, iptables, conntrack, and /proc/net. A process sees only its namespace’s network. Docker gives each container one; veth pairs and bridges wire them back together.',
    history: 'Network namespaces were merged around kernel 2.6.24 (2008), driven by Eric Biederman and the OpenVZ lineage of container work. They joined PID, mount, UTS, IPC, and user namespaces as the isolation primitives that LXC (2008) and then Docker (2013) assembled into "containers" — which are not a kernel object at all.',
    purpose: 'Give groups of processes fully independent network stacks on one kernel.',
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
    tagline: 'Five checkpoints in the packet path where the kernel lets you say no',
    description: 'Netfilter is a set of hook points woven into the IP path — PREROUTING, LOCAL_IN, FORWARD, LOCAL_OUT, POSTROUTING — where registered callbacks can accept, drop, or mangle every packet. iptables, nftables, and conntrack are all just customers of these hooks.',
    history: 'Rusty Russell started netfilter in 1998, and it shipped with kernel 2.4 (January 2001), replacing ipchains (2.2), which had replaced ipfwadm (2.0). The design insight — separate the hook infrastructure from the rule engine — is why nftables (2014) could replace iptables without touching the hooks.',
    purpose: 'Provide well-defined interception points so firewalling, NAT, and mangling compose without hacking the stack.',
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
    tagline: 'The rule engine on the hooks: tables, chains, and a verdict for every packet',
    description: 'iptables organizes rules into tables (filter, nat, mangle, raw) and chains mapped onto netfilter hooks; each packet walks the rules until one matches with a terminal verdict. Docker programs the nat table’s DOCKER chain; your distro’s firewall programs filter.',
    history: 'iptables shipped with kernel 2.4 (2001), authored by Rusty Russell. Its per-rule kernel structures aged badly at scale, so Patrick McHardy’s nftables (kernel 3.13, 2014) replaced the engine with a small in-kernel VM; modern distros run iptables-nft, translating old syntax onto the new engine. Kubernetes moved kube-proxy toward IPVS/nftables for the same scaling reasons.',
    purpose: 'Express firewall and NAT policy as ordered, stateful rule chains evaluated in-kernel.',
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
    tagline: 'The flow table that lets one NAT decision follow a connection for life',
    description: 'Conntrack records every flow as a tuple pair (original and reply direction) with state NEW, ESTABLISHED, or RELATED. NAT rules are consulted only for the first packet; conntrack replays the translation for every subsequent packet in both directions — statefulness as a service.',
    history: 'Connection tracking arrived with netfilter in kernel 2.4 (2001), making Linux a stateful firewall. Its helpers (FTP, SIP) parse protocols to spot related flows. The "nf_conntrack: table full, dropping packet" message has since become one of the most-Googled kernel log lines in operations history.',
    purpose: 'Give the kernel per-flow memory so firewalling and NAT can act on connections, not just packets.',
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
    tagline: 'The egress buffer with opinions: fq_codel decides what waits and what drops',
    description: 'Between the IP stack and the driver sits the qdisc — the traffic-control layer that queues, schedules, paces, and drops. Modern defaults run fq_codel (fair queues + controlled delay) or fq (per-flow pacing for BBR); this is where bufferbloat was fought and won.',
    history: 'Linux traffic control dates to the late-90s Alexey Kuznetsov era (CBQ, pfifo_fast). Jim Gettys named bufferbloat in 2010; Kathleen Nichols and Van Jacobson answered with CoDel (2012), and Eric Dumazet’s fq_codel and sch_fq (2013) plus BQL (2011) rebuilt Linux egress. systemd made fq_codel the default qdisc in 2017.',
    purpose: 'Manage the egress queue so throughput stays high while queueing delay stays low.',
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
    tagline: 'The kernel module that speaks one specific silicon dialect',
    description: 'The driver (e1000e, igb, mlx5_core...) implements net_device_ops: ndo_start_xmit posts our frame’s descriptor to the TX ring, ethtool ops expose counters and offloads, and its NAPI poll function harvests completions. It owns the register-level conversation with the hardware.',
    history: 'Donald Becker’s NE2000 and Tulip drivers (early 1990s) bootstrapped Linux networking hardware support. The modern split — generic core in net/core, silicon specifics in drivers/net/ethernet/<vendor> — plus NAPI (2001) and BQL (2011) turned drivers into thin, fast descriptor shovels.',
    purpose: 'Translate the kernel’s abstract net_device interface into one chipset’s registers, rings, and quirks.',
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
    tagline: 'Circular descriptor arrays: the shared to-do lists of CPU and NIC',
    description: 'The rings are circular arrays of descriptors in RAM — each pointing at a packet buffer — with producer/consumer indices advanced by driver and NIC respectively. TX: driver fills, NIC drains. RX: NIC fills, NAPI drains. When RX fills faster than the CPU drains, packets die here, counted but unmourned.',
    history: 'Descriptor rings became standard NIC architecture in the 1990s (DEC Tulip era) as PIO gave way to bus-mastering DMA. Ring sizing became a first-class tuning knob as 10/40/100GbE arrived; BQL (2011) capped in-flight TX bytes so rings stopped being hidden bufferbloat.',
    purpose: 'Decouple the CPU and NIC clock domains with lock-free shared queues of packet work.',
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
    tagline: 'The NIC reads and writes RAM directly — the CPU only handles pointers',
    description: 'Direct Memory Access lets the NIC copy frames to and from system RAM without the CPU touching a byte: the driver DMA-maps buffer addresses into descriptors, the NIC bus-masters the transfer over PCIe, and only completion needs CPU attention. Data moves; the CPU orchestrates.',
    history: 'DMA predates networking (1960s mainframe channel I/O); PCI bus mastering made it universal for NICs in the 1990s. The IOMMU era (Intel VT-d, 2007+) added address translation and isolation so devices cannot scribble on arbitrary RAM — closing the door DMA had left open (see: Thunderbolt attacks).',
    purpose: 'Move packet payloads between device and memory at bus speed with near-zero CPU cost.',
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
    tagline: 'The NIC taps the CPU on the shoulder: "descriptors await"',
    description: 'When frames complete, the NIC raises an MSI-X interrupt; the CPU suspends whatever ran, enters the IRQ handler, which does almost nothing — acknowledge, schedule NAPI, disable further RX interrupts — and returns in microseconds. The real work is deferred; interrupts are for waking up, not working.',
    history: 'Interrupts date to the UNIVAC 1103 (1953). PCI line interrupts (shared, level-triggered) gave way to MSI/MSI-X (2003-era), giving NICs per-queue vectors steerable to specific CPUs — the foundation of multi-core packet processing and the irqbalance daemon’s reason to exist.',
    purpose: 'Deliver asynchronous hardware events with minimal latency and minimal time in interrupt context.',
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
    tagline: 'Deferred interrupt work: NET_RX runs the stack with interrupts back on',
    description: 'SoftIRQs are the kernel’s bottom halves: the IRQ handler raises NET_RX_SOFTIRQ and returns; do_softirq later runs NAPI polls, protocol processing, and socket delivery in a context that is interruptible and per-CPU. Overflow work falls to the ksoftirqd/N kernel threads you see in top.',
    history: 'The top/bottom-half split is classic UNIX; Linux formalized softirqs in the 2.3/2.4 rewrite (1999-2001) replacing the old bottom halves with per-CPU, parallel-friendly deferred contexts. NET_RX/NET_TX have been networking’s home ever since; ksoftirqd caps how much they can starve normal tasks.',
    purpose: 'Do the heavy per-packet work outside interrupt context, batched, per-CPU, and preemptible-ish.',
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
    tagline: 'Interrupt when idle, poll when busy — the 2001 fix for interrupt livelock',
    description: 'NAPI adaptively switches the RX path from interrupt-driven to polling: first packet interrupts, then the driver’s poll() harvests up to weight (64) packets per pass with interrupts masked, under a global budget (300) per softirq round. Under load, per-packet interrupt cost simply disappears.',
    history: 'NAPI came from Jamal Hadi Salim, Robert Olsson, and Alexey Kuznetsov ("Beyond Softnet", USENIX 2001; mainlined in 2.4.20/2.5) to cure interrupt livelock — gigabit-era machines dying at 100% CPU handling interrupts while doing zero useful work. GRO later stacked on top, merging packets during the poll.',
    purpose: 'Keep per-packet overhead near zero at high rates while preserving low latency when idle.',
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
    tagline: 'Where software ends and physics begins',
    description: 'The NIC is the silicon that turns descriptors into signals: it DMAs frames from RAM, computes checksums and segmentation in hardware, appends the FCS, and hands bits to the PHY. Modern cards also do RSS hashing, TSO/LRO, timestamping, and increasingly run eBPF/XDP-adjacent offloads.',
    history: 'Robert Metcalfe and David Boggs built Ethernet at Xerox PARC in 1973; 3Com (Metcalfe, 1979) sold the first Ethernet cards, and IEEE 802.3 standardized it in 1983. Speeds went 10Mb → 100 (1995) → 1G (1999) → 10G (2002) → 100G+, and NICs absorbed ever more of the stack as CPUs stopped getting faster per-core.',
    purpose: 'Bridge the kernel’s packet abstractions to a physical transmission medium, offloading what silicon does better.',
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
    tagline: '14 bytes of header, up to 1500 of payload, 4 bytes of CRC — repeat a trillion times',
    description: 'The L2 container: destination MAC a4:91:b1:0c:44:e2, source 3c:07:54:6a:2b:91, EtherType 0x0800 for IPv4, then the IP packet, then a 32-bit CRC. Preamble and interframe gap wrap it on the wire. The destination MAC is the next hop, never the final destination — that is IP’s job.',
    history: 'Metcalfe’s 1973 memo described CSMA/CD over a shared coax; DIX Ethernet II (DEC/Intel/Xerox, 1982) fixed the EtherType field format still used today, and IEEE 802.3 (1983) standardized the alternative length-field framing. Switching (1990s) killed collisions, but the frame format survived every speed jump unchanged.',
    purpose: 'Deliver a payload between two adjacent stations on a link, with error detection.',
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
    tagline: 'Four address fields, ACKs for every frame, and a medium everyone must share',
    description: 'Wi-Fi frames carry up to four MAC addresses (transmitter, receiver, source, destination via the AP), a sequence control field, and QoS headers. Unlike Ethernet, every unicast frame is individually acknowledged and retried at the MAC layer, and stations must win contention (CSMA/CA + backoff) before transmitting at all.',
    history: 'IEEE 802.11 shipped in 1997 at 2 Mbps; 802.11b (1999) made it consumer reality and Wi-Fi Alliance branding made it a household word. WEP (broken 2001) gave way to WPA (2003), WPA2/CCMP (2004), and WPA3/SAE (2018). 802.11n (2009) added MIMO, ac (2013) wider channels, ax/Wi-Fi 6 (2019) OFDMA scheduling.',
    purpose: 'Deliver L2 frames over a shared, lossy radio medium with retries, encryption, and coordinated access.',
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
    tagline: 'Encodes bits as voltage, light, or radio — and negotiates the link before any of it',
    description: 'The physical layer chip converts frame bits into line signals: 4D-PAM5 over copper for gigabit, PAM4 over fiber at higher rates, OFDM subcarriers for Wi-Fi. It also runs auto-negotiation, link training, and clock recovery — the reason a cable "just works" when plugged in.',
    history: 'Manchester encoding carried 10BASE-T (1990); 100BASE-TX brought 4B/5B (1995); 1000BASE-T (1999) achieved gigabit over Cat5 with 4D-PAM5 and echo cancellation on all four pairs simultaneously — an achievement in DSP as much as networking. Auto-negotiation (802.3u, 1995) ended the era of manually matching duplex.',
    purpose: 'Turn abstract bits into physically transmittable symbols reliably enough that upper layers can pretend the medium is digital.',
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
    tagline: 'Electrons, photons, or 2.4 GHz radio — the packet as a physical event',
    description: 'The frame finally exists as energy: differential voltage on twisted pairs, laser pulses down single-mode fiber at ~200,000 km/s, or modulated radio waves. Propagation delay here is the floor no engineer can optimize below — physics sets the RTT budget for everything above.',
    history: 'Telegraph signaling (1830s) established the electrical transmission of symbols; Shannon’s 1948 information theory set the capacity limits every modulation scheme approaches; Kao and Hockham’s 1966 low-loss fiber prediction (Nobel 2009) enabled the intercontinental optical backbone the internet now rides.',
    purpose: 'Physically transport information across distance within the limits of the medium and the speed of light.',
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
    tagline: 'Learns MACs, forwards frames, floods only when it must',
    description: 'A switch forwards frames by MAC using a CAM/MAC table it builds by observing source addresses on each port. Unknown destinations are flooded to all ports; the reply teaches it the location. It is a pure L2 device: it never looks at IP addresses and never decrements TTL.',
    history: 'Kalpana shipped the first Ethernet switch (EtherSwitch, 1990), replacing hubs and their shared collision domains; Cisco acquired them in 1994. Radia Perlman’s Spanning Tree Protocol (1985, later 802.1D) made redundant switch topologies survivable by pruning loops — because Ethernet frames have no TTL to save them.',
    purpose: 'Forward frames only where they need to go, giving every port a full-duplex, collision-free link.',
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
    tagline: 'Switch, AP, DHCP server, DNS forwarder, firewall, and NAT box in one plastic shell',
    description: 'The box at 192.168.1.1 (MAC a4:91:b1:0c:44:e2) is the default gateway: it terminates our LAN frame, routes the packet toward the internet, rewrites the source to WAN IP 203.0.113.77, and tracks the flow so the reply comes home. It is also handing out DHCP leases and often running dnsmasq.',
    history: 'Consumer NAT routers arrived with broadband around 1999-2000 (Linksys BEFSR41 et al.), most running Linux — a GPL-compliance fight over the WRT54G source in 2003 birthed OpenWrt and DD-WRT, arguably the most consequential open-source firmware lineage in home networking.',
    purpose: 'Connect a private LAN to a single ISP-provided public address while providing addressing, naming, and basic security.',
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
    tagline: 'One public IP, many private hosts — the hack that postponed IPv4 exhaustion by decades',
    description: 'NAT rewrites the packet’s source 192.168.1.23:51324 to 203.0.113.77:51324 (or a remapped port) and remembers the mapping so replies can be reversed. It is stateful by necessity, invisible to the client, and the reason inbound connections to your laptop do not work.',
    history: 'Egevang and Francis proposed NAT in RFC 1631 (1994) as a stopgap for address exhaustion; RFC 3022 (2001) documented the port-translating (NAPT) form everyone actually uses. It broke the end-to-end principle so thoroughly that a generation of protocols (SIP, FTP, P2P) needed helpers, STUN, TURN, and ICE to survive it.',
    purpose: 'Multiplex many private endpoints behind one routable address, preserving IPv4 for a few more decades.',
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
    tagline: 'Translates Ethernet into whatever the last mile actually speaks',
    description: 'The modem converts LAN Ethernet frames to the access medium: RF channels on coax for DOCSIS cable, laser bursts on a shared PON for fiber, or DSL tones on copper. It is where your traffic joins a medium shared with the neighborhood — and where upstream is usually far narrower than downstream.',
    history: 'Dial-up modems (Bell 103, 1962) topped out at 56k. DOCSIS 1.0 (CableLabs, 1997) put IP on cable TV plant; ADSL (1998) reused phone copper. GPON (ITU-T G.984, 2003) and now XGS-PON brought symmetric gigabit fiber. DOCSIS 3.1 (2013) added OFDM and full duplex ambitions to keep coax competitive.',
    purpose: 'Modulate and demodulate between the home network and the ISP access network.',
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
    tagline: 'Where thousands of neighborhood links terminate and become IP traffic',
    description: 'The CMTS (cable) or OLT (fiber) terminates the access medium, schedules upstream transmission slots, and hands aggregated traffic to the ISP’s routed core. It enforces per-subscriber policy: rate limits, DHCP/provisioning, and lawful-intercept plumbing.',
    history: 'Cable headends began as TV signal aggregation points in the 1950s-60s; DOCSIS (1997) added the CMTS to make them two-way IP infrastructure. The 2010s brought distributed access architecture (Remote PHY), pushing digital termination deep into neighborhoods to shorten analog runs and increase capacity.',
    purpose: 'Aggregate many subscriber access links into the provider’s IP network while policing capacity per subscriber.',
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
    tagline: 'MPLS-labeled, high-capacity routing between access edge and the wider internet',
    description: 'The provider core carries aggregated subscriber traffic across regional and national links, typically with MPLS label switching and IS-IS/OSPF for internal topology, then hands traffic to peering or transit at border routers. Our packet to 104.18.32.7 crosses it in a few milliseconds.',
    history: 'Backbones evolved from NSFNET (1985-1995, the 56kbps-to-45Mbps academic core) to commercial ISPs after the 1995 privatization. MPLS (Cisco tag switching 1996, standardized RFC 3031 in 2001) merged ATM-style traffic engineering with IP routing; segment routing (RFC 8402, 2018) is now simplifying it again.',
    purpose: 'Move enormous aggregate traffic between edges reliably, with engineering control over paths and failures.',
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
    tagline: 'The protocol that glues 75,000 autonomous networks into one internet — on trust',
    description: 'Border Gateway Protocol exchanges reachability between autonomous systems: "AS 13335 can reach 104.18.0.0/20, via this AS path." Path selection is policy-first (local preference, AS path length, MED), not shortest-latency. The full table exceeds 950,000 IPv4 prefixes.',
    history: 'Kirk Lougheed and Yakov Rekhter sketched BGP on three napkins at an IETF meeting in 1989 (RFC 1105 — the "two-napkin protocol"); BGP-4 with CIDR support (RFC 1654/4271) arrived in 1994-95 and still runs the internet. Security came late and partially: RPKI origin validation (RFC 6480, 2012) is only now widely deployed.',
    purpose: 'Distribute inter-domain routes and let each network apply its own business policy to path selection.',
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
    tagline: 'Glass strands carrying terabits, and the propagation delay you cannot negotiate with',
    description: 'Long-haul fiber links carry dozens of wavelengths (DWDM), each at 100-800 Gbps, amplified every ~80 km by EDFAs. Light travels at roughly two-thirds c in glass — about 5 microseconds per kilometer — which sets the irreducible latency of every intercontinental request.',
    history: 'Charles Kao predicted low-loss fiber in 1966 (Nobel 2009); Corning produced 20 dB/km glass in 1970. TAT-8 (1988) was the first transatlantic fiber cable at 280 Mbps. Erbium-doped amplifiers (1987) and DWDM (1990s) multiplied capacity by orders of magnitude; today ~600 submarine cables carry over 99% of intercontinental traffic.',
    purpose: 'Move immense aggregate bandwidth over continental and oceanic distances with minimal loss.',
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
    tagline: 'Networks that reach the entire internet without paying anyone for transit',
    description: 'A Tier 1 network (Lumen/3356, Arelion/1299, GTT, NTT, Telia-class) reaches every destination purely through settlement-free peering with other Tier 1s plus its own customers. Our packet may traverse one on the way to Cloudflare — though Cloudflare peers so widely it often does not need to.',
    history: 'The Tier 1 concept emerged after the 1995 NSFNET privatization, when commercial backbones had to interconnect voluntarily. The 2005 Level 3 / Cogent depeering split the internet into partitions for weeks, proving the "full reachability" claim depends entirely on business relationships, not technology.',
    purpose: 'Provide global reachability as a product, selling transit downstream and swapping traffic with equals.',
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
    tagline: 'The other side of the handoff — a peer network carrying the packet closer',
    description: 'A second large network on the path, reached over a settlement-free peering link or an IXP fabric. Traffic crosses AS boundaries here with no money changing hands in either direction; each side carries it because the exchange is mutually beneficial.',
    history: 'Settlement-free peering formalized at the original NAPs (1994-95) and matured through the IXP movement (LINX 1994, AMS-IX 1997, DE-CIX 1995). The 2010s saw content networks (Google, Netflix, Cloudflare, Meta) become top-tier traffic sources, inverting the old ISP-centric hierarchy into a flatter, more directly-peered internet.',
    purpose: 'Exchange traffic directly with another large network to cut cost, latency, and hop count.',
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
    tagline: 'A giant L2 fabric in a building where hundreds of networks meet and trade traffic',
    description: 'An IXP is a shared switching fabric — DE-CIX Frankfurt, AMS-IX, LINX — where member networks connect one port and peer with hundreds of others, often via a route server. It converts what would be N^2 private cross-connects into one port plus BGP sessions.',
    history: 'IXPs descend from the 1990s NAPs created for NSFNET privatization. LINX (1994), DE-CIX (1995), and AMS-IX (1997) grew into the largest, with DE-CIX peaking above 17 Tbps. Their existence keeps regional traffic local — an outage at a major IXP degrades an entire continent’s latency.',
    purpose: 'Make peering cheap and dense so traffic stays local instead of touring the globe via transit.',
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
    tagline: 'The tiny client in every host that knows one thing: who to ask',
    description: 'The stub resolver — glibc getaddrinfo, systemd-resolved, or Chrome’s built-in async resolver — turns a hostname into an address by consulting nsswitch.conf, /etc/hosts, local caches, and finally sending a UDP query (TXID 0x8f3a) to 1.1.1.1. It performs no recursion itself; it delegates entirely.',
    history: 'The split between stub and recursive resolvers was in the original DNS design (Mockapetris, RFC 882/883, 1983): hosts stay dumb, servers do the walking. Linux long used the simple glibc resolver reading /etc/resolv.conf; systemd-resolved (2014) added caching, DNSSEC validation, and per-link DNS, complicating the once-trivial picture.',
    purpose: 'Resolve names to addresses for applications with the least possible client-side complexity.',
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
    tagline: 'Does the walking so your laptop does not: root → TLD → authoritative, then caches',
    description: 'The recursive resolver accepts our query for api.shop.dev, and if it is not cached, walks the delegation chain: root servers for .dev, TLD servers for shop.dev, then the authoritative servers for the answer. It caches every step by TTL and validates DNSSEC signatures when present.',
    history: 'Recursion was part of DNS from Mockapetris’ 1983 design. Public recursive resolvers became infrastructure with OpenDNS (2006), Google Public DNS 8.8.8.8 (2009), and Cloudflare 1.1.1.1 (April 2018, with APNIC, promising a 24-hour log retention privacy stance). DoT (RFC 7858, 2016) and DoH (RFC 8484, 2018) encrypted the last mile.',
    purpose: 'Centralize the expensive iterative resolution work and amortize it across many clients via caching.',
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
    tagline: '13 named servers, 1,900+ anycast instances, and the answer is always "ask someone else"',
    description: 'The root zone knows nothing about api.shop.dev — only which nameservers are authoritative for .dev. There are 13 root server identities (a through m.root-servers.net) operated by 12 organizations, replicated worldwide via anycast, and every recursive resolver ships their addresses in a hints file.',
    history: 'The root zone dates to the original DNS deployment (1984-85); the 13-server limit came from fitting the priming response in a 512-byte UDP packet. Anycast (from 2002 onward, accelerated after the October 2002 DDoS attack on the roots) turned 13 addresses into hundreds of physical sites. The root zone was DNSSEC-signed in July 2010 with a public key ceremony.',
    purpose: 'Serve the apex of the DNS hierarchy: delegations to every top-level domain.',
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
    tagline: 'One level down: knows every domain in its TLD and nothing about their contents',
    description: 'The .dev TLD servers (operated by Google Registry, which runs .dev as an HSTS-preloaded TLD requiring HTTPS) answer with a referral to shop.dev’s authoritative nameservers plus DS records for DNSSEC. They know delegations, not addresses.',
    history: 'The original TLDs were defined in RFC 920 (1984): .com, .edu, .gov, .mil, .org, .net, plus ccTLDs. ICANN’s new gTLD program (2012 application round) added hundreds; Google bought .dev at auction for $25M in 2015 and launched it publicly in 2019, notable for being HSTS-preloaded — every .dev site is HTTPS-only by browser enforcement.',
    purpose: 'Hold delegations for every second-level domain registered under one top-level domain.',
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
    tagline: 'Where the answer actually lives: the zone file for shop.dev',
    description: 'The authoritative server for shop.dev holds the zone data and answers with the AA (authoritative answer) flag set: api.shop.dev is a CNAME/A pointing at Cloudflare anycast 104.18.32.7. Behind the scenes it may compute answers dynamically for geo-steering or health-based failover.',
    history: 'BIND (Berkeley Internet Name Domain, 1984, from a UC Berkeley student project) was the reference implementation for decades and the source of many CVEs; NSD (2003), PowerDNS (1999), and Knot (2011) followed, while cloud providers (Route 53 in 2010, Cloudflare DNS) moved authority into API-driven anycast fleets with sub-minute propagation.',
    purpose: 'Serve the definitive records for a zone and control how traffic to that name is steered.',
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
    tagline: 'One IP announced from 300+ cities — BGP picks the nearest instance for you',
    description: '104.18.32.7 is not one machine: Cloudflare announces the covering prefix from every data center it operates, and normal BGP best-path selection routes each user to a topologically near instance. No DNS trickery, no client logic — the routing table is the load balancer.',
    history: 'Anycast was described in RFC 1546 (1993) and first hardened at scale on the DNS root servers (from 2002). Cloudflare launched in September 2010 built entirely on anycast for both DNS and HTTP — unusual at the time, since stateful TCP over anycast was considered risky; in practice, routes are stable enough that resets are rare.',
    purpose: 'Put the service topologically close to every user simultaneously, using routing rather than redirection.',
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
    tagline: 'Drops the flood in silicon/XDP before it ever costs a socket',
    description: 'At the edge, traffic passes fingerprinting and rate-limiting layers that drop attack packets in kernel bypass paths — Cloudflare’s L3/L4 mitigation (historically the BPF-based "Gatebot" and now XDP-driven l4drop) matches attack signatures and discards them at line rate, long before TCP state or an application worker is involved.',
    history: 'DDoS emerged as a mass phenomenon with the February 2000 attacks on Yahoo/eBay/CNN. Amplification eras followed: DNS (2013 Spamhaus, 300 Gbps), NTP (2014), memcached (2018, 1.7 Tbps), and HTTP/2 Rapid Reset (CVE-2023-44487) which hit 398 million requests/second. XDP (kernel 4.8, 2016) gave defenders line-rate packet drop in software.',
    purpose: 'Keep the service available under volumetric and application-layer attack without harming legitimate users.',
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
    tagline: 'Reads the HTTP request and decides whether it smells like an attack',
    description: 'The WAF inspects method, path, headers, and body against rule sets — SQL injection patterns, path traversal, known CVE probes (Log4Shell, Struts) — plus bot scores and rate limits. Our GET /products?limit=20 is boring, which is exactly what gets it through.',
    history: 'ModSecurity (Ivan Ristić, 2002) created the open WAF category, later paired with the OWASP Core Rule Set (2006). Cloud WAFs (Cloudflare, AWS WAF 2015) made rule deployment global and instant — which became decisive in December 2021 when Log4Shell mitigations rolled out to millions of sites within hours of disclosure.',
    purpose: 'Block application-layer attacks at the edge, buying time that patching cannot.',
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
    tagline: 'Serves from a datacenter 20ms away instead of an origin 200ms away',
    description: 'The edge cache stores responses keyed by URL and Vary headers, honoring Cache-Control and origin rules. Our /products?limit=20 API response is typically not cached by default (Cloudflare caches static extensions unless told otherwise), so this request becomes a cache MISS and proceeds to the origin.',
    history: 'CDNs began with Akamai (1998, from MIT research on consistent hashing by Karger, Leighton et al.) serving static assets. Cloudflare (2010) fused caching with security at the same anycast edge. Modern edges add tiered caching, stale-while-revalidate (RFC 5861, 2010), and cache reservation to cut origin load by orders of magnitude.',
    purpose: 'Terminate as many requests as possible at the edge, cutting both latency and origin cost.',
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
    tagline: 'The handshake ends 20ms away — encryption without the transcontinental RTT',
    description: 'The edge terminates TLS: it presents the certificate for api.shop.dev, negotiates TLS 1.3 with X25519 key exchange and AES-128-GCM, and completes the handshake in one round trip. Because the edge is near the user, the expensive handshake RTTs are cheap ones.',
    history: 'Netscape created SSL 2.0 (1995) and 3.0 (1996, Freier/Karlton/Kocher); the IETF renamed it TLS 1.0 (RFC 2246, 1999). BEAST/CRIME/POODLE/Heartbleed (2011-2014) forced a decade of hardening. TLS 1.3 (RFC 8446, August 2018) cut the handshake to 1-RTT, removed RSA key transport and static keys entirely, and encrypted most of the handshake itself.',
    purpose: 'Provide confidentiality, integrity, and server authentication while minimizing handshake latency.',
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
    tagline: 'A second, separate TLS connection from the edge to your real server',
    description: 'On a cache miss the edge opens its own connection to origin 198.51.100.10, adding X-Forwarded-For, CF-Connecting-IP, and X-Forwarded-Proto so the app knows the real client. This leg is a distinct TCP+TLS session, usually kept alive and pooled, and it is where the transcontinental RTT actually gets paid.',
    history: 'Reverse-proxy origin pull is as old as CDNs (Akamai, 1998), but the security model matured slowly: Cloudflare added Authenticated Origin Pulls (mTLS client certs) and Argo Smart Routing (2017) to optimize this leg, and Tunnel/cloudflared (2018) removed the need for a publicly reachable origin at all.',
    purpose: 'Fetch fresh content from the origin while preserving client context and protecting the origin from direct exposure.',
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
    tagline: 'Spreads connections across backends and notices when one dies',
    description: 'The load balancer at the origin distributes incoming connections across app servers by round-robin, least-connections, or consistent hashing, while health checks eject unhealthy members. L4 balancers forward packets/flows; L7 balancers parse HTTP and can route by path, header, or cookie.',
    history: 'Hardware load balancers (Cisco LocalDirector 1996, F5 BIG-IP 1997) started the category. LVS/IPVS brought L4 balancing into the Linux kernel (Wensong Zhang, 1998). HAProxy (Willy Tarreau, 2001) and nginx (Igor Sysoev, 2004) made software L7 balancing the default; Maglev (Google, NSDI 2016) and Katran (Meta, 2018) showed consistent hashing at XDP speed.',
    purpose: 'Turn a pool of fallible servers into one reliable, horizontally scalable endpoint.',
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
    tagline: 'Terminates TLS, speaks HTTP fluently, and hands clean requests to your app',
    description: 'The reverse proxy accepts the connection, terminates TLS, normalizes and buffers the HTTP request, then proxies to the app at 172.17.0.2:3000 over plain HTTP. It handles slow clients, compression, static files, and header hygiene so the application never has to.',
    history: 'Igor Sysoev wrote nginx to solve the C10K problem (Dan Kegel’s 1999 formulation) for Rambler, releasing it in October 2004 with an event-driven architecture opposite Apache’s process-per-connection model. Caddy (Matt Holt, 2015) went further by making automatic HTTPS via ACME the default — no cert configuration at all.',
    purpose: 'Absorb the messy realities of the public internet so application code sees clean, well-formed requests.',
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
    tagline: 'docker -p 443:3000 becomes an iptables rule rewriting the destination',
    description: 'Publishing a container port installs a DNAT rule in the nat table’s PREROUTING chain: traffic to host port 443 has its destination rewritten to 172.17.0.2:3000. Conntrack remembers the mapping so replies are un-translated automatically on the way out.',
    history: 'Destination NAT arrived with netfilter in kernel 2.4 (2001). Docker (2013) built port publishing directly on it, generating DOCKER chains; Kubernetes kube-proxy did the same at far larger scale until iptables rule counts (O(n) matching over thousands of services) drove the move to IPVS mode and later nftables/eBPF dataplanes like Cilium.',
    purpose: 'Expose a service running inside an isolated namespace on a host-reachable address and port.',
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
    tagline: 'A software switch at 172.17.0.1 connecting every container to the host',
    description: 'docker0 is an in-kernel Linux bridge: it learns MAC addresses, forwards frames between attached veth interfaces, and serves as the default gateway (172.17.0.1) for containers on 172.17.0.0/16. It is a switch made of code, sitting inside the host kernel.',
    history: 'The Linux bridge dates to the 2.4 series (Lennert Buytenhek’s implementation) for turning a PC into an Ethernet switch. Docker adopted it in 2013 as the default network driver; Open vSwitch (2009) and later eBPF-based dataplanes (Cilium, 2016+) offer richer alternatives, but docker0 remains the canonical mental model.',
    purpose: 'Provide L2 connectivity among containers and a routed path to the outside world.',
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
    tagline: 'A virtual patch cable: two interfaces, whatever enters one exits the other',
    description: 'A veth pair is two linked virtual NICs — one end (vethXXXX) enslaved to docker0 in the host namespace, the other (eth0) inside the container namespace. Frames written to one end appear on the other immediately, in-kernel, no wire required.',
    history: 'veth landed in kernel 2.6.24 (2008) alongside network namespaces, contributed as part of the container infrastructure effort. It became the universal container plumbing primitive; performance-sensitive setups later added alternatives — macvlan/ipvlan (fewer hops) and eBPF-based redirection that skips the bridge entirely.',
    purpose: 'Connect two network namespaces with an ordinary-looking Ethernet link.',
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
    tagline: 'Inside the container: its own eth0 at 172.17.0.2, its own routes, its own firewall',
    description: 'The container’s network namespace holds eth0 (the veth peer) with address 172.17.0.2/16, a default route via 172.17.0.1, and an isolated conntrack and iptables state. To the Node process at PID 1 inside, this looks like an entire machine with one NIC.',
    history: 'This is network namespaces (2.6.24, 2008) applied: Docker (2013) creates one per container and wires it with veth; Kubernetes pods (2015) put multiple containers in one shared namespace so they share localhost, which is why sidecar patterns work at all.',
    purpose: 'Give the container a complete, isolated network view so ports and routes never collide with the host or other containers.',
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
    tagline: 'PID 1 in the container, listening on 0.0.0.0:3000, accept() in a loop',
    description: 'The Node HTTP server holds a listening socket bound to 0.0.0.0:3000; libuv’s epoll reports a completed connection, accept() returns a new fd, and llhttp parses the request into headers and a body before Express/Nest routing begins. Backlog, keep-alive, and header limits all live here.',
    history: 'Node’s http module has been core since 2009; its parser moved from Joyent’s http_parser (Ryan Dahl, 2009) to llhttp (Fedor Indutny, 2018) for maintainability and speed. Node 12+ tightened header/timeout defaults after a series of DoS CVEs (Slowloris-style, HTTP request smuggling), making headersTimeout and requestTimeout real settings people must know.',
    purpose: 'Accept TCP connections and turn raw bytes into HTTP request/response objects for the framework above.',
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
    tagline: 'A pipeline of functions, each holding the next one hostage',
    description: 'Before the route handler runs, the request passes through middleware: helmet sets security headers, cors evaluates origin, body-parser reads and JSON-decodes the body, logging and tracing wrap the timing. Each calls next() — or ends the response and stops the chain.',
    history: 'The pattern comes from Ruby’s Rack (2007) via Connect (TJ Holowaychuk, 2010) into Express (2010), which became the default Node web framework. NestJS (Kamil Mysliwiec, 2017) layered a structured lifecycle on top — guards, interceptors, pipes, filters — bringing Angular-style DI and ordering guarantees to the same underlying Express/Fastify plumbing.',
    purpose: 'Compose cross-cutting concerns as ordered, reusable stages around every request.',
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
    tagline: 'Maps GET /products?limit=20 to a method, validates input, returns a DTO',
    description: 'The controller declares routes via decorators (@Controller("products"), @Get()), extracts and validates query parameters through pipes (ValidationPipe with class-validator), calls the service, and returns a plain object that Nest serializes to JSON. It contains no business logic — routing and shape only.',
    history: 'NestJS was created by Kamil Mysliwiec in 2017, importing Angular’s decorator-driven DI and module system to the server. It runs on Express by default (Fastify optional) and standardized what had been ad-hoc Express project structure into modules, providers, and controllers with testability designed in.',
    purpose: 'Translate HTTP into typed method calls and back, keeping transport concerns out of the domain layer.',
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
    tagline: 'Where the actual business rules live — injectable, testable, transport-agnostic',
    description: 'The @Injectable() service holds the domain logic: which tours are visible, how pagination is bounded, what caching applies, and it calls Prisma for persistence. It knows nothing about HTTP, which is exactly why it can be unit-tested without a server.',
    history: 'The service/repository split descends from Domain-Driven Design (Eric Evans, 2003) and layered architecture patterns (Fowler, "Patterns of Enterprise Application Architecture", 2002). Nest made it idiomatic in Node by shipping a real DI container, so services are constructor-injected and trivially mockable in tests.',
    purpose: 'Encapsulate business behavior in one place, independent of how it is invoked.',
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
    tagline: 'Typed schema in, SQL out — with a Rust engine doing the talking',
    description: 'prisma.tour.findMany({ take: 20 }) is translated by the generated client into SQL (SELECT ... LIMIT 20), executed through the query engine, and mapped back into typed objects. The schema file is the single source of truth for types, migrations, and the client API.',
    history: 'Prisma began as Graphcool (2016), pivoted to Prisma 1 (2018), and shipped the modern Prisma 2 architecture in 2020 — dropping the proxy server for a client library with a Rust query engine. Prisma 5 (2023) and later versions moved toward a lighter engine and eventually a WASM/TypeScript path, reducing binary-size complaints in serverless deployments.',
    purpose: 'Give TypeScript applications a type-safe, migration-driven data access layer without hand-writing SQL for common paths.',
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
    tagline: 'Reuses expensive PostgreSQL connections instead of paying for them per request',
    description: 'The pool keeps a fixed set of authenticated TCP connections to 10.0.0.12:5432 and lends them out per query. Establishing a PostgreSQL connection means TCP, TLS, auth, and a forked backend process — 10-50ms and real memory — so reuse is not optional at scale.',
    history: 'Connection pooling entered mainstream practice with J2EE DataSources (late 1990s). PostgreSQL’s process-per-connection model made external poolers essential: PgBouncer (Skype, 2007) and pgpool-II became standard infrastructure, and the serverless era (2018+) revived the problem in a new shape with per-instance pools multiplying against a fixed max_connections.',
    purpose: 'Amortize connection setup cost and bound concurrent database load.',
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
    tagline: 'One backend process per connection, MVCC for concurrency, and 35 years of correctness',
    description: 'PostgreSQL 16 at 10.0.0.12:5432 accepts our connection, forks a dedicated backend (PID 8842), authenticates per pg_hba.conf, and processes the extended-protocol query. MVCC lets readers and writers proceed without blocking each other — every row version carries the transaction IDs that created and deleted it.',
    history: 'Michael Stonebraker’s Ingres (Berkeley, 1974) begat POSTGRES (1986), which gained SQL and became Postgres95, then PostgreSQL 6.0 (1996) under an open community. Stonebraker won the 2014 Turing Award for this lineage. Major milestones: WAL (7.1, 2001), point-in-time recovery (8.0), streaming replication (9.0, 2010), JSONB (9.4, 2014), parallel query (9.6), logical replication (10).',
    purpose: 'Store and query relational data with ACID guarantees, rich types, and extensibility.',
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
    tagline: 'Cost-based optimizer: turns declarative SQL into one chosen execution strategy',
    description: 'The planner rewrites the parse tree, enumerates join orders and access paths, and estimates each plan’s cost from pg_statistic histograms and n_distinct values. SELECT ... LIMIT 20 on a small table usually wins with a sequential scan — the index everyone expects would be slower.',
    history: 'Cost-based optimization was invented for IBM System R (Selinger et al., 1979) — the paper that defined dynamic-programming join ordering and selectivity estimation still used today. PostgreSQL added a genetic algorithm (GEQO) for large join counts, extended statistics in 10 (2017), and parallel-aware costing in 9.6.',
    purpose: 'Find a good-enough execution plan quickly, since finding the optimal one is exponential.',
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
    tagline: 'Pulls tuples through the plan tree, one node at a time',
    description: 'The executor walks the chosen plan as a tree of nodes, each implementing ExecProcNode to produce the next tuple on demand — a classic Volcano iterator model. It requests pages from shared buffers, applies MVCC visibility rules per tuple, filters, sorts, and hands rows to the wire protocol encoder.',
    history: 'The pull-based iterator model comes from Graefe’s Volcano system (1990-94). PostgreSQL added JIT compilation of expressions via LLVM in 11 (2018) to cut per-tuple interpretation overhead, and parallel workers in 9.6 (2016) so plan nodes can fan out across processes.',
    purpose: 'Execute the plan efficiently, respecting transaction visibility and memory limits.',
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
    tagline: 'PostgreSQL’s own page cache — 8KB pages, clock-sweep eviction, mmap-free by design',
    description: 'shared_buffers is a fixed shared-memory region holding 8KB table and index pages. The executor asks for a page by buffer tag; a hit costs a memory read, a miss costs a read from the OS page cache or disk. Dirty pages linger until the checkpointer or bgwriter writes them out.',
    history: 'PostgreSQL deliberately keeps a modest buffer cache and relies on the OS page cache as a second tier — an unusual choice versus Oracle or MySQL/InnoDB, which manage nearly all memory themselves. The clock-sweep replacement algorithm replaced simple LRU in 8.1 (2005) to reduce contention on hot buffers.',
    purpose: 'Keep hot pages in shared memory so most queries never touch storage.',
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
    tagline: 'Log the change before the page — the rule that makes crash recovery possible',
    description: 'Every modification is described in a WAL record written and fsynced to pg_wal before the corresponding data page may be written. On COMMIT the transaction waits for its WAL flush; on crash, replay from the last checkpoint reconstructs everything. WAL also feeds streaming replication and PITR.',
    history: 'Write-ahead logging was formalized by ARIES (Mohan et al., IBM, 1992), the recovery algorithm behind nearly every modern database. PostgreSQL gained WAL in 7.1 (2001), replacing full-file syncing; PITR came in 8.0 (2005), streaming replication in 9.0 (2010), and logical decoding in 9.4 (2014).',
    purpose: 'Guarantee durability and recoverability without paying random-write costs on every commit.',
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
    tagline: 'The last stop: where durability finally becomes physical',
    description: 'Below the filesystem sits the block layer with its multi-queue scheduler, feeding an NVMe SSD whose controller maps logical blocks to flash pages and manages wear. An fsync from WAL must reach non-volatile media — a power-loss-protected cache or the flash itself — or the durability promise is fiction.',
    history: 'Linux I/O schedulers evolved from the elevator through CFQ/deadline to blk-mq (2013, Jens Axboe), which matched multi-queue NVMe hardware; single-queue schedulers were removed in 5.0 (2019). NVMe (spec 1.0, 2011) replaced AHCI’s single 32-command queue with 64k queues of 64k commands. io_uring (5.1, 2019) finally gave userspace true async file I/O.',
    purpose: 'Persist bytes durably and serve reads with latency low enough that the database above stays fast.',
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
