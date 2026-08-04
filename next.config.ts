import type { NextConfig } from 'next';

/**
 * The simulator is fully client-side — there is no backend in v1 — so the whole app
 * exports to static files. Keeping `output: 'export'` on means a server-only feature
 * can never sneak in unnoticed (docs/PRD.md §5).
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
