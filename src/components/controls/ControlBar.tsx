'use client';

import { useCurrentStep, useStepCount } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { ThemeToggle } from './ThemeToggle';
import { MODE_LABEL, modeColor } from '@/scene/modeColors';
import { CHAPTERS } from '@/data/types';

const SPEEDS = [0.5, 1, 1.5, 2, 3];

function Icon({ path, filled }: { path: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  restart: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  prev: 'M15 18 9 12l6-6',
  next: 'm9 18 6-6-6-6',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M9 5v14M15 5v14',
  replay: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  chaos: 'M13 2 3 14h7l-1 8 11-13h-7l0-7z',
  help: 'M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.3-1.6 2.4M12 17.5h.01',
};

function CtlButton({
  label,
  onClick,
  children,
  primary,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        'grid h-9 w-9 place-items-center rounded-[10px] border transition-colors duration-150',
        primary
          ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-1)] hover:bg-[color-mix(in_oklab,var(--mode-user)_18%,transparent)]'
          : 'border-transparent text-[var(--text-2)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text-1)]',
        active ? 'text-[var(--mode-user)]' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function ControlBar() {
  const status = useSimStore((s) => s.status);
  const speed = useSimStore((s) => s.speed);
  const autoplay = useSimStore((s) => s.autoplay);
  const quizMode = useSimStore((s) => s.quizMode);
  const view = useSimStore((s) => s.view);
  const prodMode = useSimStore((s) => s.prodMode);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const total = useStepCount();
  const step = useCurrentStep();
  const playing = status === 'playing';

  const chapter = CHAPTERS.find((c) => c.n === step?.chapter);

  return (
    /*
     * Deliberately NOT a scroll container. Making it one meant that clicking Next — a
     * child of this header — let the browser scroll the focused button into view, which
     * dragged the wordmark off the left edge. Low-priority items hide at narrow widths
     * instead.
     */
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-1)] px-3 [&>*]:shrink-0">
      {/* identity */}
      <div className="flex items-center gap-2.5 pr-1">
        <div
          className="grid h-8 w-8 place-items-center rounded-[10px] border border-[var(--border-strong)]"
          style={{ background: 'color-mix(in oklab, var(--mode-user) 14%, transparent)' }}
        >
          <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="var(--mode-user)" strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2 3 14h7l-1 8 11-13h-7l0-7z" />
          </svg>
        </div>
        <div className="hidden text-[13px] font-semibold tracking-tight text-[var(--text-1)] md:block">
          Packet Odyssey
        </div>
      </div>

      <div className="h-6 w-px bg-[var(--border)]" />

      {/* transport */}
      <div className="flex items-center gap-1">
        <CtlButton label="Restart (Shift+R)" onClick={() => useSimStore.getState().restart()}>
          <Icon path={ICONS.restart} />
        </CtlButton>
        <CtlButton label="Previous step (←)" onClick={() => useSimStore.getState().prev()}>
          <Icon path={ICONS.prev} />
        </CtlButton>
        <CtlButton
          label={playing ? 'Pause (Space)' : 'Play (Space)'}
          primary
          onClick={() => useSimStore.getState().togglePlay()}
        >
          <Icon path={playing ? ICONS.pause : ICONS.play} filled={!playing} />
        </CtlButton>
        <CtlButton label="Next step (→)" onClick={() => useSimStore.getState().next()}>
          <Icon path={ICONS.next} />
        </CtlButton>
        <CtlButton label="Replay this step (r)" onClick={() => useSimStore.getState().replayStep()}>
          <Icon path={ICONS.replay} />
        </CtlButton>
      </div>

      <div className="h-6 w-px bg-[var(--border)]" />

      {/* speed — hidden on phones; auto pace is fine there */}
      <label className="hidden items-center gap-1.5 sm:flex">
        <span className="sr-only">Playback speed</span>
        <select
          value={speed}
          onChange={(e) => useSimStore.getState().setSpeed(Number(e.target.value))}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-1)] outline-none hover:border-[var(--border-strong)]"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      {/* how the journey is drawn */}
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
        {(['story', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => useSimStore.getState().setView(v)}
            aria-pressed={view === v}
            className="rounded-md px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider transition-colors"
            style={{
              background: view === v ? 'var(--user-fill)' : 'transparent',
              color: view === v ? 'var(--user-ink)' : 'var(--text-3)',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* toggles — hidden on phones to keep the bar to its essentials */}
      <div className="hidden items-center gap-1 md:flex">
        <Toggle label="Auto" title="Auto-advance after each step" on={autoplay} onChange={(v) => useSimStore.getState().setAutoplay(v)} />
        <Toggle label="Quiz" title="Pause on quiz steps until answered" on={quizMode} onChange={(v) => useSimStore.getState().setQuizMode(v)} />
        <Toggle label="Prod" title="Retell the story on a real production stack" on={prodMode} onChange={() => useSimStore.getState().toggleProdMode()} />
      </div>

      {/* Chaos exit lives on the canvas banner (components/overlays/ChaosMenu), which
          names the scenario in full — a second chip here was redundant. */}
      <div className="ml-auto flex items-center gap-2">
        <CtlButton label='Failure injection ("What if?")' onClick={() => useSimStore.getState().setChaosMenuOpen(true)}>
          <Icon path={ICONS.chaos} />
        </CtlButton>
        <CtlButton label="Search (/)" onClick={() => useSimStore.getState().setSearchOpen(true)}>
          <Icon path={ICONS.search} />
        </CtlButton>
        <CtlButton label="Keyboard shortcuts (?)" onClick={() => useSimStore.getState().setHelpOpen(true)}>
          <Icon path={ICONS.help} />
        </CtlButton>
        <ThemeToggle />

        {/* step meter */}
        <div className="hidden items-center gap-2 pl-1 md:flex">
          {step ? (
            <span
              className="rounded-md px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color: modeColor(step.mode),
                background: `color-mix(in oklab, ${modeColor(step.mode)} 12%, transparent)`,
              }}
            >
              {MODE_LABEL[step.mode]}
            </span>
          ) : null}
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-3)]">
            {chapter ? `ch ${chapter.n} · ` : ''}
            {total ? stepIndex + 1 : 0}/{total}
          </span>
        </div>
      </div>
    </header>
  );
}

function Toggle({
  label,
  title,
  on,
  onChange,
}: {
  label: string;
  title: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="flex h-8 items-center gap-1.5 rounded-lg border px-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider transition-colors duration-150"
      style={{
        borderColor: on ? 'color-mix(in oklab, var(--mode-user) 45%, transparent)' : 'var(--border)',
        background: on ? 'color-mix(in oklab, var(--mode-user) 12%, transparent)' : 'transparent',
        color: on ? 'var(--mode-user)' : 'var(--text-3)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? 'var(--mode-user)' : 'var(--text-3)' }}
      />
      {label}
    </button>
  );
}
