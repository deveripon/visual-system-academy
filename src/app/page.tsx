'use client';

import dynamic from 'next/dynamic';
import { SimSkeleton } from '@/components/shell/SimSkeleton';

/**
 * The simulator is client-only: it measures the DOM, drives panzoom and GSAP, and reads
 * `matchMedia`. Server-rendering it would only create hydration hazards, so it loads
 * behind a static skeleton (see docs/ARCHITECTURE.md).
 */
const SimulatorShell = dynamic(
  () => import('@/components/shell/SimulatorShell').then((m) => m.SimulatorShell),
  { ssr: false, loading: () => <SimSkeleton /> },
);

export default function Page() {
  return <SimulatorShell />;
}
