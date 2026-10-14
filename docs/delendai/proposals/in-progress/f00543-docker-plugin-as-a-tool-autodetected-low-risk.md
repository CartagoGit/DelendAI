---
id: f00543
title: "Docker plugin as a tool (autodetected, low-risk)"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-09-15
last-transition-id: 11180e3a-acbf-4176-95b3-9d629ef52cbe
last-correlation-id: 11180e3a-acbf-4176-95b3-9d629ef52cbe
last-transition-from: review
last-transition-at: 2026-10-14T10:45:37.875Z
shipped-in:
  - "5b6b9e1e2d0c00840393a25137fe1b78f8479c8e"
---

# f00543 — Docker plugin as a tool (autodetected, low-risk)

## Goal

Give the agent tools to **control Docker** (build, run, exec, compose up/down/logs/ps, network, volume) from inside an existing environment. The plugin is only active when the repository signals Docker usage (Dockerfile, compose file, .devcontainer/); when absent, tools stay passive and only docker_inspect_repo is available. Defaults are fail-safe: network=none, pullPolicy=if-not-present, cleanupOnExit=always, no socket or privileged containers without explicit user confirmation.

## why

P4 lets the agent **run inside** Docker; P5 lets the agent **use** Docker as a tool (even locally). Dogfooding a repo with compose needs docker_compose_up and friends; today those calls would be raw shell. A first-class plugin gives the agent clean abstractions, autodetection, and a strong safety floor.

## non-goals

- Not enabling privileged containers or socket mounts by default.
- Not supporting Podman, Buildah, or containerd CLI.
- Not implementing registry push/pull to private registries.
- Not auto-executing docker system prune or any host-wide destructive op.

## Slices

- global_gate: type

The owner decided (2026-10-09) that these tools extend `plugins/container`, which already inspects, lints and builds, instead of creating `plugins/docker`. The slices below are written for that home.

### S1 — Autodetection, and a passive plugin without it

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/detect/docker-signals.service.ts`
  - `plugins/container/src/lib/contracts/constants/docker-signals.constant.ts`
  - `plugins/container/src/index.ts`
  - `plugins/container/src/lib/detect/docker-signals.service.spec.ts`
  - `plugins/container/src/index.spec.ts`
- **Gate**: type
- acceptance:
  - The Docker tools are always registered, so what the plugin offers (and the generated catalog) never depends on the folder the server starts in. Without a root `Dockerfile`, compose file or `.devcontainer/`, every change they would make is refused with the reason, and reading stays free.
  - The CLI is the only adapter. A socket adapter is out of scope.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 5b6b9e1e2d0c, validate exit 0, tests 52/53 — Verified always-on registration plus passive refusal without Docker signals, with narrow gate green (tsc) and plugin tests 52 passed, 1 skipped.

### S2 — Pull, run and exec under one set of consent rules

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/run/docker-command.service.ts`
  - `plugins/container/src/lib/run/docker-risk.helper.ts`
  - `plugins/container/src/lib/contracts/interfaces/docker-command.interface.ts`
  - `plugins/container/src/lib/contracts/constants/docker-tool-input.constant.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
  - `plugins/container/package.json`
- **Gate**: type
- acceptance:
  - Each tool runs the docker CLI and returns structured stdout, stderr and exit code. A missing CLI is a typed `install-missing` answer.
  - A change needs `confirm: true`, and `dryRun: true` returns the command without running it.
  - A privileged container, a docker socket mount, or the host's network, pid or ipc namespace also needs `confirmRisk: true`, which `confirm` never implies.
  - `container_pull` with `policy: "if-not-present"` (the default) pulls only a missing image.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 5b6b9e1e2d0c, validate exit 0, tests 52/53 — Verified consent enforcement and typed install-missing handling in runDocker and container_run/container_pull/container_exec, with narrow gate green (tsc) and plugin tests 52 passed, 1 skipped.

### S3 — Compose: the services, and up, down, logs, ps, exec

- **Status**: in-progress
- **Files**:
  - `plugins/container/src/lib/compose/compose-parser.service.ts`
  - `plugins/container/src/lib/compose/compose-parser.service.spec.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
