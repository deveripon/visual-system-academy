import type { ZoneId } from '@/data/types';

export type LayerView =
  | 'application'
  | 'os'
  | 'kernel'
  | 'network'
  | 'hardware'
  | 'internet'
  | 'production';

export interface LayerViewDef {
  label: string;
  /** Zones the camera frames and keeps at full opacity; everything else dims. */
  zones: ZoneId[];
  hint: string;
}

export const LAYER_VIEWS: Record<LayerView, LayerViewDef> = {
  application: {
    label: 'Application',
    zones: ['z-browser', 'z-node', 'z-app'],
    hint: 'What your code sees: JavaScript, the runtime, the server framework.',
  },
  os: {
    label: 'Operating System',
    zones: ['z-kernel', 'z-node'],
    hint: 'Processes, threads, file descriptors, the system-call boundary.',
  },
  kernel: {
    label: 'Kernel',
    zones: ['z-kernel'],
    hint: 'Ring 0: sockets, TCP/IP, netfilter, the driver and softirq path.',
  },
  network: {
    label: 'Network',
    zones: ['z-lan', 'z-isp', 'z-inet', 'z-dns'],
    hint: 'Everything between machines: LAN, NAT, ISP, backbone, DNS.',
  },
  hardware: {
    label: 'Hardware',
    zones: ['z-hw'],
    hint: 'Below software: ring buffers, DMA, the NIC, the PHY, the signal.',
  },
  internet: {
    label: 'Internet',
    zones: ['z-isp', 'z-inet', 'z-dns', 'z-cf'],
    hint: 'Autonomous systems, peering, anycast and the edge.',
  },
  production: {
    label: 'Production',
    zones: ['z-cf', 'z-origin', 'z-app', 'z-db'],
    hint: 'The stack you actually deploy: edge, proxy, container, app, database.',
  },
};

export const LAYER_VIEW_ORDER: LayerView[] = [
  'application',
  'os',
  'kernel',
  'network',
  'hardware',
  'internet',
  'production',
];
