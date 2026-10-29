---
id: x00994
title: "Specs pass without per-file isolation"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-29
---

# x00994 — Specs pass without per-file isolation

## goal

Eight specs, and two more their fixes exposed, reset the module state, mocks and counters they depend on, so they pass in a worker shared with other files.

## why

Each spec bound a mock to a module another file had already loaded, or left read counters, mock return values or test order behind. They only passed because every file got a fresh worker.

## non-goals

- Changing any vitest config: the projects keep their own isolation setting.
- Weakening any assertion to make a spec pass.

## slices

- global_gate: none

### S1 — Specs reset what they leave behind
- **Status**: pending
- **Files**: `packages/cli/src/commands/agents.command.spec.ts`, `packages/cli/src/lib/init/init-prompts.service.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex-fs-injection.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex-errno.spec.ts`, `packages/core/tests/src/lib/e2e/first-boot.e2e.spec.ts`, `plugins/proposals/tests/src/lib/services/db-doctor/storage-mode.spec.ts`, `plugins/proposals/tests/src/lib/tools/db-doctor.tool.spec.ts`, `plugins/proposals/tests/src/lib/proposals/index-reader-rebuild.spec.ts`, `plugins/proposals/tests/src/lib/proposals/index-reader.spec.ts`, `plugins/roadmap/tests/src/lib/bump/roadmap-bump-intent.service.spec.ts`
- **Gate**: none

## acceptance

- `npx vitest run --root <project> --no-isolate --sequence.shuffle` passes for cli, core, proposals and roadmap.
- The same specs pass with the project's own isolation setting.
