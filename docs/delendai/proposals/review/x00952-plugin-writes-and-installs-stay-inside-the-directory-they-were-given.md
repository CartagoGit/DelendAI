---
id: x00952
title: "Plugin writes and installs stay inside the directory they were given"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 25917f81-05de-4e48-9a99-732efe4afc79
last-correlation-id: 25917f81-05de-4e48-9a99-732efe4afc79
last-transition-from: in-progress
last-transition-at: 2026-10-27T09:14:30.035Z
shipped-in:
  - "ce33cce00"
---

# x00952 — Plugin writes and installs stay inside the directory they were given

## goal

Scaffolds, builds, downloads, screenshots and agent installs resolve every path inside their root (symlinks included), a failed extraction keeps the previous install, the official installer verifies what it downloads, and the container risk model sees host bind mounts.

## why

Joint audit a00095 and gpt-6.1-sol. D22: createProjectPlugin() joins pluginsRoot and configFileName without containment and can register `../` paths. D67: container_build accepts any dockerfile and context and can build outside the workspace. D44: two concurrent browser screenshots in the same millisecond overwrite each other (path from Date.now()). GLAB-01: the gitlab artefact download escapes the cache through a symlink. AGENT-INSTALL01: a registry identity can leave the install directory. AGENT-INSTALL02: a failed unpack deletes the previous install of the same version. G108: the official installer downloads and runs a remote binary without verifying its integrity. D102: the container risk model ignores arbitrary host bind mounts.

## non-goals

- Network policy (x00951).
- Command argv and environment (the exec proposal).

## slices

- global_gate: type

### S1 — Scaffolds and builds are contained
- **Status**: done
- **Files**: `packages/client/src/node/scaffold/project-plugins.ts`, `packages/client/src/tests/project-plugins.spec.ts`, `plugins/container/src/index.ts`, `plugins/container/src/lib/tools/container-build.tool.spec.ts`, `plugins/container/src/lib/tools/container-build.tool.ts`
- **Gate**: type
- acceptance:
  - "pluginsRoot, the plugin id and configFileName that resolve outside the workspace are refused, and no `../` path reaches the config (D22)."
  - "container_build refuses a dockerfile or context outside the workspace (D67)."
- shipped-in: `ce33cce00`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ce33cce00, validate exit 0 and tests 21/21 claimed, no recorded run cited; acceptance 2/2: (1) project-plugins.ts:296-309 and :328-343 refuse a plugins root or a config file name that resolves outside the workspace; the spec 'refuses a pluginsRoot or con… (2) container-build.tool.ts:147-170 refuses a dockerfile or a context outside the workspace and the spec asserts the refusal for a parent-relative context and for … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 21 tests, exit 0. The plugin id is structurally safe because the kebab-case form keeps it to one path segment.

### S2 — Downloads and screenshots cannot collide or escape
- **Status**: done
- **Files**: `plugins/browser/src/lib/page/browser-page.tool.spec.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`, `plugins/gitlab/src/lib/tools/shared.ts`, `plugins/gitlab/tests/src/lib/tools-sweep.spec.ts`, `plugins/gitlab/tests/src/lib/tools.spec.ts`
- **Gate**: type
- acceptance:
  - "The artefact path is checked after realpath; a symlink in the cache pointing outside is refused (GLAB-01)."
  - "Screenshot names are unique per call (a random suffix after the millisecond); two concurrent calls in the same millisecond keep both files (D44)."
- shipped-in: `ce33cce00`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Agent installs are contained, transactional and verified
- **Status**: done
- **Files**: `packages/core/src/lib/shared/declared-agents.service.ts`, `packages/core/tests/src/lib/shared/declared-agents.service.spec.ts`
- **Gate**: type
- acceptance:
  - "An agent id that resolves outside the install directory is refused (AGENT-INSTALL01)."
  - "Extraction goes to a staging directory and replaces the install only on success; a failed unpack keeps the previous version (AGENT-INSTALL02)."
  - "The installer downloads nothing while no release publishes the binary: it refuses and names the checkout install instead (G108) — delivered earlier, in 4be71381e; scripts/install.spec.ts proves the refusal."
- shipped-in: `ce33cce00`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — The container risk model sees bind mounts
- **Status**: done
- **Files**: `plugins/container/src/lib/run/docker-risk.helper.spec.ts`, `plugins/container/src/lib/run/docker-risk.helper.ts`, `plugins/container/src/lib/tools/container-docker.tool.ts`
- **Gate**: type
- acceptance:
  - "A bind mount of a host path outside the workspace (including / and $HOME) is a named risk that requires confirmRisk (D102)."
- shipped-in: `ce33cce00`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- pluginsRoot, the plugin id and configFileName that resolve outside the workspace are refused, and no `../` path reaches the config (D22).
- container_build refuses a dockerfile or context outside the workspace (D67).
- The artefact path is checked after realpath; a symlink in the cache pointing outside is refused (GLAB-01).
- Screenshot names are unique per call (a random suffix after the millisecond); two concurrent calls in the same millisecond keep both files (D44).
- An agent id that resolves outside the install directory is refused (AGENT-INSTALL01).
- Extraction goes to a staging directory and replaces the install only on success; a failed unpack keeps the previous version (AGENT-INSTALL02).
- The installer downloads nothing while no release publishes the binary: it refuses and names the checkout install instead (G108) — delivered earlier, in 4be71381e; scripts/install.spec.ts proves the refusal.
- A bind mount of a host path outside the workspace (including / and $HOME) is a named risk that requires confirmRisk (D102).
