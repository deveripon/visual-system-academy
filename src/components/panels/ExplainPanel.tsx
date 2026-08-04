'use client';

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { CHAPTERS, type StepExplain } from '@/data/types';
import { MODE_LABEL, modeColor } from '@/scene/modeColors';
import { useCurrentStep, useStepCount } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { CodePane, CopyButton } from './CodePane';

/** Content swap is a 220ms fade-and-rise, replayed by remounting on `key={step.id}`. */
const FADE_CSS = `
@keyframes vsa-step-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.vsa-step-in { animation: vsa-step-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Content writes inline code in backticks (`tcp_v4_connect`, `SO_REUSEADDR`). Rendering
 * the ticks literally would be a wart on prose that is otherwise carefully written, and
 * the mono face is the product's technical voice — so the spans become real <code>.
 */
function Prose({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const parts = text.split('`');
  return (
    <p className={className} style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="rounded-[3px] border border-line bg-surface-2 px-[3px] py-[1px] font-mono text-[0.9em] text-t1"
          >
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

/** Small mono caps label. Colour comes in as an inline style so it beats the global rule. */
function Label({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="instrument-label block" style={color ? { color } : undefined}>
      {children}
    </span>
  );
}

interface CardProps {
  label: string;
  accent?: string;
  tint?: number;
  children: ReactNode;
}

function Card({ label, accent, tint = 0, children }: CardProps) {
  return (
    <div
      className="rounded-[var(--r-sm)] border border-line px-3 py-2.5"
      style={
        accent
          ? {
              borderLeft: `2px solid ${accent}`,
              background: `color-mix(in oklab, ${accent} ${tint}%, transparent)`,
            }
          : { background: 'var(--surface)' }
      }
    >
      <Label color={accent}>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** component / layer / abstraction / protocol — the compact identity strip. */
function MetaStrip({ explain }: { explain: StepExplain }) {
  const rows: [string, string][] = [
    ['component', explain.component],
    ['layer', explain.layer],
    ['abstraction', explain.abstraction],
    ['protocol', explain.protocol],
  ];
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-[var(--r-sm)] border border-line bg-surface px-3 py-2.5">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="instrument-label pt-[1px] text-right">{key}</dt>
          <dd className="font-mono text-[11.5px] leading-[1.5] break-words text-t2">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyExplain() {
  return (
    <section aria-label="Step explanation" className="p-4">
      <p className="instrument-label">no step loaded</p>
      <p className="mt-2 text-[13px] text-t3">
        The lesson timeline is empty for the current scenario.
      </p>
    </section>
  );
}

/**
 * The reading surface: all ten `explain` fields, given a hierarchy instead of ten
 * identical rows — hook (`why`), body (`what`), identity strip, then the four cards that
 * each earn their own voice.
 */
export function ExplainPanel() {
  const step = useCurrentStep();
  const stepIndex = useSimStore((s) => s.stepIndex);
  const prodMode = useSimStore((s) => s.prodMode);
  const total = useStepCount();

  if (!step) return <EmptyExplain />;

  const chapter = CHAPTERS.find((c) => c.n === step.chapter);
  const accent = modeColor(step.mode);
  const { explain } = step;

  return (
    <section aria-label="Step explanation" className="flex flex-col gap-4 p-4">
      <style href="vsa-explain" precedence="medium">
        {FADE_CSS}
      </style>

      <header className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="instrument-label truncate">
            ch {pad2(step.chapter)} · {chapter?.title ?? 'lesson'}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-t3 tabular-nums">
            {pad2(stepIndex + 1)}/{total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.08em]"
            style={{
              color: accent,
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
              background: `color-mix(in oklab, ${accent} 12%, transparent)`,
            }}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
            />
            {MODE_LABEL[step.mode]}
          </span>
          {prodMode ? (
            <span className="rounded-full border border-[color-mix(in_oklab,var(--mode-remote)_45%,transparent)] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.08em] text-remote">
              PROD
            </span>
          ) : null}
        </div>
      </header>

      <div key={step.id} className="vsa-step-in flex flex-col gap-4">
        <h2 className="text-[19px] leading-[1.25] font-semibold tracking-[-0.01em] text-t1">
          {step.title}
        </h2>

        {/* why — the lead-in that makes the detail worth reading */}
        <Prose
          text={explain.why}
          className="border-l-2 pl-3 text-[14.5px] leading-[1.55] text-t1"
          style={{ borderColor: accent }}
        />

        {/* what — the body prose */}
        <div>
          <Label>what happens</Label>
          <Prose
            text={explain.what}
            className="mt-1.5 text-[13.5px] leading-[1.65] text-t2"
          />
        </div>

        <MetaStrip explain={explain} />

        <Card label="common misconception" accent="var(--warn)" tint={7}>
          <Prose
            text={explain.misconception}
            className="text-[13px] leading-[1.6] text-t2"
          />
        </Card>

        <Card label="analogy">
          <Prose text={explain.analogy} className="text-[13px] leading-[1.6] text-t3 italic" />
        </Card>

        <div className="rounded-[var(--r-sm)] border border-line bg-[color-mix(in_oklab,var(--bg-0)_55%,transparent)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Label>try it yourself</Label>
            <CopyButton
              text={explain.command}
              label="Copy command"
              className="ml-auto"
            />
          </div>
          <div className="mt-1.5 flex gap-2 overflow-x-auto">
            <span aria-hidden="true" className="shrink-0 font-mono text-[12px] text-t3">
              $
            </span>
            <code className="font-mono text-[12px] leading-[1.55] whitespace-pre-wrap text-t1">
              {explain.command}
            </code>
          </div>
        </div>

        <Card label="in production" accent="var(--mode-remote)" tint={7}>
          <Prose text={explain.production} className="text-[13px] leading-[1.6] text-t2" />
        </Card>

        {step.code?.length ? (
          <div className="flex flex-col gap-2">
            <Label>
              source · {step.code.length} {step.code.length === 1 ? 'pane' : 'panes'}
            </Label>
            {step.code.map((pane, i) => (
              <CodePane key={`${pane.title}-${i}`} pane={pane} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
