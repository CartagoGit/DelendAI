---
id: q00049
title: "Every failure anywhere is recorded, moved to the earliest stage that can catch it, fixed generically for every project, and measured to zero"
kind: plan
status: ready
type: proposal
track: general
date: 2026-11-18
---

# q00049 — Every failure anywhere is recorded, moved to the earliest stage that can catch it, fixed generically for every project, and measured to zero

## goal

Every failing gate, hook, CI job, land verdict, tool error and deliver refusal lands in one failure ledger; each failure class declares the earliest stage able to catch it, a late catch is a named finding, a recurring signature opens one fix proposal in code, a fix must be a generic policy feature or gate any project gets, agents learn the top classes from generated hints at no extra tokens, and kpis reports failures per delivered slice trending to zero until a class retires its redundant late gate.

## why

Owner, 2026-11-18: a failure must never be fixed only where it happened. Dogfooding exists to make the product work stably in other projects, yet today p90 PR open-to-merge is about 3 h on checks knowable in seconds, x01097 needed 4 rounds, and fixes stayed local to this repo. This applies to everything, not only PRs: gates, hooks, CI zones, land, MCP and tool errors, CLI, plugins, flaky tests, revalidate left-outs and worker rework. Notes: reuses f00820 (packages/core/src/lib/observability/tool-failure-class.helper.ts and its tool.failed events, `delendai kpis --failures` in packages/cli/src/commands/kpis*.ts), the error-reporting plugin signature and de-duplication (plugins/error-reporting/src/lib/signature.helper.ts, stable-index.helper.ts), q00046 S7 weekly kpis (tools/scripts/ci/pr-ci-cost.script.ts), x01098 workflow defects, and DependsOn proposal f00823 (a delivery fails in seconds on what the proof would refuse; branch delendai/wip/claude-sonnet-5-5/create/f00823-all-g2/deliver-fails-fast, not yet on develop) whose pre-check is the first shift-left stage this plan maps. Slices touching plugins/proposals/src/lib/proposals/proposal-readiness.ts and packages/cli/src/lib/work-deliver.service.ts or packages/cli/src/commands/kpis*.ts overlap files of f00823 and must land after it.

## non-goals

- Sending failure data off the machine; the ledger is local plus a CI artifact and stores no argument values or free text beyond the redacted bounded signature.
- Changing what any gate accepts or refuses; this only records, classifies, routes and measures.
- An agent deciding when a failure becomes a proposal; that is code over a policy threshold.
- Replacing the error-reporting plugin; it stays the external, de-duplicated issue channel.

## slices

- global_gate: lint

