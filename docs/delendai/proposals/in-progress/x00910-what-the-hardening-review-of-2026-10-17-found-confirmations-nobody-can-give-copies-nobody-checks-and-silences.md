---
id: x00910
title: "What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-17
---

# x00910 — What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences

## goal

Each finding below came out of the work of 2026-10-16/17 (Batuta f00551, the review swarm, two outside audits) and was confirmed against `develop` before it was written. When this proposal is done, a tool's description has one source, the site carries no data nobody produces, and the remaining silent states of the workflow are said where an agent or the owner looks.

## why

The owner, 2026-10-17: "una revisión completa y exhaustiva de todo el proyecto para sacar propuestas nuevas de mejora para que el proyecto pase a una fase de endurecerse … fuente de la verdad, agnóstico, clean code, código reutilizado y supermantenible". Confirmed on `develop` at e8dd23943:

- **The spend confirmation could never be given.** `plugins/orchestrator-runner/src/lib/invoke/token.ts` documents a gate the host wires to MCP elicitation; nothing wired it, so `denyAllConfirmationGate` answered every spend. Fixed in f00551 S6, where the runner's host integration lives (not repeated here).
- **A tool's description has two copies.** `apps/web/src/i18n/tools/**` carries each tool's English description again beside the one the tool registers, and nothing compares them: when f00551 S2 changed two runner tools, the site kept describing probing without consent until it was edited by hand.
- **The site publishes data nobody produces.** `apps/web/src/data/token-roi.json` (`top: []`, 2026-08-30) and `token-budget.json` (a sample from 2026-08-30) are read by no page, and `tools/scripts/report/token-roi.script.ts` that would write the first is wired to nothing. An outside audit read them as the product's metrics.
- **The cross-runtime SQLite loader exists three times.** `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts` falls back to `node:sqlite`; `packages/state-telemetry/src/lib/eta/duration-history.ts` and `.../events/work-event-store.sqlite.ts` each carry their own Bun-only copy, so telemetry dies under Node. Core may not load `bun:sqlite`, so the one loader needs a home both packages can depend on.
- **A roster entry without an account inherits the server's environment.** f00551 S3 isolates CLIs on an account; an entry with no `accountId` still spawns with every credential the server holds, for compatibility.
- **A unit whose only commits are hydration looks alive.** Its tip moves with every hydration merge, so idle and abandon detection, and `work retire`'s freshness check, read it as recent (f00551 S1a's empty unit needed `--unowned`).
- **A red publication waits on its author in silence.** The hydrator logs "red again; its author pushes next"; nothing tells the author, and `work status` / `proposals status` do not show it.
- **A long-lived host server applies the rules it started with.** This session's server predated x00908 by five hours, so retiring f00639 from `paused` did not publish until done by hand; nothing in its answers says the code it runs is behind.
- **The ref maintenance reaped a unit whose proposal was still in progress.** After x00910's first pull request merged, `maintain-ref-namespace` removed its worktree and work ref ("develop already contains everything it adds"), although the proposal had pending slices: the check looked at the ref and its upstream, never at the proposal the unit works on.
- **Two lints check one fact.** `proposal-files-exist` and `proposal-slice-completeness` both verify that a declared file exists, each with its own baseline; removing a file a closed proposal listed needs both updated (done twice in S3).
- **Specs depend on the working directory.** Run from `packages/core` instead of the repository root, two specs fail on paths and the run writes a stray `packages/core/.cache/delendai` (records, runtime events, evidence), which `lint:cache` then refuses.
- **Who made a piece of work is reconstructed, not recorded.** x00906 infers the maker of carried work from commit dates and refs; the originating agent, unit and session could be written when the work is made.

## non-goals

- What x00909 already fixes (migrations, delegation manifests, the roadmap, the test runner, replacement strings).
- Real-account Batuta smokes: they wait on the owner's consent (f00551).
- The spend confirmation: f00551 S6.

## slices

- global_gate: type

### S2 — A tool's description has one source

- **Status**: in-progress
- **Files**:
  - `apps/web/scripts/gen-capabilities.ts`
  - `apps/web/scripts/__tests__/gen-capabilities.spec.ts`
- **Gate**: type
- acceptance:
  - "The site's live tool registry (`gen-capabilities` → `capabilities.json`) loads every first-party plugin under `plugins/`, from its own source: it named 13 of 61 by hand, so the site listed 142 tools of 280 and the other plugins' tools reached it only through hand-kept i18n copies. Now 280, none undocumented."
  - "Measured 2026-10-17: of the 91 tool entries in the site's i18n catalogue, none has an English text equal to what `tools/list` serves, because `tools/list` serves each tool's short summary while the catalogue holds the long description, which also lives in the tool's own code. One source for the long description (the registration's, read by the generator, with translations recording the English they came from) is the remaining step; it needs the generator to read the long text, which the served listing does not carry."

### S3 — The site carries no data nobody produces

