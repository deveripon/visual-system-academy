// Packet Odyssey — Chaos scenarios: five ways the journey ends badly.
// Defines window.CHAOS. Plain ES2019, no imports, no trailing calls.
window.CHAOS = {

  // ═══════════════════════════════════════════════════════════════
  // 1. DNS RESOLVER DOWN
  // ═══════════════════════════════════════════════════════════════
  dnsdown: {
    label: 'DNS resolver down',
    icon: '⛔',
    entryAfter: 'dns-stub-query',
    steps: [
      {
        id: 'chaos-dns-query-sent',
        chapter: 5,
        title: 'The query goes out — into silence',
        node: 'udp',
        mode: 'kernel',
        packet: {
          label: 'DNS A? api.shop.dev (TXID 0x8f3a)',
          layers: ['ip', 'udp', 'dns'],
          fields: {
            ip: { 'Src': '192.168.1.23', 'Dst': '1.1.1.1', 'TTL': '64', 'Proto': '17 (UDP)' },
            udp: { 'Src Port': '54211', 'Dst Port': '53', 'Length': '45', 'Checksum': '0x1f22' },
            dns: { 'TXID': '0x8f3a', 'Flags': '0x0100 (RD)', 'QDCOUNT': '1', 'QNAME': 'api.shop.dev', 'QTYPE': 'A' }
          }
        },
        state: { mode: 'kernel', proc: 'chrome netsvc PID 4903' },
        explain: {
          what: 'Your computer scribbles a tiny question — "what is the address for api.shop.dev?" — and flings it at 1.1.1.1 without waiting for anyone to say hello. That note is a 45-byte UDP datagram aimed at port 53, and the moment it leaves, a timer starts ticking. UDP is fire-and-forget: no handshake, no acknowledgement, no connection to keep track of. The sendto() syscall reports success the instant the kernel takes the bytes, and success here only ever means "queued for transmission", never "somebody received it".',
          why: 'DNS chose speed over certainty — one packet out, one packet back — and the price of that bargain is that a dead server and a slow server look identical until a timer runs out.',
          component: 'Stub resolver → UDP socket (glibc resolv / systemd-resolved)',
          layer: 'Kernel · OSI L4 (connectionless)',
          abstraction: 'Request/response over an unreliable datagram',
          protocol: 'DNS over UDP (RFC 1035)',
          misconception: 'You might think sendto() returning 45 proves the server got your question — actually it only proves the kernel accepted 45 bytes to send. With UDP, that is the very last thing you will ever learn about this packet.',
          analogy: 'Dropping a postcard into a mailbox with no tracking number and no return receipt. It is out of your hands now, and all you can do is wait.',
          command: 'dig +time=5 +tries=1 @1.1.1.1 api.shop.dev A',
          production: 'Instrument resolution latency separately from connect latency. A p99 DNS time of 5000ms is a smoking gun — that is a timeout constant, not a network.'
        },
        code: [
          { title: 'The 45 bytes on the wire', lang: 'c', code: '/* DNS header, 12 bytes */\n0x8f3a   ID\n0x0100   QR=0 OPCODE=0 AA=0 TC=0 RD=1 RA=0 Z=0 RCODE=0\n0x0001   QDCOUNT = 1\n0x0000   ANCOUNT = 0\n0x0000   NSCOUNT = 0\n0x0000   ARCOUNT = 0\n/* question section */\n03 "api" 04 "shop" 03 "dev" 00      /* length-prefixed labels */\n0x0001   QTYPE  = A\n0x0001   QCLASS = IN' }
        ]
      },
      {
        id: 'chaos-dns-silence',
        chapter: 5,
        title: 'Nothing comes back',
        node: 'recursive',
        mode: 'net',
        effects: ['queue+'],
        explain: {
          what: 'The answer never comes. Not a wrong answer, not an error — nothing at all. The resolver at 1.1.1.1 is unreachable: maybe a bad BGP route announcement, maybe a datacenter outage, maybe a middlebox quietly eating everything aimed at port 53. From where the client sits all three look identical: no ICMP port unreachable, no TCP RST, no signal of any kind, just a socket with nothing to read.',
          why: 'Learning that nothing is coming takes seconds, while learning that something arrived takes microseconds — and that lopsidedness is why every timeout constant in networking exists.',
          component: 'Recursive resolver 1.1.1.1 (unreachable)',
          layer: 'Internet · unreachable peer',
          abstraction: 'Failure by omission',
          protocol: 'DNS (RFC 1035) — no negative signal for a lost query',
          misconception: 'You might think a server that is down always sends back an error — actually you only get one if something along the path chooses to tell you. A blackholed route, a firewall DROP rule and a machine that is simply switched off produce exactly the same silence.',
          analogy: 'Shouting into a canyon and hearing no echo. You cannot tell whether the canyon is empty, the wind swallowed your voice, or you were facing the wrong way the whole time.',
          command: 'sudo tcpdump -ni any port 53   # queries leaving, nothing returning',
          production: 'Always configure at least two resolvers on different networks. Anycast means 1.1.1.1 is usually many machines, but the path to all of them can break at once.'
        },
        code: [
          { title: 'What a capture looks like', lang: 'bash', code: 'sudo tcpdump -ni any port 53\n11:04:22.118 IP 192.168.1.23.54211 > 1.1.1.1.53: 36666+ A? api.shop.dev. (30)\n11:04:27.121 IP 192.168.1.23.54211 > 1.1.1.1.53: 36666+ A? api.shop.dev. (30)\n11:04:37.126 IP 192.168.1.23.54211 > 1.1.1.1.53: 36666+ A? api.shop.dev. (30)\n#            ^ every line outbound. no inbound line. ever.\n#              that shape IS the diagnosis.' }
        ]
      },
      {
        id: 'chaos-dns-timeout-1',
        chapter: 5,
        title: 'Five seconds later: timeout',
        node: 'stubresolver',
        mode: 'user',
        effects: ['flash'],
        explain: {
          what: "Five seconds crawl past, and the resolver's alarm finally goes off. That number comes from /etc/resolv.conf, where options timeout:5 sets five seconds per attempt per server — the historical default. For all five of those seconds the calling thread is parked inside getaddrinfo; in a browser, the lookup is instead hogging a slot in the DNS thread pool. Nothing else about this request can move an inch.",
          why: 'Five seconds was a reasonable guess in the 1980s when a busy resolver on a loaded VAX might genuinely take that long, and the default has now outlived its justification by four decades.',
          component: 'glibc resolver timeout (RES_TIMEOUT in resolv.h)',
          layer: 'Userspace · resolver library',
          abstraction: 'Timeout as the only failure detector',
          protocol: 'DNS resolver behaviour (RFC 1536)',
          misconception: 'You might think DNS lookups are either fast or fail fast — actually a failing lookup is the slowest thing in a normal request path, routinely 10 to 40 seconds before it gives up entirely.',
          analogy: 'Standing at a crossing pressing the button for five full minutes before it occurs to you that the button might be broken.',
          command: 'cat /etc/resolv.conf\n# nameserver 1.1.1.1\n# nameserver 8.8.8.8\n# options timeout:5 attempts:2',
          production: 'On containers and servers, set options timeout:1 attempts:2 in resolv.conf (or via dnsConfig in Kubernetes). Failing over in 1s instead of 5s is often the single cheapest latency win in a fleet.'
        },
        code: [
          { title: '/etc/resolv.conf', lang: 'bash', code: 'nameserver 1.1.1.1\nnameserver 8.8.8.8\noptions timeout:5 attempts:2 rotate\n# worst case: 2 servers x 2 attempts x 5s = 20 seconds of blocking' }
        ]
      },
      {
        id: 'chaos-dns-retry-second',
        chapter: 5,
        title: 'Failover to the second nameserver',
        node: 'stubresolver',
        mode: 'kernel',
        packet: {
          label: 'DNS A? api.shop.dev → 8.8.8.8',
          layers: ['ip', 'udp', 'dns'],
          fields: {
            ip: { 'Src': '192.168.1.23', 'Dst': '8.8.8.8', 'TTL': '64', 'Proto': '17 (UDP)' },
            udp: { 'Src Port': '54212', 'Dst Port': '53' },
            dns: { 'TXID': '0x8f3b', 'Flags': '0x0100 (RD)', 'QNAME': 'api.shop.dev', 'QTYPE': 'A' }
          }
        },
        explain: {
          what: 'Plan B: try the other number on the list. The resolver moves to the next nameserver with a fresh transaction id sent from a fresh source port. The detail that matters is that it did this SERIALLY, only after the full five-second timeout on the first server expired — the classic stub resolver never asks both at once. systemd-resolved and modern browsers are cleverer and can race them, but the plain glibc behaviour that every container inherits is strictly one after the other.',
          why: 'Sequential failover is why the ORDER of your nameservers quietly matters so much, and why "we have a backup DNS server" never means "DNS failures are fast".',
          component: 'Resolver server rotation (res_nsend)',
          layer: 'Userspace · resolver library',
          abstraction: 'Serial failover across a static server list',
          protocol: 'DNS (RFC 1035)',
          misconception: 'You might think two nameservers give you redundancy for free — actually the second one is only tried five seconds after the first goes quiet. It buys you availability, not speed.',
          analogy: "Ringing your friend's landline, letting it ring twenty times, and only then thinking to try their mobile.",
          command: 'resolvectl query api.shop.dev\nresolvectl statistics',
          production: 'systemd-resolved caches, races servers, and downgrades gracefully — but it also introduces 127.0.0.53 as the resolver, which breaks naive containers that copy the host resolv.conf verbatim.'
        }
      },
      {
        id: 'chaos-dns-servfail',
        chapter: 5,
        title: 'The backup answers — with SERVFAIL',
        node: 'recursive',
        mode: 'net',
        packet: {
          label: 'DNS response: RCODE 2 (SERVFAIL)',
          layers: ['ip', 'udp', 'dns'],
          fields: {
            ip: { 'Src': '8.8.8.8', 'Dst': '192.168.1.23', 'TTL': '117' },
            udp: { 'Src Port': '53', 'Dst Port': '54212' },
            dns: { 'TXID': '0x8f3b', 'Flags': '0x8182 (QR, RD, RA, RCODE=2)', 'RCODE': '2 (SERVFAIL)', 'ANCOUNT': '0' }
          }
        },
        explain: {
          what: 'Finally, a reply — and it is useless. RCODE 2, SERVFAIL, which is the resolver saying "I tried, and I could not finish the job". Either the authoritative servers for shop.dev are unreachable from this resolver too, or a DNSSEC validation failed. And here is the sting: unlike NXDOMAIN, SERVFAIL is not really cached, so every retry repeats the entire failing search from scratch.',
          why: 'Telling SERVFAIL apart from NXDOMAIN is the difference between "the infrastructure is broken" and "that name genuinely does not exist", and those two demand completely different reactions from you.',
          component: 'Recursive resolver failure response',
          layer: 'Internet · DNS resolution',
          abstraction: 'Explicit error versus silence',
          protocol: 'DNS RCODEs (RFC 1035 §4.1.1)',
          misconception: 'You might think SERVFAIL means the domain does not exist — actually that is NXDOMAIN (RCODE 3). SERVFAIL means the resolver itself failed, very often because a DNSSEC signature expired, which knocks perfectly healthy domains offline for everyone using a validating resolver.',
          analogy: 'The librarian telling you "our catalogue system is down" — a very different sentence from "no such book exists".',
          command: 'dig +dnssec api.shop.dev @8.8.8.8\ndig +cd api.shop.dev @8.8.8.8   # +cd disables validation: if this works, blame DNSSEC',
          production: 'Expired DNSSEC signatures are a recurring cause of total outages (Slack 2021, Microsoft 365 more than once). Monitor RRSIG expiry with the same seriousness you monitor TLS certificate expiry.'
        }
      },
      {
        id: 'chaos-dns-attempts-exhausted',
        chapter: 5,
        title: 'Attempts exhausted',
        node: 'stubresolver',
        mode: 'user',
        effects: ['flash'],
        explain: {
          what: "The resolver runs out of patience altogether. options attempts:2 means two full sweeps through the entire nameserver list. Sweep one: 1.1.1.1 timed out after 5s, 8.8.8.8 answered SERVFAIL. Sweep two, with the timeout doubled by glibc's backoff: the same outcome again. Total damage so far is roughly 15 seconds of wall-clock time, every second of it spent showing the user a spinner.",
          why: 'Naming the number is the whole point — fifteen seconds destroys any latency budget you thought you had, and no application timeout on fetch() can shorten it if resolution happens before the request.',
          component: 'glibc resolver retry loop (res_send)',
          layer: 'Userspace · resolver library',
          abstraction: 'Bounded retry with per-server timeouts',
          protocol: 'DNS resolver behaviour',
          misconception: 'You might think a 3-second AbortController timeout on your fetch protects you — actually it depends where that timer starts. In many stacks it only covers the HTTP phase, so DNS burns 15 seconds before your 3-second timeout is even armed.',
          analogy: 'A restaurant promising a ten-minute meal, timed from the moment you sit down, and never mentioning the forty-minute queue on the pavement outside.',
          command: 'time getent hosts api.shop.dev',
          production: 'In Kubernetes, ndots:5 in the default resolv.conf makes every external lookup try five search-domain permutations FIRST. That is 5× the failure cost. Set ndots:1 or use fully-qualified names ending in a dot.'
        },
        code: [
          { title: 'Why Kubernetes DNS failures hurt 5× more', lang: 'bash', code: '# default in-pod /etc/resolv.conf\nsearch prod.svc.cluster.local svc.cluster.local cluster.local\noptions ndots:5\n\n# "api.shop.dev" has 2 dots < ndots:5, so it tries, in order:\n#   api.shop.dev.prod.svc.cluster.local   -> NXDOMAIN\n#   api.shop.dev.svc.cluster.local        -> NXDOMAIN\n#   api.shop.dev.cluster.local            -> NXDOMAIN\n#   api.shop.dev                          -> the one you meant\n# multiply every timeout above by four.' }
        ]
      },
      {
        id: 'chaos-dns-eai-again',
        chapter: 5,
        title: 'getaddrinfo() returns EAI_AGAIN',
        node: 'libc',
        mode: 'user',
        state: { mode: 'user', mem: 'user' },
        explain: {
          what: 'The lookup gives up and hands your program a number instead of an address. getaddrinfo returns EAI_AGAIN (-3), "temporary failure in name resolution". That is deliberately different from EAI_NONAME (-2, "this name does not exist"): EAI_AGAIN means retrying later is reasonable, EAI_NONAME means it never will be. Almost no application code bothers to check which one it got.',
          why: 'This is the single point where a network condition becomes a program error, and where the retry policy should be decided — and almost every stack throws the distinction away one layer up.',
          component: 'getaddrinfo(3) (glibc / nss)',
          layer: 'Userspace · libc',
          abstraction: 'Name resolution API result codes',
          protocol: 'POSIX getaddrinfo (RFC 3493)',
          misconception: 'You might think a DNS error and a connection error are much the same thing — actually EAI_AGAIN means no connection was ever attempted: no SYN was sent, no port was contacted, no firewall was involved. Hours get lost debugging a connection that never happened.',
          analogy: 'The difference between "my phone is flat, I cannot look up their address right now" and "there is nobody by that name". Both leave you unable to visit; only one is worth trying again tomorrow.',
          command: 'getent hosts api.shop.dev; echo "exit=$?"   # 2 = not found',
          production: 'Retry EAI_AGAIN with backoff; do NOT retry EAI_NONAME. If your client library collapses both into "network error", you will hammer a healthy resolver over a typo forever.'
        },
        code: [
          { title: 'The two failures are not the same', lang: 'c', code: '#define EAI_NONAME  -2   /* name does not resolve — permanent */\n#define EAI_AGAIN   -3   /* temporary failure — retry is sane  */\n#define EAI_FAIL    -4   /* non-recoverable resolver failure    */\n\nrc = getaddrinfo("api.shop.dev", "443", &hints, &res);\n/* rc = -3  → EAI_AGAIN → gai_strerror(rc):\n   "Temporary failure in name resolution" */' }
        ]
      },
      {
        id: 'chaos-dns-fetch-reject',
        chapter: 5,
        title: 'The fetch Promise rejects',
        node: 'netservice',
        mode: 'user',
        effects: ['queue+'],
        explain: {
          what: 'Your app finally hears about it, and what it hears is almost nothing. The network service maps the resolution failure to net::ERR_NAME_NOT_RESOLVED and fails the URLLoader; the renderer rejects your fetch Promise with a TypeError whose entire message is the famously unhelpful "Failed to fetch". The Fetch specification refuses to expose the real cause to page script on purpose, because DNS state is a cross-origin information leak.',
          why: "This is why every frontend engineer has stared at \"TypeError: Failed to fetch\" and learned nothing: the spec traded away your diagnostics for someone's privacy, quite deliberately.",
          component: 'Chrome network service → Blink fetch',
          layer: 'Userspace · L7 client',
          abstraction: 'Network errors surfaced as opaque exceptions',
          protocol: 'WHATWG Fetch (network error)',
          misconception: 'You might think a rejected fetch means the server returned an error — actually rejection means the request never completed at the network level at all: DNS failure, connection failure, CORS preflight failure, or an abort. An HTTP 500 does not reject.',
          analogy: 'An envelope coming back to you stamped only "undeliverable", with no reason given, because the rules say no reason may be given.',
          command: 'chrome://net-export  →  netlog-viewer  →  filter: ERR_NAME_NOT_RESOLVED',
          production: 'Catch and classify: navigator.onLine plus the elapsed time before rejection distinguishes offline (instant), DNS failure (5-20s), and connect timeout (~75s). Report all three differently in your error tracking.'
        },
        code: [
          { title: 'What the app sees', lang: 'js', code: "try {\n  const r = await fetch('https://api.shop.dev/products?limit=20');\n} catch (err) {\n  console.log(err.name);      // 'TypeError'\n  console.log(err.message);   // 'Failed to fetch'  ← that is all you get\n  console.log(err.cause);     // undefined in browsers; Node sets it:\n  //   Error: getaddrinfo EAI_AGAIN api.shop.dev\n}" }
        ]
      },
      {
        id: 'chaos-dns-browser-error',
        chapter: 5,
        title: 'ERR_NAME_NOT_RESOLVED — "the internet is down"',
        node: 'appcode',
        mode: 'user',
        effects: ['flash'],
        state: { mode: 'user', proc: 'chrome renderer PID 4821' },
        explain: {
          what: "The user sees the dinosaur, or your app's error boundary, and tells you the internet is broken. From their chair that is a perfectly accurate description: DNS is the first step of essentially every action, so when resolution fails, EVERYTHING fails at once — email, chat, streaming, the lot. One dead resolver is indistinguishable from a dead planet.",
          why: 'DNS is the most centralised dependency most systems own and the one least often included in a failure-mode review — it fails rarely and catastrophically, which is the worst possible combination for institutional memory.',
          component: 'Chrome error page (net::ERR_NAME_NOT_RESOLVED)',
          layer: 'Userspace · UI',
          abstraction: 'Infrastructure failure as user experience',
          protocol: '—',
          misconception: 'You might think redundant servers make you highly available — actually if they share one DNS zone, one resolver configuration or one registrar, you have a single point of failure wearing a redundancy costume. Facebook took itself off the internet in 2021 in exactly this way.',
          analogy: 'The phone book burning down. Every phone in the city still works perfectly; nobody can call anyone.',
          command: 'resolvectl flush-caches; resolvectl status\ndig @9.9.9.9 api.shop.dev   # third-party resolver: is it you or is it them?',
          production: 'Use two DNS providers on separate infrastructure for anything critical, keep TTLs low enough to fail over but high enough to survive a resolver outage, and rehearse the runbook — DNS incidents are the ones nobody has practised.'
        }
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. SYN DROPPED (FIREWALL BLACKHOLE)
  // ═══════════════════════════════════════════════════════════════
  synfail: {
    label: 'SYN dropped (firewall blackhole)',
    icon: '🕳️',
    entryAfter: 'tcp-syn-egress',
    steps: [
      {
        id: 'chaos-syn-sent',
        chapter: 8,
        title: 'SYN sent, socket enters SYN_SENT',
        node: 'tcp',
        mode: 'kernel',
        packet: {
          label: 'SYN seq=1128394821',
          layers: ['eth', 'ip', 'tcp'],
          fields: {
            eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800' },
            ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)' },
            tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN', 'MSS': '1460', 'Window': '64240', 'WScale': '7' }
          }
        },
        state: { mode: 'kernel', sock: 'SYN_SENT', proc: 'chrome netsvc PID 4903' },
        explain: {
          what: 'Your computer picks a return address, says "hello, can we talk?", and steps back to wait. Underneath, tcp_v4_connect chooses the ephemeral port, installs the socket in the connection hash, flips it into the SYN_SENT state, transmits the SYN, and arms the retransmission timer at an initial RTO of 1 second. Because the socket is non-blocking, connect() returns EINPROGRESS immediately — the real verdict will arrive later, through epoll.',
          why: 'SYN_SENT is the most fragile state in all of TCP: no data can flow, and the only thing between here and a working connection is one packet that may never come back.',
          component: 'tcp_v4_connect / tcp_connect (net/ipv4/tcp_output.c)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Three-way handshake, step one',
          protocol: 'TCP (RFC 9293)',
          misconception: 'You might think connect() coming back without an error means you are connected — actually on a non-blocking socket it returns -1 with EINPROGRESS, and the real answer arrives through a readiness notification. Code that ignores this is the source of countless phantom bugs.',
          analogy: 'Pressing a doorbell and stepping back off the step. You are committed now; the next few seconds tell you whether anyone is home.',
          command: 'ss -tan state syn-sent',
          production: 'A pile of sockets stuck in SYN_SENT to one destination is the unmistakable signature of a firewall blackhole or a dead host. ss -tan state syn-sent | wc -l belongs in your triage checklist.'
        },
        code: [
          { title: 'The socket, mid-hope', lang: 'bash', code: 'ss -tan state syn-sent\nRecv-Q Send-Q Local Address:Port   Peer Address:Port\n0      1      192.168.1.23:51324   104.18.32.7:443\n#      ^ one unacknowledged byte of sequence space: the SYN itself' }
        ]
      },
      {
        id: 'chaos-syn-drop',
        chapter: 8,
        title: 'A firewall silently DROPs it',
        node: 'netfilter',
        mode: 'net',
        effects: ['flash'],
        explain: {
          what: 'Our hello just... vanishes. Somewhere along the path — a cloud security group, an on-prem edge firewall, one over-eager rule — the packet matches a policy whose action is DROP, which means "throw it away and say nothing". No RST, no ICMP administratively-prohibited, not even a log line unless somebody deliberately turned logging on. The packet ceases to exist and nobody is told.',
          why: 'DROP versus REJECT is the single most consequential firewall decision for debuggability, and it is usually made by whoever copied a config off Stack Overflow first.',
          component: 'Netfilter filter table, DROP target',
          layer: 'Network · L3/L4 filtering',
          abstraction: 'Silent discard as a security posture',
          protocol: 'Netfilter / cloud security groups',
          misconception: 'You might think DROP is meaningfully more secure than REJECT — actually it slows a port scanner by a few seconds and costs your own engineers hours per incident. On internal networks REJECT is almost always the better trade; save DROP for the hostile internet edge.',
          analogy: 'A suggestion box bolted over a paper shredder. Your note goes in, something definitely happens, and you will never find out what.',
          command: 'sudo iptables -nvL INPUT --line-numbers   # look at the pkts counter on DROP rules\nsudo nft list ruleset | grep -n drop',
          production: 'Add a LOG rule before the DROP with a rate limit, or use nftables counters. "Silent by design" becomes "invisible during an outage" precisely when you need it most.'
        },
        code: [
          { title: 'The rule that ate your packet', lang: 'bash', code: '# what it looks like\nChain INPUT (policy DROP)\n pkts bytes target  prot opt source     destination\n 1841  110K DROP    tcp  --  0.0.0.0/0  0.0.0.0/0   tcp dpt:443\n#  ^ the counter is the ONLY evidence this happened\n\n# what it should look like when humans debug this network\niptables -A INPUT -p tcp --dport 443 -j LOG --log-prefix "DROP-443 " -m limit --limit 5/min\niptables -A INPUT -p tcp --dport 443 -j REJECT --reject-with tcp-reset' }
        ]
      },
      {
        id: 'chaos-syn-rto-1',
        chapter: 8,
        title: 'RTO fires at 1 second: retransmit #1',
        node: 'tcp',
        mode: 'kernel',
        effects: ['flash'],
        packet: {
          label: 'SYN (retransmit 1) seq=1128394821',
          layers: ['ip', 'tcp'],
          fields: {
            ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
            tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN', 'Retransmit': '#1 at t+1.0s' }
          }
        },
        explain: {
          what: 'No answer, so it says the same thing again. The retransmission timer expires and TCP re-sends a byte-for-byte identical SYN: same sequence number, same options, same source port. The initial RTO for a SYN is fixed at 1 second by RFC 6298, because there is no round-trip sample yet from which to calculate anything smarter.',
          why: "Retransmission is the whole of TCP's reliability story — packets vanish on perfectly healthy networks all the time, and quietly resending them is normal expected behaviour, not an error condition.",
          component: 'tcp_retransmit_timer (net/ipv4/tcp_timer.c)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Timeout-driven reliability',
          protocol: 'TCP RTO (RFC 6298)',
          misconception: 'You might think retransmissions mean the network is broken — actually a low retransmission rate is completely normal, because TCP is designed around loss. Sustained SYN retransmits to one particular host, though, mean something out there is eating your packets.',
          analogy: 'Knocking on the door a second time, a little louder, on the assumption that the first knock got lost in the noise.',
          command: 'nstat -az TcpExtTCPSynRetrans TcpRetransSegs',
          production: 'Graph TcpExtTCPSynRetrans separately from total retransmits: SYN retransmits indicate reachability problems, while data retransmits indicate congestion. Very different pages at 3 a.m.'
        }
      },
      {
        id: 'chaos-syn-backoff',
        chapter: 8,
        title: 'Exponential backoff: 2s, 4s, 8s, 16s…',
        node: 'tcp',
        mode: 'kernel',
        effects: ['queue+'],
        explain: {
          what: "Every time it tries, it waits twice as long before trying again: 1s, 2s, 4s, 8s, 16s, 32s. The kernel assumes the silence means congestion, so it deliberately backs off rather than adding to it. Add the waits up — 1 + 2 + 4 + 8 + 16 + 32 = 63 seconds after the original SYN — and the final attempt's own timeout pushes total failure detection out to roughly 127 seconds.",
          why: 'Exponential backoff is one of the load-bearing ideas of the internet: Van Jacobson added it after the 1986 congestion collapse, when NSFNET throughput fell from 32kbps to 40bps because everyone retransmitted immediately and forever.',
          component: 'TCP exponential backoff (icsk_retransmits, RTO doubling)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Congestion-safe retry scheduling',
          protocol: 'TCP (RFC 6298 §5.5)',
          misconception: 'You might think retrying faster would get you connected sooner — actually if the cause is congestion, aggressive retries make it strictly worse for everyone including you. That is precisely how congestion collapse happens.',
          analogy: 'Redialling an engaged number at longer and longer gaps, instead of hammering redial and keeping the exchange permanently jammed.',
          command: 'sysctl net.ipv4.tcp_syn_retries   # default 6',
          production: 'Copy this pattern in application retries — and add JITTER, which TCP does not need but distributed systems do. Synchronised retries from a thousand clients is a self-inflicted DDoS every time.'
        },
        code: [
          { title: 'The timeline', lang: 'bash', code: 't=0.000   SYN  ->  (dropped)\nt=1.000   SYN  ->  (dropped)   RTO 1s\nt=3.000   SYN  ->  (dropped)   RTO 2s\nt=7.000   SYN  ->  (dropped)   RTO 4s\nt=15.000  SYN  ->  (dropped)   RTO 8s\nt=31.000  SYN  ->  (dropped)   RTO 16s\nt=63.000  SYN  ->  (dropped)   RTO 32s\nt=127.00  give up  ->  ETIMEDOUT\n\n# tcp_syn_retries=6 → ~127s. Nobody waits that long.' }
        ]
      },
      {
        id: 'chaos-syn-sysctl',
        chapter: 8,
        title: 'tcp_syn_retries governs how long you suffer',
        node: 'tcp',
        mode: 'kernel',
        explain: {
          what: 'How long you suffer is a setting, and somebody else already chose it for you. net.ipv4.tcp_syn_retries defaults to 6, which is exactly where that ~127-second budget comes from. Lower it to 3 and failure detection caps out around 15 seconds; better still, use TCP_USER_TIMEOUT or a connect timeout in your client library, which gives per-socket control without touching a system-wide knob.',
          why: 'The default was tuned for a 1990s network where a 60-second round trip over a satellite link was plausible, so in a datacenter with sub-millisecond p99 RTT, waiting 127 seconds to learn a host is dead is indefensible.',
          component: 'net.ipv4.tcp_syn_retries (Documentation/networking/ip-sysctl.rst)',
          layer: 'Kernel · L4 tunable',
          abstraction: 'Failure detection latency as a configuration choice',
          protocol: 'TCP',
          misconception: 'You might think timeouts are a property of the network — actually they are a policy choice. Nothing physical says 127 seconds; a person picked a default and it outlived its context by thirty years.',
          analogy: 'How long you let the alarm snooze before you accept you are late. It is a dial somebody set, not a law of nature.',
          command: 'sudo sysctl -w net.ipv4.tcp_syn_retries=3\n# per-connection, better:\n# setsockopt(fd, IPPROTO_TCP, TCP_USER_TIMEOUT, &ms, sizeof(ms))',
          production: 'Set explicit connect timeouts in every client (curl --connect-timeout, undici connectTimeout, Prisma connect_timeout). Relying on kernel defaults means your outage lasts two minutes per request instead of two seconds.'
        }
      },
      {
        id: 'chaos-syn-etimedout',
        chapter: 8,
        title: 'connect() finally fails: ETIMEDOUT',
        node: 'socketlayer',
        mode: 'kernel',
        state: { sock: 'CLOSED', mode: 'kernel' },
        effects: ['flash'],
        explain: {
          what: 'The retry budget runs dry and the kernel finally admits defeat. It sets so_error = ETIMEDOUT (110) on the socket, moves it to CLOSED, and marks it ready in epoll — where ready means "there is news", not "there is data". The application calls getsockopt(SO_ERROR), reads 110, and learns the truth 127 seconds after asking a very simple question.',
          why: 'Every failure has to become an errno eventually, and this is the precise point where a silent network condition turns into something a program can actually branch on.',
          component: 'Socket error propagation (sk->sk_err → SO_ERROR)',
          layer: 'Kernel · socket layer',
          abstraction: 'Asynchronous failure delivered through readiness',
          protocol: 'POSIX sockets',
          misconception: 'You might think epoll reporting the socket as writable means the connection succeeded — actually writable only means "you may act now", and the action available might be collecting an error. Always check SO_ERROR after a non-blocking connect completes.',
          analogy: 'A recorded-delivery letter finally coming back to you, stamped with the reason, long after you stopped caring about the answer.',
          command: 'strace -e trace=connect,getsockopt curl --connect-timeout 5 https://api.shop.dev/',
          production: 'ETIMEDOUT means "no answer at all" (firewall, dead host, black hole); ECONNREFUSED means "answered, nothing listening". The first is a network ticket, the second is a deploy ticket.'
        },
        code: [
          { title: 'How the app learns', lang: 'c', code: 'epoll_wait(...)  →  fd 42 EPOLLOUT|EPOLLERR\n\nint err; socklen_t len = sizeof(err);\ngetsockopt(42, SOL_SOCKET, SO_ERROR, &err, &len);\n/* err = 110  ETIMEDOUT  "Connection timed out" */' }
        ]
      },
      {
        id: 'chaos-syn-reject-contrast',
        chapter: 8,
        title: 'The road not taken: REJECT answers in 1ms',
        node: 'netfilter',
        mode: 'net',
        explain: {
          what: 'The same block, done politely, would have taken about one millisecond. Had that firewall used REJECT instead of DROP, REJECT --reject-with tcp-reset sends an RST; the client kernel sets ECONNREFUSED at once, connect() fails on the very first attempt, and there are no retransmissions at all. The security outcome is identical — the connection is refused either way — but one version is a hundred thousand times faster to diagnose.',
          why: 'This contrast is the entire lesson of the scenario: the failure mode you choose decides how long your engineers stare at a spinner wondering whether to blame DNS, routing, or the app.',
          component: 'REJECT target vs DROP target',
          layer: 'Network · L3/L4 filtering',
          abstraction: 'Explicit refusal versus silent discard',
          protocol: 'TCP RST (RFC 9293) / ICMP type 3 code 13',
          misconception: 'You might think REJECT leaks useful information to attackers — actually it reveals only that a filter exists, which a timing side channel gives away anyway. Meanwhile DROP guarantees that YOUR next incident costs two extra minutes per test. Choose deliberately, not by reflex.',
          analogy: 'A locked door with a CLOSED sign on it, versus an identical door with no sign that you stand in front of for two minutes before working it out.',
          command: 'nc -vz -w2 api.shop.dev 443\n# REJECT → "Connection refused" instantly\n# DROP   → hangs until your timeout',
          production: 'Cloud security groups always DROP and cannot be changed — which is exactly why "instant refused" versus "hangs forever" is such a useful signal for locating WHERE in the path the block lives.'
        },
        code: [
          { title: 'Two rules, two universes', lang: 'bash', code: '# DROP\n$ time nc -vz api.shop.dev 443\nnc: connect to api.shop.dev port 443 (tcp) failed: Connection timed out\nreal    2m7.213s          <- 127 seconds of your life\n\n# REJECT --reject-with tcp-reset\n$ time nc -vz api.shop.dev 443\nnc: connect to api.shop.dev port 443 (tcp) failed: Connection refused\nreal    0m0.004s          <- 4 milliseconds, and you know exactly what happened' }
        ]
      },
      {
        id: 'chaos-syn-fetch-error',
        chapter: 8,
        title: 'The client library gives up',
        node: 'netservice',
        mode: 'user',
        state: { mode: 'user', proc: 'chrome netsvc PID 4903' },
        explain: {
          what: "Long before the kernel's two minutes are up, the browser has already lost interest. The network service maps ETIMEDOUT to net::ERR_CONNECTION_TIMED_OUT, but in practice Chrome usually gives up first on its own ~75-second transaction timeout — and only after trying the other addresses the DNS lookup returned, since Happy Eyeballs races an IPv6 and an IPv4 address before conceding.",
          why: 'Client-side timeouts exist precisely because kernel defaults are far too patient; every layer adds its own impatience, and the shortest one always wins.',
          component: 'Chrome network service transaction timeout',
          layer: 'Userspace · L7 client',
          abstraction: 'Layered timeout budgets',
          protocol: 'WHATWG Fetch (network error)',
          misconception: 'You might think there is one timeout in play — actually there are at least five: kernel SYN retries, the client connect timeout, the request timeout, proxy timeouts, and load balancer idle timeouts. Debugging means working out which one fired, and they rarely agree.',
          analogy: 'Three kitchen timers set to different lengths for the same dish. Whichever rings first ends the cooking, and it is usually not the one you set.',
          command: 'curl -v --connect-timeout 5 --max-time 10 https://api.shop.dev/products',
          production: 'Order your timeouts deliberately: client < gateway < service < database. Inverted timeout hierarchies cause retry storms, where the client gives up and retries while every layer below is still working on the abandoned request.'
        }
      },
      {
        id: 'chaos-syn-browser',
        chapter: 8,
        title: 'ERR_CONNECTION_TIMED_OUT',
        node: 'appcode',
        mode: 'user',
        effects: ['flash'],
        state: { proc: 'chrome renderer PID 4821' },
        explain: {
          what: "The user gets \"This site can't be reached — api.shop.dev took too long to respond\". Here is the cruel part: DNS worked perfectly, routing worked perfectly, the packets were correctly formed and correctly addressed. One rule on one device somewhere between here and there decided to say nothing at all, and that silence cost two minutes.",
          why: 'The most expensive failures are the silent ones: a loud failure costs a second, while a silent one costs an entire timeout budget, multiplied by every retry, multiplied by every user.',
          component: 'Chrome error page (net::ERR_CONNECTION_TIMED_OUT)',
          layer: 'Userspace · UI',
          abstraction: 'Silent network policy as user-visible outage',
          protocol: '—',
          misconception: 'You might think "timed out" means the server was overloaded — actually it usually means the server never heard you at all. An overloaded server typically accepts the connection and then responds slowly, which is a completely different signature: fast connect, slow first byte.',
          analogy: 'Phoning a company whose switchboard was quietly unplugged years ago. It rings and rings, and nobody inside that building ever knows you tried.',
          command: 'mtr -T -P 443 api.shop.dev   # TCP traceroute: find the hop where replies stop',
          production: 'Distinguish connect timeouts from response timeouts in your metrics. Connect timeouts point at network and firewall; response timeouts point at your application. Conflating them sends the wrong team to the incident.'
        }
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. INVALID TLS CERTIFICATE
  // ═══════════════════════════════════════════════════════════════
  certfail: {
    label: 'Invalid TLS certificate',
    icon: '🔓',
    entryAfter: 'tls-cert-verify',
    steps: [
      {
        id: 'chaos-cert-received',
        chapter: 13,
        title: 'The server sends its certificate chain',
        node: 'cftls',
        mode: 'net',
        packet: {
          label: 'TLS Certificate (2 certs, 2841 bytes)',
          layers: ['tcp', 'tls'],
          fields: {
            tls: { 'Handshake Type': '11 (Certificate)', 'Version': 'TLS 1.3', 'Cert[0] Subject': 'CN=api.shop.dev', 'Cert[0] Issuer': 'CN=Acme Internal CA R3', 'Cert[1] Subject': 'CN=Acme Internal CA R3', 'Cert[1] Issuer': 'CN=Acme Internal Root', 'Not After': '2027-03-11T00:00:00Z' }
          }
        },
        state: { mode: 'user', proc: 'chrome netsvc PID 4903' },
        explain: {
          what: "The server hands over its papers. It presents a chain of two certificates: the leaf for api.shop.dev, plus one intermediate that vouches for it. Each one is an X.509 structure holding a public key, a subject, a validity window, extensions (SAN, key usage, AIA), and a signature made with the issuer's private key. Crucially, a chain is an assertion, not proof — anyone can generate one of these in thirty seconds with openssl.",
          why: 'TLS gets confidentiality from the key exchange but AUTHENTICITY only from this chain, and a perfectly encrypted conversation with an unknown party is worth nothing at all.',
          component: 'TLS Certificate message',
          layer: 'Userspace · OSI L6',
          abstraction: 'Public key infrastructure: identity by delegated signature',
          protocol: 'TLS 1.3 (RFC 8446) + X.509 (RFC 5280)',
          misconception: 'You might think the padlock means the site is safe — actually it means the connection is encrypted to whoever proved control of that name. Phishing sites get valid certificates in seconds; the padlock says nothing whatsoever about intent.',
          analogy: 'Being handed an ID card at the door. Holding it in your hand tells you nothing until you check who issued it and whether that issuer means anything to you.',
          command: 'openssl s_client -connect api.shop.dev:443 -servername api.shop.dev -showcerts </dev/null',
          production: 'Serve the full chain minus the root. A missing intermediate is the classic "works in Chrome, fails in curl and on Android" bug, because some clients cache intermediates and others do not.'
        },
        code: [
          { title: 'The leaf certificate, decoded', lang: 'bash', code: 'Certificate:\n  Data:\n    Version: 3 (0x2)\n    Serial Number: 04:1c:8f:3a:...\n    Signature Algorithm: ecdsa-with-SHA256\n    Issuer:  CN = Acme Internal CA R3\n    Validity\n      Not Before: 2026-03-11 00:00:00 UTC\n      Not After : 2027-03-11 00:00:00 UTC\n    Subject: CN = api.shop.dev\n    X509v3 extensions:\n      X509v3 Subject Alternative Name:\n        DNS:api.shop.dev, DNS:*.api.shop.dev\n      X509v3 Key Usage: critical\n        Digital Signature\n      Authority Information Access:\n        CA Issuers - URI:http://pki.internal/ca-r3.crt' }
        ]
      },
      {
        id: 'chaos-cert-chain-build',
        chapter: 13,
        title: 'Path building: leaf → intermediate → ???',
        node: 'netservice',
        mode: 'user',
        explain: {
          what: "Now the browser plays \"who vouches for you?\" and runs out of people to ask. The leaf was issued by \"Acme Internal CA R3\" — is that in the chain? Yes, cert[1]. Cert[1] was issued by \"Acme Internal Root\" — is THAT in the trust store? It searches the system root store, around 150 CAs on a typical OS plus Chrome's own bundled root store, and finds nothing. Path building fails: there is no route from here to a trust anchor.",
          why: 'Trust in the web PKI is not transitive just because someone asserts it — the chain terminates only at a root the client independently decided to trust before this connection ever existed.',
          component: 'Certificate path building (BoringSSL / CertVerifyProc)',
          layer: 'Userspace · PKI validation',
          abstraction: 'Chain of trust terminating at a pre-installed anchor',
          protocol: 'X.509 path validation (RFC 5280 §6)',
          misconception: "You might think a server sending the root certificate completes the chain — actually a self-supplied root proves nothing, because trust has to come from the client's own store. Sending it just wastes bytes on every handshake.",
          analogy: 'Climbing a ladder where every rung is held up by the rung above it. It only takes your weight if the top rung is bolted to something that was already there.',
          command: 'openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt chain.pem\n# error 20: unable to get local issuer certificate',
          production: 'Chrome maintains its OWN root store now, independent of the OS. Enterprise MITM proxies that inject a corporate root into the system store need explicit policy to also register with Chrome.'
        },
        code: [
          { title: 'The dead end', lang: 'bash', code: 'depth=0  CN = api.shop.dev\n   issuer: CN = Acme Internal CA R3          [provided by server]\ndepth=1  CN = Acme Internal CA R3\n   issuer: CN = Acme Internal Root           [provided by server]\ndepth=2  CN = Acme Internal Root\n   -> NOT FOUND in trust store\n\nverify error:num=20:unable to get local issuer certificate' }
        ]
      },
      {
        id: 'chaos-cert-unknown-ca',
        chapter: 13,
        title: 'Verification fails: unknown certificate authority',
        node: 'netservice',
        mode: 'user',
        effects: ['flash'],
        explain: {
          what: 'Everything about this certificate is fine except the one thing that matters. The verifier returns ERR_CERT_AUTHORITY_INVALID: the SAN really does match api.shop.dev, the dates really are valid, the signatures really are internally consistent, the key usage really is correct. It fails on exactly one criterion — nobody the client trusts vouched for it — and that single criterion is what the entire web PKI rests on.',
          why: 'Without an independent anchor, an attacker who can intercept your traffic simply generates their own certificate for any name they like, so the trust store is the only thing between you and a beautifully encrypted chat with an adversary.',
          component: 'CertVerifyProc → ERR_CERT_AUTHORITY_INVALID',
          layer: 'Userspace · PKI validation',
          abstraction: 'Authenticity as the precondition for confidentiality',
          protocol: 'X.509 (RFC 5280)',
          misconception: 'You might think self-signed certificates are fine for internal services — actually they are, but only if you distribute your CA to every client that must trust it. What is never fine is teaching engineers to click through warnings, because that habit follows them into production.',
          analogy: 'A passport from a country no border guard has ever heard of. Beautifully printed, correctly filled in, and completely useless at the gate.',
          command: 'curl -v https://api.shop.dev/  # SSL certificate problem: unable to get local issuer certificate\ncurl --cacert /etc/pki/acme-root.pem https://api.shop.dev/  # works, correctly',
          production: 'For internal PKI, distribute the root via configuration management and mount it into containers. Use --cacert, never --insecure/-k: -k in a script is a permanent MITM vulnerability that outlives whoever wrote it.'
        },
        code: [
          { title: 'Three ways this ends', lang: 'bash', code: '$ curl https://api.shop.dev/products\ncurl: (60) SSL certificate problem: unable to get local issuer certificate\n\n$ curl --cacert /etc/pki/acme-root.pem https://api.shop.dev/products   # RIGHT\n[{"id":1,...}]\n\n$ curl -k https://api.shop.dev/products                                # WRONG\n[{"id":1,...}]\n# -k disables ALL verification. Encrypted to someone. Who? Unknowable.\n# It will be copied into a deploy script and live there for six years.' }
        ]
      },
      {
        id: 'chaos-cert-alert',
        chapter: 13,
        title: 'The client sends a fatal TLS alert',
        node: 'tcp',
        mode: 'kernel',
        packet: {
          label: 'TLS Alert: fatal, unknown_ca (48)',
          layers: ['ip', 'tcp', 'tls'],
          fields: {
            ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
            tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
            tls: { 'Content Type': '21 (alert)', 'Level': '2 (fatal)', 'Description': '48 (unknown_ca)' }
          }
        },
        explain: {
          what: 'The client says exactly why it is unhappy, then hangs up. It sends a two-byte alert record — level 2 (fatal), description 48 (unknown_ca) — and immediately treats the session as dead. TLS 1.3 encrypts alerts sent after the handshake keys exist, so anyone watching the wire sees only an opaque blob and cannot tell WHY the handshake failed. The server logs the alert and closes.',
          why: 'Explicit alerts are the reason TLS failures are debuggable at all, in stark contrast to the firewall that said nothing — this protocol was designed to explain itself.',
          component: 'TLS alert protocol (BoringSSL)',
          layer: 'Userspace → kernel · OSI L6',
          abstraction: 'Explicit protocol-level error signalling',
          protocol: 'TLS 1.3 alerts (RFC 8446 §6)',
          misconception: 'You might think the server will tell you what went wrong — actually the server is the one being told. Client-side validation failures produce alerts that land in your SERVER logs, which is why "certificate errors" show up at an origin whose own certificate is perfectly fine.',
          analogy: 'A card machine printing DECLINED — CARD EXPIRED on the receipt instead of just beeping at you. The refusal is the same; the printed reason is what saves your afternoon.',
          command: 'openssl s_client -connect api.shop.dev:443 2>&1 | grep -i "alert\\|verify"',
          production: 'Alert codes are a precise diagnostic vocabulary: 42 bad_certificate, 45 certificate_expired, 48 unknown_ca, 112 unrecognized_name (SNI mismatch). Log them by code, not as "TLS error".'
        },
        code: [
          { title: 'The alert record on the wire', lang: 'c', code: 'struct {\n    AlertLevel  level;        /* 2 = fatal */\n    AlertDescription desc;    /* 48 = unknown_ca */\n} Alert;\n\n/* common ones worth memorising */\n40  handshake_failure\n42  bad_certificate\n45  certificate_expired\n48  unknown_ca\n51  decrypt_error\n112 unrecognized_name        /* SNI does not match any vhost */' }
        ]
      },
      {
        id: 'chaos-cert-teardown',
        chapter: 13,
        title: 'The connection is torn down',
        node: 'socketobj',
        mode: 'kernel',
        state: { sock: 'CLOSED', mode: 'kernel' },
        explain: {
          what: 'The connection is thrown away before a single word of the actual conversation is spoken. After the alert the client closes the socket with a FIN, or an RST if it wants to discard buffered data. A connection that took a full round trip to establish is discarded roughly one and a half round trips later. No HTTP request was ever sent; not one byte of application data crossed. The failure happened strictly below the application layer.',
          why: 'Failing closed is not a bug here, it is the promise: the protocol simply has no "connect anyway with a warning" mode at all — only the UI ever offered one, and even that is quietly disappearing.',
          component: 'Socket teardown after fatal alert',
          layer: 'Kernel · OSI L4',
          abstraction: 'Fail-closed security',
          protocol: 'TCP FIN/RST (RFC 9293)',
          misconception: 'You might think the request was sent and then rejected — actually nothing was sent. Your API never saw a request, your access logs show nothing, and your error tracking is silent, which is exactly why certificate failures are invisible to server-side monitoring.',
          analogy: 'Hanging up the phone halfway through introducing yourself, before you ever get to why you called.',
          command: 'ss -tan "dst 104.18.32.7"   # the socket is simply gone',
          production: 'Because these failures never reach your application, synthetic monitoring from OUTSIDE your network is the only thing that catches them. Certificate incidents are found by users or by external probes, never by your app logs.'
        }
      },
      {
        id: 'chaos-cert-interstitial',
        chapter: 13,
        title: 'The red interstitial: ERR_CERT_AUTHORITY_INVALID',
        node: 'appcode',
        mode: 'user',
        effects: ['flash'],
        state: { mode: 'user', proc: 'chrome renderer PID 4821' },
        explain: {
          what: 'A human gets a scary red page; a background API call gets nothing but a shrug. For a top-level navigation the user sees the full-page "Your connection is not private" warning. For a SUBRESOURCE fetch like ours there is no interstitial at all — the request simply fails with a TypeError and the console prints net::ERR_CERT_AUTHORITY_INVALID. There is no "proceed anyway" for XHR or fetch, by design.',
          why: 'The asymmetry is deliberate: a human can make an informed risk decision about a page they chose to visit, while a background API call has no human to ask and must fail hard.',
          component: 'Chrome SSL interstitial / net error',
          layer: 'Userspace · UI',
          abstraction: 'Security decisions escalated to a human — or not at all',
          protocol: '—',
          misconception: 'You might think clicking through the warning fixes your app — actually the exception is per-origin and per-profile, and it does not apply to fetch or XHR from another origin. Your API calls keep failing while the browser tab looks perfectly fine.',
          analogy: 'A security guard who will let a persistent visitor in after a stern lecture, but who never, ever accepts their unattended deliveries.',
          command: 'chrome://net-internals/#events   # then filter for SSL_CERTIFICATE_ERROR',
          production: 'Chrome removed the click-through entirely for some error classes and for HSTS-protected sites. Never build a workflow that depends on users bypassing certificate warnings — it will break, and it teaches a dangerous habit.'
        }
      },
      {
        id: 'chaos-cert-hsts',
        chapter: 13,
        title: 'HSTS removes the "proceed anyway" button',
        node: 'netservice',
        mode: 'user',
        explain: {
          what: "Sometimes there is not even a button to click. If the site previously sent Strict-Transport-Security, or lives on the browser's preload list, the browser refuses to offer any bypass at all. HSTS is the origin declaring \"I am HTTPS-only and certificate errors are fatal here, no exceptions, for max-age seconds\". With preloading, that rule ships inside the browser binary and applies even on a first-ever visit.",
          why: 'HSTS closes the SSL-stripping attack: without it, an attacker on the network downgrades your very first plaintext request and the user never even sees a warning to ignore.',
          component: 'HTTP Strict Transport Security (browser TransportSecurityState)',
          layer: 'Userspace · security policy',
          abstraction: 'Origin-scoped, persistent security commitment',
          protocol: 'HSTS (RFC 6797)',
          misconception: 'You might think you can switch HSTS off by removing the header — actually clients that already cached the policy keep enforcing it for the full max-age regardless, and getting off the preload list takes months of browser release cycles.',
          analogy: 'A standing instruction left with your bank: never accept a phone authorisation from me, ever. It protects you brilliantly right up until it is genuinely you, having a genuinely bad day.',
          command: 'curl -sI https://api.shop.dev | grep -i strict-transport\n# strict-transport-security: max-age=63072000; includeSubDomains; preload',
          production: 'Roll HSTS out in stages: short max-age, then long, then includeSubDomains, and only then preload. Preloading a domain whose subdomains are not all HTTPS-ready has bricked internal tooling at more than one company.'
        }
      },
      {
        id: 'chaos-cert-expiry-ops',
        chapter: 13,
        title: 'The lesson: expiry is the outage nobody schedules',
        node: 'cftls',
        mode: 'net',
        explain: {
          what: 'Our failure was an untrusted CA, but the version that actually takes companies offline is far dumber: the certificate simply EXPIRED. Every certificate carries a hard deadline, and the moment it passes a perfectly healthy service becomes unreachable to every client at once — no gradual degradation, no canary, no partial failure. Spotify, Microsoft Teams, LinkedIn and Ericsson have all shipped this outage; the Ericsson one took mobile data away from 32 million people.',
          why: 'Certificate expiry is uniquely dangerous because it is a scheduled, known, calendared failure that organisations still walk into — the date is printed inside the artefact itself.',
          component: 'Certificate lifecycle management (ACME, cert-manager)',
          layer: 'Operations · PKI lifecycle',
          abstraction: 'Time-bounded trust requiring continuous renewal',
          protocol: 'ACME (RFC 8555) + X.509 validity',
          misconception: 'You might think auto-renewal means you can stop monitoring — actually renewal fails quietly all the time: a misconfigured DNS challenge, a rate limit, or a reload hook that never ran so the old certificate is still in memory. Monitor the certificate the SERVER ACTUALLY SERVES, never the file on disk.',
          analogy: 'A passport with an expiry date printed on it. Renewal is routine and entirely predictable, and people still get turned away at the airport for it every single day.',
          command: 'echo | openssl s_client -connect api.shop.dev:443 -servername api.shop.dev 2>/dev/null \\\n  | openssl x509 -noout -dates -subject',
          production: 'Alert at 30, 14, and 7 days from a probe that opens a real TLS connection from outside your network. With Let\'s Encrypt lifetimes shrinking toward days, renewal automation must be treated as tier-1 production infrastructure.'
        },
        code: [
          { title: 'The check that belongs in every monitoring stack', lang: 'bash', code: '#!/usr/bin/env bash\n# days until the SERVED certificate expires (not the one on disk)\nend=$(echo | openssl s_client -connect "$1:443" -servername "$1" 2>/dev/null \\\n      | openssl x509 -noout -enddate | cut -d= -f2)\ndays=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))\necho "$1 expires in $days days"\n[ "$days" -lt 14 ] && exit 2   # critical\n[ "$days" -lt 30 ] && exit 1   # warning\nexit 0' }
        ]
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. POSTGRESQL DOWN
  // ═══════════════════════════════════════════════════════════════
  dbdown: {
    label: 'PostgreSQL down',
    icon: '💥',
    entryAfter: 'pool-checkout',
    steps: [
      {
        id: 'chaos-db-connect-attempt',
        chapter: 19,
        title: 'The pool has no live connection — it dials out',
        node: 'pool',
        mode: 'remote',
        effects: ['pool+'],
        packet: {
          label: 'SYN → 10.0.0.12:5432',
          layers: ['ip', 'tcp'],
          fields: {
            ip: { 'Src': '10.0.0.9', 'Dst': '10.0.0.12', 'TTL': '64', 'Proto': '6 (TCP)' },
            tcp: { 'Src Port': '41088', 'Dst Port': '5432', 'Flags': 'SYN', 'Seq': '2841009377' }
          }
        },
        state: { proc: 'node PID 1 (container)', sock: 'SYN_SENT' },
        explain: {
          what: 'The app reaches for a database connection and finds the drawer empty. Every pooled connection is gone — the database restarted, or the pool never warmed — so the engine opens a fresh TCP connection to 10.0.0.12:5432. But Postgres is not running over there: the process died, the container was OOM-killed, or a failover moved the primary elsewhere. Nothing is bound to port 5432 on that host any more.',
          why: 'A connection pool hides transient blips beautifully and hides nothing at all when the backend is truly gone, so the first request after the pool empties is the one that discovers the truth.',
          component: 'Prisma pool → TCP connect',
          layer: 'Server userspace → kernel · L4',
          abstraction: 'Lazy reconnection on demand',
          protocol: 'TCP (RFC 9293)',
          misconception: 'You might think the pool keeps your app alive through a database restart — actually that only works if requests arrive slowly enough for reconnection to succeed between them. Under load, every in-flight request fails at the same instant the pool empties.',
          analogy: 'Picking up the office phone to call the warehouse, and finding out mid-sentence that the warehouse burned down an hour ago.',
          command: 'nc -vz 10.0.0.12 5432\npg_isready -h 10.0.0.12 -p 5432 -t 3',
          production: 'Keep a minimum idle pool warm and add a readiness probe that actually runs SELECT 1 — a TCP-only health check passes happily against a Postgres that is in recovery and refusing queries.'
        }
      },
      {
        id: 'chaos-db-rst',
        chapter: 19,
        title: 'RST: nothing is listening on 5432',
        node: 'postgres',
        mode: 'remote',
        effects: ['flash'],
        packet: {
          label: 'RST, ACK — port closed',
          layers: ['ip', 'tcp'],
          fields: {
            ip: { 'Src': '10.0.0.12', 'Dst': '10.0.0.9', 'TTL': '64' },
            tcp: { 'Src Port': '5432', 'Dst Port': '41088', 'Flags': 'RST, ACK', 'Seq': '0', 'Ack': '2841009378' }
          }
        },
        explain: {
          what: 'This time the bad news arrives instantly, and that is a mercy. The database host IS up — its kernel is running and reachable — but no socket is listening on 5432, so per RFC 9293 the kernel replies with RST, ACK immediately. Round trip: about 0.3 milliseconds. This is the loud, honest failure that the SYN-blackhole scenario never got.',
          why: 'An RST is a gift: it converts an ambiguous hang into an instant, unambiguous error, which is exactly the difference between a two-minute mystery and a two-second alert.',
          component: 'Kernel TCP: RST for a closed port (tcp_v4_send_reset)',
          layer: 'Database host kernel · OSI L4',
          abstraction: 'Explicit connection refusal',
          protocol: 'TCP RST (RFC 9293 §3.10.7)',
          misconception: 'You might think "connection refused" means the network is broken — actually it means the network worked PERFECTLY. Your packet arrived, was processed, and was answered. The problem is entirely at the application layer on the far side.',
          analogy: 'Ringing a doorbell and being told straight away "nobody by that name lives here", instead of standing on the step in silence, guessing.',
          command: 'sudo tcpdump -ni any "port 5432 and tcp[tcpflags] & tcp-rst != 0"',
          production: 'ECONNREFUSED on a database port during a deploy usually means the app started before the database was ready. depends_on with a real health condition, or a retry-on-boot loop, is the fix — not a sleep.'
        }
      },
      {
        id: 'chaos-db-econnrefused',
        chapter: 19,
        title: 'ECONNREFUSED bubbles into the driver',
        node: 'pool',
        mode: 'remote',
        state: { sock: 'CLOSED' },
        explain: {
          what: "The refusal turns into a number your code can act on. The kernel sets so_error = ECONNREFUSED (111) and closes the socket; libuv reports the failure, the driver's connect promise rejects, and the pool discards the half-built connection. It will retry under its own policy — and note that connect_timeout was never even approached, because there was nothing slow about this failure at all.",
          why: 'Fast failure beats slow failure every time: it lets the layers above decide to retry, fail over, or shed load while the request still has budget left to spend.',
          component: 'libuv connect error → driver rejection',
          layer: 'Server userspace · socket API',
          abstraction: 'errno as a control-flow signal',
          protocol: 'POSIX sockets',
          misconception: 'You might think ECONNREFUSED and ETIMEDOUT are both just connection errors — actually refused means the host is alive and the service is dead, so page the app owner; timed out means no answer at all, so page the network owner. Routing them identically wastes the first fifteen minutes of every incident.',
          analogy: 'The difference between "the shop is shut" and "we cannot even find the street". One is a wasted trip; the other is a map problem.',
          command: 'node -e "require(\'net\').connect(5432, \'10.0.0.12\').on(\'error\', e => console.log(e.code, e.syscall))"',
          production: 'Log the errno CODE, not just the message. Dashboards that count ECONNREFUSED versus ETIMEDOUT versus ENOTFOUND per dependency turn a vague "database errors" alert into a precise diagnosis.'
        }
      },
      {
        id: 'chaos-db-p1001',
        chapter: 19,
        title: 'PrismaClientInitializationError — P1001',
        node: 'prisma',
        mode: 'remote',
        explain: {
          what: "Prisma wraps the raw socket failure into an error with a name and a code you can branch on. The code is P1001, \"Can't reach database server at 10.0.0.12:5432\", and the error CLASS matters as much as the code. PrismaClientInitializationError means the connection never established at all — a different animal from PrismaClientKnownRequestError (the query ran and the database rejected it, like P2002 for a unique constraint) and from PrismaClientRustPanicError (the query engine itself fell over).",
          why: 'A code your program can read is what turns a 3 a.m. outage into an automatic response: P1001 should trigger retry-and-alert, while P2002 is a business-logic outcome that belongs in front of the user as a 409.',
          component: 'Prisma error mapping (@prisma/client)',
          layer: 'Server userspace · data-access layer',
          abstraction: 'Infrastructure errors as typed domain errors',
          protocol: '—',
          misconception: 'You might think every database error deserves a retry — actually retrying a P2002 unique-constraint violation will fail identically forever. Retry only connection and transient codes: P1001, the P1008 operation timeout, P1017 when the server closed the connection.',
          analogy: 'The warning lights on a car dashboard. Out of fuel, engine overheating and door ajar all live on the same panel, and only one of them means you can keep driving.',
          command: 'npx prisma db execute --stdin <<< "SELECT 1"',
          production: 'Map Prisma codes explicitly in one place. Anything unmapped becomes a 500 and a page — which is correct, because an unmapped error is by definition one you have not thought about.'
        },
        code: [
          { title: 'The error object', lang: 'js', code: "PrismaClientInitializationError:\n  Can't reach database server at `10.0.0.12`:`5432`\n\n  Please make sure your database server is running at `10.0.0.12`:`5432`.\n    errorCode: 'P1001'\n    clientVersion: '6.2.1'\n\n// codes worth handling by name:\n// P1001 unreachable   P1002 timed out    P1008 operation timeout\n// P1017 server closed connection         P2002 unique constraint" }
        ]
      },
      {
        id: 'chaos-db-service-throws',
        chapter: 19,
        title: 'The await throws; the call stack unwinds',
        node: 'service',
        mode: 'remote',
        effects: ['pool-'],
        explain: {
          what: 'The error climbs back up through your code, and nobody catches it. Back in ProductsService.findAll the awaited promise rejects, so the await THROWS. Because nothing here handles it, the async function returns a rejected promise, the controller propagates it, and Nest finally catches it at the framework boundary. The connection slot goes back to the pool, and whatever request was queued behind it now gets its own turn to fail the same way.',
          why: 'Letting infrastructure errors propagate is usually correct — a service that swallows a database outage and returns an empty array is far more dangerous than one that fails loudly, because empty looks exactly like valid data.',
          component: 'Async stack unwinding through the Nest handler chain',
          layer: 'Server userspace · error propagation',
          abstraction: 'Rejected promises as exceptions across await boundaries',
          protocol: '—',
          misconception: 'You might think you should catch errors close to where they happen — actually you should catch them where you can DO something. A try/catch that logs and rethrows is just noise; a try/catch that returns [] during an outage turns an outage into silent, undetectable data loss.',
          analogy: 'A relay runner who drops the baton and, quite correctly, stops — rather than sprinting on pretending everything is fine.',
          command: 'node --unhandled-rejections=strict dist/main.js',
          production: 'Never return a default value for an infrastructure failure. Empty results are indistinguishable from "genuinely no data" downstream, and they will silently corrupt caches, analytics, and search indexes.'
        }
      },
      {
        id: 'chaos-db-exception-filter',
        chapter: 19,
        title: 'Nest exception filter catches it',
        node: 'middleware',
        mode: 'remote',
        explain: {
          what: "One place in the app decides what the outside world is allowed to learn. The exception reaches Nest's exception layer, where the built-in filter recognises HttpException subclasses and maps them to their status, and turns everything else — including our PrismaClientInitializationError — into a generic 500. A custom filter can do far better: log the full context with a correlation id, emit a metric, and return a clean body that leaks nothing.",
          why: 'The exception filter is the one boundary that decides what the outside world learns about your internals, and stack traces or connection strings leaking into a 500 body is a real, repeatedly-reported security finding.',
          component: 'ExceptionFilter / AllExceptionsFilter (@nestjs/core)',
          layer: 'Server userspace · error boundary',
          abstraction: 'Centralised exception-to-HTTP mapping',
          protocol: 'HTTP status semantics (RFC 9110)',
          misconception: 'You might think a 500 body should include the error so you can debug it — actually error messages leak table names, hostnames and library versions. Log the detail server-side against a request id, and return the client that id and nothing else.',
          analogy: 'A press officer turning a chaotic internal incident into one careful sentence for the cameras, while the unabridged report goes quietly to the investigators.',
          command: 'docker logs api 2>&1 | grep -i "P1001\\|ERROR"',
          production: 'Return 503 with Retry-After for dependency outages, not 500. 503 tells load balancers and clients this is transient — and lets your own retry logic distinguish "broken code" from "broken dependency".'
        },
        code: [
          { title: 'A filter that is actually useful', lang: 'js', code: "@Catch(PrismaClientInitializationError)\nexport class PrismaDownFilter implements ExceptionFilter {\n  catch(err: PrismaClientInitializationError, host: ArgumentsHost) {\n    const res = host.switchToHttp().getResponse();\n    const requestId = host.switchToHttp().getRequest().id;\n\n    logger.error({ requestId, code: err.errorCode }, err.message);\n    metrics.increment('db.unreachable');\n\n    res.status(503).set('Retry-After', '5').json({\n      statusCode: 503,\n      error: 'Service Unavailable',\n      message: 'Upstream dependency unavailable',\n      requestId,                 // the only breadcrumb the client gets\n    });\n  }\n}" }
        ]
      },
      {
        id: 'chaos-db-500-response',
        chapter: 19,
        title: '500 Internal Server Error, serialized and sent',
        node: 'appserver',
        mode: 'remote',
        packet: {
          label: 'HTTP/1.1 500 Internal Server Error',
          layers: ['ip', 'tcp', 'http'],
          fields: {
            ip: { 'Src': '172.17.0.2', 'Dst': '172.17.0.1', 'TTL': '64' },
            tcp: { 'Src Port': '3000', 'Dst Port': '52814', 'Flags': 'PSH, ACK' },
            http: { 'Status': '500 Internal Server Error', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '68' }
          }
        },
        explain: {
          what: 'The failure is packed up and posted back like any other answer. Nest writes the status line, the headers, and a small JSON body. Notice what did NOT happen: no timeout, no hang. The whole failure took about 4 milliseconds end to end, most of it the container network round trip. Fast failure travels home along exactly the same path as a success.',
          why: 'Error responses use the identical serialization, proxying and network path as successful ones — they are cheap, which is precisely why a failing dependency can produce a spectacular volume of them.',
          component: 'Express response write (error path)',
          layer: 'Server userspace · L7',
          abstraction: 'Failure as a first-class HTTP response',
          protocol: 'HTTP/1.1 5xx (RFC 9110 §15.6)',
          misconception: 'You might think errors are too rare to need performance thought — actually a dependency outage makes them your ENTIRE traffic profile, and a 500 that takes 30 seconds to produce will exhaust your connection pool and upgrade a partial outage into a total one.',
          analogy: 'The SOLD OUT sign coming off the same printer, on the same paper, at the same speed as the menu. Bad news is not more expensive to print.',
          command: 'curl -is http://172.17.0.1:443/products?limit=20 | head -5',
          production: 'Alert on 5xx RATE, not count, and split by dependency. A 500 rate above ~1% for two minutes is worth waking someone; a single 500 is worth a log line.'
        },
        code: [
          { title: 'The wire response', lang: 'bash', code: 'HTTP/1.1 500 Internal Server Error\nContent-Type: application/json; charset=utf-8\nContent-Length: 68\nX-Request-Id: 01JG7QK2M4F3ZC\n\n{"statusCode":500,"message":"Internal server error","requestId":"01JG7QK2M4F3ZC"}' }
        ]
      },
      {
        id: 'chaos-db-through-proxy',
        chapter: 21,
        title: 'The proxy and the edge pass it straight through',
        node: 'proxy',
        mode: 'remote',
        explain: {
          what: 'Every machine between your app and the user looks at the 500, shrugs, and passes it along. nginx treats it as a perfectly valid HTTP response: it does not retry (proxy_next_upstream does not include http_500 by default), does not transform it, and simply relays it onward. Cloudflare does the same, adding cf-cache-status: DYNAMIC and its ray id. In transport terms the 500 is now indistinguishable from any other answer.',
          why: 'Knowing whether a 5xx came from your app or from the proxy itself is critical, because nginx generates a 502 when the upstream is unreachable and a 504 when it times out — a 500 is always YOUR application speaking.',
          component: 'nginx upstream response handling',
          layer: 'Origin server · L7 proxy',
          abstraction: 'Transparent relaying of application errors',
          protocol: 'HTTP/1.1',
          misconception: 'You might think 502 and 500 are basically the same — actually 500 means your app ran and threw, 502 means the proxy could not reach your app at all, and 504 means your app was reached but never answered in time. Three different failures, three different runbooks.',
          analogy: 'A courier delivering a sealed rejection letter without opening it — versus the courier ringing to say the office was locked (502), or that nobody came to the door for an hour (504).',
          command: 'awk \'$9 ~ /^5/ {print $9}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn',
          production: 'Compare your app 5xx rate with the edge 5xx rate. A gap means errors are being generated between them — a proxy timeout, a load balancer health-check flap, or a WAF rule.'
        }
      },
      {
        id: 'chaos-db-browser-ok-false',
        chapter: 24,
        title: 'fetch RESOLVES — and response.ok is false',
        node: 'appcode',
        mode: 'user',
        state: { mode: 'user', proc: 'chrome renderer PID 4821' },
        explain: {
          what: 'Here is the trap that catches almost everyone: the fetch Promise does NOT reject. The network worked flawlessly — DNS resolved, TLS handshook, HTTP round-tripped — so the Promise fulfils, handing you a Response whose status is 500 and whose ok is false. Code that only handles the catch branch sails straight past this and calls response.json() on an error body, usually producing a second, far more confusing error five lines later.',
          why: 'This is the most consequential API design decision in fetch and the one most frequently misunderstood: fetch models TRANSPORT success, not application success.',
          component: 'WHATWG fetch response semantics',
          layer: 'Userspace · L7 client',
          abstraction: 'Transport success versus application success',
          protocol: 'WHATWG Fetch',
          misconception: 'You might think fetch throws whenever the request failed — actually it throws only for network-level failures. 400, 401, 404, 500 and 503 all resolve perfectly happily. That is why axios, which rejects on 4xx and 5xx, feels more intuitive to many teams: a different default over the same underlying reality.',
          analogy: 'A phone call that connects perfectly, sounds crystal clear, and delivers the word "no". The call succeeded; the news did not.',
          command: 'curl -s -o /dev/null -w "%{http_code}\\n" https://api.shop.dev/products?limit=20',
          production: 'Wrap fetch once, centrally, and throw on !response.ok. Every codebase that skips this ends up with silent failures where an error body was parsed as data and rendered as an empty list.'
        },
        code: [
          { title: 'The bug, and the fix', lang: 'js', code: "// BUG: 500 sails straight through\nconst r = await fetch(url);\nconst data = await r.json();      // parses the ERROR body\nsetProducts(data);                // renders {} as a product list\n\n// FIX: one wrapper, used everywhere\nasync function apiFetch(url, init) {\n  const res = await fetch(url, init);\n  if (!res.ok) {\n    const body = await res.text().catch(() => '');\n    throw new HttpError(res.status, body, res.headers.get('x-request-id'));\n  }\n  return res.json();\n}" }
        ]
      },
      {
        id: 'chaos-db-resilience',
        chapter: 24,
        title: 'The lesson: health checks, backoff, circuit breakers',
        node: 'pool',
        mode: 'remote',
        effects: ['zoomout'],
        explain: {
          what: 'Three patterns turn this from a total outage into merely an annoying one. Health checks: a readiness probe that actually runs SELECT 1 pulls a broken instance out of rotation before users find it. Retries with exponential backoff AND JITTER: retry the transient P1001, but randomise the delay, or a thousand pods will retry in perfect lockstep and DDoS the database the instant it recovers. Circuit breakers: after N consecutive failures, stop calling entirely for a cooldown, fail fast, and periodically send one probe request to test recovery.',
          why: 'Without a breaker, every request to a dead dependency burns a connection, a thread and a full timeout, so one dead dependency saturates every service that touches it — and that is how a single database outage becomes a whole-site outage.',
          component: 'Resilience patterns (health probes, backoff+jitter, circuit breaker)',
          layer: 'Architecture · fault tolerance',
          abstraction: 'Bounded failure propagation',
          protocol: '—',
          misconception: 'You might think retries always make a system more reliable — actually naive retries make outages WORSE, multiplying load on a struggling dependency exactly when it needs less. Retries need budgets, jitter and a breaker, or they are simply an amplifier.',
          analogy: 'The fuse box in your house. When one circuit faults, the breaker trips fast and isolates it, rather than politely letting the fault burn the whole building down.',
          command: 'curl -s localhost:3000/health/ready | jq\n# {"status":"error","info":{},"error":{"database":{"status":"down"}}}',
          production: 'Use @nestjs/terminus for probes, separate liveness (is the process alive) from readiness (can it serve). Never make liveness depend on the database — a database blip should not trigger a pod restart storm on top of the outage.'
        },
        code: [
          { title: 'Backoff with full jitter', lang: 'js', code: "async function withRetry(fn, { attempts = 4, base = 100, cap = 2000 } = {}) {\n  for (let i = 0; ; i++) {\n    try {\n      return await fn();\n    } catch (err) {\n      const transient = ['P1001', 'P1002', 'P1017'].includes(err.errorCode);\n      if (!transient || i >= attempts - 1) throw err;\n      const ceiling = Math.min(cap, base * 2 ** i);\n      await sleep(Math.random() * ceiling);   // FULL jitter, not fixed delay\n    }\n  }\n}" },
          { title: 'Readiness probe', lang: 'js', code: "@Get('health/ready')\n@HealthCheck()\nready() {\n  return this.health.check([\n    () => this.prismaHealth.pingCheck('database', this.prisma, { timeout: 1000 }),\n  ]);\n}\n// liveness stays dumb on purpose:\n@Get('health/live')\nlive() { return { status: 'ok' }; }" }
        ]
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. PORT ALREADY IN USE (SERVER BOOT)
  // ═══════════════════════════════════════════════════════════════
  portinuse: {
    label: 'Port already in use (server boot)',
    icon: '🚧',
    entryAfter: '',
    steps: [
      {
        id: 'chaos-port-boot',
        chapter: 18,
        title: 'node dist/main.js — the server starts up',
        node: 'appserver',
        mode: 'remote',
        state: { mode: 'user', proc: 'node PID 1 (container)' },
        explain: {
          what: 'A completely different kind of story: no request, no packet, just a server trying to get out of bed. Node boots, V8 initialises, NestFactory walks the module graph, instantiates providers, compiles routes, and arrives at app.listen(3000). Everything so far has succeeded. The very last step is the one that decides whether any of it mattered: claiming the port.',
          why: 'Startup failures are their own category of outage — they happen during deploys, at the worst possible moment, and they usually present as a mysterious crash loop with the real error scrolled off the top of the logs.',
          component: 'NestFactory bootstrap → app.listen',
          layer: 'Server userspace · process startup',
          abstraction: 'Bind-then-serve lifecycle',
          protocol: '—',
          misconception: 'You might think a running process means a working service — actually a process can be alive and looping on a failed bind forever. Telling those two apart is exactly why liveness and readiness probes are separate things.',
          analogy: 'Setting up a market stall: you have the goods, the staff and the sign painted. You still need a pitch that nobody else has already claimed.',
          command: 'docker logs -f api\njournalctl -u api -f',
          production: 'Log a single unambiguous line on successful listen ("listening on :3000"). Its absence is a far better outage signal than the presence of a stack trace nobody parses.'
        }
      },
      {
        id: 'chaos-port-socket',
        chapter: 18,
        title: 'socket() → file descriptor 17',
        node: 'socketobj',
        mode: 'kernel',
        state: {
          mode: 'kernel',
          fds: [
            ['0', '/dev/null'],
            ['1', 'pipe:[log]'],
            ['2', 'pipe:[log]'],
            ['13', 'anon_inode:[eventpoll] (libuv)'],
            ['17', 'socket:[TCP unbound]']
          ]
        },
        explain: {
          what: 'First the kernel hands the program something to talk through, and it has no address yet. libuv calls socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, IPPROTO_TCP); the kernel allocates a struct socket plus a struct sock, wires in the IPv4/TCP protocol operations, and installs it at the lowest free descriptor, which here is 17. The socket exists but is anonymous: no address, no port, no state beyond CLOSED.',
          why: 'Creation and naming are deliberately separate syscalls — a socket is a communication endpoint first, and giving it an address is a distinct act that can fail on its own terms.',
          component: 'socket(2) → sock_create → sock_map_fd',
          layer: 'Kernel · socket layer',
          abstraction: 'Endpoint object before addressing',
          protocol: 'POSIX sockets',
          misconception: 'You might think creating a socket reserves the port — actually nothing is reserved until bind() succeeds. The window between socket() and bind() is precisely where two processes can race each other for the same number.',
          analogy: 'Being handed a telephone handset. It is real, it is yours, it works — and it does not have a number yet.',
          command: 'sudo ls -l /proc/"$(pgrep -f "node dist/main")"/fd',
          production: 'Descriptor exhaustion (EMFILE) fails here rather than at bind. Set LimitNOFILE in the systemd unit or ulimits in the container spec — the default 1024 is comically low for a busy server.'
        }
      },
      {
        id: 'chaos-port-setsockopt',
        chapter: 18,
        title: 'setsockopt(SO_REUSEADDR) — the misunderstood flag',
        node: 'socketobj',
        mode: 'kernel',
        explain: {
          what: 'Before binding, the library sets a flag whose name has confused programmers for thirty years. SO_REUSEADDR does NOT mean "let two servers share a port". It means "let me bind even though the address is still held by connections in TIME_WAIT from a previous instance". Without it, restarting a busy server fails for up to 60 seconds while old connections drain, which is why every server library sets it, always.',
          why: 'TIME_WAIT exists so that stray duplicate segments from a closed connection cannot be misdelivered into a new one, and SO_REUSEADDR waives that guarantee for the LISTEN socket specifically, where the risk is negligible.',
          component: 'setsockopt(SOL_SOCKET, SO_REUSEADDR)',
          layer: 'Kernel · socket options',
          abstraction: 'Relaxing address-reuse rules for restart friendliness',
          protocol: 'POSIX sockets / TCP TIME_WAIT (RFC 9293)',
          misconception: 'You might think SO_REUSEADDR lets two processes listen on the same port — actually that is SO_REUSEPORT, an entirely different option added in Linux 3.9. Mixing up those two is the single most common socket-API misunderstanding there is.',
          analogy: "Being allowed to move into a flat while the previous tenant's post is still being forwarded — which is nothing like being allowed to share the flat with them.",
          command: 'ss -tan state time-wait | wc -l',
          production: 'If you see EADDRINUSE despite SO_REUSEADDR, the port is genuinely held by a LISTENING process — not TIME_WAIT. That distinction immediately tells you whether to wait or to go find a process.'
        },
        code: [
          { title: 'The two options, side by side', lang: 'c', code: 'int one = 1;\n\n/* SO_REUSEADDR: bind over TIME_WAIT leftovers. */\nsetsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));\n\n/* SO_REUSEPORT: multiple LISTENING sockets on the same port,\n   kernel load-balances incoming SYNs across them by 4-tuple hash. */\nsetsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &one, sizeof(one));\n/* ^ this is what nginx workers and Node cluster (Linux) use */' }
        ]
      },
      {
        id: 'chaos-port-bind-fails',
        chapter: 18,
        title: 'bind() → EADDRINUSE',
        node: 'socketlayer',
        mode: 'kernel',
        effects: ['flash'],
        explain: {
          what: 'The program asks for port 3000 and is told, flatly, no. bind(17, {0.0.0.0:3000}) enters the kernel, which looks port 3000 up in the bind hash table (inet_bind_bucket) and finds a socket already sitting there in LISTEN state, owned by another process, with SO_REUSEPORT not set on BOTH sockets. The syscall returns -1 with errno EADDRINUSE (98). The port is spoken for.',
          why: 'A TCP port is an exclusive resource per address per namespace, and the kernel enforces that centrally because there is no coherent way to decide which of two listeners should receive a given SYN.',
          component: 'bind(2) → inet_csk_get_port (net/ipv4/inet_connection_sock.c)',
          layer: 'Kernel · socket layer',
          abstraction: 'Exclusive endpoint naming',
          protocol: 'POSIX sockets',
          misconception: 'You might think a port in use means the old process must be a zombie — actually it is frequently a perfectly healthy process: a dev server forgotten in another terminal, a second container publishing the same host port, or a systemd socket unit that grabbed the port first.',
          analogy: 'Driving to your reserved parking space and finding a car already in it — legitimately, with a valid permit on the dashboard.',
          command: 'sudo ss -ltnp "sport = :3000"',
          production: 'In containers this often means two containers published the same host port, or the app is binding 0.0.0.0 in host network mode. Check docker ps --format "{{.Names}} {{.Ports}}" before you go hunting for zombies.'
        },
        code: [
          { title: 'The syscall as strace sees it', lang: 'bash', code: 'socket(AF_INET, SOCK_STREAM|SOCK_CLOEXEC|SOCK_NONBLOCK, IPPROTO_TCP) = 17\nsetsockopt(17, SOL_SOCKET, SO_REUSEADDR, [1], 4) = 0\nbind(17, {sa_family=AF_INET, sin_port=htons(3000),\n          sin_addr=inet_addr("0.0.0.0")}, 16)\n      = -1 EADDRINUSE (Address already in use)\nclose(17)                                       = 0' }
        ]
      },
      {
        id: 'chaos-port-kernel-table',
        chapter: 18,
        title: 'Inside the kernel: the bind conflict check',
        node: 'tcp',
        mode: 'kernel',
        explain: {
          what: 'Inside the kernel, the conflict check is fussier than "is this number taken?". inet_csk_get_port hashes the port into the bind bucket table and walks the existing owners. Two sockets may share a port only if both set SO_REUSEPORT and run under the same effective UID (an anti-hijacking rule added after the option shipped), or if their addresses do not overlap: 127.0.0.1:3000 and 192.168.1.5:3000 can happily coexist, but 0.0.0.0:3000 conflicts with both, because it covers every address on the machine.',
          why: 'That wildcard-versus-specific rule explains a whole genre of confusing failures, where a service quietly bound to 127.0.0.1:3000 blocks a later attempt to bind 0.0.0.0:3000.',
          component: 'inet_csk_get_port / inet_bind_bucket (net/ipv4)',
          layer: 'Kernel · L4 port allocation',
          abstraction: 'Address-overlap conflict detection',
          protocol: 'TCP port namespace semantics',
          misconception: 'You might think 0.0.0.0 and 127.0.0.1 are different addresses, so both could take port 3000 — actually 0.0.0.0 is a WILDCARD covering every local address, including 127.0.0.1. They overlap, so the second bind fails.',
          analogy: 'Booking any room on floor 3 clashes with the guest who booked room 301, even though the two requests do not look remotely alike on paper.',
          command: 'sudo ss -ltn   # compare Local Address:Port columns: 0.0.0.0 vs 127.0.0.1 vs [::]',
          production: 'A separate network namespace resets the whole port space — which is exactly why fifty containers can all "listen on 3000" without conflict, and why the conflict only appears at the published-port layer on the host.'
        }
      },
      {
        id: 'chaos-port-node-throws',
        chapter: 18,
        title: 'libuv → Node: Error: listen EADDRINUSE :::3000',
        node: 'nodejs',
        mode: 'user',
        state: { mode: 'user' },
        explain: {
          what: "The kernel's refusal gets translated twice on the way to you, and picks up a small lie in transit. libuv turns errno 98 into UV_EADDRINUSE, and Node's net.Server emits an \"error\" event carrying an Error with code EADDRINUSE, syscall \"listen\", address \"::\" and port 3000. Notice the message says listen even though bind() is what actually failed — Node collapses the socket/bind/listen sequence into one user-facing operation.",
          why: 'That naming discrepancy sends people hunting through the wrong syscall, so knowing that "listen EADDRINUSE" really means "bind failed" saves you an entire strace session.',
          component: 'libuv uv_tcp_bind → net.Server error event',
          layer: 'Node userspace · error mapping',
          abstraction: 'errno → language-level exception',
          protocol: '—',
          misconception: 'You might think the :::3000 in the message means IPv6 only — actually ::: is the IPv6 wildcard, and Linux dual-stack sockets accept IPv4 too by default (net.ipv6.bindv6only=0). Node binds IPv6-any and gets IPv4 thrown in.',
          analogy: 'A translator faithfully relaying "the space is taken", but attributing the message to entirely the wrong department.',
          command: 'node -e "require(\'net\').createServer().listen(3000).on(\'error\', e => console.log(e.code, e.syscall, e.address, e.port))"',
          production: 'Always attach a server.on("error") handler. Without one, the error event throws as an uncaught exception and your carefully structured logs get a raw stack trace instead of a diagnosable message.'
        },
        code: [
          { title: 'The error Node gives you', lang: 'js', code: "Error: listen EADDRINUSE: address already in use :::3000\n    at Server.setupListenHandle [as _listen2] (node:net:1897:16)\n    at listenInCluster (node:net:1954:12)\n    at Server.listen (node:net:2059:7)\n  code:    'EADDRINUSE',\n  errno:   -98,\n  syscall: 'listen',       // ...but bind(2) is what actually failed\n  address: '::',\n  port:    3000" }
        ]
      },
      {
        id: 'chaos-port-crash-loop',
        chapter: 18,
        title: 'The process exits — and the supervisor restarts it. Forever.',
        node: 'process',
        mode: 'kernel',
        effects: ['ctx'],
        state: { proc: 'node PID 1 — exiting (code 1)' },
        explain: {
          what: 'It dies, comes back, and dies again — and this will repeat until somebody notices. The unhandled error event throws, Node exits with code 1, and the supervisor does exactly its job: Docker restart:always or systemd Restart=always brings it straight back. It fails identically. Roughly a second later, again. You now have a CrashLoopBackOff, a log full of repeated stack traces, and a service that has never once been up.',
          why: 'Supervisors are designed to recover from TRANSIENT failures, so a deterministic startup failure turns that recovery into an infinite loop that buries the original error under thousands of identical copies.',
          component: 'Process exit + supervisor restart policy (systemd / dockerd / kubelet)',
          layer: 'OS · process supervision',
          abstraction: 'Automatic restart with no notion of determinism',
          protocol: '—',
          misconception: 'You might think Restart=always makes your service resilient — actually against transient faults it does, but against a config error it converts one clean failure into an infinite, noisy one, burning CPU across the whole node while it does.',
          analogy: 'A vending machine trying to dispense a snack that is wedged behind the glass. Thunk. Thunk. Thunk. Once a second, forever, and the crisps never move.',
          command: 'docker inspect api --format "{{.RestartCount}} {{.State.ExitCode}}"\nsystemctl show api -p NRestarts',
          production: 'Set StartLimitBurst/StartLimitIntervalSec (systemd) so repeated failures stop and stay stopped in a visible failed state. In Kubernetes, CrashLoopBackOff backs off exponentially to 5 minutes — read the FIRST log lines, not the latest ones.'
        },
        code: [
          { title: 'Fail loudly and stop', lang: 'js', code: "const server = await app.listen(3000, '0.0.0.0').catch((err) => {\n  if (err.code === 'EADDRINUSE') {\n    logger.fatal({ port: 3000 }, 'port already in use — refusing to start');\n    process.exit(78);   // EX_CONFIG: a config error, not a crash\n  }\n  throw err;\n});\n\n// systemd: RestartPreventExitStatus=78 → stop the loop, stay failed" }
        ]
      },
      {
        id: 'chaos-port-find-culprit',
        chapter: 18,
        title: 'Finding the squatter: ss -ltnp',
        node: 'fdtable',
        mode: 'user',
        explain: {
          what: 'One command answers the only question that matters: who has my port? ss -ltnp lists listening TCP sockets together with the process that owns each one, read straight from the kernel over netlink rather than by parsing /proc. And there is the culprit: an older node process, PID 3312, still holding 0.0.0.0:3000 — a dev server left running in a forgotten terminal, or the previous deploy that never actually exited.',
          why: 'It answers the only question that matters, who has my port, in milliseconds — where lsof -i :3000 gets you the same answer more slowly and with more permissions fuss.',
          component: 'ss (iproute2, netlink INET_DIAG)',
          layer: 'Userspace · diagnostics',
          abstraction: 'Kernel socket state exposed to operators',
          protocol: 'netlink sock_diag',
          misconception: 'You might think netstat and ss are the same tool under two names — actually netstat parses /proc/net/tcp line by line and crawls once you have thousands of sockets, while ss uses the netlink diag interface and supports real filters. netstat has been deprecated for over a decade.',
          analogy: 'Asking the building caretaker who holds the keys to unit 3000, instead of knocking on every door in the block one at a time.',
          command: 'sudo ss -ltnp "sport = :3000"\nsudo lsof -nP -iTCP:3000 -sTCP:LISTEN\nsudo fuser -k 3000/tcp    # the blunt instrument',
          production: 'In containers, run ss from the HOST inside the container netns via nsenter — distroless images have no ss, no lsof, and no shell to run them with.'
        },
        code: [
          { title: 'The answer, in one line', lang: 'bash', code: 'sudo ss -ltnp "sport = :3000"\nState  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      511          0.0.0.0:3000        0.0.0.0:*    users:(("node",pid=3312,fd=17))\n#                                                                            ^ there it is' }
        ]
      },
      {
        id: 'chaos-port-reuseport',
        chapter: 18,
        title: 'The lesson: SO_REUSEPORT is how you share a port on purpose',
        node: 'socketobj',
        mode: 'kernel',
        explain: {
          what: 'If you genuinely DO want several processes on port 3000 — one per CPU core, say — there is a supported way to ask for it. Every process opens its own listening socket with SO_REUSEPORT set, and the kernel hashes each incoming SYN by its 4-tuple and delivers it to exactly one of them. No shared accept queue, no thundering herd, no master process handing descriptors around.',
          why: 'This is how nginx workers, Envoy and Node cluster on Linux scale across cores, and it also enables genuinely zero-downtime restarts: the new process binds alongside the old one, then the old one drains and exits.',
          component: 'SO_REUSEPORT (Linux 3.9+, reuseport_select_sock)',
          layer: 'Kernel · socket options',
          abstraction: 'Kernel-side connection load balancing across listeners',
          protocol: 'POSIX sockets extension',
          misconception: 'You might think SO_REUSEPORT rebalances existing connections when a process dies — actually it does not. In-flight connections on the dead socket are reset, and older kernels could even drop SYNs already queued to it. It is a tool for scaling, not for failover.',
          analogy: 'Several tellers behind one counter with a ticket machine deciding who serves whom, instead of one teller and a queue out the door.',
          command: 'sudo ss -ltnp "sport = :3000"   # multiple LISTEN rows on the same port = REUSEPORT',
          production: 'Prefer SO_REUSEPORT over a master/worker fd-passing model for multi-core Node: less IPC, better locality. Just make sure every process sets it AND runs as the same UID, or the kernel rejects the second bind.'
        },
        code: [
          { title: 'Four workers, one port', lang: 'js', code: "// Node >= 16 on Linux: SO_REUSEPORT-style scheduling\nimport cluster from 'node:cluster';\nimport os from 'node:os';\n\nif (cluster.isPrimary) {\n  cluster.schedulingPolicy = cluster.SCHED_NONE;  // let the kernel decide\n  for (let i = 0; i < os.availableParallelism(); i++) cluster.fork();\n} else {\n  await NestFactory.create(AppModule).then((a) => a.listen(3000));\n}" },
          { title: 'What it looks like from outside', lang: 'bash', code: 'sudo ss -ltnp "sport = :3000"\nLISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4101,fd=17))\nLISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4102,fd=17))\nLISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4103,fd=17))\nLISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4104,fd=17))\n# four sockets, one port, zero EADDRINUSE' }
        ]
      }
    ]
  }

};