### S1 — One failure ledger for every stage
- **Status**: pending
- **Files**: `new:packages/core/src/lib/observability/failure-ledger.service.ts`, `new:packages/core/tests/src/lib/observability/failure-ledger.service.spec.ts`, `new:packages/core/src/lib/contracts/interfaces/failure-ledger.interface.ts`, `packages/core/src/lib/observability/tool-failure-class.helper.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `tools/scripts/hooks/commit-time-checks.script.ts`, `packages/cli/src/lib/work-deliver.service.ts`
- **Gate**: lint
- **Decisions**: The ledger is an append-only JSONL under the project cache (.cache/delendai/failures/ledger.jsonl) with one record {stage, class, signature, files, unit, minutesLost, at}; CI uploads the same file as a job artifact and kpis merges downloaded artifacts by signature+at, no database. Classes are f00820's existing failure classes plus gate, hook, ci-job, land and deliver-refusal; signature reuses the redacted bounded code of tool-failure-class.helper.ts, never raw arguments. Writing is best-effort and never changes the failing command's exit code.
- acceptance:
  - "packages/core/tests/src/lib/observability/failure-ledger.service.spec.ts: a tool error, a failing hook, a deliver refusal, a CI job and a land verdict each append one record with stage, class, signature, files, unit and minutes lost, and a write failure does not change the caller's result"
  - "packages/core/tests/src/lib/observability/failure-ledger.service.spec.ts: a secret-looking argument value never reaches a record"

### S2 — Shift-left map and late-catch findings
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:packages/core/src/lib/observability/failure-earliest-stage.helper.ts`, `new:packages/core/tests/src/lib/observability/failure-earliest-stage.helper.spec.ts`, `new:packages/cli/src/commands/kpis-late-catches.ts`, `new:packages/cli/src/commands/kpis-late-catches.spec.ts`, `packages/cli/src/commands/kpis-options.ts`, `packages/cli/src/commands/kpis-renderer.ts`, `packages/cli/src/commands/kpis.command.ts`, `packages/cli/src/commands/kpis.command.spec.ts`
- **Gate**: lint
- **Decisions**: The stage order is edit hook, commit hook, deliver pre-check, proof, CI, land, post-merge; each class maps to its earliest stage in one table in failure-earliest-stage.helper.ts, defaulting to the stage it was first seen when unmapped. A record whose stage is later than its class's earliest is a late catch; kpis lists them by class with count and minutes lost via the new `--late-catches` flag.
- acceptance:
  - "packages/core/tests/src/lib/observability/failure-earliest-stage.helper.spec.ts: a file-size breach recorded at CI is a late catch against commit hook and the same breach recorded at the commit hook is not"
  - "packages/cli/src/commands/kpis-late-catches.spec.ts: a fixture ledger with three late and two on-time records lists the three grouped by class with minutes lost"
  - "delendai kpis --late-catches in this repository exits 0 and prints the late-catches section"

### S3 — Recurrence opens a fix proposal in code
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:plugins/proposals/src/lib/proposals/failure-fix-proposal.service.ts`, `new:plugins/proposals/tests/src/lib/proposals/failure-fix-proposal.service.spec.ts`, `plugins/proposals/src/lib/contracts/constants/proposals-options-schema.constant.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: lint
- **Decisions**: A signature seen at least N times (policy proposals.failureRecurrenceThreshold, default 2) across at least two distinct units drafts one fix proposal through the existing create path, with the incident records attached as a bounded list in the why; a signature that already has an open fix proposal extends that one instead of creating another, matched by the signature recorded in its front matter. No agent decision is involved and the draft is created, not made ready.
- acceptance:
  - "plugins/proposals/tests/src/lib/proposals/failure-fix-proposal.service.spec.ts: over a fake ledger, a signature seen twice in two units drafts exactly one proposal with both incidents attached, and a third sighting extends it instead of drafting another"
  - "plugins/proposals/tests/src/lib/proposals/failure-fix-proposal.service.spec.ts: a signature seen twice in one unit drafts nothing"

### S4 — Ledger fixes must be generic
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `new:plugins/proposals/src/lib/proposals/proposal-readiness-generic.ts`, `new:plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts`, `plugins/proposals/src/lib/proposals/proposal-readiness.ts`
- **Gate**: lint
- **Decisions**: Readiness refuses a proposal carrying a failure signature unless its prevention names a policy feature or gate shipped under packages/ plugins/ or tools/scripts/lint and its Files contain no path or name specific to this repository (a project-specific workflow file, a proposal id, a repo name); the rule applies only to proposals born from the ledger, so no other proposal is affected and no baseline is widened.
- acceptance:
  - "plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts: a ledger-born proposal whose Files name a repo-specific workflow is refused naming the path, and one whose prevention is a lint gate under tools/scripts/lint is ready"
  - "bun run lint:proposal-readiness exits 0 on the current tree"

