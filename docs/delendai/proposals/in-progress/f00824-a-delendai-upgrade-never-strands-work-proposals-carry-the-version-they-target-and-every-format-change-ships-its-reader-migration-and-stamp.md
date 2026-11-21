---
id: f00824
title: "A delendai upgrade never strands work: proposals carry the version they target, and every format change ships its reader, migration and stamp"
kind: feat
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-19
last-transition-id: 5e1041bc-b0cc-44ba-a8af-7d9c1b969a00
last-correlation-id: 5e1041bc-b0cc-44ba-a8af-7d9c1b969a00
last-transition-from: ready
last-transition-at: 2026-11-19T08:17:52.714Z
---

# f00824 — A delendai upgrade never strands work: proposals carry the version they target, and every format change ships its reader, migration and stamp

## goal

A delendai upgrade never strands work: proposals say which version they target and can be rebased or recreated, every persisted format change ships its reader, migration and version stamp, consumers run released versions, and a release is certified by migrating the previous release.

## why

Owner, 2026-11-19: other projects that use delendai must not be re-fixed after every change here. Proposals must say which delendai version they apply from, with a way to update them or recreate them for the current version. Work made before a change must keep entering, or migrate safely, with no days lost. Releases must become fast and nearly systematic.

Evidence:
- f00808 changed the work-ref grammar. Old units kept entering only because its S9c added the old shape to PREVIOUS_SHAPES by hand (packages/core/src/lib/work-units/work-ref-shape.service.ts).
- The cache layout has a ratchet (tools/scripts/lint/cache-layout-ratchet.script.ts). Refs, proposal format, config schema and tool output schemas have none.
- x01001 (docs/delendai/proposals/blocked/x01001-a-consumer-project-is-not-stopped-by-delendai-or-by-its-development.md): a consumer project (api-source-tanit) restarted 23 times a day onto this repository's moving develop, and booted DEGRADED on refs this repository's changes left behind.

## non-goals

- Changing consumer projects by hand.
- Keeping readers of formats older than the oldest supported version (that window is policy).

## slices

- global_gate: none

### S1 — One registry of versioned formats, each with its readers, its migration and the version that introduced it
- **Status**: pending
- **Files**: `new:packages/core/src/lib/compat/format-registry.constant.ts`, `new:packages/core/src/lib/contracts/interfaces/format-registry.interface.ts`, `new:packages/core/tests/src/lib/compat/format-registry.constant.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "format-registry.constant.spec.ts: format-registry.constant.ts lists every persisted or exchanged format that delendai owns: work-ref names (work-ref-shape.service.ts), the proposal file format, delendai.config.json, cache layout (cache-layout-ratchet.snapshot.json), tool output schemas, and lockfile/state records. For each it names the current version, the readers of previous versions still supported, and the migration that rewrites one version to the next."
  - "format-registry.constant.spec.ts asserts every listed reader parses a fixture of its version and every migration turns that fixture into one the current reader accepts, idempotently."

### S2 — A change to a registered format without a reader, a migration and a version bump fails before the PR
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:tools/scripts/lint/format-compat.script.ts`, `new:tools/scripts/lint/format-compat.script.spec.ts`, `package.json`, `tools/scripts/lint/cache-layout-ratchet.script.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "format-compat.script.spec.ts: a diff changing a registered format's writer or schema with no new registry entry (reader of the old version + migration + bumped version) fails. cache-layout-ratchet.script.ts becomes one case of this lint, not a second mechanism."
  - "`bun run lint:format-compat` exists in package.json, runs in the CI lint job and in the proof (x01099 S5's manifest); format-compat.script.spec.ts asserts the wiring."

### S3 — Proposals record the delendai version they target, and a command brings them forward
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/proposals/proposal-frontmatter-writer.ts`, `plugins/proposals/src/lib/proposals/frontmatter-parser.ts`, `plugins/proposals/src/lib/proposals/frontmatter-linter.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal-document.tool.ts`, `plugins/proposals/src/lib/proposals/proposal-readiness.ts`, `packages/cli/src/commands/groups/proposals.ts`, `new:packages/cli/src/lib/proposals-rebase-version.service.ts`, `new:packages/cli/src/lib/proposals-rebase-version.service.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "A new proposal's frontmatter carries `delendai-version` (the version of the core that created it), written by proposal-frontmatter-writer.ts and create-proposal-document.tool.ts. The readiness check (proposal-readiness.ts) refuses an open proposal whose version is older than the oldest supported one, naming `delendai proposals rebase-version`."
  - "`delendai proposals rebase-version <id>` (registered in packages/cli/src/commands/groups/proposals.ts) rewrites the proposal's Files and references through the registry's migrations (renamed paths, ref names) and stamps the current version. A slice whose premise no longer holds is reported for recreation, never silently rewritten."

### S4 — `delendai upgrade` migrates a consumer project in one step and in-flight work keeps entering
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:packages/cli/src/lib/upgrade.service.ts`, `new:packages/cli/src/lib/upgrade.service.e2e.spec.ts`, `new:packages/cli/src/commands/upgrade.command.ts`, `packages/cli/src/commands/registry.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "upgrade.service.e2e.spec.ts, in a throwaway project at the previous release: `delendai upgrade --plan` lists every migration and writes nothing. `delendai upgrade` applies them, never renames a ref with an open pull request, and a unit entered before the upgrade still checkpoints and publishes afterwards."
  - "upgrade.service.e2e.spec.ts: a second `delendai upgrade` run changes nothing."

### S5 — Consumers run a released version, never this repository's moving develop
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/host-entry-resolver.service.ts`, `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/cli/src/commands/init/init.command.ts`, `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/cli/src/lib/init/host-entry-resolver.service.spec.ts`, `packages/cli/src/commands/init/init.command.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "init.command.spec.ts and host-entry-resolver.service.spec.ts: init/adopt in a consumer (host-entry-resolver.service.ts writes the server entry; adopt-project.tool.ts adopts) pins a released delendai version; the dogfood checkout is opt-in. A develop change here does not restart a consumer's server. Evidence and the problem statement: x01001 (docs/delendai/proposals/blocked/x01001-a-consumer-project-is-not-stopped-by-delendai-or-by-its-development.md), 23 restarts a day; this slice does not duplicate it, it delivers the pinning it describes."

### S6 — A release is certified only when the previous release's fixtures migrate and its in-flight work enters
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `tools/scripts/forge/certify-integration.script.ts`, `tools/scripts/forge/certify-integration.interface.ts`, `tools/scripts/forge/certify-integration.script.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "certify-integration.script.spec.ts: certification (certify-integration.script.ts) runs S4's e2e from the previous release's tag. A failure blocks the release with the failing format named; nothing else blocks it, so release is the routine output of a green develop."

