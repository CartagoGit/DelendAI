---
id: x01096
title: "work reap ends every unit, ref and leftover that holds nothing develop lacks, and the agent docs describe the flow the product enforces"
kind: fix
status: review
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 8c7ddb46-5e9f-4ef9-8e24-c1c2958267dd
last-correlation-id: 8c7ddb46-5e9f-4ef9-8e24-c1c2958267dd
last-transition-from: in-progress
last-transition-at: 2026-11-18T13:56:34.250Z
---

# x01096 — work reap ends every unit, ref and leftover that holds nothing develop lacks, and the agent docs describe the flow the product enforces

## goal

`delendai work reap --apply` (and the hourly upkeep that runs it) ends every local unit whose commits are all on the integration branch once its owner is past the idle window, whoever owns it; removes a stranded or rescued ref whose changes are already on the integration branch by patch identity; moves files that are not worktrees out of the worktrees directory into the kept area and reports them; and removes the empty test temp directories the pre-x01091 test kit leaked. The agent documents state the flow agents now follow (deliver without publish, revalidate, readiness rules, land), from one place.

## why

Measured 2026-11-18 on the owner's clone: 15 worktrees (3.3 GB under .cache/delendai/.worktrees), six of them units whose every commit is on develop (x01059 S5, S6; x01087 S2, S3; x01032 S2 g2; f00817 all g3), listed by `work status` as orphaned idle-past-window, yet `delendai work reap` plans nothing (every list empty). 19 refs/delendai/stranded and 9 refs/delendai/rescued refs exist, none an ancestor of develop, none checked by patch identity. Eight non-worktree files (q48.md, s8publish.txt and others) sit in the worktrees directory. /tmp holds 134,223 empty delendai-gh-* directories and about 40,000 more from test prefixes the old test kit never removed (x01091 stops new ones; nothing removes the old). Agents still run `work publish` after deliver and write proposals the readiness lint refuses, because the bootstrap and playbooks predate deliver, revalidate, x01079 and land. x01056 (in review) covers how runtime and detached worktrees are classified, not landed units of an idle owner.

## non-goals

- Deleting a ref or worktree that holds a change the integration branch lacks; those are listed, never removed.
- Changing retired-ref retention (refs/delendai/retired keeps its tips).
- Reclassifying runtime or detached worktrees (x01056).

## slices

- global_gate: lint

### S1 — reap ends a landed unit of an idle owner
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`, `packages/core/tests/src/lib/work-units/unit-reaper-landed.service.e2e.spec.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "`delendai work reap` lists, and `--apply` ends (worktree removed, local branch deleted, no ref kept because nothing is unique), a unit whose every commit is an ancestor of the integration branch and whose owner is past the idle window, whatever agent id owns it; a live owner's unit is never touched."
  - "unit-reaper.service.spec.ts covers: landed and idle (ended), landed and live (kept), one unlanded commit and idle (kept and listed), and a unit with uncommitted edits (kept, edits named)."
- shipped-in: `2ab5ed987be8`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2-flash
- review-log: requested_changes by mai-code-2-flash — S1 is stale against current develop: its declared reaper implementation/spec paths no longer exist and work-unit reaper code moved across later commits. A review recorded against 2ab5ed987be8 cannot prove the current behavior. Redeliver S1 on current HEAD, update renamed/deleted Files entries through revalidate, and run unit-reaper/Landed e2e specs plus work reap gates.

### S2 — stranded and rescued refs whose patches are on develop are removed
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/stray-refs-reap.service.ts`, `packages/core/src/lib/work-units/stray-refs-reap.interface.ts`, `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`, `new:packages/core/tests/src/lib/work-units/stray-refs-reap-kept.service.e2e.spec.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "`delendai work reap --apply` removes a refs/delendai/stranded or refs/delendai/rescued ref when every commit it holds beyond its merge base has an equivalent patch on the integration branch (`git cherry` reports only '-'), and lists the others with their age and changed files."
  - "stray-refs-reap.service.spec.ts covers a ref whose patch landed under another hash (removed), one with a unique patch (listed), and an empty ref (removed)."