### S5 — Agents learn the top classes without extra tokens
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/catalog/render-host-hints.script.ts`, `tools/scripts/catalog/render-host-hints.spec.ts`, `tools/scripts/lint/system-prompt-size.script.ts`, `tools/scripts/lint/system-prompt-size.script.spec.ts`, `new:tools/scripts/catalog/failure-hints.helper.ts`, `new:tools/scripts/catalog/failure-hints.helper.spec.ts`
- **Gate**: lint
- **Decisions**: The generated host hints gain a bounded section (at most 5 classes, 400 bytes) listing the current top classes by minutes lost with their one-line prevention, read only from the ledger so a hand-written gotcha is deleted when its class appears there; the existing system-prompt-size lint enforces the bootstrap and hint budgets, no new lint script is added.
- acceptance:
  - "tools/scripts/catalog/failure-hints.helper.spec.ts: a ledger with seven classes renders the five costliest within 400 bytes and an empty ledger renders nothing"
  - "tools/scripts/lint/system-prompt-size.script.spec.ts: a hints section over the byte budget fails the lint"
  - "bun run lint:system-prompt-size exits 0 on the current tree"

### S6 — Trend to zero and retirement of redundant late gates
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `new:packages/cli/src/commands/kpis-failure-trend.ts`, `new:packages/cli/src/commands/kpis-failure-trend.spec.ts`, `new:packages/core/src/lib/observability/failure-gate-retirement.helper.ts`, `new:packages/core/tests/src/lib/observability/failure-gate-retirement.helper.spec.ts`, `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.script.spec.ts`
- **Gate**: lint
- **Decisions**: kpis reports per ISO week failures per delivered slice and minutes and tokens lost per class; the weekly pr-ci-cost report adds the same totals so the q00046 S7 view is the one place read. A class with zero occurrences for M weeks (policy, default 4) is listed as retirable for its late gate only when an earlier stage still catches it; the report names it and never deletes a gate itself.
- acceptance:
  - "packages/cli/src/commands/kpis-failure-trend.spec.ts: a three-week fixture reports failures per delivered slice, minutes lost per class and the week-over-week delta"
  - "packages/core/tests/src/lib/observability/failure-gate-retirement.helper.spec.ts: a class silent for four weeks whose earlier stage still catches it is listed retirable and one whose earliest stage is the late gate is not"
  - "delendai kpis --failures in this repository exits 0 and prints the weekly trend"

## acceptance

- packages/core/tests/src/lib/observability/failure-ledger.service.spec.ts: a tool error, a failing hook, a deliver refusal, a CI job and a land verdict each append one record with stage, class, signature, files, unit and minutes lost, and a write failure does not change the caller's result
- packages/core/tests/src/lib/observability/failure-ledger.service.spec.ts: a secret-looking argument value never reaches a record
- packages/core/tests/src/lib/observability/failure-earliest-stage.helper.spec.ts: a file-size breach recorded at CI is a late catch against commit hook and the same breach recorded at the commit hook is not
- packages/cli/src/commands/kpis-late-catches.spec.ts: a fixture ledger with three late and two on-time records lists the three grouped by class with minutes lost
- delendai kpis --late-catches in this repository exits 0 and prints the late-catches section
- plugins/proposals/tests/src/lib/proposals/failure-fix-proposal.service.spec.ts: over a fake ledger, a signature seen twice in two units drafts exactly one proposal with both incidents attached, and a third sighting extends it instead of drafting another
- plugins/proposals/tests/src/lib/proposals/failure-fix-proposal.service.spec.ts: a signature seen twice in one unit drafts nothing
- plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts: a ledger-born proposal whose Files name a repo-specific workflow is refused naming the path, and one whose prevention is a lint gate under tools/scripts/lint is ready
- bun run lint:proposal-readiness exits 0 on the current tree
- tools/scripts/catalog/failure-hints.helper.spec.ts: a ledger with seven classes renders the five costliest within 400 bytes and an empty ledger renders nothing
- tools/scripts/lint/system-prompt-size.script.spec.ts: a hints section over the byte budget fails the lint
- bun run lint:system-prompt-size exits 0 on the current tree
- packages/cli/src/commands/kpis-failure-trend.spec.ts: a three-week fixture reports failures per delivered slice, minutes lost per class and the week-over-week delta
- packages/core/tests/src/lib/observability/failure-gate-retirement.helper.spec.ts: a class silent for four weeks whose earlier stage still catches it is listed retirable and one whose earliest stage is the late gate is not
- delendai kpis --failures in this repository exits 0 and prints the weekly trend
