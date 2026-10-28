---
name: delendai-audit-runner
appliesTo: ['@delendai/audit']
tools: ['delendai_audit_audit_close']
description: The tool-level workflow for running and consolidating an delendai audit (audit_plan -> fresh session -> save .md -> audit_consolidate), the 5-band/9-dimension rubric, and the ready-vs-done lifecycle decision. For the exhaustive code-reading methodology itself, see the delendai-audit-playbook skill instead — this one is the surface contract, not the reading checklist.
---

# delendai audit runner

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
   (below) under `docs/delendai/proposals/in-progress/` (or wherever the brief says).
4b. Reviewers: claim a seat with `audit_close { action: "claim-seat", reviewer, seat }`
   (a held seat is refused) and commit your own report with
   `audit_close { action: "commit-phase-a", reviewer, file }`; then
   `audit_consolidate { reviewer }` may read the others'. Close the audit with
   `audit_close { action: "close", threshold? }`.
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
audit_consolidate { auditDir: "docs/delendai/proposals/done/audits", topActions: 5 }
  -> { auditsFound, skipped, consensus, findings, topActions, markdown }
```

`audit_plan` is pure (no I/O) — same scope always returns the same brief.
`audit_consolidate` reads every `*.md` (except `README.md`) under `auditDir`
(default `docs/delendai/proposals/done/audits`), parses each as an audit document, and
deduplicates findings across reviewers via `seenBy`.

## Filename convention (AGENTS.md rule)

Use the filename emitted by `audit_plan`; do not invent a second naming
scheme. For the code-reading checklist, use
[delendai-audit-playbook](../delendai-audit-playbook/SKILL.md).
