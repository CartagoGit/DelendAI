---
id: f00541
title: "Execution environments: local, Docker, Docker Compose, SSH, Docker Exec"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00541 — Execution environments: local, Docker, Docker Compose, SSH, Docker Exec

## Goal

Let the delendai agent run in any environment declared in delendai.config.json: local, Docker, Docker Compose, SSH (with jump host), Docker Exec into an existing sidecar. Autodetect the right environment from repo signals (Dockerfile, compose file, .devcontainer/, ssh config annotations) when the user picks auto. Defaults are fail-safe (network: none, user non-root, mounts explicit).

## why

Today the agent implicitly assumes local execution against the repo. That breaks when the agent should run in an isolated container (reproducibility), on a jump host (corporate), in a self-hosted runner (cost control), or inside a sidecar container (multi-service dev). Each case requires a different adapter. Without these adapters delendai is locked to developer laptops.

## non-goals

- Not supporting Kubernetes or Helm in this slice.
- Not supporting Windows Containers or Apple Virtualization.framework.
- Not supporting Podman, Buildah, or containerd CLI.
- Not exposing privileged containers or socket mounts without explicit opt-in confirmation.

## Slices

- global_gate: type

### S1 — IExecutionEnvironment contract and registry
- **Status**: review
- **Files**: `plugins/execution-env/package.json`, `plugins/execution-env/plugin.manifest.ts`, `plugins/execution-env/tsconfig.json`, `plugins/execution-env/vitest.config.ts`, `plugins/execution-env/LICENSE`, `plugins/execution-env/AGENT.md`, `plugins/execution-env/src/index.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/src/lib/contracts/constants/execution-capability.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/execution-env.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/execution-env-types.interface.ts`, `plugins/execution-env/src/lib/registry/execution-env-registry.service.ts`, `plugins/execution-env/tests/src/lib/registry/execution-env-registry.spec.ts`, `tsconfig.base.json`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: the `execution-env` plugin with the `IExecutionEnvironment` contract (id, label, capabilities, prepare, exec, putFile, getFile, teardown, env), the eight-member capability vocabulary and `ExecutionEnvRegistry`, which registers by id and refuses duplicates. `exec` takes an argument vector so data can never become shell syntax.
- acceptance:
  - "Contract exposes id, label, capabilities(), prepare(), exec(), putFile(), getFile(), teardown(), env()."
  - "ExecutionCapability union includes persistent-workspace, isolated-filesystem, isolated-network, shell-bash, shell-pwsh, suspend-resume, forward-secrets, preserve-between-slices."
  - "Registry accepts registrations by id."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Local adapter baseline
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/adapters/local.service.ts`, `plugins/execution-env/tests/local.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Wraps Bun child_process with proper stdio piping."
  - "env() returns process.env filtered through a redaction policy."
  - "prepare and teardown are no-ops but return successfully."

### S3 — Docker CLI adapter
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/adapters/docker-cli.service.ts`, `plugins/execution-env/tests/docker-cli.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Uses docker CLI via spawn (no daemon socket for portability)."
  - "Defaults are network=none, user=1000:1000, cleanupOnExit=always."
  - "Mounts workspace only when explicitly listed."
  - "Capability isolated-filesystem=true; isolated-network only when network=none."
  - "Test skips when docker CLI is not available, never blocks CI."

### S4 — Docker Compose adapter
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/adapters/docker-compose.service.ts`, `plugins/execution-env/tests/docker-compose.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Parses compose file (basic shape) and exposes per-service prepare and exec."
  - "Invokes docker compose run --rm service bash -lc for shell commands."
  - "Supports workdir, env pass-through, and resource limits per service."

### S5 — SSH adapter with keepalive and jump host
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/adapters/ssh.service.ts`, `plugins/execution-env/tests/ssh.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Supports identity file, ssh-agent, and ProxyCommand for jump host (ForwardAgent disabled by default)."
  - "Default keepalive is 30s interval, 4 count max."
  - "Shell quoting is OS-aware (POSIX vs Windows quoting)."
  - "Capability forward-secrets is false unless ssh-agent-forward is configured."

### S6 — Docker Exec adapter for sidecars
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/adapters/docker-exec.service.ts`, `plugins/execution-env/tests/docker-exec.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Resolves container by name or id, supports user switching."
  - "env() reads container env via docker inspect."
  - "teardown does not stop the container (it was existing)."

### S7 — Secret resolver
- **Status**: pending
- **Files**: `plugins/execution-env/src/lib/secret-resolver.service.ts`, `plugins/execution-env/tests/secret-resolver.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Resolves env(file references), file(content references), and ssh-agent-forward (using $SSH_AUTH_SOCK)."
  - "Never writes resolved secrets to disk."
  - "Redaction policy strips values from any accidental log output."

### S8 — Lifecycle integration in orchestrator-runner
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/execution-env.service.ts`, `plugins/orchestrator-runner/tests/execution-env.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Runner calls prepare before slice and teardown after, reporting durations in the slice log."
  - "On prepare failure, the slice is aborted before any code change."

## acceptance

- Contract exposes id, label, capabilities(), prepare(), exec(), putFile(), getFile(), teardown(), env().
- ExecutionCapability union includes persistent-workspace, isolated-filesystem, isolated-network, shell-bash, shell-pwsh, suspend-resume, forward-secrets, preserve-between-slices.
- Registry accepts registrations by id.
- Wraps Bun child_process with proper stdio piping.
- env() returns process.env filtered through a redaction policy.
- prepare and teardown are no-ops but return successfully.
- Uses docker CLI via spawn (no daemon socket for portability).
- Defaults are network=none, user=1000:1000, cleanupOnExit=always.
- Mounts workspace only when explicitly listed.
- Capability isolated-filesystem=true; isolated-network only when network=none.
- Test skips when docker CLI is not available, never blocks CI.
- Parses compose file (basic shape) and exposes per-service prepare and exec.
- Invokes docker compose run --rm service bash -lc for shell commands.
- Supports workdir, env pass-through, and resource limits per service.
- Supports identity file, ssh-agent, and ProxyCommand for jump host (ForwardAgent disabled by default).
- Default keepalive is 30s interval, 4 count max.
- Shell quoting is OS-aware (POSIX vs Windows quoting).
- Capability forward-secrets is false unless ssh-agent-forward is configured.
- Resolves container by name or id, supports user switching.
- env() reads container env via docker inspect.
- teardown does not stop the container (it was existing).
- Resolves env(file references), file(content references), and ssh-agent-forward (using $SSH_AUTH_SOCK).
- Never writes resolved secrets to disk.
- Redaction policy strips values from any accidental log output.
- Runner calls prepare before slice and teardown after, reporting durations in the slice log.
- On prepare failure, the slice is aborted before any code change.
