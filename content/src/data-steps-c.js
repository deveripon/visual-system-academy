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
      what: 'Pause. Everything you watched on the laptop — ring buffers, IRQs, NAPI, ip_rcv, netfilter, TCP demux — just happened AGAIN inside the server’s kernel for this connection. The proxy’s SYN sat in the listen socket’s SYN queue, graduated to the accept queue on the final ACK, and now the request bytes are queued on an ESTABLISHED socket waiting for the app to read them. We compressed roughly thirty steps into this one.',
      why: 'Every machine in the chain runs the full stack — client, router, edge, proxy host, app host, DB host. Understanding it once means understanding it everywhere; we will replay the receive path in loving detail on the return trip (chapter 23).',
      component: 'Server TCP stack: SYN queue + accept queue (net/ipv4/tcp_input.c)',
      layer: 'Server kernel · L4',
      abstraction: 'The same kernel machinery, other side of the wire',
      misconception: '"The server just receives HTTP requests." The server’s kernel does every bit of work the client’s did — and under load, its accept queue overflowing (ss -ltn Recv-Q at backlog) is a classic silent request-dropper.',
      analogy: 'You toured the sausage factory once; the restaurant kitchen has an identical factory in the basement. We wave at it through the window this time.',
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
      what: 'The listen socket becoming readable means "connection waiting". libuv’s epoll_wait returns inside the node process, and the connection callback calls accept4() with SOCK_NONBLOCK | SOCK_CLOEXEC — the kernel pops the connection off the accept queue and hands back file descriptor 18. Node wraps it in a net.Socket and starts watching IT for readability too.',
      why: 'This is the server half of the event-loop story: one thread, one epoll instance, thousands of sockets. accept4 beats accept because it sets non-blocking atomically — no separate fcntl race.',
      component: 'libuv uv__server_io → uv__accept (deps/uv/src/unix/stream.c)',
      layer: 'Server userspace · syscall boundary',
      abstraction: 'Readiness-driven accept loop',
      protocol: 'Berkeley sockets API',
      misconception: '"Node spawns a thread per connection." One event-loop thread owns every socket; the worker threadpool is for file I/O and crypto, not network sockets.',
      analogy: 'A single receptionist with a wall of doorbell lights — a light blinks (epoll), they buzz the visitor in (accept4), pin a numbered badge on them (fd 18), and go back to watching the wall.',
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
      what: 'fd 18 turns readable; node reads the raw bytes and feeds them to llhttp — Node’s HTTP/1.1 parser, generated from a TypeScript grammar into C by Fedor Indutny as the successor to http_parser. It walks the bytes in a single pass, firing callbacks: on_method, on_url, on_header_field, on_header_value, on_headers_complete. Out the other side comes req.method = "GET", req.url = "/products?limit=20", and a headers object.',
      why: 'Parsing HTTP by hand is a minefield of request-smuggling bugs — llhttp is strict about things like bare CR, duplicate Content-Length, and chunked-encoding edge cases precisely because proxies and apps disagreeing on message boundaries is an attack class.',
      component: 'llhttp (deps/llhttp), invoked from lib/_http_server.js',
      layer: 'Server userspace · L7 parsing',
      abstraction: 'Byte stream → structured request object',
      protocol: 'HTTP/1.1 (RFC 9112)',
      misconception: '"The request arrives as an object." It arrives as bytes that might be split across multiple TCP segments or glued together with the next request — llhttp is a resumable state machine precisely because message boundaries and packet boundaries are unrelated.',
      analogy: 'A court stenographer converting a continuous stream of speech into structured transcript entries — never waiting for the speaker to finish the sentence before starting to write.',
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
      what: 'The request now enters Express, which NestJS wraps. Everything expensive happened at boot: NestFactory.create(AppModule) walked the module graph, instantiated every provider exactly once (singleton scope), resolved the dependency-injection tree, and compiled the route table. Per request, none of that repeats — the request simply flows through pre-wired handler chains.',
      why: 'This is why DI frameworks pay off on servers: construction cost is amortized to zero, wiring is declarative, and swapping a real ProductsService for a mock in tests is a one-line module override.',
      component: 'NestFactory + NestApplicationContext (@nestjs/core)',
      layer: 'Server userspace · application framework',
      abstraction: 'Inversion of control — the framework calls you',
      protocol: '—',
      misconception: '"Decorators run on every request." @Controller, @Get, @Injectable execute ONCE, at class-definition time, writing routing metadata via Reflect. At request time Nest only reads the compiled result.',
      analogy: 'A restaurant kitchen doing its mise en place before service: when the order arrives, nobody is out shopping for onions.',
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
      explain: 'The X-Forwarded-* convention carries the original client IP and scheme across the proxy hop. It only works if the app explicitly trusts the proxy (app.set("trust proxy", 1)) — trusting it blindly lets any direct caller spoof their IP.'
    },
    explain: {
      what: 'The request runs the Express middleware stack in registration order: helmet stamps defensive headers (X-Content-Type-Options, Strict-Transport-Security…), the CORS layer checks Origin against the allowlist, and the logger middleware starts a timer and tags the request with an id. Each middleware calls next() to pass the baton; any one of them could end the request instead.',
      why: 'Middleware is the place for cross-cutting concerns that apply before routing even matters — security headers, compression, body parsing, request logging.',
      component: 'Express middleware stack (helmet, cors, morgan/nestjs-pino)',
      layer: 'Server userspace · L7 pipeline',
      abstraction: 'Chain of responsibility over the request object',
      protocol: 'HTTP semantics (RFC 9110)',
      misconception: '"CORS is enforced by the server." The server merely EMITS Access-Control-Allow-* headers; the browser does all enforcing. curl ignores CORS entirely — it is a browser courtesy, not a security boundary for your API.',
      analogy: 'Airport checkpoints before the gates: ID check, security scan, customs — each can wave you through or stop you, and none cares which flight you board.',
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
      what: 'Nest’s RouterExplorer compiled every @Controller + @Get decorator into an Express route table at boot. The path /products, method GET, matches the pattern registered for ProductsController.findAll — path-to-regexp does the matching, and the query string is already parsed into req.query = { limit: "20" }. Note the type: it is a STRING at this point.',
      why: 'Declarative routing keeps the URL structure in one greppable place next to the handler code, and the framework can enumerate all routes at boot — which is also how it prints the route map and how OpenAPI generation works.',
      component: 'RouterExplorer + path-to-regexp (@nestjs/core)',
      layer: 'Server userspace · L7 dispatch',
      abstraction: 'URL pattern → handler method binding',
      protocol: 'HTTP routing conventions (REST)',
      misconception: '"Route matching is a hash lookup." It is an ordered scan of compiled regexes — route registration ORDER matters, and a greedy /:id route declared before /products/featured will shadow it.',
      analogy: 'A theater usher with the seating chart memorized before doors opened — your ticket string maps to one exact seat, instantly.',
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
      what: 'Before the handler body runs, Nest executes its request lifecycle: guards first (none registered on this route — a public endpoint), then pipes. The global ValidationPipe takes req.query, instantiates ListProductsDto, and class-transformer converts "20" (a string — URLs have no types) into the number 20. class-validator then checks @IsInt, @Min(1), @Max(100). Invalid input short-circuits into a 400 with a machine-readable error body; the handler never runs.',
      why: 'Validation at the boundary means everything past this line can trust its inputs — no defensive re-checking inside services, and no LIMIT 999999 reaching the database because someone edited a URL.',
      component: 'ValidationPipe (@nestjs/common) + class-validator + class-transformer',
      layer: 'Server userspace · input boundary',
      abstraction: 'Untrusted strings → typed, validated domain values',
      protocol: '—',
      misconception: '"TypeScript types validate at runtime." Types are erased at compile time; without a runtime validator, query.limit typed as number would happily hold the string "20" — or "DROP TABLE". The DTO decorators are what actually run.',
      analogy: 'The bouncer checks IDs at the door so no one inside the club has to card anyone again.',
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
      what: 'Nest invokes the handler with the validated DTO. The controller does almost nothing — by design. It translates HTTP-shaped input into a domain call (findAll(20)) and will translate the domain result back into an HTTP response. The return value is a Promise; Nest awaits it and wires the resolution into the response pipeline automatically.',
      why: 'Thin controllers keep transport concerns (status codes, headers, DTOs) separate from business logic, so the same service can serve HTTP today and a GraphQL resolver or message queue consumer tomorrow, untouched.',
      component: 'ProductsController (@nestjs/core route handler invocation)',
      layer: 'Server userspace · presentation layer',
      abstraction: 'HTTP endpoint → domain method adapter',
      protocol: 'REST conventions',
      misconception: '"Returning a Promise from a handler needs special handling." Nest awaits any returned Promise natively — explicitly calling res.json() yourself actually OPTS OUT of interceptors and serialization.',
      analogy: 'A waiter taking your order to the kitchen: they do not cook, they translate table-speak into kitchen-speak and back.',
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
      what: 'The service is where domain rules live: which products are listable (published, not soft-deleted), default ordering, the take cap. It composes a Prisma query and awaits it. The moment that await executes, this entire call chain suspends — controller, service, everything — and the node event loop is free to accept OTHER requests while Postgres works.',
      why: 'This suspension is the entire economic argument for Node on I/O-heavy APIs: one thread multiplexes thousands of in-flight requests because "waiting for the database" costs no thread at all.',
      component: 'ProductsService (@Injectable singleton)',
      layer: 'Server userspace · domain layer',
      abstraction: 'Business rules over a data-access API',
      protocol: '—',
      misconception: '"await blocks the server." It suspends only THIS request’s continuation. The event loop keeps spinning — that is why one slow query does not freeze the API, but one synchronous JSON.parse of a 100MB string absolutely does.',
      analogy: 'A chef who plates other orders while one dish braises in the oven — the oven timer (Promise) will call them back.',
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
      what: 'The service calls the generated Prisma Client. That client is not hand-written: prisma generate read schema.prisma and emitted a fully typed client where product.findMany exists as a real method with a real TypeScript signature. Calling it builds a JSON protocol message describing the intended query — model, operation, arguments, selection set — and hands it to the query engine.',
      why: 'Type-safe data access catches "you selected a column that does not exist" at compile time instead of at 3 a.m. The generated client is the schema, projected into the type system.',
      component: 'Prisma Client (@prisma/client, generated)',
      layer: 'Server userspace · data-access layer',
      abstraction: 'Typed query builder over relational SQL',
      protocol: 'Prisma internal JSON-RPC to the query engine',
      misconception: '"Prisma is an ORM that hides SQL." It is closer to a typed query builder with an explicit compilation step — there is no lazy-loading proxy magic, and every query you write maps to SQL you can print.',
      analogy: 'Ordering from a menu the kitchen printed itself: you cannot order a dish that does not exist, because the menu was generated from the pantry.',
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
      what: 'Prisma’s query engine — historically a Rust binary spoken to over a local channel, now increasingly a WASM/TypeScript compiler in the same process — turns the JSON query document into real parameterised SQL. Note what it does with take: 20: it becomes LIMIT $3, a bind parameter, not string concatenation. The column list is explicit; SELECT * never appears.',
      why: 'A compilation step means one query description can target Postgres, MySQL, or SQLite dialects, and parameterisation makes SQL injection structurally impossible rather than merely discouraged.',
      component: 'Prisma query engine (query-engine, Rust/WASM)',
      layer: 'Server userspace · SQL generation',
      abstraction: 'Query AST → dialect-specific SQL',
      protocol: 'PostgreSQL SQL dialect',
      misconception: '"An ORM emits terrible SQL." For simple reads it emits exactly what you would write by hand. The pathological queries come from relation traversal in loops (N+1) — which is a code-shape problem, not a code-generation one.',
      analogy: 'A compiler emitting assembly: you write intent, it writes the instructions, and you can always ask to see the listing.',
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
      what: 'The engine needs a database connection. It does not open one — TCP handshake plus TLS plus Postgres auth plus backend fork is tens of milliseconds. Instead it borrows one of the connections opened at boot and held idle. The pool is a semaphore over a fixed array: if all connection_limit slots are busy, this request WAITS in a queue, and that wait time is invisible to the database.',
      why: 'Postgres allocates a whole OS process per connection with its own work_mem; thousands of connections will destroy a database that would happily serve the same traffic over twenty. The pool is the throttle that protects it.',
      component: 'Prisma connection pool (default connection_limit = num_cpus * 2 + 1)',
      layer: 'Server userspace · resource pooling',
      abstraction: 'Bounded reuse of expensive kernel + server resources',
      protocol: '—',
      misconception: '"A bigger pool is faster." Past the database’s CPU/IO capacity a bigger pool just moves the queue from your app into Postgres, where it is harder to see and where every waiter holds a process. Little’s Law beats optimism.',
      analogy: 'A library with twenty study rooms. Adding a hundred people to the waiting list does not create rooms; it just makes the list longer and the librarian sadder.',
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
      what: 'The driver speaks the PostgreSQL frontend/backend protocol v3 in EXTENDED query mode: a Parse message ships the SQL text with $-placeholders and names the prepared statement; Bind supplies the actual parameter values and creates a portal; Execute runs the portal; Sync closes the message group and asks for ReadyForQuery. Each message is a one-byte type tag, a four-byte length, then the payload.',
      why: 'Separating plan-time from bind-time means the same statement can be re-executed with new parameters without reparsing, and — crucially — parameters travel out-of-band, so a value can never be mistaken for SQL syntax.',
      component: 'PostgreSQL wire protocol v3 (extended query)',
      layer: 'Server userspace · L7 database protocol',
      abstraction: 'Prepared statement + portal execution',
      protocol: 'PostgreSQL FE/BE protocol v3',
      misconception: '"Prepared statements are only about speed." Their headline benefit is safety: parameters are typed values in a separate field, so injection cannot happen no matter what the user typed.',
      analogy: 'A form letter (Parse) plus a merge field list (Bind) — the mail merge cannot turn a customer name into a new paragraph of instructions.',
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
      what: 'write() on the pooled socket, ring 3 → ring 0, copy into the socket send buffer, tcp_sendmsg segments it, ip_queue_xmit adds the header, netfilter OUTPUT and POSTROUTING run (MASQUERADE rewrites the container source to the host’s 10.0.0.9), the qdisc dequeues, the driver DMAs it to the NIC, and it crosses the datacenter fabric to the database host — where the entire receive path runs in ITS kernel. We are compressing about forty steps into this one panel, because you have already earned them.',
      why: 'Every hop in a distributed system pays this cost. That is why "just add a microservice" is never free: each network call is two full kernel traversals plus a wire, and 500 microseconds of it is measurable at scale.',
      component: 'Full TCP/IP egress path (net/ipv4/tcp_output.c → drivers)',
      layer: 'Server kernel · L2-L4',
      abstraction: 'Everything from chapters 6-11, replayed in one breath',
      protocol: 'TCP/IP',
      misconception: '"A database call is one operation." It is a network round trip with all the machinery that implies — which is why batching twenty queries into one saves far more than twenty times the SQL parse cost.',
      analogy: 'The montage in the middle of the movie: we already showed you the training, so now you get the drumbeat and a wipe cut.',
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
      what: 'On the database host the receive path completes and the bytes are queued on the socket owned by backend process 8842 — the dedicated Postgres process that has served this pooled connection since boot. It was blocked in a latch/epoll wait inside secure_read; the data makes it runnable and the scheduler puts it back on a CPU.',
      why: 'One backend per connection is Postgres’ core architectural choice: strong isolation, easy crash containment, cheap shared-memory coordination — and the reason connection counts must be governed by a pool.',
      component: 'Postgres backend socket read (backend/libpq/pqcomm.c)',
      layer: 'Database host · userspace/kernel boundary',
      abstraction: 'Persistent per-connection server process',
      protocol: 'PostgreSQL FE/BE v3 over TCP',
      misconception: '"Postgres is multithreaded." Through version 18 it is process-per-connection; threading has been a long-running proposal precisely because processes make connection scaling expensive.',
      analogy: 'A dedicated case worker who has your file open on their desk and has been waiting for your next letter — no queue, no re-explaining your history.',
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
      what: 'The postmaster — the supervisor process that owns the shared memory segment — accepted this connection at pool-warmup time, forked a child, and that child ran authentication (scram-sha-256), set the search_path, and has been this connection’s exclusive server ever since. Alongside it run the background workers: checkpointer, walwriter, autovacuum launcher, bgwriter, stats collector.',
      why: 'Fork-per-connection gives every session its own memory and crash domain: a backend that segfaults is reaped and the postmaster restarts the cluster into recovery rather than serving corrupted state.',
      component: 'postmaster + backend (backend/postmaster/postmaster.c)',
      layer: 'Database host · process architecture',
      abstraction: 'Process-per-session with shared memory',
      protocol: '—',
      misconception: '"Connections are cheap, just open more." Each backend is a fork plus ~10MB RSS plus catalog caches. Going from 100 to 1000 connections often makes throughput go DOWN — context switching and lock contention eat the gains.',
      analogy: 'A law firm assigning you one attorney for the life of your case, all of them sharing the same case-file room (shared_buffers).',
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
      what: 'The raw SQL text goes through the flex/bison grammar (scan.l, gram.y) producing a raw parse tree — pure syntax, no meaning. The analyzer then walks it doing catalog lookups: is there a relation named Product? (pg_class), what are its columns and types? (pg_attribute), does the user hold SELECT on it? (pg_class.relacl). The output is a Query tree with every name resolved to an OID.',
      why: 'Splitting syntax from semantics is what lets Postgres give you "column p.nmae does not exist" with a helpful HINT instead of a parser error — by the time it fails, it knows what columns DO exist.',
      component: 'Parser + analyzer (backend/parser/analyze.c)',
      layer: 'Database · query pipeline stage 1',
      abstraction: 'SQL text → semantically resolved query tree',
      protocol: 'SQL:2016 dialect',
      misconception: '"Prepared statements skip parsing." Parse happens once per named statement per BACKEND — reconnect, or move to a new pooled connection, and it parses again.',
      analogy: 'Reading a sentence for grammar, then looking up every proper noun in a directory to confirm those people actually exist.',
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
      explain: 'LIMIT can short-circuit only if rows arrive in the required order already — typically from an index scan matching the ORDER BY. If the plan needs a Sort, a HashAggregate, or a hash join build, it must consume the entire input first; LIMIT then discards nearly all of that work. Matching your index to your ORDER BY is what turns a 4-second query into a 0.2ms one.'
    },
    explain: {
      what: 'The planner enumerates candidate plans and prices each one using statistics from pg_statistic and the cost constants (seq_page_cost 1.0, random_page_cost 4.0, cpu_tuple_cost 0.01). Here it compares a Seq Scan on 894 pages plus a Sort against an Index Scan on the composite index that already yields rows in id order. The index scan wins decisively because ORDER BY id ASC LIMIT 20 lets it stop after 20 rows.',
      why: 'Cost-based planning is why the same SQL can pick different plans as data grows: at 100 rows a seq scan is cheapest; at 121,430 rows it is not. The planner re-decides every time.',
      component: 'Planner/optimizer (backend/optimizer/plan/planner.c)',
      layer: 'Database · query pipeline stage 2',
      abstraction: 'Search the plan space, minimize estimated cost',
      protocol: '—',
      misconception: '"The planner uses my indexes if they exist." It uses them if it BELIEVES they are cheaper. Stale statistics (no ANALYZE after a bulk load) routinely make it choose a seq scan over a perfect index.',
      analogy: 'A navigation app comparing routes by predicted travel time — not by which road you like — and re-routing when traffic data changes.',
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
      what: 'ExecutorRun walks the plan tree as a demand-driven pipeline (the Volcano model): the Limit node asks its child for a tuple, the Index Scan node produces one, and this repeats. Nothing is materialised up front. After the twentieth tuple the Limit node simply stops asking, and the index scan is abandoned mid-descent with 121,410 rows never touched.',
      why: 'Pull-based iteration is why LIMIT can be nearly free on a well-indexed query — the executor never does work nobody asked for.',
      component: 'Executor (backend/executor/execMain.c, ExecProcNode)',
      layer: 'Database · query pipeline stage 3',
      abstraction: 'Iterator pipeline over plan nodes',
      protocol: '—',
      misconception: '"The database computes the whole result then trims it." Only blocking nodes (Sort, Hash, Aggregate) do that. Streaming nodes hand tuples up one at a time and can stop early.',
      analogy: 'A bucket brigade that stops the moment the fire is out — nobody keeps hauling water for the buckets that were never needed.',
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
      what: 'The index is a B-tree of 8KB pages, three levels deep for 121K rows: root → internal → leaf. The scan reads the root, binary-searches its keys for published=true, follows a downlink to an internal page, searches again, and lands on a leaf page whose entries are (key, ctid) pairs — the ctid being the physical (block, offset) address of the heap tuple. Leaf pages are chained left-to-right, so the ordered scan just walks the chain.',
      why: 'Three page reads to locate any row among a hundred thousand — and a fourth to fetch it — is the entire reason indexes exist. Depth grows logarithmically: a billion rows is still only about five levels.',
      component: 'nbtree access method (backend/access/nbtree/nbtsearch.c)',
      layer: 'Database · storage access method',
      abstraction: 'Ordered, balanced, block-oriented search structure',
      protocol: 'Lehman-Yao B-link tree (concurrent, lock-coupled)',
      misconception: '"An index scan reads only the index." Unless the query is index-only AND the visibility map says the pages are all-visible, every match also costs a random heap read to check MVCC visibility.',
      analogy: 'A library card catalogue: three drawers of narrowing alphabetical dividers get you to a card, and the card gives you the shelf coordinates — then you still have to walk to the shelf.',
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
      what: 'Every page request goes through ReadBuffer, which hashes the (relfilenode, blocknum) tag into the shared buffer table living in Postgres’ shared memory segment. Six of our seven pages — the B-tree root, internals, and hot heap pages — are already resident: a hash probe, a pin, a usage-count bump, and the page pointer is returned in nanoseconds. That is what "Buffers: shared hit=6" in the EXPLAIN meant.',
      why: 'shared_buffers is Postgres’ own page cache, sized typically at 25% of RAM. Hitting it avoids not just disk but the syscall to the OS cache too.',
      component: 'Buffer manager (backend/storage/buffer/bufmgr.c)',
      layer: 'Database · shared memory cache',
      abstraction: 'Pinned, reference-counted page cache with clock-sweep eviction',
      protocol: '—',
      misconception: '"shared_buffers should be as big as possible." Postgres deliberately relies on the OS page cache as a second tier; oversizing shared_buffers duplicates pages in both caches and lengthens checkpoint write storms.',
      analogy: 'Books already on your desk versus books in the building’s stacks: the desk is instant, but it only has room for so many.',
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
      what: 'The seventh page — a heap block holding some of our twenty rows — is not in shared_buffers. The buffer manager runs the clock sweep to evict a victim (decrementing usage counts until it finds a zero), then calls smgrread → pread(fd, buf, 8192, offset) against the relation file. That pread enters the kernel and lands in the OS page cache, which very likely already holds the block: a memcpy from kernel page cache into the shared buffer, no disk involved.',
      why: 'Two cache tiers means a shared_buffers miss is usually still micro-seconds, not milliseconds. This is exactly why Postgres does not try to own all of RAM.',
      component: 'smgr → pread(2) → kernel page cache (mm/filemap.c)',
      layer: 'Database ↔ kernel · storage I/O',
      abstraction: 'Two-level caching: process cache over OS cache',
      protocol: '—',
      misconception: '"shared hit=0 means we read from disk." It means we left shared_buffers. The read may be served entirely from the OS page cache at RAM speed — track_io_timing is what distinguishes them.',
      analogy: 'Not on your desk, so you walk to the departmental shelf down the hall — still much faster than ordering from the archive warehouse.',
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
      what: 'If the OS page cache also lacks the block, the kernel submits a block-layer request: the filesystem maps file offset to LBA, the request enters the mq-deadline queue, the NVMe driver rings a submission-queue doorbell, and the device DMAs 8192 bytes into the page. On completion it raises an interrupt, the page is marked uptodate, and pread returns. NVMe: ~80-100 microseconds. Spinning rust: 5-10 milliseconds — fifty times slower.',
      why: 'This is the only step in the entire chapter that touches physical media, and on a healthy OLTP system it is the rarest. Database performance work is largely the art of avoiding this step.',
      component: 'Block layer + NVMe driver (block/blk-mq.c, drivers/nvme/)',
      layer: 'Database host · kernel block I/O',
      abstraction: 'File offset → LBA → device queue → DMA',
      protocol: 'NVMe over PCIe',
      misconception: '"SSDs made I/O free." An NVMe read is still ~100us — roughly 300,000 CPU cycles. A query doing 10,000 random reads is a full second of pure waiting no matter how fast your CPU is.',
      analogy: 'Requesting a box from the offsite archive. Fast courier or slow courier, it is still a different building.',
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
      what: 'Every heap tuple carries xmin (the transaction that created it) and xmax (the transaction that deleted it, if any). Our statement took a snapshot at start: a list of in-progress transaction ids plus xmax boundary. For each candidate row HeapTupleSatisfiesMVCC asks: was xmin committed before my snapshot, and is xmax either absent or not-yet-committed? Only then is the row mine to see. Rows updated by a still-open transaction are silently skipped — the previous version is returned instead.',
      why: 'This is how readers never block writers and writers never block readers. Nobody takes a shared lock on a row just to read it, which is the single biggest reason Postgres handles mixed workloads gracefully.',
      component: 'MVCC visibility (backend/access/heap/heapam_visibility.c)',
      layer: 'Database · transaction isolation',
      abstraction: 'Multi-version concurrency control over snapshots',
      protocol: 'Snapshot isolation (READ COMMITTED default)',
      misconception: '"DELETE frees space immediately." It only sets xmax. The dead tuple sits there until VACUUM proves no snapshot can still see it — which is why a table can be 90% dead rows and grow while you delete from it.',
      analogy: 'A photograph of the ledger taken when your query started. Later edits happen on the real ledger; you keep reading your photo, consistently.',
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
      what: 'A SELECT writes no WAL: nothing durable changed. But it may still DIRTY a page — the first reader of a tuple whose transaction has since committed sets a hint bit (HEAP_XMIN_COMMITTED) so later readers skip the commit-log lookup. That is a page modification, so with wal_log_hints or checksums enabled it emits a full-page image. Which is the honest answer to "why is my read-only query writing?"',
      why: 'WAL is the durability contract: write-ahead means the log record hits stable storage before the data page does, so a crash can be replayed. Reads normally sit entirely outside that contract.',
      component: 'WAL writer + hint bits (backend/access/transam/xlog.c)',
      layer: 'Database · durability layer',
      abstraction: 'Write-ahead logging',
      protocol: 'ARIES-style physical logging',
      misconception: '"SELECTs never write." Hint-bit setting after a bulk load makes the first scan of fresh data measurably slower and dirties pages — a classic "why is the first query after import slow" mystery.',
      analogy: 'A librarian who pencils "verified" in a book’s margin while reading it — not a change to the story, but the page is now different from the archive copy.',
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
      what: 'Each qualifying tuple is converted from its on-disk binary layout into wire format by the type output functions (int4out, textout, timestamptzout) and framed as a DataRow message: a byte count per column, then the bytes. One RowDescription precedes them all, describing the columns and their type OIDs. CommandComplete carries the tag SELECT 20, and ReadyForQuery signals the backend is idle again.',
      why: 'Row-at-a-time streaming means the client can start processing before the server finishes — and it is why cursors can page through billions of rows without the server buffering them.',
      component: 'printtup destination receiver (backend/access/common/printtup.c)',
      layer: 'Database · result serialization',
      abstraction: 'Tuple → typed wire message',
      protocol: 'PostgreSQL FE/BE v3 (DataRow)',
      misconception: '"The database sends binary." By default it sends TEXT format — 1234 travels as the four characters "1234". Binary format exists but drivers must opt in per parameter.',
      analogy: 'Reading a ledger aloud line by line down the phone, having first announced the column headings.',
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
      what: 'The backend flushes its output buffer with a send() on the connection socket, then loops back to waiting for the next message. Total elapsed inside Postgres: about 0.4 milliseconds — 0.18ms planning, 0.14ms executing, the rest serialization. The bytes now retrace the datacenter path, kernel egress on the DB host, kernel ingress on the app host, into the pooled socket the query engine is waiting on.',
      why: 'Naming the number matters: sub-millisecond database time inside a ~250ms user-visible request tells you where NOT to optimize.',
      component: 'Backend socket flush (backend/libpq/pqcomm.c internal_flush)',
      layer: 'Database host · L4 egress',
      abstraction: 'Result set → TCP byte stream',
      protocol: 'PostgreSQL FE/BE v3 over TCP',
      misconception: '"The query took 0.4ms so the endpoint is fast." Add pool wait, two network traversals, hydration, serialization, and proxy hops — the database is often the smallest slice of the pie chart.',
      analogy: 'The kitchen finishing in forty seconds; the food still has to cross the dining room, and the diner still has to be found.',
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
      what: 'The query engine reads the DataRow messages and converts each wire value using the column type OIDs from RowDescription: int4 → number, text → string, bool → boolean, timestamptz → a JS Date. Twenty plain objects are allocated in the V8 heap with the exact shape the generated TypeScript type promised. Prisma also maps snake_case columns back to camelCase fields if the schema said so.',
      why: 'Type mapping is where ORMs earn their keep and where they betray you: JavaScript numbers are IEEE-754 doubles, so BIGINT and NUMERIC cannot round-trip safely — Prisma returns BigInt and Decimal wrappers for exactly that reason.',
      component: 'Prisma query engine result deserialization',
      layer: 'Server userspace · data mapping',
      abstraction: 'Wire rows → typed domain objects',
      protocol: 'PostgreSQL type OIDs → JS types',
      misconception: '"The database returns objects." It returns bytes. Every object you hold is an allocation your process made — which is why SELECT-ing a million rows OOMs the app, not the database.',
      analogy: 'Unpacking a shipping container: the goods were shrink-wrapped flat for transport and now get assembled into usable furniture.',
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
      what: 'The engine hands the connection back to the pool — the semaphore slot is freed and any request queued behind it is woken immediately. The Promise created back in ProductsService resolves, its continuation is scheduled as a microtask, and the event loop resumes the suspended async function exactly where it stopped. The service returns the array to the controller; the controller returns it to Nest.',
      why: 'Prompt release is what makes a pool of 17 serve thousands of requests per second: hold time, not pool size, is the resource that matters.',
      component: 'Pool release + V8 microtask queue',
      layer: 'Server userspace · concurrency',
      abstraction: 'Resource lease ends; continuation resumes',
      protocol: '—',
      misconception: '"await resumes immediately when the data arrives." It resumes when the event loop reaches the microtask checkpoint — if some synchronous handler is hogging the thread, your resolved Promise waits in line.',
      analogy: 'Returning the rental car keys the moment you park, not at the end of your holiday — the next customer drives off immediately.',
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
      what: 'Nest runs the response half of the lifecycle: interceptors wrap the handler result (ClassSerializerInterceptor strips @Exclude fields such as internal cost or supplier ids, applies @Transform, and turns Dates into ISO-8601 strings), then the framework calls res.json(). Express sets Content-Type: application/json; charset=utf-8 and runs JSON.stringify over the array, producing roughly 14 kilobytes of UTF-8 text.',
      why: 'Serialization is the last gate before data leaves your trust boundary — the difference between an API and a data leak is usually one @Exclude decorator.',
      component: 'ClassSerializerInterceptor + Express res.json',
      layer: 'Server userspace · L7 serialization',
      abstraction: 'Domain objects → transport representation',
      protocol: 'JSON (RFC 8259), UTF-8',
      misconception: '"JSON.stringify is cheap." It is synchronous and O(size): stringifying a 50MB payload blocks the event loop for hundreds of milliseconds and stalls EVERY concurrent request on that process.',
      analogy: 'A press officer editing the internal memo into a public statement — removing the parts that were never meant to leave the building.',
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
      what: 'Node writes the status line, headers, and body to fd 18. Ring 3 → ring 0, copy_from_user into the socket send buffer, tcp_sendmsg segments 14,208 bytes into ten MSS-sized packets, and the container’s network stack pushes them out eth0. Yes: the entire egress path, again, compressed into one panel. You have earned the montage twice over.',
      why: 'Ten segments means the receiver’s window and the congestion window actually matter now — this is the first time in the story we are sending enough data for TCP flow control to have an opinion.',
      component: 'write(2) → tcp_sendmsg → veth xmit',
      layer: 'Container kernel · L4 egress',
      abstraction: 'Response bytes → segmented TCP stream',
      protocol: 'HTTP/1.1 over TCP',
      misconception: '"One write() equals one packet." The kernel decides segmentation, and with TCP Segmentation Offload the NIC may do it — a single 14KB write can leave as one giant skb that hardware splits on the way out.',
      analogy: 'Handing a 14-page report to the mailroom: they choose how many envelopes it takes, not you.',
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
      what: 'The response crosses eth0 → veth → docker0 and hits the host stack, where conntrack recognises it as the REPLY direction of the flow created back in chapter 17. No iptables rule is consulted: the stored tuple says this flow was DNATed, so the kernel rewrites the source back to 172.17.0.1:443 — exactly the address nginx connected to. As far as nginx is concerned, the published port answered.',
      why: 'Stateful NAT is what makes port publishing transparent. Without conntrack the reply would arrive from an address the proxy never dialed and its TCP stack would answer with an RST.',
      component: 'nf_conntrack reply-direction NAT (net/netfilter/nf_nat_core.c)',
      layer: 'Server kernel · L3/L4',
      abstraction: 'Flow state replaces per-packet policy',
      protocol: 'Netfilter connection tracking',
      misconception: '"NAT breaks connections when the table is full." Worse — it silently DROPS new flows and logs nf_conntrack: table full, dropping packet. Under load this looks like random connection failures with no application errors at all.',
      analogy: 'The forwarding clerk remembering that letters from room 3000 must be re-stamped as coming from the front desk, so the sender never learns the room number.',
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
      what: 'nginx reads the upstream response into its proxy buffers (default 8 buffers of 4KB plus one 4KB header buffer — our 14KB fits comfortably in memory; anything larger spills to a temp file on disk). It rewrites hop-by-hop headers, drops X-Powered-By if configured, adds Server: nginx, applies gzip if the client’s Accept-Encoding allows it, and only then starts writing to the downstream connection.',
      why: 'Buffering frees the upstream connection as fast as possible so the app can serve the next request while nginx patiently feeds a slow mobile client. This is the whole reason a reverse proxy sits in front of an app server.',
      component: 'ngx_http_proxy_module (proxy_buffering)',
      layer: 'Origin server · L7 proxy',
      abstraction: 'Decoupling fast upstream from slow downstream',
      protocol: 'HTTP/1.1',
      misconception: '"Turning off proxy_buffering makes things faster." It makes the FIRST byte faster and everything else worse: your Node process is then pinned to the slowest client on the network. Disable it only for SSE and streaming endpoints.',
      analogy: 'A restaurant runner who takes the whole plated order from the pass immediately, freeing the chef, then walks it to the table at the diner’s pace.',
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
      what: 'nginx encrypts the (now gzipped, ~2.4KB) response into TLS records on the long-lived origin-pull connection Cloudflare opened in chapter 16 — a different TLS session entirely from the browser’s, with different keys. The record travels back over the public internet to the edge PoP that made the request.',
      why: 'Two independent TLS sessions is the architecture of every reverse proxy CDN: end-to-end encryption in the sense that no hop is plaintext, but explicitly NOT end-to-end in the sense that Cloudflare sees your data.',
      component: 'Origin pull connection (Cloudflare ↔ origin, Full Strict mode)',
      layer: 'Internet · L5/L6',
      abstraction: 'Second TLS leg of a proxied request',
      protocol: 'TLS 1.3 (RFC 8446)',
      misconception: '"Cloudflare Flexible mode is still HTTPS." Flexible encrypts only browser→edge and speaks plaintext HTTP to your origin. Anyone on the origin path reads everything. Full (Strict) with a validated origin certificate is the only honest setting.',
      analogy: 'A translator relaying a private conversation: both halves are behind closed doors, but the translator heard every word.',
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
      what: 'The edge receives the 200, checks its cache rules, and declines to store it: the origin sent Cache-Control: private, no-store, and /products is not in a cache-everything page rule. It labels the response cf-cache-status: DYNAMIC (fetched from origin, not cacheable), attaches a cf-ray id that ties this request to a specific PoP and datacenter (AMS = Amsterdam) for support tickets, and prepares to relay it to the browser.',
      why: 'The cf-cache-status header is the single most useful debugging field in a CDN: HIT, MISS, EXPIRED, BYPASS, DYNAMIC each tell a completely different story about why your origin is or is not being hammered.',
      component: 'Cloudflare edge cache + response pipeline',
      layer: 'Edge · L7',
      abstraction: 'Cache admission decision at the boundary',
      protocol: 'HTTP caching (RFC 9111)',
      misconception: '"Cloudflare caches my API automatically." By default it caches only static extensions. API JSON is never cached unless you write a cache rule AND send cache-friendly headers — DYNAMIC means "I did not even try".',
      analogy: 'A photocopier that only duplicates documents stamped "public"; everything marked private goes straight to the recipient and nothing stays behind.',
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
      what: 'The edge re-encrypts the response under the keys negotiated with the BROWSER back in chapter 13, frames it as an HTTP/2 HEADERS frame (HPACK-compressed) followed by DATA frames on stream 1, and writes it to the client connection. Different keys, different sequence numbers, different TCP connection than the origin leg — the edge is the seam.',
      why: 'This is the moment the response stops being "server infrastructure" and becomes "the internet": from here it travels back across the same fabric it came, in reverse.',
      component: 'Cloudflare edge proxy (HTTP/2 client connection)',
      layer: 'Edge · L5-L7',
      abstraction: 'Terminating proxy: two sessions, one logical request',
      protocol: 'HTTP/2 (RFC 9113) over TLS 1.3',
      misconception: '"The response follows the same path back." Internet routing is asymmetric by default — the return path is chosen independently by BGP and often traverses different networks entirely.',
      analogy: 'A reply letter that leaves the same post office but may cross a different set of countries on its way home.',
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
      what: 'Each router does the same three things it did on the way out: longest-prefix match against the FIB for 203.0.113.0/24, decrement TTL, recompute the IPv4 header checksum, and forward out the chosen interface. The TTL counter is our odometer — it started at 64 at the edge and reads 58 here, so six routers have handled it. Every one of these lookups happens in hardware TCAM at line rate.',
      why: 'The return trip is where you feel physics: roughly 5 microseconds per kilometre of fibre, and no amount of engineering beats the speed of light in glass.',
      component: 'Tier-1 backbone routers (BGP FIB, hardware forwarding)',
      layer: 'Internet · OSI L3',
      abstraction: 'Hop-by-hop destination-based forwarding',
      protocol: 'IPv4 (RFC 791) + BGP-4 (RFC 4271)',
      misconception: '"Fewer hops means lower latency." Distance dominates: a 4-hop path across an ocean beats an 11-hop path across a metro area every time. Hops are not kilometres.',
      analogy: 'A parcel moving between regional sorting hubs — each hub only needs to know the next hub, never the whole route.',
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
      what: 'The ISP’s border router accepts the traffic (it advertises 203.0.113.0/24 to the world via BGP) and forwards it through the core to the access aggregation layer — MPLS-labelled in most carriers — and finally to the CMTS or OLT headend serving this neighbourhood. This is the last shared segment before the last mile.',
      why: 'The headend is the real bottleneck of consumer internet: hundreds of subscribers share one downstream channel group, which is why speeds sag at 8 p.m. and not at 4 a.m.',
      component: 'ISP core + CMTS/OLT headend',
      layer: 'ISP · L2/L3 aggregation',
      abstraction: 'Shared access medium with scheduled downstream',
      protocol: 'MPLS + DOCSIS 3.1 / GPON',
      misconception: '"My 1 Gbps plan is dedicated bandwidth." It is a contended shared segment with an oversubscription ratio the ISP never publishes — usually somewhere between 20:1 and 50:1.',
      analogy: 'A motorway that narrows to two lanes for the final exit everyone in the suburb uses.',
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
      what: 'The headend schedules the packet into a downstream OFDM channel; the modem demodulates the RF signal back into bits, reassembles the DOCSIS frame, extracts the Ethernet frame inside it, and hands it to the router’s WAN port over the coax-to-Ethernet boundary. Physics becomes packets again.',
      why: 'This modulation/demodulation boundary is where the digital world meets analogue reality — and where a corroded connector or a noisy neighbour shows up as retransmissions rather than errors.',
      component: 'Cable modem (DOCSIS 3.1 PHY/MAC)',
      layer: 'Home · OSI L1/L2',
      abstraction: 'RF spectrum → Ethernet frames',
      protocol: 'DOCSIS 3.1 (OFDM downstream)',
      misconception: '"The modem is a router." A pure modem is a media converter with no IP intelligence at all; the combo boxes ISPs ship glue a modem, router, switch, and AP into one plastic shell, which is why one reboot fixes four different problems.',
      analogy: 'A translator converting radio waves into written words, sentence by sentence, with no opinion about their content.',
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
      what: 'The router looks up the flow in its conntrack table using the reply tuple (104.18.32.7:443 → 203.0.113.77:38112), finds the entry created on the way out, and rewrites the destination back to 192.168.1.23:51324. Same table, same mechanism as the Docker DNAT from chapter 17 — Linux uses literally the same nf_conntrack code on your home router.',
      why: 'This is why IPv4 survived: one public address multiplexes an entire household because the port number becomes part of the identity.',
      component: 'Home router NAT (netfilter MASQUERADE, reply direction)',
      layer: 'Home · L3/L4',
      abstraction: 'Port-multiplexed address translation',
      protocol: 'NAPT (RFC 3022 / RFC 6888)',
      misconception: '"The router magically knows which device wanted this." Nothing magic: a table row, created by the outbound packet, keyed on the 4-tuple, with a timer. If the row expires — default 5 days for ESTABLISHED, but 5 MINUTES on cheap routers — the connection dies silently. That is what TCP keepalives are actually for.',
      analogy: 'A hotel switchboard with a notepad: "call from room 23 to 555-0100 went out on line 4" — when line 4 rings back, room 23 gets it.',
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
      what: 'The router consults its ARP cache for 192.168.1.23, writes 3c:07:54:6a:2b:91 as the destination MAC, and puts the frame on the LAN. The switch reads that MAC, finds it in the CAM table pointing at port 4, and forwards it there and nowhere else — the other ports never see a bit of it. Store-and-forward, roughly a microsecond.',
      why: 'CAM-based unicast forwarding is why switches replaced hubs: your neighbour’s laptop cannot even passively see the frames, and every port gets full bandwidth simultaneously.',
      component: 'Ethernet switch (CAM/MAC address table)',
      layer: 'Home LAN · OSI L2',
      abstraction: 'Learned MAC → port mapping',
      protocol: 'IEEE 802.3 Ethernet',
      misconception: '"A switch is a fast hub." A hub repeats every bit to every port (one collision domain); a switch learns addresses and forwards selectively. It is a completely different device that happens to have the same shape.',
      analogy: 'A mail sorter who has memorised every resident’s pigeonhole — no announcements to the whole building.',
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
      what: 'The PHY recovers bits from the electrical signal and hands a frame to the MAC block. The MAC verifies the 32-bit FCS (a corrupted frame is dropped here and counted in rx_crc_errors, invisible to software), then checks the destination MAC against its filter set: our unicast address, broadcast, and any subscribed multicast groups. Match — this frame is ours. Then RSS hashes the 4-tuple to pick which of the 8 receive queues it lands in.',
      why: 'Filtering in hardware means the CPU is never interrupted for the neighbours’ traffic. Without it every host on a segment would burn cycles discarding frames it does not want.',
      component: 'NIC MAC + RSS (e.g. Intel I225-V)',
      layer: 'Hardware · OSI L1/L2',
      abstraction: 'Address filtering and queue steering in silicon',
      protocol: 'IEEE 802.3',
      misconception: '"Promiscuous mode is how tcpdump works." tcpdump normally does NOT need it — you already receive your own traffic. Promiscuous mode only matters for capturing OTHER hosts’ frames, which on a switched LAN you will not see anyway.',
      analogy: 'A doorman reading name tags at the gate and only letting through the guests on tonight’s list — the party never hears about the rest.',
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
      what: 'The NIC pops the next free descriptor from the RX ring — a circular array of records the driver pre-filled with the physical addresses of empty page buffers — and DMAs the frame bytes straight into that memory over PCIe. No CPU instruction moves a single byte. The NIC then writes back the descriptor with the length, the RSS hash, checksum-verified flags, and the DD (descriptor done) bit set, and advances the head pointer.',
      why: 'Direct Memory Access is what makes 10Gbps possible on a general-purpose CPU: the processor is only told that data arrived, never asked to copy it off the card.',
      component: 'DMA engine + RX descriptor ring (driver ring buffer)',
      layer: 'Hardware ↔ kernel memory',
      abstraction: 'Device-initiated memory writes with a producer/consumer ring',
      protocol: 'PCIe memory writes',
      misconception: '"The kernel copies the packet from the card." It has not touched it at all yet — and with DDIO on server CPUs, the DMA may land directly in L3 cache so the first CPU read is already warm.',
      analogy: 'A courier with a key to your mailbox: they put the parcel inside themselves and only then press the doorbell.',
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
      what: 'With data in memory, the NIC signals the CPU. On modern hardware that is MSI-X: a PCIe memory write to a magic address the interrupt controller watches, carrying a vector number (132 for rx-0). The local APIC on the target core raises the interrupt; the CPU finishes its current instruction, pushes RIP/RFLAGS, consults the IDT, and jumps to the registered handler. Whatever was running — your JavaScript, a video decode — is suspended mid-flight.',
      why: 'Interrupts are how hardware gets attention without the CPU having to ask. The alternative, polling every device constantly, wastes the entire machine.',
      component: 'MSI-X → local APIC → IDT vector (arch/x86/kernel/irq.c)',
      layer: 'Hardware ↔ kernel · interrupt delivery',
      abstraction: 'Asynchronous hardware notification',
      protocol: 'PCIe MSI-X',
      misconception: '"Interrupts are cheap." Each one costs a pipeline flush, a possible cache-cold handler, and often an IPI. At 1 million packets per second, one interrupt per packet would consume a core doing nothing but bookkeeping — which is precisely why NAPI exists (two steps from now).',
      analogy: 'A phone ringing during dinner: you must put down your fork mid-bite. Fine occasionally; unbearable at three rings a second.',
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
      what: 'The driver’s hard IRQ handler runs in interrupt context with interrupts disabled on this core. It does three things and stops: acknowledge the interrupt so the NIC stops asserting it, MASK further RX interrupts on this queue, and call napi_schedule(). Total: a couple of microseconds. It does not parse the packet. It does not touch TCP. It cannot sleep, cannot take a mutex, cannot allocate with GFP_KERNEL.',
      why: 'Every microsecond in interrupt context is a microsecond where this core cannot service ANY other interrupt — including the timer. Top halves are deliberately anaemic so the system stays responsive.',
      component: 'Driver hard IRQ handler (igc_msix_ring in drivers/net/ethernet/intel/igc)',
      layer: 'Kernel · interrupt context',
      abstraction: 'Split interrupt handling: top half vs bottom half',
      protocol: '—',
      misconception: '"The interrupt handler processes the packet." It defers everything. Splitting into a fast acknowledgment and deferrable work is one of the oldest and most important patterns in OS design.',
      analogy: 'Answering the phone with "got it, call you right back" and hanging up — you took the message without holding the line.',
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
      explain: 'Interrupt livelock is real: at high rates the CPU spends all its time entering and leaving interrupt context and never reaches the code that actually drains the queue, so throughput collapses toward zero. NAPI is a hybrid — interrupt-driven when idle (low latency), poll-driven when busy (high throughput) — and it switches automatically based on whether the poll used its full budget.'
    },
    explain: {
      what: 'napi_schedule adds this queue’s NAPI context to the per-CPU poll_list and calls raise_softirq_irqoff(NET_RX_SOFTIRQ), which simply sets a bit in the per-CPU pending mask. That is all — a list insert and a bit set. The actual work happens after interrupt context unwinds, when the kernel checks that mask.',
      why: 'This is the pivot from "interrupt me per packet" to "I will come collect them in a batch" — the design that let Linux keep up as NICs went from 100Mbps to 100Gbps.',
      component: 'NAPI (net/core/dev.c, napi_schedule_prep + __napi_schedule)',
      layer: 'Kernel · softirq scheduling',
      abstraction: 'Interrupt-to-poll transition under load',
      protocol: '—',
      misconception: '"NAPI polls all the time, burning CPU." It polls only while packets keep arriving. If a poll returns less than its budget, NAPI re-enables interrupts and goes back to sleep — zero cost when idle.',
      analogy: 'A restaurant that seats you immediately when empty, but switches to a "we will call the whole waiting list in batches" system at peak — the same staff serve far more people.',
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
      what: 'On the way out of the interrupt (or at the next local_bh_enable), the kernel sees NET_RX_SOFTIRQ pending and runs net_rx_action. This executes with interrupts ENABLED but still in atomic context — no sleeping — so it can be preempted by hardware interrupts but not by ordinary processes. If softirqs keep firing beyond the budget, the work is handed to the per-CPU ksoftirqd/N kernel thread, which competes fairly with userspace.',
      why: 'The two-level design gives the network stack a place to do real work quickly without blocking hardware, while ksoftirqd is the pressure valve that stops a packet flood from starving your applications entirely.',
      component: 'net_rx_action / __do_softirq (kernel/softirq.c)',
      layer: 'Kernel · softirq (bottom half) context',
      abstraction: 'Deferrable atomic work with a fairness escape hatch',
      protocol: '—',
      misconception: '"Softirqs are threads." They usually run inline on whichever CPU took the interrupt; ksoftirqd is only the overflow path. That is why %si in mpstat can be pegged while ksoftirqd shows 0% CPU.',
      analogy: 'The waiter who took your order finishing the paperwork at the counter right after — and only calling in the back-office clerk (ksoftirqd) when the queue gets absurd.',
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
      what: 'net_rx_action walks the poll_list and calls each device’s poll() with a budget (64 packets per device, 300 total by default). The driver reads descriptors with DD set, wraps each buffer in an sk_buff, and refills the ring with fresh pages. Then GRO — Generic Receive Offload — inspects consecutive segments of the same flow and merges them: our ten 1448-byte TLS-carrying segments coalesce into one 14,480-byte super-skb before ever reaching IP.',
      why: 'GRO means the expensive per-packet path (IP, netfilter, TCP) runs once instead of ten times. It is the single largest software throughput win in the receive path.',
      component: 'napi->poll() + napi_gro_receive (net/core/gro.c)',
      layer: 'Kernel · driver + GRO',
      abstraction: 'Batched harvesting with flow-aware coalescing',
      protocol: '—',
      misconception: '"GRO changes what the application receives." TCP is a byte stream — the app never sees packet boundaries anyway. GRO is transparent, except to tcpdump, where it makes you see impossible 14KB "packets" on a 1500-byte MTU link.',
      analogy: 'A postal worker who staples the ten pages of one letter together before delivering, so you read it once instead of ten separate deliveries.',
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
      what: 'The skb leaves the driver via netif_receive_skb, taps registered by AF_PACKET (this is where tcpdump gets its copy), then dispatches on EtherType 0x0800 to ip_rcv. IP sanity-checks the header: version 4, IHL at least 5, total length not exceeding the skb, and — if the NIC did not already verify it — the header checksum. Fragments would be reassembled here; ours are not fragmented. The destination is a local address, so the packet is destined for this host.',
      why: 'The IP layer is deliberately dumb: no state, no retransmission, no ordering. Its only job is "is this mine, and if not, where next" — everything reliable is built above it.',
      component: 'ip_rcv / ip_rcv_finish (net/ipv4/ip_input.c)',
      layer: 'Kernel · OSI L3',
      abstraction: 'Best-effort datagram delivery',
      protocol: 'IPv4 (RFC 791)',
      misconception: '"IP guarantees the packet arrives intact." IPv4’s checksum covers the HEADER ONLY. Payload integrity is TCP’s (weak, 16-bit) checksum and, ultimately, TLS’s AEAD tag — which is the only cryptographically strong one in the stack.',
      analogy: 'A sorting facility that reads only the address label and never opens the box.',
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
      what: 'ip_rcv hands the skb to NF_INET_PRE_ROUTING, where raw, mangle, and nat tables get their say. Then ip_route_input_noref makes the routing decision: destination 192.168.1.23 is local, so the verdict is "deliver locally" rather than "forward". That routes the packet through NF_INET_LOCAL_IN, where the filter table’s INPUT chain runs your firewall rules — on a laptop, typically an ESTABLISHED,RELATED accept rule near the top.',
      why: 'The hook order is the whole mental model of Linux firewalling: PREROUTING sees everything before the routing decision, INPUT only sees traffic for this host, FORWARD only traffic passing through. Rules put in the wrong chain silently never match.',
      component: 'Netfilter hooks (net/netfilter/core.c, nf_hook_slow)',
      layer: 'Kernel · L3 packet filtering',
      abstraction: 'Hook points around the routing decision',
      protocol: 'Netfilter / nftables',
      misconception: '"iptables and nftables are different firewalls." Since kernel 4.18 iptables-nft is a compatibility front end that programs the SAME nf_tables engine. Mixing legacy and nft tools on one host is how rules mysteriously vanish.',
      analogy: 'Airport security zones: everyone passes the first checkpoint, then arriving passengers and transfer passengers are screened at different desks with different rules.',
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
      what: 'The conntrack hook computes the tuple (104.18.32.7:443 → 192.168.1.23:51324, proto TCP), hashes it, and finds the entry created when our SYN went out in chapter 8. State: ESTABLISHED, direction: REPLY. It validates the sequence numbers fall inside the expected window, refreshes the 5-day timer, and stamps ctinfo on the skb so the filter chain can match ct state established in a single comparison.',
      why: 'Stateful firewalling means you write "allow what I started" once instead of enumerating every possible return path. It is also what makes NAT possible at all.',
      component: 'nf_conntrack_in (net/netfilter/nf_conntrack_core.c)',
      layer: 'Kernel · L3/L4 flow state',
      abstraction: 'Connection state machine independent of the protocol stack',
      protocol: 'Netfilter connection tracking',
      misconception: '"conntrack is part of TCP." It is a completely separate state machine that shadows TCP by observing flags — which is why it also tracks UDP and ICMP "connections" that have no such concept, using timeouts instead.',
      analogy: 'A bouncer with a guest list built from who walked out for a smoke — re-entry is allowed because your exit was recorded, not because anyone checked your ID again.',
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
      what: 'TCP hashes the 4-tuple (src 104.18.32.7:443, dst 192.168.1.23:51324) and looks it up in the ehash — the established-connections hash table. Hit: this is the socket the network service opened in chapter 7. TCP then validates the segment: is the checksum right, is the sequence number inside the receive window, does the ACK acknowledge data we actually sent. Only then is the payload accepted; the congestion window and RTT estimators update from the ACK.',
      why: 'Demultiplexing by 4-tuple — not by port alone — is what allows thousands of simultaneous connections to port 443 from different peers, and two browser tabs to the same server, without confusion.',
      component: 'tcp_v4_rcv / __inet_lookup_established (net/ipv4/tcp_ipv4.c)',
      layer: 'Kernel · OSI L4',
      abstraction: 'Connection demultiplexing and byte-stream reassembly',
      protocol: 'TCP (RFC 9293)',
      misconception: '"A port identifies a connection." A CONNECTION is identified by all four values plus protocol. That is why one listening port serves a million clients, and why a client can open many connections from different ephemeral ports to the same server.',
      analogy: 'A large office where mail is sorted not by floor number alone but by (sender, sender-suite, floor, room) — otherwise every letter to floor 443 would end up in one pile.',
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
      what: 'The 14,208 bytes of TLS records are appended to sk_receive_queue and rcv_nxt advances. The kernel updates the advertised receive window from the remaining buffer space (autotuned between tcp_rmem min and max) and arms the delayed-ACK timer — up to 40ms — hoping to piggyback the ACK on outgoing data rather than sending a bare one. The data is now the application’s to collect, but it still lives in kernel memory.',
      why: 'The receive buffer is the flow-control valve: if the app stops reading, the buffer fills, the advertised window shrinks to zero, and the sender stops. Backpressure, implemented in hardware-adjacent software.',
      component: 'sk_receive_queue + tcp_rcv_space_adjust (net/ipv4/tcp_input.c)',
      layer: 'Kernel · L4 buffering',
      abstraction: 'Flow control via advertised window',
      protocol: 'TCP receive window (RFC 9293 §3.8)',
      misconception: '"Data has arrived, so the app has it." Not remotely — it sits in kernel memory until the process issues a read. ss showing a large Recv-Q is the signature of an application too slow to drain its own sockets.',
      analogy: 'Parcels stacked in the building’s lobby: delivered to the address, but not yet carried up to your apartment.',
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
      what: 'Queuing data calls sk->sk_data_ready → sock_def_readable, which walks the socket’s wait queue. Our socket is registered with an epoll instance, so the waiter is ep_poll_callback: it moves the epitem onto the ready list and wakes any thread blocked in epoll_wait. The scheduler marks that thread TASK_RUNNING, places it on a CPU runqueue, and — since it just woke from I/O and has slept recently — CFS/EEVDF gives it favourable placement, often preempting the current task immediately.',
      why: 'This callback chain is why epoll scales: waking is O(1) in the number of registered fds because the readiness list is maintained incrementally, not rebuilt per call like select and poll.',
      component: 'ep_poll_callback (fs/eventpoll.c) + scheduler wakeup (kernel/sched/core.c)',
      layer: 'Kernel · I/O readiness + scheduling',
      abstraction: 'Event-driven wakeup instead of polling',
      protocol: '—',
      misconception: '"epoll tells you data is ready." It tells you the fd is READY TO TRY. In edge-triggered mode you must read until EAGAIN, or the remaining bytes sit there and you never get another notification — the classic ET bug.',
      analogy: 'The concierge does not shout down a list of every apartment; they ring only the one bell that has a parcel waiting.',
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
      what: 'epoll_wait returns with fd 42 readable; the network service calls recvmsg(). The kernel walks sk_receive_queue and copies bytes into the user-space buffer with copy_to_user — the one genuine memcpy across the privilege boundary — then frees the skbs and shrinks the receive queue. recvmsg returns 14208, the syscall handler executes sysretq, and the CPU drops from ring 0 back to ring 3. We are in userland again, for the first time since the request left.',
      why: 'This copy is the price of the process isolation model: the kernel will not hand a raw pointer to its own memory to a user process. Zero-copy schemes (io_uring registered buffers, AF_XDP, sendfile) exist precisely to avoid it at high rates.',
      component: 'tcp_recvmsg → skb_copy_datagram_iter → copy_to_user',
      layer: 'Kernel → userspace boundary',
      abstraction: 'Protected transfer across the privilege ring',
      protocol: 'POSIX socket API (recvmsg(2))',
      misconception: '"Zero-copy networking eliminates all copies." DMA already avoided the device copy; what remains is kernel→user. io_uring with registered buffers removes it for real, at the cost of a much more complex ownership model.',
      analogy: 'A prison visitation window: nothing passes hand to hand — items are transferred through a controlled slot, inspected, and re-handed on the other side.',
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
      what: 'The network service feeds the bytes to BoringSSL. Each record is decrypted with AES-128-GCM using the server_application_traffic_secret derived in the handshake, and the 16-byte authentication tag is verified BEFORE any plaintext is released. A single flipped bit anywhere in the record makes the tag fail and the connection is torn down — AEAD refuses to guess.',
      why: 'Authenticated encryption is what makes TLS 1.3 safe by construction: there is no mode where you can act on unauthenticated data, which eliminated an entire decade of padding-oracle attacks.',
      component: 'BoringSSL record layer (Chrome network service)',
      layer: 'Userspace · OSI L6',
      abstraction: 'Authenticated encryption over a byte stream',
      protocol: 'TLS 1.3 (RFC 8446)',
      misconception: '"HTTPS just encrypts." It also authenticates and provides integrity — and it is the integrity guarantee that stops your ISP injecting ads into pages, not the confidentiality one.',
      analogy: 'A tamper-evident sealed envelope: you check the seal before reading, and a broken seal means you burn the letter unread.',
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
      what: 'The plaintext is a sequence of HTTP/2 frames, each with a 9-byte header (length, type, flags, stream id). The HEADERS frame is HPACK-decoded against the connection’s dynamic table — many header names and values are single-byte references to entries the server established earlier. DATA frames carry the gzipped body; the network service inflates it back to 14,208 bytes of JSON text, and END_STREAM closes stream 1. The TCP connection stays open.',
      why: 'Framing plus stream ids is what let HTTP/2 kill head-of-line blocking at the application layer: this response arriving does not block any other in-flight request on the same connection.',
      component: 'HTTP/2 session + HPACK decoder (net/http2 in Chromium)',
      layer: 'Userspace · OSI L7',
      abstraction: 'Multiplexed streams over one connection',
      protocol: 'HTTP/2 (RFC 9113) + HPACK (RFC 7541)',
      misconception: '"HTTP/2 eliminates head-of-line blocking." Only at the HTTP layer. One lost TCP segment still stalls EVERY stream on that connection, because TCP must deliver in order — the exact problem QUIC/HTTP3 was invented to solve.',
      analogy: 'Several conversations interleaved on one phone line, each sentence tagged with which conversation it belongs to.',
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
      what: 'The network service (PID 4903) and the renderer (PID 4821) are separate OS processes with separate address spaces — the renderer has no socket, no TLS keys, and no ability to make a network connection itself. The response crosses via Mojo, Chromium’s IPC layer: control messages over a message pipe, body bytes over a shared-memory data pipe so the payload is not copied twice. In the renderer, Blink materialises a Response object with a ReadableStream body.',
      why: 'Site isolation is why: a compromised renderer running attacker JavaScript must not be able to open arbitrary sockets or read another origin’s cookies. Network access is a privilege it simply does not hold.',
      component: 'Mojo IPC + URLLoader (Chromium services/network)',
      layer: 'Userspace · inter-process boundary',
      abstraction: 'Capability-restricted multi-process browser architecture',
      protocol: 'Mojo message pipes + shared-memory data pipes',
      misconception: '"fetch() opens a socket." Your JavaScript never touches a socket. It sends a structured request to a privileged process that does the networking on your behalf and returns a sanitised result — which is precisely why CORS can be enforced at all.',
      analogy: 'Ordering room service instead of walking into the kitchen: you state what you want through a controlled channel, and staff with the right access bring it.',
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
      what: 'No IPC and no process boundary here: libuv’s epoll loop reports the socket readable, uv__read pulls the bytes, and undici — the HTTP client that backs global fetch since Node 18 — decrypts, parses, and constructs a WHATWG-compatible Response object whose body is a web ReadableStream. Same standard API surface as the browser, entirely different plumbing underneath.',
      why: 'Node deliberately implemented the fetch STANDARD rather than a lookalike, so isomorphic code behaves identically — while keeping the freedom to use a completely different transport implementation.',
      component: 'libuv + undici (lib/internal/deps/undici)',
      layer: 'Node userspace · L7 client',
      abstraction: 'Standards-compliant fetch over a native event loop',
      protocol: 'HTTP/1.1 or HTTP/2 over TLS (undici)',
      misconception: '"Node fetch is just node-fetch built in." It is undici — a from-scratch client with its own connection pooling, pipelining, and dispatcher API. Behaviour around keep-alive, proxies, and timeouts differs meaningfully from the old library.',
      analogy: 'The same steering wheel and pedals in a different car: the driving interface is standardised even though the engine is not.',
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
      what: 'The Response object exists, so the Promise returned by fetch() six chapters ago is resolved. Resolution does NOT run your code — it enqueues the reaction job on the microtask queue. The engine will drain that queue at the next checkpoint: after the current synchronous task finishes, before rendering, and before any timer or I/O callback in the macrotask queue.',
      why: 'The two-queue design is what makes async ordering predictable: microtasks (promises, queueMicrotask, MutationObserver) always run to completion before the next macrotask (setTimeout, I/O, events).',
      component: 'V8 microtask queue + HTML event loop',
      layer: 'Userspace · JS runtime',
      abstraction: 'Job queues with defined checkpoints',
      protocol: 'ECMAScript job semantics + HTML event loop spec',
      misconception: '"setTimeout(fn, 0) runs before a resolved promise." Never. The entire microtask queue drains before the next macrotask — and a microtask that queues more microtasks can starve the loop entirely, freezing the page.',
      analogy: 'A manager who clears every sticky note on the monitor (microtasks) before opening the next item in the inbox (macrotasks).',
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
      what: 'The event loop reaches its microtask checkpoint and runs the reaction job. V8 restores the suspended async function’s state — locals, closure environment, and the resume point recorded when it hit await — and execution continues on the line after the await, with response bound to the Response object. Everything about the last 250 milliseconds is now compressed into one ordinary local variable.',
      why: 'async/await is a compiler transform, not a runtime pause: the function was turned into a state machine whose frame lived on the heap while the network did its work. That is why no thread was ever blocked.',
      component: 'V8 async function resumption (generator-based state machine)',
      layer: 'Userspace · JS execution',
      abstraction: 'Coroutines over a single-threaded event loop',
      protocol: '—',
      misconception: '"await pauses the thread." It returns from the function entirely, registering a continuation. The thread went off and did other work — which is why code after an await sees a world that may have changed underneath it.',
      analogy: 'A bookmark in a novel: the book was closed and shelved, the reader lived a whole day, and now they open to the exact page and sentence.',
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
      what: 'A second await, because the body is a stream and may not have fully arrived. json() drains the ReadableStream, decodes the bytes as UTF-8 (this is why charset in Content-Type matters), and calls the engine’s JSON parser — a hand-written C++ scanner in V8, not JavaScript. It emits twenty objects with a shared hidden class, so property access on them will be monomorphic and inline-cacheable.',
      why: 'The body is a separate await precisely because headers arrive before the body does: you can inspect status and headers and abort a 2GB download without ever reading it.',
      component: 'Body mixin + V8 JSON parser (src/json/json-parser.cc)',
      layer: 'Userspace · deserialization',
      abstraction: 'Byte stream → UTF-8 text → JS object graph',
      protocol: 'JSON (RFC 8259), UTF-8 (RFC 3629)',
      misconception: '"response.ok is true whenever fetch resolves." fetch only rejects on NETWORK failure. A 500 resolves happily with ok:false — the single most common fetch bug in production code.',
      analogy: 'Receiving a shipping manifest (headers) at the door, then unpacking and inventorying the crate (body) as a separate job.',
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
      what: 'The component calls setState with the twenty products. React schedules a re-render, diffs the virtual DOM, and commits the minimal set of real DOM mutations. Those mutations dirty the layout, so the browser recalculates styles, runs layout (geometry), paints into layers, and the compositor hands them to the GPU. At the next vsync — within 16.7ms on a 60Hz display — the user finally SEES twenty products.',
      why: 'This is the last hop of the entire journey, and the only one the user perceives. Everything else in twenty-four chapters existed to put these pixels on this screen.',
      component: 'React reconciler + Blink style/layout/paint/composite',
      layer: 'Userspace · rendering pipeline',
      abstraction: 'Declarative state → pixels',
      protocol: 'CSSOM + DOM specifications',
      misconception: '"The DOM update paints immediately." Mutations are batched; the pipeline runs at the next frame. Reading offsetHeight right after a write forces a synchronous layout ("layout thrashing") and is how smooth lists become janky ones.',
      analogy: 'Editing a document versus the printer producing a page — the edits accumulate, and the press runs on its own schedule.',
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
      what: 'Recap. One await fetch() traversed roughly forty distinct components: V8 compiled it, libuv or the network service dispatched it, the kernel crossed the ring boundary twice on this laptop alone (and twice more on every server involved), a NIC serialized it onto copper, a home router NAT-ed it, an ISP hauled it across a continent, DNS resolved it, TLS secured it, Cloudflare inspected and routed it, nginx proxied it, iptables DNAT-ed it into a container, NestJS routed and validated it, Prisma compiled SQL, PostgreSQL planned, executed, and MVCC-checked it, and every one of those steps ran again in reverse. Budget: ~30ms DNS (cold), ~45ms TCP+TLS, ~120ms network round trips, ~4ms application, ~0.4ms database, ~10ms render.',
      why: 'Notice the shape of that budget. The database — the part engineers optimize first — was the smallest slice by two orders of magnitude. The network and the handshakes dominate, which is why connection reuse, edge caching, and fewer round trips beat micro-optimizations every time.',
      component: 'The entire stack, top to bottom and back',
      layer: 'All of them',
      abstraction: 'Layered protocols: every layer a promise the one below keeps',
      protocol: 'HTTP · TLS · TCP · IP · Ethernet · DNS · BGP · SQL',
      misconception: '"The connection closes now." It does not. The TCP connection, the TLS session, the HTTP/2 stream multiplexer, the origin-pull tunnel, the pooled Postgres connection — all stay open and warm. The NEXT fetch skips chapters 5 through 13 entirely and returns in about 40 milliseconds. That is the whole reason keep-alive exists.',
      analogy: 'You have just watched one letter travel from a thought in someone’s head to a printed page on the other side of the world and back — and the postal routes stay open for the next one.',
      command: 'curl -w "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\\n" -o /dev/null -s https://api.shop.dev/products?limit=20',
      production: 'The highest-leverage production wins mirror this chapter list exactly: keep connections alive, cache at the edge, put the database in the same AZ, index for your ORDER BY, and stop making round trips you do not need. Everything else is rounding error.'
    },
    code: [
      { title: 'The whole journey, one line', lang: 'js', code: "const res = await fetch('https://api.shop.dev/products?limit=20');\nconst products = await res.json();\n// ~40 components · 2 user/kernel crossings here · 4+ on the servers\n// 3 TLS sessions · 1 SQL query · 20 rows · 14,208 bytes of JSON\n// and the sockets are still open, waiting for you to do it again." },
      { title: 'What the second call costs', lang: 'bash', code: '# cold\ndns:0.031 connect:0.048 tls:0.092 ttfb:0.241 total:0.253\n\n# warm — same connection, DNS cached, TLS session reused\ndns:0.000 connect:0.000 tls:0.000 ttfb:0.038 total:0.041' }
    ]
  }

];
