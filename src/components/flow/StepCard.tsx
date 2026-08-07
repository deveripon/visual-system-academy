'use client';

import { useState } from 'react';
import type { Step } from '@/data/types';
import { MODE_LABEL, modeColor, modeFill } from '@/scene/modeColors';
import { CodePane } from '@/components/panels/CodePane';

/**
 * One station's explanation, hanging under its node. This replaces the old right rail:
 * the words belong next to the thing they describe, not in a sidebar the eye has to
 * travel to.
 *
 * One <article>, two states. React keeps the DOM node when `current` flips, so the
 * width/opacity/border changes TRANSITION instead of swapping — the card visibly folds
 * down to its title when the story moves on, and unfolds if you step back.
 */
export function StepCard({ step, current }: { step: Step; current: boolean }) {
  const ink = modeColor(step.mode);

  return (
    <article
      data-step-card={step.id}
      aria-current={current ? 'step' : undefined}
      className={[
        'flex shrink-0 flex-col overflow-hidden rounded-[var(--r-lg)] border bg-bg-1',
        'transition-[width,max-height,opacity,border-color,box-shadow] duration-500',
        current
          ? 'max-h-[calc(100vh-16rem)] w-[400px] overflow-y-auto p-5'
          : 'max-h-40 w-[230px] p-3.5 opacity-60 hover:opacity-100',
      ].join(' ')}
      style={{
        borderColor: current ? ink : 'var(--line)',
        boxShadow: current ? 'var(--shadow-lift)' : 'var(--shadow-card)',
        transitionTimingFunction: 'var(--ease-out)',
        animation: current ? 'vsa-card-in var(--t-flow) var(--ease-out) both' : undefined,
      }}
    >
      {current ? <FullCard step={step} ink={ink} /> : <MiniCard step={step} />}
    </article>
  );
}

function MiniCard({ step }: { step: Step }) {
  return (
    <h2
      className="text-[13px] font-medium leading-snug text-ink-2"
      style={{ animation: 'vsa-fade-in var(--t-ui) var(--ease-out) both' }}
    >
      {step.title}
    </h2>
  );
}

function FullCard({ step, ink }: { step: Step; ink: string }) {
  return (
    <div style={{ animation: 'vsa-fade-in var(--t-ui) var(--ease-out) both' }}>
      <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink-1">
        {step.title}
      </h2>

      <p className="mt-3 text-[13.5px] leading-[1.65] text-ink-2">{step.explain.what}</p>

      <p
        className="mt-3 border-l-2 pl-3 text-[13px] leading-[1.6] italic text-ink-2"
        style={{ borderColor: modeFill(step.mode) }}
      >
        {step.explain.why}
      </p>

      {step.code?.length ? (
        <div className="mt-4 flex flex-col gap-1.5">
          {step.code.map((pane, i) => (
            <CodePane key={`${pane.title}-${i}`} pane={pane} />
          ))}
        </div>
      ) : null}

      <Disclosure label="Detail">
        <Field name="component" value={step.explain.component} />
        <Field name="layer" value={step.explain.layer} />
        <Field name="abstraction" value={step.explain.abstraction} />
        <Field name="protocol" value={step.explain.protocol} />
      </Disclosure>

      <Disclosure label="Common misconception">
        <p className="text-[12.5px] leading-[1.6] text-ink-2">{step.explain.misconception}</p>
      </Disclosure>

      <Disclosure label="Analogy">
        <p className="text-[12.5px] leading-[1.6] text-ink-2">{step.explain.analogy}</p>
      </Disclosure>

      <Disclosure label="Try it yourself">
        <pre className="overflow-x-auto rounded-[var(--r-sm)] bg-bg-2 px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.6] text-ink-1">
          {step.explain.command}
        </pre>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-2">{step.explain.production}</p>
      </Disclosure>

      {step.packet ? (
        <Disclosure label={`Packet · ${step.packet.label}`}>
          <div className="flex flex-col gap-1">
            {step.packet.layers.map((layer) => (
              <div key={layer} className="rounded-[var(--r-sm)] bg-bg-2 px-2.5 py-1.5">
                <span className="instrument-label">{layer}</span>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  {Object.entries(step.packet?.fields?.[layer] ?? {}).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-[family-name:var(--font-mono)] text-[10.5px] text-ink-3">
                        {k}
                      </dt>
                      <dd className="font-[family-name:var(--font-mono)] text-[10.5px] text-ink-1">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <p className="mt-4 flex items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-semibold"
          style={{ background: modeFill(step.mode), color: ink }}
        >
          {MODE_LABEL[step.mode]}
        </span>
      </p>
    </div>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-0.5">
      <span className="instrument-label pt-[2px] text-right">{name}</span>
      <span className="font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.5] text-ink-2">
        {value}
      </span>
    </div>
  );
}

/**
 * Children stay mounted; the row glides open via the grid-template-rows 0fr → 1fr
 * trick, which animates height without measuring anything.
 */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <span
          className="text-[10px] text-ink-3 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(90deg)' : undefined,
            transitionTimingFunction: 'var(--ease-out)',
          }}
        >
          ▶
        </span>
        <span className="instrument-label">{label}</span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transitionTimingFunction: 'var(--ease-out)',
        }}
      >
        <div className="overflow-hidden">
          <div className="pb-1 pl-4 pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
