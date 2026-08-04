// Packet Odyssey — component encyclopedia part C (window.COMPONENTS_C):
// DNS zone, Cloudflare edge, origin/Docker networking, the NestJS app, and PostgreSQL internals.
window.COMPONENTS_C = {
  stubresolver: {
    name: 'Stub Resolver',
    tagline: 'getaddrinfo() — the smallest DNS client in the world, and it never recurses',
    description: "The client-side half of DNS: glibc's getaddrinfo(3), Node's dns.lookup(), or systemd-resolved acting as a local cache. It knows exactly one trick — hand the whole question to a configured recursive resolver and wait for a complete answer. It never walks the delegation chain itself.",
    history: "RFC 1034 (1987) formally split DNS clients into full resolvers and stub resolvers. BIND shipped the reference implementation as libresolv; glibc absorbed it and layered Solaris-style Name Service Switch (/etc/nsswitch.conf) on top so names could come from files, DNS, mDNS, or LDAP. systemd-resolved (2014) then inserted itself as a local caching stub on 127.0.0.53, which is why so many modern /etc/resolv.conf files contain exactly one nameserver line pointing at loopback.",
    purpose: 'Turn a hostname into a sockaddr the application can connect() to, consulting whatever name sources this machine is configured to trust.',
    responsibilities: [
      'Walk /etc/nsswitch.conf sources in order — typically "files" (/etc/hosts) then "dns"',
      'Read /etc/resolv.conf: nameserver list, search domains, ndots, options timeout:N attempts:N',
      'Build the query (TXID 0x8f3a, QNAME api.shop.dev, QTYPE A and AAAA) and send it over UDP/53',
      'Retry the next nameserver on timeout, and re-ask over TCP when the reply has TC=1 set',
      'Sort the returned addrinfo list per RFC 6724 — the IPv6/IPv4 preference decision happens here, not in your app'
    ],
    commands: [
      { cmd: 'resolvectl query api.shop.dev', note: 'ask systemd-resolved directly; shows the link, the protocol, and whether it came from cache' },
      { cmd: 'getent hosts api.shop.dev', note: 'exercises the real NSS path — exactly what your process sees, /etc/hosts included' },
      { cmd: 'strace -f -e trace=openat,sendto,recvfrom getent hosts api.shop.dev', note: 'watch it open nsswitch.conf and resolv.conf, then fire the UDP datagram' },
      { cmd: 'resolvectl statistics', note: 'local cache hit/miss counters and DNSSEC validation stats' }
    ],
    production: "Two classic outages live here. ndots:5 inside Kubernetes turns every external lookup into four or five failed search-domain queries first; and glibc's default of timeout:5 attempts:2 means one dead resolver stalls a request for ten seconds before the second nameserver is even tried. Set options timeout:1 attempts:2 rotate, or run a local caching stub, and always alert on p99 resolution time.",
    interview: [
      'Why does dns.lookup() occupy a libuv threadpool thread while dns.resolve() does not?',
      'What is the practical difference between a stub resolver and a recursive resolver?',
      'What does ndots:5 do to lookup latency in a Kubernetes pod, and how would you prove it?'
    ],
    sources: ['man 3 getaddrinfo', 'man 5 resolv.conf', 'man 5 nsswitch.conf', 'RFC 1034 §5.3.1', 'RFC 6724', 'glibc resolv/res_send.c'],
    related: ['recursive', 'libc', 'udp']
  },
  recursive: {
    name: 'Recursive Resolver',
    tagline: 'Does the walking so your laptop does not have to — and caches the answer for everyone behind it',
    description: 'The recursive resolver (here Cloudflare 1.1.1.1) accepts one question with RD=1 and returns one final answer, doing all the iterative legwork itself: root, then TLD, then authoritative. Its cache is the reason the global DNS survives billions of queries per second.',
    history: 'Paul Mockapetris designed DNS at USC/ISI in 1983 to replace the hand-maintained HOSTS.TXT that SRI-NIC was distributing by FTP. RFC 882/883 (November 1983) were superseded by the definitive RFC 1034/1035 in November 1987, which are still the base specs today. Public recursives followed much later: OpenDNS 2006, Google 8.8.8.8 in December 2009, and Cloudflare 1.1.1.1 on 1 April 2018 in partnership with APNIC, which had been sitting on the polluted 1.1.1.0/24 research prefix.',
    purpose: 'Resolve a name end to end on behalf of thousands of stubs, and cache every intermediate result so the next asker gets it in microseconds.',
    responsibilities: [
      'Answer from cache when a record is still within its TTL — including negative answers (RFC 2308 NXDOMAIN caching, bounded by the SOA minimum)',
      'Otherwise iterate: query a root server, follow the referral to the TLD, follow that referral to the authoritative server',
      'Enforce anti-spoofing: random source ports and TXIDs (post-Kaminsky 2008), plus 0x20 case randomisation',
      'Validate DNSSEC signatures from the root trust anchor down when the zone is signed (RFC 4033-4035)',
      'Minimise disclosure with QNAME minimisation (RFC 9156) — the root only ever needs to see "dev"',
      'Serve stale on upstream failure (RFC 8767) rather than returning SERVFAIL'
    ],
    commands: [
      { cmd: 'dig +trace api.shop.dev', note: 'perform the iteration yourself, referral by referral — the single best DNS teaching command' },
      { cmd: 'dig @1.1.1.1 api.shop.dev A +stats', note: 'query the recursive directly; a second run returns a lower TTL, proving you hit its cache' },
      { cmd: 'dig @1.1.1.1 api.shop.dev +dnssec +multiline', note: 'show RRSIG records and the AD (Authenticated Data) bit' },
      { cmd: 'kdig -d @1.1.1.1 +tls api.shop.dev', note: 'DNS-over-TLS on port 853 (RFC 7858) with full handshake debug' }
    ],
    production: 'Cache TTL is the only knob you have during an incident: a 300s TTL means a failover propagates in five minutes, a 86400s TTL means a day of pain. Lower TTLs before a planned migration, not during one. Watch SERVFAIL rate and p99 upstream latency; a resolver that is quietly failing DNSSEC validation looks identical to an origin outage from the application side.',
    interview: [
      'Explain iterative versus recursive resolution, and which party does which.',
      'What was the Kaminsky attack and why did source-port randomisation fix it?',
      'A record has a 5-minute TTL but users still hit the old IP an hour after your cutover. Name three plausible causes.',
      'How does negative caching work, and what governs how long an NXDOMAIN is remembered?'
    ],
    sources: ['RFC 1034', 'RFC 1035', 'RFC 2308 (negative caching)', 'RFC 9156 (QNAME minimisation)', 'RFC 8767 (serve-stale)', 'man 1 dig'],
    related: ['stubresolver', 'rootns', 'tldns', 'udp']
  },
  rootns: {
    name: 'Root Nameservers',
    tagline: 'Thirteen letters, 1500+ machines, and one job: point you at the TLD',
    description: 'The root zone is the empty label at the top of the namespace. Its servers hold no A record for api.shop.dev — only NS and glue records delegating "dev" to Google Registry. They answer a referral and hang up.',
    history: "There are exactly 13 root server letters (a.root-servers.net through m.root-servers.net) because a priming response listing all of them plus glue had to fit inside the 512-byte limit of an unextended UDP DNS message. That is a 1980s packet-size constraint frozen into internet governance forever. Twelve independent organisations operate them — Verisign runs both A and J. The root zone was signed with DNSSEC on 15 July 2010, and every letter is now anycast to well over 1500 physical instances worldwide.",
    purpose: 'Serve the delegation for every top-level domain, and nothing else, with absurd reliability.',
    responsibilities: [
      'Answer priming queries (NS for ".") so resolvers can refresh their root hints',
      'Return referrals: NS records for the TLD plus glue A/AAAA records in the ADDITIONAL section',
      'Return DS records so DNSSEC validators can chain trust from the root KSK down to the TLD',
      'Absorb enormous junk traffic — most root queries are garbage, and roughly half get NXDOMAIN',
      'Stay boringly available: no recursion, no caching for clients, no application logic'
    ],
    commands: [
      { cmd: 'dig @a.root-servers.net dev NS +norec', note: 'the exact referral your resolver gets; +norec proves the root refuses to recurse' },
      { cmd: 'dig . NS +short', note: 'the priming answer — all thirteen letters' },
      { cmd: 'dig . DNSKEY +multiline', note: 'the root KSK/ZSK, the trust anchor at the top of every DNSSEC chain' },
      { cmd: 'curl -s https://www.internic.net/domain/named.root | head', note: 'the root hints file every resolver ships with, verbatim' }
    ],
    production: 'You will never talk to a root server in an incident, but your resolver does, and its root hints file can go stale — IP changes (B-root moved in 2023) are handled gracefully via priming, but an air-gapped resolver with a decade-old named.root is a real failure mode. Anycast means the "root server" you reach is almost certainly a box in your own metro, often at an IXP.',
    interview: [
      'Why are there exactly 13 root servers, and is that still a real limit?',
      'If all 13 letters vanished this instant, how long would the internet keep working?',
      'What is in the ADDITIONAL section of a referral and why is glue necessary at all?'
    ],
    sources: ['RFC 1035 §4.2.1 (512-byte UDP limit)', 'root-servers.org', 'RFC 8109 (priming queries)', 'IANA root zone database'],
    related: ['recursive', 'tldns', 'anycast']
  },
  tldns: {
    name: 'TLD Nameservers',
    tagline: 'The .dev registry: it knows who is authoritative for shop.dev, and not one byte more',
    description: 'The TLD nameservers hold the zone for a single top-level domain. Asked about api.shop.dev, the .dev servers answer with a referral: NS records naming the authoritative nameservers for shop.dev, plus DS records if the zone is signed.',
    history: "Google Registry acquired .dev in the 2014 new-gTLD auction (reportedly about $US 25 million) and opened general availability on 28 February 2019. Its defining property is technical, not commercial: the entire .dev TLD is on the HSTS preload list, so Chrome, Firefox, Safari, and Edge refuse plaintext HTTP to any .dev name, ever. api.shop.dev cannot be served over HTTP even if you misconfigure it. The older heavyweights are Verisign's .com and .net (a.gtld-servers.net through m.gtld-servers.net), whose zones contain hundreds of millions of delegations.",
    purpose: 'Map a second-level domain to its authoritative nameservers, and publish the DNSSEC delegation signer records that continue the chain of trust.',
    responsibilities: [
      'Serve NS delegations for every registered domain in the TLD',
      'Serve glue A/AAAA records when a nameserver lives inside the domain it serves (in-bailiwick)',
      'Publish DS records supplied by the registrar to link the parent and child DNSSEC keys',
      'Reflect registry changes pushed by registrars via EPP, usually within minutes',
      'Answer NXDOMAIN authoritatively for unregistered names — no wildcard nonsense since the Site Finder debacle of 2003'
    ],
    commands: [
      { cmd: 'dig @a.nic.dev shop.dev NS +norec', note: 'the TLD referral, straight from a .dev nameserver' },
      { cmd: 'dig shop.dev DS +multiline', note: 'the delegation signer records that chain .dev DNSSEC down into shop.dev' },
      { cmd: 'whois shop.dev', note: 'registrar, nameservers, and expiry — a surprising number of outages are expired domains' },
      { cmd: 'dig dev SOA +short', note: 'the .dev zone serial; it moves whenever the registry publishes' }
    ],
    production: "Because .dev is HSTS-preloaded, there is no such thing as a plaintext staging environment on a .dev name — the browser upgrades to HTTPS before a packet leaves. Teams discover this at the worst possible moment. Beyond that, the classic TLD-level failures are boring and lethal: the domain expired, or the registrar's NS records point at nameservers that no longer host the zone (a lame delegation).",
    interview: [
      'Why can a .dev site never be served over plain HTTP in a modern browser?',
      'What is a lame delegation and how would you detect one?',
      'Where exactly does the DNSSEC chain of trust get handed from parent zone to child?'
    ],
    sources: ['RFC 1035', 'RFC 4034 (DS records)', 'hstspreload.org', 'get.dev (Google Registry)', 'RFC 5731 (EPP domain mapping)'],
    related: ['rootns', 'authns', 'recursive']
  },
  authns: {
    name: 'Authoritative Nameserver',
    tagline: 'The end of the chain: the server that actually owns the answer, AA bit set',
    description: "The authoritative nameserver for shop.dev holds the real zone file and returns the A record 104.18.32.7 for api.shop.dev with the AA (Authoritative Answer) flag set. It is the only machine in the chain that is not guessing, quoting, or caching.",
    history: 'Kevin Dunlap wrote BIND at UC Berkeley in 1984 as the first real DNS implementation, and it dominated for two decades — along with a long parade of remote-root CVEs. Modern alternatives split the roles: NSD and Knot DNS for authoritative-only, Unbound for recursive-only, PowerDNS with a SQL backend. Cloud providers went further and made zones a database-backed API: Route 53 launched in December 2010, and Cloudflare serves authoritative DNS from the same anycast edge that proxies the traffic.',
    purpose: 'Publish the definitive contents of a zone — A, AAAA, CNAME, MX, TXT, SOA, NS — and prove authority with the AA bit and RRSIG signatures.',
    responsibilities: [
      'Answer queries for names in its zone with AA=1, and NXDOMAIN with an SOA for names that do not exist',
      'Set the per-record TTL that governs how long the entire internet may cache the answer',
      'Serve the SOA record: serial, refresh, retry, expire, and the negative-caching minimum',
      'Replicate to secondaries via AXFR/IXFR (RFC 5936) with NOTIFY (RFC 1996) to trigger fast propagation',
      'Sign records with DNSSEC and rotate ZSKs without breaking validators',
      'Answer CAA queries so certificate authorities know whether they may issue for the name'
    ],
    commands: [
      { cmd: 'dig @ns1.example-dns.net api.shop.dev A +norec', note: 'straight to the source; look for the "aa" flag in the header' },
      { cmd: 'dig shop.dev SOA +multiline', note: 'serial and timers — compare serials across nameservers to spot a stuck secondary' },
      { cmd: 'dig shop.dev NS +short && dig shop.dev CAA +short', note: 'who is authoritative, and which CAs are permitted to issue certificates' },
      { cmd: 'dig axfr shop.dev @ns1.example-dns.net', note: 'zone transfer; it should be refused — an open AXFR is a real-world infoleak' }
    ],
    production: 'Always run authoritative nameservers in at least two independent networks (ideally two providers) — the Dyn outage of October 2016 took down Twitter, Spotify, and GitHub for hours precisely because they had a single DNS provider. Keep TTLs modest (300s for records you may need to fail over), monitor SOA serial convergence across all NS, and never let AXFR be world-readable.',
    interview: [
      'What does the AA bit mean, and can a cached answer ever have it set?',
      'Walk me through a zone transfer: NOTIFY, SOA check, IXFR versus AXFR.',
      'How would you design DNS so that losing one DNS vendor does not take you offline?',
      'Why is CNAME illegal at a zone apex, and what do providers do about it?'
    ],
    sources: ['RFC 1035', 'RFC 1996 (NOTIFY)', 'RFC 5936 (AXFR)', 'RFC 8659 (CAA)', 'BIND ARM', 'Cloudflare DNS docs'],
    related: ['tldns', 'recursive', 'anycast']
  },
  anycast: {
    name: 'Anycast Edge',
    tagline: 'One IP address, hundreds of datacentres, and BGP quietly picking the closest one',
    description: 'Anycast announces the same IP prefix from many locations at once. 104.18.32.7 is not a server; it is a route advertised from every Cloudflare point of presence, and the internet delivers your packet to whichever instance is topologically nearest according to BGP.',
    history: 'The technique was formalised in RFC 4786 (2006) but used for DNS years earlier — the root servers adopted it in the early 2000s to survive the October 2002 attacks. Cloudflare, founded in 2009 and launched publicly at TechCrunch Disrupt in September 2010, built its entire product on anycast rather than the DNS-based geo-steering that legacy CDNs used, and now announces from more than 330 cities.',
    purpose: 'Put the service close to every user simultaneously, absorb attacks across the whole footprint, and fail over between sites without touching DNS.',
    responsibilities: [
      'Announce the same prefix via BGP from every PoP, letting each network pick a nearest exit',
      'Withdraw the announcement at a sick or drained PoP so traffic reroutes in seconds — no DNS TTL involved',
      'Terminate TCP and TLS locally at the PoP so RTT (and therefore handshake cost) collapses',
      'Spread volumetric attack traffic across the global footprint instead of concentrating it',
      'Load-balance inside a PoP with ECMP hashing over the five-tuple onto many physical servers'
    ],
    commands: [
      { cmd: 'dig api.shop.dev +short && curl -sI https://api.shop.dev | grep -i cf-ray', note: 'the CF-Ray suffix names the PoP you landed in, e.g. -SIN or -FRA' },
      { cmd: 'mtr -rw 104.18.32.7', note: 'the path is short and the last hops are local — that is anycast working' },
      { cmd: 'curl -s https://api.shop.dev/cdn-cgi/trace', note: 'Cloudflare echoes back your IP, the colo code, and the TLS version it negotiated' },
      { cmd: 'whois -h whois.radb.net 104.18.32.0/24', note: 'see the origin AS announcing the prefix (AS13335 for Cloudflare)' }
    ],
    production: 'The theoretical objection to anycast is that TCP flows could break when routing changes mid-connection. In practice internet routes are stable over the seconds a connection lives, so the failure rate is tiny and swamped by the latency win. The genuine operational pain is the opposite: BGP does not know about latency, only AS path length and local preference, so a badly peered network can be sent to a PoP on another continent. Fixes are peering agreements and PoP-level route tuning, not code.',
    interview: [
      'Why does anycast work for TCP when the routing decision is per-packet?',
      'Compare anycast to DNS-based geographic load balancing — what does each get wrong?',
      'How do you drain a single anycast PoP for maintenance without dropping user connections?'
    ],
    sources: ['RFC 4786', 'RFC 1546 (host anycasting, historic)', 'Cloudflare: "A Brief Anycast Primer"', 'blog.cloudflare.com/cloudflares-architecture'],
    related: ['bgp', 'cftls', 'ddos', 'ip']
  },
  ddos: {
    name: 'DDoS Mitigation',
    tagline: 'Deciding, in microseconds, which packets deserve a CPU cycle',
    description: 'The first thing an edge does with an inbound packet is decide whether it is real. Mitigation splits along the layers: L3/L4 volumetric floods are dropped in the kernel (or the NIC) by fingerprint, while L7 floods look like perfectly valid HTTP requests and must be judged on behaviour.',
    history: "The SYN flood entered public consciousness in September 1996 when Panix, one of the oldest ISPs in New York, was knocked offline for a week; SYN cookies (Bernstein and Schenk) were the answer. The Mirai botnet of IoT cameras hit Dyn in October 2016 at roughly 1.2 Tbps and broke half the consumer internet. GitHub took 1.35 Tbps of memcached reflection in February 2018 — a 51,000x amplification factor from UDP port 11211 servers exposed to the internet. HTTP/2 Rapid Reset (CVE-2023-44487, disclosed October 2023) produced application-layer floods above 200 million requests per second using nothing but RST_STREAM frames.",
    purpose: 'Keep the origin reachable by absorbing or discarding hostile traffic at the network edge, before it can consume a socket, a worker, or a database connection.',
    responsibilities: [
      'Absorb volumetric L3/L4 floods across the anycast footprint — capacity is the primary defence',
      'Drop malformed and spoofed packets in eBPF/XDP at line rate, before the kernel network stack allocates anything',
      'Answer SYN floods with SYN cookies so no half-open state is kept (net.ipv4.tcp_syncookies)',
      'Rate-limit L7 by IP, ASN, JA3/JA4 TLS fingerprint, and request signature',
      'Challenge suspicious clients (JS challenge, managed challenge) instead of hard-blocking, to limit collateral damage',
      'Detect amplification vectors — DNS ANY, NTP monlist, memcached, SSDP — by source port fingerprint'
    ],
    commands: [
      { cmd: 'ss -n state syn-recv | wc -l', note: 'count half-open connections; a spike is a SYN flood in progress' },
      { cmd: 'sysctl -w net.ipv4.tcp_syncookies=1 net.ipv4.tcp_max_syn_backlog=8192', note: 'the two knobs that keep a host alive under a SYN flood' },
      { cmd: "tcpdump -nni eth0 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0' -c 100", note: 'sample inbound SYNs and look at the source-address distribution' },
      { cmd: 'iptables -t raw -I PREROUTING -p udp --sport 11211 -j DROP', note: 'blackhole memcached reflection at the earliest possible hook' }
    ],
    production: 'You cannot filter your way out of a flood larger than your uplink — that is why mitigation is bought as capacity, at the edge, upstream of your transit. Practise your runbook: know how to enable Under Attack mode, how to rate-limit a single endpoint, and how to tell a DDoS apart from a viral launch, because the graphs look identical for the first sixty seconds.',
    interview: [
      'How do SYN cookies let a server complete a handshake while storing zero state?',
      'Why is UDP reflection so much more effective for an attacker than direct flooding?',
      'How would you distinguish a Layer 7 attack from an unexpected traffic surge from real users?'
    ],
    sources: ['RFC 4987 (TCP SYN flooding)', 'CVE-2023-44487', 'cr.yp.to/syncookies.html', 'blog.cloudflare.com DDoS reports', 'net/ipv4/syncookies.c'],
    related: ['anycast', 'waf', 'tcp', 'conntrack']
  },
  waf: {
    name: 'Web Application Firewall',
    tagline: 'Pattern-matching HTTP requests for attacks — and occasionally your own blog post about SQL',
    description: 'The WAF inspects the decrypted HTTP request — URI, query string, headers, cookies, body — against rules for SQL injection, XSS, path traversal, SSRF, and known CVE payloads. It is a compensating control: it buys time for real fixes, it does not replace them.',
    history: 'Ivan Ristic released ModSecurity in 2002 as an Apache module, and the community rule set that grew around it became the OWASP ModSecurity Core Rule Set (CRS), now the reference open-source ruleset. CRS 3.0 (2016) introduced anomaly scoring and paranoia levels, replacing the old fire-on-any-match model. Every commercial WAF since — AWS WAF, Cloudflare Managed Rules, F5 — is a variation on the same idea, plus a rapid-response pipeline for zero-days (Log4Shell mitigations shipped at the edge within hours in December 2021).',
    purpose: 'Block obviously hostile requests before they reach application code, and provide a same-day mitigation for vulnerabilities you cannot patch immediately.',
    responsibilities: [
      'Normalise the request first (URL-decode, remove nulls, decode entities) so evasion tricks do not slip through',
      'Evaluate signature rules for SQLi, XSS, RCE, LFI/RFI, and protocol anomalies',
      'Accumulate an anomaly score across matched rules and act only above a threshold, per CRS design',
      'Apply per-rule paranoia levels so aggressive heuristics stay opt-in',
      'Enforce rate limits and bot signals on top of signature matching',
      'Log the matched rule ID and the offending segment so a false positive can actually be diagnosed'
    ],
    commands: [
      { cmd: "curl -sI \"https://api.shop.dev/products?q=1%27%20OR%20%271%27=%271\"", note: 'a canonical SQLi probe; expect 403 and a Cloudflare ray id in the response' },
      { cmd: 'git clone https://github.com/coreruleset/coreruleset && ls coreruleset/rules', note: 'read the actual CRS rule files — REQUEST-942-APPLICATION-ATTACK-SQLI.conf is the famous one' },
      { cmd: "grep -c 'ModSecurity: Warning' /var/log/nginx/error.log", note: 'count would-be blocks while running in detection-only mode' },
      { cmd: 'curl -s -H "X-Forwarded-For: 127.0.0.1" https://api.shop.dev/admin -o /dev/null -w "%{http_code}\\n"', note: 'header-spoofing probe — a WAF that trusts XFF is a WAF you can bypass' }
    ],
    production: "False positives are the real production cost, not attacks. A CMS that lets users write about databases will trip SQLi rules the first time someone posts \"DROP TABLE\"; a JSON body containing a Windows path trips traversal rules. Always deploy new rules in log-only mode, measure for a week, tune per-endpoint exclusions, then enforce. And never let the WAF become the reason nobody fixed the injection.",
    interview: [
      'What is anomaly scoring in the OWASP CRS and why is it better than blocking on first match?',
      'Give three ways an attacker evades a signature-based WAF.',
      'A WAF rule is blocking 0.3% of legitimate checkout requests. Walk me through your response.'
    ],
    sources: ['OWASP ModSecurity Core Rule Set (coreruleset.org)', 'OWASP Top 10', 'ModSecurity Reference Manual', 'Cloudflare Managed Rules docs'],
    related: ['ddos', 'cftls', 'cfcache', 'proxy']
  },
  cfcache: {
    name: 'Edge Cache',
    tagline: 'The fastest request is the one that never reaches your origin',
    description: 'Each PoP keeps a local cache on NVMe. A request that hits it is answered in a millisecond from the same city as the user; a miss goes upstream. The cf-cache-status response header tells you exactly what happened, and reading it correctly is half of CDN debugging.',
    history: "Content delivery networks began with Akamai in 1998, spun out of MIT research on consistent hashing for load distribution. Cloudflare's model differs: caching is a side effect of a proxy that every request already passes through for security, rather than a separate hostname you push assets to. Tiered Cache (upper-tier PoPs that shield the origin) and Cache Reserve (durable object-storage backing) came later, as origin-offload became the more valuable half of the product.",
    purpose: 'Serve repeat responses from the edge to cut latency and origin load, while giving the origin precise control over what may be cached and for how long.',
    responsibilities: [
      'Honour Cache-Control and s-maxage from the origin, and Vary for content negotiation',
      'Report the outcome in cf-cache-status: HIT, MISS, EXPIRED, REVALIDATED, STALE, UPDATING, DYNAMIC, BYPASS',
      'Collapse concurrent misses for the same key into a single origin fetch, preventing a stampede',
      'Use tiered caching so a global miss consults an upper-tier PoP before touching the origin',
      'Serve stale-while-revalidate and stale-if-error content rather than surfacing an origin blip',
      'Support targeted purge — by URL, by prefix, by cache tag, or the nuclear purge-everything'
    ],
    commands: [
      { cmd: 'curl -sI https://api.shop.dev/products | grep -iE "cf-cache-status|age|cache-control"', note: 'the three headers that answer "why was this not cached?"' },
      { cmd: 'curl -sI https://api.shop.dev/products -H "Cache-Control: no-cache"', note: 'force revalidation and compare the status header' },
      { cmd: 'for i in 1 2 3; do curl -sI https://api.shop.dev/logo.png | grep -i cf-cache-status; done', note: 'watch MISS become HIT as the object populates that PoP' },
      { cmd: 'curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" --data \'{"files":["https://api.shop.dev/products"]}\'', note: 'surgical purge — prefer this over purge-everything, which re-heats every PoP at once' }
    ],
    production: 'API responses like /products return DYNAMIC by default — Cloudflare will not cache an unknown content type without being told to. Making them cacheable is a deliberate act (a Cache Rule plus Cache-Control: public, s-maxage=60) and demands you think about authenticated variants; caching a response that varies by Authorization header is how one user sees another user\'s data. Watch cache hit ratio and origin request rate as a pair: a falling ratio is usually a new query parameter entering the cache key.',
    interview: [
      'What does cf-cache-status: DYNAMIC mean and how do you change it?',
      'Difference between max-age and s-maxage, and who obeys which?',
      'How does stale-while-revalidate change the latency profile of a cache miss?',
      'Why is purge-everything dangerous on a high-traffic site?'
    ],
    sources: ['RFC 9111 (HTTP Caching)', 'RFC 5861 (stale-while-revalidate)', 'Cloudflare cache docs', 'MDN: Cache-Control'],
    related: ['httpcache', 'originpull', 'anycast', 'waf']
  },
  cftls: {
    name: 'Edge TLS Termination',
    tagline: 'Where the ciphertext stops — and why the edge can read your JSON',
    description: 'The TLS session your browser negotiated terminates here, at the PoP, not at your origin. The edge holds the private key for api.shop.dev, decrypts the record layer, and hands plaintext HTTP to the WAF, the cache, and the proxy. Everything the edge does — inspection, caching, routing — depends on this fact.',
    history: 'Netscape designed SSL in 1994; SSL 1.0 was never released, SSL 2.0 shipped in 1995 and was broken, and SSL 3.0 (1996, largely Paul Kocher) was the first credible version. The IETF renamed it TLS 1.0 in RFC 2246 (1999); TLS 1.2 arrived in RFC 5246 (2008) and TLS 1.3 in RFC 8446 (August 2018) after four years and 28 drafts. TLS 1.3 removed RSA key transport entirely — every handshake is now (EC)DHE and therefore forward-secret — and cut the handshake to one round trip. Cloudflare made edge TLS free for everyone with Universal SSL in September 2014, which roughly doubled the number of HTTPS sites on the internet overnight.',
    purpose: 'Terminate the client TLS session at the network edge so that inspection, caching, and routing can operate on plaintext, then re-encrypt on the way to the origin.',
    responsibilities: [
      'Select the certificate by SNI (or now by ECH-decrypted inner SNI) before any handshake state is built',
      'Negotiate the cipher suite and key exchange — TLS 1.3 with X25519 ECDHE for forward secrecy',
      'Present the leaf plus intermediate chain, with OCSP stapling to avoid a client-side revocation round trip',
      'Negotiate the application protocol over ALPN: h2, h3, or http/1.1',
      'Manage the origin leg separately per SSL mode: Off, Flexible, Full, or Full (Strict)',
      'Support session resumption and 0-RTT early data, with replay protection scoped to safe methods'
    ],
    commands: [
      { cmd: 'openssl s_client -connect api.shop.dev:443 -servername api.shop.dev -tls1_3 </dev/null', note: 'full handshake transcript: cipher, chain, ALPN, session ticket' },
      { cmd: 'curl -sv --tlsv1.3 https://api.shop.dev/products 2>&1 | grep -E "SSL connection|ALPN|subject"', note: 'negotiated version, protocol, and certificate subject in three lines' },
      { cmd: 'openssl s_client -connect api.shop.dev:443 -status </dev/null | grep -A2 "OCSP Response Status"', note: 'confirm OCSP stapling is actually happening' },
      { cmd: 'nmap --script ssl-enum-ciphers -p 443 api.shop.dev', note: 'enumerate the offered suites and grade them' }
    ],
    production: "SSL mode Flexible (HTTPS to the browser, plain HTTP to the origin) shows a padlock while the origin leg is cleartext — it is a lie told to users and it also causes redirect loops when the origin forces HTTPS. Use Full (Strict) so the origin certificate is actually validated. On 0-RTT: early data can be replayed by an attacker, so it must be restricted to idempotent requests (RFC 8446 Appendix E.5); never let a POST ride 0-RTT. And remember that terminating TLS at the edge means the edge is inside your trust boundary — that is the deal.",
    interview: [
      'Why does TLS 1.3 have no RSA key-transport cipher suites?',
      'Explain the 0-RTT replay problem and how servers defend against it.',
      'What is the practical difference between Cloudflare SSL modes Flexible, Full, and Full (Strict)?',
      'How does the edge know which certificate to present before the HTTP Host header exists?'
    ],
    sources: ['RFC 8446 (TLS 1.3)', 'RFC 5246 (TLS 1.2)', 'RFC 6066 (SNI)', 'RFC 8446 Appendix E.5', 'blog.cloudflare.com/introducing-universal-ssl'],
    related: ['anycast', 'waf', 'originpull', 'tcp']
  },
  originpull: {
    name: 'Origin Pull',
    tagline: 'The second connection: edge to origin, on a warm socket, carrying the client identity in headers',
    description: 'On a cache miss the PoP makes its own HTTP request to your origin at 198.51.100.10. It is a fresh TCP+TLS connection from a Cloudflare IP, so the origin sees the edge as the client — the real client identity survives only in headers the edge adds.',
    history: 'Reverse-proxy origin fetching is as old as caching proxies (Squid, 1996), but the modern refinements are recent: persistent connection pools to the origin, Argo Smart Routing (2017) which sends origin traffic over Cloudflare\'s measured backbone instead of the default BGP path, and Cloudflare Tunnel/cloudflared, which inverts the direction entirely — the origin dials out, so it needs no inbound firewall rule and no public IP at all.',
    purpose: 'Fetch the authoritative response from the origin as cheaply and as reliably as possible, while preserving enough client context for the application to do its job.',
    responsibilities: [
      'Reuse keep-alive connections to the origin so most requests skip the TCP and TLS handshakes entirely',
      'Add CF-Connecting-IP (the real client address), X-Forwarded-For, CF-IPCountry, and CF-Ray for tracing',
      'Re-encrypt to the origin according to the configured SSL mode, validating the origin certificate under Full (Strict)',
      'Apply origin timeouts and produce the 5xx family the edge owns: 521 origin down, 522 connection timed out, 524 origin took too long',
      'Collapse simultaneous misses so one origin fetch serves many waiting clients',
      'Optionally route over an optimised backbone path (Argo) rather than the public internet'
    ],
    commands: [
      { cmd: 'curl -sI https://api.shop.dev/products | grep -i cf-ray', note: 'the CF-Ray id is your join key between edge logs and origin logs — log it on both sides' },
      { cmd: "ss -tanp 'dst 198.51.100.10' | head", note: 'on the origin: count established edge connections and confirm keep-alive reuse' },
      { cmd: 'curl -s https://api.cloudflare.com/client/v4/ips | jq -r ".result.ipv4_cidrs[]"', note: 'the allowlist your origin firewall should enforce so nobody bypasses the edge' },
      { cmd: 'cloudflared tunnel run my-tunnel', note: 'outbound-only origin connectivity; no inbound port, no public IP' }
    ],
    production: 'If you do not restrict the origin to Cloudflare IP ranges (or, better, use a Tunnel with mTLS), an attacker who learns 198.51.100.10 goes straight around the WAF and the DDoS protection. Historic DNS records are the usual leak. On the application side, remember that req.ip is now the edge — configure the real-IP module (nginx set_real_ip_from, Express trust proxy) from CF-Connecting-IP or your rate limits will bucket the entire internet into a handful of edge addresses.',
    interview: [
      'What does a Cloudflare 522 mean, and where would you look first?',
      'How does the origin recover the real client IP, and why is trusting X-Forwarded-For blindly dangerous?',
      'Why does connection reuse between edge and origin matter more than it does for browsers?'
    ],
    sources: ['Cloudflare origin/HTTP headers docs', 'RFC 7239 (Forwarded)', 'RFC 9110 §7.6.3', 'nginx ngx_http_realip_module'],
    related: ['cfcache', 'cftls', 'lb', 'proxy']
  },
  lb: {
    name: 'Load Balancer',
    tagline: 'Spreading connections across backends and noticing when one of them dies',
    description: 'The load balancer sits in front of the origin fleet and distributes incoming connections. At L4 it forwards TCP flows without reading them; at L7 it terminates HTTP and can route by path, header, or cookie. The difference decides what it can do and what it costs.',
    history: 'It began as hardware: F5 shipped BIG-IP in 1997, Cisco LocalDirector before it, and a load balancer was a five-figure appliance in a rack. Wensong Zhang started the Linux Virtual Server project in 1998, putting IPVS in the kernel and the same function on commodity hardware for free. Consistent hashing came from Karger et al. at MIT in 1997 (the paper that also seeded Akamai), and Google published Maglev at NSDI 2016, describing a software load balancer that forwards millions of packets per second per machine using consistent hashing plus connection tracking.',
    purpose: 'Turn a pool of interchangeable, individually unreliable servers into one address that stays up.',
    responsibilities: [
      'Pick a backend per algorithm: round robin, least connections, weighted, or consistent hash on a key',
      'Run active health checks and eject failing backends — plus passive checks that count real request failures',
      'Drain connections gracefully on deploy: stop new flows, let in-flight requests finish, then remove the node',
      'Rewrite or preserve the client address (SNAT versus proxy protocol versus X-Forwarded-For)',
      'Terminate or pass through TLS depending on whether L7 routing is needed',
      'Distribute state-free at L4 via ECMP + consistent hashing so any LB node can handle any flow'
    ],
    commands: [
      { cmd: 'ipvsadm -Ln --stats', note: 'the classic Linux L4 view: virtual services, real servers, active connections' },
      { cmd: 'curl -s http://127.0.0.1:8404/stats;csv | cut -d, -f1,2,18', note: 'HAProxy stats socket: backend, server, status (UP/DOWN)' },
      { cmd: "watch -n1 'ss -tan state established | grep :3000 | wc -l'", note: 'per-backend connection count while you drain a node' },
      { cmd: 'nginx -T | grep -A5 upstream', note: 'dump the effective upstream block including weights and max_fails' }
    ],
    production: 'Least-connections beats round robin whenever request durations vary, which is always. Health checks must exercise a real dependency-aware endpoint — a /healthz that returns 200 while the database is unreachable keeps a broken node in rotation. And connection draining is what makes deploys invisible: without it, every rollout returns a burst of 502s to real users.',
    interview: [
      'When would you choose L4 over L7 load balancing?',
      'Why does consistent hashing matter when the backend count changes?',
      'Design a zero-downtime deploy: what must the load balancer, the app, and the orchestrator each do?',
      'What is the difference between a liveness and a readiness check?'
    ],
    sources: ['Maglev: A Fast and Reliable Software Network Load Balancer (NSDI 2016)', 'linuxvirtualserver.org', 'HAProxy configuration manual', 'Karger et al., Consistent Hashing (STOC 1997)'],
    related: ['proxy', 'originpull', 'tcp', 'conntrack']
  },
  proxy: {
    name: 'Reverse Proxy (nginx)',
    tagline: 'The front door of the origin: terminates the connection, then speaks to your app in private',
    description: 'nginx accepts the connection on 443, terminates TLS, and proxies the request upstream to the container on 172.17.0.2:3000. It buffers slow clients, sets forwarding headers, serves static files, and shields a single-threaded Node process from the open internet.',
    history: "Igor Sysoev began writing nginx in 2002 at Rambler and released it publicly on 4 October 2004, aimed squarely at the C10K problem Dan Kegel had articulated in 1999: Apache's process-per-connection model collapsed at ten thousand concurrent connections, so nginx used an event loop and a handful of workers instead. It now fronts a large share of the web's busiest sites. Caddy (Matt Holt, 2015) took the next step and made HTTPS automatic — it obtains and renews certificates via ACME with no configuration, which is why the Island Tours production stack uses it in place of nginx.",
    purpose: 'Concentrate connection handling, TLS, buffering, and routing in one hardened process so application code never touches a raw socket from the internet.',
    responsibilities: [
      'Terminate TLS and speak HTTP/2 (and HTTP/3 with QUIC) to clients while using plain HTTP/1.1 upstream',
      'proxy_pass to the upstream, with keepalive connections held open to avoid per-request handshakes',
      'Set X-Forwarded-For, X-Forwarded-Proto, and X-Real-IP so the app can reconstruct the original request',
      'Buffer request and response bodies so a slow client never occupies an application worker (proxy_buffering on)',
      'Serve static assets, apply gzip/brotli, and enforce rate limits (limit_req) before the app is involved',
      'Reload configuration without dropping connections (nginx -s reload forks new workers, drains the old)'
    ],
    commands: [
      { cmd: 'nginx -t && nginx -s reload', note: 'validate config, then reload with zero dropped connections — never restart in production' },
      { cmd: 'nginx -T | less', note: 'dump the fully resolved configuration with every include expanded' },
      { cmd: 'tail -f /var/log/nginx/access.log | grep -v " 200 "', note: 'the fastest first look during an incident: everything that is not a success' },
      { cmd: 'caddy run --config Caddyfile', note: 'the production-mode alternative — automatic HTTPS via ACME, no certificate management at all' }
    ],
    production: "The 502 you will debug most often is upstream connection refused: the app crashed, or it bound 127.0.0.1 inside a container and nginx is dialling the bridge address. proxy_read_timeout defaults to 60s, so a slow endpoint returns 504 to the user while the app keeps working obliviously. Set worker_processes auto, raise worker_connections, and always terminate TLS here rather than in Node — OpenSSL in C beats a JS event loop doing crypto.",
    interview: [
      'What problem was nginx built to solve, and how does its architecture differ from Apache prefork?',
      'Why put a reverse proxy in front of Node at all, when Node can serve HTTP itself?',
      'What does proxy_buffering do, and when would you deliberately turn it off?',
      'Trace the difference between a 502 and a 504 from nginx.'
    ],
    sources: ['nginx.org/en/docs', 'kegel.com/c10k.html', 'ngx_http_proxy_module documentation', 'caddyserver.com/docs/automatic-https'],
    related: ['lb', 'dnat', 'appserver', 'originpull']
  },
  dnat: {
    name: 'Destination NAT (Docker Port Publish)',
    tagline: '-p 443:3000 is not magic — it is one iptables rule and a conntrack entry',
    description: "Publishing a container port installs a DNAT rule in the nat table: packets arriving for the host's port 443 have their destination address rewritten to 172.17.0.2:3000 before routing. Conntrack remembers the translation so the reply is un-rewritten automatically on the way out.",
    history: 'NAT was standardised in RFC 1631 (1994) as a stopgap for IPv4 exhaustion and never left. Linux got connection-tracking NAT with the netfilter rewrite in kernel 2.4 (2001), replacing ipchains masquerading. Docker adopted it directly in 2013: every published port becomes a rule in the DOCKER chain, plus a userland docker-proxy process to handle the cases raw netfilter cannot cover (notably loopback and hairpin traffic on some kernels).',
    purpose: 'Let a process inside an isolated network namespace be reachable at an address on the host, without the process knowing anything about it.',
    responsibilities: [
      'Rewrite destination IP and port in the nat table PREROUTING hook, in the DOCKER chain',
      'Handle host-local traffic through the OUTPUT hook so 127.0.0.1:443 works too',
      'MASQUERADE outbound container traffic in POSTROUTING so replies come back to the host address',
      'Record the original and translated tuples in conntrack so every subsequent packet of the flow is translated consistently',
      'Reverse the translation on the return path without any explicit rule — conntrack does it in NAT',
      'Insert accept rules into the DOCKER filter chain so forwarded traffic is not dropped'
    ],
    commands: [
      { cmd: 'iptables -t nat -L DOCKER -n -v --line-numbers', note: 'the actual DNAT rules created by every -p flag you have ever typed' },
      { cmd: 'conntrack -L -d 172.17.0.2 -p tcp', note: 'live NAT translations: original tuple, reply tuple, and state' },
      { cmd: 'iptables -t nat -L POSTROUTING -n -v', note: 'the MASQUERADE rule for 172.17.0.0/16 that lets containers reach the internet' },
      { cmd: 'ps aux | grep docker-proxy', note: 'one userland proxy process per published port — the part everyone forgets exists' }
    ],
    production: 'When a published port suddenly stops working after a firewall reload, the answer is nearly always that something flushed the DOCKER chains; restart the daemon to reinstall them. Watch nf_conntrack_count against nf_conntrack_max — a busy host that fills the table starts dropping new connections with "nf_conntrack: table full" in dmesg, and every symptom looks like a network problem. For high-throughput hosts, consider host networking or a CNI plugin that avoids per-packet NAT entirely.',
    interview: [
      'How does the reply packet from a container find its way back to the original client?',
      'Why does docker-proxy exist if iptables already does the DNAT?',
      'What happens when the conntrack table fills up, and how would you detect it?',
      'Explain the packet path through netfilter hooks for a published container port.'
    ],
    sources: ['RFC 1631', 'man 8 iptables-extensions', 'net/netfilter/nf_nat_core.c', 'Docker: container networking overview'],
    related: ['iptables', 'conntrack', 'bridge', 'netfilter']
  },
  bridge: {
    name: 'docker0 Bridge',
    tagline: 'A software Ethernet switch living in your kernel, at 172.17.0.1',
    description: 'docker0 is a Linux bridge: a virtual L2 switch. Container veth ends are enslaved to it, it learns MAC addresses into a forwarding database exactly like a physical switch, and it carries the gateway address 172.17.0.1 that every container uses as its default route.',
    history: 'The Linux bridge module dates to the 2.2/2.4 era, written to make a PC behave as an IEEE 802.1D transparent bridge, complete with spanning tree. It found its real calling in virtualisation, connecting VM taps and later container veths. Docker created docker0 by default from its very first release in 2013; the brctl tool from bridge-utils is long deprecated in favour of iproute2, and modern clusters often replace the whole arrangement with Open vSwitch or an eBPF datapath such as Cilium.',
    purpose: 'Give containers on a host a shared layer-2 segment and a gateway, so they can talk to each other and reach the outside world through routing and NAT.',
    responsibilities: [
      'Learn source MAC addresses per port into the forwarding database, and flood unknown unicast',
      'Forward frames between enslaved veth interfaces at layer 2, with no routing involved',
      'Hold the gateway IP 172.17.0.1 so containers can route off-segment via the host',
      'Hand out addresses from 172.17.0.0/16 via the Docker daemon IPAM (not DHCP)',
      'Pass forwarded traffic through the FORWARD chain when bridge-nf-call-iptables is set',
      'Isolate user-defined networks from the default bridge, which also gives them embedded DNS'
    ],
    commands: [
      { cmd: 'ip -d link show docker0 && ip addr show docker0', note: 'confirm it is a bridge and see the 172.17.0.1/16 gateway address' },
      { cmd: 'bridge link show', note: 'the modern replacement for brctl show — which veths are enslaved right now' },
      { cmd: 'bridge fdb show br docker0', note: 'the MAC learning table; this is the CAM table of your software switch' },
      { cmd: 'sysctl net.ipv4.ip_forward net.bridge.bridge-nf-call-iptables', note: 'the two sysctls that decide whether container traffic routes and whether iptables sees it' }
    ],
    production: 'The default bridge network gives you no service discovery — that is why you create a user-defined network, where the embedded DNS resolves container names. Also beware the address range: 172.17.0.0/16 collides with plenty of corporate VPNs, and the symptom is a container that cannot reach an internal service for no visible reason. Set default-address-pools in /etc/docker/daemon.json before that happens, not after.',
    interview: [
      'What is the difference between a Linux bridge and a router, in one sentence?',
      'How do two containers on the same user-defined network resolve each other by name?',
      'Why does net.ipv4.ip_forward have to be 1 for container egress to work?'
    ],
    sources: ['net/bridge/br_forward.c', 'man 8 bridge', 'IEEE 802.1D', 'Docker: bridge network driver docs'],
    related: ['veth', 'cnetns', 'dnat', 'switch']
  },
  veth: {
    name: 'veth Pair',
    tagline: 'A virtual patch cable: two interfaces, one wire, opposite ends of a namespace boundary',
    description: 'A veth pair is two network interfaces created together where every frame written to one is instantly received by the other. Docker puts one end inside the container namespace as eth0 and enslaves the other end to docker0, so the container appears plugged into the bridge.',
    history: 'The veth driver was merged in Linux 2.6.24 (January 2008), the same release cycle that brought network namespaces — they were designed as a matched pair, since a namespace with no way to reach anything is not very useful. Every container runtime since has used the same construction, and the naming you see on the host (vethXXXXXX@if12) encodes the peer interface index inside the other namespace.',
    purpose: 'Connect two network namespaces with what behaves, to both sides, like an ordinary Ethernet link.',
    responsibilities: [
      'Deliver every frame transmitted on one end to the peer end, in software, with no wire involved',
      'Carry a MAC address and a full set of interface statistics on each end, like a real NIC',
      'Survive being moved into another namespace by ip link set ... netns, keeping the peer link intact',
      'Go DOWN on both ends when either side goes down, so link state is meaningful',
      'Support MTU configuration, offloads, and tc qdiscs exactly like physical interfaces'
    ],
    commands: [
      { cmd: 'ip link add veth0 type veth peer name veth1', note: 'create a pair by hand — the primitive every container runtime calls' },
      { cmd: "ip -d link show type veth | grep -E 'veth|link-netns'", note: 'list veths and which namespace each peer lives in' },
      { cmd: "docker exec -it api ip link show eth0 | head -1", note: 'the container side; the @ifN suffix names the host-side peer index' },
      { cmd: 'ethtool -S veth1234 | head', note: 'per-end packet counters — useful for proving traffic actually crosses the pair' }
    ],
    production: 'veth pairs are cheap but not free: every packet crosses the kernel network stack twice, and at high packet rates that shows up as softirq CPU. Latency-sensitive workloads use host networking, SR-IOV, or an eBPF datapath that short-circuits the bridge. Also check MTU: if the host uses jumbo frames or sits behind a tunnel (VXLAN, WireGuard) and the veth stays at 1500, you get the classic "small requests work, large responses hang" black-hole.',
    interview: [
      'How does a packet get from inside a container to the physical NIC? Name every hop.',
      'What does the @if12 suffix on a host veth interface mean?',
      'Why can an MTU mismatch cause failures that only affect large payloads?'
    ],
    sources: ['man 4 veth', 'drivers/net/veth.c', 'Linux 2.6.24 changelog', 'man 8 ip-link'],
    related: ['bridge', 'cnetns', 'netns', 'nic']
  },
  cnetns: {
    name: 'Container Network Namespace',
    tagline: 'A private copy of the entire network stack, and the reason localhost means something different in here',
    description: 'The container runs in its own network namespace: its own interfaces, routing table, ARP cache, conntrack, iptables rules, and port space. Binding 0.0.0.0:3000 inside it is invisible from the host until a veth, a bridge, and a DNAT rule connect the two worlds.',
    history: 'Network namespaces landed in Linux 2.6.24 (2008) via CLONE_NEWNET, the last of the original namespace family to arrive and the most intricate, because the network stack has so much global state. Together with cgroups (2007) they are the entirety of what "a container" is — there is no container object in the kernel. The CNI specification (2015, CoreOS, now a CNCF project) standardised how runtimes ask a plugin to wire a namespace up, which is why Kubernetes can swap Flannel for Calico for Cilium without the kubelet knowing.',
    purpose: 'Give each container a completely independent network stack so port numbers, routes, and firewall rules cannot collide between workloads on one host.',
    responsibilities: [
      'Own a private set of interfaces: lo plus whatever veth or macvlan is moved in',
      'Own a private routing table — typically default via 172.17.0.1 and nothing else',
      'Own private netfilter tables, conntrack entries, and socket/port space',
      'Persist as long as a process or a bind mount references it (/proc/PID/ns/net)',
      'Be joinable by other processes via setns(2), which is exactly what docker exec does',
      'Be shareable: Kubernetes pods put every container in one namespace, so sidecars share localhost'
    ],
    commands: [
      { cmd: 'docker inspect -f "{{.State.Pid}}" api', note: 'get the PID whose /proc/PID/ns/net is the container namespace' },
      { cmd: 'nsenter -t $(docker inspect -f "{{.State.Pid}}" api) -n ss -tlnp', note: 'run ss inside the container namespace using host binaries — invaluable on distroless images' },
      { cmd: 'ls -l /proc/1/ns/net /proc/self/ns/net', note: 'compare inode numbers; different inode means different namespace' },
      { cmd: 'ip netns list', note: 'lists named namespaces — Docker deliberately does not register there, which is why this is often empty' }
    ],
    production: 'Half of all container networking confusion is one fact: 127.0.0.1 inside the container is not the host. An app that binds 127.0.0.1:3000 is unreachable no matter how many ports you publish — it must bind 0.0.0.0. For debugging distroless or scratch images with no shell tools, nsenter -n from the host (or docker run --network container:target) gets you tcpdump and ss inside the right namespace without rebuilding the image.',
    interview: [
      'What actually is a container, in kernel terms?',
      'Why can two containers both bind port 3000 on the same host?',
      'How do containers in the same Kubernetes pod talk to each other, and why is that fast?',
      'How would you tcpdump inside a container that has no tcpdump binary?'
    ],
    sources: ['man 7 network_namespaces', 'man 2 setns', 'man 1 nsenter', 'CNI specification (github.com/containernetworking/cni)'],
    related: ['netns', 'veth', 'bridge', 'process']
  },
  appserver: {
    name: 'Node HTTP Server',
    tagline: 'One thread, one event loop, and a hand-written C parser turning bytes into request objects',
    description: 'Inside the container, Node holds a listening socket on 0.0.0.0:3000. When the proxied connection arrives, libuv reports readability, the llhttp parser incrementally decodes the request line and headers, and Node emits a "request" event carrying IncomingMessage and ServerResponse objects.',
    history: 'Ryan Dahl presented Node.js at JSConf EU in November 2009, arguing that the industry had it backwards: blocking I/O with thread pools was the wrong default for network servers. The HTTP parser was originally http_parser, extracted from nginx-inspired C code; Fedor Indutny replaced it with llhttp in 2019 (default from Node 12), generating the parser from TypeScript into C for roughly a 2x speedup and far better maintainability.',
    purpose: 'Accept connections and turn a byte stream into JavaScript request/response objects, without blocking the single thread that serves every other connection.',
    responsibilities: [
      'bind() and listen() on port 3000, then register the listening fd with the event loop',
      'accept() new connections and allocate a socket object plus a parser instance per connection',
      'Feed inbound bytes to llhttp incrementally, emitting headers before the body has arrived',
      'Manage keep-alive: reuse the connection for the next request, subject to keepAliveTimeout (5s by default)',
      'Enforce protection limits: headersTimeout, requestTimeout, and maxHeaderSize (16KB) against slowloris-style abuse',
      'Stream the response back, honouring backpressure when the socket buffer is full'
    ],
    commands: [
      { cmd: 'ss -tlnp | grep 3000', note: 'confirm the process is listening on 0.0.0.0 and not 127.0.0.1 — the number one container bug' },
      { cmd: 'node --trace-event-categories node.perf,v8 server.js', note: 'trace events you can load into chrome://tracing to see request handling' },
      { cmd: 'NODE_DEBUG=http node server.js', note: 'built-in HTTP-layer logging: parser state, keep-alive decisions, socket reuse' },
      { cmd: 'autocannon -c 100 -d 20 http://localhost:3000/products', note: 'load test from the same box to find the ceiling before the network is involved' }
    ],
    production: 'Node is single-threaded per process, so one CPU-bound handler (a big JSON.stringify, a synchronous crypto call) stalls every concurrent request. Run one process per core with the cluster module or your orchestrator, keep keepAliveTimeout above your load balancer\'s idle timeout to avoid races that surface as sporadic 502s, and watch event-loop lag as your primary saturation metric — it degrades long before CPU hits 100%.',
    interview: [
      'What happens if a request handler runs a 200ms synchronous loop?',
      'Why must Node keepAliveTimeout exceed the upstream load balancer idle timeout?',
      'How does Node parse a request whose headers arrive across three TCP segments?',
      'Explain backpressure when writing a large response to a slow client.'
    ],
    sources: ['nodejs.org/api/http.html', 'github.com/nodejs/llhttp', 'lib/_http_server.js', 'JSConf EU 2009: Ryan Dahl, "Node.js"'],
    related: ['nodejs', 'libuv', 'middleware', 'socketobj']
  },
  middleware: {
    name: 'Middleware Pipeline',
    tagline: 'A chain of functions, each holding the request hostage until it calls next()',
    description: 'Before a controller sees the request it passes through a pipeline: logging, CORS, security headers, body parsing, compression, authentication. Each middleware receives (req, res, next) and either responds or passes control down the chain. In NestJS this Express chain is followed by guards, interceptors, and pipes.',
    history: 'TJ Holowaychuk released Express in 2010 on top of Connect, borrowing the middleware idea from Ruby\'s Rack (2007) and Python\'s WSGI (PEP 333, 2003). The pattern is really just function composition with an escape hatch, and it turned out to be the most copied design in server-side JavaScript. NestJS layers a more structured pipeline on top — middleware, then guards, then interceptors, then pipes, then handler, then interceptors again on the way out — because raw middleware ordering becomes unmanageable in a large codebase.',
    purpose: 'Factor cross-cutting concerns out of business logic into an ordered, composable chain that every request traverses.',
    responsibilities: [
      'Run in strict registration order — the entire semantics of the pipeline is the order you registered things',
      'Parse the body (express.json) so req.body exists by the time a controller runs',
      'Apply CORS and security headers (helmet sets HSTS, X-Content-Type-Options, CSP)',
      'Authenticate and attach an identity to the request object for downstream code',
      'Short-circuit: respond directly for a 401 or a cache hit and never call next()',
      'Wrap the response: timing, request ids, and error translation on the way back out'
    ],
    commands: [
      { cmd: 'DEBUG=express:router,express:application node dist/main.js', note: 'log every layer as the router builds and dispatches through it' },
      { cmd: 'curl -sI -X OPTIONS https://api.shop.dev/products -H "Origin: https://shop.dev" -H "Access-Control-Request-Method: GET"', note: 'the CORS preflight — this never reaches your controller' },
      { cmd: 'curl -sI https://api.shop.dev/products | grep -iE "strict-transport|x-content-type|content-security"', note: 'verify helmet is actually mounted before the router' },
      { cmd: 'npx clinic doctor -- node dist/main.js', note: 'find the middleware that is eating your event loop' }
    ],
    production: 'Order bugs dominate: mount helmet and CORS before the router or they never run; mount the body parser before anything that reads req.body; mount the error handler last or Express will not recognise it (four arguments, not three). A middleware that forgets to call next() and never responds produces a request that simply hangs until the client times out — and it shows up in no error log anywhere.',
    interview: [
      'What is the exact NestJS request lifecycle order: middleware, guards, interceptors, pipes?',
      'Why does an Express error handler take four parameters?',
      'A request hangs with no error and no log line. What are the likely middleware causes?',
      'Where would you attach a request id so it appears in every downstream log?'
    ],
    sources: ['expressjs.com/en/guide/using-middleware.html', 'docs.nestjs.com/middleware', 'docs.nestjs.com/faq/request-lifecycle', 'PEP 333 (WSGI)'],
    related: ['appserver', 'controller', 'service', 'proxy']
  },
  controller: {
    name: 'NestJS Controller',
    tagline: 'Where a URL finally becomes a method call',
    description: 'The controller maps HTTP to code. @Controller("products") plus @Get() binds GET /products to a method, ValidationPipe coerces and checks the query DTO ({ limit: 20 }), and the returned value is serialised to JSON automatically. The controller should contain routing concerns and nothing else.',
    history: 'Kamil Mysliwiec released NestJS in 2017, importing Angular\'s architecture — decorators, modules, dependency injection — into the Node backend world at a moment when Express apps were structurally identical and structurally unmaintainable. The decorators are metadata: reflect-metadata (a TC39 proposal implementation) stores route paths and parameter types on the class, and Nest reads them at bootstrap to build the router. Underneath it is still Express (or Fastify, via a swappable adapter).',
    purpose: 'Translate between the HTTP transport and the application layer: bind routes, validate input, shape output, and delegate everything else.',
    responsibilities: [
      'Declare routes with decorators; Nest builds the underlying router table once at bootstrap, not per request',
      'Extract and type request data: @Query, @Param, @Body, @Headers, @Req',
      'Validate and transform DTOs through ValidationPipe with class-validator and class-transformer',
      'Call injected services and return a value or a Promise — Nest handles serialisation and status codes',
      'Map domain errors to HTTP via exception filters and HttpException subclasses',
      'Stay thin: no SQL, no business rules, nothing that would be awkward to unit test without HTTP'
    ],
    commands: [
      { cmd: 'nest generate resource products', note: 'scaffold controller, service, module, and DTOs with the CLI' },
      { cmd: 'curl -s "https://api.shop.dev/products?limit=abc" | jq', note: 'watch ValidationPipe reject a non-numeric limit with a structured 400' },
      { cmd: 'curl -s "https://api.shop.dev/products?limit=20" -w "\\n%{time_total}s\\n"', note: 'the happy path, with total wall time' },
      { cmd: 'npx nest start --debug --watch', note: 'run with the inspector so you can breakpoint inside the handler' }
    ],
    production: 'Enable a global ValidationPipe with whitelist: true and forbidNonWhitelisted: true — otherwise unexpected properties flow into your DTOs and eventually into a query. Always cap pagination server-side (take: 20, hard max 100); a client that sends limit=100000 will otherwise happily ask PostgreSQL for the whole table. Use versioned routes from day one, because removing a field from a response is a breaking change you cannot take back.',
    interview: [
      'How does NestJS know which method handles GET /products? What happens at bootstrap versus per request?',
      'What is the difference between a pipe, a guard, and an interceptor?',
      'Why should controllers not contain business logic — what does that buy you concretely?'
    ],
    sources: ['docs.nestjs.com/controllers', 'docs.nestjs.com/pipes', 'github.com/nestjs/nest', 'reflect-metadata (rbuckton)'],
    related: ['middleware', 'service', 'appserver', 'prisma']
  },
  service: {
    name: 'Service / Provider',
    tagline: 'The business logic, injected rather than imported, and testable without an HTTP request',
    description: 'ProductsService is an @Injectable() class holding the actual logic: what a product listing means, which filters apply, how results are shaped. It receives PrismaService through constructor injection and knows nothing about HTTP, status codes, or headers.',
    history: 'Dependency injection as a discipline comes from Martin Fowler\'s 2004 article and the Spring framework (Rod Johnson, 2003), which made it mainstream in Java. Angular brought the pattern to the frontend, and NestJS carried it into Node in 2017. The mechanism is a container that reads constructor parameter types via reflect-metadata, resolves each token from the module graph, and instantiates a singleton per module scope at bootstrap.',
    purpose: 'Hold domain logic in a unit that can be constructed, replaced, and tested independently of the transport that invoked it.',
    responsibilities: [
      'Encapsulate business rules: eligibility, pricing, filtering, orchestration across repositories',
      'Receive collaborators through the constructor so tests can pass fakes without monkey-patching modules',
      'Live as a singleton by default (DEFAULT scope); REQUEST scope exists but forces a new instance per request and costs real performance',
      'Be exported by its module for other modules to import — the visibility rules are the architecture',
      'Throw domain errors that an exception filter maps to HTTP, rather than returning status codes',
      'Own transaction boundaries when several repository calls must succeed or fail together'
    ],
    commands: [
      { cmd: 'nest generate service products', note: 'scaffold an @Injectable provider wired into the module' },
      { cmd: 'npx jest products.service.spec.ts', note: 'unit test with a mocked Prisma client — no HTTP, no database, milliseconds' },
      { cmd: 'node -e "require(\'reflect-metadata\'); console.log(Reflect.getMetadata)"', note: 'the reflection API the DI container is built on' },
      { cmd: 'npx madge --circular src/', note: 'find circular imports — the usual cause of an "undefined provider" at bootstrap' }
    ],
    production: 'Circular dependencies between providers are the classic NestJS bootstrap failure; forwardRef() makes them work but is a design smell worth fixing. Prefer DEFAULT scope everywhere: a single REQUEST-scoped provider makes its entire injection chain request-scoped, which quietly turns singleton construction into per-request construction. Keep services free of HTTP types so the same logic can be reused by a CLI job or a queue consumer.',
    interview: [
      'How does the Nest DI container resolve a constructor parameter to a provider instance?',
      'What breaks when you make one provider REQUEST-scoped?',
      'How do you unit test a service that depends on Prisma without touching a database?',
      'Where do you put a transaction boundary spanning two repository calls?'
    ],
    sources: ['docs.nestjs.com/providers', 'docs.nestjs.com/fundamentals/injection-scopes', 'Fowler, "Inversion of Control Containers and the Dependency Injection Pattern" (2004)'],
    related: ['controller', 'prisma', 'middleware', 'pool']
  },
  prisma: {
    name: 'Prisma ORM',
    tagline: 'Type-safe queries generated from your schema — and a query engine that owns the connection pool',
    description: 'prisma.product.findMany({ take: 20 }) is not a thin wrapper around SQL. Prisma Client is generated TypeScript, the query engine turns the call into parameterised SQL, and it manages the connection pool itself — which is why pool tuning happens in the datasource URL, not in your code.',
    history: 'Prisma began as Graphcool, a GraphQL backend-as-a-service founded by Johannes Schickling and Soren Bramer Schmidt; it pivoted into Prisma 1 in 2018 and was rewritten as Prisma 2 (GA in 2021) around a Rust query engine loaded into the Node process as a Node-API library. Prisma 5 introduced driver adapters, letting the client use a JS driver directly, and the queryCompiler work has been moving the engine out of Rust and into TypeScript so the client can run in edge runtimes with no native binary at all.',
    purpose: 'Give application code a typed, schema-driven interface to the database while generating correct, parameterised SQL and managing connections.',
    responsibilities: [
      'Generate a typed client from schema.prisma so a typo in a field name fails at compile time',
      'Translate findMany/findUnique/create into parameterised SQL — never string concatenation, so injection is structurally impossible',
      'Own the connection pool: connection_limit (default num_cpus * 2 + 1), pool_timeout (10s), connect_timeout (5s)',
      'Load relations in one round trip with include/select, instead of the N+1 loop a naive loader produces',
      'Run migrations as versioned SQL files via prisma migrate dev / deploy',
      'Expose interactive transactions ($transaction) and raw escape hatches ($queryRaw) when the query builder is not enough'
    ],
    commands: [
      { cmd: 'npx prisma studio', note: 'browse and edit the database through the generated schema' },
      { cmd: 'DEBUG="prisma:query" node dist/main.js', note: 'log every SQL statement the engine emits — the fastest way to catch an N+1' },
      { cmd: 'npx prisma migrate dev --name add_tours', note: 'generate and apply a migration, then regenerate the client' },
      { cmd: 'npx prisma validate && npx prisma format', note: 'check and normalise schema.prisma before it reaches CI' }
    ],
    production: 'Set connection_limit explicitly in DATABASE_URL — the default is derived from CPU count on the machine the client runs on, which is meaningless when you run twelve pods against one Postgres. Behind PgBouncer in transaction mode add ?pgbouncer=true so the engine stops using named prepared statements. And watch for P2024 ("Timed out fetching a new connection from the connection pool"): it almost never means the database is slow, it means your pool is too small or a transaction is being held open across an await of something else.',
    interview: [
      'How does Prisma avoid SQL injection, structurally rather than by escaping?',
      'What is the N+1 problem and how does include change the generated SQL?',
      'Where does the Prisma connection pool live, and what happens when it is exhausted?',
      'When would you drop to $queryRaw, and what do you give up?'
    ],
    sources: ['prisma.io/docs/orm/prisma-client', 'prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections', 'github.com/prisma/prisma', 'prisma.io/docs/orm/more/internals/engines'],
    related: ['service', 'pool', 'postgres', 'planner']
  },
  pool: {
    name: 'Connection Pool',
    tagline: 'Because opening a PostgreSQL connection costs a fork, a handshake, and about a millisecond you do not have',
    description: 'The pool keeps a fixed set of established, authenticated PostgreSQL connections and lends them out per query. Without it, every request would pay a TCP handshake, a TLS handshake, SCRAM authentication, and a process fork on the server — for a query that takes 200 microseconds.',
    history: 'Connection pooling arrived with the first application servers and was codified for Java in JDBC 2.0 (1999) and JNDI DataSources. PostgreSQL made it especially necessary because of its process-per-connection architecture: each connection is a forked backend process with its own memory, so a thousand idle connections is a thousand processes. PgBouncer (Skype, 2007) answered that with an external pooler in a single event-driven process, and remains the standard answer; Odyssey and pgcat are the modern multithreaded alternatives.',
    purpose: 'Amortise connection setup cost across many requests and cap concurrent database connections at a number the server can actually serve.',
    responsibilities: [
      'Maintain N warm connections, handing one to each query and returning it immediately after',
      'Queue callers when all connections are busy, and time out rather than queue forever',
      'Validate and recycle connections: drop ones killed by the server, respect max lifetime',
      'Bound total load: pool_size is really a concurrency limit on the database, not just an optimisation',
      'Keep transactions on one connection for their whole lifetime — a transaction pins a connection',
      'Report saturation: waiting count, wait time, and in-use count are the metrics that matter'
    ],
    commands: [
      { cmd: "psql -h 10.0.0.12 -c \"select count(*), state from pg_stat_activity group by state\"", note: 'how many connections exist, and how many are idle in transaction (the dangerous state)' },
      { cmd: 'psql -h 10.0.0.12 -c "show max_connections"', note: 'the ceiling all your pools must collectively respect' },
      { cmd: 'psql -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS"', note: 'PgBouncer client/server connection counts and how many clients are waiting' },
      { cmd: 'psql -p 6432 -U pgbouncer pgbouncer -c "SHOW STATS"', note: 'requests per second and average query time through the pooler' }
    ],
    production: 'Do the arithmetic before the incident: pods x pool_size must stay below max_connections minus superuser_reserved_connections. Twelve pods with a default pool of 17 is 204 connections against a default max_connections of 100 — the thirteenth pod simply cannot connect. Pool exhaustion presents as request latency climbing while database CPU sits idle, which sends people to the wrong dashboard every time. PgBouncer transaction mode multiplexes far better than session mode but forbids session state — no SET, no LISTEN, no session-level advisory locks, and prepared statements need explicit support.',
    interview: [
      'Why is pooling more critical for PostgreSQL than for MySQL?',
      'Explain PgBouncer session mode versus transaction mode, and what breaks in each.',
      'Latency is up, database CPU is flat, queries are fast in isolation. What do you check?',
      'Why does a long-running transaction hurt far more than a long-running query?'
    ],
    sources: ['pgbouncer.org/config.html', 'postgresql.org/docs/current/runtime-config-connection.html', 'wiki.postgresql.org/wiki/Number_Of_Database_Connections'],
    related: ['prisma', 'postgres', 'service', 'tcp']
  },
  postgres: {
    name: 'PostgreSQL Server',
    tagline: 'A postmaster, one forked process per connection, and forty years of correctness',
    description: 'The postmaster listens on 5432 and forks a dedicated backend process for each connection. That backend parses the SQL, plans it, executes it against shared buffers, and streams results back over the wire protocol — while MVCC lets it do so without blocking concurrent writers.',
    history: 'Michael Stonebraker started POSTGRES at UC Berkeley in 1986 as the successor to Ingres, exploring object-relational types and rules; it had its own query language, QUEL then POSTQUEL. In 1994 Andrew Yu and Jolly Chen replaced POSTQUEL with SQL to create Postgres95, and in 1996 the project was renamed PostgreSQL and handed to a global volunteer development group. Stonebraker won the Turing Award in 2014. The process-per-connection model is still there in PostgreSQL 16 and 17 — a deliberate choice that trades memory for crash isolation.',
    purpose: 'Store and query relational data with full ACID guarantees, serving many concurrent sessions without readers and writers blocking each other.',
    responsibilities: [
      'Listen on 5432, authenticate per pg_hba.conf (SCRAM-SHA-256), and fork a backend per connection',
      'Speak the frontend/backend wire protocol: Parse, Bind, Execute, DataRow, ReadyForQuery',
      'Implement MVCC — every row version carries xmin/xmax, so readers never block writers',
      'Enforce constraints, isolation levels, and durability via WAL',
      'Run background workers: autovacuum to reclaim dead tuples, checkpointer, WAL writer, bgwriter, stats collector',
      'Assign transaction ids and manage snapshot visibility for every running statement'
    ],
    commands: [
      { cmd: 'psql -h 10.0.0.12 -U app -c "select pid, state, wait_event_type, query from pg_stat_activity where state <> \'idle\'"', note: 'what the server is doing right now — the first query of every incident' },
      { cmd: 'psql -c "select * from pg_stat_statements order by total_exec_time desc limit 10"', note: 'the ten queries actually consuming your database (requires the extension)' },
      { cmd: 'ps -ef | grep postgres', note: 'see the postmaster and one backend process per connection, literally' },
      { cmd: 'psql -c "select relname, n_dead_tup, last_autovacuum from pg_stat_user_tables order by n_dead_tup desc limit 5"', note: 'dead tuple bloat and whether autovacuum is keeping up' }
    ],
    production: 'Process-per-connection is why you must pool: each backend costs several megabytes of private memory plus a fork. Watch for idle in transaction sessions — they hold snapshots that block autovacuum and cause table bloat, and they are usually an application that opened a transaction and then awaited an HTTP call. Set idle_in_transaction_session_timeout. Monitor transaction id age; wraparound protection kicking in during peak traffic is a genuinely bad day.',
    interview: [
      'Explain MVCC and why readers do not block writers in PostgreSQL.',
      'Why does PostgreSQL fork a process per connection instead of using threads?',
      'What is idle in transaction and why is it more dangerous than a slow query?',
      'What does autovacuum actually do, and what happens if it falls behind?'
    ],
    sources: ['postgresql.org/docs/current/', 'src/backend/postmaster/postmaster.c', 'The POSTGRES Next-Generation DBMS (Stonebraker & Rowe, 1986)', 'postgresql.org/docs/current/protocol.html'],
    related: ['planner', 'executor', 'sharedbuf', 'wal', 'pool']
  },
  planner: {
    name: 'Query Planner',
    tagline: 'A cost model, a pile of statistics, and a search for the cheapest way to answer your question',
    description: 'The planner takes the parsed and rewritten query and enumerates execution strategies — sequential scan versus index scan, nested loop versus hash join, which table to drive from — assigns each an estimated cost from table statistics, and picks the cheapest. It is guessing, well, from samples.',
    history: 'Cost-based optimisation was invented for System R at IBM Almaden in the late 1970s (Selinger et al., 1979), and every relational optimiser since is a descendant. PostgreSQL implements dynamic-programming join enumeration for small queries and switches to a genetic algorithm (GEQO) above geqo_threshold, which defaults to 12 relations, because the search space becomes factorial. Extended statistics (CREATE STATISTICS, PostgreSQL 10) were added because the planner\'s independence assumption between columns is often badly wrong.',
    purpose: 'Choose an execution plan whose real cost is close to optimal, using estimates cheap enough to compute in a millisecond.',
    responsibilities: [
      'Estimate selectivity for every predicate from pg_statistic: histograms, most-common-values, n_distinct, null fraction',
      'Cost each access path with the tunable constants seq_page_cost (1.0), random_page_cost (4.0), cpu_tuple_cost (0.01)',
      'Enumerate join orders and join methods, pruning by cost as it goes',
      'Decide whether the query is worth parallel workers, and how many',
      'Use effective_cache_size as its belief about how much of the table the OS is probably caching',
      'Cache generic plans for prepared statements, and choose between generic and custom plans per execution'
    ],
    commands: [
      { cmd: 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM products ORDER BY created_at DESC LIMIT 20;', note: 'estimated versus actual rows, plus real buffer hits — the single most useful database command there is' },
      { cmd: 'ANALYZE products;', note: 'refresh statistics; a plan that went bad overnight is usually stale stats after a bulk load' },
      { cmd: "SELECT attname, n_distinct, correlation FROM pg_stats WHERE tablename = 'products';", note: 'what the planner actually believes about your columns' },
      { cmd: 'SET enable_seqscan = off; EXPLAIN SELECT ...;', note: 'a diagnostic, never a fix — it reveals the cost the planner assigned to the alternative' }
    ],
    production: 'The number to stare at in EXPLAIN ANALYZE is estimated rows versus actual rows. An order of magnitude apart means the plan below that node is built on a lie, and the fix is statistics (ANALYZE, raise default_statistics_target, add CREATE STATISTICS for correlated columns), not a hint — PostgreSQL deliberately has no hints. On SSD or NVMe, lower random_page_cost from 4.0 to about 1.1: the default encodes 1990s spinning-disk physics and keeps the planner irrationally afraid of index scans.',
    interview: [
      'When is a sequential scan faster than an index scan, and roughly where is the crossover?',
      'Why does EXPLAIN ANALYZE cost more than EXPLAIN, and when is that dangerous?',
      'The plan flipped after a data load and got 50x slower. Diagnose it.',
      'Why does PostgreSQL not support query hints, and what do you do instead?'
    ],
    sources: ['postgresql.org/docs/current/planner-optimizer.html', 'src/backend/optimizer/README', 'Selinger et al., "Access Path Selection in a Relational DBMS" (SIGMOD 1979)', 'postgresql.org/docs/current/using-explain.html'],
    related: ['executor', 'postgres', 'sharedbuf', 'disk']
  },
  executor: {
    name: 'Query Executor',
    tagline: 'A tree of iterators, each politely asking its children for one more tuple',
    description: 'The executor walks the plan tree pulling tuples. Each node implements the same interface — give me your next row — so a Limit asks a Sort, which asks a Hash Join, which asks an Index Scan, all the way down to the heap. Nothing is materialised that does not have to be.',
    history: 'This is the Volcano model, from Goetz Graefe\'s Volcano query evaluation system (1990/1994), and it is the reason plans compose so cleanly: every operator is a black box with open/next/close. Its weakness is one function call per tuple per node, which is why PostgreSQL added LLVM-based JIT expression compilation in version 11 (2018) and why columnar analytics engines abandoned the model for vectorised batches. For OLTP queries returning 20 rows, the overhead is irrelevant.',
    purpose: 'Execute the chosen plan, producing result tuples with the least materialisation and the least memory possible.',
    responsibilities: [
      'Drive the plan tree through ExecProcNode, pulling tuples on demand from the root downward',
      'Implement scan nodes: Seq Scan, Index Scan, Index Only Scan (heap-free when the visibility map allows), Bitmap Heap Scan',
      'Implement join nodes: Nested Loop for small outer sides, Hash Join for equijoins, Merge Join for pre-sorted inputs',
      'Implement blocking nodes that must consume everything first: Sort, Hash, Aggregate, Materialize',
      'Spill to disk when a Sort or Hash exceeds work_mem, which turns a fast node into a slow one silently',
      'Coordinate parallel workers under a Gather node and merge their outputs',
      'Check MVCC visibility for every tuple against the statement snapshot'
    ],
    commands: [
      { cmd: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = 7 LIMIT 20;', note: 'actual time and loops per node — loops x time is the real cost of an inner node' },
      { cmd: "EXPLAIN (ANALYZE) SELECT * FROM orders ORDER BY total DESC;", note: 'look for "Sort Method: external merge Disk: 42MB" — that is work_mem being exceeded' },
      { cmd: 'SET work_mem = "64MB";', note: 'per-node, per-worker memory; multiply by concurrency before you raise it globally' },
      { cmd: "SELECT * FROM pg_stat_activity WHERE wait_event_type IS NOT NULL;", note: 'what executing backends are blocked on right now' }
    ],
    production: 'Read EXPLAIN ANALYZE inner nodes carefully: "actual time=0.02..0.03 rows=1 loops=48000" is not fast, it is 48,000 executions and the real culprit. Sort Method: external merge means the node spilled to disk and work_mem is too low for that query — but work_mem is allocated per node per parallel worker, so raising it globally can exhaust host memory. Index Only Scans depend on the visibility map being current, which means they depend on vacuum.',
    interview: [
      'Explain the Volcano iterator model and one concrete weakness of it.',
      'When does the planner pick a Nested Loop over a Hash Join?',
      'What does "loops=48000" in EXPLAIN ANALYZE tell you?',
      'Why can an Index Only Scan still hit the heap?'
    ],
    sources: ['src/backend/executor/execMain.c', 'Graefe, "Volcano — An Extensible and Parallel Query Evaluation System" (1994)', 'postgresql.org/docs/current/executor.html', 'use-the-index-luke.com'],
    related: ['planner', 'sharedbuf', 'postgres', 'disk']
  },
  sharedbuf: {
    name: 'Shared Buffers',
    tagline: "PostgreSQL's own page cache — 8KB blocks, a clock sweep, and a fight with the kernel over the same data",
    description: 'shared_buffers is a shared-memory array of 8KB buffers holding recently used table and index pages. Every read goes through it; a hit costs a pin and a memcpy, a miss costs a read from the OS (which may itself be a page-cache hit or real disk I/O).',
    history: 'The design predates the modern kernel page cache, and PostgreSQL kept its own buffer manager for control over eviction, dirty-page ordering, and WAL sequencing. The eviction policy is a clock sweep with a usage counter per buffer (0-5), chosen in the 8.x era over strict LRU because it is nearly as good and needs no list manipulation under a global lock. The default remains a conservative 128MB, a number set by what a modest machine could allocate in shared memory decades ago.',
    purpose: 'Keep hot pages in process-shared memory so the common query never leaves user space, and control exactly when dirty pages reach disk.',
    responsibilities: [
      'Cache 8KB pages of heap and index data in shared memory, addressable by buffer tag',
      'Evict with the clock sweep: decrement usage_count as the hand passes, evict at zero',
      'Track dirty buffers and coordinate with the WAL rule — never write a data page before its WAL record is durable',
      'Pin buffers in use so they cannot be evicted mid-scan, and use per-buffer content locks',
      'Use a ring buffer strategy for large sequential scans so one big query cannot flush the whole cache',
      'Expose contents through pg_buffercache for inspection'
    ],
    commands: [
      { cmd: 'psql -c "show shared_buffers"', note: 'the current size; 128MB is the default and almost always wrong' },
      { cmd: 'psql -c "CREATE EXTENSION IF NOT EXISTS pg_buffercache; SELECT c.relname, count(*) FROM pg_buffercache b JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid) GROUP BY 1 ORDER BY 2 DESC LIMIT 10;"', note: 'which relations are actually resident in the cache' },
      { cmd: 'psql -c "select datname, blks_hit, blks_read, round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2) as hit_pct from pg_stat_database"', note: 'cache hit ratio per database; below ~95% on an OLTP workload deserves attention' },
      { cmd: 'psql -c "CREATE EXTENSION IF NOT EXISTS pg_prewarm; SELECT pg_prewarm(\'products\');"', note: 'warm a table into cache after a restart instead of letting users do it' }
    ],
    production: 'The 25%-of-RAM rule of thumb exists because PostgreSQL deliberately relies on the OS page cache as a second tier — set shared_buffers to 80% and you double-buffer the same pages, waste memory, and lengthen checkpoint write storms. Set effective_cache_size to roughly 50-75% of RAM to tell the planner about that second tier. A high blks_hit ratio can still hide a slow system if the working set has simply grown past both caches, so watch it alongside read I/O.',
    interview: [
      'Why is shared_buffers usually set to only 25% of RAM?',
      'What is double buffering and why does PostgreSQL tolerate it?',
      'Explain the clock-sweep eviction algorithm.',
      'Why does a large sequential scan not evict your entire cache?'
    ],
    sources: ['src/backend/storage/buffer/freelist.c', 'src/backend/storage/buffer/bufmgr.c', 'postgresql.org/docs/current/runtime-config-resource.html', 'pg_buffercache documentation'],
    related: ['postgres', 'executor', 'wal', 'disk']
  },
  wal: {
    name: 'Write-Ahead Log',
    tagline: 'The rule that makes durability possible: log the change before you change the page',
    description: 'Every modification is first described in a WAL record appended to a sequential log and flushed with fsync; only later may the dirty data page be written. If the server dies, replay from the last checkpoint reconstructs everything committed. The same stream feeds replicas.',
    history: 'Write-ahead logging was formalised by C. Mohan and colleagues at IBM in the ARIES paper (1992), which defined the analysis/redo/undo recovery protocol nearly every database still implements. PostgreSQL gained WAL in version 7.1 (2001), replacing full-page syncs at commit and making both crash recovery and point-in-time recovery possible. Streaming replication arrived in 9.0 (2010) with walsender and walreceiver processes, and logical replication (decoding WAL into row-level changes) in 10 (2017).',
    purpose: 'Convert random data-page writes into one sequential, durable log so that a commit is durable after a single fsync, and any crash is recoverable.',
    responsibilities: [
      'Append records describing every change, each tagged with a monotonically increasing LSN',
      'fsync the WAL up to the commit record before acknowledging COMMIT (subject to synchronous_commit)',
      'Write full page images after each checkpoint (full_page_writes) to survive torn 8KB writes on a 4KB-sector device',
      'Drive checkpoints so recovery has a bounded starting point: checkpoint_timeout, max_wal_size',
      'Stream to replicas via walsender, and archive segments for point-in-time recovery',
      'Recycle 16MB segment files in pg_wal rather than constantly creating and deleting them'
    ],
    commands: [
      { cmd: 'psql -c "select pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn())"', note: 'current write position and the segment file it lives in' },
      { cmd: 'psql -c "select client_addr, state, sent_lsn, replay_lsn, pg_wal_lsn_diff(sent_lsn, replay_lsn) as lag_bytes from pg_stat_replication"', note: 'replication lag in bytes — the number to alert on' },
      { cmd: 'psql -c "select checkpoints_timed, checkpoints_req, buffers_checkpoint from pg_stat_bgwriter"', note: 'requested checkpoints far exceeding timed ones means max_wal_size is too small' },
      { cmd: 'pg_waldump -p /var/lib/postgresql/16/main/pg_wal 000000010000000000000042 | head', note: 'decode actual WAL records — resource manager, LSN, and affected block' }
    ],
    production: 'synchronous_commit = off makes writes dramatically faster and risks losing the last fraction of a second of committed transactions on a crash — a legitimate trade for analytics ingestion, never for payments. Keep max_wal_size generous so checkpoints are timed rather than requested; a requested-checkpoint storm produces exactly the periodic latency spikes people blame on the network. Never delete files from pg_wal by hand: unbounded growth means a stalled archive_command or an abandoned replication slot, and that is what you fix.',
    interview: [
      'State the write-ahead logging rule precisely.',
      'What is a torn page and how does full_page_writes prevent the resulting corruption?',
      'What are you actually risking with synchronous_commit = off?',
      'pg_wal is growing without bound and the disk is filling. Name the three usual causes.'
    ],
    sources: ['postgresql.org/docs/current/wal-intro.html', 'src/backend/access/transam/xlog.c', 'Mohan et al., "ARIES" (ACM TODS, 1992)', 'postgresql.org/docs/current/runtime-config-wal.html'],
    related: ['postgres', 'sharedbuf', 'disk', 'executor']
  },
  disk: {
    name: 'Storage',
    tagline: 'Where the bytes finally stop moving — and where fsync either tells the truth or does not',
    description: 'Under the buffer manager and the WAL is a block device. PostgreSQL reads and writes 8KB pages through the filesystem, and its durability guarantee reduces entirely to whether fsync() returns only after the data is genuinely on stable media.',
    history: 'For thirty years database design was shaped by one number: a 7200 RPM disk needs about 8-10ms to seek, giving roughly 100-200 random IOPS, while sequential reads ran at 100MB/s or more. That 1000:1 ratio is why WAL is sequential, why B-trees have huge fan-out, and why random_page_cost defaults to 4x seq_page_cost. NVMe SSDs collapsed the gap: sub-100 microsecond latency and hundreds of thousands of IOPS, with random access within a small constant factor of sequential. Most database tuning defaults have still not caught up.',
    purpose: 'Provide durable, addressable block storage — the only layer in the stack that survives losing power.',
    responsibilities: [
      'Serve 8KB page reads and writes through the filesystem and block layer',
      'Honour fsync/fdatasync by flushing the device write cache, not merely the OS page cache',
      'Provide the OS page cache as a second caching tier beneath shared_buffers',
      'Reorder and merge I/O in the block layer scheduler (mq-deadline, none for NVMe)',
      'Expose queue depth and service time, which is what actually saturates under load',
      'Preserve write ordering guarantees the database depends on for crash recovery'
    ],
    commands: [
      { cmd: 'iostat -x 1', note: 'r_await/w_await are service time in ms and aqu-sz is queue depth; %util is misleading on NVMe' },
      { cmd: 'pg_test_fsync', note: "ships with PostgreSQL; measures how many fsyncs per second your storage really does — run it before trusting any cloud volume" },
      { cmd: 'fio --name=randread --ioengine=libaio --direct=1 --bs=8k --iodepth=32 --rw=randread --size=1G --runtime=30', note: '8KB random read IOPS at the exact block size PostgreSQL uses' },
      { cmd: 'biolatency-bpfcc 5', note: 'BPF histogram of block I/O latency — shows the tail that averages hide' }
    ],
    production: "Verify durability, do not assume it: consumer SSDs and some virtualised volumes have lied about flushing write caches for years, and PostgreSQL's guarantees are void if fsync is a no-op. Put pg_wal on storage that can sustain your commit rate (historically a separate device; on NVMe usually unnecessary). In the cloud, remember that IOPS are provisioned and burst credits run out — a database that mysteriously slows down at the same time each week is usually a credit balance hitting zero, not a query regression.",
    interview: [
      'Why is sequential I/O still faster than random I/O on NVMe, and by how much?',
      'What exactly does fsync() guarantee, and what can silently break that guarantee?',
      'Why is PostgreSQL page size 8KB when the filesystem block is 4KB, and what does that imply for atomicity?',
      'How would you tell a slow query apart from a saturated disk using iostat and pg_stat_activity?'
    ],
    sources: ['man 2 fsync', 'postgresql.org/docs/current/wal-reliability.html', 'man 1 iostat', 'fio documentation', 'lwn.net: "PostgreSQL fsync() surprise" (2018)'],
    related: ['wal', 'sharedbuf', 'postgres', 'planner']
  }
};
