import type { NodeId } from '@/data/types';

/**
 * The containment hierarchy the learner walks through (docs/ENGINE_V2.md §5).
 *
 * Fifteen container ids are introduced here. They are NOT new content — they are the
 * rooms the existing 87 components already sit in, made explicit so the camera has
 * somewhere to descend into. Three existing NodeIds (`netservice`, `nodejs`, `process`)
 * also act as containers: they are real components that happen to have internals.
 *
 * Every one of the 87 NodeIds appears exactly once; `assertTreeCovers87` proves it.
 */
export const CONTAINER_IDS = [
  'journey',
  'runtime',
  'v8',
  'dns-system',
  'kernel',
  'syscall',
  'netstack',
  'driverlayer',
  'hardware',
  'lan',
  'internet',
  'edge',
  'origin',
  'app',
  'database',
] as const;

export type ContainerId = (typeof CONTAINER_IDS)[number];

/** Anything the camera can point at: a real component or one of the rooms above. */
export type TreeId = NodeId | ContainerId;

export interface TreeNodeSpec {
  id: TreeId;
  label: string;
  /** One line shown under the label while the box is closed. */
  sub?: string;
  children?: TreeNodeSpec[];
}

export const TREE: TreeNodeSpec = {
  id: 'journey',
  label: 'The Journey',
  sub: 'one fetch(), end to end',
  children: [
    { id: 'appcode', label: 'Your Code', sub: 'await fetch(…)' },

    {
      id: 'runtime',
      label: 'Runtime',
      sub: 'what actually runs your JavaScript',
      children: [
        {
          id: 'v8',
          label: 'V8',
          sub: 'two compilers in a trench coat',
          children: [
            { id: 'parser', label: 'Parser', sub: 'scanner · tokens' },
            { id: 'ast', label: 'AST', sub: 'syntax tree' },
            { id: 'ignition', label: 'Ignition', sub: 'interpreter' },
            { id: 'bytecode', label: 'Bytecode', sub: 'register VM' },
            { id: 'turbofan', label: 'TurboFan', sub: 'optimizer' },
            { id: 'machinecode', label: 'Machine Code', sub: 'x86-64' },
          ],
        },
        { id: 'webapi', label: 'Web API', sub: 'fetch() is not JavaScript' },
        { id: 'eventloop', label: 'Event Loop', sub: 'micro vs macro tasks' },
        {
          id: 'netservice',
          label: 'Network Service',
          sub: 'PID 4903 · the sandboxed one',
          children: [
            { id: 'httpcache', label: 'HTTP Cache', sub: 'MISS' },
            { id: 'socketpool', label: 'Socket Pool', sub: 'keep-alive' },
          ],
        },
        {
          id: 'nodejs',
          label: 'Node.js',
          sub: 'the other runtime',
          children: [
            { id: 'libuv', label: 'libuv', sub: 'event loop · threadpool' },
            { id: 'undici', label: 'undici', sub: 'fetch, in JS' },
          ],
        },
      ],
    },

    {
      id: 'dns-system',
      label: 'DNS',
      sub: 'the detour every request takes first',
      children: [
        { id: 'stubresolver', label: 'Stub Resolver', sub: '/etc/resolv.conf' },
        { id: 'recursive', label: 'Recursive Resolver', sub: '1.1.1.1' },
        { id: 'rootns', label: 'Root Server', sub: '13 letters, 1500 machines' },
        { id: 'tldns', label: 'TLD Server', sub: '.dev' },
        { id: 'authns', label: 'Authoritative', sub: 'api.shop.dev' },
      ],
    },

    {
      id: 'kernel',
      label: 'Linux Kernel',
      sub: 'ring 0 · where the machine is really run',
      children: [
        {
          id: 'syscall',
          label: 'System Call',
          sub: 'the privilege boundary',
          children: [
            { id: 'libc', label: 'glibc', sub: 'syscall wrapper' },
            { id: 'syscallgate', label: 'Syscall Gate', sub: 'entry_SYSCALL_64' },
            { id: 'cpu', label: 'CPU', sub: 'ring 3 → ring 0' },
            { id: 'syscalltable', label: 'Syscall Table', sub: 'sys_socket' },
          ],
        },
        {
          id: 'process',
          label: 'Process',
          sub: 'task_struct · who owns what',
          children: [
            { id: 'thread', label: 'Thread', sub: 'sched entity' },
            { id: 'scheduler', label: 'Scheduler', sub: 'CFS' },
            { id: 'fdtable', label: 'FD Table', sub: 'everything is a file' },
            { id: 'memmap', label: 'Memory Map', sub: 'user ↔ kernel' },
          ],
        },
        {
          id: 'netstack',
          label: 'Network Stack',
          sub: 'sockets, protocols, packet filtering',
          children: [
            { id: 'socketlayer', label: 'Socket Layer', sub: 'sock_create' },
            { id: 'socketobj', label: 'struct sock', sub: 'the socket itself' },
            { id: 'tcp', label: 'TCP', sub: 'tcp_output.c' },
            { id: 'udp', label: 'UDP', sub: 'datagrams' },
            { id: 'ip', label: 'IP', sub: 'ip_output.c' },
            { id: 'routing', label: 'Routing / FIB', sub: 'longest prefix' },
            { id: 'arp', label: 'ARP / neigh', sub: 'who-has' },
            { id: 'netfilter', label: 'Netfilter', sub: '5 hooks' },
            { id: 'iptables', label: 'iptables', sub: 'rule walk' },
            { id: 'conntrack', label: 'conntrack', sub: 'stateful' },
            { id: 'qdisc', label: 'qdisc', sub: 'fq_codel' },
            { id: 'netns', label: 'Net Namespace', sub: 'isolation' },
          ],
        },
        {
          id: 'driverlayer',
          label: 'Driver & Interrupts',
          sub: 'where software meets silicon',
          children: [
            { id: 'driver', label: 'NIC Driver', sub: 'ndo_start_xmit' },
            { id: 'ringbuffer', label: 'Ring Buffer', sub: 'descriptors' },
            { id: 'dma', label: 'DMA', sub: 'no CPU copy' },
            { id: 'irq', label: 'Hardware IRQ', sub: 'top half' },
            { id: 'softirq', label: 'SoftIRQ', sub: 'NET_RX' },
            { id: 'napi', label: 'NAPI', sub: 'poll, not interrupt' },
          ],
        },
      ],
    },

    {
      id: 'hardware',
      label: 'Hardware',
      sub: 'below software',
      children: [
        { id: 'nic', label: 'NIC', sub: 'the card' },
        { id: 'ethframe', label: 'Ethernet Frame', sub: 'preamble · FCS' },
        { id: 'wififrame', label: '802.11 Frame', sub: 'three addresses' },
        { id: 'phy', label: 'PHY', sub: 'encoding' },
        { id: 'signal', label: 'Signal', sub: 'copper · radio' },
      ],
    },

    {
      id: 'lan',
      label: 'Your LAN',
      sub: 'switch · router · NAT',
      children: [
        { id: 'switch', label: 'Switch', sub: 'CAM table' },
        { id: 'homerouter', label: 'Home Router', sub: '192.168.1.1' },
        { id: 'nat', label: 'NAT / PAT', sub: '→ 203.0.113.77' },
        { id: 'modem', label: 'Modem / ONT', sub: 'upstream' },
      ],
    },

    {
      id: 'internet',
      label: 'The Internet',
      sub: 'ISP, backbone, peering',
      children: [
        { id: 'headend', label: 'Headend', sub: 'CMTS / OLT' },
        { id: 'ispcore', label: 'ISP Core', sub: 'aggregation' },
        { id: 'bgp', label: 'BGP', sub: 'best path' },
        { id: 'fiber', label: 'Fiber', sub: '4.9 µs/km' },
        { id: 'tier1a', label: 'Tier 1 Transit', sub: 'TTL 61' },
        { id: 'ixp', label: 'IXP', sub: 'peering fabric' },
        { id: 'tier1b', label: 'Tier 1 Transit', sub: 'TTL 60' },
      ],
    },

    {
      id: 'edge',
      label: 'Cloudflare Edge',
      sub: 'anycast · TLS terminates here',
      children: [
        { id: 'anycast', label: 'Anycast Edge', sub: '104.18.32.7' },
        { id: 'ddos', label: 'DDoS Filter', sub: 'L3/4 + L7' },
        { id: 'waf', label: 'WAF', sub: 'OWASP CRS' },
        { id: 'cftls', label: 'TLS Termination', sub: 'TLS 1.3' },
        { id: 'cfcache', label: 'Edge Cache', sub: 'DYNAMIC' },
        { id: 'originpull', label: 'Origin Pull', sub: 'CF-Connecting-IP' },
      ],
    },

    {
      id: 'origin',
      label: 'Origin Infrastructure',
      sub: 'load balancer · proxy · container network',
      children: [
        { id: 'lb', label: 'Load Balancer', sub: 'L4 · least-conn' },
        { id: 'proxy', label: 'Reverse Proxy', sub: 'nginx / Caddy' },
        { id: 'dnat', label: 'iptables DNAT', sub: '→ 172.17.0.2' },
        { id: 'bridge', label: 'docker0', sub: 'bridge' },
        { id: 'veth', label: 'veth pair', sub: 'container link' },
        { id: 'cnetns', label: 'Container netns', sub: 'isolated stack' },
      ],
    },

    {
      id: 'app',
      label: 'Application',
      sub: 'NestJS · Prisma',
      children: [
        { id: 'appserver', label: 'Node Server', sub: 'PID 1' },
        { id: 'middleware', label: 'Middleware', sub: 'helmet · cors' },
        { id: 'controller', label: 'Controller', sub: 'GET /products' },
        { id: 'service', label: 'Service', sub: 'business logic' },
        { id: 'prisma', label: 'Prisma', sub: 'query engine' },
        { id: 'pool', label: 'Connection Pool', sub: 'checkout' },
      ],
    },

    {
      id: 'database',
      label: 'PostgreSQL',
      sub: 'planner · executor · storage',
      children: [
        { id: 'postgres', label: 'PostgreSQL', sub: 'backend PID 8842' },
        { id: 'planner', label: 'Planner', sub: 'cost-based' },
        { id: 'executor', label: 'Executor', sub: 'volcano model' },
        { id: 'sharedbuf', label: 'shared_buffers', sub: '8 KB pages' },
        { id: 'wal', label: 'WAL', sub: 'durability' },
        { id: 'disk', label: 'Disk', sub: 'NVMe' },
      ],
    },
  ],
};
