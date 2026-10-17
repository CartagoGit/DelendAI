---
id: x00909
title: "What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-17
last-transition-id: adbf2946-8388-4323-a9f2-14289fc028ba
last-correlation-id: adbf2946-8388-4323-a9f2-14289fc028ba
last-transition-from: in-progress
last-transition-at: 2026-10-17T14:46:34.871Z
---

# x00909 — What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word

## goal

Every defect below was reported by an outside audit of `develop` (two ChatGPT 6 conversations, 2026-10-17) or seen in the review swarm of the same day, and each was confirmed against the code before it was written here. When this proposal is done, a namespace migration reaches every host's agents, a migration never deletes what cannot be regenerated, a delegated task carries the tools and acceptance it runs under and says what context it lacks, a roadmap entry whose gates contradict its state is named, `bun test` cannot pass or fail a vitest spec under the wrong harness, and text spliced into a document is never read as a replacement pattern.

## why

The owner, 2026-10-17: "tienes autonomía para decidir si crear propuestas para corregirlas … el caso es que podamos corregir y mejorar todo lo que veas". Confirmed on `develop` at 364bd34cc:

- `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts` lists `.github/agents`, `.claude/agents` and `.codex/agents` by hand. The host registry (`AGENT_HOSTS`) also writes OpenCode's agents, so a namespace change leaves those behind: a second, partial list of hosts.
- `stray-member-cache.migrator.ts` removes a member's stray cache when it holds only `REGENERABLE_CACHE_ENTRIES`, and that list names `evidence`, `logs` and `results`. Evidence of a past run and its logs do not regenerate; deleting them loses the only record of what happened.
- `plugins/agent-orchestrator/src/index.ts` compiles every delegation with `allowedTools: []` and `acceptance: []`: the manifest has the fields, the one caller never fills them, so a subagent is told nothing about what it may use or what it must satisfy.
- `delegation-manifest.service.ts` drops a file a task names but the workspace lacks, and drops every section when context-for-change fails, both without a word: the subagent cannot tell "there is no context" from "the context could not be read".
- `linear-dispatcher.ts` treats a `verify` step as informational ("never blocks"). Checked: the dispatcher runs no verification at all, and each verify step already reads `executed: false` in the outcome, so nothing reports a verification that did not happen; the audit's point is a design limit (verification belongs to whoever holds the acceptance), not a reporting bug. Only its stale comment is corrected here.
- `proposal_review` spliced a slice back with `md.replace(blockRe, `${m[1]}${block}`)`. In the review swarm, `glm-5.3-flash` approved f00761 S4 with a note quoting a schema pattern ending in `$'`; JavaScript read it as "the text after the match", so the rest of the document (S5) was spliced into the note and the note was cut (#1173, repaired by hand in #1178). Nineteen more replacements across the repository take an interpolated template as their replacement string.
- `docs/delendai/ROADMAP.md` gives each entry a hand-written `state` beside the gates that decide it. f00756, f00548, f00550 and f00543 are done, so four entries' `proposal-done` gates hold, yet they read `in-progress` and `proposed`, and the site projects that: two sources for one fact.
- In the review swarm, `gemini-3.8-flash` (PR #1172, verdict on q00010) wrote: "The first pass with Bun's built-in test runner gave false negatives on vi.waitFor in the eviction specs, so I reran … with Vitest". `bun test` runs vitest specs under the wrong harness and reports results that are not results; a reviewer that stopped at the first run would have sent green work back.

## non-goals

- The audits' strategic advice (A/B token benchmarks, a project contract hash, per-environment plugin certification): each is its own proposal, not a fix.
- Findings already fixed on `develop`: the scoped-package manifest bug (#1160, merged), the `cv2mario` setup link (no longer present).

## slices

- global_gate: type

### S1 — A namespace migration reaches every host's agents

- **Status**: review
- **Files**:
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/core/tests/src/lib/workspace-migration/namespace-prefix-transition.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The agent directories a namespace-prefix change rewrites are read from `AGENT_HOSTS`, not listed by hand; a spec renames the prefix in an OpenCode agent the old list missed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S2 — A migration keeps what does not regenerate

- **Status**: review
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts`
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.migrator.ts`
  - `packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "A stray member cache's `evidence`, `logs` and `results` are moved into the workspace's own cache, under a directory named for the member, and only what regenerates (`runtime`, `scratch`) is deleted; the migration report says where each one went."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S3 — A delegated task carries its tools and acceptance, and says what context it lacks

- **Status**: review
- **Files**:
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts`
  - `plugins/agent-orchestrator/src/lib/contracts/interfaces/delegation-manifest.interface.ts`
  - `plugins/agent-orchestrator/src/lib/policy/types.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/delegation-manifest.service.spec.ts`
  - `packages/contracts/src/delegated-task.interface.ts`
  - `packages/core/src/lib/subagents/delegation-prompt.helper.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/subagents/delegation-prompt.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "A delegated step's `allowedTools` are the tools of the core agent profile its role works under (scout → technical_investigator, implementer and scribe → implementation_runner, verifier and reviewer → delivery_verifier), the one list every host's agents are written from; `acceptance` is the checks `dispatch` is given for the task. The constant empty lists are gone, so an implementer is no longer told to use no tool."
  - "A file the task names that the workspace lacks, and a context source that fails, are listed in the manifest's `missingContext` with their reason, and the prompt a host gets says they are not available, instead of being left out in silence."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S5 — A roadmap entry whose gates contradict its state is named

- **Status**: review
- **Files**:
  - `plugins/roadmap/src/lib/read-model/roadmap-readiness.service.ts`
  - `plugins/roadmap/src/lib/contracts/interfaces/read-model.interface.ts`
  - `plugins/roadmap/src/lib/tools/readiness.tool.ts`
  - `plugins/roadmap/tests/src/lib/read-model/roadmap-readiness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Readiness names, in `closable` and in its reason, every open entry whose gates all pass, with the tool that closes it. The projection stays a function of the roadmap file alone (so committed copies still compare byte for byte); moving a `proposed` entry is the owner's decision, so the four contradicted entries are reported to the owner, not rewritten."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S6 — The wrong test runner says so

- **Status**: review
- **Files**:
  - `bunfig.toml`
  - `tools/scripts/test/bun-owned-preload.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - "`bun test` on a spec outside `BUN_OWNED_SPECS` refuses with the command that runs it (`bun run test`, `bunx vitest run <file>`); `bun run test:sqlite` still runs all 477 Bun-owned tests green; the unused `test:context-compiler` script, which ran vitest specs under Bun, is removed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S7 — Text spliced into a document is text

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/tools/recovery-tools.ts`
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/src/lib/services/review-handoff.ts`
  - `plugins/proposals/src/lib/proposals/proposal-frontmatter-writer.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-note-literal.spec.ts`
  - `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
  - `plugins/test-convention/src/scan.ts`
  - `plugins/test-convention/src/suggest.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/ui-extension/src/dashboard/builders/build-panels.ts`
  - `extensions/vscode/src/commands/open-configuration-center.ts`
  - `extensions/vscode/src/commands/open-plugin-config.ts`
  - `tools/scripts/generate/preset-metadata.script.ts`
  - `tools/scripts/git/generated-merge-driver.script.ts`
  - `tools/scripts/lint/repository-identity.script.ts`
  - `tools/scripts/proposals/rename-padded.script.ts`
  - `tools/scripts/lint/no-interpolated-replacement.script.ts`
  - `tools/scripts/lint/no-interpolated-replacement.constant.ts`
  - `tools/scripts/lint/no-interpolated-replacement.script.spec.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - "Every `replace`/`replaceAll` that took an interpolated template as its replacement passes a function instead, group references included, so `$&`, `$'` and `$1` in the spliced text stay text; a review note quoting `$'` is written whole and the document keeps one copy of each slice (a spec that fails with the old splice)."
  - "`lint:no-interpolated-replacement`, chained into `lint:architecture`, refuses an interpolated template passed as a replacement string anywhere in product code or tooling."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

## acceptance

- A namespace migration reaches every host's agents.
- A migration never deletes what cannot be regenerated.
- A delegated task carries its tools and acceptance and says what context it lacks.
- A review note, or any text spliced into a document, is written as it was given.
- A roadmap entry whose gates contradict its state is named, with the tool that closes it.
- `bun test` cannot judge a vitest spec.
