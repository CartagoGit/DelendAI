---
id: x00909
title: "What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-17
---

# x00909 — What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word

## goal

Every defect below was reported by an outside audit of `develop` (two ChatGPT 6 conversations, 2026-10-17) or seen in the review swarm of the same day, and each was confirmed against the code before it was written here. When this proposal is done, a namespace migration reaches every host's agents, a migration never deletes what cannot be regenerated, a delegated task carries the tools and acceptance it runs under and says what context it lacks, a plan whose verification failed is not reported as succeeded, a roadmap entry whose gates contradict its state is named, and `bun test` cannot pass or fail a vitest spec under the wrong harness.

## why

The owner, 2026-10-17: "tienes autonomía para decidir si crear propuestas para corregirlas … el caso es que podamos corregir y mejorar todo lo que veas". Confirmed on `develop` at 364bd34cc:

- `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts` lists `.github/agents`, `.claude/agents` and `.codex/agents` by hand. The host registry (`AGENT_HOSTS`) also writes OpenCode's agents, so a namespace change leaves those behind: a second, partial list of hosts.
- `stray-member-cache.migrator.ts` removes a member's stray cache when it holds only `REGENERABLE_CACHE_ENTRIES`, and that list names `evidence`, `logs` and `results`. Evidence of a past run and its logs do not regenerate; deleting them loses the only record of what happened.
- `plugins/agent-orchestrator/src/index.ts` compiles every delegation with `allowedTools: []` and `acceptance: []`: the manifest has the fields, the one caller never fills them, so a subagent is told nothing about what it may use or what it must satisfy.
- `delegation-manifest.service.ts` drops a file a task names but the workspace lacks, and drops every section when context-for-change fails, both without a word: the subagent cannot tell "there is no context" from "the context could not be read".
- `linear-dispatcher.ts` treats a `verify` step as informational ("never blocks"): a plan whose verification failed still reads as succeeded.
- `docs/delendai/ROADMAP.md` gives each entry a hand-written `state` beside the gates that decide it. f00756, f00548, f00550 and f00543 are done, so four entries' `proposal-done` gates hold, yet they read `in-progress` and `proposed`, and the site projects that: two sources for one fact.
- In the review swarm, `gemini-3.8-flash` (PR #1172, verdict on q00010) wrote: "The first pass with Bun's built-in test runner gave false negatives on vi.waitFor in the eviction specs, so I reran … with Vitest". `bun test` runs vitest specs under the wrong harness and reports results that are not results; a reviewer that stopped at the first run would have sent green work back.

## non-goals

- The audits' strategic advice (A/B token benchmarks, a project contract hash, per-environment plugin certification): each is its own proposal, not a fix.
- Findings already fixed on `develop`: the scoped-package manifest bug (#1160, merged), the `cv2mario` setup link (no longer present).

## slices

- global_gate: type

### S1 — A namespace migration reaches every host's agents

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/core/tests/src/lib/workspace-migration/namespace-prefix-transition.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The agent directories a namespace-prefix change rewrites are read from `AGENT_HOSTS`, not listed by hand; a spec renames the prefix in an OpenCode agent the old list missed."

### S2 — A migration keeps what does not regenerate

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts`
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.migrator.ts`
  - `packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "A stray member cache's `evidence`, `logs` and `results` are moved into the workspace's own cache, under a directory named for the member, and only what regenerates (`runtime`, `scratch`) is deleted; the migration report says where each one went."

### S3 — A delegated task carries its tools and acceptance, and says what context it lacks

- **Status**: in-progress
- **Files**:
  - `plugins/agent-orchestrator/src/index.ts`
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
  - "A delegated step's `allowedTools` are the task's own list when `dispatch` is given one, else the tools of the core agent profile its role works under (scout → technical_investigator, implementer and scribe → implementation_runner, verifier and reviewer → delivery_verifier); `acceptance` is the task's checks. The constant empty lists are gone, so an implementer is no longer told to use no tool."
  - "A file the task names that the workspace lacks, and a context source that fails, are listed in the manifest's `missingContext` with their reason, and the prompt a host gets says they are not available, instead of being left out in silence."

### S4 — A failed verification is not a success

- **Status**: in-progress
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`
  - `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "A plan's outcome says whether what ran was verified: `not-run` when it has `verify` steps, which the dispatcher does not execute, `none` when it has none. `ok` still says the steps executed; a verify step that ran nothing is never reported as a verified success."

### S5 — A roadmap entry whose gates contradict its state is named

- **Status**: in-progress
- **Files**:
  - `plugins/roadmap/src/lib/read-model/roadmap-readiness.service.ts`
  - `plugins/roadmap/src/lib/contracts/interfaces/read-model.interface.ts`
  - `plugins/roadmap/src/lib/tools/readiness.tool.ts`
  - `plugins/roadmap/tests/src/lib/read-model/roadmap-readiness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Readiness names, in `closable` and in its reason, every open entry whose gates all pass, with the tool that closes it. The projection stays a function of the roadmap file alone (so committed copies still compare byte for byte); moving a `proposed` entry is the owner's decision, so the four contradicted entries are reported to the owner, not rewritten."

### S6 — The wrong test runner says so

- **Status**: in-progress
- **Files**:
  - `bunfig.toml`
  - `tools/scripts/test/bun-owned-preload.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - "`bun test` on a spec outside `BUN_OWNED_SPECS` refuses with the command that runs it (`bun run test`, `bunx vitest run <file>`); `bun run test:sqlite` still runs all 477 Bun-owned tests green; the unused `test:context-compiler` script, which ran vitest specs under Bun, is removed."

## acceptance

- A namespace migration reaches every host's agents.
- A migration never deletes what cannot be regenerated.
- A delegated task carries its tools and acceptance and says what context it lacks.
- A plan whose verification failed is not reported as succeeded.
- A roadmap entry whose gates contradict its state is named, with the tool that closes it.
- `bun test` cannot judge a vitest spec.
