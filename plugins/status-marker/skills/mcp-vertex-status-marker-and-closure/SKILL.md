---
name: mcp-vertex-status-marker-and-closure
appliesTo: ['@mcp-vertex/status-marker']
description: The 8 canonical close-marker states an agent response must end with, which ones require a reason, and the exact tools (status_marker_close / status_marker_validate) that generate and audit the line so you never hand-format it. Use at the end of every response when the status-marker plugin is loaded.
---

# mcp-vertex status marker + closure

## Decision tree

1. Finishing a response? -> pick the state below, then call
   `<prefix>_close { state, reason? }` — never hand-type the emoji/format.
2. State requires a reason (5 of 8 do)? -> pass `reason`; omitting it inserts
   the literal `<reason-missing>` so the violation is grep-able, it does not
   silently pass.
3. Paste the returned `line` as the LITERAL LAST LINE of your response —
   nothing after it, not even whitespace-then-text.
4. Unsure if a draft response is compliant before sending? ->
   `<prefix>_validate { text: <full draft> }` and check `ok`.

(`<prefix>` is the plugin's namespace prefix, e.g. `status_marker` —
confirm via `mcp-vertex_overview`.)

## The 8 canonical states

| State | Emoji | Reason | Meaning |
|---|---|---|---|
| `HECHO` | 🟩 | optional | proposal closed and reviewed |
| `CAP` | 🟨 | **mandatory** | turn exhausted; checkpoint + relauncher left behind |
| `RE-PIVOT` | 🟧 | **mandatory** | the cascade changed direction |
| `CHECKPOINT-REQUIRED` | 🟦 | **mandatory** | handoff to the orchestrator |
| `REPAIR-NEEDED` | 🟫 | **mandatory** | the verifier requested a repair |
| `BLOQUEADO` | 🟥 | **mandatory** | hard blocker; needs human intervention |
| `SIN PROPUESTAS LIBRES` | 🟪 | optional | catalog has work, but everything is claimed |
| `SIN PROPUESTA DE NINGUN TIPO` | ⬜ | optional | catalog has nothing executable at all |

Source of truth: `MARKERS` in `plugins/status-marker/src/lib/markers.ts`.

## Format rules

- Separator before the reason: ` — ` (em-dash, space on both sides),
  `CLOSE_SEPARATOR` in `markers.ts`.
- Full line, including emoji and reason, must be ≤120 chars (`MAX_LINE_LEN`);
  the formatter truncates and appends `…` if it would overflow.
- Use the helper, never hand-format: `formatCloseMarker(state, reason?)`
  (importable from `@mcp-vertex/status-marker/public`) is what
  `<prefix>_close` calls internally — same output either way.
- The marker must be the response's literal last line: no inline trailing
  text after it, no prose on subsequent lines. Prose BEFORE the marker is
  fine.

## Generating the line: `<prefix>_close`

```
<prefix>_close { state: "BLOQUEADO", reason: "missing credentials for X" }
-> { ok: true, state: "BLOQUEADO", reason: "...", line: "🟥 [BLOQUEADO] — missing credentials for X" }
```

Paste `line` verbatim. Never assemble the emoji/brackets/separator yourself —
that is exactly the class of formatting bug `formatCloseMarker` exists to
prevent.

## Auditing a draft: `<prefix>_validate`

```
<prefix>_validate { text: <entire draft response> }
```

Returns `{ ok: true, state, line }` on success, or
`{ ok: false, violation | violations: [...] , line? }` on failure. Violations
include `missing`, `bad-format`, `reason-missing`, `placeholder-reason`,
`too-long`. Run this on your draft before sending if you are unsure the last
line is compliant — cheaper than a human catching it after the fact.

## Never do

- Never hand-format the close-marker line — always go through
  `<prefix>_close` or `formatCloseMarker`.
- Never omit the reason for `CAP`, `RE-PIVOT`, `CHECKPOINT-REQUIRED`,
  `REPAIR-NEEDED`, `BLOQUEADO` — the helper will insert
  `<reason-missing>` rather than silently accept it.
- Never add prose after the marker line — even trailing whitespace followed
  by text fails `<prefix>_validate`.
- Never invent a 9th state — the table above is closed
  (`CLOSE_MARKER_STATES`).

## Smoke

```
<prefix>_close { state: "HECHO" }
```
Must return `{ ok: true, state: "HECHO", line: "🟩 [HECHO]" }` (no reason
required, no `<reason-missing>` token). Then
`<prefix>_validate { text: "...\n🟩 [HECHO]" }` must return `{ ok: true }`.
