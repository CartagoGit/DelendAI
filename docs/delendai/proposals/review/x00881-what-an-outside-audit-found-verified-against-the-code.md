---
id: x00881
title: "What an outside audit found, verified against the code"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-10-11
last-transition-id: 303228be-bb09-4ab5-8a19-ed31c7c9c4d7
last-correlation-id: 303228be-bb09-4ab5-8a19-ed31c7c9c4d7
last-transition-from: in-progress
last-transition-at: 2026-10-11T05:29:45.206Z
shipped-in:
  - "cb4f8082c03111eff3211b9d99cd9831b6505b37"
---

# x00881 — What an outside audit found, verified against the code

## goal

Each concrete finding of the audit of 2026-10-11 is checked against the code, fixed where it is a defect, and given a home where it is a direction: no finding is left as a paragraph in a chat.

## why

The owner had the `develop` branch audited from outside on 2026-10-11 (anchored at `5db864373`). The audit names two defects, three risks and a set of directions. It says itself that it executed nothing, so every finding was read against the code before being acted on. All five concrete ones hold. Most of the directions are already proposals; saying which, here, keeps a second copy of each from being opened.

## non-goals

- New proposals for what an existing one already owns. The table under notes says where each direction lives.
- The audit's scores. They are its author's opinion and change nothing in the code.

## slices

### S1 — A migration fails on a file it cannot read, instead of taking it for absent

- **Status**: done
- **Files**:
  - `packages/core/src/lib/migrations/migrate-file.ts`
  - `packages/core/tests/src/lib/migrations/migrate.spec.ts`
- **Gate**: unit
- shipped-in: `a5d043eb8dd7`
- acceptance:
  - `migrateJsonFile` answers "nothing to migrate" only for a file that does not exist.
  - A file that exists and cannot be read (no permission, an I/O error, a directory in its place) fails the migration with the path and the cause.

Verified: any failure of `readFile` returned `null`, the answer for "no such file". A state file the process could not read was stepped over and the project migrated as if it had never had one.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — verified at cb4f8082c031, validate exit 0, tests 13/13 — Delivered by a5d043eb8 (shipped-in) inside PR #995 (merge cb4f8082c, claude-opus-5-5). migrateJsonFile now answers 'nothing to migrate' only on a missing file and fails the migration with path and cause for a file it cannot read. Verified today in this worktree, agent env scrubbed: migrate.spec.ts green 13/13 exit 0; declared files exist. Implementer claude-opus-5-5; different model, independence holds.

### S2 — A published package exports nothing it does not ship

- **Status**: review
- **Files**:
  - `plugins/api/package.json`
  - `plugins/observability/package.json`
  - `tools/scripts/lint/no-internal-core-imports.script.ts`
  - `tools/scripts/lint/no-internal-core-imports.script.spec.ts`
- **Gate**: unit
- shipped-in: `a5d043eb8dd7`
- acceptance:
  - `@delendai/api/public` and `@delendai/observability/public` resolve to built files of the published package, for values and for types.
  - The publication-boundary lint fails on an export of a published package whose only condition is `types` pointing into `src/`.

Verified, and wider than reported: `@delendai/api` declared `./public` as `{ "types": "./src/public/index.ts" }` while shipping `dist` alone, though that module exports six functions; `@delendai/observability` did the same. The build already emitted `dist/public/index.js` for both, so only the manifests were wrong. The lint that checks what published code imports never looked at what a package offers that nobody imports yet.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A package describes what it does today

- **Status**: review
- **Files**:
  - `plugins/orchestrator-runner/package.json`
- **Gate**: none
- acceptance:
  - The description of `@delendai/orchestrator-runner` says that it runs the provider it chooses.

