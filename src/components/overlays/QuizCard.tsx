'use client';

import { useEffect, useState } from 'react';
import { useCurrentStep } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import {
  MONO,
  cx,
  gateScrimStyle,
  glassStyle,
  shieldGlobalKeys,
} from '@/components/overlays/overlayKit';

interface Result {
  choice: number;
  correct: boolean;
}

/**
 * The quiz gate. It blocks *forward playback* only — `jumpTo` records a skipped answer
 * in the store, so the learner is never stuck. A wrong answer explains and lets you
 * retry or move on; a right answer confirms, explains, and offers to continue.
 */
export function QuizCard() {
  const status = useSimStore((s) => s.status);
  const step = useCurrentStep();
  const quiz = step?.quiz ?? null;
  const stepId = step?.id ?? '';

  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(false);

  // Every step owns its own quiz state.
  useEffect(() => {
    setSelected(null);
    setResult(null);
    setAttempts(0);
    setDismissed(false);
  }, [stepId]);

  // The store flips status to 'paused' the moment a correct answer lands, so visibility
  // also keys off the local result — otherwise the confirmation would never be seen.
  const open = quiz !== null && !dismissed && (status === 'awaiting-quiz' || result !== null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open || !quiz) return null;

  const submit = (): void => {
    if (selected === null) return;
    const correct = selected === quiz.answer;
    useSimStore.getState().answerQuiz(stepId, selected);
    setResult({ choice: selected, correct });
    if (!correct) setAttempts((a) => a + 1);
  };

  const retry = (): void => {
    setResult(null);
    setSelected(null);
  };

  const advance = (): void => {
    setDismissed(true);
    useSimStore.getState().next();
  };

  const correct = result?.correct === true;
  const wrong = result?.correct === false;
  const accent = correct ? 'var(--ok)' : wrong ? 'var(--err)' : 'var(--mode-user)';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-6">
      <style>{`
@keyframes vsa-quiz-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}
`}</style>
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity"
        style={{ ...gateScrimStyle, opacity: shown ? 1 : 0, transitionDuration: 'var(--t-ui)' }}
      />

      <div
        // Remounting on each wrong attempt restarts the shake animation.
        key={`attempt-${attempts}`}
        className="pointer-events-auto relative w-full max-w-[40rem]"
        style={wrong ? { animation: 'vsa-quiz-shake 420ms cubic-bezier(.36,.07,.19,.97)' } : undefined}
      >
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="vsa-quiz-question"
          onKeyDown={shieldGlobalKeys}
          className="rounded-[var(--r-lg)] border p-5 transition-all"
          style={{
            ...glassStyle,
            borderColor: `color-mix(in oklab, ${accent} 42%, transparent)`,
            boxShadow: `0 24px 70px -34px ${accent}, var(--glass-shadow)`,
            opacity: shown ? 1 : 0,
            transform: shown ? 'none' : 'translateY(8px) scale(.985)',
            transitionDuration: 'var(--t-ui)',
          }}
        >
          <fieldset disabled={correct}>
            <legend className="w-full">
              <span
                className={cx(MONO, 'block text-[10px] font-semibold uppercase tracking-[0.14em]')}
                style={{ color: accent }}
              >
                checkpoint
              </span>
              <span
                id="vsa-quiz-question"
                className="mt-2 block text-[17px] font-semibold leading-snug tracking-tight text-[var(--text-1)]"
              >
                {quiz.q}
              </span>
            </legend>

            <div className="mt-4 grid gap-2">
              {quiz.options.map((option, i) => {
                const isAnswer = i === quiz.answer;
                const picked = result ? result.choice === i : selected === i;
                const reveal = result !== null && (isAnswer || result.choice === i);
                const tone = !reveal
                  ? null
                  : isAnswer
                    ? 'var(--ok)'
                    : 'var(--err)';
                return (
                  <label key={`${i}-${option}`} className="block cursor-pointer">
                    <input
                      type="radio"
                      name={`vsa-quiz-${stepId}`}
                      className="peer sr-only"
                      checked={picked}
                      onChange={() => setSelected(i)}
                    />
                    <span
                      className="flex items-start gap-3 rounded-[var(--r-md)] border p-3 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--mode-user)]"
                      style={{
                        borderColor: tone
                          ? `color-mix(in oklab, ${tone} 55%, transparent)`
                          : picked
                            ? 'var(--border-strong)'
                            : 'var(--border)',
                        background: tone
                          ? `color-mix(in oklab, ${tone} 12%, transparent)`
                          : picked
                            ? 'var(--surface-2)'
                            : 'var(--surface)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          MONO,
                          'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px] font-semibold',
                        )}
                        style={{
                          borderColor: tone ?? 'var(--border)',
                          color: tone ?? 'var(--text-3)',
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-[13.5px] leading-relaxed text-[var(--text-1)]">
                        {option}
                      </span>
                      {reveal ? (
                        <span
                          className={cx(MONO, 'ml-auto shrink-0 text-[10px] uppercase tracking-wider')}
                          style={{ color: tone ?? 'var(--text-3)' }}
                        >
                          {isAnswer ? 'correct' : 'your pick'}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {result ? (
            <p
              className="mt-4 rounded-[var(--r-md)] border p-3 text-[13px] leading-relaxed text-[var(--text-2)]"
              style={{
                borderColor: `color-mix(in oklab, ${accent} 35%, transparent)`,
                background: `color-mix(in oklab, ${accent} 8%, transparent)`,
              }}
            >
              <span
                className={cx(MONO, 'mr-2 text-[11px] font-semibold uppercase tracking-wider')}
                style={{ color: accent }}
              >
                {correct ? '✓ correct' : '✕ not quite'}
              </span>
              {quiz.explain}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {result === null ? (
              <button
                type="button"
                onClick={submit}
                disabled={selected === null}
                className={cx(
                  MONO,
                  'h-9 rounded-[10px] border px-3.5 text-[12px] font-semibold uppercase tracking-wider transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
                )}
                style={{
                  borderColor: 'color-mix(in oklab, var(--mode-user) 45%, transparent)',
                  background: 'color-mix(in oklab, var(--mode-user) 14%, transparent)',
                  color: 'var(--mode-user)',
                }}
              >
                check answer
              </button>
            ) : correct ? (
              <button
                type="button"
                onClick={advance}
                className={cx(
                  MONO,
                  'h-9 rounded-[10px] border px-3.5 text-[12px] font-semibold uppercase tracking-wider transition-colors duration-150',
                )}
                style={{
                  borderColor: 'color-mix(in oklab, var(--ok) 50%, transparent)',
                  background: 'color-mix(in oklab, var(--ok) 14%, transparent)',
                  color: 'var(--ok)',
                }}
              >
                continue →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={retry}
                  className={cx(
                    MONO,
                    'h-9 rounded-[10px] border px-3.5 text-[12px] font-semibold uppercase tracking-wider transition-colors duration-150',
                  )}
                  style={{
                    borderColor: 'color-mix(in oklab, var(--err) 45%, transparent)',
                    background: 'color-mix(in oklab, var(--err) 12%, transparent)',
                    color: 'var(--err)',
                  }}
                >
                  try again
                </button>
                <button
                  type="button"
                  onClick={advance}
                  className={cx(
                    MONO,
                    'h-9 rounded-[10px] border border-[var(--border)] px-3.5 text-[12px] uppercase tracking-wider text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
                  )}
                >
                  continue anyway
                </button>
              </>
            )}
            <span className={cx(MONO, 'ml-auto text-[10px] text-[var(--text-3)]')}>
              quiz gate — jumping is never blocked
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