- **Gate**: type
- acceptance:
  - The parser lists services with their image or build context, ports, environment variable names (never values) and mounts.
  - `container_compose` covers `services`, `ps`, `logs`, `up`, `down` and `exec`. `up` starts one named service unless `all: true`, refuses a service the file does not declare, and checks every service it would start for host-reaching risks.
- shipped-in: `79da5118f701`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: requested_changes by gpt-5.4 — `container_compose up` does not enforce the full host-reaching risk contract promised by this slice. In plugins/container/src/lib/contracts/interfaces/docker-command.interface.ts, `IComposeService` only carries mounts, and in plugins/container/src/lib/compose/compose-parser.service.ts the parser never reads `privileged`, `network_mode`, `pid`, or `ipc`. Then plugins/container/src/lib/tools/container-docker.tool.ts computes compose `up` risks from `containerRisks({ mounts: service.mounts })` only. A compose service that is privileged or uses `network_mode: host`, `pid: host`, or `ipc: host` can therefore start with `confirm: true` and no `confirmRisk: true`, which violates the second acceptance criterion. Please extend the compose model/parser plus the `up` risk check and add coverage for those cases.

### S4 — Networks and volumes

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
- **Gate**: type
- acceptance:
  - `container_network` and `container_volume` list and inspect freely. `create` and `rm` need `confirm` and a name.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 5b6b9e1e2d0c, validate exit 0, tests 52/53 — Verified network and volume reads stay free while create/rm require confirm and a resource name, with narrow gate green (tsc) and plugin tests 52 passed, 1 skipped.

### S5 — Against the real daemon, in a sandbox of its own

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/tools/container-docker.integration.spec.ts`
- **Gate**: type
- acceptance:
  - Where a daemon answers, the spec creates, lists and removes a network and a volume under a unique name. It removes them however the spec ends. It runs a throwaway container only from an image already present, never pulling, and checks that nothing is left behind. Without a daemon it is skipped.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 5b6b9e1e2d0c, validate exit 0, tests 52/53 — Verified the daemon-facing integration spec is isolated by unique names, cleanup in afterAll, no implicit pull, and skip behavior when no daemon answers; narrow gate green (tsc) and plugin tests 52 passed, 1 skipped.

### S6 — Documentation and the safety guide

- **Status**: in-progress
- **Files**:
  - `plugins/container/README.md`
- **Gate**: type
- acceptance:
  - The README lists each tool and the consent it needs. A safety section explains why reaching the host needs its own consent, why environment values are never returned, and what stays out of scope.
- shipped-in: `79da5118f701`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: requested_changes by gpt-5.4 — The README does not accurately list the consent the compose tool needs. In plugins/container/README.md the tool table says `container_compose` needs only `confirm` for `up`, `down` and `exec`, while the safety section says compose `up` checks host-reaching risks like other container starts. The implementation currently does not enforce `confirmRisk` for privileged or host-namespace compose services, and even once S3 is fixed the table still needs to state that risky compose `up` operations also require `confirmRisk: true`. Please align the README's per-tool consent listing and safety guidance with the actual compose risk contract.

## acceptance

- Without a root `Dockerfile`, compose file or `.devcontainer/`, the Docker tools only read: every change is refused with the reason. They are registered everywhere, so the catalog does not depend on where it is generated.
- Every Docker tool runs the CLI, returns structured stdout, stderr and exit code, and answers a missing CLI with `install-missing`.
- A change needs `confirm: true`. A container that reaches the host (privileged, the docker socket, the host's network, pid or ipc namespace) also needs `confirmRisk: true`, which `confirm` never implies, from any caller.
- `container_pull` pulls only a missing image under the default `if-not-present` policy.
- The compose parser lists services, ports, environment variable names (never values) and mounts. `container_compose up` starts one service unless `all: true`.
- Networks and volumes are listed and inspected freely, and created or removed only with `confirm`.
- The integration spec uses names of its own, removes everything it created, never pulls, and is skipped without a daemon.
- The README documents each tool's consent and the safety rationale.

Cut at hand-over, and why: network `connect`/`disconnect` and scope-tagged volume pruning (no consumer asked; `rm` covers the spec's clean-up); the three example stacks in the docs (left for when a consumer brings one); a socket adapter (the CLI is the only adapter).
