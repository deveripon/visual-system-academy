'use client';

import { Highlight, Prism, type PrismTheme } from 'prism-react-renderer';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CodePane as CodePaneData } from '@/data/types';

/**
 * prism-react-renderer bundles a fixed subset of Prism grammars. `c`, `cpp`, `sql`,
 * `javascript` and `jsx` are present; `bash` is NOT — and roughly half of the lesson's
 * shell panes are terminal transcripts, so leaving them unhighlighted loses the single
 * most useful signal (where the command ends and its output begins).
 *
 * Rather than add a dependency, we register a deliberately conservative shell grammar.
 * It only marks a word as a command when it directly follows a `$` prompt or a pipe /
 * separator, because a third of the `bash` panes are ASCII diagrams and a greedy
 * "first word on the line" rule paints those into confetti.
 */
const SHELL_GRAMMAR = {
  comment: { pattern: /(^[ \t]*)#.*/m, lookbehind: true, greedy: true },
  string: [
    { pattern: /"(?:[^"\\\n]|\\.)*"/, greedy: true },
    { pattern: /'(?:[^'\\\n]|\\.)*'/, greedy: true },
  ],
  function: {
    pattern:
      /(^[ \t]*\$[ \t]+|[|;&][ \t]*)(?:(?:sudo|doas|watch|time|xargs)[ \t]+)*[a-z][\w./-]*/m,
    lookbehind: true,
  },
  prompt: { pattern: /^[ \t]*\$(?=[ \t])/m, alias: 'punctuation' },
  property: { pattern: /(^|[ \t])--?[A-Za-z][\w-]*/, lookbehind: true },
  variable: /\$(?:\{[^}]*\}|\w+)/,
};

/** Prism's own typings are not installed (it is a transitive dep), so narrow by hand. */
const PRISM_LANGUAGES = (Prism as unknown as { languages: Record<string, unknown> })
  .languages;

if (!PRISM_LANGUAGES.bash) {
  PRISM_LANGUAGES.bash = SHELL_GRAMMAR;
  PRISM_LANGUAGES.shell = SHELL_GRAMMAR;
}

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  c: 'c',
  cpp: 'cpp',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
};

/**
 * Resolve to a grammar Prism actually has. Missing grammars degrade to plain text —
 * `Highlight` renders unhighlighted lines when the grammar is absent, never throws.
 */
function resolveLanguage(lang: string): string {
  const target = LANG_ALIASES[lang] ?? lang;
  return PRISM_LANGUAGES[target] ? target : 'plain';
}

/** Token palette built entirely from design tokens — inline styles, so no hex leaks in. */
const INSTRUMENT_THEME: PrismTheme = {
  plain: { color: 'var(--text-1)', backgroundColor: 'transparent' },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: { color: 'var(--text-3)', fontStyle: 'italic' },
    },
    { types: ['punctuation', 'operator', 'entity', 'url'], style: { color: 'var(--text-2)' } },
    {
      types: ['property', 'tag', 'boolean', 'number', 'constant', 'symbol', 'attr-name'],
      style: { color: 'var(--mode-hw)' },
    },
    {
      types: ['string', 'char', 'attr-value', 'inserted'],
      style: { color: 'var(--mode-net)' },
    },
    { types: ['keyword', 'atrule', 'selector'], style: { color: 'var(--mode-user)' } },
    {
      types: ['function', 'class-name', 'builtin'],
      style: { color: 'var(--mode-remote)' },
    },
    {
      types: ['variable', 'regex', 'important', 'deleted'],
      style: { color: 'var(--warn)' },
    },
    { types: ['macro', 'directive'], style: { color: 'var(--mode-kernel)' } },
  ],
};

interface CopyButtonProps {
  text: string;
  /** Accessible verb, e.g. "Copy command". */
  label: string;
  className?: string;
}

/**
 * Shared by CodePane and the ExplainPanel command card. Clipboard access can be denied
 * (insecure origin, permissions policy) — in that case we simply stay silent.
 */
export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={`shrink-0 rounded-[6px] border border-line px-2 py-[3px] font-mono text-[10px] tracking-[0.06em] uppercase transition-colors duration-[var(--t-micro)] hover:border-line-strong hover:bg-surface-2 ${
        copied ? 'text-ok' : 'text-t3'
      } ${className}`}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
      className="shrink-0 text-t3 transition-transform duration-[var(--t-micro)]"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CodePaneProps {
  pane: CodePaneData;
  defaultOpen?: boolean;
}

/**
 * One collapsible source listing. Collapsed by default: a step can carry three panes and
 * the rail is for reading prose first. The highlighted body is only mounted while open,
 * so Prism never tokenises code nobody asked to see.
 */
export function CodePane({ pane, defaultOpen = false }: CodePaneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const language = resolveLanguage(pane.lang);
  const code = pane.code.replace(/\n+$/, '');

  return (
    <div className="overflow-hidden rounded-[var(--r-sm)] border border-line bg-[color-mix(in_oklab,var(--bg-0)_55%,transparent)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-[var(--t-micro)] hover:bg-surface-2"
      >
        <Caret open={open} />
        <span className="truncate font-mono text-[12px] text-t1">{pane.title}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-t3 uppercase">
          {pane.lang}
        </span>
      </button>

      <div id={bodyId} hidden={!open}>
        {open ? (
          <div className="border-t border-line">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="font-mono text-[10px] text-t3">
                {code.split('\n').length} lines
              </span>
              <CopyButton text={code} label={`Copy ${pane.title}`} />
            </div>
            <pre className="max-h-[380px] overflow-auto overscroll-contain px-2.5 pb-2.5 text-[11.5px] leading-[1.65]">
              <Highlight theme={INSTRUMENT_THEME} code={code} language={language}>
                {({ tokens, getLineProps, getTokenProps }) => (
                  <code className="block w-max min-w-full font-mono">
                    {tokens.map((line, i) => (
                      <span key={i} {...getLineProps({ line })} className="flex">
                        <span
                          aria-hidden="true"
                          className="mr-3 w-6 shrink-0 text-right text-t3 tabular-nums select-none"
                        >
                          {i + 1}
                        </span>
                        <span className="whitespace-pre">
                          {line.map((token, k) => (
                            <span key={k} {...getTokenProps({ token })} />
                          ))}
                        </span>
                      </span>
                    ))}
                  </code>
                )}
              </Highlight>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
