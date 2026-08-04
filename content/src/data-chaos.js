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
          what: 'The stub resolver builds a 45-byte UDP datagram, sends it to 1.1.1.1:53, and starts a timer. UDP is fire-and-forget: there is no handshake, no acknowledgement, and no connection state. The sendto() syscall returns success the instant the packet is handed to the kernel — success here means "queued for transmission", never "received by anyone".',
          why: 'DNS chose UDP for speed: one packet out, one packet back, no handshake. The cost of that choice is that failure is indistinguishable from slowness until a timer expires.',
          component: 'Stub resolver → UDP socket (glibc resolv / systemd-resolved)',
          layer: 'Kernel · OSI L4 (connectionless)',
          abstraction: 'Request/response over an unreliable datagram',
          protocol: 'DNS over UDP (RFC 1035)',
          misconception: '"sendto() returned 45, so the server got it." It means the kernel accepted 45 bytes for transmission. With UDP, that is the last thing you will ever learn about this packet.',
          analogy: 'Dropping a postcard in a mailbox with no tracking number and no return receipt. Now you wait.',
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
          what: 'The resolver is unreachable — a bad BGP announcement, a datacenter outage, a middlebox eating port 53, take your pick. From the client the symptom is identical in every case: absolute silence. No ICMP port unreachable, no RST, no error of any kind. The socket simply has nothing to read.',
          why: 'The absence of a signal IS the signal, and it takes seconds to interpret. This asymmetry — instant success, slow failure — shapes every timeout constant in networking.',
          component: 'Recursive resolver 1.1.1.1 (unreachable)',
          layer: 'Internet · unreachable peer',
          abstraction: 'Failure by omission',
          protocol: 'DNS (RFC 1035) — no negative signal for a lost query',
          misconception: '"If a server is down, I get an error." Only if something on the path chooses to tell you. A blackholed route, a DROP rule, or a dead host all produce identical silence.',
          analogy: 'Shouting into a canyon and hearing no echo. You cannot tell whether the canyon is empty, the wind ate your voice, or you are facing the wrong way.',
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
          what: 'The resolver’s timer fires. /etc/resolv.conf specifies options timeout:5 — five seconds per attempt per server, the historical default. During those five seconds the calling thread is blocked inside getaddrinfo (or, in browsers, the resolution job occupies a slot in the DNS thread pool). Nothing else about this request can proceed.',
          why: 'Five seconds is an eternity chosen in the 1980s when a busy resolver on a loaded VAX might genuinely take that long. The default has outlived its justification by four decades.',
          component: 'glibc resolver timeout (RES_TIMEOUT in resolv.h)',
          layer: 'Userspace · resolver library',
          abstraction: 'Timeout as the only failure detector',
          protocol: 'DNS resolver behaviour (RFC 1536)',
          misconception: '"DNS lookups are fast or they fail fast." A failing lookup is the SLOWEST thing in a normal request path — commonly 10 to 40 seconds before it gives up entirely.',
          analogy: 'Waiting five full minutes at a crosswalk before concluding the button is broken.',
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
          what: 'The resolver moves to the next nameserver in the list with a fresh transaction id from a fresh source port. Note it did this SERIALLY, after the full five-second timeout — the classic stub resolver never queries both at once. systemd-resolved and modern browsers are smarter and can race them, but the glibc behaviour every container inherits is strictly sequential.',
          why: 'Sequential failover is why the configured resolver ORDER matters so much, and why "we have a backup DNS server" does not mean "DNS failures are fast".',
          component: 'Resolver server rotation (res_nsend)',
          layer: 'Userspace · resolver library',
          abstraction: 'Serial failover across a static server list',
          protocol: 'DNS (RFC 1035)',
          misconception: '"Two nameservers means redundancy with no cost." It means the SECOND one is tried five seconds after the first one dies. Redundancy in availability, not in latency.',
          analogy: 'Calling your friend’s landline, letting it ring twenty times, and only then trying their mobile.',
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
          what: 'A response at last — and it is useless. RCODE 2, SERVFAIL, meaning "I tried and could not complete the resolution". The upstream authoritative servers for shop.dev are unreachable from this resolver too, or a DNSSEC validation failed. Critically, SERVFAIL is NOT cached the way NXDOMAIN is, so every retry re-does the full failing work.',
          why: 'Distinguishing SERVFAIL from NXDOMAIN is the difference between "the infrastructure is broken" and "that name genuinely does not exist" — and they demand completely different responses from you.',
          component: 'Recursive resolver failure response',
          layer: 'Internet · DNS resolution',
          abstraction: 'Explicit error versus silence',
          protocol: 'DNS RCODEs (RFC 1035 §4.1.1)',
          misconception: '"SERVFAIL means the domain does not exist." That is NXDOMAIN (RCODE 3). SERVFAIL means the resolver failed — commonly a DNSSEC signature that expired, which takes down perfectly healthy domains for everyone using validating resolvers.',
          analogy: 'The librarian says "our catalogue system is down" — very different from "no such book exists".',
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
          what: 'options attempts:2 means two rounds through the entire nameserver list. Round one: 1.1.1.1 timed out after 5s, 8.8.8.8 returned SERVFAIL. Round two, with the timeout doubled per glibc backoff: same outcome. Total wall-clock cost so far, roughly 15 seconds — during which the user has seen a spinner and nothing else.',
          why: 'Naming the number is the point. Fifteen seconds of blocked resolution destroys any latency budget you thought you had, and no application-level timeout you set on fetch() can shorten it if the resolution happens before the request.',
          component: 'glibc resolver retry loop (res_send)',
          layer: 'Userspace · resolver library',
          abstraction: 'Bounded retry with per-server timeouts',
          protocol: 'DNS resolver behaviour',
          misconception: '"My fetch has a 3-second AbortController timeout, so I am protected." Depends where the timeout starts. In many stacks the abort timer only covers the HTTP phase, and DNS resolution happens before it — 15 seconds pass before your 3-second timeout is even armed.',
          analogy: 'A restaurant that promises a 10-minute meal, timed from when you are seated — never mentioning the 40-minute queue outside.',
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
          what: 'The resolver gives up and getaddrinfo returns EAI_AGAIN (-3), "temporary failure in name resolution". The distinction from EAI_NONAME (-2, "name does not exist") is deliberate and load-bearing: EAI_AGAIN means retrying later is reasonable; EAI_NONAME means it never will be. Almost no application code checks which one it got.',
          why: 'This is the single point where a network condition becomes a program error, and where the retry policy should be decided. Almost every stack throws away the distinction one layer up.',
          component: 'getaddrinfo(3) (glibc / nss)',
          layer: 'Userspace · libc',
          abstraction: 'Name resolution API result codes',
          protocol: 'POSIX getaddrinfo (RFC 3493)',
          misconception: '"DNS errors and connection errors are the same thing." EAI_AGAIN means we never got as far as making a connection — no SYN was sent, no port was contacted, no firewall was involved. Debugging a connection you never attempted wastes hours.',
          analogy: 'The difference between "we cannot look up their address right now" and "that person does not exist". Both leave you unable to visit; only one is worth retrying.',
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
          what: 'The network service maps the resolution failure to net::ERR_NAME_NOT_RESOLVED and fails the URLLoader. The renderer rejects the fetch Promise with a TypeError whose message is the famously unhelpful "Failed to fetch". The Web Fetch specification deliberately refuses to expose the underlying cause to page script — DNS state is a cross-origin information leak.',
          why: 'This is why every frontend engineer has stared at "TypeError: Failed to fetch" and learned nothing: the spec traded diagnostics for privacy, on purpose.',
          component: 'Chrome network service → Blink fetch',
          layer: 'Userspace · L7 client',
          abstraction: 'Network errors surfaced as opaque exceptions',
          protocol: 'WHATWG Fetch (network error)',
          misconception: '"A rejected fetch means the server returned an error." Rejection means the request never completed at the network level: DNS failure, connection failure, CORS preflight failure, or abort. HTTP 500 does NOT reject.',
          analogy: 'A returned envelope stamped only "undeliverable" — no reason given, by policy.',
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
          what: 'The user sees the dinosaur, or your app’s error boundary, and reports that the internet is broken. From their seat that is a perfectly accurate description: DNS is the first step of essentially every action, so when resolution fails, EVERYTHING fails simultaneously — email, chat, streaming, the lot. One dead resolver looks exactly like a dead planet.',
          why: 'DNS is the most centralised dependency most systems have and the one least often included in a failure-mode review. It fails rarely and catastrophically, which is the worst combination for institutional memory.',
          component: 'Chrome error page (net::ERR_NAME_NOT_RESOLVED)',
          layer: 'Userspace · UI',
          abstraction: 'Infrastructure failure as user experience',
          protocol: '—',
          misconception: '"We have redundant servers, so we are highly available." If they share one DNS zone, one resolver configuration, or one registrar, you have a single point of failure wearing a redundancy costume. Facebook took itself off the internet in 2021 exactly this way.',
          analogy: 'The phone book burning down. Every phone still works perfectly; nobody can call anyone.',
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
          what: 'tcp_v4_connect picks the ephemeral port, installs the socket in the connection hash, transitions it to SYN_SENT, transmits the SYN, and arms the retransmission timer at the initial RTO of 1 second. connect() returns EINPROGRESS immediately because the socket is non-blocking; the outcome will be reported through epoll, later.',
          why: 'SYN_SENT is the most fragile state in TCP: no data can flow, and the only thing standing between here and a working connection is a packet that may never come back.',
          component: 'tcp_v4_connect / tcp_connect (net/ipv4/tcp_output.c)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Three-way handshake, step one',
          protocol: 'TCP (RFC 9293)',
          misconception: '"connect() returning success means we are connected." On a non-blocking socket it returns -1/EINPROGRESS and the real answer arrives via the readiness notification — code that ignores this is the source of countless phantom bugs.',
          analogy: 'Ringing a doorbell and stepping back. You are committed; now you find out whether anyone is home.',
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
          what: 'Somewhere along the path — a cloud security group, an on-prem edge firewall, an over-eager DROP rule — the packet matches a policy and is discarded. DROP means exactly that: free the buffer, increment a counter, send nothing. No RST, no ICMP administratively-prohibited, no log line unless someone enabled logging. The packet ceases to exist and nobody is told.',
          why: 'DROP versus REJECT is the single most consequential firewall decision for debuggability, and it is usually made by someone copying a config from Stack Overflow.',
          component: 'Netfilter filter table, DROP target',
          layer: 'Network · L3/L4 filtering',
          abstraction: 'Silent discard as a security posture',
          protocol: 'Netfilter / cloud security groups',
          misconception: '"DROP is more secure than REJECT." It slows down a port scanner by a few seconds and costs your own engineers hours per incident. For internal networks REJECT is almost always the better trade; save DROP for the hostile internet edge.',
          analogy: 'A doorman who neither opens the door nor says anything, and lets you keep knocking until you conclude the building is abandoned.',
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
          what: 'No SYN-ACK arrived, so the retransmission timer expires and TCP re-sends the identical SYN — same sequence number, same options — from the same port. The initial RTO for a SYN is fixed at 1 second (RFC 6298) because there is no RTT sample yet to compute one from.',
          why: 'Retransmission is TCP’s entire reliability mechanism. Packets get lost all the time on healthy networks; resending is normal, expected behaviour, not an error condition.',
          component: 'tcp_retransmit_timer (net/ipv4/tcp_timer.c)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Timeout-driven reliability',
          protocol: 'TCP RTO (RFC 6298)',
          misconception: '"Retransmissions mean the network is broken." A low retransmission rate is completely normal — TCP is designed around loss. Sustained SYN retransmits to one host, however, mean something is eating your packets.',
          analogy: 'Knocking a second time, a little louder, in case the first knock was missed.',
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
          what: 'Each failed attempt doubles the RTO: 1s, 2s, 4s, 8s, 16s, 32s. The kernel is assuming congestion and deliberately backing off rather than adding to it. Cumulative wait: 1 + 2 + 4 + 8 + 16 + 32 = 63 seconds after the original SYN, with a final attempt whose timeout pushes total failure detection to roughly 127 seconds.',
          why: 'Exponential backoff is one of the load-bearing ideas of the internet. Van Jacobson added it after the 1986 congestion collapse, when NSFNET throughput fell from 32kbps to 40bps because everyone retransmitted immediately and forever.',
          component: 'TCP exponential backoff (icsk_retransmits, RTO doubling)',
          layer: 'Kernel · OSI L4',
          abstraction: 'Congestion-safe retry scheduling',
          protocol: 'TCP (RFC 6298 §5.5)',
          misconception: '"Retrying faster gets me connected sooner." If the failure is congestion, aggressive retries make it strictly worse for everyone including you. This is exactly how congestion collapse happens.',
          analogy: 'Redialling a busy line at ever-longer intervals instead of hammering redial and keeping the exchange saturated.',
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
          what: 'net.ipv4.tcp_syn_retries defaults to 6, giving the ~127-second budget above. Lowering it to 3 caps failure detection at about 15 seconds; per-socket, TCP_USER_TIMEOUT or a connect timeout in your client library gives finer control without touching a system-wide knob.',
          why: 'The default is tuned for a 1990s network where a 60-second round trip over a satellite link was plausible. In a datacenter where p99 RTT is under a millisecond, waiting 127 seconds to learn a host is dead is indefensible.',
          component: 'net.ipv4.tcp_syn_retries (Documentation/networking/ip-sysctl.rst)',
          layer: 'Kernel · L4 tunable',
          abstraction: 'Failure detection latency as a configuration choice',
          protocol: 'TCP',
          misconception: '"Timeouts are a network property." They are a POLICY choice. Nothing physical says 127 seconds; someone picked a default and it outlived its context by thirty years.',
          analogy: 'The number of rings before voicemail picks up — a setting, not a law of telephony.',
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
          what: 'The retry budget is exhausted. The kernel sets so_error = ETIMEDOUT (110) on the socket, moves it to CLOSED, and marks it ready in epoll — readiness meaning "there is news", not "there is data". The application calls getsockopt(SO_ERROR) and learns the truth 127 seconds after asking a simple question.',
          why: 'Every failure must eventually become an errno. This is where a silent network condition finally becomes something a program can branch on.',
          component: 'Socket error propagation (sk->sk_err → SO_ERROR)',
          layer: 'Kernel · socket layer',
          abstraction: 'Asynchronous failure delivered through readiness',
          protocol: 'POSIX sockets',
          misconception: '"epoll said the socket is writable, so the connection succeeded." Writable means "you may act now" — and the action might be collecting an error. Always check SO_ERROR after a non-blocking connect completes.',
          analogy: 'A certified letter finally returned to sender, stamped with the reason, long after you stopped caring.',
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
          what: 'Had that firewall used REJECT instead of DROP, the story would have ended in about one millisecond. REJECT --reject-with tcp-reset sends an RST; the client kernel immediately sets ECONNREFUSED, connect() fails on the first attempt, and there are no retransmissions at all. Same security outcome — the connection is refused either way — but a hundred thousand times faster to diagnose.',
          why: 'This contrast is the whole lesson of the scenario. The failure mode you choose determines how long your engineers stare at a spinner wondering whether it is DNS, routing, or the app.',
          component: 'REJECT target vs DROP target',
          layer: 'Network · L3/L4 filtering',
          abstraction: 'Explicit refusal versus silent discard',
          protocol: 'TCP RST (RFC 9293) / ICMP type 3 code 13',
          misconception: '"REJECT leaks information to attackers." It reveals that a filter exists — which a timing side channel reveals anyway. Meanwhile DROP guarantees that YOUR next incident takes two extra minutes per test. Choose deliberately, not by reflex.',
          analogy: 'A locked door with a sign saying "closed" versus a door that simply never opens while you stand there for two minutes.',
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
          what: 'The network service maps ETIMEDOUT to net::ERR_CONNECTION_TIMED_OUT — though in practice Chrome usually gives up first, on its own ~75-second transaction timeout, and after trying the other addresses the DNS lookup returned (Happy Eyeballs will race an IPv6 and IPv4 address before conceding).',
          why: 'Client-side timeouts exist precisely because kernel defaults are too patient. Every layer adds its own impatience, and the shortest one wins.',
          component: 'Chrome network service transaction timeout',
          layer: 'Userspace · L7 client',
          abstraction: 'Layered timeout budgets',
          protocol: 'WHATWG Fetch (network error)',
          misconception: '"There is one timeout." There are at least five: kernel SYN retries, client connect timeout, request timeout, proxy timeouts, and load balancer idle timeouts. Debugging means knowing which one fired, and they rarely agree.',
          analogy: 'Nested egg timers with different settings — whichever rings first ends the conversation, and it is not always the one you set.',
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
          what: 'The user gets "This site can’t be reached — api.shop.dev took too long to respond". DNS worked perfectly, routing worked perfectly, the packets were correctly formed and correctly addressed. One rule on one device between here and there decided to say nothing, and that silence cost two minutes.',
          why: 'The most expensive failures are the silent ones. A loud failure costs a second; a silent one costs a timeout budget, multiplied by every retry, multiplied by every user.',
          component: 'Chrome error page (net::ERR_CONNECTION_TIMED_OUT)',
          layer: 'Userspace · UI',
          abstraction: 'Silent network policy as user-visible outage',
          protocol: '—',
          misconception: '"Timed out means the server is overloaded." It usually means the server never heard you at all. An overloaded server typically accepts the connection and then responds slowly — a completely different signature (fast connect, slow TTFB).',
          analogy: 'Waiting two minutes at a door before concluding nobody is home — when in fact the letterbox was welded shut by the previous tenant.',
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
          what: 'The server presents a chain: the leaf certificate for api.shop.dev, plus one intermediate. Each is an X.509 structure containing a public key, a subject, a validity window, extensions (SAN, key usage, AIA), and a signature made by the issuer’s private key. The chain is an assertion, not proof — anyone can generate this in thirty seconds with openssl.',
          why: 'TLS gets confidentiality from the key exchange but AUTHENTICITY only from this chain. Without verification you have a perfectly encrypted conversation with an unknown party, which is worthless.',
          component: 'TLS Certificate message',
          layer: 'Userspace · OSI L6',
          abstraction: 'Public key infrastructure: identity by delegated signature',
          protocol: 'TLS 1.3 (RFC 8446) + X.509 (RFC 5280)',
          misconception: '"The padlock means the site is safe." It means the connection is encrypted to whoever proved control of that name. Phishing sites get certificates in seconds — the padlock says nothing about intent.',
          analogy: 'Being handed an ID card. Holding it means nothing until you check who issued it and whether you trust that issuer.',
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
          what: 'The verifier builds a path from the leaf toward something it already trusts. Leaf issued by "Acme Internal CA R3" — is that in the chain? Yes, cert[1]. Cert[1] is issued by "Acme Internal Root" — is THAT in the trust store? It searches the system root store (about 150 CAs on a typical OS, plus Chrome’s own bundled root store) and finds nothing. Path building fails: there is no route to a trust anchor.',
          why: 'Trust in the web PKI is not transitive by assertion; it terminates only at a root the client independently decided to trust before this connection ever existed.',
          component: 'Certificate path building (BoringSSL / CertVerifyProc)',
          layer: 'Userspace · PKI validation',
          abstraction: 'Chain of trust terminating at a pre-installed anchor',
          protocol: 'X.509 path validation (RFC 5280 §6)',
          misconception: '"The server sent the root, so the chain is complete." A self-supplied root proves nothing — trust must come from the client’s own store. Sending the root just wastes bytes on every handshake.',
          analogy: 'A stranger vouching for another stranger who vouches for them. The loop must terminate at someone you already knew.',
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
          what: 'The verifier returns ERR_CERT_AUTHORITY_INVALID. Everything else about the certificate is fine — the SAN matches api.shop.dev, the dates are valid, the signatures are internally consistent, the key usage is correct. It fails on exactly one criterion: nobody the client trusts vouched for it. That single criterion is what the entire web PKI rests on.',
          why: 'Without an independent anchor, an attacker who can intercept your traffic simply generates their own certificate for any name they like. The trust store is the only thing standing between you and a perfectly encrypted conversation with an adversary.',
          component: 'CertVerifyProc → ERR_CERT_AUTHORITY_INVALID',
          layer: 'Userspace · PKI validation',
          abstraction: 'Authenticity as the precondition for confidentiality',
          protocol: 'X.509 (RFC 5280)',
          misconception: '"Self-signed certificates are fine for internal services." They are — IF you distribute your CA to every client that must trust it. What is never fine is teaching engineers to click through warnings, because that habit generalises to production.',
          analogy: 'A passport from a country no border control has heard of. Beautifully printed, correctly filled in, and completely unusable.',
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
          what: 'The client sends a two-byte alert record — level fatal, description unknown_ca — and immediately considers the session dead. TLS 1.3 encrypts alerts sent after the handshake keys are established, so a passive observer sees only an encrypted blob and cannot tell WHY the handshake failed. The server logs it and closes.',
          why: 'Explicit alerts are why TLS failures are debuggable at all, in stark contrast to the DROP scenario. The protocol was designed to say why it is unhappy.',
          component: 'TLS alert protocol (BoringSSL)',
          layer: 'Userspace → kernel · OSI L6',
          abstraction: 'Explicit protocol-level error signalling',
          protocol: 'TLS 1.3 alerts (RFC 8446 §6)',
          misconception: '"The server will tell me what went wrong." The SERVER is being told. Client-side validation failures produce alerts your server logs — which is why "certificate errors" often show up in origin logs even though the origin certificate is fine.',
          analogy: 'Handing back the unrecognised passport and saying exactly why, rather than staring blankly.',
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
          what: 'After the alert, the client closes the socket — FIN, or RST if it wants to discard buffered data. The TCP connection that took a full round trip to establish is discarded after roughly one and a half more. No HTTP request was ever sent; not one application byte crossed. The failure happened strictly below the application layer.',
          why: 'TLS failing closed is the correct behaviour and the whole point: there is no "connect anyway with a warning" mode at the protocol level, only at the UI level, and even that is disappearing.',
          component: 'Socket teardown after fatal alert',
          layer: 'Kernel · OSI L4',
          abstraction: 'Fail-closed security',
          protocol: 'TCP FIN/RST (RFC 9293)',
          misconception: '"The request was sent but rejected." Nothing was sent. Your API never saw a request, your access logs show nothing, and your error tracking is silent — which is why certificate failures are invisible to server-side monitoring.',
          analogy: 'Hanging up mid-introduction, before stating your business.',
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
          what: 'For a top-level navigation the user gets the full-page red warning: "Your connection is not private". For a SUBRESOURCE fetch like ours there is no interstitial at all — the request just fails with a TypeError and the console shows net::ERR_CERT_AUTHORITY_INVALID. There is no "proceed anyway" for XHR or fetch, by design.',
          why: 'The asymmetry is deliberate: a human can make an informed risk decision about a page they are visiting; a background API call has no human to ask and must fail hard.',
          component: 'Chrome SSL interstitial / net error',
          layer: 'Userspace · UI',
          abstraction: 'Security decisions escalated to a human — or not at all',
          protocol: '—',
          misconception: '"I clicked through the warning, so my app will work now." The exception is per-origin and per-profile, and it does NOT apply to fetch/XHR from another origin. Your API calls keep failing while the browser tab looks fine.',
          analogy: 'A guard who lets a persistent visitor through after a lecture, but never lets their unattended deliveries in.',
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
          what: 'If the site previously sent Strict-Transport-Security, or is on the browser’s preload list, the browser refuses to offer any bypass. HSTS asserts "this origin is HTTPS-only and certificate errors are fatal, no exceptions, for max-age seconds". With preloading, the rule ships inside the browser binary and applies even on a first-ever visit.',
          why: 'HSTS closes the SSL-stripping attack: without it, an attacker on the network downgrades your first plaintext request and the user never sees a warning to ignore.',
          component: 'HTTP Strict Transport Security (browser TransportSecurityState)',
          layer: 'Userspace · security policy',
          abstraction: 'Origin-scoped, persistent security commitment',
          protocol: 'HSTS (RFC 6797)',
          misconception: '"I can turn HSTS off by removing the header." Not for clients that already have the policy cached — they will enforce it for the full max-age regardless. And preload removal takes months of browser release cycles.',
          analogy: 'A standing instruction left with your bank: never accept phone authorisation from me, ever — even when it is genuinely me, having a bad day.',
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
          what: 'Our failure was an untrusted CA, but the far more common production version is a certificate that simply EXPIRED. Every certificate carries a hard deadline, and when it passes, a perfectly healthy service becomes unreachable to every client simultaneously — no gradual degradation, no canary, no partial failure. Spotify, Microsoft Teams, Ericsson (which took down mobile data for 32 million people), and LinkedIn have all shipped this outage.',
          why: 'Certificate expiry is uniquely dangerous because it is a scheduled, known, calendared failure that organisations still miss. The date is printed in the artefact itself.',
          component: 'Certificate lifecycle management (ACME, cert-manager)',
          layer: 'Operations · PKI lifecycle',
          abstraction: 'Time-bounded trust requiring continuous renewal',
          protocol: 'ACME (RFC 8555) + X.509 validity',
          misconception: '"Auto-renewal means I do not need monitoring." Renewal silently fails constantly: DNS challenge misconfigured, rate limits hit, the reload hook never ran so the old cert is still in memory. Monitor the certificate the SERVER ACTUALLY SERVES, not the file on disk.',
          analogy: 'A passport with an expiry date. Renewal is routine, entirely predictable, and people still get turned away at the airport every single day.',
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
          what: 'Every pooled connection is gone — the database restarted, or the pool never warmed — so the engine opens a fresh TCP connection to 10.0.0.12:5432. Postgres itself is not running: the process died, the container was OOM-killed, or a failover moved the primary elsewhere. Nothing is bound to port 5432 on that host anymore.',
          why: 'A connection pool hides transient blips beautifully and hides nothing at all when the backend is truly gone. The first request after the pool empties is the one that discovers the truth.',
          component: 'Prisma pool → TCP connect',
          layer: 'Server userspace → kernel · L4',
          abstraction: 'Lazy reconnection on demand',
          protocol: 'TCP (RFC 9293)',
          misconception: '"The pool will keep the app alive during a database restart." Only if requests arrive slowly enough for reconnection to succeed between them. Under load, every in-flight request fails simultaneously the moment the pool empties.',
          analogy: 'Picking up the office phone to call the warehouse and discovering the warehouse burned down an hour ago.',
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
          what: 'The database host IS up — its kernel is running and reachable — but no socket is listening on 5432. Per RFC 9293 the kernel replies with RST, ACK immediately. Round trip: about 0.3 milliseconds. This is the loud, honest failure that the SYN-blackhole scenario never got.',
          why: 'An RST is a gift. It converts an ambiguous hang into an instant, unambiguous error, which is exactly the difference between a two-minute mystery and a two-second alert.',
          component: 'Kernel TCP: RST for a closed port (tcp_v4_send_reset)',
          layer: 'Database host kernel · OSI L4',
          abstraction: 'Explicit connection refusal',
          protocol: 'TCP RST (RFC 9293 §3.10.7)',
          misconception: '"Connection refused means the network is broken." It means the network worked PERFECTLY — your packet arrived, was processed, and was answered. The problem is entirely at the application layer on the far side.',
          analogy: 'Ringing a doorbell and being told immediately "nobody by that name lives here" instead of standing in silence.',
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
          what: 'The kernel sets so_error = ECONNREFUSED (111) and closes the socket. libuv reports the failure, the driver’s connect promise rejects, and the pool discards the half-built connection. It will retry according to its own policy — but connect_timeout has not even been reached, because there was nothing slow about this failure at all.',
          why: 'Fast failure is far better than slow failure: it lets the layers above make a decision (retry, fail over, shed load) while the request still has budget left.',
          component: 'libuv connect error → driver rejection',
          layer: 'Server userspace · socket API',
          abstraction: 'errno as a control-flow signal',
          protocol: 'POSIX sockets',
          misconception: '"ECONNREFUSED and ETIMEDOUT are both just connection errors." Refused = host alive, service dead → page the app owner. Timed out = no answer at all → page the network owner. Routing them identically wastes the first fifteen minutes of every incident.',
          analogy: 'The difference between "the shop is closed" and "we cannot find the street".',
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
          what: 'Prisma wraps the socket error into a typed error with code P1001: "Can\'t reach database server at 10.0.0.12:5432". The error class matters — PrismaClientInitializationError means the connection never established, distinct from PrismaClientKnownRequestError (the query ran and the database rejected it, e.g. P2002 unique constraint) and PrismaClientRustPanicError (the engine itself fell over).',
          why: 'Typed error codes are what make automated remediation possible: a P1001 should trigger retry-and-alert, while a P2002 is a business-logic outcome that must surface to the user as a 409.',
          component: 'Prisma error mapping (@prisma/client)',
          layer: 'Server userspace · data-access layer',
          abstraction: 'Infrastructure errors as typed domain errors',
          protocol: '—',
          misconception: '"All database errors should be retried." Retrying a P2002 unique-constraint violation will fail identically forever. Retry only connection and transient errors — P1001, P1008 timeout, P1017 server closed the connection.',
          analogy: 'A doctor distinguishing "the clinic is closed" from "your test came back positive". Both are bad news; only one is worth coming back tomorrow for.',
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
          what: 'Back in ProductsService.findAll, the awaited promise rejects, so the await THROWS. Because nothing here catches it, the async function returns a rejected promise; the controller propagates it; Nest catches it at the framework boundary. The connection slot is released back to the pool, and any request queued behind it gets its own turn to fail the same way.',
          why: 'Letting infrastructure errors propagate is usually correct — a service that swallows a database outage and returns an empty array is far more dangerous than one that fails loudly, because empty looks like valid data.',
          component: 'Async stack unwinding through the Nest handler chain',
          layer: 'Server userspace · error propagation',
          abstraction: 'Rejected promises as exceptions across await boundaries',
          protocol: '—',
          misconception: '"I should catch errors close to where they happen." Catch them where you can DO something. A try/catch that logs and rethrows adds noise; a try/catch that returns [] on a database outage turns an outage into silent, undetectable data loss.',
          analogy: 'A relay runner who drops the baton and, correctly, does not pretend to keep running.',
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
          what: 'The exception reaches Nest’s exception layer. The built-in filter recognises HttpException subclasses and maps them to their status; anything else — including our PrismaClientInitializationError — becomes a generic 500. A custom filter can do better: log with full context and a correlation id, emit a metric, and return a clean, non-leaky body.',
          why: 'The exception filter is the one place that decides what the outside world learns about your internals. Stack traces and connection strings leaking into a 500 body is a real, repeated security finding.',
          component: 'ExceptionFilter / AllExceptionsFilter (@nestjs/core)',
          layer: 'Server userspace · error boundary',
          abstraction: 'Centralised exception-to-HTTP mapping',
          protocol: 'HTTP status semantics (RFC 9110)',
          misconception: '"A 500 body should include the error for debugging." It must not: error messages leak table names, hostnames, and library versions. Log the detail server-side with a request id; return that ID to the client and nothing else.',
          analogy: 'A press officer converting a chaotic internal incident into one careful sentence, while the full report goes to the investigators.',
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
          what: 'Nest writes the error response: status line, headers, and a small JSON body. Note what did NOT happen — no timeout, no hang. The whole failure took about 4 milliseconds end to end, most of it the container network round trip. Fast failure travels back through exactly the same path as a successful response.',
          why: 'Error responses use the identical serialization, proxying, and network path as success. They are cheap, which is precisely why a failing dependency can produce a spectacular volume of them.',
          component: 'Express response write (error path)',
          layer: 'Server userspace · L7',
          abstraction: 'Failure as a first-class HTTP response',
          protocol: 'HTTP/1.1 5xx (RFC 9110 §15.6)',
          misconception: '"Errors are rare so they do not need performance thought." A dependency outage makes them your ENTIRE traffic profile — and a 500 that takes 30 seconds to produce will exhaust your connection pool and turn a partial outage into a total one.',
          analogy: 'A rejection letter travels by the same post as an acceptance letter, and costs the same to send.',
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
          what: 'nginx receives the 500 and — importantly — treats it as a perfectly valid HTTP response. It does not retry (unless proxy_next_upstream includes http_500, which it does not by default), does not transform it, and simply relays it upstream. Cloudflare does the same, adding cf-cache-status: DYNAMIC and its ray id. The 500 is now indistinguishable, in transport terms, from any other answer.',
          why: 'Knowing whether a 5xx came from your app or from the proxy itself is critical: nginx generates 502 when the upstream is unreachable and 504 when it times out. A 500 is always YOUR application speaking.',
          component: 'nginx upstream response handling',
          layer: 'Origin server · L7 proxy',
          abstraction: 'Transparent relaying of application errors',
          protocol: 'HTTP/1.1',
          misconception: '"502 and 500 are basically the same." 500 = your app ran and threw. 502 = the proxy could not reach your app at all. 504 = your app was reached but never answered in time. Three different failures, three different runbooks.',
          analogy: 'A courier delivering a rejection letter unopened — versus the courier reporting that the office was locked (502) or that nobody answered for an hour (504).',
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
          what: 'Here is the trap. The fetch Promise does NOT reject: the network worked flawlessly, DNS resolved, TLS handshook, HTTP round-tripped. The Promise fulfils with a Response whose status is 500 and whose ok is false. Code that only handles the catch branch will sail past this and call response.json() on an error body — often producing a second, more confusing error five lines later.',
          why: 'This is the most consequential API design decision in fetch, and the one most frequently misunderstood. fetch models TRANSPORT success, not application success.',
          component: 'WHATWG fetch response semantics',
          layer: 'Userspace · L7 client',
          abstraction: 'Transport success versus application success',
          protocol: 'WHATWG Fetch',
          misconception: '"If the request failed, fetch throws." It throws only for network-level failures. 400, 401, 404, 500, 503 all resolve happily. This is why axios (which rejects on 4xx/5xx) feels more intuitive to many teams — different default, same underlying reality.',
          analogy: 'The post office successfully delivering a letter that says "your application was denied". Delivery succeeded; the news did not.',
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
          what: 'Three patterns turn this outage from total to partial. Health checks: a readiness probe that runs SELECT 1 pulls a broken instance out of rotation before users find it. Retries with exponential backoff AND JITTER: retry the transient P1001, but randomise the delay or a thousand pods will retry in lockstep and DDoS the database the instant it recovers. Circuit breakers: after N consecutive failures, stop calling entirely for a cooldown, fail fast, and periodically send one probe request to test recovery.',
          why: 'Without a breaker, every request to a dead dependency consumes a connection, a thread, and a timeout — so one dead dependency saturates every service that touches it. That is how a single database outage becomes a full-site outage.',
          component: 'Resilience patterns (health probes, backoff+jitter, circuit breaker)',
          layer: 'Architecture · fault tolerance',
          abstraction: 'Bounded failure propagation',
          protocol: '—',
          misconception: '"Retries make systems more reliable." Naive retries make outages WORSE: they multiply load on a struggling dependency exactly when it needs less. Retries need budgets, jitter, and a breaker, or they become an amplifier.',
          analogy: 'A fuse box. When a circuit faults, the breaker trips fast and isolates it — rather than letting the fault burn the whole building down.',
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
          what: 'A completely different story: no request, no packet, just a server trying to come up. Node boots, V8 initialises, NestFactory walks the module graph, instantiates providers, compiles routes, and reaches app.listen(3000). Everything so far has succeeded. The last step is the one that matters: claiming the port.',
          why: 'Startup failures are their own category of outage. They happen during deploys, at the worst moment, and they often present as a mysterious crash loop with the real error scrolled off the top of the logs.',
          component: 'NestFactory bootstrap → app.listen',
          layer: 'Server userspace · process startup',
          abstraction: 'Bind-then-serve lifecycle',
          protocol: '—',
          misconception: '"If the process is running, the service is up." A process can be alive and looping on a failed bind forever. That is exactly what liveness versus readiness probes exist to distinguish.',
          analogy: 'Setting up a market stall: you have the goods, the staff, and the sign — you still need the pitch nobody else has claimed.',
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
          what: 'libuv calls socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, IPPROTO_TCP). The kernel allocates a struct socket plus a struct sock, wires in the IPv4/TCP protocol operations, and installs it at the lowest free descriptor: 17. The socket exists but is anonymous — no address, no port, no state beyond CLOSED.',
          why: 'Creation and naming are deliberately separate syscalls. A socket is a communication endpoint first; giving it an address is a distinct, and separately failable, act.',
          component: 'socket(2) → sock_create → sock_map_fd',
          layer: 'Kernel · socket layer',
          abstraction: 'Endpoint object before addressing',
          protocol: 'POSIX sockets',
          misconception: '"Creating a socket reserves the port." Nothing is reserved until bind() succeeds. The window between socket() and bind() is exactly where two processes can race for the same port.',
          analogy: 'Getting a telephone handset. It is real, it is yours, and it has no number yet.',
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
          what: 'Before binding, libuv sets SO_REUSEADDR. This does NOT mean "let two servers share a port". It means "let me bind even if the address is held by connections in TIME_WAIT from a previous instance". Without it, restarting a busy server fails for up to 60 seconds while old connections drain — which is why every server library sets it, always.',
          why: 'TIME_WAIT exists so that stray duplicate segments from a closed connection cannot be misdelivered into a new one. SO_REUSEADDR waives that guarantee for the LISTEN socket specifically, where the risk is negligible.',
          component: 'setsockopt(SOL_SOCKET, SO_REUSEADDR)',
          layer: 'Kernel · socket options',
          abstraction: 'Relaxing address-reuse rules for restart friendliness',
          protocol: 'POSIX sockets / TCP TIME_WAIT (RFC 9293)',
          misconception: '"SO_REUSEADDR lets two processes listen on the same port." It does not — that is SO_REUSEPORT, a completely different option added in Linux 3.9. Confusing the two is the single most common socket-API misunderstanding.',
          analogy: 'Being allowed to move into a flat while the previous tenant’s mail is still being forwarded — not being allowed to share the flat with them.',
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
          what: 'bind(17, {0.0.0.0:3000}) enters the kernel, which looks up port 3000 in the bind hash table (inet_bind_bucket). There is already a socket there in LISTEN state, owned by another process, and SO_REUSEPORT was not set on BOTH sockets. The kernel returns -1 with errno EADDRINUSE (98). The port is spoken for.',
          why: 'A TCP port is an exclusive resource per address per namespace. The kernel enforces it centrally because there is no coherent way to decide which of two listeners should receive a given SYN.',
          component: 'bind(2) → inet_csk_get_port (net/ipv4/inet_connection_sock.c)',
          layer: 'Kernel · socket layer',
          abstraction: 'Exclusive endpoint naming',
          protocol: 'POSIX sockets',
          misconception: '"The port is in use, so the old process must be a zombie." Frequently it is a perfectly healthy process: a forgotten dev server, a second container with the same published port, or a systemd socket unit that grabbed the port first.',
          analogy: 'Arriving at your reserved parking space to find someone already parked there — legitimately, with a valid permit.',
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
          what: 'inet_csk_get_port hashes the port into the bind bucket table and walks the existing owners. Conflict rules: two sockets may share a port only if both set SO_REUSEPORT and have the same effective UID (an anti-hijacking rule added after the option shipped), or if the addresses do not overlap — 127.0.0.1:3000 and 192.168.1.5:3000 can coexist, but 0.0.0.0:3000 conflicts with both because it covers every address.',
          why: 'The wildcard-versus-specific rule explains a whole genre of confusing failures: a service bound to 127.0.0.1:3000 blocks a later 0.0.0.0:3000 bind, but not vice versa in the same way.',
          component: 'inet_csk_get_port / inet_bind_bucket (net/ipv4)',
          layer: 'Kernel · L4 port allocation',
          abstraction: 'Address-overlap conflict detection',
          protocol: 'TCP port namespace semantics',
          misconception: '"0.0.0.0 and 127.0.0.1 are different addresses, so both can bind port 3000." 0.0.0.0 is a WILDCARD covering every local address, including 127.0.0.1 — they overlap, and the second bind fails.',
          analogy: 'Booking "any room on floor 3" conflicts with someone who booked room 301, even though the requests look different.',
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
          what: 'libuv translates errno 98 into UV_EADDRINUSE, and Node’s net.Server emits an "error" event carrying an Error with code EADDRINUSE, syscall "listen", address "::" and port 3000. Note the message says listen even though bind() is what failed — Node collapses the socket/bind/listen sequence into one user-facing operation.',
          why: 'That naming discrepancy sends people looking at the wrong syscall. Knowing that "listen EADDRINUSE" means "bind failed" saves a strace session.',
          component: 'libuv uv_tcp_bind → net.Server error event',
          layer: 'Node userspace · error mapping',
          abstraction: 'errno → language-level exception',
          protocol: '—',
          misconception: '"The :::3000 in the message means IPv6 only." ::: is the IPv6 wildcard, and by default Linux dual-stack sockets accept IPv4 too (net.ipv6.bindv6only=0). Node binds IPv6-any and gets IPv4 for free.',
          analogy: 'A translator relaying "the space is taken" but attributing the message to the wrong department.',
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
          what: 'The unhandled error event throws, Node exits with code 1, and the supervisor does its job: Docker restart:always or systemd Restart=always brings it straight back. It fails identically. Roughly a second later, again. You now have a CrashLoopBackOff, a log full of repeated stack traces, and a service that has never once been up.',
          why: 'Supervisors are designed to recover from TRANSIENT failures. A deterministic startup failure turns that recovery into an infinite loop that hides the original error under thousands of identical repetitions.',
          component: 'Process exit + supervisor restart policy (systemd / dockerd / kubelet)',
          layer: 'OS · process supervision',
          abstraction: 'Automatic restart with no notion of determinism',
          protocol: '—',
          misconception: '"Restart:always makes my service resilient." Against transient faults, yes. Against a config error, it converts one clean failure into an infinite, noisy one — and burns CPU across the whole node while doing it.',
          analogy: 'An automatic door that keeps trying to open against a locked bolt, once a second, forever.',
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
          what: 'ss -ltnp lists listening TCP sockets with the owning process, read straight from the kernel via netlink rather than by parsing /proc. There is the culprit: an older node process, PID 3312, still holding 0.0.0.0:3000 — a dev server someone started in a forgotten terminal, or the previous deploy that never actually exited.',
          why: 'This one command answers the only question that matters — who has my port — and it answers it in milliseconds. lsof -i :3000 does the same job more slowly and with more permissions fuss.',
          component: 'ss (iproute2, netlink INET_DIAG)',
          layer: 'Userspace · diagnostics',
          abstraction: 'Kernel socket state exposed to operators',
          protocol: 'netlink sock_diag',
          misconception: '"netstat and ss are the same." netstat parses /proc/net/tcp line by line and is slow with thousands of sockets; ss uses the netlink diag interface and supports real filters. netstat has been deprecated for over a decade.',
          analogy: 'Asking the building manager who holds the lease on unit 3000 instead of knocking on every door.',
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
          what: 'If you actually WANT several processes on port 3000 — one per CPU core, say — SO_REUSEPORT is the supported mechanism. Every process opens its own listening socket with the flag set; the kernel hashes each incoming SYN by 4-tuple and delivers it to exactly one of them. No shared accept queue, no thundering herd, no master process distributing descriptors.',
          why: 'This is how nginx workers, Envoy, and Node cluster on Linux scale across cores. It also enables genuinely zero-downtime restarts: the new process binds alongside the old one, then the old one drains and exits.',
          component: 'SO_REUSEPORT (Linux 3.9+, reuseport_select_sock)',
          layer: 'Kernel · socket options',
          abstraction: 'Kernel-side connection load balancing across listeners',
          protocol: 'POSIX sockets extension',
          misconception: '"SO_REUSEPORT rebalances existing connections when a process dies." It does not. In-flight connections on the dead socket are reset, and older kernels could even drop SYNs already queued to it — SO_REUSEPORT is for scaling, not for failover.',
          analogy: 'Several tellers at one counter with a ticket machine deciding who serves whom, instead of one teller and a long queue.',
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