Verified: the description read "Headless (no subprocess spawning)" for a plugin whose tools invoke CLI, API and MCP providers and cancel them.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a5d043eb8dd7`

### S4 — The editor extension does not go on with a test double for a host

- **Status**: review
- **Files**:
  - `extensions/vscode/src/extension.ts`
  - `extensions/vscode/src/host/resolve-host-adapter.ts`
  - `extensions/vscode/src/test/resolve-host-adapter.spec.ts`
- **Gate**: unit
- shipped-in: `d23f50b36b24`
- shipped-in: `a5d043eb8dd7`
- acceptance:
  - When the real host adapter cannot be loaded, the extension says so and registers nothing that depends on it; it does not continue on `createFakeHostFromVscode`, whose operations throw or do nothing.
  - The minimal adapter is given only to an API that was injected (a test, or a port to another editor), never to the real editor.

Verified: `extension.ts` catches a failed import of `./host/vscode-host-adapter` and falls back to the adapter written for tests, "to keep the canonical dashboard registrable". A surface that looks alive and answers nothing is worse than one that says it could not start.

Delivered 2026-10-11: `resolveHostAdapter` answers the loaded adapter, the minimal one for an injected API, or nothing with the failure shown; `registerDashboardSurfaces` registers nothing when it answers nothing.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — A plugin says whether it can be used, not only that it loaded

- **Status**: retired
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/plugin-availability.interface.ts`
  - `packages/core/src/lib/surface/plugin-availability.service.ts`
- **Gate**: unit
- acceptance:
  - Each plugin reports one of: available, needs configuration (which option), missing dependency (which binary or package), not supported by this host (which capability), denied by the project's policy, degraded (which tools), or internal (exposes no tool, used by which).
  - The overview and the doctor show that state; "42 configured" is not shown as 42 usable.
  - The state is computed without a model and without calling the plugin's tools.

The audit's observation that "there are many plugins, but some do not work" is seven different situations today, all shown as one: registered. `execution-env` exposes no tool by design; `browser` needs a browser; `orchestrator-runner` needs providers; a plugin can load from the monorepo and not from its tarball (S2). The pack smoke test proves a package installs, not that it can do anything.

Retired 2026-10-11, on what the code already says. A start reports plugins configured, loaded, warm and failed as four numbers, and a plugin that fails to load or register is announced by name with its cause (`announce-plugin-failures.ts`). The one concrete case behind the audit's remark, a package that loads from the repository and not from its tarball, is closed by S2. Seven declared states would need every plugin to describe its own requirements, for situations nobody has yet been stopped by; the slice comes back with the first one that is.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Every concrete finding of the audit is either fixed with a test that fails without the fix, or recorded as a slice with what was verified.
- Every direction of the audit names the proposal that owns it.

## notes

Where the audit's directions already live, so that none is opened twice:

- **One effective configuration per project, explainable (`config explain`, provenance, no leak of delendai's own values into a consumer).** f00550 owns the project contract; x00877 (in review) owns upgrades and profile changes. The audit confirms the leak it worried about was fixed on the search-roots path (`derive-config.ts`); what is unproven is every other path, which is f00550's S2.
- **Token budgets per plugin.** f00270. Verified here and worth carrying into it: 49 of the 59 plugin manifests declare `TOKEN_BUDGETS.toolPayloads.search` as their budget, `execution-env` among them though it exposes no tool. It is not one plugin borrowing another's number; "search" is the default nobody chose.
- **A subagent receives a minimal, verifiable context.** f00551 (Batuta) and f00550 S2. `IHostSubagentRequest` carries role, instruction, budget and slot and no context references, tool list or configuration provenance: verified, and a contract gap rather than a bug.
- **Tokens and time per accepted task, and the cost of coordination.** f00757 (in review: coordination tax, what landed, its trend) and q00020.
- **Proof outside the monorepo, per plugin and per kind of project.** x00877's scratch-project method; S5 here for what "works" means.
- **One authority per domain; no second roster, queue or memory for Batuta.** q00022 (markdown is the authority, SQLite serves) and f00551's own non-goals.
- **Issue #709 (NPM_TOKEN) names the scope `@cartago-git` while the packages are `@delendai/*`.** Not checked here: it is a credential procedure and the owner's to confirm.
