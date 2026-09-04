# AGENT.md — plugin `plugins/container`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Container inspection + lint (docker ps/images, k8s, Dockerfile rules).

## Public API

- parseDockerPs
- parseDockerImages
- parseKubectlGet
- runInspect
- PODMAN_TOOL
- parseDockerLogs
- runLogs
- parseDockerfile
- applyDockerfileRules
- runLint
- buildContainerInspectToolRegistrations
- buildContainerLintToolRegistrations
- buildContainerLogsToolRegistrations

## Depends on

- @delendai/core
- zod

## Writes

- <host workspace>/.delendai/cache/container/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/container/src/lib/inspect/docker-images.spec.ts
- plugins/container/src/lib/inspect/docker-ps.spec.ts
- plugins/container/src/lib/inspect/parse-docker-images.spec.ts
- plugins/container/src/lib/inspect/parse-docker-ps.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