- shipped-in: `f738bc16c502`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — leftovers outside units: stray files in the worktrees directory and the old test temp directories
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/work-units/worktree-husks.service.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/contracts/interfaces/worktree-husks.interface.ts`, `new:packages/core/src/lib/work-units/test-temp-leftovers.service.ts`, `new:packages/core/src/lib/contracts/constants/test-temp-prefixes.constant.ts`, `new:packages/core/src/lib/contracts/interfaces/test-temp-leftovers.interface.ts`, `new:packages/core/tests/src/lib/work-units/test-temp-leftovers.service.spec.ts`, `new:packages/core/tests/src/lib/work-units/work-unit-reap.service.e2e.spec.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "`delendai work reap --apply` moves a file in the worktrees directory that is not a registered worktree into the kept area under .cache/delendai, naming each one; nothing is deleted."
  - "`delendai work reap --apply` removes empty directories directly under os.tmpdir() whose names start with a prefix the test kit used before x01091 (delendai-gh-, state-contract-, unit-index-, tok-report-, state-coordination-, state-sqlite-, tok-) and that are older than one day; a non-empty one is listed, never removed; the prefixes are one constant."
  - "test-temp-leftovers.service.spec.ts drives it over an injected temp root with an old empty match (removed), a fresh one (kept), a non-empty one (listed) and a foreign name (ignored)."
- shipped-in: `11bf65764571`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — the agent documents describe the enforced flow
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`, `plugins/proposals/skills/delendai-work-unit-playbook/SKILL.md`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "The bootstrap and the work-unit playbook say: deliver proves, hands over and publishes, and nothing runs `work publish` after it; a pending pull request is opened by the forge and `work status` shows its number; `work revalidate` moves shipped proposals in one batch; `work reap --apply` ends landed units; land merges, agents never merge by hand."
  - "The proposals workflow playbook states the readiness rules a new proposal must meet (new: for files a slice creates, each acceptance line names a command, a .spec.ts or a Scenario, Decisions closed), checked by `bun tools/scripts/lint/proposal-readiness.script.ts`."
  - "`bun run lint:check-skills` and the bootstrap size check (AGENT-BOOTSTRAP.md under 32,000 bytes) pass; no agent rule is stated in two documents."
- shipped-in: `9e2a6bc39f22`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `delendai work reap` lists, and `--apply` ends (worktree removed, local branch deleted, no ref kept because nothing is unique), a unit whose every commit is an ancestor of the integration branch and whose owner is past the idle window, whatever agent id owns it; a live owner's unit is never touched.
- unit-reaper.service.spec.ts covers: landed and idle (ended), landed and live (kept), one unlanded commit and idle (kept and listed), and a unit with uncommitted edits (kept, edits named).
- `delendai work reap --apply` removes a refs/delendai/stranded or refs/delendai/rescued ref when every commit it holds beyond its merge base has an equivalent patch on the integration branch (`git cherry` reports only '-'), and lists the others with their age and changed files.
- stray-refs-reap.service.spec.ts covers a ref whose patch landed under another hash (removed), one with a unique patch (listed), and an empty ref (removed).
- `delendai work reap --apply` moves a file in the worktrees directory that is not a registered worktree into the kept area under .cache/delendai, naming each one; nothing is deleted.
- `delendai work reap --apply` removes empty directories directly under os.tmpdir() whose names start with a prefix the test kit used before x01091 (delendai-gh-, state-contract-, unit-index-, tok-report-, state-coordination-, state-sqlite-, tok-) and that are older than one day; a non-empty one is listed, never removed; the prefixes are one constant.
- test-temp-leftovers.service.spec.ts drives it over an injected temp root with an old empty match (removed), a fresh one (kept), a non-empty one (listed) and a foreign name (ignored).
- The bootstrap and the work-unit playbook say: deliver proves, hands over and publishes, and nothing runs `work publish` after it; a pending pull request is opened by the forge and `work status` shows its number; `work revalidate` moves shipped proposals in one batch; `work reap --apply` ends landed units; land merges, agents never merge by hand.
- The proposals workflow playbook states the readiness rules a new proposal must meet (new: for files a slice creates, each acceptance line names a command, a .spec.ts or a Scenario, Decisions closed), checked by `bun tools/scripts/lint/proposal-readiness.script.ts`.
- `bun run lint:check-skills` and the bootstrap size check (AGENT-BOOTSTRAP.md under 32,000 bytes) pass; no agent rule is stated in two documents.
