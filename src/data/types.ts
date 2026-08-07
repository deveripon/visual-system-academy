/**
 * Core lesson data model. Lessons are pure data — the engine renders whatever a
 * lesson declares (see docs/DATA_MODEL.md). NodeId is the compile-time source of
 * truth binding scene layout, steps, and component dossiers together.
 */

export const ZONE_IDS = [
  'z-browser',
  'z-node',
  'z-kernel',
  'z-hw',
  'z-lan',
  'z-isp',
  'z-inet',
  'z-dns',
  'z-cf',
  'z-origin',
  'z-app',
  'z-db',
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export const NODE_IDS = [
  // browser (12)
  'appcode', 'parser', 'ast', 'ignition', 'bytecode', 'turbofan', 'machinecode',
  'eventloop', 'webapi', 'netservice', 'httpcache', 'socketpool',
  // node.js (3)
  'nodejs', 'libuv', 'undici',
  // kernel (27)
  'libc', 'syscallgate', 'syscalltable', 'cpu', 'process', 'thread', 'scheduler',
  'fdtable', 'memmap', 'socketlayer', 'socketobj', 'tcp', 'udp', 'ip', 'routing',
  'arp', 'netns', 'netfilter', 'iptables', 'conntrack', 'qdisc', 'driver',
  'ringbuffer', 'dma', 'irq', 'softirq', 'napi',
  // hardware (5)
  'nic', 'ethframe', 'wififrame', 'phy', 'signal',
  // lan (4)
  'switch', 'homerouter', 'nat', 'modem',
  // isp (4)
  'headend', 'ispcore', 'bgp', 'fiber',
  // internet (3)
  'tier1a', 'tier1b', 'ixp',
  // dns (5)
  'stubresolver', 'recursive', 'rootns', 'tldns', 'authns',
  // cloudflare (6)
  'anycast', 'ddos', 'waf', 'cfcache', 'cftls', 'originpull',
  // origin (6)
  'lb', 'proxy', 'dnat', 'bridge', 'veth', 'cnetns',
  // app (6)
  'appserver', 'middleware', 'controller', 'service', 'prisma', 'pool',
  // db (6)
  'postgres', 'planner', 'executor', 'sharedbuf', 'wal', 'disk',
] as const;
export type NodeId = (typeof NODE_IDS)[number];

export type StepMode = 'user' | 'kernel' | 'hw' | 'net' | 'remote';
export type MemSpace = 'user' | 'kernel' | 'copy';

export type PacketLayer =
  | 'eth' | 'wifi' | 'ip' | 'udp' | 'tcp' | 'tls' | 'http' | 'dns' | 'payload';

export type EffectId =
  | 'irq' | 'ctx'
  | 'ring+' | 'ring-'
  | 'pool+' | 'pool-'
  | 'queue+' | 'queue-'
  | 'flash' | 'zoomout';

export interface ScenarioFlags {
  runtime: 'browser' | 'node';
  dnscache: 'miss' | 'hit';
  medium: 'ethernet' | 'wifi';
  scheme: 'https' | 'http';
  deploy: 'docker' | 'baremetal';
}

export const DEFAULT_FLAGS: ScenarioFlags = {
  runtime: 'browser',
  dnscache: 'miss',
  medium: 'ethernet',
  scheme: 'https',
  deploy: 'docker',
};

export interface StepExplain {
  what: string;
  why: string;
  component: string;
  layer: string;
  abstraction: string;
  protocol: string;
  misconception: string;
  analogy: string;
  command: string;
  production: string;
}

export interface StepPacket {
  label: string;
  layers: PacketLayer[];
  fields?: Partial<Record<PacketLayer, Record<string, string>>>;
}

/** OS-state patch — only the keys that change this step. `fds` replaces the whole table. */
export interface StepStatePatch {
  mode?: StepMode;
  proc?: string;
  /** TCP state machine label (CLOSED, SYN_SENT, ESTABLISHED, …) */
  sock?: string;
  fds?: [fd: string, desc: string][];
  mem?: MemSpace;
}

export interface StepBranch {
  key: keyof ScenarioFlags;
  question: string;
  options: { value: string; label: string; hint?: string }[];
}

export interface StepQuiz {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export type CodeLang = 'js' | 'c' | 'cpp' | 'bash' | 'sql';

export interface CodePane {
  title: string;
  lang: CodeLang;
  code: string;
}

/** Production-mode content overrides, shallow-merged over the step. */
export interface ProdOverride {
  title?: string;
  explain?: Partial<StepExplain>;
  code?: CodePane[];
  packet?: StepPacket;
}

export interface Step {
  id: string;
  chapter: number;
  title: string;
  node: NodeId;
  from?: NodeId;
  mode: StepMode;
  packet?: StepPacket;
  state?: StepStatePatch;
  effects?: EffectId[];
  when?: Partial<ScenarioFlags>;
  branch?: StepBranch;
  quiz?: StepQuiz;
  explain: StepExplain;
  code?: CodePane[];
  prod?: ProdOverride;
}

export interface DossierCommand {
  cmd: string;
  note: string;
}

export interface ComponentDossier {
  name: string;
  tagline: string;
  description: string;
  history: string;
  purpose: string;
  responsibilities: string[];
  commands: DossierCommand[];
  production: string;
  interview: string[];
  sources: string[];
  related: NodeId[];
}

export type ComponentMap = Record<NodeId, ComponentDossier>;

export type ChaosId = 'dnsdown' | 'synfail' | 'certfail' | 'dbdown' | 'portinuse';

export interface ChaosScenario {
  label: string;
  icon: string;
  /** Step id after which this failure splices into the timeline ('' = standalone story). */
  entryAfter: string;
  steps: Step[];
}

export type ChaosMap = Record<ChaosId, ChaosScenario>;

/** Accumulated OS state — the result of folding step patches (see state/foldOsState.ts). */
export interface OsState {
  mode: StepMode;
  proc: string;
  sock: string;
  fds: [string, string][];
  mem: MemSpace;
  counters: { ring: number; pool: number; queue: number };
  /**
   * Provenance: the step index that last CHANGED each field (-1 = never). This is what
   * lets the live inspector show only what this step touched, instead of a wall of
   * instruments that look frozen (docs/ENGINE_V2.md §10).
   */
  touched: { mode: number; proc: number; sock: number; fds: number; mem: number };
}

export interface ChapterInfo {
  n: number;
  title: string;
  /** which scenario flag this chapter branches on, if any */
  branch?: keyof ScenarioFlags;
}

export const CHAPTERS: ChapterInfo[] = [
  { n: 1, title: 'JavaScript Code' },
  { n: 2, title: 'V8 Compilation' },
  { n: 3, title: 'Runtime', branch: 'runtime' },
  { n: 4, title: 'fetch() Internals' },
  { n: 5, title: 'DNS Resolution', branch: 'dnscache' },
  { n: 6, title: 'System Call' },
  { n: 7, title: 'Socket Creation' },
  { n: 8, title: 'TCP SYN Egress' },
  { n: 9, title: 'NIC & Hardware', branch: 'medium' },
  { n: 10, title: 'LAN & NAT' },
  { n: 11, title: 'ISP & Backbone' },
  { n: 12, title: 'TCP Handshake' },
  { n: 13, title: 'TLS Handshake', branch: 'scheme' },
  { n: 14, title: 'HTTP Request' },
  { n: 15, title: 'Cloudflare Edge' },
  { n: 16, title: 'To the Origin' },
  { n: 17, title: 'Docker Networking', branch: 'deploy' },
  { n: 18, title: 'NestJS Application' },
  { n: 19, title: 'Prisma & Pool' },
  { n: 20, title: 'PostgreSQL' },
  { n: 21, title: 'Response: DB → Edge' },
  { n: 22, title: 'Response: Internet → Home' },
  { n: 23, title: 'Kernel RX Path' },
  { n: 24, title: 'Back in the Browser' },
];
