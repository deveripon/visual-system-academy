/**
 * Chaos scenarios are authored independently of the step files, so their `entryAfter`
 * ids can drift from the real step ids. Rather than forcing content agents to
 * coordinate, this table is the seam: the first candidate that exists as a real step id
 * wins. Shared by convert-content.mjs and validate-content.mjs. (docs/CONTRACTS.md C10)
 */
export const CHAOS_ENTRY_FALLBACKS = {
  dnsdown: [
    'dns-flight-to-recursive',
    'dns-query-build',
    'dns-query-sent',
    'dns-stub-query',
    'dns-stub-lookup',
  ],
  synfail: ['syn-driver-handoff', 'syn-qdisc-enqueue', 'tcp-syn-egress', 'hw-doorbell'],
  certfail: [
    'tls-cert-verify',
    'tls-cert-verification',
    'tls-cert-chain',
    'tls-server-cert',
  ],
  dbdown: ['pool-checkout', 'prisma-pool-checkout', 'prisma-pool', 'pg-connect'],
  portinuse: [''],
};

/** Resolve a scenario's entry step against the real step ids. Returns '' for standalone. */
export function resolveChaosEntry(id, authored, stepIds) {
  const value = authored ?? '';
  if (value === '' || stepIds.has(value)) return value;
  const fallback = (CHAOS_ENTRY_FALLBACKS[id] ?? []).find(
    (candidate) => candidate === '' || stepIds.has(candidate),
  );
  return fallback === undefined ? null : fallback;
}
