---
id: x00910
title: "What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-17
last-transition-id: 86304d9a-e90b-42e6-a2a4-5a6e667c4a19
last-correlation-id: 86304d9a-e90b-42e6-a2a4-5a6e667c4a19
last-transition-from: in-progress
last-transition-at: 2026-10-18T04:03:04.253Z
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

- **Status**: review
- **Files**:
  - `apps/web/scripts/gen-capabilities.ts`
  - `apps/web/scripts/__tests__/gen-capabilities.spec.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_accounts.ts`
  - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
  - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
- **Gate**: type
- acceptance:
  - "The site's live tool registry (`gen-capabilities` → `capabilities.json`) loads every first-party plugin under `plugins/`, from its own source: it named 13 of 61 by hand, so the site listed 142 tools of 280 and the other plugins' tools reached it only through hand-kept i18n copies. Now 280, none undocumented."
  - "A tool page's English is the long description its registration passes (read through the surface runtime's `listToolDescriptions`, since `tools/list` serves the short summary), never the catalogue's copy. The catalogue's `en` now records the English its translations were made from; a tool whose `en` differs from its registration is reported as translated from an older English, and `--strict` fails on any such tool the baseline (`stale-translations.baseline.json`, 56 measured 2026-10-18) does not already record; x00912 then translated those 56 and deleted the baseline with the code that read it, so `--strict` fails on any stale translation. A scratch workspace a closed server still writes to no longer fails the generation."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f253b607498`

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
- shipped-in: `7cb245385611`

### S4 — One SQLite loader, on every runtime

- **Status**: review
- **Files**:
  - `packages/sqlite/package.json`
  - `packages/sqlite/tsconfig.json`
  - `packages/sqlite/vitest.config.ts`
  - `packages/sqlite/AGENT.md`
  - `packages/sqlite/src/index.ts`
  - `packages/sqlite/src/lib/load-database-class.helper.ts`
  - `packages/sqlite/src/lib/node-sqlite-database.helper.ts`
  - `packages/sqlite/tests/src/lib/load-database-class.helper.spec.ts`
  - `packages/sqlite/tests/src/lib/node-sqlite-database.helper.spec.ts`
  - `packages/state-telemetry/src/lib/eta/duration-history.ts`
  - `packages/state-telemetry/src/lib/events/work-event-store.sqlite.ts`
  - `packages/core/src/lib/evidence/evidence-repo.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.ts`
  - `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`
  - `packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`
  - `apps/web/public/logos/plugin-sqlite.svg`
  - `tools/scripts/release/release-plan.ts`
  - `tsconfig.base.json`
  - `vitest.shared.ts`
  - `tools/scripts/lint/core-runtime-deps.script.ts`
  - `tools/scripts/compile/build.script.ts`
  - `packages/cli/package.json`
  - `docs/delendai/proposals/done/feats/f00641-the-proposals-database-runs-on-node-as-well-as-bun.md`
- **Gate**: type
- acceptance:
  - "Telemetry (duration history and work-event store) opens its database through the one cross-runtime loader, `@delendai/sqlite`, under Bun and under Node; the proposals store reads the same package, and the evidence store resolves through it too while keeping its own rule of opening SQLite only under Bun (under Node it keeps the file backend, as every assembly in a Node test run reaches it). The three copies of the loader are gone."
  - "The loader is a small public package both depend on (`state-sqlite` is private, so a published package cannot depend on it, and telemetry depending on the proposals store would couple them); it ships with its logo, its place in the publish order before `packages/core`, its build, and its specs among the Bun-owned ones, and on the core's runtime allow-list with its reason. The build now names the package and the reason when one fails before running a command (it printed only an exit code, which hid that `packages/cli` bundles telemetry and so must declare the loader)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `f2bc98e0de18`

### S5 — A roster entry without an account is isolated too

- **Status**: review
- **Files**:
  - `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/lib/services/account-status.service.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-status.service.spec.ts`
  - `plugins/orchestrator-runner/src/lib/tools/accounts.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/index.ts`
  - `plugins/orchestrator-runner/src/lib/schemas.ts`
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/accounts-tool-options.interface.ts`
  - `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`
  - `packages/core/schema/delendai.config.schema.json`
- **Gate**: type
- acceptance:
  - "A CLI roster entry with no account that names the variables it needs (`invoke.env`) starts from the same allowlist as an account's process plus those variables, never the server's whole environment."
  - "Decided 2026-10-18 (autonomous, the option that breaks nobody): a legacy `cli` entry that names neither an account nor `invoke.env` keeps inheriting, because isolating it could take a key a provider reads from the environment (`aider` with `OPENAI_API_KEY`); the `accounts` tool lists every such entry (`inheriting`) so its owner can name an account or its variables. No layout changes, so no migration: an entry opts in by naming its variables."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b2c7c3020b97`

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
- shipped-in: `720ad37447ac`

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
- shipped-in: `0f4a2eda256c`

### S8 — A stale server says so

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/code-freshness.interface.ts`
  - `packages/core/src/lib/cli/code-freshness.service.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/cli/code-freshness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The `delendai` status collector reports `code`: `stale` with the reason and the restart to do, read from x00701's stale-runtime watch (the one every tool result's advisory and the supervisor's restart use), not from a second detector. The first version of this slice carried its own git probe; it duplicated that watch and was replaced by it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f4a2eda256c`

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
- shipped-in: `0f4a2eda256c`

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
- shipped-in: `0f4a2eda256c`

### S11 — One check for a declared file

- **Status**: review
- **Files**:
  - `tools/scripts/lint/proposal-files-exist.script.ts`
  - `tools/scripts/lint/proposal-files-exist.script.spec.ts`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `tools/scripts/lint/proposal-slice-completeness.script.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
- **Gate**: type
- acceptance:
  - "Whether a proposal's declared files exist is checked once, by `proposal-files-exist`, with one baseline; it also refuses a pattern in a slice that ran, which `proposal-slice-completeness` used to say. `proposal-slice-completeness` keeps only what is its own (a slice left behind, a file under an ignored path), so one missing file is one debt entry, not two: the two baselines held 1154 entries and now hold 615, with nothing newly allowed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7cb245385611`

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
- shipped-in: `f2bc98e0de18`

## acceptance

- A tool's description has one source.
- The site publishes no data nobody produces.
- The remaining silent states are said where an agent or the owner looks.
