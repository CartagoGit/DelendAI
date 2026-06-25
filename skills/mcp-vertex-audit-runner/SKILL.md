---
name: mcp-vertex-audit-runner
appliesTo: ['@mcp-vertex/audit']
description: The tool-level workflow for running and consolidating an mcp-vertex audit (audit_plan -> fresh session -> save .md -> audit_consolidate), the 5-band/9-dimension rubric, and the ready-vs-done lifecycle decision. For the exhaustive code-reading methodology itself, see the mcp-vertex-audit-playbook skill instead — this one is the surface contract, not the reading checklist.
---

# mcp-vertex audit runner

## Decision tree

1. Plugin not loaded? -> `audit` is **not** in any default preset, including
   `swarm` — load it explicitly with `--preset=full` or `--plugins=audit`
   (or add it to whichever preset you assembled).
2. Starting an audit? -> `audit_plan { scope? }`, copy the returned
   `markdown` brief verbatim.
3. Paste the brief into a FRESH model session (different model/run from the
   one orchestrating) — the brief is the contract that keeps multiple
   reviewers' outputs comparable.
4. Save that session's output as a `.md` following the exact filename rule
   (below) under `docs/mcp-vertex/proposals/in-progress/` (or wherever the brief says).
5. Have 2+ reports? -> `audit_consolidate { auditDir?, topActions? }` to
   dedupe findings by title+file and average per-dimension scores.
6. Closing the audit -> internal slices exist? `ready/` with `status: ready`.
   No internal slices (everything deferred)? `done/audits/` with
   `status: done`, referencing the proposals it spawned.

## Workflow

```
audit_plan { scope: "plugins" }
  -> { scope, markdown, dimensions }       # paste markdown into a fresh session
# fresh session produces the audit report
# save it as a .md with the canonical filename (see below)
audit_consolidate { auditDir: "docs/mcp-vertex/proposals/done/audits", topActions: 5 }
  -> { auditsFound, skipped, consensus, findings, topActions, markdown }
```

`audit_plan` is pure (no I/O) — same scope always returns the same brief.
`audit_consolidate` reads every `*.md` (except `README.md`) under `auditDir`
(default `docs/mcp-vertex/proposals/done/audits`), parses each as an audit document, and
deduplicates findings across reviewers via `seenBy`.

## Filename convention (AGENTS.md rule)

```
{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md
```

Example: `a00024-21-06-2026-copilot-minimax-m3-estudio-ahorro-tokens.md`.
`numAuditoria` is the 5-digit padded audit id (f00014 rule); `controladorModelo`
is the client/runner driving the model (`claude-code`, `copilot`, `antigravity`,
`codex`); `modelo` is the model itself.

## Rubric: 5 score bands, 9 dimensions

Per-finding severity bands (`docs/scaffolds/ARCHITECTURE-AUDITS.md` +
`plugins/audit/src/lib/brief.ts`):

| Band | Emoji | Meaning |
|---|---|---|
| FATAL | 🔴 | critical error / silent bug / security hole — must fix |
| MUY MAL | 🟠 | serious problem degrading quality |
| MEJORABLE | 🟡 | detail worth improving |
| OK | 🟢 | above expectations |
| MUY BIEN | 🌟 | excellent execution |
| PERFECTO | 💎 | reference quality |

Final scoring table — 9 dimensions, score 0–10 each (`SCORE_DIMENSIONS` in
`brief.ts`, also the canonical default `dimensions` in `audit_plan`'s output):

```
Arquitectura
Contratos e interfaces
Eficiencia de tokens
Anti-deadlock / concurrencia
Calidad de código fuente
Documentación
Tests (estructura, cobertura, calidad)
Seguridad operacional
Genericidad (project-agnostic)
```

Do not invent your own dimension list — `audit_plan`'s output already gives
you the exact set to fill in.

## Lifecycle: ready vs done/audits

- **Has internal slices/tasks** (fixes resolvable within the audit's own
  scope) -> create the proposal under `docs/mcp-vertex/proposals/ready/` with
  `status: ready`, slices `pending`.
- **No internal tasks** (every finding deferred to a separate proposal, or
  no findings) -> create directly under `docs/mcp-vertex/proposals/done/audits/` with
  `status: done`, and link the deferred proposals in `## Findings`'
  Resolution Track column.

## Never do

- Never run an audit assuming `audit` ships in `--preset=swarm` — it
  explicitly does not (`swarm` is multi-agent coordination; `audit` is
  `hostOnly` under `full`). Load it deliberately.
- Never skip the fresh-session step — running `audit_plan` and writing the
  report from the SAME orchestrating session defeats the brief's purpose
  (independent reviewer signal).
- Never invent ad hoc severity bands or dimensions — use the 6-band table
  and the 9-dimension list verbatim so `audit_consolidate` can dedupe across
  reviewers.
- Never close an audit with unresolved internal slices as `done` — that
  belongs in `ready/` until the slices finish.

## Smoke

```
audit_plan { scope: "tokens" }
```
Returns `{ scope: "tokens", markdown: "...", dimensions: [...9 items...] }`.
Then drop ≥1 saved report under `docs/mcp-vertex/proposals/done/audits/` and call
`audit_consolidate {}` — it must return `auditsFound >= 1` and a non-empty
`markdown`.
