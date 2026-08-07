// Packet Odyssey — Steps C: chapters 17-24 (origin → app → DB → full return journey)
// Defines window.STEPS_C. Plain ES2019, no imports, no trailing calls.
window.STEPS_C = [

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 17 — Docker Networking (BRANCH: docker / baremetal)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'deploy-branch',
    chapter: 17,
    title: 'How is the app deployed?',
    node: 'proxy',
    mode: 'remote',
    branch: {
      key: 'deploy',
      question: 'nginx has the request decrypted and parsed, ready to forward upstream. Where does the NestJS app actually live?',
      options: [
        { value: 'docker', label: 'Docker container', hint: 'A published port, an address rewrite (iptables DNAT), a software switch and a virtual cable — the modern default' },
        { value: 'baremetal', label: 'Bare metal + systemd', hint: 'The node process sits straight on the host, reached over loopback, with no address rewriting at all' }
      ]
    },
    explain: {
      what: "nginx has the letter open on the desk and now has to decide which door to carry it to. Concretely: the worker holds a fully parsed, unencrypted request — GET /products?limit=20 — and reads one line of its own config, the upstream block, to find the next hop. That single line settles everything that follows. Either the app is a container, a process sealed inside its own private copy of the network and reached through address rewriting and a software switch, or it is an ordinary program sitting one hop away on the very same machine.",
      why: "Every piece of plumbing in this chapter exists on only one side of this fork, so getting the answer right is the difference between debugging four moving parts and debugging none of them.",
      component: 'nginx upstream module (ngx_http_upstream)',
      layer: 'Origin server · L7 routing decision',
      abstraction: 'Reverse proxy → application hop',
      protocol: 'HTTP/1.1 upstream (plaintext, TLS already terminated)',
      misconception: "You might think Docker networking must be slow because everything about it is virtual — actually the whole software-switch path costs well under 10 microseconds per packet, which vanishes next to a single database query.",
      analogy: "A delivery driver squinting at the address label: is this a house with its own front door, or the gated complex where every parcel goes through the security desk first?",
      command: 'nginx -T | grep -A4 "location /"',
      production: 'SREs pin this choice down with infrastructure-as-code; the upstream block is where you configure keepalive connection pools, timeouts, and retries against the app tier.'
    }
  },

  {
    id: 'docker-proxy-upstream',
    chapter: 17,
    title: 'nginx forwards to the published port',
    node: 'proxy',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'GET /products?limit=20 → upstream',
      layers: ['ip', 'tcp', 'http'],
      fields: {
        ip: { 'Src': '172.17.0.1', 'Dst': '172.17.0.1 (published port)', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '52814', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
        http: { 'Method': 'GET', 'Path': '/products?limit=20', 'Host': 'api.shop.dev', 'X-Forwarded-For': '203.0.113.77', 'X-Forwarded-Proto': 'https', 'Connection': 'keep-alive' }
      }
    },
    state: { proc: 'nginx worker' },
    explain: {
      what: "The app lives inside a sealed box, so Docker punched exactly one hole in the wall for it. That hole is a published port: the container was started with host 443 mapped to container 3000, listening on the docker0 gateway address. nginx opens a TCP connection to 172.17.0.1:443 — or reuses one it already has open, thanks to the upstream keepalive pool — and writes the request as plain unencrypted HTTP/1.1, adding X-Forwarded-For and X-Forwarded-Proto so the app can still work out who really called and whether they arrived over HTTPS.",
      why: "The proxy aims at the published port rather than the container's own address on purpose: container addresses are handed out fresh on every restart, while the published port is a promise dockerd keeps.",
      component: 'nginx proxy_pass + docker port publishing (-p 443:3000)',
      layer: 'Origin server · L4/L7 boundary',
      abstraction: 'Stable published endpoint hiding an ephemeral container',
      protocol: 'HTTP/1.1 over TCP',
      misconception: "You might think the little helper process called docker-proxy copies every packet through itself — actually on modern Linux the kernel's own address-rewriting path carries the traffic; the helper only covers oddities like localhost hairpin connections, and plenty of production hosts switch it off entirely.",
      analogy: "You write the hotel's street address on a parcel, never the guest's room number. Guests move rooms all week; the hotel stays put.",
      command: 'docker port api\n# 443/tcp -> 172.17.0.1:443',
      production: 'Always set proxy_http_version 1.1 and an upstream keepalive pool; without it nginx opens a fresh TCP handshake to the container per request and you burn ephemeral ports under load.'
    },
    code: [
      { title: 'nginx.conf (upstream)', lang: 'bash', code: 'upstream nest_app {\n    server 172.17.0.1:443;   # docker-published, container listens on 3000\n    keepalive 32;\n}\n\nlocation / {\n    proxy_pass http://nest_app;\n    proxy_http_version 1.1;\n    proxy_set_header Connection "";\n    proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n}' }
    ],
    prod: {
      title: 'Caddy forwards to the published port',
      explain: { production: 'Island Tours runs Caddy: reverse_proxy gets keepalive and X-Forwarded-* headers by default, and Caddy auto-renews the public TLS cert via ACME — one less 3 a.m. page.' },
      code: [
        { title: 'Caddyfile', lang: 'bash', code: 'api.islandtours.io {\n    reverse_proxy 172.17.0.1:443 {\n        transport http {\n            keepalive 30s\n        }\n    }\n}' }
      ]
    }
  },

  {
    id: 'docker-dnat',
    chapter: 17,
    title: 'iptables DNAT rewrites the destination',
    node: 'dnat',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'DNAT: :443 → 172.17.0.2:3000',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '172.17.0.1', 'Dst (before)': '172.17.0.1', 'Dst (after)': '172.17.0.2', 'TTL': '64' },
        tcp: { 'Src Port': '52814', 'Dst Port (before)': '443', 'Dst Port (after)': '3000', 'Flags': 'PSH, ACK' }
      }
    },
    quiz: {
      q: 'The container will reply from 172.17.0.2:3000 — an address nginx never connected to. How does the reply get translated back so nginx recognizes the flow?',
      options: [
        'nginx keeps a table of container IPs and rewrites replies itself',
        'A second, mirrored iptables rule matches all traffic sourced from port 3000',
        'conntrack recorded the original tuple at DNAT time and automatically un-NATs every reply packet of that flow'
      ],
      answer: 2,
      explain: 'Address rewriting in Linux has a memory. The first packet of a flow walks the nat table exactly once; conntrack then files away both the outbound address pair and the expected reply address pair, and every packet after that — going either way — is rewritten straight from that filed entry, without a single firewall rule being consulted again.'
    },
    explain: {
      what: "The kernel quietly changes the address on the envelope while the letter is still in the building. The packet, made right here on this machine, hits the nat table's OUTPUT hook — one of the fixed points where firewall rules get their say — jumps into the chain named DOCKER, and matches the rule dockerd installed the instant the container started: anything for port 443 has its destination rewritten to 172.17.0.2:3000. That rewrite is called DNAT. The kernel edits the destination IP and port in place, and conntrack — the kernel's notebook of live connections — writes the translation down as a flow entry.",
      why: "This one small header edit IS the whole of -p 443:3000: no proxy process, no copying, just two fields changed before ordinary routing carries the packet on toward docker0.",
      component: 'netfilter nat table, DOCKER chain (net/netfilter/nf_nat_core.c)',
      layer: 'Server kernel · L3/L4 NAT',
      abstraction: 'Port publishing as a stateful header rewrite',
      protocol: 'Netfilter NAT (DNAT target)',
      misconception: "You might think every packet in the connection gets checked against the NAT rules — actually only the FIRST packet of a flow walks the nat table; the verdict is filed in conntrack and replayed for the rest of the connection without a rule ever being read again.",
      analogy: "A mail-redirection order filed once at the sorting office: the first letter sets it up, and every letter afterwards is quietly re-addressed without anyone reading the paperwork twice.",
      command: 'sudo iptables -t nat -nvL DOCKER',
      production: 'Debugging "port published but unreachable" almost always ends in this chain — check DOCKER-USER for drop rules, verify net.ipv4.ip_forward=1, and remember firewalld or ufw can silently reorder these chains.'
    },
    code: [
      { title: 'iptables -t nat -nvL DOCKER', lang: 'bash', code: 'Chain DOCKER (2 references)\n pkts bytes target  prot opt in  out     source     destination\n  312 18720 RETURN  all  --  docker0 *   0.0.0.0/0  0.0.0.0/0\n 8841  530K DNAT    tcp  --  !docker0 *  0.0.0.0/0  0.0.0.0/0   tcp dpt:443 to:172.17.0.2:3000' },
      { title: 'The flow in conntrack', lang: 'bash', code: 'sudo conntrack -L -p tcp --dport 3000\n# tcp 6 431999 ESTABLISHED\n#   src=172.17.0.1 dst=172.17.0.1 sport=52814 dport=443\n#   src=172.17.0.2 dst=172.17.0.1 sport=3000 dport=52814 [ASSURED]' }
    ]
  },

  {
    id: 'docker-bridge',
    chapter: 17,
    title: 'docker0: a switch made of software',
    node: 'bridge',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'Frame forwarded across docker0',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '02:42:ac:11:00:01 (docker0)', 'Dst MAC': '02:42:ac:11:00:02 (container)', 'EtherType': '0x0800' },
        ip: { 'Src': '172.17.0.1', 'Dst': '172.17.0.2', 'TTL': '64' }
      }
    },
    explain: {
      what: "docker0 is a network switch that exists only as code. Routing says 172.17.0.2 lives out through docker0, a kernel bridge device — a learning switch built entirely in software. The bridge checks its FDB (forwarding database, the software version of the address table inside a real switch), sees that the container's hardware address 02:42:ac:11:00:02 sits behind one particular port, and hands the frame to that port and no other.",
      why: "A bridge lets any number of containers share one small network and reach each other directly, with no per-container routes to keep straight — and it runs the same logic a metal switch burns into silicon, living here as plain C in net/bridge/.",
      component: 'Linux bridge (net/bridge/br_forward.c), FDB',
      layer: 'Server kernel · OSI L2',
      abstraction: 'Virtual Ethernet switch inside the kernel',
      protocol: 'Ethernet bridging (IEEE 802.1D)',
      misconception: "You might think docker0 is some special Docker invention — actually it is a completely ordinary Linux bridge; ip link and brctl manage it exactly as they would one you built by hand. Docker simply does the building for you.",
      analogy: "A school receptionist who has the seating plan memorised: a note for one pupil is walked straight to that classroom, never read out over the tannoy to the whole school.",
      command: 'bridge fdb show br docker0 | grep -v permanent',
      production: 'With br_netfilter loaded, bridged frames also traverse iptables FORWARD — the DOCKER-USER chain exists precisely so operators can firewall inter-container traffic without dockerd overwriting their rules.'
    },
    code: [
      { title: 'Bridge topology', lang: 'bash', code: 'ip link show master docker0\n# 7: vethd3adb33@if6: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n#    master docker0 state UP\n\nbridge fdb show br docker0\n# 02:42:ac:11:00:02 dev vethd3adb33 master docker0' }
    ]
  },

  {
    id: 'docker-veth',
    chapter: 17,
    title: 'The veth pair: a cable with two ends',
    node: 'veth',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'Frame crosses the namespace boundary',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Ingress': 'vethd3adb33 (host side)', 'Egress': 'eth0@if7 (container side)' },
        ip: { 'Src': '172.17.0.1', 'Dst': '172.17.0.2' }
      }
    },
    explain: {
      what: "Picture a short cable with a plug at each end — except there is no cable, just two software devices that hand packets to one another. The bridge port vethd3adb33 is one end of a veth pair (veth is short for virtual Ethernet), and the far end lives inside the container's own private network world, where it goes by the name eth0. veth_xmit takes the packet buffer, called an skb, and drops it straight into the peer device's receive path: no wire, no DMA, just a pointer changing hands.",
      why: "Namespaces exist to separate things; veth pairs exist to reconnect exactly the things you choose. This pair is the only doorway between the host's network and the container's, so every byte in or out passes through it.",
      component: 'veth driver (drivers/net/veth.c)',
      layer: 'Server kernel · virtual L1/L2',
      abstraction: 'Point-to-point virtual cable between namespaces',
      protocol: 'Ethernet (virtual)',
      misconception: "You might think the container's eth0 is a slice carved off the real network card — actually it is pure software, and for traffic between the host and the container the physical card may never be touched at all.",
      analogy: "A pass-through hatch in the wall of a hospital isolation ward: sealed room on one side, corridor on the other, and it is the only opening either side has.",
      command: 'ip -d link show vethd3adb33   # note: veth, master docker0, link-netnsid 0',
      production: 'The @if7 suffix pairs the interfaces: peer ifindex. When chasing packet loss, run tcpdump on the veth host end and on eth0 inside the container — if a packet appears on one but not the other, blame netfilter, not the "cable".'
    },
    code: [
      { title: 'Finding the peer', lang: 'bash', code: '# host side\nip link show vethd3adb33\n# 7: vethd3adb33@if6: ... master docker0\n\n# container side (ifindex 6 = eth0)\ndocker exec api ip link show eth0\n# 6: eth0@if7: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500' }
    ]
  },

  {
    id: 'docker-cnetns',
    chapter: 17,
    title: 'Inside the container network namespace',
    node: 'cnetns',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'Request arrives at container eth0',
      layers: ['ip', 'tcp', 'http'],
      fields: {
        ip: { 'Src': '172.17.0.1', 'Dst': '172.17.0.2', 'TTL': '64' },
        tcp: { 'Src Port': '52814', 'Dst Port': '3000', 'Flags': 'PSH, ACK' },
        http: { 'Method': 'GET', 'Path': '/products?limit=20', 'X-Forwarded-Proto': 'https' }
      }
    },
    state: { proc: 'node PID 1 (container)' },
    explain: {
      what: "The packet steps through the wall into the container's own private copy of the network. It surfaces on eth0 inside the container's network namespace, which was created when the container started via clone(CLONE_NEWNET) — a system call that means, roughly, give this new process a fresh network stack of its own. That namespace owns its own interfaces (just lo and eth0), its own routing table, its own firewall rules, its own connection notebook, its own /proc/net. From inside here, the host's real network cards simply do not exist.",
      why: "Namespaces are the isolation half of container networking: the app can bind 0.0.0.0:3000 without ever fighting the host for port 3000, because the words port 3000 only mean anything inside one namespace.",
      component: 'Network namespace (net/core/net_namespace.c)',
      layer: 'Server kernel · namespace isolation',
      abstraction: 'A private copy of the network stack per container',
      protocol: '—',
      misconception: "You might think each container runs its own little kernel — actually there is exactly ONE kernel on the machine, and a namespace is only a way of scoping which kernel objects a process can see. That is why containers start in milliseconds, and also why one kernel bug is shared by every container on the host.",
      analogy: "Flats in one apartment building: each has its own front door, its own letterbox and its own numbered rooms, and every one of them stands on a single foundation with a single set of pipes.",
      command: 'sudo nsenter -t "$(docker inspect -f "{{.State.Pid}}" api)" -n ss -ltn',
      production: 'When exec-ing into distroless containers with no ss/ip binaries, nsenter from the host into the container netns is the debugging move — host tools, container view.'
    },
    code: [
      { title: 'The namespace view', lang: 'bash', code: 'docker exec api ip addr show eth0\n# 6: eth0@if7: mtu 1500\n#    inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0\n\ndocker exec api ip route\n# default via 172.17.0.1 dev eth0\n# 172.17.0.0/16 dev eth0 scope link src 172.17.0.2' }
    ]
  },

  {
    id: 'bm-proxy-loopback',
    chapter: 17,
    title: 'proxy_pass to localhost:3000',
    node: 'proxy',
    mode: 'remote',
    when: { deploy: 'baremetal' },
    packet: {
      label: 'GET /products?limit=20 → 127.0.0.1:3000',
      layers: ['ip', 'tcp', 'http'],
      fields: {
        ip: { 'Src': '127.0.0.1', 'Dst': '127.0.0.1', 'TTL': '64' },
        tcp: { 'Src Port': '52814', 'Dst Port': '3000', 'Flags': 'PSH, ACK' },
        http: { 'Method': 'GET', 'Path': '/products?limit=20', 'X-Forwarded-For': '203.0.113.77', 'X-Forwarded-Proto': 'https' }
      }
    },
    state: { proc: 'nginx worker' },
    explain: {
      what: "No containers anywhere on this path: the node process is listening directly on 127.0.0.1:3000, the machine's own internal address, and nginx simply talks to it there. One connect(), one write(). The request never leaves the computer, never has its address rewritten, never crosses into a separate network namespace.",
      why: "Binding the app to 127.0.0.1 rather than 0.0.0.0 is a deliberate lock on the front door: the only way in is through the proxy, and the proxy is where TLS, rate limiting and access logs already live.",
      component: 'nginx proxy_pass → loopback TCP',
      layer: 'Origin server · L4',
      abstraction: 'Co-located processes talking over local TCP',
      protocol: 'HTTP/1.1 over TCP (loopback)',
      misconception: "You might think loopback traffic still travels down to the network card and back — actually it never touches hardware at all; the kernel takes the packet at the bottom of its own send path and posts it straight back into its own receive path.",
      analogy: "Interoffice mail between two desks in the same room: it still gets an envelope and a stamp (those are the TCP and IP headers), it just never sees a van.",
      command: 'ss -ltn "sport = :3000"',
      production: 'Loopback MSS is huge (MTU 65536) and latency is single-digit microseconds; if proxy→app latency shows up in traces on a bare-metal box, suspect the app event loop, not the transport.'
    },
    code: [
      { title: 'nginx.conf', lang: 'bash', code: 'location / {\n    proxy_pass http://127.0.0.1:3000;\n    proxy_http_version 1.1;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n}' }
    ]
  },

  {
    id: 'bm-loopback-dev',
    chapter: 17,
    title: 'lo: the interface that is pure software',
    node: 'ip',
    mode: 'remote',
    when: { deploy: 'baremetal' },
    packet: {
      label: 'Looped back inside the kernel',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '127.0.0.1', 'Dst': '127.0.0.1', 'Device': 'lo (MTU 65536)' },
        tcp: { 'Src Port': '52814', 'Dst Port': '3000' }
      }
    },
    explain: {
      what: "The kernel hands the packet to itself. Routing sends it via the local table (127.0.0.0/8 dev lo) into loopback_xmit — the entire driver is one small file, drivers/net/loopback.c — which immediately re-queues the buffer into the receive path of the same kernel. No card, no interrupt, no DMA, no ring buffer: transmitting IS receiving. The node process behind all this is watched over by a systemd unit that restarts it if it dies and files everything it prints into the journal.",
      why: "Loopback exists so the socket API behaves identically whether the other end is across the planet or across the process table — the app genuinely cannot tell the difference, and that is the whole point.",
      component: 'Loopback driver (drivers/net/loopback.c) + systemd service',
      layer: 'Server kernel · virtual L1',
      abstraction: 'The network stack talking to itself',
      protocol: 'TCP/IP over a software device',
      misconception: "You might think localhost traffic gets to skip TCP — actually it cannot: a full TCP state machine runs at each end. The kernel does skip checksumming, because memory does not flip bits the way a cable does, but sequence numbers, windows and retransmit timers are all still there.",
      analogy: "A radio studio talkback: the presenter's microphone feeds headphones two feet away, and the sound still travels through the entire mixing desk on the way.",
      command: 'ip -s link show lo   # RX and TX counters are always identical',
      production: 'systemctl status api and journalctl -u api -f are the bare-metal equivalents of docker logs; Restart=always plus StartLimitBurst is the poor man’s orchestrator.'
    },
    code: [
      { title: '/etc/systemd/system/api.service', lang: 'bash', code: '[Unit]\nDescription=NestJS API\nAfter=network.target postgresql.service\n\n[Service]\nExecStart=/usr/bin/node /srv/api/dist/main.js\nEnvironment=NODE_ENV=production PORT=3000\nRestart=always\nRestartSec=2\nUser=api\n\n[Install]\nWantedBy=multi-user.target' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 18 — The NestJS Application
  // ─────────────────────────────────────────────────────────────
  {
    id: 'nest-kernel-ff',
    chapter: 18,
    title: 'Fast-forward: the server kernel did all of this too',
    node: 'tcp',
    mode: 'remote',
    effects: ['queue+', 'flash'],
    state: { proc: 'node PID 1 (container)', sock: 'ESTABLISHED (proxy → app)' },
    explain: {
      what: "Pause for a second: everything you watched happen on the laptop just happened all over again, inside this server. Ring buffers, hardware interrupts, NAPI polling, ip_rcv, the firewall hooks, TCP picking the right socket — the whole lot, for this connection. The proxy's opening SYN waited in the listening socket's SYN queue, graduated to the accept queue when the final ACK landed, and now the request bytes sit on an ESTABLISHED socket waiting for the app to come and read them. Roughly thirty steps, folded into this one panel.",
      why: "Every machine in the chain runs the full stack — your laptop, the router, the edge, the proxy host, the app host, the database host. Learn it once and you have learned it everywhere, and we will replay the receive path in loving slow motion on the way home in chapter 23.",
      component: 'Server TCP stack: SYN queue + accept queue (net/ipv4/tcp_input.c)',
      layer: 'Server kernel · L4',
      abstraction: 'The same kernel machinery, other side of the wire',
      misconception: "You might think the server simply receives HTTP requests — actually its kernel does every scrap of work the client's kernel did, and under load a full accept queue (visible as Recv-Q sitting at the backlog limit in ss -ltn) silently drops requests with nothing at all in your application logs.",
      analogy: "You already toured one factory floor end to end. The identical plant across the river runs the very same line, so this time we wave at it from the bus.",
      protocol: 'TCP (RFC 9293) — passive open',
      command: 'ss -ltn "sport = :3000"   # Recv-Q = connections waiting in accept queue',
      production: 'Watch net.core.somaxconn and the listen() backlog argument together — the kernel silently caps backlog at somaxconn. Overflow shows up in nstat -az TcpExtListenDrops long before users file tickets.'
    },
    code: [
      { title: 'Accept queue in one line', lang: 'bash', code: 'ss -ltn "sport = :3000"\n# State   Recv-Q  Send-Q  Local Address:Port\n# LISTEN  0       511     0.0.0.0:3000\n#         ^ conns accepted-but-unread   ^ backlog limit\n\nnstat -az TcpExtListenDrops TcpExtListenOverflows' }
    ]
  },

  {
    id: 'nest-epoll-accept',
    chapter: 18,
    title: 'epoll wakes node; accept4() returns fd 18',
    node: 'appserver',
    mode: 'remote',
    effects: ['queue-', 'ctx'],
    state: {
      proc: 'node PID 1 (container)',
      fds: [
        ['0', '/dev/null'],
        ['1', 'pipe:[dockerd json-file log]'],
        ['2', 'pipe:[dockerd json-file log]'],
        ['13', 'anon_inode:[eventpoll] (libuv)'],
        ['17', 'socket:[TCP 0.0.0.0:3000 LISTEN]'],
        ['18', 'socket:[TCP 172.17.0.2:3000 ↔ proxy]']
      ]
    },
    explain: {
      what: "A light comes on: somebody is waiting at the door. When a listening socket becomes readable, that is the kernel's way of saying a connection is queued up. Inside the node process, libuv's epoll_wait — the call that sleeps until one of thousands of watched sockets has news — returns, and the connection callback calls accept4() with the flags SOCK_NONBLOCK and SOCK_CLOEXEC. The kernel pops the waiting connection off the accept queue and hands back file descriptor 18, a small integer that now stands for this conversation. Node wraps it in a net.Socket and starts watching that one for readability too.",
      why: "This is the server half of the event-loop story: one thread, one epoll instance, thousands of sockets. accept4 is preferred over plain accept because it marks the new socket non-blocking in the same instant it creates it, leaving no gap for a race.",
      component: 'libuv uv__server_io → uv__accept (deps/uv/src/unix/stream.c)',
      layer: 'Server userspace · syscall boundary',
      abstraction: 'Readiness-driven accept loop',
      protocol: 'Berkeley sockets API',
      misconception: "You might think Node starts a thread for each connection — actually a single event-loop thread owns every socket on the machine; the worker thread pool exists for file reads and crypto, never for network sockets.",
      analogy: "One receptionist facing a wall of little doorbell lights. A light blinks (that is epoll), she buzzes the visitor in (accept4), clips a numbered badge on them (that is fd 18), and goes straight back to watching the wall.",
      command: 'sudo strace -e trace=epoll_wait,accept4 -p "$(docker inspect -f "{{.State.Pid}}" api)"',
      production: 'File descriptor exhaustion is the classic Node outage: every socket is an fd, the default ulimit may be 1024, and leaked keep-alive sockets hit EMFILE. Raise LimitNOFILE in the unit or the container spec, and graph fd counts.'
    },
    code: [
      { title: 'strace of the wakeup', lang: 'bash', code: 'epoll_wait(13, [{events=EPOLLIN, data={fd=17}}], 1024, -1) = 1\naccept4(17, {sa_family=AF_INET, sin_port=htons(52814),\n            sin_addr="172.17.0.1"}, [16],\n        SOCK_CLOEXEC|SOCK_NONBLOCK) = 18\nepoll_ctl(13, EPOLL_CTL_ADD, 18, {events=EPOLLIN, data={fd=18}}) = 0' }
    ]
  },

  {
    id: 'nest-llhttp',
    chapter: 18,
    title: 'llhttp parses the raw request bytes',
    node: 'appserver',
    mode: 'remote',
    explain: {
      what: "So far the request is just a run of bytes; something has to turn it into meaning. fd 18 goes readable, node reads those raw bytes, and feeds them to llhttp — Node's HTTP/1.1 parser, written as a grammar in TypeScript and compiled down to C by Fedor Indutny as the successor to the old http_parser. It walks the bytes once, front to back, firing little callbacks as it recognises things: on_method, on_url, on_header_field, on_header_value, on_headers_complete. Out the far side come req.method set to GET, req.url set to /products?limit=20, and a plain object of headers.",
      why: "Hand-rolling an HTTP parser is a minefield: llhttp is fussy about lone carriage returns, duplicate Content-Length headers and chunked-encoding corner cases precisely because a proxy and an app disagreeing about where one message ends is an entire family of attacks called request smuggling.",
      component: 'llhttp (deps/llhttp), invoked from lib/_http_server.js',
      layer: 'Server userspace · L7 parsing',
      abstraction: 'Byte stream → structured request object',
      protocol: 'HTTP/1.1 (RFC 9112)',
      misconception: "You might think the request shows up as a tidy object — actually it shows up as bytes that may be split across several TCP segments or glued onto the front of the next request entirely. llhttp is built to stop and resume mid-message because where a packet ends has nothing whatsoever to do with where a request ends.",
      analogy: "A court stenographer turning a continuous stream of speech into neat numbered transcript lines, never once waiting for the speaker to finish a sentence before starting to type.",
      command: 'node -e "console.log(process.versions.llhttp)"',
      production: 'llhttp enforces max header size (16KB default, --max-http-header-size); oversized cookie storms from misbehaving clients produce 431s here, one layer before your framework ever sees the request.'
    },
    code: [
      { title: 'The bytes on fd 18', lang: 'bash', code: 'GET /products?limit=20 HTTP/1.1<CRLF>\nHost: api.shop.dev<CRLF>\nX-Forwarded-For: 203.0.113.77<CRLF>\nX-Forwarded-Proto: https<CRLF>\nConnection: keep-alive<CRLF>\naccept: application/json<CRLF>\n<CRLF>            # blank line = end of headers' },
      { title: 'llhttp callbacks fired', lang: 'c', code: 'on_message_begin()\non_method("GET")\non_url("/products?limit=20")\non_header_field("Host")   → on_header_value("api.shop.dev")\non_header_field("X-Forwarded-Proto") → on_header_value("https")\non_headers_complete()      // no body for GET\non_message_complete()' }
    ]
  },

  {
    id: 'nest-context',
    chapter: 18,
    title: 'The Nest application context (built long ago)',
    node: 'appserver',
    mode: 'remote',
    explain: {
      what: "All the expensive setting-up was done hours ago, before a single visitor arrived. The request now enters Express, which NestJS wraps around. Back at boot, NestFactory.create(AppModule) walked the whole module graph, built every provider exactly once (that is what singleton scope means), worked out which class needs which other class — the dependency-injection tree — and compiled the route table. None of that runs again per request; the request simply flows down chains that were wired up long ago.",
      why: "This is why dependency-injection frameworks earn their keep on a server: the construction cost is paid once and spread across millions of requests, the wiring is written down rather than hidden in constructors, and swapping the real ProductsService for a fake one in a test is a single line.",
      component: 'NestFactory + NestApplicationContext (@nestjs/core)',
      layer: 'Server userspace · application framework',
      abstraction: 'Inversion of control — the framework calls you',
      protocol: '—',
      misconception: "You might think the decorators run on every request — actually @Controller, @Get and @Injectable each run exactly ONCE, when the class is first defined, quietly recording routing notes via Reflect. At request time Nest only reads back what was written down.",
      analogy: "A restaurant kitchen doing its mise en place before service: onions chopped, stock simmering, everything within arm's reach. When the first order lands, nobody is out at the market.",
      protocol: 'Reflect metadata + DI container (framework-internal)',
      command: 'docker logs api | head -20   # the boot-time route map log',
      production: 'Slow cold starts in Nest are almost always eager module construction (DB pings in constructors). Move I/O into onModuleInit, and keep request-scoped providers rare — each one forces per-request subtree re-instantiation.'
    },
    code: [
      { title: 'src/main.ts', lang: 'js', code: "import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  app.setGlobalPrefix('');\n  await app.listen(3000, '0.0.0.0');\n}\nbootstrap();" }
    ]
  },

  {
    id: 'nest-middleware',
    chapter: 18,
    title: 'Middleware chain: helmet, cors, logger',
    node: 'middleware',
    mode: 'remote',
    quiz: {
      q: 'nginx forwarded this request as plaintext HTTP. How can the app still know the client originally connected over HTTPS?',
      options: [
        'It cannot — that information is lost at the proxy',
        'nginx added X-Forwarded-Proto: https, and with "trust proxy" enabled Express surfaces it as req.secure',
        'The kernel marks sockets that were ever encrypted'
      ],
      answer: 1,
      explain: 'The X-Forwarded-* headers are how the original client address and the original http-or-https choice survive the trip through a proxy. They only count if the app is told to believe them, with app.set("trust proxy", 1) — and believing them unconditionally lets any caller who reaches the app directly simply invent whatever IP address they like.'
    },
    explain: {
      what: "Before anyone asks what this request wants, it walks a short corridor of checkpoints. The request runs the Express middleware stack in the exact order the middlewares were registered: helmet stamps on defensive headers (X-Content-Type-Options, Strict-Transport-Security and friends), the CORS layer checks the Origin header against the list of sites allowed to call this API, and the logger middleware starts a stopwatch and tags the request with an id. Each one calls next() to pass the baton along — and any one of them may decide to end the request right there instead.",
      why: "Middleware is where you put the concerns that apply to everything and belong to nothing in particular: security headers, compression, body parsing, request logging — all of it settled before routing even enters the picture.",
      component: 'Express middleware stack (helmet, cors, morgan/nestjs-pino)',
      layer: 'Server userspace · L7 pipeline',
      abstraction: 'Chain of responsibility over the request object',
      protocol: 'HTTP semantics (RFC 9110)',
      misconception: "You might think the server enforces CORS — actually the server only EMITS the Access-Control-Allow-* headers, and the browser does every bit of the enforcing. curl ignores CORS completely. It is a courtesy between browsers, not a wall around your API.",
      analogy: "The checkpoints before the departure gates: ID desk, security scan, customs. Each can wave you through or stop you dead, and not one of them cares which flight you are actually booked on.",
      command: 'curl -is http://172.17.0.1:443/products?limit=20 | head -12',
      production: 'Order bugs are the classic failure: register the logger first or you will never log requests rejected by CORS; register body-parser limits early or a 50MB JSON body gets buffered before anything can refuse it.'
    },
    code: [
      { title: 'Registration order matters', lang: 'js', code: "// main.ts — runs top to bottom per request\napp.use(helmet());\napp.enableCors({ origin: ['https://shop.dev'], credentials: true });\napp.use(requestLogger);          // starts res-time timer\napp.set('trust proxy', 1);       // believe X-Forwarded-* from nginx" }
    ]
  },

  {
    id: 'nest-router',
    chapter: 18,
    title: 'Router match: GET /products → ProductsController',
    node: 'controller',
    mode: 'remote',
    explain: {
      what: "Now the request gets matched to the one function that was written to answer it. At boot, Nest's RouterExplorer turned every @Controller and @Get decorator into an Express route table. The path /products with method GET matches the pattern registered for ProductsController.findAll — a small library called path-to-regexp does the comparing — and the query string has already been unpacked into req.query, which holds limit set to the characters 20. Notice the type: at this moment it is still a STRING.",
      why: "Writing routes as decorators keeps the shape of your URLs in one searchable place, right beside the code that answers them, and lets the framework list every route at boot — which is exactly how it prints the route map at startup and how OpenAPI docs get generated for free.",
      component: 'RouterExplorer + path-to-regexp (@nestjs/core)',
      layer: 'Server userspace · L7 dispatch',
      abstraction: 'URL pattern → handler method binding',
      protocol: 'HTTP routing conventions (REST)',
      misconception: "You might think route matching is an instant dictionary lookup — actually it is an ordered walk down a list of compiled patterns, so the ORDER you register routes in genuinely matters: a greedy /:id route declared above /products/featured will swallow it whole and featured will never be reached.",
      analogy: "A theatre usher who memorised the seating chart before the doors opened: the string on your ticket maps to one exact seat, with no hunting up and down the aisle.",
      command: 'docker logs api 2>&1 | grep "Mapped"   # Nest prints: Mapped {/products, GET} route',
      production: 'Route-not-found (404) rates per path prefix are a cheap canary: a deploy that renames an endpoint shows up as a 404 cliff within seconds if you graph them.'
    },
    code: [
      { title: 'products.controller.ts', lang: 'js', code: "@Controller('products')\nexport class ProductsController {\n  constructor(private readonly products: ProductsService) {}\n\n  @Get()                       // GET /products\n  findAll(@Query() query: ListProductsDto) {\n    return this.products.findAll(query.limit);\n  }\n}" }
    ]
  },

  {
    id: 'nest-pipes-dto',
    chapter: 18,
    title: 'Guards, then pipes: "20" becomes 20, validated',
    node: 'middleware',
    mode: 'remote',
    explain: {
      what: "Someone checks the paperwork before the request is allowed any further in. Nest runs its request lifecycle in order: guards first, deciding who may enter at all (this route is public, so none are registered), then pipes, which reshape and inspect the input. The global ValidationPipe takes req.query, builds a ListProductsDto object from it, and class-transformer turns the characters 20 into the actual number 20 — URLs carry no types, so everything in them starts life as text. Then class-validator checks the rules pinned to the class: @IsInt, @Min(1), @Max(100). Anything that fails short-circuits into a 400 with a machine-readable error body, and the handler body never runs at all.",
      why: "Checking input right at the boundary means every line after this one can trust what it is holding: no defensive re-checking scattered through the services, and no LIMIT 999999 arriving at the database because somebody edited the URL bar for fun.",
      component: 'ValidationPipe (@nestjs/common) + class-validator + class-transformer',
      layer: 'Server userspace · input boundary',
      abstraction: 'Untrusted strings → typed, validated domain values',
      protocol: '—',
      misconception: "You might think TypeScript types check anything at runtime — actually they are erased the moment the code compiles. Without a real runtime validator, a query.limit declared as a number would happily contain the text 20, or the text DROP TABLE, and TypeScript would never notice. The decorators on the DTO are the part that actually executes.",
      analogy: "A doorman checking IDs at the entrance so that nobody inside the club ever has to card anyone again.",
      command: 'curl -i "http://172.17.0.1:443/products?limit=banana"   # → 400 Bad Request',
      production: 'Always set whitelist: true and forbidNonWhitelisted: true — silently accepting unknown query params is how mass-assignment bugs ship. transform: true is what makes @Type coercion actually happen.'
    },
    code: [
      { title: 'list-products.dto.ts', lang: 'js', code: "export class ListProductsDto {\n  @Type(() => Number)   // '20' → 20\n  @IsInt()\n  @Min(1)\n  @Max(100)             // cap what a URL can ask of the DB\n  limit: number = 20;\n}\n\n// main.ts\napp.useGlobalPipes(new ValidationPipe({\n  transform: true, whitelist: true, forbidNonWhitelisted: true,\n}));" }
    ]
  },

  {
    id: 'nest-controller',
    chapter: 18,
    title: 'ProductsController.findAll() executes',
    node: 'controller',
    mode: 'remote',
    explain: {
      what: "The handler finally runs, and it barely does anything — which is exactly right. Nest calls it with the validated DTO, and the controller's whole job is translation: it turns HTTP-shaped input into a plain call to the business layer, findAll(20), and will later turn the result back into an HTTP response. What it hands back is a Promise, a placeholder for a value that does not exist yet, and Nest waits on that Promise and feeds the eventual answer into the response pipeline for you.",
      why: "Keeping controllers thin separates transport worries — status codes, headers, response shapes — from actual business rules, so the same service can answer HTTP today and a GraphQL resolver or a queue consumer tomorrow without a single edit.",
      component: 'ProductsController (@nestjs/core route handler invocation)',
      layer: 'Server userspace · presentation layer',
      abstraction: 'HTTP endpoint → domain method adapter',
      protocol: 'REST conventions',
      misconception: "You might think returning a Promise from a handler needs special plumbing — actually Nest awaits it for you as a matter of course, and reaching for res.json() by hand quietly OPTS YOU OUT of the interceptors and serialization that would otherwise run.",
      analogy: "A waiter carrying your order to the kitchen. They do not cook a thing; they translate table-speak into kitchen-speak, and later kitchen-speak back into a plate in front of you.",
      command: 'docker exec api node -e "console.log(process.memoryUsage().heapUsed)"',
      production: 'Wrap handlers with p99 latency histograms per route (Prometheus + @willsoto/nestjs-prometheus) — per-route breakdown is the difference between "the API is slow" and "findAll is slow".'
    },
    code: [
      { title: 'The handler call, desugared', lang: 'js', code: "// what Nest effectively does:\nconst dto = await validationPipe.transform(req.query);\nconst result = await controller.findAll(dto);   // ← we are here\n// result: Promise<Product[]> — pending on the DB" }
    ],
    prod: {
      title: 'ToursController.findAll() executes',
      explain: { production: 'Island Tours’ version is a @Controller("tours") whose findAll returns prisma.tour.findMany — same shape, different nouns. Boring symmetry is the goal.' },
      code: [
        { title: 'tours.controller.ts', lang: 'js', code: "@Controller('tours')\nexport class ToursController {\n  constructor(private readonly tours: ToursService) {}\n\n  @Get()               // GET /tours\n  findAll() {\n    return this.tours.findAll();\n  }\n}" }
      ]
    }
  },

  {
    id: 'nest-service',
    chapter: 18,
    title: 'ProductsService: the business logic layer',
    node: 'service',
    mode: 'remote',
    explain: {
      what: "This is where the actual rules of the shop live: which products may be listed at all (published, not soft-deleted), what order they come back in, the hard ceiling on how many. The service assembles a Prisma query and awaits it. The instant that await runs, this whole chain of calls — service, controller, all of it — goes to sleep, and the node event loop is immediately free to pick up OTHER requests while Postgres does its work.",
      why: "That sleep is the entire financial argument for Node on APIs that mostly wait on I/O: one thread juggles thousands of in-flight requests, because waiting for a database costs no thread whatsoever.",
      component: 'ProductsService (@Injectable singleton)',
      layer: 'Server userspace · domain layer',
      abstraction: 'Business rules over a data-access API',
      protocol: '—',
      misconception: "You might think await blocks the server — actually it only parks THIS one request's remaining work. The event loop keeps spinning happily, which is why a slow query never freezes the API, while a single synchronous JSON.parse of a 100MB string absolutely does.",
      analogy: "A bike mechanic who glues a puncture patch, then works on three other bikes while it cures. Nobody stands watching the glue dry.",
      command: 'docker exec api node -e "const s=process.hrtime.bigint(); setImmediate(()=>console.log(Number(process.hrtime.bigint()-s)/1e6, \'ms loop lag\'))"',
      production: 'Event-loop lag (loopMonitor / perf_hooks monitorEventLoopDelay) is THE node health metric: p99 lag above ~50ms means CPU-bound work is starving every request, and no amount of pods-with-the-same-code will fix it.'
    },
    code: [
      { title: 'products.service.ts', lang: 'js', code: "@Injectable()\nexport class ProductsService {\n  constructor(private readonly prisma: PrismaService) {}\n\n  findAll(limit = 20) {\n    return this.prisma.product.findMany({\n      where: { published: true },\n      orderBy: { id: 'asc' },\n      take: limit,\n    });\n  }\n}" }
    ],
    prod: {
      title: 'ToursService: the business logic layer',
      explain: { production: 'Island Tours: return this.prisma.tour.findMany({ take: 20 }) — twenty tours, default order. Every abstraction layer above and below this line is identical to the shop.' },
      code: [
        { title: 'tours.service.ts', lang: 'js', code: "@Injectable()\nexport class ToursService {\n  constructor(private readonly prisma: PrismaService) {}\n\n  findAll() {\n    return this.prisma.tour.findMany({ take: 20 });\n  }\n}" }
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 19 — Prisma & the Connection Pool
  // ─────────────────────────────────────────────────────────────
  {
    id: 'prisma-findmany',
    chapter: 19,
    title: 'prisma.product.findMany({ take: 20 })',
    node: 'prisma',
    mode: 'remote',
    explain: {
      what: "You order from a menu that the kitchen wrote itself. The service calls the generated Prisma Client — and generated is the operative word: nobody typed this code. prisma generate read the schema.prisma file and emitted a client in which product.findMany exists as a genuine method with a genuine TypeScript signature. Calling prisma.product.findMany builds a small JSON message describing what you asked for — which model, which operation, which arguments, which fields — and hands that message to the query engine.",
      why: "Data access that the type system understands catches you selected a column that does not exist while you are still typing, rather than at three in the morning. The generated client is really just your schema, projected into TypeScript.",
      component: 'Prisma Client (@prisma/client, generated)',
      layer: 'Server userspace · data-access layer',
      abstraction: 'Typed query builder over relational SQL',
      protocol: 'Prisma internal JSON-RPC to the query engine',
      misconception: "You might think Prisma is an ORM that hides SQL from you — actually it behaves more like a typed query builder with an honest compilation step: no lazy-loading proxies doing surprise queries behind your back, and every call maps to SQL you can print and read.",
      analogy: "A menu the kitchen printed from its own stock list: you cannot order a dish that does not exist, because the menu was generated from what is actually in the pantry.",
      command: 'npx prisma generate && npx prisma studio',
      production: 'Set DEBUG="prisma:query" or the log:["query"] client option in staging so every emitted SQL statement and its duration lands in your logs — the fastest way to catch an accidental N+1.'
    },
    code: [
      { title: 'schema.prisma', lang: 'js', code: 'model Product {\n  id        Int      @id @default(autoincrement())\n  name      String\n  priceCents Int\n  published Boolean  @default(false)\n  createdAt DateTime @default(now())\n\n  @@index([published, id])\n}' },
      { title: 'The call', lang: 'js', code: "const rows = await prisma.product.findMany({\n  where:   { published: true },\n  orderBy: { id: 'asc' },\n  take:    20,\n});\n// rows: Product[] — fully typed, no `any` anywhere" }
    ],
    prod: {
      title: 'prisma.tour.findMany({ take: 20 })',
      explain: { production: 'Island Tours queries the Tour model — same client, same engine, same pool. Twenty tours, typed end to end.' },
      code: [
        { title: 'schema.prisma (Island Tours)', lang: 'js', code: 'model Tour {\n  id        Int      @id @default(autoincrement())\n  title     String\n  island    String\n  seats     Int\n  priceCents Int\n\n  @@index([island])\n}' },
        { title: 'The call', lang: 'js', code: 'const tours = await prisma.tour.findMany({ take: 20 });' }
      ]
    }
  },

  {
    id: 'prisma-engine-sql',
    chapter: 19,
    title: 'The query engine compiles it to SQL',
    node: 'prisma',
    mode: 'remote',
    explain: {
      what: "Your description of what you want gets translated into the database's own language. Prisma's query engine — for years a separate Rust program talked to over a local channel, now increasingly a WASM and TypeScript compiler running inside the same process — turns that JSON query document into real SQL. Watch what happens to take: 20: it becomes LIMIT $2, a numbered slot the value gets filled into separately, not text glued onto the end of a string. The list of columns is written out explicitly; SELECT * never appears anywhere.",
      why: "Having a real compilation step means one description of a query can be aimed at Postgres, MySQL or SQLite, and keeping values in separate numbered slots makes SQL injection structurally impossible rather than merely frowned upon.",
      component: 'Prisma query engine (query-engine, Rust/WASM)',
      layer: 'Server userspace · SQL generation',
      abstraction: 'Query AST → dialect-specific SQL',
      protocol: 'PostgreSQL SQL dialect',
      misconception: "You might think an ORM always emits terrible SQL — actually for a simple read it emits very nearly what you would have written yourself. The monstrous queries come from walking relations inside a loop, the classic N+1, and that is a problem with the shape of your code, not with the code generator.",
      analogy: "A travel agent turning a beach in July, under 800 pounds into a real itinerary with flight numbers and seat rows. You state the intent; they write the instructions, and you can always ask to see the printout.",
      command: 'DEBUG="prisma:query" node dist/main.js',
      production: 'Log slow queries on BOTH sides — Prisma’s query event gives you duration as the app sees it (including pool wait), pg_stat_statements gives you what the database saw. The delta between them IS your pool contention.'
    },
    code: [
      { title: 'Emitted SQL', lang: 'sql', code: 'SELECT "public"."Product"."id",\n       "public"."Product"."name",\n       "public"."Product"."priceCents",\n       "public"."Product"."published",\n       "public"."Product"."createdAt"\nFROM "public"."Product"\nWHERE "public"."Product"."published" = $1\nORDER BY "public"."Product"."id" ASC\nLIMIT $2 OFFSET $3;\n\n-- params: [true, 20, 0]' }
    ]
  },

  {
    id: 'pool-checkout',
    chapter: 19,
    title: 'Checking a connection out of the pool',
    node: 'pool',
    mode: 'remote',
    effects: ['pool+'],
    explain: {
      what: "The engine needs a line to the database, and it refuses to dial a new one. Opening a fresh connection means a TCP handshake, then TLS, then Postgres authentication, then the server forking a whole new process for you: tens of milliseconds, every time. So instead it borrows one of the connections opened at boot and kept warm and idle ever since. The pool is really just a counter guarding a fixed array of slots: if all connection_limit slots are in use, this request WAITS in a queue — and that waiting time is completely invisible to the database, which sees nothing at all.",
      why: "Postgres gives every connection its own operating-system process with its own working memory, so thousands of connections will flatten a database that would cheerfully have served the same traffic over twenty. The pool is the valve that protects it.",
      component: 'Prisma connection pool (default connection_limit = num_cpus * 2 + 1)',
      layer: 'Server userspace · resource pooling',
      abstraction: 'Bounded reuse of expensive kernel + server resources',
      protocol: '—',
      misconception: "You might think a bigger pool is always a faster pool — actually once you pass the database's own CPU and disk capacity, a bigger pool merely moves the queue out of your app and into Postgres, where it is harder to see and where every waiter is holding an entire process open.",
      analogy: "A library with twenty bookable study rooms. Adding a hundred more names to the waiting list does not conjure a single extra room; it only makes the list longer and the librarian sadder.",
      command: 'psql -h 10.0.0.12 -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;"',
      production: 'Set pool_timeout and alarm on it: a P2024 "timed out fetching a connection" storm means either a slow query is holding connections or you have leaked transactions. For serverless, put PgBouncer in transaction mode in front and set connection_limit=1.'
    },
    code: [
      { title: 'Pool configuration', lang: 'bash', code: '# .env — pool knobs ride on the connection URL\nDATABASE_URL="postgresql://api:***@10.0.0.12:5432/shop?connection_limit=17&pool_timeout=10&connect_timeout=5"\n\n# 17 = (8 vCPU * 2) + 1  → Prisma default heuristic' },
      { title: 'Who holds what', lang: 'sql', code: "SELECT pid, state, wait_event_type, wait_event,\n       now() - query_start AS runtime, left(query, 60)\nFROM pg_stat_activity\nWHERE datname = 'shop'\nORDER BY runtime DESC NULLS LAST;" }
    ]
  },

  {
    id: 'pg-wire-extended',
    chapter: 19,
    title: 'Parse / Bind / Execute — the extended query protocol',
    node: 'pool',
    mode: 'remote',
    packet: {
      label: 'PG wire: Parse, Bind, Describe, Execute, Sync',
      layers: ['tcp', 'payload'],
      fields: {
        tcp: { 'Src Port': '41022', 'Dst Port': '5432', 'Flags': 'PSH, ACK' },
        payload: { 'P (Parse)': 'stmt "s1" ← SELECT … LIMIT $2 OFFSET $3', 'B (Bind)': 'portal "" ← [true, 20, 0]', 'D (Describe)': 'portal ""', 'E (Execute)': 'max_rows = 0 (all)', 'S (Sync)': 'end of message group' }
      }
    },
    explain: {
      what: "The query goes across in pieces, like a template and a fill-in list sent separately. The driver speaks the PostgreSQL frontend/backend protocol version 3 in what is called EXTENDED query mode. Parse ships the SQL text with numbered blanks in it and gives the statement a name. Bind supplies the actual values for those blanks and creates a portal, which is simply a named, ready-to-run copy of the query. Execute runs that portal. Sync ends the group of messages and asks the server to report that it is ready again. Every message on this wire has the same shape: one byte saying what it is, four bytes saying how long it is, then the contents.",
      why: "Splitting the planning of a statement from the filling-in of its values means the same statement can run again with new values and never be re-parsed — and, far more importantly, the values travel in their own field, where they can never be mistaken for SQL syntax.",
      component: 'PostgreSQL wire protocol v3 (extended query)',
      layer: 'Server userspace · L7 database protocol',
      abstraction: 'Prepared statement + portal execution',
      protocol: 'PostgreSQL FE/BE protocol v3',
      misconception: "You might think prepared statements are mostly a speed trick — actually their headline benefit is safety: every parameter is a typed value living in its own field, so no amount of creative typing by a user can turn it into extra SQL.",
      analogy: "A print shop running a mail merge: one form letter with blanks, one separate list of names. A name in the list can never turn itself into an extra paragraph of the letter.",
      command: 'sudo tcpdump -i any -A "port 5432 and tcp[tcpflags] & tcp-push != 0"',
      production: 'Prepared statements are per-BACKEND, so they break through PgBouncer in transaction mode — hence pgbouncer=true in the Prisma URL, which switches the driver to unnamed statements.'
    },
    code: [
      { title: 'Message frames on the wire', lang: 'c', code: "'P'  len=0x0000006E  \"s1\\0\"  \"SELECT ... LIMIT $2 OFFSET $3\\0\"  0x0000\n'B'  len=0x00000032  \"\\0\"  \"s1\\0\"  nparams=3  [1,'t'] [2,'20'] [1,'0']\n'D'  len=0x00000006  'P'  \"\\0\"\n'E'  len=0x00000009  \"\\0\"  max_rows=0\n'S'  len=0x00000004" }
    ]
  },

  {
    id: 'pg-egress-compressed',
    chapter: 19,
    title: 'Yes — the whole kernel egress path. Again.',
    node: 'tcp',
    mode: 'remote',
    effects: ['flash', 'zoomout'],
    packet: {
      label: 'Query bytes → 10.0.0.12:5432',
      layers: ['eth', 'ip', 'tcp', 'payload'],
      fields: {
        eth: { 'Src MAC': '02:42:ac:11:00:02 (container eth0)', 'Dst MAC': '02:42:ac:11:00:01 (docker0)' },
        ip: { 'Src': '172.17.0.2 → SNAT 10.0.0.9', 'Dst': '10.0.0.12', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '41022', 'Dst Port': '5432', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "And now the whole outbound machinery you already learned, at four times speed. write() on the pooled socket drops the CPU from user privilege into kernel privilege (ring 3 to ring 0), the bytes are copied into the socket send buffer, tcp_sendmsg cuts them into segments, ip_queue_xmit bolts on the IP header, the firewall's OUTPUT and POSTROUTING hooks run — MASQUERADE rewrites the container's source address to the host's own 10.0.0.9 — the queueing discipline releases the packet, the driver hands it to the card by DMA, and it crosses the datacenter fabric to the database host, where the entire receive path then runs inside ITS kernel. About forty steps, compressed into this one panel, because you have already earned them.",
      why: "Every hop in a distributed system pays this bill in full. It is why just add another service is never free: each network call is two complete kernel traversals plus a wire, and 500 microseconds of that is very much measurable once you are doing it millions of times.",
      component: 'Full TCP/IP egress path (net/ipv4/tcp_output.c → drivers)',
      layer: 'Server kernel · L2-L4',
      abstraction: 'Everything from chapters 6-11, replayed in one breath',
      protocol: 'TCP/IP',
      misconception: "You might think a database call is one operation — actually it is a full network round trip with every bit of machinery that implies, which is why folding twenty queries into one saves far more than twenty times the cost of parsing SQL.",
      analogy: "The training montage in the middle of the film. We already sat through the whole first workout in real time, so now you get the drumbeat and a wipe cut.",
      command: 'sudo tcpdump -ni any host 10.0.0.12 and port 5432 -c 5',
      production: 'Same-AZ database latency should be ~0.2-0.5ms RTT. If your p50 query time is 3ms for a primary-key lookup, you are paying cross-AZ or cross-region tolls, not database time.'
    }
  },

  {
    id: 'pg-socket-arrival',
    chapter: 19,
    title: 'The bytes land on the Postgres socket',
    node: 'postgres',
    mode: 'remote',
    state: { proc: 'postgres backend PID 8842', sock: 'ESTABLISHED (app ↔ 10.0.0.12:5432)' },
    packet: {
      label: 'Parse/Bind/Execute queued on fd',
      layers: ['tcp', 'payload'],
      fields: {
        tcp: { 'Src Port': '41022', 'Dst Port': '5432', 'Seq': '+0x6E', 'Flags': 'PSH, ACK' },
        payload: { 'Bytes': '178', 'Messages': 'P, B, D, E, S' }
      }
    },
    explain: {
      what: "Someone has been sitting by the phone for hours, and it finally rings. On the database host the receive path finishes and the bytes are queued on a socket belonging to backend process 8842 — a dedicated Postgres process that has served this one pooled connection since the pool warmed up at boot. Until this instant PID 8842 was asleep, blocked inside secure_read waiting for something to read. The arriving data makes it runnable again, and the scheduler puts it back on a CPU.",
      why: "One server process per connection is Postgres's foundational architectural bet: strong isolation, a crash that stays contained, cheap coordination through shared memory — and precisely the reason connection counts have to be governed by a pool.",
      component: 'Postgres backend socket read (backend/libpq/pqcomm.c)',
      layer: 'Database host · userspace/kernel boundary',
      abstraction: 'Persistent per-connection server process',
      protocol: 'PostgreSQL FE/BE v3 over TCP',
      misconception: "You might think Postgres is multithreaded — actually, right through version 18, it is one whole process per connection. Moving to threads has been an open proposal for years precisely because processes are what make scaling connection counts so expensive.",
      analogy: "A taxi that has been parked outside your house with the engine off since this morning, driver already knowing your name and your usual route. You open the door and you are moving.",
      command: 'psql -h 10.0.0.12 -c "SELECT pid, backend_start, client_addr FROM pg_stat_activity WHERE pid = 8842;"',
      production: 'max_connections is a memory decision, not a throughput one: each backend reserves work_mem PER SORT NODE. 500 connections × 4MB work_mem × 3 sorts is 6GB of possible allocation nobody budgeted for.'
    }
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 20 — Inside PostgreSQL
  // ─────────────────────────────────────────────────────────────
  {
    id: 'pg-backend-process',
    chapter: 20,
    title: 'Backend PID 8842: forked long ago by the postmaster',
    node: 'postgres',
    mode: 'remote',
    state: { proc: 'postgres backend PID 8842' },
    explain: {
      what: "This process was born for you, and it will die with you. The postmaster — the supervisor process that owns the block of shared memory everyone else works out of — accepted this connection back when the pool warmed up, made a copy of itself (that is what forking means), and that copy ran the authentication handshake using scram-sha-256, set up the search path, and has been this connection's private server ever since. Working beside it are the household staff: the checkpointer, the WAL writer, the autovacuum launcher, the background writer, the stats collector.",
      why: "Giving every session its own process means its own memory and its own blast radius: if a backend crashes, it is cleaned up and the whole cluster restarts into recovery rather than quietly serving corrupted data.",
      component: 'postmaster + backend (backend/postmaster/postmaster.c)',
      layer: 'Database host · process architecture',
      abstraction: 'Process-per-session with shared memory',
      protocol: '—',
      misconception: "You might think connections are cheap and you should just open more — actually each one is a forked process carrying roughly 10MB of resident memory plus its own catalog caches. Going from 100 connections to 1000 very often makes total throughput go DOWN, because context switching and lock contention eat everything you thought you gained.",
      analogy: "A law firm that assigns you one solicitor for the entire life of your case, while every solicitor in the building works out of the same shared file room.",
      command: 'ps -eo pid,comm,args | grep "^ *8842\\|postgres:"',
      production: 'Watch for "FATAL: sorry, too many clients already" — it means max_connections is hit and your pool math (pods × connection_limit) exceeded the server. Count pods, not processes.'
    },
    code: [
      { title: 'The process family', lang: 'bash', code: 'postgres: checkpointer\npostgres: background writer\npostgres: walwriter\npostgres: autovacuum launcher\npostgres: logical replication launcher\npostgres: api shop 10.0.0.9(41022) idle      <- PID 8842, ours\npostgres: api shop 10.0.0.9(41024) idle' }
    ]
  },

  {
    id: 'pg-parse-analyze',
    chapter: 20,
    title: 'Parser and analyzer: text → parse tree → query tree',
    node: 'postgres',
    mode: 'remote',
    explain: {
      what: "First Postgres checks that the sentence is grammatical; only then does it check that the words refer to real things. The raw SQL text runs through the grammar files (scan.l and gram.y, fed to the classic flex and bison tools) and comes out as a parse tree: pure structure, no meaning attached. Then the analyzer walks that tree looking things up in the catalog, the database's own set of tables describing itself. Is there really a table called Product? That is pg_class. What columns does it have, and of what types? pg_attribute. Is this user even allowed to read it? pg_class.relacl. What emerges is a Query tree in which every name has been replaced by the internal id of the actual object.",
      why: "Separating grammar from meaning is exactly why Postgres can tell you that column p.nmae does not exist and then helpfully suggest p.name — by the time it fails, it already knows the full list of columns that DO exist.",
      component: 'Parser + analyzer (backend/parser/analyze.c)',
      layer: 'Database · query pipeline stage 1',
      abstraction: 'SQL text → semantically resolved query tree',
      protocol: 'SQL:2016 dialect',
      misconception: "You might think a prepared statement never gets parsed again — actually parsing happens once per named statement per BACKEND process. Reconnect, or simply land on a different pooled connection next time, and the whole thing is parsed from scratch.",
      analogy: "A proofreader who first checks a sentence reads properly, then goes through the staff directory confirming that every person named in it actually works here.",
      command: 'psql -c "SELECT oid, relname, relkind, reltuples FROM pg_class WHERE relname = \'Product\';"',
      production: 'Catalog bloat from thousands of temp tables makes this stage slow in a way no EXPLAIN will show. If parse time creeps, check pg_class row counts and vacuum the catalogs.'
    },
    code: [
      { title: 'Catalog lookups behind the scenes', lang: 'sql', code: 'SELECT c.oid, c.relname, c.relpages, c.reltuples\nFROM pg_class c\nJOIN pg_namespace n ON n.oid = c.relnamespace\nWHERE n.nspname = \'public\' AND c.relname = \'Product\';\n--   oid  | relname | relpages | reltuples\n-- -------+---------+----------+-----------\n--  16412 | Product |      894 |    121430' }
    ]
  },

  {
    id: 'pg-planner',
    chapter: 20,
    title: 'The planner: cost-based, not rule-based',
    node: 'planner',
    mode: 'remote',
    quiz: {
      q: 'A query returns 20 rows with LIMIT 20 but still takes 4 seconds. What is the most likely explanation?',
      options: [
        'LIMIT is applied by the client, so all rows crossed the network',
        'The plan must fully materialize and sort (or aggregate) before it can know which 20 rows to return',
        'LIMIT disables index usage'
      ],
      answer: 1,
      explain: 'LIMIT can stop early only when the rows are already arriving in the order you asked for, which normally means an index scan that matches your ORDER BY. If the plan has to sort, group, or build a hash table first, it must chew through every single input row before it can produce even one output row — and then LIMIT throws almost all of that work away. Lining your index up with your ORDER BY is what turns a four-second query into a 0.2 millisecond one.'
    },
    explain: {
      what: "There is more than one way to fetch twenty rows, so Postgres prices each one and buys the cheapest. The planner lists the candidate plans and puts a number on every one, using the statistics it keeps about your data in pg_statistic together with a handful of tunable cost constants: reading a page in order costs 1.0 (seq_page_cost), jumping to a random page costs 4.0 (random_page_cost), examining a row costs 0.01 (cpu_tuple_cost). Here it weighs reading all 894 pages of the table and then sorting them, against walking the composite index, which already hands rows back in id order. The index wins by a mile, because ORDER BY id ASC with LIMIT 20 lets it stop dead after twenty rows.",
      why: "Pricing plans rather than following fixed rules is why the same SQL can choose a different strategy as your data grows: at 100 rows reading the whole table really is cheapest, and at 121,430 rows it is not. Postgres decides afresh every single time.",
      component: 'Planner/optimizer (backend/optimizer/plan/planner.c)',
      layer: 'Database · query pipeline stage 2',
      abstraction: 'Search the plan space, minimize estimated cost',
      protocol: '—',
      misconception: "You might think the planner uses your indexes because they exist — actually it uses them only when it BELIEVES they are cheaper. Out-of-date statistics, typically because nobody ran ANALYZE after a bulk load, routinely convince it to read the entire table while a perfect index sits there unused.",
      analogy: "A sat-nav choosing between routes purely on predicted arrival time, with no loyalty to the road you like, and happily re-routing the moment the traffic data changes.",
      command: 'EXPLAIN (ANALYZE, BUFFERS, COSTS) SELECT * FROM "Product" WHERE published ORDER BY id LIMIT 20;',
      production: 'random_page_cost=4.0 is a spinning-disk default. On NVMe, 1.1 is the standard tuning and it flips many seq scans into index scans. Also raise default_statistics_target for skewed columns.'
    },
    code: [
      { title: 'EXPLAIN (ANALYZE, BUFFERS)', lang: 'sql', code: 'Limit  (cost=0.42..2.31 rows=20 width=68)\n       (actual time=0.019..0.104 rows=20 loops=1)\n  Buffers: shared hit=6 read=1\n  ->  Index Scan using "Product_published_id_idx" on "Product"\n        (cost=0.42..11482.60 rows=121430 width=68)\n        (actual time=0.017..0.095 rows=20 loops=1)\n        Index Cond: (published = true)\n        Buffers: shared hit=6 read=1\nPlanning Time: 0.183 ms\nExecution Time: 0.139 ms' },
      { title: 'The plan it rejected', lang: 'sql', code: '-- SET enable_indexscan = off;  → what a seq scan would cost\nLimit  (cost=13884.21..13884.26 rows=20 width=68)\n  ->  Sort  (cost=13884.21..14187.79 rows=121430 width=68)\n        Sort Key: id\n        ->  Seq Scan on "Product"  (cost=0.00..10653.30 rows=121430)\n              Filter: published\n-- 13884 vs 2.31: not close.' }
    ]
  },

  {
    id: 'pg-executor',
    chapter: 20,
    title: 'The executor pulls tuples through the plan tree',
    node: 'executor',
    mode: 'remote',
    explain: {
      what: "Nothing happens until somebody asks for it. ExecutorRun walks the plan as a chain of nodes that pull from each other on demand — an old design known as the Volcano model. The Limit node asks its child for one row, the Index Scan node produces one row, and that call-and-answer repeats. Nothing is built up front and stored. After the twentieth row the Limit node simply stops asking, and the index scan is abandoned right where it stands, with 121,410 rows never so much as looked at.",
      why: "Pulling rather than pushing is why LIMIT can be almost free on a well-indexed query: the executor never does a scrap of work that nobody asked for.",
      component: 'Executor (backend/executor/execMain.c, ExecProcNode)',
      layer: 'Database · query pipeline stage 3',
      abstraction: 'Iterator pipeline over plan nodes',
      protocol: '—',
      misconception: "You might think the database works out the whole answer and then trims it down — actually only the blocking steps behave that way, the ones that must see everything before they can produce anything: Sort, Hash, Aggregate. Every streaming step passes rows up one at a time and is perfectly happy to be told to stop.",
      analogy: "A line of pickers passing apples up from a crate, one apple at a time. The person at the top counts to twenty, says stop, and everyone below simply puts their hands down.",
      command: 'EXPLAIN (ANALYZE, VERBOSE) ...   -- "loops=1, rows=20" reveals early exit',
      production: 'A plan node with actual rows wildly different from estimated rows is your smoking gun for a bad plan — the ratio is what auto_explain and pganalyze alert on.'
    },
    code: [
      { title: 'Executor call chain', lang: 'c', code: 'exec_execute_message()\n  → ExecutorRun()\n      → ExecutePlan()\n          → ExecProcNode(LimitState)\n              → ExecProcNode(IndexScanState)\n                  → index_getnext_slot()\n                      → btgettuple()          /* B-tree AM */\n                          → ReadBuffer()      /* next step */' }
    ]
  },

  {
    id: 'pg-btree-descent',
    chapter: 20,
    title: 'Descending the B-tree',
    node: 'executor',
    mode: 'remote',
    explain: {
      what: "Finding one row among 121,000 takes three reads, not 121,000. The index is a B-tree — a fat, shallow tree built out of 8 KB pages — and for this table it is three levels deep: root, then an internal page, then a leaf. The scan reads the root, searches its keys for published = true, follows the pointer down to an internal page, searches again, and arrives at a leaf page. The leaf holds pairs of (key, ctid), where the ctid is the physical address of the actual row: which block of the table file, and which slot inside it. Leaf pages are chained together left to right, so once you have landed, reading the rows in order is just walking the chain.",
      why: "Three page reads to pinpoint any row among a hundred thousand, plus a fourth to go and fetch it, is the entire reason indexes exist. The depth grows agonisingly slowly: a billion rows is still only about five levels.",
      component: 'nbtree access method (backend/access/nbtree/nbtsearch.c)',
      layer: 'Database · storage access method',
      abstraction: 'Ordered, balanced, block-oriented search structure',
      protocol: 'Lehman-Yao B-link tree (concurrent, lock-coupled)',
      misconception: "You might think an index scan only ever reads the index — actually, unless the query can be answered from the index alone AND Postgres already knows those table pages are safe for everyone to see, every match also costs a jump into the table itself to check whether that row version is visible to you.",
      analogy: "A library card catalogue: three drawers of narrowing alphabetical dividers get you to one card, and the card tells you the shelf and the row. You still have to walk to the shelf.",
      command: 'CREATE EXTENSION pageinspect; SELECT * FROM bt_metap(\'"Product_published_id_idx"\');',
      production: 'Watch index bloat with pgstattuple: churned tables leave leaf pages half-empty, which quietly doubles the pages you must read. REINDEX CONCURRENTLY is the online fix.'
    },
    code: [
      { title: 'B-tree shape', lang: 'sql', code: "SELECT * FROM bt_metap('\"Product_published_id_idx\"');\n--  magic  | version | root | level | fastroot | fastlevel\n-- --------+---------+------+-------+----------+-----------\n--  340322 |       4 |  412 |     2 |      412 |         2\n-- level 2 = root + internal + leaf  →  3 page reads to a leaf" }
    ]
  },

  {
    id: 'pg-sharedbuf-hit',
    chapter: 20,
    title: 'shared_buffers: six pages HIT',
    node: 'sharedbuf',
    mode: 'remote',
    effects: ['flash'],
    state: { mem: 'kernel' },
    explain: {
      what: "Most of the pages this query needs are already sitting in memory, put there by earlier queries. Every request for a page goes through ReadBuffer, which takes the page's identity — which file, which block number — and looks it up in a hash table inside shared_buffers, the slab of memory every Postgres process shares. Six of our seven pages are already there: the B-tree root, the internal pages, and the busiest table pages. A hash probe, a pin so nobody evicts it while we look, a bump to its usage counter, and the pointer comes back in nanoseconds. That is precisely what Buffers: shared hit=6 was telling you in the EXPLAIN output.",
      why: "shared_buffers is Postgres keeping its own private page cache, usually sized at about 25% of the machine's RAM. Finding a page there skips not just the disk but even the system call into the operating system's cache.",
      component: 'Buffer manager (backend/storage/buffer/bufmgr.c)',
      layer: 'Database · shared memory cache',
      abstraction: 'Pinned, reference-counted page cache with clock-sweep eviction',
      protocol: '—',
      misconception: "You might think shared_buffers should simply be as large as you can make it — actually Postgres deliberately leans on the operating system's cache as a second tier, and oversizing shared_buffers ends up keeping the same page in both caches while making checkpoint write storms longer and nastier.",
      analogy: "Ingredients already laid out on the chef's counter versus ingredients in the walk-in fridge. The counter is instant, and the counter is small.",
      command: 'CREATE EXTENSION pg_buffercache;\nSELECT c.relname, count(*) AS buffers\nFROM pg_buffercache b JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)\nGROUP BY 1 ORDER BY 2 DESC LIMIT 10;',
      production: 'Cache hit ratio below ~99% on an OLTP workload means your working set exceeds shared_buffers. Compute it from pg_stat_database: blks_hit / (blks_hit + blks_read).'
    },
    code: [
      { title: 'Buffer lookup', lang: 'c', code: 'ReadBuffer(rel, blockNum)\n  → BufTableLookup(&tag, hashcode)     /* shared hash table */\n      hit  → PinBuffer() → usage_count++ → return\n      miss → BufferAlloc() → clock sweep for a victim → smgrread()' }
    ]
  },

  {
    id: 'pg-buffer-miss',
    chapter: 20,
    title: 'One page MISSES — down to the OS page cache',
    node: 'memmap',
    mode: 'remote',
    effects: ['queue+'],
    state: { mem: 'copy' },
    explain: {
      what: "One page out of seven is not on the counter, so someone has to go and fetch it. That seventh page is a table block holding a few of our twenty rows, and it is not in shared_buffers. The buffer manager first has to free a slot: it runs the clock sweep, walking round the buffers knocking each usage count down by one until it finds one at zero, and evicts that. Then it calls smgrread, which becomes pread(fd, buf, 8192, offset) — read me exactly one 8 KB page from this file at this offset. That call enters the kernel and lands in the operating system's own page cache, which very probably already holds the block, so what actually happens is a memory copy from the kernel's cache into the shared buffer. No disk is touched at all.",
      why: "Having two tiers of cache means that missing shared_buffers usually still costs microseconds rather than milliseconds — and it is exactly why Postgres does not try to claim all of RAM for itself.",
      component: 'smgr → pread(2) → kernel page cache (mm/filemap.c)',
      layer: 'Database ↔ kernel · storage I/O',
      abstraction: 'Two-level caching: process cache over OS cache',
      protocol: '—',
      misconception: "You might think shared hit=0 means the query went to disk — actually it only means the query left shared_buffers. The read may well have been served entirely from the operating system's cache at memory speed; turning on track_io_timing is what lets you tell the two apart.",
      analogy: "The item is not on the picking shelf, so a runner walks it down from the mezzanine racking. Still the same warehouse, still under a minute.",
      command: 'SET track_io_timing = on;  -- then EXPLAIN (ANALYZE, BUFFERS) reports I/O Timings',
      production: 'Do not fear a warm page cache: after a Postgres restart the first minutes are slow because BOTH caches are cold. pg_prewarm can preload critical relations during a maintenance window.'
    },
    code: [
      { title: 'The syscall', lang: 'c', code: 'pread64(fd=42 /* base/16384/16412 */,\n        buf=0x7f2a1c003000,\n        count=8192,\n        offset=6127616)          /* block 748 * 8192 */\n  = 8192                        /* page-cache hit: ~2us */' }
    ]
  },

  {
    id: 'pg-disk-read',
    chapter: 20,
    title: 'When even the page cache misses: actual disk',
    node: 'disk',
    mode: 'remote',
    effects: ['queue-', 'irq'],
    explain: {
      what: "If the operating system does not have the block either, we finally have to disturb an actual physical device. The kernel builds a block-layer request: the filesystem translates the position in the file into a logical block address on the drive, the request joins the mq-deadline queue, the NVMe driver rings a doorbell register to tell the device there is work, and the drive itself writes 8192 bytes straight into memory by DMA. When it is finished it raises an interrupt, the page is marked as current, and the pread call finally returns. On NVMe that whole trip is roughly 80 to 100 microseconds. On a spinning hard disk it is 5 to 10 milliseconds, fifty times slower.",
      why: "This is the only step in the entire chapter that touches physical media, and on a healthy transactional system it is also the rarest. Most database performance work is, at heart, the art of never getting here.",
      component: 'Block layer + NVMe driver (block/blk-mq.c, drivers/nvme/)',
      layer: 'Database host · kernel block I/O',
      abstraction: 'File offset → LBA → device queue → DMA',
      protocol: 'NVMe over PCIe',
      misconception: "You might think SSDs made disk reads free — actually an NVMe read is still about 100 microseconds, which is roughly 300,000 CPU cycles doing nothing. A query that makes 10,000 scattered reads spends a full second purely waiting, no matter how fast the processor is.",
      analogy: "A hospital sending a sample to the lab in the far wing. It goes by trolley, not by post, but it is still a physical journey to another building.",
      command: 'sudo biolatency-bpfcc 5 1     # BCC: block I/O latency histogram',
      production: 'effective_io_concurrency (200+ on NVMe) enables prefetch for bitmap heap scans. Watch pg_stat_database.blk_read_time — if it dominates total query time, you are I/O bound and more CPU will not help.'
    },
    code: [
      { title: 'I/O timings in EXPLAIN', lang: 'sql', code: 'Buffers: shared hit=6 read=1\nI/O Timings: shared read=0.094 ms\n-- 0.094ms for one 8KB page = page cache, not disk.\n-- A true NVMe read shows ~0.1ms; SATA SSD ~0.3ms; HDD ~8ms.' }
    ]
  },

  {
    id: 'pg-mvcc',
    chapter: 20,
    title: 'MVCC: is this row version visible to ME?',
    node: 'postgres',
    mode: 'remote',
    explain: {
      what: "The table may hold several versions of the same row, and the database has to work out which one belongs to you. Every stored row carries two stamps: xmin, the id of the transaction that created it, and xmax, the id of the transaction that deleted it, if one has. When our statement began it took a snapshot — a note of which transactions were still in progress at that instant and where the numbering had reached. For each candidate row, the function HeapTupleSatisfiesMVCC asks two questions: had the creating transaction already committed when my snapshot was taken, and is the deleting transaction either absent or not yet committed? Only then is the row yours to see. Rows being changed right now by somebody else's open transaction are quietly skipped, and you get the previous version instead.",
      why: "This is how readers never block writers and writers never block readers. Nobody has to take a lock on a row merely to read it, which is the single biggest reason Postgres copes so gracefully with mixed workloads.",
      component: 'MVCC visibility (backend/access/heap/heapam_visibility.c)',
      layer: 'Database · transaction isolation',
      abstraction: 'Multi-version concurrency control over snapshots',
      protocol: 'Snapshot isolation (READ COMMITTED default)',
      misconception: "You might think DELETE frees space straight away — actually it only writes an xmax stamp. The dead row stays exactly where it is until VACUUM can prove that no snapshot anywhere could still need it, which is how a table ends up 90% dead rows and GROWS while you delete from it.",
      analogy: "You photographed the price list on the noticeboard at nine this morning. People have been pinning up changes all day; you keep reading your photo, and it stays consistent from top to bottom.",
      command: 'SELECT xmin, xmax, ctid, id FROM "Product" LIMIT 5;',
      production: 'Long-running transactions are the silent killer: they hold back the xmin horizon so VACUUM cannot reclaim anything cluster-wide. Alarm on max(now() - xact_start) and set idle_in_transaction_session_timeout.'
    },
    code: [
      { title: 'Tuple headers', lang: 'sql', code: 'SELECT ctid, xmin, xmax, id, name FROM "Product"\nWHERE published ORDER BY id LIMIT 3;\n--   ctid   |  xmin  | xmax | id |    name\n-- ---------+--------+------+----+-------------\n--  (0,1)   | 918233 |    0 |  1 | Wool Runner\n--  (0,2)   | 918233 |    0 |  2 | Linen Tote\n--  (748,4) | 991402 |    0 |  3 | Cedar Board\n-- xmax = 0 → alive; our snapshot sees all three.' }
    ]
  },

  {
    id: 'pg-wal-note',
    chapter: 20,
    title: 'No WAL for a read (almost)',
    node: 'wal',
    mode: 'remote',
    explain: {
      what: "A read changes nothing, so it writes nothing to the log — almost. The write-ahead log, the WAL, is where Postgres records changes before they reach the data files, and a SELECT has no changes to record. But it can still leave a mark. The first reader to notice that a row's creating transaction has since committed scribbles that fact onto the page as a hint bit called HEAP_XMIN_COMMITTED, so that every later reader can skip going off to check the commit log. Scribbling on a page IS a modification, so if wal_log_hints or page checksums are switched on, that scribble emits a full copy of the page into the WAL. Which is the honest answer to why is my read-only query writing.",
      why: "The WAL is Postgres's promise about durability: write-ahead means the log record reaches safe storage before the data page does, so a crash can always be replayed forward. Reads normally sit entirely outside that promise.",
      component: 'WAL writer + hint bits (backend/access/transam/xlog.c)',
      layer: 'Database · durability layer',
      abstraction: 'Write-ahead logging',
      protocol: 'ARIES-style physical logging',
      misconception: "You might think a SELECT never writes anything — actually setting those hint bits after a bulk load makes the very first scan of fresh data measurably slower and leaves pages needing to be written back. It is the classic mystery of why the first query after an import is the slow one.",
      analogy: "A librarian who pencils the word checked in a book's margin while reading it. The story has not changed, but this copy no longer matches the one in the archive.",
      command: 'SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());',
      production: 'WAL volume drives replication lag and backup size. synchronous_commit=off trades a few hundred ms of durability for a huge write-throughput win — legitimate for analytics, negligent for payments.'
    }
  },

  {
    id: 'pg-datarow',
    chapter: 20,
    title: 'Twenty rows become twenty DataRow messages',
    node: 'executor',
    mode: 'remote',
    packet: {
      label: 'RowDescription + 20 × DataRow + CommandComplete',
      layers: ['tcp', 'payload'],
      fields: {
        payload: { 'T (RowDescription)': '5 fields: id int4, name text, priceCents int4, published bool, createdAt timestamptz', 'D (DataRow) ×20': 'length-prefixed text-format values', 'C (CommandComplete)': 'SELECT 20', 'Z (ReadyForQuery)': 'status = I (idle)' }
      }
    },
    explain: {
      what: "Rows stored as compact binary on disk have to be turned into something sendable. Each qualifying row is passed through the output function for its type — int4out for integers, textout for text, timestamptzout for timestamps — and wrapped in a DataRow message: for every column, a byte count and then the bytes themselves. Ahead of all twenty comes a single RowDescription announcing the columns and the internal id of each column's type. Behind them comes CommandComplete carrying the tag SELECT 20, and finally ReadyForQuery, meaning the backend is free again.",
      why: "Sending rows one at a time means the client can start working before the server has finished — and it is exactly why a cursor can page through billions of rows without the server having to hold them all in memory.",
      component: 'printtup destination receiver (backend/access/common/printtup.c)',
      layer: 'Database · result serialization',
      abstraction: 'Tuple → typed wire message',
      protocol: 'PostgreSQL FE/BE v3 (DataRow)',
      misconception: "You might think the database sends numbers as binary — actually by default it sends TEXT, so the number 1234 crosses the wire as the four characters 1, 2, 3, 4. A binary format does exist, but drivers have to ask for it explicitly, column by column.",
      analogy: "Reading a ledger down the telephone line by line, having first read out the column headings so the person at the other end knows what each figure means.",
      command: 'psql -c "\\\\timing" -c "SELECT * FROM \\"Product\\" LIMIT 20;"',
      production: 'Wide SELECT * results dominate wire time on large result sets. Selecting only needed columns cuts both serialization CPU and network bytes — the cheapest optimization nobody makes.'
    },
    code: [
      { title: 'DataRow on the wire', lang: 'c', code: "'T' len=... nfields=5\n     \"id\" tableoid=16412 attnum=1 typoid=23 (int4) fmt=0\n     \"name\" ... typoid=25 (text) fmt=0\n'D' len=0x00000039 ncols=5\n     [4] \"1\"  [11] \"Wool Runner\"  [5] \"12900\"  [1] \"t\"  [29] \"2026-01-14 09:12:44.181+00\"\n... ×20 ...\n'C' len=0x0000000D \"SELECT 20\\0\"\n'Z' len=0x00000005 'I'" }
    ]
  },

  {
    id: 'pg-result-send',
    chapter: 20,
    title: 'The result heads back over the socket',
    node: 'postgres',
    mode: 'remote',
    from: 'executor',
    effects: ['flash'],
    packet: {
      label: '~3.4 KB of result rows → 10.0.0.9:41022',
      layers: ['eth', 'ip', 'tcp', 'payload'],
      fields: {
        ip: { 'Src': '10.0.0.12', 'Dst': '10.0.0.9', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '5432', 'Dst Port': '41022', 'Flags': 'PSH, ACK' },
        payload: { 'Bytes': '3412', 'Messages': 'T, D×20, C, Z' }
      }
    },
    explain: {
      what: "The backend empties its output buffer with a send() on the connection socket, then loops straight back round to waiting for the next message. Total time spent inside Postgres: about 0.4 milliseconds — 0.18ms deciding on a plan, 0.14ms running it, and the remainder turning rows into bytes. Those bytes now retrace the whole datacenter route: out through the kernel on the database host, in through the kernel on the app host, and into the pooled socket where the query engine has been waiting all this time.",
      why: "Saying the number out loud matters: under half a millisecond of database time inside a request the user experiences as roughly 250 milliseconds tells you very clearly where NOT to spend your optimisation budget.",
      component: 'Backend socket flush (backend/libpq/pqcomm.c internal_flush)',
      layer: 'Database host · L4 egress',
      abstraction: 'Result set → TCP byte stream',
      protocol: 'PostgreSQL FE/BE v3 over TCP',
      misconception: "You might think a 0.4ms query means a fast endpoint — actually you still have to add waiting for a pooled connection, two network crossings, turning rows into objects, turning objects into JSON, and every proxy hop on the way out. The database is very often the thinnest slice of the pie.",
      analogy: "The kitchen plates the dish in forty seconds. The food still has to cross the dining room, and someone still has to find the right table.",
      command: 'psql -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"',
      production: 'pg_stat_statements is non-negotiable in production: it is the only view that tells you which statement text — normalized — is burning your database, ranked by total time rather than by whoever complained loudest.'
    }
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 21 — The Response: database → edge
  // ─────────────────────────────────────────────────────────────
  {
    id: 'prisma-hydrate',
    chapter: 21,
    title: 'Prisma hydrates rows into JavaScript objects',
    node: 'prisma',
    mode: 'remote',
    state: { mem: 'user' },
    explain: {
      what: "Bytes become things you can actually use. The query engine reads the DataRow messages and converts every value according to the type ids that arrived in the RowDescription: int4 becomes a JavaScript number, text becomes a string, bool becomes true or false, timestamptz becomes a Date object. Twenty ordinary objects are allocated in V8's heap, shaped exactly the way the generated TypeScript type promised they would be. If your schema said so, Prisma also renames snake_case database columns back into camelCase fields on the way through.",
      why: "Type mapping is where an ORM earns its keep and also where it can quietly betray you: JavaScript numbers are floating-point doubles, so large integers and exact decimals cannot survive the round trip — which is exactly why Prisma hands back BigInt and Decimal wrapper objects instead.",
      component: 'Prisma query engine result deserialization',
      layer: 'Server userspace · data mapping',
      abstraction: 'Wire rows → typed domain objects',
      protocol: 'PostgreSQL type OIDs → JS types',
      misconception: "You might think the database returns objects — actually it returns bytes. Every object you are holding is memory your own process chose to allocate, which is why selecting a million rows runs your app out of memory rather than the database.",
      analogy: "Flat-pack furniture arriving in a box: it travelled as flat panels and a bag of screws, and it only becomes a wardrobe once someone assembles it in the room.",
      command: 'node --expose-gc -e "console.log(process.memoryUsage())"',
      production: 'Cap result sizes at the query layer, never in application code. A missing take on a table that grew to 10M rows is the single most common Node OOM in production.'
    },
    code: [
      { title: 'The hydrated array', lang: 'js', code: "[\n  { id: 1, name: 'Wool Runner', priceCents: 12900,\n    published: true, createdAt: 2026-01-14T09:12:44.181Z },\n  { id: 2, name: 'Linen Tote',  priceCents: 6400, ... },\n  // ... 18 more\n]\n// typeof rows[0].createdAt  → 'object' (Date)\n// typeof rows[0].priceCents → 'number'" }
    ]
  },

  {
    id: 'pool-release',
    chapter: 21,
    title: 'Connection returned to the pool; the await resumes',
    node: 'pool',
    mode: 'remote',
    effects: ['pool-', 'ctx'],
    explain: {
      what: "The borrowed connection goes straight back on the rack. The engine returns it to the pool, the slot is freed, and any request that was queued behind it is woken that instant. The Promise created way back in ProductsService is now resolved, the work that was waiting on it is put on the microtask queue, and the event loop picks the suspended async function up exactly where it left off. The service hands the array of twenty products to the controller; the controller hands it back to Nest.",
      why: "Giving the connection back promptly is what lets a pool of just 17 serve thousands of requests a second: the resource that actually matters is how long each borrower holds on, not how many slots there are.",
      component: 'Pool release + V8 microtask queue',
      layer: 'Server userspace · concurrency',
      abstraction: 'Resource lease ends; continuation resumes',
      protocol: '—',
      misconception: "You might think await picks up the moment the data arrives — actually it picks up when the event loop next reaches its microtask checkpoint. If some synchronous handler is hogging the thread, your perfectly resolved Promise simply queues like everyone else.",
      analogy: "Handing the rental car keys back the minute you park, rather than at the end of the fortnight. The next customer drives away immediately instead of staring at a full car park.",
      command: 'node --trace-event-categories node.async_hooks dist/main.js',
      production: 'The killer anti-pattern is holding a pooled connection across an unrelated await (an HTTP call inside a transaction). Keep transactions short and never do network I/O inside one.'
    },
    code: [
      { title: 'What resumes', lang: 'js', code: "// ProductsService.findAll — suspended since chapter 19\nconst rows = await this.prisma.product.findMany({ ... });\n//            ^ execution resumes HERE, on the same call stack shape\nreturn rows;   // → ProductsController.findAll → Nest response pipeline" }
    ]
  },

  {
    id: 'nest-serialize',
    chapter: 21,
    title: 'Interceptors, then JSON.stringify',
    node: 'service',
    mode: 'remote',
    from: 'pool',
    explain: {
      what: "Before anything leaves the building, someone edits out the parts the public should never see. Nest now runs the outbound half of its lifecycle: interceptors get to wrap the handler's result, and the ClassSerializerInterceptor strips every field marked @Exclude — internal supplier cost, supplier ids — applies any @Transform rules, and turns Date objects into plain ISO-8601 strings. Then the framework calls res.json(). Express sets Content-Type to application/json; charset=utf-8 and runs JSON.stringify over the array, producing roughly 14 kilobytes of UTF-8 text.",
      why: "Serialization is the last gate before your data crosses out of your trust boundary, and the difference between an API and a data leak is very often one missing @Exclude decorator.",
      component: 'ClassSerializerInterceptor + Express res.json',
      layer: 'Server userspace · L7 serialization',
      abstraction: 'Domain objects → transport representation',
      protocol: 'JSON (RFC 8259), UTF-8',
      misconception: "You might think JSON.stringify is cheap — actually it is synchronous and its cost grows straight in line with the size of the data. Stringifying a 50MB payload freezes the event loop for hundreds of milliseconds and stalls EVERY other request being handled by that process.",
      analogy: "A press officer turning the internal memo into a public statement, quietly deleting the paragraphs that were never meant to leave the office.",
      command: 'curl -s http://172.17.0.1:443/products?limit=20 | jq ". | length"',
      production: 'For large payloads prefer streaming serializers or pagination over one giant stringify. And measure: response serialization frequently outweighs the query in flame graphs of "slow" endpoints.'
    },
    code: [
      { title: 'Exclusions in the entity', lang: 'js', code: "export class ProductEntity {\n  id: number;\n  name: string;\n  priceCents: number;\n\n  @Exclude()  supplierCostCents: number;   // never leaves the building\n  @Exclude()  internalNotes: string;\n\n  @Transform(({ value }) => value.toISOString())\n  createdAt: Date;\n}\n\n// main.ts\napp.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));" },
      { title: 'The bytes produced', lang: 'js', code: '[{"id":1,"name":"Wool Runner","priceCents":12900,"published":true,\n  "createdAt":"2026-01-14T09:12:44.181Z"}, ... ]\n// 14,208 bytes, Content-Type: application/json; charset=utf-8' }
    ],
    prod: {
      title: 'Serializing twenty tours',
      explain: { production: 'Island Tours excludes internal margin fields the same way and ships ~11KB of JSON. Caddy will gzip it on the way out (Nest can skip compression entirely when the proxy owns it).' },
      code: [
        { title: 'The response body', lang: 'js', code: '[{"id":1,"title":"Sunset Catamaran","island":"Maui","seats":18,\n  "priceCents":8900}, ... 19 more ]' }
      ]
    }
  },

  {
    id: 'nest-write-syscall',
    chapter: 21,
    title: 'write() — and the whole egress path once more',
    node: 'appserver',
    mode: 'remote',
    effects: ['flash', 'zoomout'],
    state: { mode: 'kernel', mem: 'copy' },
    packet: {
      label: 'HTTP/1.1 200 OK + 14,208 bytes',
      layers: ['ip', 'tcp', 'http'],
      fields: {
        ip: { 'Src': '172.17.0.2', 'Dst': '172.17.0.1', 'TTL': '64' },
        tcp: { 'Src Port': '3000', 'Dst Port': '52814', 'Flags': 'PSH, ACK' },
        http: { 'Status': '200 OK', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '14208', 'X-Powered-By': 'Express', 'ETag': 'W/"3780-lFj9Kk1L"' }
      }
    },
    explain: {
      what: "Node writes the status line, the headers, and all 14,208 bytes of body to fd 18. The CPU drops from user privilege into kernel privilege, copy_from_user moves the bytes into the socket's send buffer, tcp_sendmsg chops them into ten packets each as large as this link allows, and the container's network stack pushes them out of eth0. Yes: the entire outbound path once more, compressed into one panel. You have earned the montage twice over by now.",
      why: "Ten segments is the first time in this whole story we have sent enough data for TCP's flow control to have an opinion — the receiver's advertised window and the sender's congestion window suddenly both matter.",
      component: 'write(2) → tcp_sendmsg → veth xmit',
      layer: 'Container kernel · L4 egress',
      abstraction: 'Response bytes → segmented TCP stream',
      protocol: 'HTTP/1.1 over TCP',
      misconception: "You might think one write() produces one packet — actually the kernel decides how to cut the data up, and with segmentation offload enabled the network card itself may do the cutting: a single 14KB write can leave your code as one enormous buffer that hardware slices on the way out of the machine.",
      analogy: "Handing a fourteen-page report to the mailroom. They decide how many envelopes that takes, and they never ask you.",
      command: 'sudo strace -e trace=write -p "$(pgrep -f "node dist/main")" 2>&1 | head',
      production: 'Watch for EAGAIN on write with slow clients — Node buffers unwritten bytes in userland, and a few thousand stalled downloads become gigabytes of heap. Backpressure (stream.write returning false) exists for exactly this.'
    }
  },

  {
    id: 'docker-return-dnat',
    chapter: 21,
    title: 'conntrack un-NATs the reply',
    node: 'dnat',
    mode: 'remote',
    when: { deploy: 'docker' },
    packet: {
      label: 'Reverse NAT: 172.17.0.2:3000 → :443',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src (before)': '172.17.0.2', 'Src (after)': '172.17.0.1', 'Dst': '172.17.0.1' },
        tcp: { 'Src Port (before)': '3000', 'Src Port (after)': '443', 'Dst Port': '52814', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "On the way out, the address swap from chapter 17 is undone in reverse. The response crosses eth0, then the veth pair, then docker0, and arrives in the host's network stack, where conntrack recognises it instantly as the REPLY half of the flow it filed away earlier. Not a single firewall rule is read: the stored entry says this flow had its destination rewritten, so the kernel now rewrites the source back to 172.17.0.1:443 — the exact address nginx originally dialled. As far as nginx can tell, the published port answered it.",
      why: "This is what makes port publishing invisible. Without conntrack remembering, the reply would arrive from an address the proxy never contacted, and the proxy's TCP stack would slam the door with an RST.",
      component: 'nf_conntrack reply-direction NAT (net/netfilter/nf_nat_core.c)',
      layer: 'Server kernel · L3/L4',
      abstraction: 'Flow state replaces per-packet policy',
      protocol: 'Netfilter connection tracking',
      misconception: "You might think a full connection-tracking table breaks existing connections — actually it does something worse: it silently DROPS brand new ones and writes nf_conntrack: table full, dropping packet to the kernel log. Under load this looks exactly like random connection failures, with nothing whatsoever in your application logs.",
      analogy: "A doctors' surgery where the receptionist always rings you back from the main switchboard number, never from the doctor's direct line. You get your answer; you never learn the extension.",
      command: 'sudo conntrack -L | grep 3000\nsysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max',
      production: 'On busy hosts raise nf_conntrack_max and hashsize, and graph the count/max ratio. Container hosts hit this ceiling long before they run out of CPU.'
    },
    code: [
      { title: 'The tracked flow, both directions', lang: 'bash', code: 'sudo conntrack -L -p tcp --dport 3000\ntcp  6 431996 ESTABLISHED\n  src=172.17.0.1 dst=172.17.0.1 sport=52814 dport=443     <- original\n  src=172.17.0.2 dst=172.17.0.1 sport=3000  dport=52814   <- reply (rewritten)\n  [ASSURED] mark=0 use=1' }
    ]
  },

  {
    id: 'proxy-buffer-forward',
    chapter: 21,
    title: 'nginx buffers the upstream response',
    node: 'proxy',
    mode: 'remote',
    explain: {
      what: "nginx takes the whole response off the app's hands at once, so the app can get back to work. It reads the upstream response into its proxy buffers — by default eight buffers of 4KB plus one 4KB buffer for headers, so our 14KB fits comfortably in memory; anything bigger would spill into a temporary file on disk. Then it rewrites the headers that only apply to one hop, drops X-Powered-By if you told it to, adds Server: nginx, compresses the body with gzip if the client's Accept-Encoding header says it can cope, and only then begins writing anything to the browser's connection.",
      why: "Buffering releases the upstream connection as fast as physically possible, so the app can start on the next request while nginx patiently trickles bytes to a phone on a weak signal. That single trick is most of the reason a reverse proxy sits in front of an app server at all.",
      component: 'ngx_http_proxy_module (proxy_buffering)',
      layer: 'Origin server · L7 proxy',
      abstraction: 'Decoupling fast upstream from slow downstream',
      protocol: 'HTTP/1.1',
      misconception: "You might think switching proxy_buffering off makes things faster — actually it makes the FIRST byte faster and everything after that worse, because your Node process is then tied to the slowest client on the network for as long as they take. Turn it off only for server-sent events and genuine streaming endpoints.",
      analogy: "A restaurant runner who lifts the whole order off the pass the second it lands, freeing the chef immediately, then walks it to the table at the diner's own pace.",
      command: 'nginx -T | grep -E "proxy_buffer|gzip"',
      production: 'Alarm on "an upstream response is buffered to a temporary file" in the error log — it means your buffers are undersized for real payloads and you are doing disk I/O per request.'
    },
    code: [
      { title: 'Buffering + compression', lang: 'bash', code: 'proxy_buffering on;\nproxy_buffer_size 4k;        # response headers\nproxy_buffers 8 4k;          # 32k of body before spilling to disk\nproxy_busy_buffers_size 8k;\n\ngzip on;\ngzip_types application/json;\ngzip_min_length 1024;        # 14KB JSON → ~2.4KB on the wire' }
    ]
  },

  {
    id: 'origin-to-cf-tls',
    chapter: 21,
    title: 'Encrypted back to Cloudflare over the origin pull connection',
    node: 'originpull',
    mode: 'net',
    packet: {
      label: 'TLS Application Data ← origin',
      layers: ['ip', 'tcp', 'tls', 'http'],
      fields: {
        ip: { 'Src': '198.51.100.10', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '443', 'Dst Port': '39114', 'Flags': 'PSH, ACK' },
        tls: { 'Record': 'application_data', 'Version': 'TLS 1.3', 'Cipher': 'TLS_AES_128_GCM_SHA256', 'Length': '2489' },
        http: { 'Status': '200', 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' }
      }
    },
    explain: {
      what: "The response gets locked up again — but with a different lock from the one the browser holds. nginx encrypts the now-gzipped, roughly 2.4KB response into TLS records on the long-lived origin-pull connection Cloudflare opened back in chapter 16. That is an entirely separate TLS session from the browser's, with its own separately negotiated keys. The encrypted record then travels back over the public internet to the edge location that asked for it.",
      why: "Two independent encrypted sessions is the shape of every reverse-proxy CDN: end-to-end in the sense that no hop travels in the clear, but very deliberately NOT end-to-end in the sense that Cloudflare reads every byte in between.",
      component: 'Origin pull connection (Cloudflare ↔ origin, Full Strict mode)',
      layer: 'Internet · L5/L6',
      abstraction: 'Second TLS leg of a proxied request',
      protocol: 'TLS 1.3 (RFC 8446)',
      misconception: "You might think Cloudflare's Flexible mode still counts as HTTPS — actually it encrypts only the browser-to-edge half and then speaks plain unencrypted HTTP to your server, so anyone sitting on that second leg reads everything. Full (Strict), with a certificate on your origin that Cloudflare actually validates, is the only honest setting.",
      analogy: "An interpreter relaying a private conversation between two closed rooms. Both halves are confidential, and the interpreter heard every single word.",
      command: 'curl -sv --resolve api.shop.dev:443:198.51.100.10 https://api.shop.dev/products 2>&1 | grep -i "SSL connection"',
      production: 'Use Authenticated Origin Pulls (client certificates) so your origin only accepts connections from Cloudflare — otherwise anyone who finds 198.51.100.10 bypasses your WAF entirely.'
    }
  },

  {
    id: 'cf-edge-response',
    chapter: 21,
    title: 'The edge stamps its headers and decides not to cache',
    node: 'cfcache',
    mode: 'net',
    packet: {
      label: '200 OK + CF headers',
      layers: ['tls', 'http'],
      fields: {
        http: { ':status': '200', 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', 'cache-control': 'private, no-store', 'cf-cache-status': 'DYNAMIC', 'cf-ray': '8f3a1c9d4e2b7a10-AMS', 'server': 'cloudflare', 'age': '0' }
      }
    },
    explain: {
      what: "The edge takes one look at the response and decides it is not worth keeping. It receives the 200, checks its caching rules, and declines to store anything: your server sent Cache-Control: private, no-store, and /products is not covered by any cache-everything page rule. So it stamps the response cf-cache-status: DYNAMIC, meaning fetched fresh from the origin and not cacheable, attaches a cf-ray id that pins this exact request to one edge location and datacenter (AMS is Amsterdam) so support can find it later, and gets ready to pass it on to the browser.",
      why: "cf-cache-status is the single most useful field a CDN gives you: HIT, MISS, EXPIRED, BYPASS and DYNAMIC each tell a completely different story about why your origin is or is not being hammered right now.",
      component: 'Cloudflare edge cache + response pipeline',
      layer: 'Edge · L7',
      abstraction: 'Cache admission decision at the boundary',
      protocol: 'HTTP caching (RFC 9111)',
      misconception: "You might think Cloudflare caches your API for you automatically — actually by default it caches only files with static-looking extensions. API JSON is never cached unless you write a cache rule AND send cache-friendly headers, and DYNAMIC is the edge telling you it did not even attempt it.",
      analogy: "A records clerk who files a duplicate only when a document is stamped shareable. Everything marked private is handed straight to the recipient, with nothing left behind in the cabinet.",
      command: 'curl -sI https://api.shop.dev/products?limit=20 | grep -i "cf-\\|cache"',
      production: 'For read-heavy APIs, Cache-Control: public, max-age=0, s-maxage=60 plus stale-while-revalidate lets the edge absorb the traffic while browsers stay fresh — often a 95% origin-load reduction for one header.'
    },
    code: [
      { title: 'Response headers as the browser will see them', lang: 'bash', code: 'HTTP/2 200\ncontent-type: application/json; charset=utf-8\ncontent-encoding: gzip\ncache-control: private, no-store\ncf-cache-status: DYNAMIC\ncf-ray: 8f3a1c9d4e2b7a10-AMS\nserver: cloudflare\nalt-svc: h3=":443"; ma=86400' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 22 — The Response: internet → home
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cf-response-egress',
    chapter: 22,
    title: 'The edge answers on the original TLS session',
    node: 'anycast',
    mode: 'net',
    packet: {
      label: 'HTTP/2 DATA on stream 1',
      layers: ['ip', 'tcp', 'tls', 'http'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Flags': 'PSH, ACK' },
        tls: { 'Record': 'application_data', 'Keys': 'browser session (NOT the origin session)', 'Cipher': 'TLS_AES_128_GCM_SHA256' },
        http: { 'Frame': 'HEADERS + DATA', 'Stream': '1', 'HPACK': 'dynamic table indexed' }
      }
    },
    explain: {
      what: "The edge unlocks the response with one key and locks it again with a completely different one. It re-encrypts under the keys it negotiated with the BROWSER back in chapter 13, packages the result as an HTTP/2 HEADERS frame with the header names and values compressed by HPACK, follows it with DATA frames carrying the body, all tagged as stream 1, and writes the lot to the client connection. Different keys, different sequence numbers, a different TCP connection entirely from the origin leg. The edge is the seam where the two halves are stitched together.",
      why: "This is the moment the response stops being server infrastructure and becomes the internet again: from here it retraces the same fabric it arrived on, running backwards.",
      component: 'Cloudflare edge proxy (HTTP/2 client connection)',
      layer: 'Edge · L5-L7',
      abstraction: 'Terminating proxy: two sessions, one logical request',
      protocol: 'HTTP/2 (RFC 9113) over TLS 1.3',
      misconception: "You might think the response retraces the exact path the request took — actually internet routing is lopsided by default: the way home is chosen independently, hop by hop, and frequently crosses entirely different networks from the way out.",
      analogy: "A reply posted from the same post office you wrote to, which may well cross a different set of countries on its way back to you.",
      command: 'curl -s -o /dev/null -w "%{http_version} %{time_starttransfer}\\n" https://api.shop.dev/products',
      production: 'Time-to-first-byte at the edge versus at the origin (measurable with Cloudflare Logpush fields) separates "your app is slow" from "the network is slow" — two very different on-call runbooks.'
    }
  },

  {
    id: 'return-backbone',
    chapter: 22,
    title: 'Back across the backbone — fresh TTL, ~11 hops',
    node: 'tier1a',
    mode: 'net',
    effects: ['zoomout'],
    packet: {
      label: 'Response segments crossing tier-1 transit',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '58 (was 64, 6 hops so far)', 'DSCP': '0x00' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Flags': 'ACK', 'Window': '65535 (scaled ×128)' }
      }
    },
    explain: {
      what: "Every router on the way home does exactly the same small job it did on the way out. It looks up 203.0.113.0/24 in its forwarding table and takes the most specific match it can find, knocks one off the TTL field, recalculates the IPv4 header checksum because a field changed, and pushes the packet out of the chosen port. TTL is our odometer: it left the edge at 64 and reads 58 here, so exactly six routers have handled this packet so far. Each of those lookups happens in dedicated hardware memory at full line rate, not in software.",
      why: "The return trip is where you feel actual physics: roughly 5 microseconds for every kilometre of fibre, and no amount of clever engineering will ever beat the speed of light through glass.",
      component: 'Tier-1 backbone routers (BGP FIB, hardware forwarding)',
      layer: 'Internet · OSI L3',
      abstraction: 'Hop-by-hop destination-based forwarding',
      protocol: 'IPv4 (RFC 791) + BGP-4 (RFC 4271)',
      misconception: "You might think fewer hops always means lower latency — actually distance dominates completely. A four-hop path across an ocean loses to an eleven-hop path across one city every single time. A hop is not a unit of distance.",
      analogy: "A rail network where each signal box only ever decides the next junction. Nobody along the line holds the whole route in their head, and the train still arrives.",
      command: 'mtr -rwzbc 20 api.shop.dev',
      production: 'Asymmetric routing makes one-way traceroutes lie. When latency is one-directional, you need probes from BOTH ends (RIPE Atlas, or a reverse traceroute from the provider) to find the sick link.'
    }
  },

  {
    id: 'return-isp',
    chapter: 22,
    title: 'Into the ISP core and out to the access network',
    node: 'ispcore',
    mode: 'net',
    packet: {
      label: 'Toward 203.0.113.77',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '54' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "The packet arrives at the network that actually owns your address. The ISP's border router accepts it, because it is the one telling the rest of the world that 203.0.113.0/24 lives here, and forwards it through the core toward the neighbourhood — most carriers slap an MPLS label on it for that inner journey, a shortcut tag that saves re-reading the full address at every hop. It ends up at the headend equipment serving your street: a CMTS on cable, an OLT on fibre. This is the last stretch that everyone around you shares.",
      why: "That headend is the real bottleneck of consumer internet: hundreds of households share one group of downstream channels, which is exactly why your speeds sag at eight in the evening and are glorious at four in the morning.",
      component: 'ISP core + CMTS/OLT headend',
      layer: 'ISP · L2/L3 aggregation',
      abstraction: 'Shared access medium with scheduled downstream',
      protocol: 'MPLS + DOCSIS 3.1 / GPON',
      misconception: "You might think your 1 Gbps plan is a gigabit reserved for you — actually it is a shared segment, sold on the assumption that not everyone uses it at once, at a ratio the ISP never publishes and which usually sits somewhere between twenty and fifty households to one.",
      analogy: "A block of flats where every shower draws from one boiler. Gloriously hot at four in the morning, a sad trickle at half past seven.",
      command: 'ping -c 20 "$(traceroute -n api.shop.dev | sed -n 3p | awk "{print \\$2}")"',
      production: 'Bufferbloat lives here: oversized headend queues turn congestion into 500ms of latency instead of packet loss. fq_codel and CAKE on the home router fix the upstream half; the downstream half is the ISP’s problem.'
    }
  },

  {
    id: 'return-modem',
    chapter: 22,
    title: 'Down the last mile to the modem',
    node: 'modem',
    mode: 'net',
    packet: {
      label: 'DOCSIS downstream → Ethernet',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': 'ISP CMTS', 'Dst MAC': 'a4:91:b1:0c:44:e2 (router WAN)', 'EtherType': '0x0800' },
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '53' }
      }
    },
    explain: {
      what: "For the last stretch your data stops being bits and becomes a radio signal on a wire. The headend schedules the packet into a downstream OFDM channel — a set of many narrow radio carriers used side by side — and the modem at your end demodulates that signal back into bits, reassembles the DOCSIS frame around them, pulls out the Ethernet frame carried inside, and hands it to the router's WAN port. Physics becomes packets again.",
      why: "This modulate-and-demodulate boundary is where the digital world meets analogue reality, and it is where a corroded connector or an electrically noisy neighbour shows up not as an error message but as quiet, endless retransmissions.",
      component: 'Cable modem (DOCSIS 3.1 PHY/MAC)',
      layer: 'Home · OSI L1/L2',
      abstraction: 'RF spectrum → Ethernet frames',
      protocol: 'DOCSIS 3.1 (OFDM downstream)',
      misconception: "You might think the modem is your router — actually a pure modem is a signal converter with no understanding of IP addresses at all. The combined boxes ISPs ship glue a modem, a router, a switch and a Wi-Fi access point into one plastic shell, which is precisely why a single reboot appears to fix four unrelated problems.",
      analogy: "A record player turning wiggles in a groove back into music, with no opinion whatsoever about the song.",
      command: 'ping -c 100 192.168.1.1 | tail -2   # jitter here = last-mile trouble',
      production: 'Downstream SNR and upstream power levels on the modem status page diagnose more "the internet is slow" tickets than any packet capture ever will.'
    }
  },

  {
    id: 'return-nat-reverse',
    chapter: 22,
    title: 'The router remembers: reverse NAT',
    node: 'nat',
    mode: 'net',
    packet: {
      label: 'NAT: 203.0.113.77:38112 → 192.168.1.23:51324',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst (before)': '203.0.113.77', 'Dst (after)': '192.168.1.23', 'TTL': '53 → 52' },
        tcp: { 'Src Port': '443', 'Dst Port (before)': '38112', 'Dst Port (after)': '51324', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "The router now has to work out which of the devices in your house asked for this. It looks the flow up in its connection-tracking table using the reply addresses (104.18.32.7:443 arriving for 203.0.113.77:38112), finds the entry it created when the request went out, and rewrites the destination back to 192.168.1.23:51324. Same table, same mechanism as the Docker address rewrite from chapter 17 — your home router is running literally the same nf_conntrack code.",
      why: "This is the trick that kept IPv4 alive: one public address can stand in for an entire household, because the port number quietly becomes part of who you are.",
      component: 'Home router NAT (netfilter MASQUERADE, reply direction)',
      layer: 'Home · L3/L4',
      abstraction: 'Port-multiplexed address translation',
      protocol: 'NAPT (RFC 3022 / RFC 6888)',
      misconception: "You might think the router somehow just knows which device wanted this — actually it is one row in a table, written when the outbound packet passed through, keyed on the four addresses and ports, and carrying a countdown. If that row expires — five days by default, but as little as five MINUTES on cheap hardware — the connection dies in total silence. That is what TCP keepalives are really for.",
      analogy: "A hotel switchboard with a notepad: call from room 23 out to 555-0100, went out on line 4. When line 4 rings back, the operator knows exactly whose phone to ring.",
      command: 'sudo conntrack -L | grep 51324\nsysctl net.netfilter.nf_conntrack_tcp_timeout_established',
      production: 'Idle WebSocket and long-poll connections dying after exactly 5 or 15 minutes is always a NAT timeout. Send application-level pings under 60 seconds and stop blaming the client library.'
    },
    code: [
      { title: 'The row that makes this work', lang: 'bash', code: 'tcp  6 431982 ESTABLISHED\n  src=192.168.1.23 dst=104.18.32.7 sport=51324 dport=443    <- original\n  src=104.18.32.7  dst=203.0.113.77 sport=443 dport=38112   <- reply\n  [ASSURED] mark=0 use=1' }
    ]
  },

  {
    id: 'return-switch',
    chapter: 22,
    title: 'The switch forwards straight to one port',
    node: 'switch',
    mode: 'net',
    packet: {
      label: 'Frame → 3c:07:54:6a:2b:91',
      layers: ['eth', 'ip', 'tcp', 'tls'],
      fields: {
        eth: { 'Src MAC': 'a4:91:b1:0c:44:e2 (router)', 'Dst MAC': '3c:07:54:6a:2b:91 (dev-laptop)', 'EtherType': '0x0800' },
        ip: { 'Src': '104.18.32.7', 'Dst': '192.168.1.23', 'TTL': '52' },
        tcp: { 'Src Port': '443', 'Dst Port': '51324', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "One last address swap and the frame is home. The router checks its ARP cache — its list of which IP address belongs to which piece of hardware — finds that 192.168.1.23 is the machine with hardware address 3c:07:54:6a:2b:91, writes that as the destination, and drops the frame onto the LAN. The switch reads the hardware address, finds it in its own address table pointing at port 4, and sends it out of port 4 and nowhere else. Every other port sees not one bit of it. Store-and-forward, about a microsecond.",
      why: "Forwarding to a single learned port is why switches replaced hubs entirely: the laptop in the next room cannot even passively overhear your frames, and every port gets the full link speed at the same time.",
      component: 'Ethernet switch (CAM/MAC address table)',
      layer: 'Home LAN · OSI L2',
      abstraction: 'Learned MAC → port mapping',
      protocol: 'IEEE 802.3 Ethernet',
      misconception: "You might think a switch is just a faster hub — actually a hub blindly repeats every bit out of every port, so everyone shouts over everyone else, while a switch learns addresses and delivers selectively. They are completely different devices that happen to be the same shape.",
      analogy: "A mailroom sorter who has memorised every resident's pigeonhole. No announcements over the tannoy, no pile of letters in the lobby for people to rummage through.",
      command: 'sudo arp -an | grep 192.168.1.23',
      production: 'CAM table exhaustion is a real attack (macof floods it until the switch fails open into hub mode). Port security and sticky MACs are the mitigation on managed switches.'
    }
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 23 — The Kernel Receive Path (the full, uncompressed tour)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'rx-nic-filter',
    chapter: 23,
    title: 'The NIC decides this frame is for us',
    node: 'nic',
    mode: 'hw',
    packet: {
      label: 'Frame on the wire → dev-laptop',
      layers: ['eth', 'ip', 'tcp', 'tls'],
      fields: {
        eth: { 'Dst MAC': '3c:07:54:6a:2b:91', 'Src MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800', 'FCS': 'valid (CRC32)' },
        ip: { 'Src': '104.18.32.7', 'Dst': '192.168.1.23', 'TTL': '52' },
        tcp: { 'Src Port': '443', 'Dst Port': '51324', 'Flags': 'PSH, ACK' }
      }
    },
    explain: {
      what: "The card decides, entirely on its own, whether this frame is worth waking anyone up for. The PHY — the chip that deals with voltages on the wire — recovers bits from the electrical signal and hands a complete frame to the MAC block. The MAC checks the 32-bit FCS, a checksum covering the whole frame: if it fails, the frame is thrown away right here and counted in rx_crc_errors, and software never learns it existed. Then the MAC compares the destination hardware address against its short list of addresses it cares about: our own unicast address, the broadcast address, and any multicast groups we subscribed to. Match. This frame is ours. Finally RSS hashes the four addresses and ports to decide which of the 8 receive queues it should land in.",
      why: "Filtering in silicon means the CPU is never once interrupted for the neighbours' traffic. Without it, every machine on a segment would burn real cycles doing nothing but discarding frames addressed to somebody else.",
      component: 'NIC MAC + RSS (e.g. Intel I225-V)',
      layer: 'Hardware · OSI L1/L2',
      abstraction: 'Address filtering and queue steering in silicon',
      protocol: 'IEEE 802.3',
      misconception: "You might think promiscuous mode is how tcpdump works — actually tcpdump normally does not need it at all, because your own traffic already arrives. Promiscuous mode only matters for capturing OTHER machines' frames, and on a switched network those never reach your port in the first place.",
      analogy: "A doorman at the gate reading name tags against tonight's guest list. The party inside never even hears about the people turned away.",
      command: 'ethtool -S enp3s0 | grep -E "rx_crc_errors|rx_missed|rx_queue_._packets"',
      production: 'rx_missed_errors climbing means the NIC filled its FIFO before the driver drained the ring — usually too few queues or IRQs pinned to a busy core. Fix with ethtool -L/-G and IRQ affinity, not with a bigger machine.'
    },
    code: [
      { title: 'Queues and interrupts', lang: 'bash', code: 'ethtool -l enp3s0\n# Combined: 8         <- 8 RX/TX queue pairs, one per core\n\ncat /proc/interrupts | grep enp3s0\n# 132: 218374  0  0  0  IR-PCI-MSI 1572864-edge  enp3s0-rx-0\n# 133:      0  0  0  0  IR-PCI-MSI 1572865-edge  enp3s0-rx-1' }
    ]
  },

  {
    id: 'rx-dma-ring',
    chapter: 23,
    title: 'DMA writes the frame into the RX ring',
    node: 'dma',
    mode: 'hw',
    effects: ['ring+'],
    explain: {
      what: "The card writes the packet into the computer's memory itself, without asking the CPU for help. It takes the next free descriptor from the RX ring — a circular list of little records that the driver filled in ahead of time with the physical addresses of empty memory pages — and DMAs the frame bytes straight into that memory across the PCIe bus. Direct Memory Access means exactly that: no CPU instruction moves a single byte. The card then writes back into the descriptor how long the frame was, the RSS hash it computed, flags saying whether checksums already verified, and sets the DD bit, short for descriptor done, before nudging the ring's head pointer forward.",
      why: "DMA is the whole reason 10 gigabits a second is achievable on an ordinary CPU: the processor is merely told that data has arrived, never asked to fetch it off the card by hand.",
      component: 'DMA engine + RX descriptor ring (driver ring buffer)',
      layer: 'Hardware ↔ kernel memory',
      abstraction: 'Device-initiated memory writes with a producer/consumer ring',
      protocol: 'PCIe memory writes',
      misconception: "You might think the kernel copies the packet off the card — actually the kernel has not touched it yet at all, and on server CPUs with DDIO the DMA can land straight in the L3 cache, so the first time software reads the packet it is already warm.",
      analogy: "A courier who has a key to your parcel box: they put the delivery inside themselves, and only then ring the bell.",
      command: 'ethtool -g enp3s0   # RX ring: 512 current / 4096 max',
      production: 'Growing the RX ring (ethtool -G enp3s0 rx 4096) buys tolerance for latency spikes but adds bufferbloat. Raise it when you see rx_missed_errors, not preemptively.'
    },
    code: [
      { title: 'A descriptor, roughly', lang: 'c', code: 'struct rx_desc {\n    __le64 buffer_addr;   /* physical addr of a page the driver posted */\n    __le16 length;        /* written back by the NIC */\n    __le16 vlan_tag;\n    __le32 rss_hash;      /* used to pick this queue */\n    __le32 status_error;  /* DD | EOP | IPCS_OK | TCPCS_OK */\n};\n/* ring of 512 of these; head advanced by NIC, tail by driver */' }
    ]
  },

  {
    id: 'rx-hw-irq',
    chapter: 23,
    title: 'The NIC raises a hardware interrupt',
    node: 'irq',
    mode: 'hw',
    effects: ['irq'],
    explain: {
      what: "With the data safely in memory, the card taps the CPU on the shoulder. On modern hardware that tap is MSI-X: the card performs a PCIe write to a special address the interrupt controller is watching, carrying a number that identifies the source (132 for receive queue 0). The local APIC on the target core raises the interrupt; the CPU finishes the single instruction it was in the middle of, saves the address it was executing and its flags, looks the number up in the interrupt descriptor table, and jumps to the handler registered there. Whatever was running — your JavaScript, a video decoding — is suspended mid-stride.",
      why: "Interrupts are how hardware gets a CPU's attention without the CPU ever having to ask. The alternative, checking every device over and over just in case, would waste the entire machine.",
      component: 'MSI-X → local APIC → IDT vector (arch/x86/kernel/irq.c)',
      layer: 'Hardware ↔ kernel · interrupt delivery',
      abstraction: 'Asynchronous hardware notification',
      protocol: 'PCIe MSI-X',
      misconception: "You might think interrupts are cheap — actually each one throws away the CPU's carefully filled instruction pipeline, jumps into handler code that is probably not in cache, and often has to poke another core as well. At a million packets a second, one interrupt per packet would consume an entire core doing nothing but bookkeeping. That is exactly why NAPI exists, two steps from here.",
      analogy: "The phone ringing in the middle of dinner: you have to put your fork down mid-bite. Perfectly fine once an evening. Unbearable three times a second.",
      command: 'watch -n1 "grep enp3s0 /proc/interrupts"',
      production: 'Pin queue IRQs to specific cores (/proc/irq/N/smp_affinity) and keep irqbalance away from latency-critical NICs. On trading and telco boxes this single change moves p99 by milliseconds.'
    }
  },

  {
    id: 'rx-top-half',
    chapter: 23,
    title: 'The top half: do almost nothing, quickly',
    node: 'cpu',
    mode: 'kernel',
    state: { mode: 'kernel' },
    explain: {
      what: "The handler that runs on the tap does almost nothing, on purpose. It runs in what the kernel calls interrupt context, with further interrupts switched off on this core, and it does three things before stopping: acknowledge the interrupt so the card stops asserting it, MASK further receive interrupts on this queue so it will not be pestered again, and call napi_schedule() to add the real work to a to-do list. Total: a couple of microseconds. It does not parse the packet. It never touches TCP. It is not even allowed to: no sleeping, no waiting on a mutex, no ordinary memory allocation.",
      why: "Every microsecond spent in interrupt context is a microsecond in which this core can service NO other interrupt at all — not even the system timer. Top halves are kept deliberately feeble so the whole machine stays responsive.",
      component: 'Driver hard IRQ handler (igc_msix_ring in drivers/net/ethernet/intel/igc)',
      layer: 'Kernel · interrupt context',
      abstraction: 'Split interrupt handling: top half vs bottom half',
      protocol: '—',
      misconception: "You might think the interrupt handler processes the packet — actually it defers absolutely everything. Splitting the work into a fast acknowledgement now and the real job later is one of the oldest and most important patterns in operating system design.",
      analogy: "A triage nurse who takes your name, glances at you, and sits you down in about ten seconds flat. Nothing has been treated yet, and that is the correct behaviour with a queue at the door.",
      command: 'sudo cat /proc/interrupts; sudo perf top -e irq:irq_handler_entry',
      production: 'hardirq time shows as %hi in top/mpstat. If a core shows more than a few percent %hi, the driver is doing too much in interrupt context or your interrupt rate is unmoderated.'
    },
    code: [
      { title: 'The whole top half', lang: 'c', code: 'static irqreturn_t igc_msix_ring(int irq, void *data)\n{\n    struct igc_q_vector *q_vector = data;\n\n    igc_write_itr(q_vector);      /* interrupt throttling */\n    napi_schedule(&q_vector->napi);  /* defer the real work */\n    return IRQ_HANDLED;           /* ...and we are done. */\n}' }
    ]
  },

  {
    id: 'rx-napi-schedule',
    chapter: 23,
    title: 'napi_schedule() raises NET_RX_SOFTIRQ',
    node: 'napi',
    mode: 'kernel',
    quiz: {
      q: 'Why does Linux switch from interrupts to polling (NAPI) when traffic gets heavy?',
      options: [
        'Polling is always faster than interrupts',
        'Under high packet rates, per-packet interrupts can livelock the CPU — NAPI takes one interrupt, masks further ones, and polls until the ring drains',
        'Interrupts cannot be delivered faster than 10,000 per second'
      ],
      answer: 1,
      explain: 'Interrupt livelock is a real and cruel failure mode: at high packet rates the CPU spends every moment entering and leaving interrupt context, and never actually reaches the code that would drain the queue, so throughput collapses toward zero while the machine looks completely busy. NAPI is a hybrid that avoids it — interrupt-driven when things are quiet, which keeps latency low, and poll-driven when things are busy, which keeps throughput high — and it flips between the two automatically depending on whether a poll used up its full allowance of packets.'
    },
    explain: {
      what: "Writing the to-do note takes almost no time at all. napi_schedule adds this queue's NAPI context to a poll list belonging to this CPU, then calls raise_softirq_irqoff(NET_RX_SOFTIRQ), which does nothing more dramatic than set one bit in a pending flags word. That is the entire step: one list insert and one bit. The real work happens later, once interrupt context has unwound and the kernel gets round to checking that word.",
      why: "This is the pivot from interrupt me about every packet to I will come and collect them in batches — the design that let Linux keep up as network cards went from 100 megabits to 100 gigabits.",
      component: 'NAPI (net/core/dev.c, napi_schedule_prep + __napi_schedule)',
      layer: 'Kernel · softirq scheduling',
      abstraction: 'Interrupt-to-poll transition under load',
      protocol: '—',
      misconception: "You might think NAPI polls constantly and burns CPU doing it — actually it polls only while packets keep coming. The moment a poll comes back with less than its allowance, NAPI switches interrupts back on and goes to sleep. Idle costs nothing.",
      analogy: "A restaurant that seats you the instant you walk in when it is quiet, then switches at peak time to calling the waiting list in batches. Same staff, far more diners served.",
      command: 'cat /proc/net/softnet_stat   # per-CPU: processed, dropped, time_squeeze',
      production: 'Column 3 of softnet_stat (time_squeeze) counts polls that hit netdev_budget before draining. Persistent nonzero values mean raising net.core.netdev_budget / netdev_budget_usecs, or enabling more queues.'
    }
  },

  {
    id: 'rx-softirq',
    chapter: 23,
    title: 'Softirq context: the bottom half runs',
    node: 'softirq',
    mode: 'kernel',
    explain: {
      what: "Now the deferred work actually gets done. On the way out of the interrupt, the kernel notices that NET_RX_SOFTIRQ bit is set and runs net_rx_action. This code runs with hardware interrupts switched back ON, but still in what is called atomic context, meaning it may not go to sleep — so a hardware interrupt can barge in and preempt it, but an ordinary process cannot. If softirq work keeps arriving past its allowance, the kernel hands the job over to a real kernel thread called ksoftirqd, one per CPU, which then competes for CPU time fairly against your applications.",
      why: "This two-level design gives the network stack somewhere to do real work quickly without holding hardware hostage, while ksoftirqd is the pressure valve that stops a flood of packets from starving your applications completely.",
      component: 'net_rx_action / __do_softirq (kernel/softirq.c)',
      layer: 'Kernel · softirq (bottom half) context',
      abstraction: 'Deferrable atomic work with a fairness escape hatch',
      protocol: '—',
      misconception: "You might think softirqs are threads — actually they usually run inline, right there on whichever CPU took the interrupt, and ksoftirqd is only the overflow route. That is why the softirq column in mpstat can be pinned at 100% while ksoftirqd itself shows 0% CPU and looks entirely innocent.",
      analogy: "The teacher who marks the register the moment the bell stops ringing, at her own desk, and only rings the school office when the pile of forms becomes ridiculous.",
      command: 'mpstat -P ALL 1    # watch %soft per core\npidstat -t -p "$(pgrep -f ksoftirqd/0)" 1',
      production: 'A ksoftirqd thread at 100% CPU is a classic DDoS or misconfigured-offload signature. Correlate with softnet_stat drops and check whether GRO/RSS are actually enabled.'
    },
    code: [
      { title: 'The softirq table', lang: 'c', code: 'enum {\n    HI_SOFTIRQ = 0, TIMER_SOFTIRQ,\n    NET_TX_SOFTIRQ, NET_RX_SOFTIRQ,   /* <- ours, priority 3 */\n    BLOCK_SOFTIRQ, IRQ_POLL_SOFTIRQ,\n    TASKLET_SOFTIRQ, SCHED_SOFTIRQ,\n    HRTIMER_SOFTIRQ, RCU_SOFTIRQ,\n};' }
    ]
  },

  {
    id: 'rx-napi-poll',
    chapter: 23,
    title: 'The poll loop harvests the ring, GRO merges segments',
    node: 'ringbuffer',
    mode: 'kernel',
    effects: ['ring-'],
    explain: {
      what: "Now the packets get collected in batches, and glued together on the way. net_rx_action walks the poll list and calls each device's poll() function with an allowance — 64 packets per device, 300 across all of them by default, so no single card can hog the core. The driver reads every descriptor whose done bit is set, wraps each buffer in an sk_buff (the kernel's universal packet structure), and refills the ring with fresh empty pages for next time. Then GRO — Generic Receive Offload — looks at consecutive segments belonging to the same connection and merges them: our ten 1448-byte segments carrying encrypted data coalesce into one 14,480-byte super-packet before the IP layer ever sees them.",
      why: "GRO means the expensive per-packet journey through IP, the firewall and TCP runs once instead of ten times. It is the single biggest software throughput win anywhere in the receive path.",
      component: 'napi->poll() + napi_gro_receive (net/core/gro.c)',
      layer: 'Kernel · driver + GRO',
      abstraction: 'Batched harvesting with flow-aware coalescing',
      protocol: '—',
      misconception: "You might think GRO changes what your application receives — actually TCP is a continuous stream of bytes and the app never sees packet boundaries in the first place. GRO is invisible to everything except tcpdump, where it makes you see impossible 14KB packets on a link whose maximum is 1500 bytes.",
      analogy: "A postal worker who staples the ten pages of one letter together before delivering it, so you read one letter instead of answering the door ten times.",
      command: 'ethtool -k enp3s0 | grep -E "generic-receive-offload|large-receive"',
      production: 'Disable GRO (ethtool -K enp3s0 gro off) only when doing precise per-packet latency measurement or running a bridge/router where merging then re-splitting hurts. Everywhere else, leave it on.'
    },
    code: [
      { title: 'Budget accounting', lang: 'c', code: 'static int net_rx_action(struct softirq_action *h)\n{\n    unsigned long time_limit = jiffies + usecs_to_jiffies(netdev_budget_usecs);\n    int budget = netdev_budget;          /* 300 */\n\n    for (;;) {\n        work = napi_poll(n, &repoll);    /* driver poll, <= 64 each */\n        budget -= work;\n        if (budget <= 0 || time_after_eq(jiffies, time_limit)) {\n            __raise_softirq_irqoff(NET_RX_SOFTIRQ);  /* time squeeze! */\n            break;\n        }\n    }\n}' }
    ]
  },

  {
    id: 'rx-ip-rcv',
    chapter: 23,
    title: 'netif_receive_skb → ip_rcv',
    node: 'ip',
    mode: 'kernel',
    packet: {
      label: 'Coalesced skb, 14,480 bytes',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Version/IHL': '4 / 5 (20 bytes)', 'Total Length': '14500', 'Src': '104.18.32.7', 'Dst': '192.168.1.23', 'TTL': '52', 'Proto': '6 (TCP)', 'Checksum': 'valid (offloaded)' }
      }
    },
    explain: {
      what: "The packet leaves the driver and enters the general-purpose part of the stack. netif_receive_skb passes it first to any listeners that have registered a tap — this is precisely where tcpdump gets its copy — and then dispatches on the EtherType field, 0x0800 meaning IPv4, into ip_rcv. IP now sanity-checks the header: version really is 4, the header length field is at least 5, the stated total length does not run off the end of the buffer, and, if the network card did not already verify it, the header checksum adds up. If this packet were a fragment it would be reassembled here; ours is whole. The destination address belongs to this machine, so the packet is for us.",
      why: "The IP layer is deliberately simple-minded: it keeps no state, retransmits nothing, orders nothing. Its entire job is to answer is this mine, and if not, where next — everything dependable is built on top of it.",
      component: 'ip_rcv / ip_rcv_finish (net/ipv4/ip_input.c)',
      layer: 'Kernel · OSI L3',
      abstraction: 'Best-effort datagram delivery',
      protocol: 'IPv4 (RFC 791)',
      misconception: "You might think IP guarantees the packet arrived intact — actually the IPv4 checksum covers the HEADER and nothing else. The contents are protected by TCP's rather weak 16-bit checksum and, ultimately, by TLS's authentication tag, which is the only cryptographically serious check anywhere in the stack.",
      analogy: "A security guard at a warehouse gate who reads the destination field on the delivery note and nothing else. He never once looks inside the box.",
      command: 'sudo tcpdump -ni enp3s0 "host 104.18.32.7 and port 443" -c 5',
      production: 'nstat -az IpInHdrErrors / IpInAddrErrors are near-zero on healthy hosts; sustained nonzero values mean a broken sender, a broken middlebox, or something spraying malformed traffic at you.'
    }
  },

  {
    id: 'rx-netfilter-hooks',
    chapter: 23,
    title: 'Netfilter: PREROUTING, routing decision, INPUT',
    node: 'netfilter',
    mode: 'kernel',
    explain: {
      what: "Before anything else happens, the firewall gets its turn — in a very specific order. ip_rcv hands the packet to the PRE_ROUTING hook, where the raw, mangle and nat tables each get a say. Then ip_route_input_noref makes the routing decision, which for an arriving packet means one question: is this for me, or am I supposed to pass it on? Destination 192.168.1.23 is one of our own addresses, so the verdict is deliver locally. That sends the packet through the LOCAL_IN hook, where the filter table's INPUT chain runs your actual firewall rules — on a laptop, typically an accept-anything-I-started rule sitting near the top.",
      why: "The order of these hooks is the entire mental model of Linux firewalling: PRE_ROUTING sees everything before the routing decision, INPUT sees only traffic for this machine, FORWARD sees only traffic passing through. A rule written into the wrong chain never matches and never tells you why.",
      component: 'Netfilter hooks (net/netfilter/core.c, nf_hook_slow)',
      layer: 'Kernel · L3 packet filtering',
      abstraction: 'Hook points around the routing decision',
      protocol: 'Netfilter / nftables',
      misconception: "You might think iptables and nftables are two different firewalls — actually since kernel 4.18 the iptables command is usually a compatibility front end that programs the very SAME engine underneath. Mixing the old and new tools on one host is exactly how rules mysteriously vanish.",
      analogy: "Airport security zones: everybody clears the first checkpoint, and then arriving passengers and transfer passengers are screened at different desks, under different rules, without ever meeting.",
      command: 'sudo nft list ruleset\nsudo iptables -nvL INPUT --line-numbers',
      production: 'Rule ORDER is performance: put the conntrack ESTABLISHED,RELATED accept first so the 99% case matches in one comparison instead of traversing a hundred rules per packet.'
    },
    code: [
      { title: 'Hook order for a locally-delivered packet', lang: 'c', code: 'NF_INET_PRE_ROUTING   (raw → conntrack → mangle → nat/DNAT)\n        |\n   [ routing decision: local? forward? ]\n        |  local\nNF_INET_LOCAL_IN      (mangle → filter INPUT)   <- your firewall rules\n        |\n   tcp_v4_rcv()' }
    ]
  },

  {
    id: 'rx-conntrack-established',
    chapter: 23,
    title: 'conntrack: ESTABLISHED, fast path',
    node: 'conntrack',
    mode: 'kernel',
    explain: {
      what: "The kernel recognises this packet as the answer to a conversation we started ourselves. The conntrack hook builds the identifying set of values — source 104.18.32.7 port 443, destination 192.168.1.23 port 51324, protocol TCP — hashes them, and finds the entry created when our very first SYN went out back in chapter 8. State: ESTABLISHED. Direction: REPLY. It checks the sequence numbers land inside the window it expects, resets the five-day expiry timer, and marks the packet so the filter chain can match established traffic in one single comparison.",
      why: "Stateful firewalling lets you write allow whatever I started once, instead of trying to enumerate every possible reply in advance. It is also the machinery that makes address translation possible at all.",
      component: 'nf_conntrack_in (net/netfilter/nf_conntrack_core.c)',
      layer: 'Kernel · L3/L4 flow state',
      abstraction: 'Connection state machine independent of the protocol stack',
      protocol: 'Netfilter connection tracking',
      misconception: "You might think conntrack is part of TCP — actually it is an entirely separate state machine that shadows TCP from the outside by watching its flags go past, which is also why it happily tracks UDP and ICMP conversations that have no notion of a connection at all, using nothing but timers.",
      analogy: "A doorman with a re-entry list built from who stepped outside for air. You get back in because your exit was written down, not because anyone checked your ID a second time.",
      command: 'sudo conntrack -L -p tcp --dport 443 | grep 51324\nsudo conntrack -S    # per-CPU insert/drop/invalid counters',
      production: 'conntrack -S invalid counters climbing usually means asymmetric routing or aggressive TCP window scaling with nf_conntrack_tcp_be_liberal off — the kernel discards packets it thinks are out of window.'
    }
  },

  {
    id: 'rx-tcp-demux',
    chapter: 23,
    title: 'tcp_v4_rcv: find the socket by 4-tuple',
    node: 'tcp',
    mode: 'kernel',
    explain: {
      what: "Out of every open connection on the machine, TCP has to pick exactly the right one. It hashes all four identifying values — source 104.18.32.7 port 443, destination 192.168.1.23 port 51324 — and looks them up in the ehash, the table of established connections. Hit: this is the very socket the browser's network service opened back in chapter 7. TCP then vets the segment: does the checksum add up, does the sequence number fall inside the window we advertised, does the acknowledgement number refer to data we genuinely sent. Only then is the payload accepted, and the congestion window and round-trip-time estimates are updated from what the acknowledgement told us.",
      why: "Sorting by all four values rather than by port alone is what lets thousands of different peers all connect to port 443 at once, and lets two of your own browser tabs talk to the same server without ever getting confused.",
      component: 'tcp_v4_rcv / __inet_lookup_established (net/ipv4/tcp_ipv4.c)',
      layer: 'Kernel · OSI L4',
      abstraction: 'Connection demultiplexing and byte-stream reassembly',
      protocol: 'TCP (RFC 9293)',
      misconception: "You might think a port identifies a connection — actually a CONNECTION is identified by all four values plus the protocol. That is why one listening port can serve a million clients, and why one client can open dozens of connections to the same server just by using a different local port each time.",
      analogy: "A big office mailroom that sorts not by floor alone but by sender, sender's suite, floor and room together. Sort by floor and every letter for floor 443 lands in one hopeless pile.",
      command: 'ss -tin "dst 104.18.32.7"   # rtt, cwnd, bytes_acked, retrans',
      production: 'ss -ti is the highest-value TCP debugging command in existence: it shows rtt/rttvar, cwnd, ssthresh, retrans, and delivery_rate per socket. Slow transfer plus small cwnd plus retrans means loss, not server slowness.'
    },
    code: [
      { title: 'The lookup', lang: 'c', code: 'tcp_v4_rcv(skb)\n  → __inet_lookup_skb()\n      → __inet_lookup_established(net, hashinfo,\n            saddr=104.18.32.7, sport=443,\n            daddr=192.168.1.23, dport=51324, dif)\n  → tcp_v4_do_rcv(sk, skb)\n      → tcp_rcv_established(sk, skb)   /* fast path: header prediction */' }
    ]
  },

  {
    id: 'rx-sk-recvq',
    chapter: 23,
    title: 'Payload queued to the socket receive buffer',
    node: 'socketobj',
    mode: 'kernel',
    effects: ['queue+'],
    state: { sock: 'ESTABLISHED', mem: 'kernel' },
    explain: {
      what: "The data has arrived, but it is not yours yet. All 14,208 bytes of encrypted records are appended to the socket's receive queue, and the counter tracking the next byte we expect moves forward. The kernel then works out how much room is left in that buffer and advertises exactly that number back to the sender as the receive window — the buffer size itself is auto-tuned between the limits in tcp_rmem. It also arms the delayed-acknowledgement timer, up to 40 milliseconds, in the hope of hitching the acknowledgement onto some outgoing data instead of spending a whole packet on a bare one. The bytes are now waiting for the application to come and collect them, but they still live in kernel memory.",
      why: "The receive buffer is the flow-control valve of the whole internet: if the app stops reading, the buffer fills, the advertised window shrinks toward zero, and the sender simply stops sending. That is backpressure, built right into the protocol.",
      component: 'sk_receive_queue + tcp_rcv_space_adjust (net/ipv4/tcp_input.c)',
      layer: 'Kernel · L4 buffering',
      abstraction: 'Flow control via advertised window',
      protocol: 'TCP receive window (RFC 9293 §3.8)',
      misconception: "You might think that because the data arrived, the app has it — actually it sits in kernel memory until the process actually asks for it with a read. A large Recv-Q in ss is the unmistakable signature of an application too slow to drain its own sockets.",
      analogy: "Your suitcase going round and round on the airport carousel. It has definitely arrived at the airport. Nobody has picked it up.",
      command: 'ss -tm "dport = :443"    # skmem shows r(receive queue) and rb(buffer limit)',
      production: 'net.ipv4.tcp_rmem autotuning handles most cases; only raise the max for genuine long-fat-network transfers. A persistent Recv-Q means fix the application, never the sysctl.'
    }
  },

  {
    id: 'rx-epoll-wake',
    chapter: 23,
    title: 'ep_poll_callback wakes the waiting thread',
    node: 'scheduler',
    mode: 'kernel',
    effects: ['ctx'],
    state: { proc: 'chrome netsvc PID 4903' },
    explain: {
      what: "Someone has to be told the parcel is here. Queuing the data calls sk_data_ready, which walks the list of anyone waiting on this socket. Our socket is registered with an epoll instance, so the waiter turns out to be ep_poll_callback: it moves this socket's entry onto epoll's ready list and wakes whichever thread is asleep inside epoll_wait. The scheduler marks that thread runnable, puts it on a CPU's run queue, and — because it has just woken from I/O and has been sleeping rather than hogging the processor — the fair scheduler gives it a favourable position, very often preempting whatever was running immediately.",
      why: "This little chain of callbacks is why epoll scales: waking up costs the same whether you are watching ten sockets or ten thousand, because the ready list is kept up to date as things happen rather than rebuilt from scratch on every call the way select and poll do it.",
      component: 'ep_poll_callback (fs/eventpoll.c) + scheduler wakeup (kernel/sched/core.c)',
      layer: 'Kernel · I/O readiness + scheduling',
      abstraction: 'Event-driven wakeup instead of polling',
      protocol: '—',
      misconception: "You might think epoll tells you data is ready — actually it tells you the file descriptor is READY TO TRY. In edge-triggered mode you must keep reading until you get EAGAIN, or the leftover bytes sit there forever and you are never notified again. It is the classic edge-triggered bug and it bites everyone once.",
      analogy: "The concierge does not read out a list of every flat in the building. They ring the one bell that has a parcel waiting behind the desk.",
      command: 'sudo perf sched latency --sort max | head -20',
      production: 'Wakeup-to-run latency is where noisy neighbours hurt. On latency-sensitive services, watch sched:sched_wakeup → sched_switch delta, and consider isolcpus or cgroup cpu.weight before blaming the network.'
    },
    code: [
      { title: 'The wakeup chain', lang: 'c', code: 'tcp_data_queue()\n  → sk->sk_data_ready(sk)          /* = sock_def_readable */\n      → wake_up_interruptible_sync_poll(&wq->wait, EPOLLIN)\n          → ep_poll_callback()      /* fs/eventpoll.c */\n              → list_add_tail(&epi->rdllink, &ep->rdllist)\n              → wake_up(&ep->wq)    /* the epoll_wait sleeper */\n                  → try_to_wake_up() → enqueue_task_fair() → resched' }
    ]
  },

  {
    id: 'rx-recvmsg-copy',
    chapter: 23,
    title: 'recvmsg(): copy_to_user, then ring 0 → ring 3',
    node: 'syscallgate',
    mode: 'user',
    effects: ['flash'],
    state: { mode: 'user', mem: 'copy', proc: 'chrome netsvc PID 4903' },
    explain: {
      what: "The bytes finally cross from the kernel's world into the program's own. epoll_wait returns saying fd 42 is readable, and the network service calls recvmsg(). The kernel walks the socket's receive queue and copies the bytes into the buffer the application provided, using copy_to_user — the one genuine memory copy across the privilege boundary in this entire journey — then frees the packet buffers and shrinks the queue. recvmsg returns 14208, the system call handler executes sysretq, and the CPU drops from kernel privilege back down to user privilege. We are in ordinary application code again, for the first time since the request left.",
      why: "That copy is the price of the isolation model: the kernel will not hand a user process a raw pointer into its own memory. Zero-copy schemes like io_uring registered buffers, AF_XDP and sendfile exist precisely to dodge it when the rates get high enough to care.",
      component: 'tcp_recvmsg → skb_copy_datagram_iter → copy_to_user',
      layer: 'Kernel → userspace boundary',
      abstraction: 'Protected transfer across the privilege ring',
      protocol: 'POSIX socket API (recvmsg(2))',
      misconception: "You might think zero-copy networking eliminates every copy — actually DMA already removed the copy off the device; what remains is the one from kernel memory to user memory. io_uring with pre-registered buffers really does remove that too, at the cost of a much fiddlier model of who owns which buffer when.",
      analogy: "A bank counter behind armoured glass: nothing passes hand to hand. Items go into a controlled drawer, the drawer rotates, and they come out on the other side.",
      command: 'sudo strace -e trace=epoll_wait,recvmsg -p 4903',
      production: 'At 10Gbps+, copy_to_user shows up as raw CPU in perf. That is when io_uring or kernel-bypass earns its complexity; below that, ordinary sockets are fine and far easier to operate.'
    },
    code: [
      { title: 'What strace sees', lang: 'bash', code: 'epoll_wait(3, [{events=EPOLLIN, data={fd=42}}], 128, 1000) = 1\nrecvmsg(42, {msg_iov=[{iov_base="\\x17\\x03\\x03\\x37\\x60...", iov_len=65536}],\n             msg_iovlen=1}, 0) = 14208\nrecvmsg(42, ..., 0) = -1 EAGAIN (Resource temporarily unavailable)\n#                       ^ drained: the correct way to stop reading' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // CHAPTER 24 — Back in the Browser
  // ─────────────────────────────────────────────────────────────
  {
    id: 'client-tls-decrypt',
    chapter: 24,
    title: 'BoringSSL decrypts the TLS records',
    node: 'netservice',
    mode: 'user',
    state: { mode: 'user', proc: 'chrome netsvc PID 4903' },
    packet: {
      label: 'TLS application_data → plaintext',
      layers: ['tls', 'http'],
      fields: {
        tls: { 'Content Type': '23 (application_data)', 'Version': '0x0303 (legacy field)', 'Length': '14203', 'Cipher': 'TLS_AES_128_GCM_SHA256', 'Auth Tag': '16 bytes, verified' },
        http: { 'Frames': 'HEADERS + DATA (stream 1)' }
      }
    },
    explain: {
      what: "Now the sealed envelope gets opened — but the seal is checked first. The network service hands the bytes to BoringSSL, Chrome's cryptography library. Each record is decrypted with AES-128-GCM using the server_application_traffic_secret, a key both sides worked out during the handshake and neither ever sent. Crucially, the 16-byte authentication tag attached to the record is verified BEFORE a single byte of plaintext is released to anyone. One flipped bit anywhere in that record makes the tag fail, and the connection is torn down rather than guessed at.",
      why: "Encryption that also authenticates is what makes TLS 1.3 safe by construction: there is no mode in which you can act on data whose integrity has not been proven, and that single design choice wiped out a decade of padding-oracle attacks.",
      component: 'BoringSSL record layer (Chrome network service)',
      layer: 'Userspace · OSI L6',
      abstraction: 'Authenticated encryption over a byte stream',
      protocol: 'TLS 1.3 (RFC 8446)',
      misconception: "You might think HTTPS just encrypts — actually it also proves who you are talking to and proves nothing was altered on the way, and it is that second guarantee, not the secrecy, that stops your ISP from injecting adverts into pages you load.",
      analogy: "A tamper-evident envelope. You check the seal before you read a word, and a broken seal means you burn the letter unread rather than wondering what it says.",
      command: 'SSLKEYLOGFILE=/tmp/keys.log google-chrome  # then load the log into Wireshark',
      production: 'AES-NI makes this nearly free on modern x86 (multiple GB/s per core). On CPUs without it, ChaCha20-Poly1305 is 3-4× faster — which is why mobile clients negotiate it and why cipher order should not be hardcoded.'
    }
  },

  {
    id: 'client-h2-reassemble',
    chapter: 24,
    title: 'HTTP/2 frames reassembled into a Response',
    node: 'netservice',
    mode: 'user',
    packet: {
      label: 'HEADERS + DATA, stream 1, END_STREAM',
      layers: ['http'],
      fields: {
        http: { ':status': '200', 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', 'cf-ray': '8f3a1c9d4e2b7a10-AMS', 'Frame type': '0x1 HEADERS, then 0x0 DATA ×2', 'Flags': 'END_HEADERS | END_STREAM' }
      }
    },
    explain: {
      what: "The decrypted bytes are not a document; they are a stream of small labelled parcels. Each HTTP/2 frame carries a 9-byte header saying how long it is, what type it is, which flags are set and which stream it belongs to. The HEADERS frame is decoded by HPACK against the connection's dynamic table, so many header names and values arrive as one-byte references to entries the server set up earlier in the conversation. The DATA frames carry the gzipped body, which the network service inflates back into 14,208 bytes of JSON text, and the END_STREAM flag closes stream 1. The underlying TCP connection stays wide open.",
      why: "Framing everything and tagging it with a stream id is what let HTTP/2 stop one slow response blocking all the others: this response finishing does not hold up a single other request travelling on the same connection.",
      component: 'HTTP/2 session + HPACK decoder (net/http2 in Chromium)',
      layer: 'Userspace · OSI L7',
      abstraction: 'Multiplexed streams over one connection',
      protocol: 'HTTP/2 (RFC 9113) + HPACK (RFC 7541)',
      misconception: "You might think HTTP/2 eliminates head-of-line blocking — actually it only does so at the HTTP layer. One lost TCP segment still stalls EVERY stream on that connection, because TCP insists on delivering bytes in order. That exact problem is why QUIC and HTTP/3 were invented.",
      analogy: "Several phone conversations interleaved on one line, with every sentence tagged by which conversation it belongs to so nobody gets muddled.",
      command: 'chrome://net-export  →  load the capture at netlog-viewer.appspot.com',
      production: 'Watch for stalls caused by SETTINGS_MAX_CONCURRENT_STREAMS (often 100 at the edge) — a client firing 500 parallel fetches queues 400 of them invisibly, and the "slow API" is actually your own concurrency.'
    }
  },

  {
    id: 'client-mojo-ipc',
    chapter: 24,
    title: 'Crossing processes: Mojo IPC to the renderer',
    node: 'webapi',
    mode: 'user',
    when: { runtime: 'browser' },
    state: { proc: 'chrome renderer PID 4821' },
    explain: {
      what: "The part of Chrome that runs your JavaScript is not allowed anywhere near a network socket, so the data has to be handed over. The network service (PID 4903) and the renderer (PID 4821) are separate operating-system processes with separate memory: the renderer has no socket, no TLS keys, and no way to open a connection itself. The response crosses between them via Mojo, Chromium's own message-passing layer — small control messages over a message pipe, and the body bytes over a shared-memory data pipe so the payload is not copied a second time. Inside the renderer, Blink builds a Response object whose body is a ReadableStream.",
      why: "Site isolation is the reason for all of this: a renderer that has been compromised by attacker JavaScript must not be able to open sockets of its own or read another site's cookies. Network access is simply a power it does not have.",
      component: 'Mojo IPC + URLLoader (Chromium services/network)',
      layer: 'Userspace · inter-process boundary',
      abstraction: 'Capability-restricted multi-process browser architecture',
      protocol: 'Mojo message pipes + shared-memory data pipes',
      misconception: "You might think fetch() opens a socket — actually your JavaScript never touches one. It sends a structured request to a more privileged process, which does the networking on your behalf and hands back a filtered result. That indirection is precisely why CORS can be enforced at all.",
      analogy: "Ordering room service rather than wandering into the hotel kitchen. You say what you want through a controlled channel, and staff who actually have keys bring it to you.",
      command: 'chrome://process-internals   # see the process-per-site breakdown',
      production: 'Site isolation costs real memory (each origin its own renderer) but eliminated a whole class of Spectre-era cross-origin leaks. Enterprise policies that disable it trade security for RAM, usually unwisely.'
    }
  },

  {
    id: 'node-undici-response',
    chapter: 24,
    title: 'Node path: libuv sees readability, undici builds the Response',
    node: 'undici',
    mode: 'user',
    when: { runtime: 'node' },
    state: { proc: 'node PID 1337' },
    explain: {
      what: "On the Node side there is no second process and no handover at all. libuv's epoll loop reports the socket readable, uv__read pulls the bytes in, and undici — the HTTP client that has been powering the global fetch function since Node 18 — decrypts, parses, and constructs a Response object that follows the same web standard the browser follows, with a ReadableStream for a body. Identical API on the surface, completely different plumbing underneath.",
      why: "Node deliberately implemented the actual fetch STANDARD rather than something that merely looks like it, so code shared between server and browser behaves the same in both, while Node stays free to use an entirely different transport underneath.",
      component: 'libuv + undici (lib/internal/deps/undici)',
      layer: 'Node userspace · L7 client',
      abstraction: 'Standards-compliant fetch over a native event loop',
      protocol: 'HTTP/1.1 or HTTP/2 over TLS (undici)',
      misconception: "You might think Node's fetch is just the node-fetch package bundled in — actually it is undici, a client written from scratch with its own connection pooling, pipelining and dispatcher API. Its behaviour around keep-alive, proxies and timeouts differs from the old library in ways that will surprise you at 3 a.m.",
      analogy: "The same steering wheel and pedals in a different car. The controls are standardised so any driver can get in; the engine under the bonnet is nothing alike.",
      command: 'node --experimental-network-inspection -e "fetch(\'https://api.shop.dev/products\')"',
      production: 'Tune undici with a custom Agent: connections, pipelining, and above all headersTimeout/bodyTimeout — the defaults will happily hang a request far longer than your own SLA allows.'
    },
    code: [
      { title: 'Explicit dispatcher', lang: 'js', code: "import { Agent, setGlobalDispatcher } from 'undici';\n\nsetGlobalDispatcher(new Agent({\n  connections: 64,          // per-origin socket pool\n  keepAliveTimeout: 10_000,\n  headersTimeout: 5_000,    // fail fast, do not hang\n  bodyTimeout: 10_000,\n}));" }
    ]
  },

  {
    id: 'fetch-promise-resolve',
    chapter: 24,
    title: 'The fetch Promise resolves — as a microtask',
    node: 'eventloop',
    mode: 'user',
    effects: ['queue+'],
    explain: {
      what: "The Response object now exists, so the Promise that fetch() handed back twenty chapters ago is finally resolved. But resolving does NOT run your code — it only puts your .then callback onto the microtask queue, a short list of jobs the engine promises to get to very soon. That queue is drained at the next checkpoint: once the currently running synchronous code finishes, before the page is drawn, and before any timer or I/O callback waiting in the longer macrotask queue.",
      why: "Having two queues rather than one is what makes async ordering predictable at all: microtasks — promises, queueMicrotask, MutationObserver — always run to completion before the next macrotask, which covers setTimeout, I/O and user events.",
      component: 'V8 microtask queue + HTML event loop',
      layer: 'Userspace · JS runtime',
      abstraction: 'Job queues with defined checkpoints',
      protocol: 'ECMAScript job semantics + HTML event loop spec',
      misconception: "You might think setTimeout(fn, 0) runs before an already-resolved promise — actually it never does. The whole microtask queue empties before the next macrotask gets a look in, and a microtask that keeps queueing more microtasks can starve the loop forever and freeze the page solid.",
      analogy: "A manager who clears every last sticky note stuck round the edge of the monitor before opening a single new email.",
      command: 'node -e "setTimeout(()=>console.log(\'timeout\'),0); Promise.resolve().then(()=>console.log(\'micro\')); console.log(\'sync\')"',
      production: 'Long microtask chains are invisible to most profilers but block paint. Chrome DevTools Performance shows them inside the "Run Microtasks" block — where mysterious 200ms input delays love to hide.'
    },
    code: [
      { title: 'Queue priority, demonstrated', lang: 'js', code: "console.log('1 sync');\nsetTimeout(() => console.log('4 macrotask'), 0);\nPromise.resolve().then(() => console.log('3 microtask'));\nconsole.log('2 sync');\n// 1 sync, 2 sync, 3 microtask, 4 macrotask — always this order" }
    ]
  },

  {
    id: 'await-resumes',
    chapter: 24,
    title: 'await resumes: the suspended function comes back to life',
    node: 'appcode',
    mode: 'user',
    effects: ['queue-', 'ctx'],
    explain: {
      what: "The bookmark comes out and the story picks up exactly where it stopped. The event loop reaches its microtask checkpoint and runs the queued job. V8 restores everything the suspended async function had when it paused — its local variables, the closure it was written inside, and the exact spot it was recorded as having reached at the await — and execution simply continues on the next line, with the variable response now holding the Response object. Everything that happened in the last 250 milliseconds has collapsed into one perfectly ordinary local variable.",
      why: "async/await is a compile-time transformation, not a runtime pause: the function was rewritten into a state machine whose data lived on the heap while the network got on with its work. That is precisely why no thread was ever blocked waiting.",
      component: 'V8 async function resumption (generator-based state machine)',
      layer: 'Userspace · JS execution',
      abstraction: 'Coroutines over a single-threaded event loop',
      protocol: '—',
      misconception: "You might think await pauses the thread — actually it returns from the function completely, leaving behind a note about where to resume. The thread went off and did plenty of other work in the meantime, which is exactly why code after an await can find the world has changed underneath it.",
      analogy: "A bookmark in a novel. The book was shut and put on the shelf, the reader lived an entire day, and now they open it to the exact page and the exact sentence.",
      command: 'node --stack-trace-limit=50 --async-stack-traces app.js',
      production: 'Async stack traces cost a little memory and are worth every byte — without them a rejected promise gives you a stack that starts at the microtask, telling you nothing about who called what.'
    },
    code: [
      { title: 'Where we resume', lang: 'js', code: "async function loadProducts() {\n  const response = await fetch('https://api.shop.dev/products?limit=20');\n  //               ^ chapter 4 suspended here; chapter 24 resumes here\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  const products = await response.json();   // next step\n  return products;\n}" }
    ]
  },

  {
    id: 'response-json-parse',
    chapter: 24,
    title: 'response.json(): drain the stream, decode, parse',
    node: 'machinecode',
    mode: 'user',
    state: { mem: 'user' },
    explain: {
      what: "There is a second await here, and it is not an accident: the body is a stream and may not have fully arrived yet. json() drains that ReadableStream, decodes the raw bytes as UTF-8 — which is exactly why the charset in Content-Type matters — and then calls the engine's JSON parser, a hand-written C++ scanner inside V8 rather than anything written in JavaScript. Out come twenty objects that all share the same internal shape, which means property access on them will be fast and predictable rather than requiring a fresh lookup each time.",
      why: "The body is a separate await precisely because the headers arrive before the body does: you get to inspect the status and headers and walk away from a 2GB download without ever reading a byte of it.",
      component: 'Body mixin + V8 JSON parser (src/json/json-parser.cc)',
      layer: 'Userspace · deserialization',
      abstraction: 'Byte stream → UTF-8 text → JS object graph',
      protocol: 'JSON (RFC 8259), UTF-8 (RFC 3629)',
      misconception: "You might think response.ok is true whenever fetch resolves — actually fetch only rejects on a NETWORK failure. A 500 from the server resolves perfectly happily, with ok set to false, and forgetting to check it is the single most common fetch bug in production code.",
      analogy: "Signing for the shipping manifest at the door, then unpacking and counting the contents of the crate as an entirely separate job later.",
      command: 'node -e "const s=JSON.stringify(Array.from({length:20},(_,i)=>({id:i,name:\'x\'}))); console.time(\'p\'); JSON.parse(s); console.timeEnd(\'p\')"',
      production: 'JSON.parse is synchronous and blocking. Above a few megabytes, move it to a worker thread or use a streaming parser — a 30MB parse on the main thread is a 300ms frozen UI, every single time.'
    },
    code: [
      { title: 'The correct shape', lang: 'js', code: "const response = await fetch(url);\nif (!response.ok) {                       // 4xx/5xx do NOT reject\n  throw new HttpError(response.status, await response.text());\n}\nconst products = await response.json();   // 20 objects in the JS heap\nconsole.log(products.length);             // 20" }
    ]
  },

  {
    id: 'render-paint',
    chapter: 24,
    title: 'setState → reconcile → layout → paint',
    node: 'appcode',
    mode: 'user',
    explain: {
      what: "The component calls setState with the twenty products, and the browser turns data into light. React schedules a re-render, compares its lightweight copy of the page against the previous one, and applies only the handful of real changes that actually differ. Those changes invalidate the layout, so the browser recalculates styles, runs layout to work out where everything sits, paints the result into layers, and the compositor hands those layers to the GPU. At the next vsync — within 16.7 milliseconds on a 60Hz screen — the person at the keyboard finally SEES twenty products.",
      why: "This is the last hop of the entire journey and the only one a human perceives. Everything across twenty-four chapters existed to put these particular pixels on this particular screen.",
      component: 'React reconciler + Blink style/layout/paint/composite',
      layer: 'Userspace · rendering pipeline',
      abstraction: 'Declarative state → pixels',
      protocol: 'CSSOM + DOM specifications',
      misconception: "You might think changing the DOM paints straight away — actually changes are collected up and the pipeline runs at the next frame. Reading something like offsetHeight immediately after a write forces the browser to stop and compute layout right then, and doing that in a loop is how a smooth list turns into a stuttering one.",
      analogy: "Marking up proofs versus the printing press actually running. The corrections pile up on the desk; the press runs to its own schedule, whether you are finished or not.",
      command: 'performance.mark(\'data\'); performance.measure(\'fetch→paint\', \'start\', \'data\');',
      production: 'Core Web Vitals live here: LCP is when the largest element paints, INP measures interaction responsiveness. A fast API with a slow render still fails the user, and the field data will tell you so.'
    },
    code: [
      { title: 'The component', lang: 'js', code: "function ProductList() {\n  const [products, setProducts] = useState([]);\n\n  useEffect(() => {\n    let alive = true;\n    fetch('https://api.shop.dev/products?limit=20')\n      .then((r) => r.json())\n      .then((d) => { if (alive) setProducts(d); });\n    return () => { alive = false; };    // no setState after unmount\n  }, []);\n\n  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;\n}" }
    ]
  },

  {
    id: 'finale-recap',
    chapter: 24,
    title: 'One line of JavaScript, roughly 250 milliseconds',
    node: 'appcode',
    mode: 'user',
    effects: ['zoomout', 'flash'],
    state: { mode: 'user', mem: 'user' },
    explain: {
      what: "One line of code, and look what it touched. A single await fetch() passed through roughly forty distinct components: V8 compiled it, libuv or the browser's network service dispatched it, the kernel crossed the boundary between user and kernel privilege twice on this laptop alone and twice more on every server involved, a network card turned it into electricity on copper, a home router rewrote its address, an ISP hauled it across a continent, DNS turned a name into a number, TLS wrapped it, Cloudflare inspected and routed it, nginx proxied it, an iptables rule redirected it into a container, NestJS routed and validated it, Prisma compiled SQL, PostgreSQL planned it, ran it, and checked which row versions you were entitled to see — and then every single one of those steps ran again in reverse. The budget: about 30ms of DNS on a cold start, 45ms of TCP and TLS handshaking, 120ms of network round trips, 4ms of application code, 0.4ms of database, and 10ms of rendering.",
      why: "Look hard at the shape of that budget. The database — the very first thing most engineers reach to optimise — was the smallest slice by a factor of a hundred. Network time and handshakes dominate, which is why keeping connections alive, caching at the edge and making fewer round trips beat micro-optimisations every single time.",
      component: 'The entire stack, top to bottom and back',
      layer: 'All of them',
      abstraction: 'Layered protocols: every layer a promise the one below keeps',
      protocol: 'HTTP · TLS · TCP · IP · Ethernet · DNS · BGP · SQL',
      misconception: "You might think everything closes down now — actually almost nothing does. The TCP connection, the TLS session, the HTTP/2 stream multiplexer, the origin-pull tunnel to Cloudflare, the pooled Postgres connection: all of them stay open and warm. The NEXT fetch skips chapters 5 through 13 entirely and comes back in about 40 milliseconds. That is the entire reason keep-alive exists.",
      analogy: "You have just watched one letter travel from a thought in somebody's head to a printed page on the far side of the world and all the way back again — and every road, every sorting office and every courier on that route is still open, waiting for the next one.",
      command: 'curl -w "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\\n" -o /dev/null -s https://api.shop.dev/products?limit=20',
      production: 'The highest-leverage production wins mirror this chapter list exactly: keep connections alive, cache at the edge, put the database in the same AZ, index for your ORDER BY, and stop making round trips you do not need. Everything else is rounding error.'
    },
    code: [
      { title: 'The whole journey, one line', lang: 'js', code: "const res = await fetch('https://api.shop.dev/products?limit=20');\nconst products = await res.json();\n// ~40 components · 2 user/kernel crossings here · 4+ on the servers\n// 3 TLS sessions · 1 SQL query · 20 rows · 14,208 bytes of JSON\n// and the sockets are still open, waiting for you to do it again." },
      { title: 'What the second call costs', lang: 'bash', code: '# cold\ndns:0.031 connect:0.048 tls:0.092 ttfb:0.241 total:0.253\n\n# warm — same connection, DNS cached, TLS session reused\ndns:0.000 connect:0.000 tls:0.000 ttfb:0.038 total:0.041' }
    ]
  }

];
