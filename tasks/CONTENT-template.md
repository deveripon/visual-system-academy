# CONTENT-xx — <scope> (template)

Copy this file, fill the placeholders, and add a row to `docs/TASKS.md`.
Content tasks are fully parallel and machine-independent: you touch exactly one file.

## OWNS

`content/src/<file>.js` — nothing else. Ever.

## MUST READ

`docs/AGENT_PROTOCOL.md` §5 → `docs/DATA_MODEL.md` (schema + **cast of characters**) →
`src/data/types.ts` → one existing content file for voice calibration
(`content/src/data-steps-a.js` is the reference for steps,
`content/src/data-components.js` for dossiers).

## Rules that make parallel authoring safe

- Single statement: `window.<GLOBAL> = …;` — plain ES2019, no imports, no exports, no
  functions, no trailing calls. Double-quoted strings for text containing apostrophes.
- **Never invent facts about the shared story.** IPs, MACs, ports, PIDs, hostnames, ISN,
  TTL and TXID all come from the cast of characters in `docs/DATA_MODEL.md`. If your
  chapter needs a value that is not listed, add it to `tasks/_INBOX.md` rather than
  making one up — the next chapter has to agree with you.
- Step ids: unique, kebab-case, prefixed by your chapter theme. They are permanent
  references (chaos entry points, deep links), so choose them carefully.
- `node` / `from` must be `NodeId` values. No new components.
- All ten `explain` keys, every step, no placeholders.
- Chapter numbers stay inside your assigned range and never decrease.

## Voice

Confident, precise, occasionally witty. Real function names (`tcp_v4_connect`,
`ep_poll_callback`), real files, real RFCs, real sysctls, real commands. Misconceptions
must be ones engineers actually hold. Analogies concrete and fresh. Every step teaches
something a good engineer would want to know — no filler, no restating the previous step.

## VERIFY (run before marking DONE — paste the output in your commit)

```bash
node --check content/src/<file>.js
node -e "globalThis.window={}; eval(require('fs').readFileSync('content/src/<file>.js','utf8'));
const S = window.<GLOBAL>;
const K=['what','why','component','layer','abstraction','protocol','misconception','analogy','command','production'];
const ids=new Set();
console.log('count', S.length);
console.log('dupes', S.filter(s=>ids.size===ids.add(s.id).size).map(s=>s.id).join(',')||'NONE');
console.log('badexplain', S.filter(s=>!s.explain||K.some(k=>!s.explain[k])).map(s=>s.id).join(',')||'NONE');
console.log('badchapter', S.filter(s=>s.chapter<LO||s.chapter>HI).map(s=>s.id).join(',')||'NONE');"
```

Then, if the app is present: `pnpm convert && pnpm validate`.
