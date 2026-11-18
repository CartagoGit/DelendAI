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

Every failing gate, hook, CI job, land verdict, tool error and deliver refusal becomes an observation in the existing self-learning store (activated by policy here and as an opt-in pack for every project); lessons derive the earliest stage able to catch each class and name late catches; a recurring lesson above a confidence drafts one fix proposal in code; lesson-born fixes must be generic; the top lessons are rendered into the host hints at no extra tokens; and project-kpis reports failures per delivered slice trending to zero until a class retires its redundant late gate.

## why

Owner, 2026-11-18: a failure must never be fixed only where it happened; dogfooding exists to make the product work stably in other projects. Today p90 PR open-to-merge is about 3 h on checks knowable in seconds, x01097 needed 4 rounds and fixes stayed local. This covers everything: gates, hooks, CI zones, land, MCP and tool errors, CLI, plugins, flaky tests, revalidate left-outs and worker rework. Built on what exists, no new ledger: plugins/self-learning (store/observation-store.service.ts, collectors/test-journal.service.ts, lessons/derive-lessons.helper.ts, lessons/confidence.helper.ts, tools/lessons.tool.ts, tools/observations.tool.ts), which is not yet active here; f00820 failure classes (packages/core/src/lib/observability/tool-failure-class.helper.ts, `delendai kpis --failures` in packages/cli/src/commands/kpis*.ts); plugins/project-kpis (services/kpi-trends.service.ts); plugins/error-reporting (signature.helper.ts, external de-duplicated issues, unchanged); q00046 S7 weekly kpis (tools/scripts/ci/pr-ci-cost.script.ts); x01098 workflow defects. Notes: DependsOn f00823 (a delivery fails in seconds on what the proof would refuse; branch delendai/wip/claude-sonnet-5-5/create/f00823-all-g2/deliver-fails-fast, not yet on develop): its pre-check is the deliver pre-check stage of S2, and S4 and S1 touch files it also edits (proposal-readiness.ts, work-deliver.service.ts), so they land after it.

## non-goals

- Sending failure data off the machine; observations hold no argument values or free text beyond the redacted bounded signature.
- Changing what any gate accepts or refuses; this only records, classifies, routes and measures.
- An agent deciding when a failure becomes a proposal; that is code over a confidence policy.
- A second store or ledger next to self-learning, or replacing error-reporting.

## slices

- global_gate: lint

### S0 — Activate self-learning by policy here and as an opt-in pack for every project
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`, `delendai.config.json`
- **Gate**: lint
- **Decisions**: self-learning, project-kpis and error-reporting form an opt-in learning pack added to the dogfood and team-pr presets in preset-catalog.ts (a project not choosing them is unchanged), and this repository activates it in delendai.config.json; the self-learning observations and lessons tools are reachable through the compact router once active. Nothing is enabled implicitly for other projects.
- acceptance:
  - "packages/core/tests/src/lib/plugins/preset-catalog.spec.ts: the dogfood and team-pr presets list self-learning and project-kpis and the minimal preset does not"
  - "delendai_compact_router domain=self-learning action=lessons answers ok in this repository"

### S1 — Failure collectors write observations into the self-learning store
- **Status**: pending
- **DependsOn**: [S0]
- **Files**: `plugins/self-learning/src/lib/contracts/constants/lesson.constant.ts`, `plugins/self-learning/src/lib/contracts/interfaces/observation.interface.ts`, `plugins/self-learning/src/lib/store/observation-store.service.ts`, `new:plugins/self-learning/src/lib/collectors/failure-collectors.service.ts`, `new:plugins/self-learning/tests/src/lib/collectors/failure-collectors.service.spec.ts`, `packages/core/src/lib/observability/tool-failure-class.helper.ts`, `tools/scripts/hooks/commit-time-checks.script.ts`, `packages/cli/src/lib/work-deliver.service.ts`
- **Gate**: lint
- **Decisions**: No new store: collectors follow collectors/test-journal.service.ts and append observations with appendObservations. OBSERVATION_KINDS gains gate-failure, hook-failure, ci-job-failure, land-verdict and deliver-refusal; subject is the f00820 failure class plus a redacted bounded signature from tool-failure-class.helper.ts, detail carries stage, files, unit and minutes lost, never argument values. CI uploads the store file as a job artifact and merges by subject+atMs. Writing is best-effort and never changes the failing command's exit code.
- acceptance:
  - "plugins/self-learning/tests/src/lib/collectors/failure-collectors.service.spec.ts: a failing gate, hook, CI job, land verdict, tool error and deliver refusal each append one observation carrying class, stage, files, unit and minutes lost"
  - "plugins/self-learning/tests/src/lib/collectors/failure-collectors.service.spec.ts: a secret-looking argument value never reaches an observation and a store write failure does not change the caller's result"

### S2 — Shift-left as a lesson derivation in self-learning
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/self-learning/src/lib/lessons/derive-lessons.helper.ts`, `plugins/self-learning/src/lib/contracts/interfaces/lesson.interface.ts`, `new:plugins/self-learning/src/lib/lessons/late-catch.helper.ts`, `new:plugins/self-learning/tests/src/lib/lessons/late-catch.helper.spec.ts`, `plugins/self-learning/src/lib/tools/lessons.tool.ts`, `plugins/self-learning/tests/src/lib/tools/lessons.tool.spec.ts`
- **Gate**: lint
- **Decisions**: A new lesson kind late-catch: the stage order is edit hook, commit hook, deliver pre-check, proof, CI, land, post-merge; one table maps each failure class to its earliest stage (an unmapped class defaults to the stage it was first seen). An observation seen at a later stage than its class's earliest becomes a late-catch lesson with count and minutes lost, under the existing minimumSupport and recency window. The lessons tool lists them; the stage map reuses f00823's pre-check as the deliver pre-check stage once it lands.
- acceptance:
  - "plugins/self-learning/tests/src/lib/lessons/late-catch.helper.spec.ts: a file-size breach observed at CI is a late catch against the commit hook and the same breach at the commit hook is not"
  - "plugins/self-learning/tests/src/lib/tools/lessons.tool.spec.ts: the lessons tool returns the late-catch lessons with minutes lost"
  - "delendai_compact_router domain=self-learning action=lessons lists late-catch lessons in this repository"

