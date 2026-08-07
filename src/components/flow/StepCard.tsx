'use client';

import { useState } from 'react';
import { CHAPTERS, type Step } from '@/data/types';
import { MODE_LABEL, modeColor, modeFill } from '@/scene/modeColors';
import { CodePane } from '@/components/panels/CodePane';

/**
 * The slide: one step's full explanation. FlowCanvas renders exactly one of these,
 * centre stage, keyed on step.id — the deck metaphor lives in the parent; this card
 * only has to read well.
 *
 * Hierarchy, top to bottom: where you are (eyebrow) → what this step is (title) →
 * the story (what/why) → the receipts (code) → the optional depth (disclosures).
 */
export function StepCard({ step }: { step: Step }) {
  const ink = modeColor(step.mode);
  const fill = modeFill(step.mode);
  const chapter = CHAPTERS.find((c) => c.n === step.chapter);

  return (
    <article
      data-step-card={step.id}
      aria-current="step"
      className="flex min-h-0 w-full flex-col overflow-y-auto rounded-[var(--r-lg)] border bg-bg-1 px-4 py-5 sm:px-7 sm:py-6"
      style={{ borderColor: ink, boxShadow: 'var(--shadow-lift)' }}
    >
      {/* eyebrow — where you are */}
      <header className="flex items-center gap-2">
        <span className="instrument-label">
          {chapter ? `ch ${String(step.chapter).padStart(2, '0')} · ${chapter.title}` : ''}
        </span>
        <span
          className="ml-auto rounded-full px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ background: fill, color: ink }}
        >
          {MODE_LABEL[step.mode]}
        </span>
      </header>

      <h2 className="mt-2.5 text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-ink-1 sm:text-[21px]">
        {step.title}
      </h2>

      <p className="mt-3.5 text-[14px] leading-[1.7] text-ink-2">{step.explain.what}</p>

      <p
        className="mt-3.5 rounded-r-[var(--r-sm)] border-l-2 py-1.5 pl-3.5 pr-2 text-[13px] leading-[1.65] italic text-ink-2"
        style={{ borderColor: ink, background: `color-mix(in oklab, ${fill} 36%, transparent)` }}
      >
        {step.explain.why}
      </p>

      {step.code?.length ? (
        <div className="mt-5 flex flex-col gap-1.5">
          {step.code.map((pane, i) => (
            <CodePane key={`${pane.title}-${i}`} pane={pane} />
          ))}
        </div>
      ) : null}

      {/* the optional depth — one quiet block, tight rows */}
      <div className="mt-5 rounded-[var(--r-md)] border border-line">
        <Disclosure label="Detail" first>
          <Field name="component" value={step.explain.component} />
          <Field name="layer" value={step.explain.layer} />
          <Field name="abstraction" value={step.explain.abstraction} />
          <Field name="protocol" value={step.explain.protocol} />
        </Disclosure>

        <Disclosure label="Common misconception" accent="var(--warn)">
          <p className="text-[13px] leading-[1.65] text-ink-2">{step.explain.misconception}</p>
        </Disclosure>

        <Disclosure label="Analogy">
          <p className="text-[13px] leading-[1.65] text-ink-2">{step.explain.analogy}</p>
        </Disclosure>

        <Disclosure label="Try it yourself">
          <pre className="overflow-x-auto rounded-[var(--r-sm)] bg-bg-2 px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.6] text-ink-1">
            {step.explain.command}
          </pre>
          <p className="mt-2 text-[13px] leading-[1.65] text-ink-2">{step.explain.production}</p>
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
      </div>
    </article>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-1">
      <span className="instrument-label pt-[2px] text-right">{name}</span>
      <span className="font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.55] text-ink-2">
        {value}
      </span>
    </div>
  );
}

/**
 * One row of the depth block. Children stay mounted; the row glides open via the
 * grid-template-rows 0fr → 1fr trick, which animates height without measuring anything.
 */
function Disclosure({
  label,
  first,
  accent,
  children,
}: {
  label: string;
  first?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={first ? '' : 'border-t border-line'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-bg-2"
      >
        <span
          className="text-[9px] text-ink-3 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(90deg)' : undefined,
            transitionTimingFunction: 'var(--ease-out)',
          }}
        >
          ▶
        </span>
        <span className="instrument-label" style={accent && open ? { color: accent } : undefined}>
          {label}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transitionTimingFunction: 'var(--ease-out)',
        }}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
