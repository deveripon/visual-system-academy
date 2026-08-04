# Inbox — cross-task requests and conflicts

Append-only. If you need something outside your task's OWNS list — a contract change, a
new dependency, a token, a change to a file another task owns — write it here instead of
doing it. The integrator resolves these.

Format:

```text
## <date> · <task-id> · <machine/agent>
**Need:** …
**Why:** …
**Workaround used meanwhile:** …
```

---

## 2026-08-04 · session · integrator

**Note:** Content authoring produced `data-steps-a.js` (chapters 1–8, 60 steps) as one
file rather than the a1/a2 split originally sketched. Contract C8 updated to match.
Chaos `entryAfter` ids are normalised by `CHAOS_ENTRY_REMAP` in
`scripts/convert-content.mjs` (contract C10) so content agents cannot break integration.
`data-components.js` contains a stray placeholder key `MOREMARKER1` left by an
interrupted authoring run — the converter strips any key not in the `NodeId` union.