### S3 — Recurring lessons above a confidence open a fix proposal
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/self-learning/src/lib/lessons/confidence.helper.ts`, `new:plugins/self-learning/src/lib/lessons/fix-proposal-draft.helper.ts`, `new:plugins/self-learning/tests/src/lib/lessons/fix-proposal-draft.helper.spec.ts`, `plugins/proposals/src/lib/contracts/constants/proposals-options-schema.constant.ts`, `new:plugins/proposals/src/lib/proposals/lesson-fix-proposal.service.ts`, `new:plugins/proposals/tests/src/lib/proposals/lesson-fix-proposal.service.spec.ts`
- **Gate**: lint
- **Decisions**: A lesson whose confidence (confidence.helper.ts) reaches the policy proposals.lessonFixConfidence (default 0.7) across at least two distinct units drafts one fix proposal through the existing create_proposal path with the lesson evidence attached as a bounded list; a lesson with an open fix proposal extends that one, matched by the lesson signature recorded in its front matter. Code only, no agent decision; the draft is created, never made ready.
- acceptance:
  - "plugins/self-learning/tests/src/lib/lessons/fix-proposal-draft.helper.spec.ts: a lesson below the confidence or from one unit drafts nothing"
  - "plugins/proposals/tests/src/lib/proposals/lesson-fix-proposal.service.spec.ts: over a fake store, a qualifying lesson drafts exactly one proposal with its incidents and a later sighting extends it"

### S4 — A lesson-born fix must be generic
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `new:plugins/proposals/src/lib/proposals/proposal-readiness-generic.ts`, `new:plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts`, `plugins/proposals/src/lib/proposals/proposal-readiness.ts`
- **Gate**: lint
- **Decisions**: Readiness refuses a lesson-born proposal unless its prevention is a policy feature or gate shipped under packages, plugins or tools/scripts/lint and its Files name nothing specific to this repository (a project workflow file, a proposal id, the repository name); other proposals are untouched and no baseline is widened. Lands after f00823 S3, which edits the same readiness file.
- acceptance:
  - "plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts: a lesson-born proposal whose Files name a repo-specific workflow is refused naming the path and one whose prevention is a lint gate is ready"
  - "bun run lint:proposal-readiness exits 0 on the current tree"

### S5 — Top lessons are rendered into the generated host hints
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/catalog/render-host-hints.script.ts`, `tools/scripts/catalog/render-host-hints.spec.ts`, `tools/scripts/lint/system-prompt-size.script.ts`, `tools/scripts/lint/system-prompt-size.script.spec.ts`, `new:tools/scripts/catalog/lesson-hints.helper.ts`, `new:tools/scripts/catalog/lesson-hints.helper.spec.ts`
- **Gate**: lint
- **Decisions**: The hints gain a bounded section (at most 5 lessons, 400 bytes) of the top lessons by minutes lost with their one-line prevention, read only from self-learning's deriveLessons so a hand-written gotcha is deleted once its class appears there; the existing system-prompt-size lint enforces the budgets, no new lint script.
- acceptance:
  - "tools/scripts/catalog/lesson-hints.helper.spec.ts: seven lessons render the five costliest within 400 bytes and no lessons render nothing"
  - "tools/scripts/lint/system-prompt-size.script.spec.ts: a lesson section over the byte budget fails the lint"
  - "bun run lint:system-prompt-size exits 0 on the current tree"