## acceptance

- format-registry.constant.ts lists every persisted or exchanged format that delendai owns: work-ref names (work-ref-shape.service.ts), the proposal file format, delendai.config.json, cache layout (cache-layout-ratchet.snapshot.json), tool output schemas, and lockfile/state records. For each it names the current version, the readers of previous versions still supported, and the migration that rewrites one version to the next.
- format-registry.constant.spec.ts asserts every listed reader parses a fixture of its version and every migration turns that fixture into one the current reader accepts, idempotently.
- format-compat.script.spec.ts: a diff changing a registered format's writer or schema with no new registry entry (reader of the old version + migration + bumped version) fails. cache-layout-ratchet.script.ts becomes one case of this lint, not a second mechanism.
- Wired in package.json, in the CI lint job and in the proof (x01099 S5's manifest).
- A new proposal's frontmatter carries `delendai-version` (the version of the core that created it), written by proposal-frontmatter-writer.ts and create-proposal-document.tool.ts. The readiness check (proposal-readiness.ts) refuses an open proposal whose version is older than the oldest supported one, naming `delendai proposals rebase-version`.
- `delendai proposals rebase-version <id>` (registered in packages/cli/src/commands/groups/proposals.ts) rewrites the proposal's Files and references through the registry's migrations (renamed paths, ref names) and stamps the current version. A slice whose premise no longer holds is reported for recreation, never silently rewritten.
- upgrade.service.e2e.spec.ts, in a throwaway project at the previous release: `delendai upgrade --plan` lists every migration and writes nothing. `delendai upgrade` applies them, never renames a ref with an open pull request, and a unit entered before the upgrade still checkpoints and publishes afterwards.
- A second run changes nothing.
- init/adopt in a consumer (host-entry-resolver.service.ts writes the server entry; adopt-project.tool.ts adopts) pins a released delendai version; the dogfood checkout is opt-in. A develop change here does not restart a consumer's server. Evidence and the problem statement: x01001 (docs/delendai/proposals/blocked/x01001-a-consumer-project-is-not-stopped-by-delendai-or-by-its-development.md), 23 restarts a day; this slice does not duplicate it, it delivers the pinning it describes.
- Certification (certify-integration.script.ts) runs S4's e2e from the previous release's tag. A failure blocks the release with the failing format named; nothing else blocks it, so release is the routine output of a green develop.
