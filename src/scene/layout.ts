import type { NodeId, StepMode, ZoneId } from '@/data/types';
import { connectorPath, packNodes, zoneSize, type Rect } from './geometry';

export interface ZoneLayout extends Rect {
  id: ZoneId;
  label: string;
  sub: string;
  mode: StepMode;
}

export interface NodeLayout extends Rect {
  id: NodeId;
  zone: ZoneId;
  label: string;
  sub?: string;
}

export type EdgeId = string;

export interface EdgeLayout {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  d: string;
  kind: 'flow' | 'aux';
}

/**
 * Zone definitions in journey order. Each zone's size is derived from how many nodes it
 * holds and how many columns they pack into, so the grid is exact by construction —
 * a node can never escape its frame or collide with a sibling.
 */
interface ZoneSpec {
  id: ZoneId;
  label: string;
  sub: string;
  mode: StepMode;
  cols: number;
  x: number;
  y: number;
  nodes: [NodeId, string, string?][];
}

const ZONE_SPECS: ZoneSpec[] = [
  {
    id: 'z-browser',
    label: 'Browser',
    sub: 'user space · your code',
    mode: 'user',
    cols: 4,
    x: 60,
    y: 60,
    nodes: [
      ['appcode', 'App Code', 'fetch()'],
      ['parser', 'Parser', 'scanner'],
      ['ast', 'AST', 'syntax tree'],
      ['ignition', 'Ignition', 'interpreter'],
      ['bytecode', 'Bytecode', 'register VM'],
      ['turbofan', 'TurboFan', 'optimizer'],
      ['machinecode', 'Machine Code', 'x86-64'],
      ['eventloop', 'Event Loop', 'microtasks'],
      ['webapi', 'Web API', 'fetch()'],
      ['netservice', 'Network Service', 'PID 4903'],
      ['httpcache', 'HTTP Cache', 'MISS'],
    ],
  },
  {
    id: 'z-node',
    label: 'Node.js',
    sub: 'the other runtime',
    mode: 'user',
    cols: 4,
    x: 924,
    y: 60,
    nodes: [
      ['nodejs', 'Node.js', 'runtime'],
      ['libuv', 'libuv', 'event loop'],
      ['undici', 'undici', 'fetch impl'],
      ['socketpool', 'Socket Pool', 'keep-alive'],
    ],
  },
  {
    id: 'z-dns',
    label: 'DNS Hierarchy',
    sub: 'the detour every request takes first',
    mode: 'net',
    cols: 5,
    x: 1712,
    y: 60,
    nodes: [
      ['stubresolver', 'Stub Resolver', '/etc/resolv.conf'],
      ['recursive', 'Recursive', '1.1.1.1'],
      ['rootns', 'Root Server', 'a.root-servers.net'],
      ['tldns', 'TLD Server', '.dev'],
      ['authns', 'Authoritative', 'api.shop.dev'],
    ],
  },
  {
    id: 'z-kernel',
    label: 'Linux Kernel',
    sub: 'ring 0 · where the machine is really run',
    mode: 'kernel',
    cols: 7,
    x: 60,
    y: 432,
    nodes: [
      ['libc', 'glibc', 'syscall wrapper'],
      ['syscallgate', 'Syscall Gate', 'entry_SYSCALL_64'],
      // The CPU lives here rather than with the browser: the ring 3 → ring 0 flip is the
      // signature moment of the lesson and it should light the kernel frame.
      ['cpu', 'CPU', 'ring 3 → ring 0'],
      ['syscalltable', 'Syscall Table', 'sys_socket'],
      ['process', 'Process', 'task_struct'],
      ['thread', 'Thread', 'sched entity'],
      ['scheduler', 'Scheduler', 'CFS'],
      ['fdtable', 'FD Table', 'fd 42'],
      ['memmap', 'Memory Map', 'user ↔ kernel'],
      ['socketlayer', 'Socket Layer', 'sock_create'],
      ['socketobj', 'struct sock', 'the socket'],
      ['tcp', 'TCP', 'tcp_output.c'],
      ['udp', 'UDP', 'datagrams'],
      ['ip', 'IP', 'ip_output.c'],
      ['routing', 'Routing / FIB', 'longest prefix'],
      ['arp', 'ARP / neigh', 'who-has'],
      ['netns', 'Net Namespace', 'isolation'],
      ['netfilter', 'Netfilter', '5 hooks'],
      ['iptables', 'iptables', 'rule walk'],
      ['conntrack', 'conntrack', 'stateful'],
      ['qdisc', 'qdisc', 'fq_codel'],
      ['driver', 'NIC Driver', 'ndo_start_xmit'],
      ['ringbuffer', 'Ring Buffer', 'descriptors'],
      ['dma', 'DMA', 'no CPU copy'],
      ['irq', 'Hardware IRQ', 'top half'],
      ['softirq', 'SoftIRQ', 'NET_RX'],
      ['napi', 'NAPI', 'poll, not IRQ'],
    ],
  },
  {
    id: 'z-hw',
    label: 'Hardware',
    sub: 'below software',
    mode: 'hw',
    cols: 5,
    x: 1492,
    y: 432,
    nodes: [
      ['nic', 'NIC', 'the card'],
      ['ethframe', 'Ethernet Frame', 'preamble · FCS'],
      ['wififrame', '802.11 Frame', '3 addresses'],
      ['phy', 'PHY', 'encoding'],
      ['signal', 'Signal', 'copper · radio'],
    ],
  },
  {
    id: 'z-lan',
    label: 'Your LAN',
    sub: 'switch · router · NAT',
    mode: 'net',
    cols: 4,
    x: 60,
    y: 916,
    nodes: [
      ['switch', 'Switch', 'CAM table'],
      ['homerouter', 'Home Router', '192.168.1.1'],
      ['nat', 'NAT / PAT', '→ 203.0.113.77'],
      ['modem', 'Modem / ONT', 'upstream'],
    ],
  },
  {
    id: 'z-isp',
    label: 'ISP',
    sub: 'access · core · peering',
    mode: 'net',
    cols: 4,
    x: 924,
    y: 916,
    nodes: [
      ['headend', 'Headend', 'CMTS / OLT'],
      ['ispcore', 'ISP Core', 'aggregation'],
      ['bgp', 'BGP', 'best path'],
      ['fiber', 'Fiber', '4.9 µs/km'],
    ],
  },
  {
    id: 'z-inet',
    label: 'Internet',
    sub: 'transit and peering',
    mode: 'net',
    cols: 3,
    x: 1788,
    y: 916,
    nodes: [
      ['tier1a', 'Tier 1 Transit', 'TTL 61'],
      ['ixp', 'IXP', 'peering fabric'],
      ['tier1b', 'Tier 1 Transit', 'TTL 60'],
    ],
  },
  {
    id: 'z-cf',
    label: 'Cloudflare Edge',
    sub: 'anycast · TLS terminates here',
    mode: 'remote',
    cols: 3,
    x: 60,
    y: 1100,
    nodes: [
      ['anycast', 'Anycast Edge', '104.18.32.7'],
      ['ddos', 'DDoS Filter', 'L3/4 + L7'],
      ['waf', 'WAF', 'OWASP CRS'],
      ['cftls', 'TLS Termination', 'TLS 1.3'],
      ['cfcache', 'Edge Cache', 'DYNAMIC'],
      ['originpull', 'Origin Pull', 'CF-Connecting-IP'],
    ],
  },
  {
    id: 'z-origin',
    label: 'Origin Infrastructure',
    sub: 'load balancer · proxy · container network',
    mode: 'remote',
    cols: 3,
    x: 708,
    y: 1100,
    nodes: [
      ['lb', 'Load Balancer', 'L4 · least-conn'],
      ['proxy', 'Reverse Proxy', 'nginx / Caddy'],
      ['dnat', 'iptables DNAT', '→ 172.17.0.2'],
      ['bridge', 'docker0', 'bridge'],
      ['veth', 'veth pair', 'container link'],
      ['cnetns', 'Container netns', 'isolated stack'],
    ],
  },
  {
    id: 'z-app',
    label: 'Application',
    sub: 'NestJS · Prisma',
    mode: 'remote',
    cols: 3,
    x: 1356,
    y: 1100,
    nodes: [
      ['appserver', 'Node Server', 'PID 1'],
      ['middleware', 'Middleware', 'helmet · cors'],
      ['controller', 'Controller', 'GET /products'],
      ['service', 'Service', 'business logic'],
      ['prisma', 'Prisma', 'query engine'],
      ['pool', 'Connection Pool', 'checkout'],
    ],
  },
  {
    id: 'z-db',
    label: 'PostgreSQL',
    sub: 'planner · executor · storage',
    mode: 'remote',
    cols: 3,
    x: 2004,
    y: 1100,
    nodes: [
      ['postgres', 'PostgreSQL', 'backend PID 8842'],
      ['planner', 'Planner', 'cost-based'],
      ['executor', 'Executor', 'volcano model'],
      ['sharedbuf', 'shared_buffers', '8 KB pages'],
      ['wal', 'WAL', 'durability'],
      ['disk', 'Disk', 'NVMe'],
    ],
  },
];