- **Status**: review
- **Files**:
  - `tools/scripts/report/token-roi.script.ts`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
  - `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Gate**: type
- acceptance:
  - "`apps/web/src/data/token-roi.json` and `token-budget.json`, read by no page, are removed; the ROI report script writes to `.cache/delendai/reports/` instead of the site's data, and nothing that reads or builds the site changes. The two closed proposals that listed them (c00135, c00136) are recorded in the files-exist and slice-completeness baselines as files removed after closing, the case those baselines exist for. The cache layout check sanctions `reports/`, and `from-members/` (where x00909's migration keeps what a member's stray cache held, named by the migrator's own constant)."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — One SQLite loader, on every runtime

- **Status**: pending
- **Files**: `packages/state-telemetry/src/lib/eta/duration-history.ts`
- **Gate**: type
- acceptance:
  - "Telemetry opens its database through the one cross-runtime loader, under Bun and under Node; the copies are gone."
  - "Design: the loader moves out of `proposals-sqlite` into a small public package both depend on (`state-sqlite` is private, so a published package cannot depend on it, and telemetry depending on the proposals store would couple them); the new workspace ships with its logo, publish order and build like any other."

### S5 — A roster entry without an account is isolated too

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
- **Gate**: type
- acceptance:
  - "A CLI for an entry with no account starts from the same allowlist plus the one variable its invocation names, with a start-up migration or a report for configurations that relied on inheriting more."
  - "Needs the owner's decision: a legacy `cli` entry names no credential variable, so isolating it can break a provider that read an inherited key (e.g. `aider` with `OPENAI_API_KEY`). The options are an implicit account per legacy entry written by a start-up migration that asks which variable it needs, or isolating `api`/`mcp-server` entries (whose invocation names its variable) and reporting `cli` ones at start."

### S6 — Hydration does not make a unit look alive

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-activity.helper.ts`
  - `packages/core/src/lib/work-units/unit-standings.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-activity.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit's standing, a hanging work ref and a stalled publication are dated by their own last work — the latest commit on them that is not a merge and is not on the integration branch — not by their tip, which every merge of the integration branch moves. A unit with no work of its own is dated by when it was first touched; one holding nothing beyond the integration branch, by its tip. One helper serves all three."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — A red publication is said to its author

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/publication-disposition.interface.ts`
  - `packages/core/src/lib/contracts/constants/publication-dispositions.constant.ts`
  - `packages/core/src/lib/work-units/publication-dispositions.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/work-units/publication-dispositions.service.spec.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Gate**: type
- acceptance:
  - "The queue refresh keeps its last verdict on each pull request in `<cache>/forge/publication-dispositions.json`; `work status` names each one that waits on its author (`waits on author #N <ref>: <why>`), which the refresh used to repeat only in its own log, every pass."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — A stale server says so

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/code-freshness.interface.ts`
  - `packages/core/src/lib/cli/code-freshness.service.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/cli/code-freshness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The `delendai` status collector reports `code`: `stale` with the reason and the restart to do, read from x00701's stale-runtime watch (the one every tool result's advisory and the supervisor's restart use), not from a second detector. The first version of this slice carried its own git probe; it duplicated that watch and was replaced by it."

### S9 — Who made a piece of work is recorded

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/commit-maker-notes.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/commit-maker.interface.ts`
  - `packages/core/src/lib/work-units/commit-maker-notes.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/work-units/commit-maker-notes.service.spec.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `plugins/proposals/src/lib/services/carried-work.service.ts`
  - `plugins/proposals/tests/src/lib/services/carried-work.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After each commit in a unit's worktree, the post-commit guard writes a git note (`maker`, `unit`, and `session` when known) under the agent's own notes ref `refs/notes/delendai/<agent>` and pushes it; the forge shows no notes, so nothing reaches the surface f00500 keeps free of AI names."
  - "Several instances of one model share its name and, on one machine, its notes ref: the unit tells them apart; a write that loses the ref's lock to another instance is retried, and a push refused because another instance pushed first merges both (`cat_sort_uniq`) and pushes again. Specs: two instances writing at once keep both notes; two clones of one agent pushing in turn leave both notes readable from a third clone."
  - "`carriedFrom` reads the recorded makers first (fetching every agent's notes beside the local ones) and falls back to inference only for commits made before; work another instance of the same model made stays that model's, so only another agent is named as a maker."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S10 — The unit of a proposal in progress is not reaped

- **Status**: review
- **Files**:
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/src/lib/wip-engine/proposal-in-progress.helper.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal is in progress on the integration branch keeps its worktree and ref however spent it looks: every merged slice leaves it so. Its publications are still reaped. A spec that fails without the check reproduces the reaped unit."
  - "The host server's checkout publisher no longer withdraws such a ref from the forge once its work landed (and puts it back when an older rule did): the forge showed f00551 and x00910 in progress with no unit, and the queue's doctor reddened develop on `in-progress-has-units`. A spec that fails without the check keeps the ref on the remote."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S11 — One check for a declared file

- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-files-exist.script.ts`
- **Gate**: type
- acceptance:
  - "Whether a proposal's declared files exist is checked once, with one baseline; the other lint reads its verdict instead of checking again."

### S12 — Specs do not depend on where they are run from

- **Status**: review
- **Files**:
  - `tools/scripts/test/hermetic-cwd-setup.ts`
  - `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "A setup file shared by every vitest project runs each spec from the repository root, so running a package's specs from the package directory gives the same results as from the root (the two specs that failed on root-relative paths pass) and no run writes a cache under the package."
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A tool's description has one source.
- The site publishes no data nobody produces.
- The remaining silent states are said where an agent or the owner looks.
