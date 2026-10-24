---
id: x00952
title: "Plugin writes and installs stay inside the directory they were given"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `packages/client/src/node/scaffold/project-plugins.ts`, `packages/client/src/tests/project-plugins.spec.ts`, `plugins/container/src/lib/tools/container-build.tool.ts`, `packages/core/src/lib/external-tool/run-external-tool.ts`
- **Gate**: type
- acceptance:
  - "pluginsRoot, the plugin id and configFileName that resolve outside the workspace are refused, and no `../` path reaches the config (D22)."
  - "container_build refuses a dockerfile or context outside the workspace (D67)."

### S2 — Downloads and screenshots cannot collide or escape
- **Status**: pending
- **Files**: `plugins/gitlab/src/lib/tools/shared.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.ts`
- **Gate**: type
- acceptance:
  - "The artefact path is checked after realpath; a symlink in the cache pointing outside is refused (GLAB-01)."
  - "Screenshot names are unique per call (counter or random suffix) and written with an exclusive create; two concurrent calls keep both files (D44)."

### S3 — Agent installs are contained, transactional and verified
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/declared-agents.service.ts`, `packages/core/src/lib/shared/agent-registry.service.ts`, `scripts/install.script.ts`, `scripts/install.spec.ts`
- **Gate**: type
- acceptance:
  - "An agent id that resolves outside the install directory is refused (AGENT-INSTALL01)."
  - "Extraction goes to a staging directory and replaces the install only on success; a failed unpack keeps the previous version (AGENT-INSTALL02)."
  - "The installer verifies a published checksum or signature before running what it downloaded, and refuses on mismatch (G108)."

### S4 — The container risk model sees bind mounts
- **Status**: pending
- **Files**: `plugins/container/src/lib/run/docker-risk.helper.ts`, `plugins/container/src/lib/run/docker-command.service.ts`, `plugins/container/src/lib/contracts/constants/docker-tool-input.constant.ts`, `plugins/container/src/lib/tools/container-docker.tool.ts`
- **Gate**: type
- acceptance:
  - "A bind mount of a host path outside the workspace (including / and $HOME) is a named risk that requires confirmRisk (D102)."

## acceptance

- pluginsRoot, the plugin id and configFileName that resolve outside the workspace are refused, and no `../` path reaches the config (D22).
- container_build refuses a dockerfile or context outside the workspace (D67).
- The artefact path is checked after realpath; a symlink in the cache pointing outside is refused (GLAB-01).
- Screenshot names are unique per call (counter or random suffix) and written with an exclusive create; two concurrent calls keep both files (D44).
- An agent id that resolves outside the install directory is refused (AGENT-INSTALL01).
- Extraction goes to a staging directory and replaces the install only on success; a failed unpack keeps the previous version (AGENT-INSTALL02).
- The installer verifies a published checksum or signature before running what it downloaded, and refuses on mismatch (G108).
- A bind mount of a host path outside the workspace (including / and $HOME) is a named risk that requires confirmRisk (D102).
