---
id: f00543
title: "Docker plugin as a tool (autodetected, low-risk)"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00543 — Docker plugin as a tool (autodetected, low-risk)

## Goal

Provide the agent with tools to **control Docker** (build, run, exec, compose up/down/logs/ps, network, volume) from inside an existing environment. The plugin is only active when the repository signals Docker usage (Dockerfile, compose file, .devcontainer/); when absent, tools stay passive and only docker_inspect_repo is available. Defaults are fail-safe: network=none, pullPolicy=if-not-present, cleanupOnExit=always, no socket or privileged containers without explicit user confirmation.

## why

P4 lets the agent **run inside** Docker; P5 lets the agent **use** Docker as a tool (even locally). Dogfooding a repo with compose needs docker_compose_up and friends; today those calls would be raw shell. A first-class plugin gives the agent clean abstractions, autodetection, and a strong safety floor.

## non-goals

- Not enabling privileged containers or socket mounts by default.
- Not supporting Podman, Buildah, or containerd CLI.
- Not implementing registry push/pull to private registries.
- Not auto-executing docker system prune or any host-wide destructive op.

## Slices

- global_gate: type

### S1 — Contract and repo autodetection
- **Status**: pending
- **Files**: `plugins/docker/contract.ts`, `plugins/docker/adapter/cli.ts`, `plugins/docker/adapter/socket.ts`, `plugins/docker/repo-detector.ts`, `plugins/docker/package.json`, `plugins/docker/tests/detect.spec.ts`
- **Gate**: type
- acceptance:
  - "Autodetect only enables active tools when Dockerfile, docker-compose.yml, compose.yaml, or .devcontainer/ exist at the repo root."
  - "Passive mode exposes only docker_inspect_repo when no signals are found."
  - "CLI adapter is default; socket adapter requires explicit opt-in with confirmation."

### S2 — Unit commands: pull, build, run, exec, inspect
- **Status**: pending
- **Files**: `plugins/docker/tools/pull.ts`, `plugins/docker/tools/build.ts`, `plugins/docker/tools/run.ts`, `plugins/docker/tools/exec.ts`, `plugins/docker/tools/inspect.ts`, `plugins/docker/tests/unit-commands.spec.ts`
- **Gate**: type
- acceptance:
  - "Each command shells out to docker CLI with structured stdout and stderr capture."
  - "docker_run with --privileged or --volume /var/run/docker.sock requires interactive confirmation even from a script."
  - "docker_pull respects pullPolicy=if-not-present."

### S3 — Compose awareness (parser + tools)
- **Status**: pending
- **Files**: `plugins/docker/compose-parser.ts`, `plugins/docker/tools/compose.ts`, `plugins/docker/tests/compose.spec.ts`
- **Gate**: type
- acceptance:
  - "Parser handles compose YAML to the extent needed to enumerate services, ports, env, mounts."
  - "Tools: compose_up, compose_down, compose_logs, compose_ps, compose_exec."
  - "compose_up targets a single service by default; --all flag for the full stack."

### S4 — Network and volume tools
- **Status**: pending
- **Files**: `plugins/docker/tools/network.ts`, `plugins/docker/tools/volume.ts`, `plugins/docker/tests/network-volume.spec.ts`
- **Gate**: type
- acceptance:
  - "Network tools: create, list, connect, disconnect, remove."
  - "Volume tools: list, inspect, prune testing artifacts (scope-tagged, never docker volume prune host-wide)."

### S5 — Tests with sandboxed containers
- **Status**: pending
- **Files**: `plugins/docker/tests/integration/up-down.spec.ts`, `plugins/docker/tests/integration/sandbox.spec.ts`, `plugins/docker/tests/integration/cleanup.spec.ts`
- **Gate**: type
- acceptance:
  - "Integration tests use unique container and volume names per test."
  - "Cleanup is verified; no orphan containers or volumes persist across runs."
  - "Skipped automatically when docker CLI is not available; CI failure never caused by absent docker."

### S6 — Documentation and security guide
- **Status**: pending
- **Files**: `docs/delendai/docker-plugin.md`, `docs/delendai/docker-plugin-security.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "docs cover 3 example stacks: WordPress dev (compose), Node dev container, self-hosted runner image."
  - "Security guide explains the autodetection rationale and how to opt in to socket or privileged mode safely."

## acceptance

- Autodetect only enables active tools when Dockerfile, docker-compose.yml, compose.yaml, or .devcontainer/ exist at the repo root.
- Passive mode exposes only docker_inspect_repo when no signals are found.
- CLI adapter is default; socket adapter requires explicit opt-in with confirmation.
- Each command shells out to docker CLI with structured stdout and stderr capture.
- docker_run with --privileged or --volume /var/run/docker.sock requires interactive confirmation even from a script.
- docker_pull respects pullPolicy=if-not-present.
- Parser handles compose YAML to the extent needed to enumerate services, ports, env, mounts.
- Tools: compose_up, compose_down, compose_logs, compose_ps, compose_exec.
- compose_up targets a single service by default; --all flag for the full stack.
- Network tools: create, list, connect, disconnect, remove.
- Volume tools: list, inspect, prune testing artifacts (scope-tagged, never docker volume prune host-wide).
- Integration tests use unique container and volume names per test.
- Cleanup is verified; no orphan containers or volumes persist across runs.
- Skipped automatically when docker CLI is not available; CI failure never caused by absent docker.
- docs cover 3 example stacks: WordPress dev (compose), Node dev container, self-hosted runner image.
- Security guide explains the autodetection rationale and how to opt in to socket or privileged mode safely.