export const ZONES: ZoneLayout[] = ZONE_SPECS.map((spec) => {
  const { w, h } = zoneSize(spec.nodes.length, spec.cols);
  return { id: spec.id, label: spec.label, sub: spec.sub, mode: spec.mode, x: spec.x, y: spec.y, w, h };
});

export const NODES: NodeLayout[] = ZONE_SPECS.flatMap((spec) => {
  const zone = ZONES.find((z) => z.id === spec.id)!;
  const rects = packNodes(zone, spec.nodes.length, spec.cols);
  return spec.nodes.map((node, i) => ({
    id: node[0],
    zone: spec.id,
    label: node[1],
    sub: node[2],
    ...rects[i],
  }));
});

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<
  NodeId,
  NodeLayout
>;

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<
  ZoneId,
  ZoneLayout
>;

export const WORLD = {
  w: Math.max(...ZONES.map((z) => z.x + z.w)) + 60,
  h: Math.max(...ZONES.map((z) => z.y + z.h)) + 60,
};

/**
 * Every packet transition the lesson actually performs, extracted from the authored
 * steps (`from → node` for all 194 main steps plus the chaos scenarios). Because these
 * are the real transitions, the packet always flies a meaningful line rather than being
 * routed around the graph by BFS.
 */
const TRANSITIONS: [NodeId, NodeId][] = (
  [
    'anycast,ddos', 'anycast,nat', 'anycast,tier1a', 'appcode,machinecode', 'appcode,netservice',
    'appcode,parser', 'appcode,pool', 'appcode,webapi', 'appserver,dnat', 'appserver,middleware',
    'appserver,proxy', 'appserver,socketobj', 'arp,qdisc', 'ast,ignition', 'bgp,fiber',
    'bridge,veth', 'bytecode,cpu', 'cfcache,anycast', 'cfcache,cftls', 'cftls,netservice',
    'cftls,originpull', 'cnetns,proxy', 'conntrack,routing', 'conntrack,tcp', 'controller,middleware',
    'controller,service', 'cpu,ignition', 'cpu,napi', 'cpu,socketlayer', 'cpu,syscallgate',
    'ddos,waf', 'disk,postgres', 'dma,irq', 'dma,nic', 'dnat,bridge', 'dnat,proxy',
    'driver,ringbuffer', 'ethframe,phy', 'eventloop,appcode', 'eventloop,netservice',
    'executor,postgres', 'executor,sharedbuf', 'fdtable,socketlayer', 'fdtable,socketobj',
    'fiber,tier1a', 'headend,ispcore', 'homerouter,arp', 'homerouter,nat', 'httpcache,netservice',
    'ignition,bytecode', 'ignition,turbofan', 'ip,netfilter', 'ip,tcp', 'iptables,conntrack',
    'irq,cpu', 'irq,tcp', 'ispcore,bgp', 'ispcore,modem', 'ixp,tier1b', 'lb,proxy',
    'libc,netservice', 'libc,syscallgate', 'libuv,undici', 'machinecode,appcode', 'memmap,disk',
    'middleware,appserver', 'middleware,controller', 'modem,headend', 'modem,nat', 'napi,softirq',
    'nat,irq', 'nat,modem', 'nat,switch', 'netfilter,conntrack', 'netfilter,iptables',
    'netfilter,netservice', 'netfilter,tcp', 'netservice,appcode', 'netservice,cftls',
    'netservice,httpcache', 'netservice,ispcore', 'netservice,nodejs', 'netservice,socketpool',
    'netservice,stubresolver', 'netservice,tcp', 'netservice,webapi', 'nic,dma', 'nic,ethframe',
    'nic,signal', 'nodejs,libuv', 'nodejs,process', 'originpull,cfcache', 'originpull,tier1b',
    'parser,ast', 'phy,signal', 'planner,executor', 'pool,postgres', 'pool,prisma', 'pool,service',
    'pool,tcp', 'postgres,planner', 'postgres,pool', 'postgres,prisma', 'postgres,wal',
    'prisma,pool', 'prisma,service', 'process,cpu', 'process,fdtable', 'proxy,appcode',
    'proxy,dnat', 'proxy,ip', 'proxy,originpull', 'qdisc,driver', 'recursive,authns',
    'recursive,rootns', 'recursive,stubresolver', 'recursive,tldns', 'ringbuffer,dma',
    'ringbuffer,ip', 'routing,arp', 'routing,tcp', 'scheduler,syscallgate', 'service,appserver',
    'service,middleware', 'service,prisma', 'sharedbuf,memmap', 'signal,switch', 'signal,wififrame',
    'socketlayer,netfilter', 'socketlayer,socketobj', 'socketlayer,tcp', 'socketobj,appcode',
    'socketobj,fdtable', 'socketobj,scheduler', 'socketobj,socketlayer', 'socketobj,tcp',
    'socketpool,netservice', 'softirq,ringbuffer', 'stubresolver,libc', 'stubresolver,recursive',
    'switch,homerouter', 'switch,nic', 'syscallgate,cpu', 'syscallgate,netservice',
    'syscallgate,syscalltable', 'syscalltable,process', 'tcp,anycast', 'tcp,appserver',
    'tcp,cftls', 'tcp,ip', 'tcp,netfilter', 'tcp,netservice', 'tcp,nodejs', 'tcp,postgres',
    'tcp,routing', 'tcp,socketlayer', 'tcp,socketobj', 'tier1a,ispcore', 'tier1a,ixp',
    'tier1b,anycast', 'tier1b,lb', 'turbofan,machinecode', 'udp,recursive', 'undici,eventloop',
    'undici,netservice', 'veth,cnetns', 'waf,cfcache', 'wal,executor', 'webapi,eventloop',
    'webapi,undici', 'wififrame,nic',
  ] as const
).map((pair) => pair.split(',') as [NodeId, NodeId]);

