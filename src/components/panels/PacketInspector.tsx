'use client';

import { useId, useState } from 'react';
import type { PacketLayer, StepPacket } from '@/data/types';
import { useCurrentStep } from '@/state/selectors';

interface LayerMeta {
  /** Wireshark-ish protocol name. */
  name: string;
  /** Rough OSI position — the whole point of the stacked view. */
  osi: string;
  color: string;
}

const LAYER_META: Record<PacketLayer, LayerMeta> = {
  eth: { name: 'Ethernet II', osi: 'L2', color: 'var(--mode-hw)' },
  wifi: { name: 'IEEE 802.11', osi: 'L2', color: 'var(--mode-hw)' },
  ip: { name: 'Internet Protocol v4', osi: 'L3', color: 'var(--mode-net)' },
  udp: { name: 'User Datagram Protocol', osi: 'L4', color: 'var(--mode-net)' },
  tcp: { name: 'Transmission Control Protocol', osi: 'L4', color: 'var(--mode-net)' },
  tls: { name: 'Transport Layer Security', osi: 'L5', color: 'var(--mode-remote)' },
  http: { name: 'Hypertext Transfer Protocol', osi: 'L7', color: 'var(--mode-user)' },
  dns: { name: 'Domain Name System', osi: 'L7', color: 'var(--mode-user)' },
  payload: { name: 'Payload', osi: 'data', color: 'var(--ok)' },
};

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden="true"
      className="shrink-0 text-t3 transition-transform duration-[var(--t-micro)]"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LayerRow({
  layer,
  fields,
  depth,
  open,
  onToggle,
}: {
  layer: PacketLayer;
  fields: Record<string, string> | undefined;
  depth: number;
  open: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();
  const meta = LAYER_META[layer];
  const entries = Object.entries(fields ?? {});

  return (
    <li style={{ marginLeft: depth * 9 }}>
      <div
        className="rounded-[6px] border border-line"
        style={{ borderLeft: `2px solid color-mix(in oklab, ${meta.color} 55%, transparent)` }}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-[var(--t-micro)] hover:bg-surface-2"
        >
          <Caret open={open} />
          <span
            className="shrink-0 font-mono text-[9.5px] font-semibold tracking-[0.08em] uppercase"
            style={{ color: meta.color }}
          >
            {layer}
          </span>
          <span className="truncate font-mono text-[11px] text-t2">{meta.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[9.5px] text-t3">
            {meta.osi}
            {entries.length ? ` · ${entries.length}` : ''}
          </span>
        </button>

        <div id={bodyId} hidden={!open}>
          {open ? (
            entries.length ? (
              <dl className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-x-2.5 gap-y-1 border-t border-line px-2 py-1.5 font-mono text-[10.5px]">
                {entries.map(([name, value]) => (
                  <div key={name} className="contents">
                    <dt className="truncate text-t3">{name}</dt>
                    <dd className="break-words text-t1">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="border-t border-line px-2 py-1.5 font-mono text-[10.5px] text-t3">
                header present · no fields decoded for this step
              </p>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Layer disclosure state is per-packet: keying this on the step id in the parent means a
 * step change gets a fresh stack with the innermost layer already open, which is the one
 * carrying the point of the step.
 */
function LayerStack({ packet }: { packet: StepPacket }) {
  const layers = packet.layers;
  const initial = (() => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer && Object.keys(packet.fields?.[layer] ?? {}).length > 0) return layer;
    }
    return layers[layers.length - 1] ?? null;
  })();

  const [open, setOpen] = useState<PacketLayer | null>(initial);

  return (
    <ul className="flex flex-col gap-1">
      {layers.map((layer, depth) => (
        <LayerRow
          key={layer}
          layer={layer}
          depth={depth}
          fields={packet.fields?.[layer]}
          open={open === layer}
          onToggle={() => setOpen((cur) => (cur === layer ? null : layer))}
        />
      ))}
    </ul>
  );
}

/**
 * Wireshark's packet-detail pane, shrunk to a rail: outermost encapsulation first, each
 * layer opening onto its real header fields.
 */
export function PacketInspector() {
  const step = useCurrentStep();
  const packet = step?.packet;

  return (
    <section
      aria-label="Packet inspector"
      className="flex min-h-[128px] flex-col gap-2 border-t border-line p-3.5"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="instrument-label">packet</h2>
        {packet ? (
          <span className="ml-auto shrink-0 font-mono text-[9.5px] text-t3">
            {packet.layers.length} layers
          </span>
        ) : null}
      </div>

      {packet ? (
        <>
          <p className="font-mono text-[11px] leading-[1.5] break-words text-t1">
            {packet.label}
          </p>
          <LayerStack key={step?.id ?? 'none'} packet={packet} />
        </>
      ) : (
        <p className="text-[12px] leading-[1.55] text-t3">
          Nothing on the wire for this step — it happens entirely inside one machine.
        </p>
      )}
    </section>
  );
}