### S6 — Trend to zero in project-kpis and retirement of redundant late gates
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/project-kpis/src/lib/services/kpi-trends.service.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/tests/src/lib/kpi-aggregation.spec.ts`, `new:plugins/project-kpis/src/lib/services/failure-trend.service.ts`, `new:plugins/project-kpis/tests/src/lib/failure-trend.spec.ts`, `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.script.spec.ts`
- **Gate**: lint
- **Decisions**: project-kpis reports per ISO week failures per delivered slice and minutes and tokens lost per lesson class, read from the self-learning store; the q00046 S7 weekly report (pr-ci-cost) shows the same totals. A class with zero occurrences for M weeks (policy, default 4) is listed retirable for its late gate only while an earlier stage still catches it; it is named, never deleted automatically.
- acceptance:
  - "plugins/project-kpis/tests/src/lib/failure-trend.spec.ts: a three-week fixture reports failures per delivered slice, minutes lost per class and the week-over-week delta"
  - "plugins/project-kpis/tests/src/lib/failure-trend.spec.ts: a class silent four weeks whose earlier stage still catches it is retirable and one whose earliest stage is the late gate is not"
  - "delendai_compact_router domain=project-kpis reports the weekly failure trend in this repository"

## acceptance

- packages/core/tests/src/lib/plugins/preset-catalog.spec.ts: the dogfood and team-pr presets list self-learning and project-kpis and the minimal preset does not
- delendai_compact_router domain=self-learning action=lessons answers ok in this repository
- plugins/self-learning/tests/src/lib/collectors/failure-collectors.service.spec.ts: a failing gate, hook, CI job, land verdict, tool error and deliver refusal each append one observation carrying class, stage, files, unit and minutes lost
- plugins/self-learning/tests/src/lib/collectors/failure-collectors.service.spec.ts: a secret-looking argument value never reaches an observation and a store write failure does not change the caller's result
- plugins/self-learning/tests/src/lib/lessons/late-catch.helper.spec.ts: a file-size breach observed at CI is a late catch against the commit hook and the same breach at the commit hook is not
- plugins/self-learning/tests/src/lib/tools/lessons.tool.spec.ts: the lessons tool returns the late-catch lessons with minutes lost
- delendai_compact_router domain=self-learning action=lessons lists late-catch lessons in this repository
- plugins/self-learning/tests/src/lib/lessons/fix-proposal-draft.helper.spec.ts: a lesson below the confidence or from one unit drafts nothing
- plugins/proposals/tests/src/lib/proposals/lesson-fix-proposal.service.spec.ts: over a fake store, a qualifying lesson drafts exactly one proposal with its incidents and a later sighting extends it
- plugins/proposals/tests/src/lib/proposals/proposal-readiness-generic.spec.ts: a lesson-born proposal whose Files name a repo-specific workflow is refused naming the path and one whose prevention is a lint gate is ready
- bun run lint:proposal-readiness exits 0 on the current tree
- tools/scripts/catalog/lesson-hints.helper.spec.ts: seven lessons render the five costliest within 400 bytes and no lessons render nothing
- tools/scripts/lint/system-prompt-size.script.spec.ts: a lesson section over the byte budget fails the lint
- bun run lint:system-prompt-size exits 0 on the current tree
- plugins/project-kpis/tests/src/lib/failure-trend.spec.ts: a three-week fixture reports failures per delivered slice, minutes lost per class and the week-over-week delta
- plugins/project-kpis/tests/src/lib/failure-trend.spec.ts: a class silent four weeks whose earlier stage still catches it is retirable and one whose earliest stage is the late gate is not
- delendai_compact_router domain=project-kpis reports the weekly failure trend in this repository
