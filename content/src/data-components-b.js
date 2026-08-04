// Packet Odyssey — component encyclopedia part B (window.COMPONENTS_B):
// kernel network stack, driver/IRQ path, hardware, LAN, ISP, and the global Internet.
window.COMPONENTS_B = {
  tcp: {
    name: 'TCP Stack',
    tagline: 'Reliable, ordered byte streams conjured out of an unreliable datagram network',
    description: "The Transmission Control Protocol turns IP's best-effort, unordered, duplicating, lossy datagram service into a bidirectional byte stream that either arrives intact and in order or fails loudly. In Linux it is roughly 25,000 lines under net/ipv4/ — a state machine (tcp_input.c), a transmit engine (tcp_output.c), a retransmit timer wheel (tcp_timer.c), and a pluggable congestion control framework (tcp_cong.c).",
    history: "Vint Cerf and Bob Kahn published \"A Protocol for Packet Network Intercommunication\" in May 1974; RFC 675 (December 1974) specified the original monolithic Transmission Control Program. In 1978 the design was split — the unreliable, routable half became IP, the reliable half stayed TCP — producing the layering we still use. RFC 793 (1981) was the standard for four decades. The October 1986 congestion collapse, when the NSFNET link between LBL and UC Berkeley fell from 32 kbit/s to 40 bit/s, drove Van Jacobson to invent slow start, congestion avoidance, and RTT-based RTO (SIGCOMM 1988). RFC 9293 (August 2022) finally obsoleted RFC 793 and rolled forty years of errata into one document.",
    purpose: 'Give applications the illusion of a private, ordered, flow-controlled pipe while quietly negotiating for bandwidth against every other flow on the planet.',
    responsibilities: [
      'Connection lifecycle: the 11-state machine from CLOSED through SYN_SENT, ESTABLISHED, FIN_WAIT_1/2, TIME_WAIT',
      'Segmentation: slice the send buffer into MSS-sized skbs (or hand a 64 KB super-packet to TSO and let the NIC do it)',
      'Reliability: sequence numbers, cumulative + selective ACKs (SACK, RFC 2018), RTO with exponential backoff, fast retransmit on 3 dup ACKs',
      'Flow control: the receive window, window scaling (RFC 7323), and auto-tuning of the receive buffer',
      'Congestion control: cwnd, slow start, CUBIC by default since 2.6.19; BBR, Reno, and DCTCP are loadable modules',
      'Checksumming and, increasingly, delegating that checksum to the NIC'
    ],
    commands: [
      { cmd: 'ss -tin', note: 'per-socket internals: cwnd, ssthresh, rtt/rttvar, retransmits, pacing rate, bytes_acked — the single best TCP debugging command' },
      { cmd: 'sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem net.ipv4.tcp_congestion_control', note: 'min/default/max autotuning buffers and the active CC algorithm' },
      { cmd: 'nstat -az | grep -E "TcpRetransSegs|TcpExtTCPLostRetransmit|TcpExtTCPTimeouts"', note: 'retransmit and timeout counters — the honest measure of a lossy path' },
      { cmd: 'tcpdump -ni eth0 "tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0"', note: 'watch only the interesting flags: setup, teardown, and rude teardown' }
    ],
    production: "Tune tcp_rmem/tcp_wmem maxima to at least the bandwidth-delay product before blaming the network for slow transfers across an ocean. Switch to BBR (net.ipv4.tcp_congestion_control=bbr, with fq as the qdisc) when loss-based CUBIC is collapsing on lossy or deeply buffered paths. Watch for TIME_WAIT exhaustion on load balancers — the answer is tcp_tw_reuse and more ephemeral ports, never the folklore tcp_tw_recycle, which was removed in 4.12 because it broke NAT clients.",
    interview: [
      'Why does TIME_WAIT last 2×MSL, and what actually breaks if you skip it?',
      'A transfer between two 10 Gbit/s hosts 100 ms apart tops out at 30 Mbit/s. What is your first hypothesis? (Receive window vs BDP.)',
      'Explain the difference between flow control and congestion control — which one protects the receiver and which protects the network?',
      'How do CUBIC and BBR reach fundamentally different conclusions about the same bottleneck link?'
    ],
    sources: ['net/ipv4/tcp_output.c', 'net/ipv4/tcp_input.c', 'net/ipv4/tcp_cong.c', 'RFC 9293', 'RFC 5681', 'man 7 tcp'],
    related: ['socketobj', 'ip', 'qdisc', 'socketlayer']
  },
  udp: {
    name: 'UDP',
    tagline: 'A thin envelope over IP: two ports, a length, a checksum, and absolutely no promises',
    description: "The User Datagram Protocol adds exactly eight bytes to IP — source port, destination port, length, checksum — and nothing else. No handshake, no ordering, no retransmission, no congestion control. In Linux, net/ipv4/udp.c is a fraction of the size of the TCP code, and that austerity is the point: it is the substrate on which DNS, QUIC, DHCP, VXLAN, and every real-time protocol build exactly the reliability they want and no more.",
    history: 'David Reed specified UDP in RFC 768 (August 1980), a two-page document that has never been revised, because there is almost nothing in it to revise. It was created precisely because TCP was too opinionated for query/response and real-time traffic. Its second life began in 2012 when Google built QUIC on top of it — TCP had become unevolvable because middleboxes inspect it, so the industry rebuilt reliable transport inside UDP payloads, standardized as RFC 9000 in 2021.',
    purpose: 'Deliver a datagram to a port on a host with the least possible machinery, leaving reliability policy entirely to the application.',
    responsibilities: [
      'Multiplex datagrams to sockets by (src IP, src port, dst IP, dst port) — connected sockets, or by dst port alone for unconnected ones',
      'Preserve message boundaries: one sendto() equals one recvfrom(), unlike TCP byte streams',
      'Compute and verify a checksum (optional in IPv4, mandatory in IPv6)',
      'Drop silently on receive-buffer overflow and increment InErrors/RcvbufErrors rather than back-pressure the sender',
      'Fragment via IP when the datagram exceeds the path MTU — a classic source of mysterious DNS failures'
    ],
    commands: [
      { cmd: 'ss -uanp', note: 'list UDP sockets with owning process; Recv-Q here is unread bytes queued in the kernel' },
      { cmd: 'netstat -su | grep -E "receive buffer errors|packet receive errors"', note: 'the counter that proves your DNS server is dropping queries under load' },
      { cmd: 'tcpdump -ni any udp port 53 -vv', note: 'watch DNS queries and responses, including truncation (TC) flags that force a TCP retry' },
      { cmd: 'sysctl net.core.rmem_max net.ipv4.udp_mem', note: 'raise these before a high-rate UDP receiver, since UDP has no window to slow the sender down' }
    ],
    production: 'UDP receivers fail by dropping, not by slowing down, so RcvbufErrors is the metric that matters — fix it with a larger SO_RCVBUF (bounded by net.core.rmem_max) and by draining the socket on a dedicated thread. Keep DNS responses under the path MTU or expect PMTU black holes; and remember that UDP-based QUIC traffic is often rate-limited or blocked by naive corporate firewalls, so always keep a TCP fallback.',
    interview: [
      'Why did QUIC choose UDP instead of a new IP protocol number or extending TCP?',
      'What exactly happens when a UDP receive buffer fills up, and how would you detect it in production?',
      'Why is the UDP checksum optional in IPv4 but mandatory in IPv6?'
    ],
    sources: ['net/ipv4/udp.c', 'RFC 768', 'RFC 9000', 'man 7 udp'],
    related: ['ip', 'socketobj', 'socketlayer', 'stubresolver']
  },
  ip: {
    name: 'IP Layer',
    tagline: 'Best-effort delivery to an address anywhere on Earth — no promises, no memory, no apologies',
    description: 'The Internet Protocol prepends a 20-byte header (source, destination, TTL, protocol, total length, fragmentation fields, header checksum) and hands the packet to the routing decision. It is stateless and unreliable by deliberate design: any router may drop, delay, duplicate, or reorder a packet, and IP will never notice. On Linux the transmit path is ip_queue_xmit() → __ip_local_out() → ip_output() → ip_finish_output(); receive is ip_rcv() → ip_rcv_finish() → ip_local_deliver() or ip_forward().',
    history: 'IP was carved out of the original Transmission Control Program in 1978 when Cerf, Postel, and Danny Cohen argued that voice traffic needed delivery without retransmission. Jon Postel edited RFC 791 in September 1981, and version 4 of that design — IPv4 — still carries the majority of the traffic on Earth four decades later. The flag day when ARPANET switched from NCP to TCP/IP was 1 January 1983. IPv6 (RFC 2460, 1998; now RFC 8200, 2017) removed router fragmentation and the header checksum after both proved to be mistakes.',
    purpose: 'Provide a single global addressing and forwarding abstraction so that any host can name any other host without knowing anything about the link technologies in between.',
    responsibilities: [
      'Build the header: version/IHL, DSCP+ECN, total length, identification, flags/fragment offset, TTL, protocol, header checksum',
      'Choose a source address and consult the routing table for the next hop and output device',
      'Decrement TTL on forward and generate ICMP Time Exceeded at zero — the mechanism traceroute exploits',
      'Fragment when the packet exceeds the outgoing MTU and the DF bit is clear; reassemble at the destination only',
      'Demultiplex on receive by the protocol field: 1 ICMP, 6 TCP, 17 UDP, 47 GRE, 132 SCTP',
      'Feed netfilter at the PRE_ROUTING, LOCAL_IN, FORWARD, LOCAL_OUT, and POST_ROUTING hooks'
    ],
    commands: [
      { cmd: 'ip -s -d addr show', note: 'addresses, flags, MTU, and per-interface counters in one view' },
      { cmd: 'ping -M do -s 1472 1.1.1.1', note: 'set DF and a 1472-byte payload: 1472 + 8 ICMP + 20 IP = 1500, so this probes the real path MTU' },
      { cmd: 'tracepath api.shop.dev', note: 'traceroute plus PMTU discovery, using the TTL-expiry ICMP mechanism' },
      { cmd: 'nstat -az | grep -E "IpInHdrErrors|IpReasmFails|IpFragCreates"', note: 'header errors and fragmentation reassembly failures, usually the tell for a broken tunnel MTU' }
    ],
    production: 'Almost every "works locally, hangs in the tunnel" bug is a path MTU problem: VXLAN, WireGuard, IPsec, and PPPoE all steal header bytes, and if ICMP Fragmentation Needed is filtered you get a black hole instead of an error. Clamp MSS on the edge router (TCPMSS --clamp-mss-to-pmtu), and never block ICMP type 3 code 4 wholesale.',
    interview: [
      'Why did IPv6 remove both the header checksum and router-side fragmentation?',
      'A TLS handshake completes but large responses hang forever. What is your first suspicion? (PMTU black hole.)',
      'What does the TTL field actually protect against, and why does traceroute work at all?'
    ],
    sources: ['net/ipv4/ip_output.c', 'net/ipv4/ip_input.c', 'net/ipv4/ip_fragment.c', 'RFC 791', 'RFC 8200'],
    related: ['tcp', 'routing', 'netfilter', 'arp']
  },
  routing: {
    name: 'Routing / FIB',
    tagline: 'One question per packet: given this destination, which device and which next hop?',
    description: "The forwarding information base answers longest-prefix-match lookups. Linux stores IPv4 routes in an LC-trie (net/ipv4/fib_trie.c, contributed by Robert Olsson in 2005 to replace the old fib_hash), fronted by a per-CPU route cache decision in ip_route_output_key(). Policy routing sits above it: fib_rules lets you select an entirely different routing table based on source address, fwmark, or interface — the basis of multi-homing, VPN split tunnels, and every container network you have ever debugged.",
    history: 'Longest-prefix match became the rule when CIDR (RFC 1518/1519, 1993) abolished classful addressing to slow the growth of the global routing table. RFC 1812, "Requirements for IP Version 4 Routers" (1995), codified how a conforming router must behave. Linux inherited BSD-style routing early, gained policy routing and multiple tables in 2.2 (Alexey Kuznetsov), and swapped fib_hash for the LC-trie in 2.6.13 when routers with hundreds of thousands of prefixes stopped being exotic.',
    purpose: 'Reduce the entire Internet to a small ordered table of prefixes so that each packet costs one bounded lookup rather than a search.',
    responsibilities: [
      'Longest-prefix match: 104.18.32.7 matches 0.0.0.0/0 only if nothing more specific exists',
      'Resolve the nexthop: on-link (use ARP/NDP for the destination itself) or via a gateway',
      'Select the source address when the application did not bind one',
      'Apply policy rules in priority order (ip rule) before consulting a table',
      'Spread flows across equal-cost paths via ECMP, hashing on the 5-tuple so a flow never reorders',
      'Enforce reverse-path filtering (rp_filter, RFC 3704) to drop spoofed sources'
    ],
    commands: [
      { cmd: 'ip route get 104.18.32.7', note: 'ask the kernel exactly what it would do with one packet — source IP, device, gateway, and cached MTU' },
      { cmd: 'ip route show table all | head -40', note: 'every table including local and main; the local table is why 127.0.0.1 never leaves the box' },
      { cmd: 'ip rule show', note: 'policy rules in priority order; container and VPN breakage usually lives here' },
      { cmd: 'ip -6 route get 2606:4700::6812:2007', note: 'the IPv6 equivalent — dual-stack hosts have two entirely separate FIBs' }
    ],
    production: "\"ip route get\" settles arguments faster than any packet capture: it tells you the exact source address, device, and gateway the kernel will use. On multi-homed hosts, asymmetric routing plus rp_filter=1 silently drops return traffic — set rp_filter=2 (loose) or add proper policy rules. And remember the default route is not magic: it is simply the shortest prefix, /0, and it loses to anything more specific.",
    interview: [
      'How does longest-prefix match resolve a tie between 10.0.0.0/8 and 10.1.0.0/16?',
      'A host with two NICs can be pinged on one interface but not the other. What do you check first?',
      'What is the difference between the main, local, and default routing tables in Linux?'
    ],
    sources: ['net/ipv4/route.c', 'net/ipv4/fib_trie.c', 'net/core/fib_rules.c', 'RFC 1812', 'RFC 4632', 'man 8 ip-route'],
    related: ['ip', 'arp', 'netns', 'homerouter']
  },
  arp: {
    name: 'ARP / Neighbour Table',
    tagline: 'The last translation before the wire: IP address in, MAC address out',
    description: "Address Resolution Protocol maps an on-link IPv4 address to its Ethernet MAC by broadcasting \"who has 192.168.1.1? tell 192.168.1.23\" and caching the reply. Linux implements it in the generic neighbour subsystem (net/core/neighbour.c) with a per-entry state machine: INCOMPLETE, REACHABLE, STALE, DELAY, PROBE, FAILED. STALE is not an error — it means the kernel will use the cached MAC and revalidate lazily on the next use.",
    history: 'David C. Plummer wrote RFC 826 in November 1982, at MIT, in about four pages. It has never been substantially revised and remains one of the shortest load-bearing documents on the Internet. Its great weakness — no authentication whatsoever — was intentional in a world of trusted university LANs and is now the basis of every ARP spoofing attack. IPv6 replaced it with Neighbor Discovery over ICMPv6 (RFC 4861), which is multicast rather than broadcast and can be secured with SEND.',
    purpose: 'Bridge layer 3 addressing to layer 2 addressing so an Ethernet frame can actually be addressed to the correct physical port.',
    responsibilities: [
      'Broadcast ARP requests to ff:ff:ff:ff:ff:ff and cache unicast replies',
      'Run the neighbour state machine: revalidate STALE entries, probe before declaring FAILED',
      'Queue the pending packet while resolution is in flight and transmit it once the MAC arrives',
      'Handle gratuitous ARP: an unsolicited announcement used by failover VIPs and clustering software to steal an address instantly',
      'Garbage-collect entries against gc_thresh1/2/3 to bound memory on large L2 segments',
      'Answer for other hosts when proxy ARP is enabled — useful and dangerous in equal measure'
    ],
    commands: [
      { cmd: 'ip neigh show', note: 'the neighbour table with per-entry state; REACHABLE, STALE, and FAILED all mean different things' },
      { cmd: 'ip neigh flush dev eth0', note: 'force re-resolution — the first thing to try after a gateway hardware swap' },
      { cmd: 'arping -c 3 -I eth0 192.168.1.1', note: 'probe at layer 2 only, bypassing IP routing entirely' },
      { cmd: 'tcpdump -ni eth0 arp', note: 'watch resolution and duplicate-address complaints in real time' }
    ],
    production: 'On large flat L2 segments, raise net.ipv4.neigh.default.gc_thresh1/2/3 or you will see "neighbour table overflow" in dmesg and random connectivity loss. Duplicate IPs announce themselves as flapping ARP entries. In clusters, gratuitous ARP is how a floating VIP moves in under a second — and how a misconfigured second node black-holes your traffic.',
    interview: [
      'Why is a STALE ARP entry not a problem?',
      'What is gratuitous ARP used for, and how does it enable both failover and attacks?',
      'Why does IPv6 use multicast Neighbor Solicitation instead of broadcast ARP?'
    ],
    sources: ['net/ipv4/arp.c', 'net/core/neighbour.c', 'RFC 826', 'RFC 4861', 'man 8 ip-neighbour'],
    related: ['ip', 'ethframe', 'switch', 'routing']
  },
  netns: {
    name: 'Network Namespace',
    tagline: 'A complete, private copy of the network stack — the primitive every container stands on',
    description: 'A network namespace gives a set of processes their own interfaces, routing tables, ARP tables, netfilter rules, conntrack table, and socket port space. Two namespaces can both bind port 80 without conflict because they are, from the kernel down, different networks. In C it is struct net; in practice it is what makes a Kubernetes pod feel like a small machine with its own eth0.',
    history: 'Network namespaces merged in Linux 2.6.24 (January 2008), the work of Eric Biederman, Pavel Emelyanov, Daniel Lezcano and others, as part of the long containerization effort that also produced PID, mount, UTS, IPC, and user namespaces. setns(2) arrived in 3.0 (2011), letting a process join an existing namespace — the mechanism behind "docker exec" and "kubectl exec". Everything Docker, LXC, and Kubernetes do to the network is built on this one primitive plus veth pairs and bridges.',
    purpose: 'Isolate the network stack so that untrusted or merely independent workloads can each own a full addressing and firewall configuration on one kernel.',
    responsibilities: [
      'Own an independent set of net_devices — a fresh namespace has only a down loopback',
      'Own independent routing tables, rules, and neighbour caches',
      'Own an independent netfilter/nftables ruleset and conntrack table',
      'Own an independent socket port space, so port collisions across containers become impossible',
      'Be entered by setns(2)/CLONE_NEWNET and referenced through /proc/PID/ns/net',
      'Persist without a process when bind-mounted into /var/run/netns (what ip netns add does)'
    ],
    commands: [
      { cmd: 'ip netns add blue && ip netns exec blue ip link set lo up', note: 'create a namespace and bring up its loopback — nothing works until you do' },
      { cmd: 'ip netns exec blue ss -tlnp', note: 'run any tool inside another network stack; the process is normal, only its network view changed' },
      { cmd: 'readlink /proc/$$/ns/net', note: 'the inode number identifying your current namespace — compare it against a container PID to prove they differ' },
      { cmd: 'nsenter -t $(docker inspect -f "{{.State.Pid}}" api) -n ip addr', note: 'inspect a container network without installing a single tool inside the container' }
    ],
    production: 'Docker hides its namespaces from "ip netns list" because it does not bind-mount them into /var/run/netns — use nsenter with the container PID instead. Namespaces are cheap but not free: each carries its own conntrack table and per-CPU statistics, and thousands of them make "ss" and netlink dumps genuinely slow. A leaked namespace usually means a leaked veth and a leaked IP allocation.',
    interview: [
      'How can two containers both listen on port 8080 on the same host?',
      'What is the difference between a network namespace and a VLAN or a VRF?',
      'How would you capture packets inside a container that has no tcpdump installed?'
    ],
    sources: ['net/core/net_namespace.c', 'man 7 network_namespaces', 'man 2 setns', 'man 8 ip-netns'],
    related: ['veth', 'bridge', 'cnetns', 'routing']
  },
  netfilter: {
    name: 'Netfilter Hooks',
    tagline: 'Five points in the packet path where the kernel stops and asks permission',
    description: 'Netfilter is the packet-mangling framework inside the Linux network stack: five hook points (NF_INET_PRE_ROUTING, LOCAL_IN, FORWARD, LOCAL_OUT, POST_ROUTING) where registered callbacks may return ACCEPT, DROP, QUEUE, or STOLEN. iptables, nftables, conntrack, NAT, and IPVS are all just users of these hooks, ordered by priority in nf_hook_slow().',
    history: "Rusty Russell wrote netfilter and iptables for Linux 2.4, released in January 2001, replacing ipchains (2.2) and ipfwadm (2.0). The design's insight was to separate the hook infrastructure from the policy engine, so new subsystems could plug in without touching the core path. Pablo Neira Ayuso's nftables merged in 3.13 (2014) with a bytecode virtual machine replacing the fixed match/target model; since then iptables is a compatibility shim (iptables-nft) over nftables on most distributions.",
    purpose: 'Give the kernel a stable, ordered set of interception points so filtering, NAT, accounting, and connection tracking can be layered without forking the datapath.',
    responsibilities: [
      'PRE_ROUTING: everything inbound, before the routing decision — where DNAT and conntrack lookup happen',
      'LOCAL_IN: packets destined for this host — the host firewall',
      'FORWARD: packets being routed through this host — the gateway firewall',
      'LOCAL_OUT: locally generated packets, before routing — where OUTPUT rules and output DNAT apply',
      'POST_ROUTING: everything outbound, after routing — where SNAT/MASQUERADE happens',
      'Order callbacks by priority: conntrack (-200) before mangle (-150) before nat (-100) before filter (0)'
    ],
    commands: [
      { cmd: 'nft list ruleset', note: 'the modern, complete view — one syntax for IPv4, IPv6, ARP, and bridge families' },
      { cmd: 'cat /proc/net/netfilter/nf_log', note: 'which logging backend is bound per protocol family' },
      { cmd: 'nft monitor trace', note: 'with a "meta nftrace set 1" rule, watch a single packet traverse every chain and hook' },
      { cmd: 'lsmod | grep -E "^nf_|^xt_|^nft"', note: 'the loaded netfilter modules reveal which features are actually in the path' }
    ],
    production: 'Hook order, not rule order, explains most "my DNAT rule never matched" confusion — DNAT is in PRE_ROUTING, so the routing decision afterwards sees the new destination. Every registered hook costs cycles on every packet: on a busy forwarding box, "conntrack -j NOTRACK" in the raw table for high-volume flows you do not need state for is a real optimization.',
    interview: [
      'Why does DNAT belong in PRE_ROUTING and SNAT in POST_ROUTING?',
      'Which hooks does a forwarded packet traverse, and which does a locally delivered one?',
      'What did nftables change architecturally compared to iptables?'
    ],
    sources: ['net/netfilter/core.c', 'include/uapi/linux/netfilter.h', 'netfilter.org documentation', 'man 8 nft'],
    related: ['iptables', 'conntrack', 'nat', 'ip']
  },
  iptables: {
    name: 'iptables / nftables Rules',
    tagline: 'The policy engine: tables, chains, matches, and one verdict per packet',
    description: 'iptables organizes rules into tables (raw, mangle, nat, filter, security) and chains that attach to netfilter hooks. Each rule is a list of matches — often supplied by xt_ kernel modules like xt_conntrack, xt_tcpudp, xt_multiport — and a target: ACCEPT, DROP, REJECT, LOG, DNAT, SNAT, MASQUERADE, or a jump to a user chain. Traversal is linear per chain, which is why a kube-proxy host with 10,000 services once spent measurable CPU walking rules.',
    history: 'iptables shipped with Linux 2.4 in 2001 as the front end to netfilter, following ipfwadm and ipchains. It accumulated a decade of extensions (ipset, recent, hashlimit, TPROXY) before nftables replaced its kernel model in 3.13. Modern distributions ship iptables-nft, which parses the classic syntax and emits nftables rules; iptables-legacy still exists and mixing the two on one host is a reliable way to lose an afternoon.',
    purpose: 'Express security and address-translation policy as an ordered, auditable ruleset the kernel evaluates on every packet.',
    responsibilities: [
      'Filter: accept, drop, or reject traffic at INPUT, FORWARD, and OUTPUT',
      'NAT: rewrite source or destination addresses and ports at PREROUTING/POSTROUTING/OUTPUT',
      'Mangle: rewrite TOS/DSCP, TTL, and set fwmark for policy routing',
      'Raw: opt packets out of connection tracking with NOTRACK before conntrack runs',
      'Match on state via conntrack: NEW, ESTABLISHED, RELATED, INVALID — the basis of every stateful firewall',
      'Serialize and restore atomically so a ruleset swap is not a window of no firewall'
    ],
    commands: [
      { cmd: 'iptables -L -v -n --line-numbers', note: 'rules with packet/byte counters — a zero counter means the rule never matched, which is usually the bug' },
      { cmd: 'iptables-save > /etc/iptables/rules.v4', note: 'the only sane way to back up, diff, and review a ruleset; restore with iptables-restore' },
      { cmd: 'iptables -t nat -L POSTROUTING -v -n', note: 'inspect MASQUERADE/SNAT rules — where container egress actually gets its source address' },
      { cmd: 'iptables -I INPUT 1 -p tcp --dport 443 -j LOG --log-prefix "HTTPS: "', note: 'insert a temporary logging rule at position 1 to prove traffic is arriving at all' }
    ],
    production: "Always use iptables-restore for atomic ruleset swaps; rule-by-rule editing on a live firewall leaves windows where policy is half-applied. Check whether you are on iptables-nft or iptables-legacy (iptables --version) before debugging \"my rules disappeared\" — Docker, kube-proxy, and firewalld can each be writing through a different backend. And counters are your friend: -v shows exactly which rule the traffic hit.",
    interview: [
      'Explain the difference between DROP and REJECT and when each is appropriate.',
      'In which order are the raw, mangle, nat, and filter tables consulted for an inbound packet?',
      'Why does kube-proxy in iptables mode scale poorly, and what replaced it?'
    ],
    sources: ['net/ipv4/netfilter/ip_tables.c', 'net/netfilter/nf_tables_api.c', 'man 8 iptables', 'man 8 iptables-extensions'],
    related: ['netfilter', 'conntrack', 'nat', 'dnat']
  },
  conntrack: {
    name: 'Connection Tracking',
    tagline: 'The kernel remembers your flows so the firewall can say "yes, I was expecting you"',
    description: "nf_conntrack turns a stateless packet filter into a stateful firewall by recording a tuple per flow — protocol, source, destination, ports — plus a state (NEW, ESTABLISHED, RELATED) and a timeout. It runs at PRE_ROUTING and LOCAL_OUT with priority -200, before everything else, and it is the mandatory foundation for NAT: the reply direction can only be un-translated because conntrack stored the original tuple.",
    history: 'Connection tracking arrived with netfilter in Linux 2.4 (2001) and was one of the reasons iptables displaced ipchains, which could only match packets in isolation. Protocol helpers (FTP, SIP, H.323, TFTP) were added to parse application payloads and open RELATED expectations — an elegant idea that became a security liability, which is why modern kernels require explicit CT target configuration to enable them.',
    purpose: 'Maintain per-flow state so policy can be written in terms of connections rather than packets, and so NAT can reverse its own rewrites.',
    responsibilities: [
      'Create a conntrack entry on the first packet of a flow and confirm it once the packet survives the ruleset',
      'Classify subsequent packets as ESTABLISHED, or as RELATED via helper expectations',
      'Store the original and reply tuples so NAT can rewrite both directions consistently',
      'Age entries out per protocol and state: TCP ESTABLISHED defaults to 432000 seconds (5 days), UDP to 30',
      'Mark unmatched or nonsensical packets INVALID — commonly out-of-window TCP after a conntrack table flush',
      'Export events to userspace via nfnetlink for logging and for stateful failover between firewalls'
    ],
    commands: [
      { cmd: 'conntrack -L -o extended | head', note: 'dump live flows with both tuples, state, and remaining timeout' },
      { cmd: 'conntrack -S', note: 'per-CPU counters: insert_failed, drop, invalid, early_drop — the real health signal' },
      { cmd: 'sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max', note: 'current versus maximum entries; the ratio you should be alerting on' },
      { cmd: 'dmesg -T | grep -i "table full"', note: '"nf_conntrack: table full, dropping packet" is the single most famous message in this subsystem' }
    ],
    production: "Conntrack exhaustion is a classic production outage: the table fills, new connections are dropped, and the symptom looks like random packet loss to every service on the host. Raise nf_conntrack_max and nf_conntrack_buckets together (buckets ~ max/4), shorten nf_conntrack_tcp_timeout_time_wait and _established, and NOTRACK bulk traffic that needs no state. On NAT gateways and Kubernetes nodes, graph nf_conntrack_count/nf_conntrack_max as a first-class SLO metric.",
    interview: [
      'Why does NAT fundamentally require connection tracking?',
      'What happens to existing connections if the conntrack table fills up, and what do you tune first?',
      'What does the INVALID state mean, and why do packets suddenly become INVALID after a firewall reload?'
    ],
    sources: ['net/netfilter/nf_conntrack_core.c', 'net/netfilter/nf_conntrack_proto_tcp.c', 'man 8 conntrack', 'Documentation/networking/nf_conntrack-sysctl.rst'],
    related: ['netfilter', 'iptables', 'nat', 'homerouter']
  },
  qdisc: {
    name: 'Queueing Discipline',
    tagline: 'The last software decision before the wire: who transmits next, and who waits',
    description: 'A qdisc is the packet scheduler attached to a network device. dev_queue_xmit() enqueues an skb into the root qdisc; __qdisc_run() dequeues and calls the driver. The choice of algorithm decides whether a bulk upload destroys your video call: a simple FIFO lets a backup fill a 1000-packet queue and add hundreds of milliseconds of latency to every other flow, while fq_codel keeps latency bounded by dropping from the head of persistently full queues.',
    history: 'Linux traffic control was written by Alexey Kuznetsov in the late 1990s, modelled on the ideas in RFC 2475 differentiated services. pfifo_fast — a three-band priority FIFO — was the default for over a decade. Then Jim Gettys named "bufferbloat" in 2010 after measuring seconds of latency on his home link, and Kathleen Nichols and Van Jacobson published CoDel in ACM Queue in 2012: a controlled-delay AQM with essentially no knobs. fq_codel (RFC 8290) combined it with per-flow fair queueing and became the Linux default via net.core.default_qdisc.',
    purpose: 'Decide transmit order and drop policy so that bandwidth is shared fairly and queueing delay stays bounded, no matter how greedy one flow is.',
    responsibilities: [
      'Enqueue skbs and dequeue them for the driver, honoring device backpressure',
      'Classify traffic into flows or classes (hash-based for fq_codel, filters and classes for HTB)',
      'Apply active queue management: drop or ECN-mark when sojourn time exceeds the target (5 ms default in CoDel)',
      'Shape and police: HTB and TBF enforce rate limits with token buckets',
      'Pace transmissions — fq is the qdisc BBR relies on for smooth, non-bursty sending',
      'Cooperate with BQL, which limits how many bytes may sit in the device ring so the qdisc keeps real control'
    ],
    commands: [
      { cmd: 'tc -s qdisc show dev eth0', note: 'active qdisc with backlog, drops, overlimits, and (for codel) count and lastcount' },
      { cmd: 'tc qdisc replace dev eth0 root fq_codel', note: 'the one-line bufferbloat fix on a device still running pfifo_fast' },
      { cmd: 'sysctl net.core.default_qdisc', note: 'the qdisc every new device gets — set to fq_codel or fq on modern systems' },
      { cmd: 'cat /sys/class/net/eth0/queues/tx-0/byte_queue_limits/limit', note: 'the BQL limit the kernel has auto-tuned for this transmit queue' }
    ],
    production: 'If latency under load is your problem, the qdisc is your lever: fq_codel or CAKE on the egress bottleneck, and shape slightly below the true link rate so the queue forms in your box rather than in the ISP modem you cannot control. For servers running BBR, use fq so pacing works. Watch tc -s for growing "backlog" and non-zero "overlimits" — those are queueing delay you are inflicting on yourself.',
    interview: [
      'What is bufferbloat, and why did adding more buffer memory make networks worse?',
      'Why must you shape below the physical line rate to control latency on a home uplink?',
      'What problem does Byte Queue Limits solve that the qdisc alone cannot?'
    ],
    sources: ['net/sched/sch_generic.c', 'net/sched/sch_fq_codel.c', 'RFC 8290', 'man 8 tc', 'Documentation/networking/byte-queue-limits.rst'],
    related: ['driver', 'ringbuffer', 'ip', 'nic']
  },
  driver: {
    name: 'NIC Driver',
    tagline: 'The translator between kernel abstractions and one specific vendor of silicon',
    description: 'The device driver implements struct net_device_ops: ndo_open, ndo_start_xmit, ndo_stop, ndo_set_rx_mode. On transmit it takes an skb, maps its memory for DMA, writes a descriptor into the TX ring, and rings the doorbell register. On receive it runs the NAPI poll routine, converts completed descriptors back into skbs, and hands them up with napi_gro_receive(). It also owns hardware offload configuration, link state, and the several hundred counters that ethtool -S exposes.',
    history: "Linux network drivers grew from Donald Becker's 1990s collection of ISA and PCI Ethernet drivers, which made Linux viable as a network OS at all. The modern shape — NAPI polling, split TX/RX rings, MSI-X per-queue interrupts, hardware offloads negotiated through ethtool — solidified in the 2.6 era as 1 Gbit/s and then 10 Gbit/s hardware made per-packet interrupts impossible. Today the interesting drivers (ice, mlx5, ena) are as much control-plane firmware negotiators as they are packet movers.",
    purpose: 'Present one uniform net_device interface to the kernel while speaking whatever register-level dialect a particular chip requires.',
    responsibilities: [
      'Probe and initialize the device, allocate TX/RX rings and DMA-coherent memory',
      'ndo_start_xmit: map the skb, build descriptors, update the tail pointer, ring the doorbell',
      'Register a NAPI context and implement the poll() routine that harvests completed RX descriptors',
      'Handle interrupts: acknowledge, disable, and schedule NAPI — never do real work in hard IRQ context',
      'Expose and configure offloads: checksum, TSO/GSO, GRO, RSS hashing, VLAN tagging',
      'Report link state, speed, duplex, and per-queue statistics to ethtool and the kernel'
    ],
    commands: [
      { cmd: 'ethtool -i eth0', note: 'driver name, version, firmware version, and the PCI bus address — the first thing to record in any NIC bug report' },
      { cmd: 'ethtool -S eth0 | grep -vE ": 0$"', note: 'non-zero hardware counters only: rx_missed_errors, rx_no_buffer_count, tx_dropped tell the real story' },
      { cmd: 'ethtool -k eth0', note: 'which offloads are enabled; disabling GRO/TSO is a standard step when debugging strange captures' },
      { cmd: 'dmesg | grep -i -E "eth0|link is|NIC Link"', note: 'link up/down events and driver complaints, with timestamps' }
    ],
    production: 'Firmware and driver version mismatches cause some of the most baffling packet loss in fleets — record ethtool -i output in your inventory. When tcpdump shows impossibly large "packets", that is GRO, not the wire; disable it (ethtool -K eth0 gro off) while capturing. And rx_missed_errors climbing means the host could not drain the ring fast enough: look at CPU affinity and ring size, not the cable.',
    interview: [
      'What does ndo_start_xmit actually do, and why must it not sleep?',
      'Why does tcpdump sometimes show a 30,000-byte TCP segment on a 1500-MTU interface?',
      'How do you tell whether packet loss is happening on the wire, in the NIC, or in the kernel?'
    ],
    sources: ['include/linux/netdevice.h', 'drivers/net/ethernet/intel/', 'net/core/dev.c', 'man 8 ethtool'],
    related: ['ringbuffer', 'napi', 'nic', 'irq']
  },
  ringbuffer: {
    name: 'TX/RX Ring Buffer',
    tagline: 'A circular array of descriptors — the shared vocabulary of CPU and NIC',
    description: 'Each hardware queue is a ring of descriptors in host memory: fixed-size records holding a DMA address, a length, and status/ownership bits. The driver owns the tail pointer, the NIC owns the head; the gap between them is work outstanding. On RX the driver pre-posts empty buffers and the NIC fills them; on TX the driver posts full buffers and the NIC drains them. The ring is not the packet data — it is a table of pointers to packet data.',
    history: 'Descriptor rings replaced programmed I/O and simple FIFO NICs in the early 1990s (DEC Tulip, Intel EtherExpress) once bus-mastering DMA became standard on PCI. The design has survived unchanged in spirit for thirty years and reappears verbatim in virtio-net, in NVMe queues, and in userspace fast paths like DPDK and AF_XDP, because a lock-free single-producer/single-consumer ring is very hard to improve on.',
    purpose: 'Let two independent processors — the CPU and the NIC — exchange work asynchronously without locks, using only ownership bits and cache-line-friendly pointer updates.',
    responsibilities: [
      'Hold descriptors: buffer DMA address, length, and ownership/status flags per slot',
      'Track head and tail so both sides know what is filled, free, or in flight',
      'Absorb bursts: a 1024-entry RX ring buys about 1024 packets of tolerance for scheduling jitter',
      'Signal exhaustion: when no free RX descriptor exists, the NIC drops and increments rx_missed_errors',
      'Support multiple queues — one ring pair per CPU, steered by RSS, so there is no cross-CPU contention',
      'Be refilled promptly by the NAPI poll loop, which allocates fresh pages and re-posts descriptors'
    ],
    commands: [
      { cmd: 'ethtool -g eth0', note: 'current versus hardware-maximum ring sizes for RX and TX' },
      { cmd: 'ethtool -G eth0 rx 4096 tx 4096', note: 'grow the rings; helps against microburst drops, hurts latency if you overdo it' },
      { cmd: 'ethtool -l eth0', note: 'number of channels (queue pairs) — should usually match the CPUs handling network work' },
      { cmd: 'ethtool -S eth0 | grep -E "rx_no_buffer|rx_missed|queue_._rx"', note: 'per-queue drops caused by ring exhaustion rather than by the wire' }
    ],
    production: 'Bigger rings are a bandaid, not a cure: they trade latency for burst tolerance and can worsen bufferbloat at the device. If rx_missed_errors climbs, first check IRQ affinity and whether one CPU is doing all the softirq work, then raise ring size. On virtual machines the ring is virtio-net queues and the same reasoning applies, with the hypervisor as the second processor.',
    interview: [
      'Does the ring buffer contain packet bytes, or something else?',
      'What is the trade-off when you increase the RX ring size from 512 to 4096?',
      'How does the NIC know a descriptor is available for it to write into?'
    ],
    sources: ['drivers/net/ethernet/intel/igb/igb_main.c', 'include/linux/netdevice.h', 'man 8 ethtool', 'Documentation/networking/scaling.rst'],
    related: ['dma', 'driver', 'napi', 'nic']
  },
  dma: {
    name: 'DMA Engine',
    tagline: 'The NIC writes straight into RAM while the CPU is busy doing something else entirely',
    description: 'Direct Memory Access lets the network card read and write host memory without the CPU copying a single byte. The driver pre-maps buffers with dma_map_single()/dma_map_page(), obtaining bus addresses the device can use; the NIC then bus-masters the frame into those pages and only afterwards raises an interrupt. Under an IOMMU (Intel VT-d, AMD-Vi) the mapping is also a protection boundary: the device can only touch pages explicitly mapped for it.',
    history: 'Bus-mastering DMA arrived on the PC with PCI in the early 1990s and immediately made 100 Mbit/s Ethernet practical — programmed I/O simply could not keep up. The DMA API abstraction in Linux (Documentation/core-api/dma-api-howto.rst, long maintained by David Miller) exists because architectures differ wildly in cache coherency and address translation. IOMMUs were added for virtualization and device passthrough, and then kept for security after DMA attacks over Thunderbolt and FireWire proved that a trusted device is not a thing.',
    purpose: 'Move packet bytes between the NIC and RAM at line rate without spending CPU cycles per byte.',
    responsibilities: [
      'Map kernel buffers to device-visible bus addresses with the correct direction (TO_DEVICE / FROM_DEVICE)',
      'Transfer frame payloads into pre-posted receive buffers, then update the descriptor status bit',
      'Maintain coherency: sync operations flush or invalidate CPU caches on non-coherent architectures',
      'Work through the IOMMU so a compromised or buggy device cannot scribble on arbitrary memory',
      'Unmap on completion — a leaked mapping exhausts the IOMMU address space and wedges the NIC',
      'Enable zero-copy paths: the same pages can be handed up the stack without a memcpy'
    ],
    commands: [
      { cmd: 'dmesg | grep -i -E "DMAR|IOMMU|AMD-Vi"', note: 'confirm the IOMMU is enabled and see DMA fault reports, which look like NIC bugs but are not' },
      { cmd: 'lspci -vv -s $(ethtool -i eth0 | awk "/bus-info/{print \\$2}") | grep -i -E "BusMaster|MaxPayload|MaxReadReq"', note: 'bus-master enable and PCIe payload sizing for the NIC' },
      { cmd: 'cat /proc/meminfo | grep -i -E "DirectMap|HugePages"', note: 'memory layout context — huge pages reduce IOTLB pressure for high-rate DMA' },
      { cmd: 'perf stat -e "iommu:*" -a sleep 5', note: 'IOMMU mapping events, useful when map/unmap overhead is the bottleneck' }
    ],
    production: 'IOMMU DMA-fault storms present as sudden total packet loss with cryptic DMAR entries in dmesg; usually a firmware bug or a passed-through device. In high-packet-rate workloads the map/unmap cost is real, which is why DPDK and AF_XDP pre-map a fixed memory pool once and reuse it forever. Also remember that DMA writes land in RAM before the interrupt fires — the ordering is guaranteed, and drivers rely on it.',
    interview: [
      'Why does the driver map buffers for DMA in advance rather than at packet arrival?',
      'What guarantees that the packet data is visible to the CPU by the time the interrupt handler runs?',
      'What does an IOMMU add beyond address translation?'
    ],
    sources: ['Documentation/core-api/dma-api-howto.rst', 'kernel/dma/mapping.c', 'drivers/iommu/', 'man 4 vfio'],
    related: ['ringbuffer', 'nic', 'irq', 'memmap']
  },
  irq: {
    name: 'Hardware Interrupt',
    tagline: 'The NIC taps the CPU on the shoulder — and gets about two microseconds of attention',
    description: 'When a NIC finishes DMA-ing a frame it raises an MSI-X interrupt targeted at a specific CPU. The CPU stops whatever it was doing, switches to interrupt context, and runs the registered handler. That handler — the "top half" — must be brutally short: acknowledge the device, disable further interrupts for that queue, call napi_schedule(), and return. Everything else is deferred to softirq context where it can be preempted and accounted for.',
    history: "Early Ethernet drivers did all their work in the interrupt handler, which was fine at 10 Mbit/s and catastrophic at 100. Jeffrey Mogul and K.K. Ramakrishnan described receive livelock in 1996: at high rates the machine spends 100% of its time in interrupt handlers and makes zero forward progress. MSI and then MSI-X (PCIe) replaced shared, level-triggered pin interrupts with thousands of per-queue message-signalled vectors, which is what lets a modern NIC steer each queue's completions to its own core.",
    purpose: 'Notify the CPU that hardware needs attention, as cheaply as possible, and immediately hand off the real work to a schedulable context.',
    responsibilities: [
      'Deliver a per-queue MSI-X vector to a chosen CPU according to the interrupt affinity mask',
      'Run the top half: acknowledge the device, mask its interrupt, schedule NAPI polling',
      'Keep interrupt latency bounded — this context cannot sleep, cannot allocate with GFP_KERNEL, and blocks that CPU',
      'Coalesce: hardware may wait rx-usecs microseconds or rx-frames packets before interrupting at all',
      'Rebalance across CPUs via /proc/irq/N/smp_affinity or irqbalance, keeping the NIC queue and its CPU on the same NUMA node',
      'Count itself in /proc/interrupts so operators can see the distribution'
    ],
    commands: [
      { cmd: 'grep eth0 /proc/interrupts', note: 'per-CPU interrupt counts per queue; all traffic on one column means broken affinity' },
      { cmd: 'ethtool -c eth0', note: 'interrupt coalescing settings: rx-usecs, rx-frames, and adaptive-rx' },
      { cmd: 'ethtool -C eth0 rx-usecs 50', note: 'trade a little latency for far fewer interrupts under load' },
      { cmd: 'cat /proc/irq/$(grep -m1 eth0 /proc/interrupts | cut -d: -f1 | tr -d " ")/smp_affinity_list', note: 'which CPUs may service this vector' }
    ],
    production: "Pin NIC queue IRQs to cores on the NIC's own NUMA node and stop irqbalance from undoing it; cross-node interrupt handling costs real throughput. For latency-sensitive workloads set rx-usecs low or zero and accept more interrupts; for throughput, coalesce aggressively. If one CPU shows 100% si (softirq) time in top while others idle, your affinity or RSS configuration is wrong.",
    interview: [
      'What is receive livelock and how does interrupt mitigation prevent it?',
      'Why can an interrupt handler not sleep or take a mutex?',
      'What is the difference between MSI-X and legacy line-based interrupts for a multi-queue NIC?'
    ],
    sources: ['/proc/interrupts', 'kernel/irq/manage.c', 'Documentation/core-api/irq/', 'man 8 ethtool'],
    related: ['softirq', 'napi', 'driver', 'cpu']
  },
  softirq: {
    name: 'SoftIRQ / ksoftirqd',
    tagline: 'The bottom half: deferred work that runs with interrupts on and a strict time budget',
    description: 'Softirqs are the kernel mechanism for work that must happen soon but not inside interrupt context. Networking owns two of the ten: NET_RX_SOFTIRQ and NET_TX_SOFTIRQ. __do_softirq() runs on return from interrupt, processes up to netdev_budget packets (default 300) or netdev_budget_usecs (default 2000 µs), and if there is still work left it wakes the per-CPU ksoftirqd thread so the scheduler — not the interrupt path — decides what happens next.',
    history: 'Softirqs replaced the older bottom-half (BH) mechanism in Linux 2.3/2.4, giving per-CPU parallelism where BHs had been globally serialized. ksoftirqd was added so that a machine under a packet flood degrades gracefully instead of livelocking: once softirq work is pushed into a normal schedulable thread, userspace still gets CPU time. The counters in /proc/net/softnet_stat — processed, dropped, time_squeeze — date from the same era and are still the fastest way to spot an overloaded receive path.',
    purpose: 'Do the bulk of packet processing — protocol demux, IP, TCP, delivery to sockets — in a preemptible, accounted context rather than with interrupts disabled.',
    responsibilities: [
      'Run NAPI poll functions for every device that has scheduled work on this CPU',
      'Enforce a budget so one busy interface cannot starve the CPU or other softirqs',
      'Push overflow work to ksoftirqd/N when the budget is exhausted (visible as the time_squeeze counter)',
      'Deliver packets up the stack: netif_receive_skb → ip_rcv → tcp_v4_rcv → socket receive queue',
      'Run the TX completion path, freeing skbs whose transmission the NIC has finished',
      'Account itself as "si" time in top and as per-CPU counters in /proc/softirqs'
    ],
    commands: [
      { cmd: 'cat /proc/net/softnet_stat', note: 'one line per CPU, hex columns: processed, dropped, time_squeeze — a non-zero third column means budget exhaustion' },
      { cmd: 'watch -n1 "grep NET /proc/softirqs"', note: 'live NET_RX/NET_TX softirq counts per CPU' },
      { cmd: 'sysctl net.core.netdev_budget net.core.netdev_budget_usecs net.core.netdev_max_backlog', note: 'the three knobs that govern how much work one softirq pass may do' },
      { cmd: 'pidstat -t -p $(pgrep -d, ksoftirqd) 1', note: 'if ksoftirqd is burning CPU, the receive path is saturated' }
    ],
    production: 'High "si" time in top plus a growing time_squeeze column is the signature of a receive path that cannot keep up: raise netdev_budget, spread RSS queues across more cores, and check for a single-queue NIC or broken IRQ affinity. netdev_max_backlog matters specifically for RPS and for virtual devices; drops there appear in the second column of softnet_stat and are invisible to tcpdump.',
    interview: [
      'Why does the kernel split interrupt handling into top and bottom halves?',
      'What does a non-zero time_squeeze in /proc/net/softnet_stat tell you?',
      'When does packet processing move from softirq context into ksoftirqd, and why is that a good thing?'
    ],
    sources: ['kernel/softirq.c', 'net/core/dev.c', '/proc/net/softnet_stat', 'Documentation/networking/scaling.rst'],
    related: ['irq', 'napi', 'driver', 'scheduler']
  },
  napi: {
    name: 'NAPI Polling',
    tagline: 'Interrupt once, then poll until the burst is drained — the cure for receive livelock',
    description: 'NAPI is a hybrid interrupt/polling scheme. The first packet raises an interrupt; the handler disables that queue interrupt and schedules a poll. In softirq context the driver poll() routine drains up to its weight (traditionally 64) packets per call, feeding them to napi_gro_receive() so segments of the same flow can be merged before travelling up the stack. Only when the ring runs dry does napi_complete_done() re-enable interrupts. Under load, interrupts effectively stop and the system becomes a polling machine.',
    history: 'NAPI — "New API" — was designed by Jamal Hadi Salim, Robert Olsson, and Alexey Kuznetsov and presented as "Beyond Softnet" at the 2001 Linux Symposium, in direct response to the receive livelock problem on gigabit hardware. It landed in 2.4.20 and became universal in 2.6. GRO (Generic Receive Offload) was layered on top by Herbert Xu in 2.6.29 (2009), replacing the fragile hardware LRO. Threaded NAPI, which runs polling in dedicated kernel threads for better scheduling control, arrived in 5.12 (2021).',
    purpose: 'Adapt automatically between low-latency interrupt-driven receive at low rates and high-efficiency polling at high rates, with no configuration.',
    responsibilities: [
      'Schedule a poll instance per device queue via napi_schedule() from the hard IRQ handler',
      'Drain the RX ring in poll(), bounded by the NAPI weight, and refill the descriptors',
      'Merge consecutive same-flow segments with GRO so the stack traverses once per 64 KB, not once per 1500 bytes',
      'Call napi_complete_done() and re-enable device interrupts only when work is exhausted',
      'Return the actual work done so the softirq budget accounting stays honest',
      'Support busy polling (SO_BUSY_POLL / net.core.busy_read) for microsecond-latency applications'
    ],
    commands: [
      { cmd: 'ethtool -k eth0 | grep -E "generic-receive-offload|large-receive-offload"', note: 'GRO and LRO state; GRO is the safe, software one and should normally stay on' },
      { cmd: 'sysctl net.core.dev_weight net.core.busy_poll net.core.busy_read', note: 'NAPI weight and the busy-polling knobs for latency-critical workloads' },
      { cmd: 'cat /sys/class/net/eth0/threaded', note: 'whether threaded NAPI is enabled (5.12+), turning poll loops into schedulable threads' },
      { cmd: 'bpftrace -e "kprobe:napi_complete_done { @[comm] = count(); }"', note: 'count poll completions per context to see whether you are in polling or interrupt mode' }
    ],
    production: 'GRO is why a capture on a busy server shows enormous "packets" that never existed on the wire — turn it off before you trust a tcpdump byte count. Threaded NAPI plus CPU pinning gives far better isolation on hosts that mix network-heavy and latency-sensitive workloads. If interrupt counts stay high under heavy load, NAPI is not staying in poll mode: usually a driver bug or coalescing set to zero.',
    interview: [
      'How does NAPI avoid receive livelock without giving up low latency when idle?',
      'What is the difference between GRO and LRO, and why is GRO preferred?',
      'What does the NAPI weight actually bound, and how does it interact with netdev_budget?'
    ],
    sources: ['net/core/dev.c', 'include/linux/netdevice.h', 'Documentation/networking/napi.rst', '"Beyond Softnet", Linux Symposium 2001'],
    related: ['softirq', 'irq', 'driver', 'ringbuffer']
  },
  nic: {
    name: 'Network Interface Card',
    tagline: 'Where software finally becomes electricity — a MAC, a PHY, and a pile of offloads',
    description: 'The NIC is the boundary of the machine. Its MAC block handles framing, addressing, and the FCS; the PHY converts symbols to line signalling; between them sit the features that make 10-100 Gbit/s possible on general-purpose CPUs — TSO/GSO segmentation, checksum offload, RSS for multi-queue steering, VLAN tag insertion, and increasingly full SR-IOV virtual functions handed directly to guests.',
    history: "Robert Metcalfe and David Boggs built the first Ethernet at Xerox PARC in 1973 at 2.94 Mbit/s; the 3Com adapters that followed in the early 1980s made it a product. Cards evolved from dumb FIFO devices to bus-mastering DMA engines, then to offload processors: checksum offload in the 1990s, TCP segmentation offload around 2000, RSS and multi-queue in the mid-2000s, and today's SmartNICs/DPUs that run entire virtual switches on-card.",
    purpose: 'Convert the kernel’s in-memory frames into signals on a physical medium and back, offloading as much per-packet work from the CPU as the hardware can safely do.',
    responsibilities: [
      'Frame and de-frame: preamble, addressing, FCS generation and verification',
      'Filter on receive: accept its own unicast MAC, broadcast, joined multicast groups, or everything in promiscuous mode',
      'Offload checksums (IP, TCP, UDP) in both directions',
      'Segment large sends: TSO splits a 64 KB buffer into MSS-sized frames in hardware',
      'Steer receive traffic across queues with RSS, hashing the 4-tuple with a Toeplitz key',
      'Negotiate link speed and duplex with the peer, and report link state to the driver'
    ],
    commands: [
      { cmd: 'ethtool eth0', note: 'link status, negotiated speed and duplex, supported modes — the very first check for "the network is slow"' },
      { cmd: 'ethtool -K eth0 gro off tso off gso off', note: 'disable offloads while debugging; re-enable them before you leave, they are worth real CPU' },
      { cmd: 'ip -s link show eth0', note: 'RX/TX packets, bytes, errors, dropped, overruns as the kernel sees them' },
      { cmd: 'ethtool -p eth0 10', note: 'blink the port LED for ten seconds — the fastest way to find the right cable in a rack' }
    ],
    production: 'Half-duplex or 100 Mbit/s on a gigabit port almost always means autonegotiation failure or a damaged cable pair; ethtool tells you in one line what an hour of application debugging will not. Offloads save enormous CPU but complicate every capture and occasionally have firmware bugs — knowing how to toggle them is a core skill. On multi-queue NICs, verify RSS spreads flows across queues or one core will be your throughput ceiling.',
    interview: [
      'What does TSO actually offload, and how does the NIC know what to put in each segment header?',
      'Why does a NIC in promiscuous mode see traffic it otherwise would not, and what limits that on a switch?',
      'You see 100 Mbit/s half-duplex on a gigabit link. What happened?'
    ],
    sources: ['drivers/net/ethernet/', 'IEEE 802.3', 'man 8 ethtool', 'Documentation/networking/segmentation-offloads.rst'],
    related: ['phy', 'ethframe', 'driver', 'dma']
  },
  ethframe: {
    name: 'Ethernet Frame',
    tagline: 'Preamble, two MACs, a type, your data, and a CRC — unchanged in shape since 1980',
    description: 'The frame on the wire is: 7 bytes of preamble (10101010 repeated) for clock recovery, a 1-byte start frame delimiter (10101011), 6-byte destination MAC, 6-byte source MAC, a 2-byte EtherType (0x0800 IPv4, 0x0806 ARP, 0x86DD IPv6, 0x8100 VLAN tag), 46-1500 bytes of payload, and a 4-byte CRC-32 frame check sequence. Then 96 bit times of interframe gap before the next one. A frame with a bad FCS is dropped silently by the receiving MAC and counted, never repaired.',
    history: 'Metcalfe and Boggs circulated the Ethernet memo at Xerox PARC on 22 May 1973 and published in CACM in 1976, naming it after the luminiferous aether. The DIX consortium (DEC, Intel, Xerox) published Ethernet II in 1980 with a 2-byte EtherType; IEEE 802.3 standardized a competing version in 1983 where the same field is a length, with LLC/SNAP headers inside. Ethernet II won — the field is a type if the value exceeds 1500, a length otherwise. The 64-byte minimum frame exists because a station had to still be transmitting when a collision from the far end of a 2500 m segment came back: 512 bit times.',
    purpose: 'Deliver a bounded chunk of bytes to one MAC address on a link segment, with enough error detection to guarantee the payload is intact or discarded.',
    responsibilities: [
      'Delimit the frame in the bit stream with the preamble and SFD',
      'Address the frame: unicast, multicast (low bit of the first octet set), or broadcast ff:ff:ff:ff:ff:ff',
      'Identify the payload protocol via EtherType so the receiver can demultiplex to IP, ARP, or IPv6',
      'Detect corruption with CRC-32 — detection only, never correction',
      'Carry 802.1Q VLAN tags (4 extra bytes) when the link is trunked',
      'Enforce the 64-byte minimum (padding if needed) and the 1518-byte classic maximum, or 9018 with jumbo frames'
    ],
    commands: [
      { cmd: 'tcpdump -ni eth0 -e -c 5', note: 'the -e flag prints the Ethernet header: source and destination MAC plus EtherType' },
      { cmd: 'ip link show eth0', note: 'MAC address, MTU, and link flags; MTU is payload only, so 1500 means a 1518-byte frame' },
      { cmd: 'ethtool -S eth0 | grep -iE "crc|frame|align|jabber"', note: 'FCS and alignment errors — physical-layer problems reported at layer 2' },
      { cmd: 'ip link set eth0 mtu 9000', note: 'enable jumbo frames; every device in the L2 path must agree or you get silent black holes' }
    ],
    production: 'Rising CRC error counters mean a cable, connector, transceiver, or duplex mismatch — never a software bug. MTU mismatches on jumbo-frame networks produce the classic "ping works, transfers hang" symptom because small packets fit and large ones vanish. And note MTU excludes the 18 bytes of Ethernet header and FCS, which is why a 1500-byte MTU is a 1518-byte frame and 1522 with a VLAN tag.',
    interview: [
      'Why is the minimum Ethernet frame 64 bytes?',
      'How does a receiver distinguish an EtherType from an 802.3 length field?',
      'What happens to a frame with a bad FCS, and where would you see evidence of it?'
    ],
    sources: ['IEEE 802.3 clause 3', 'RFC 894', 'include/uapi/linux/if_ether.h', 'man 7 packet'],
    related: ['nic', 'phy', 'switch', 'arp']
  },
  wififrame: {
    name: '802.11 Frame',
    tagline: 'Ethernet with a radio, four address fields, and an apology for every collision it cannot see',
    description: 'An 802.11 data frame carries a frame control field (with ToDS/FromDS bits), a duration/ID used for virtual carrier sensing, up to four MAC addresses (receiver, transmitter, destination/BSSID, and a fourth only for WDS/mesh), a sequence control field for fragmentation and duplicate detection, an optional QoS control field, the payload, and an FCS. Because a radio cannot listen while it transmits, collisions are undetectable — so every unicast frame must be individually acknowledged.',
    history: 'IEEE 802.11 was ratified in 1997 at 1 and 2 Mbit/s, using a MAC derived from ALOHAnet and Ethernet but redesigned around a half-duplex, lossy, shared medium. 802.11b (1999) made it a consumer product; a/g/n/ac/ax/be added OFDM, MIMO, channel bonding, and OFDMA. Security is a history of failure and repair: WEP broken by Fluhrer, Mantin and Shamir in 2001; WPA as a stopgap; WPA2/CCMP in 2004; the KRACK key-reinstallation attack in 2017; and WPA3 in 2018 replacing the pre-shared-key handshake with SAE (Dragonfly), which resists offline dictionary attacks.',
    purpose: 'Carry the same IP packets as Ethernet across a shared, half-duplex, unreliable radio channel while coordinating access among stations that often cannot hear each other.',
    responsibilities: [
      'Coordinate medium access with CSMA/CA: sense idle for DIFS, then wait a random backoff before transmitting',
      'Acknowledge every unicast frame after SIFS — no ACK means retransmit, invisible to the layers above',
      'Reserve the medium with the duration field (NAV) and optionally with RTS/CTS to solve the hidden-node problem',
      'Address with up to four fields so an AP can relay between the wireless and wired sides',
      'Encrypt the payload with CCMP (WPA2) or GCMP/SAE (WPA3); management frames get protection via 802.11w',
      'Aggregate frames (A-MPDU/A-MSDU) so per-frame overhead does not dominate at hundreds of Mbit/s'
    ],
    commands: [
      { cmd: 'iw dev wlan0 link', note: 'associated BSSID, signal strength in dBm, current TX bitrate and MCS' },
      { cmd: 'iw dev wlan0 station dump | grep -E "signal|tx bitrate|tx retries|tx failed"', note: 'retries and failures are the honest measure of a bad wireless link' },
      { cmd: 'iw dev wlan0 scan | grep -E "SSID|freq|signal"', note: 'nearby BSSIDs and channels — the first step in diagnosing channel congestion' },
      { cmd: 'iw dev wlan0 set monitor control && tcpdump -ni wlan0 -e -y IEEE802_11_RADIO', note: 'monitor mode capture showing real 802.11 headers rather than fake Ethernet ones' }
    ],
    production: 'Wi-Fi problems are almost always airtime problems, not bandwidth problems: one distant client transmitting at 6 Mbit/s consumes airtime that a dozen fast clients could have used. Watch retry rates, keep 2.4 GHz to channels 1/6/11, prefer 5/6 GHz, and remember that Linux hands the stack a fake Ethernet header by default — you need monitor mode to see what is really on the air.',
    interview: [
      'Why does Wi-Fi use CSMA/CA when Ethernet used CSMA/CD?',
      'What is the hidden-node problem, and how do RTS/CTS address it?',
      'Why does an 802.11 frame need up to four address fields when Ethernet needs two?'
    ],
    sources: ['IEEE 802.11-2020', 'net/mac80211/', 'man 8 iw', 'RFC 5416 (CAPWAP binding)'],
    related: ['ethframe', 'signal', 'homerouter', 'phy']
  },
  phy: {
    name: 'PHY / Transceiver',
    tagline: 'Bits in, symbols out: encoding, serialization, and the negotiation that decides your link speed',
    description: 'The physical layer device sits between the MAC and the medium. It contains the PCS (coding: 4B/5B at 100 Mbit/s, 8B/10B for 1000BASE-X, 64B/66B at 10 Gbit/s, PAM4 above 50 Gbit/s per lane), the PMA (serialization and clock recovery, the SerDes), and the PMD (the actual electrical or optical driver). It also runs autonegotiation and reports link status through MDIO registers the driver polls.',
    history: 'Autonegotiation was standardized in 802.3u (1995) using Fast Link Pulses — a burst of pulses encoding a capability bitmap — layered compatibly on top of the 10BASE-T link-integrity pulse so old and new equipment could coexist. Parallel detection handled peers that could not negotiate at all, which is the root of the classic duplex-mismatch failure where one end negotiates and the other guesses half duplex. Auto-MDI/MDI-X (802.3ab, 1999) then quietly killed the crossover cable.',
    purpose: 'Turn a clean digital bit stream into a signal that survives a hundred metres of copper or eighty kilometres of glass, and turn it back again.',
    responsibilities: [
      'Encode bits into line symbols with enough transitions for clock recovery and DC balance',
      'Serialize and deserialize (SerDes) between parallel internal buses and one high-rate serial lane',
      'Recover the receive clock from the incoming signal — there is no separate clock wire',
      'Autonegotiate speed, duplex, and flow control with the link partner via FLP bursts',
      'Perform auto-MDI/MDI-X crossover detection so any cable works',
      'Apply equalization, echo cancellation, and (at 25 Gbit/s and above) forward error correction to hit the required BER'
    ],
    commands: [
      { cmd: 'ethtool eth0 | grep -E "Speed|Duplex|Auto-negotiation|Link detected"', note: 'the negotiated result and whether negotiation happened at all' },
      { cmd: 'ethtool --show-eeprom eth0 | head', note: 'read the SFP/QSFP module EEPROM: vendor, part number, supported reach' },
      { cmd: 'ethtool -m eth0', note: 'live optical diagnostics: TX/RX power in dBm and temperature — how you prove a fibre or transceiver is dying' },
      { cmd: 'ethtool --cable-test eth0', note: 'TDR cable diagnostics on supported PHYs: reports open, short, or the distance to the fault' }
    ],
    production: 'Never hard-set speed and duplex on one end only — that guarantees a duplex mismatch, which shows up as terrible throughput plus late collisions and FCS errors rather than a down link. On optics, "ethtool -m" RX power drifting toward the receiver sensitivity floor predicts a failure days before it happens, and is the single most useful preventive check in a fibre plant.',
    interview: [
      'What does autonegotiation actually exchange, and what happens when only one side does it?',
      'Why does 10 Gbit/s Ethernet use 64B/66B encoding instead of 8B/10B?',
      'How would you prove that a link problem is physical rather than in the driver or stack?'
    ],
    sources: ['IEEE 802.3 clauses 22, 28, 49', 'drivers/net/phy/phy_device.c', 'man 8 ethtool', 'SFF-8472 (optical diagnostics)'],
    related: ['signal', 'nic', 'ethframe', 'fiber']
  },
  signal: {
    name: 'Physical Signal',
    tagline: 'Voltage, light, or radio — the only part of the Internet that is not a metaphor',
    description: 'At the bottom of the stack there is no packet, only a waveform: differential voltage across a twisted pair, modulated light in a glass core, or an RF carrier in the 2.4/5/6 GHz bands. Everything above depends on the receiver correctly deciding, billions of times per second, which symbol was sent. That decision is governed by signal-to-noise ratio, attenuation, crosstalk, and reflections — and by Shannon, who set the hard ceiling on what any channel can carry.',
    history: "Claude Shannon's 1948 paper established the capacity limit C = B·log2(1+SNR), which still bounds every modern link. 10BASE-T (1990) used simple Manchester encoding over two pairs; 1000BASE-T (1999) had to use all four pairs simultaneously in both directions with PAM-5 signalling, hybrids, and echo cancellation to fit gigabit into the same Cat5 cable — an engineering feat that made structured cabling investments last decades. Above 25 Gbit/s per lane, links stopped being error-free and started relying on mandatory forward error correction.",
    purpose: 'Carry symbols across a physical medium with a bit error rate low enough that the layers above can pretend the medium is perfect.',
    responsibilities: [
      'Represent symbols as detectable states: differential voltage levels, light intensity, or RF phase/amplitude',
      'Survive attenuation over distance — 100 m for copper Ethernet, tens of kilometres for single-mode fibre',
      'Reject noise via differential signalling and twisting, which turns common-mode interference into a non-event',
      'Contend with crosstalk (NEXT/FEXT) between pairs and with reflections from impedance mismatches',
      'Deliver a recoverable clock: the encoding must guarantee transitions even in long runs of identical bits',
      'Meet a target bit error rate — 10^-12 for classic Ethernet — with FEC where raw BER cannot'
    ],
    commands: [
      { cmd: 'ethtool -m eth0 | grep -E "Rx power|Tx power|Temperature"', note: 'optical power budget in dBm; compare against the module sensitivity in its datasheet' },
      { cmd: 'ethtool -S eth0 | grep -iE "fec|symbol|crc|error"', note: 'FEC corrected/uncorrected codewords and symbol errors — signal quality, expressed as counters' },
      { cmd: 'iw dev wlan0 link | grep -E "signal|rx bitrate"', note: 'RF received signal strength in dBm; below about -70 dBm expect rate adaptation and retries' },
      { cmd: 'mtr -rw -c 100 1.1.1.1', note: 'sustained loss on one hop and every hop after it points at a physical problem upstream' }
    ],
    production: 'Physical problems announce themselves as error counters, not as log messages: FCS errors, symbol errors, uncorrected FEC codewords, and falling optical RX power. Cheap or over-length copper runs fail intermittently under temperature change, which is why "it only breaks in the afternoon" is a real category of network bug. Keep a labelled spare of every transceiver type — swapping the optic is faster than proving it is broken.',
    interview: [
      'Why is twisted pair twisted, and why is the signalling differential?',
      'What does Shannon capacity say about the trade-off between bandwidth and SNR?',
      'Why did links above 25 Gbit/s per lane make forward error correction mandatory?'
    ],
    sources: ['IEEE 802.3 clause 40 (1000BASE-T)', 'Shannon, "A Mathematical Theory of Communication" (1948)', 'SFF-8472', 'TIA/EIA-568 cabling standards'],
    related: ['phy', 'fiber', 'wififrame', 'nic']
  },
// __END__
};