/**
 * Structural links that keep the graph connected and readable even where the lesson
 * never sends a packet — the interrupt line, the namespace/memory relationships, and
 * the UDP path used by DNS.
 */
const AUX: [NodeId, NodeId][] = [
  ['nic', 'irq'],
  ['netns', 'cnetns'],
  ['netns', 'ip'],
  ['memmap', 'process'],
  ['thread', 'scheduler'],
  ['udp', 'ip'],
  ['udp', 'socketlayer'],
  ['authns', 'netservice'],
  ['wal', 'disk'],
  ['sharedbuf', 'disk'],
];

function buildEdges(): EdgeLayout[] {
  const seen = new Set<string>();
  const out: EdgeLayout[] = [];

  const push = (from: NodeId, to: NodeId, kind: 'flow' | 'aux') => {
    const id = `${from}__${to}`;
    if (seen.has(id) || seen.has(`${to}__${from}`)) return;
    const a = NODE_BY_ID[from];
    const b = NODE_BY_ID[to];
    if (!a || !b) return;
    seen.add(id);
    out.push({ id, from, to, d: connectorPath(a, b), kind });
  };

  for (const [from, to] of TRANSITIONS) push(from, to, 'flow');
  for (const [from, to] of AUX) push(from, to, 'aux');
  return out;
}

export const EDGES: EdgeLayout[] = buildEdges();
