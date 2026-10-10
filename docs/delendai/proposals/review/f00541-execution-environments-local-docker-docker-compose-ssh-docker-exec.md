---
id: f00541
title: "Execution environments: local, Docker, Docker Compose, SSH, Docker Exec"
kind: feat
status: review
type: proposal
track: general
date: 2026-09-15
last-transition-id: b8cb94de-b4b6-4e21-aecc-0ec4dd84c004
last-correlation-id: b8cb94de-b4b6-4e21-aecc-0ec4dd84c004
last-transition-from: in-progress
last-transition-at: 2026-10-09T15:39:55.779Z
shipped-in:
  - "b201fe50ec0d28cf0a76c1370a2465c43cf488f7"
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
- **Status**: done
- **Files**: `plugins/execution-env/package.json`, `plugins/execution-env/plugin.manifest.ts`, `plugins/execution-env/tsconfig.json`, `plugins/execution-env/vitest.config.ts`, `plugins/execution-env/LICENSE`, `plugins/execution-env/AGENT.md`, `plugins/execution-env/src/index.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/src/lib/contracts/constants/execution-capability.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/execution-env.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/execution-env-types.interface.ts`, `plugins/execution-env/src/lib/registry/execution-env-registry.service.ts`, `plugins/execution-env/tests/src/lib/registry/execution-env-registry.spec.ts`, `tsconfig.base.json`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: the `execution-env` plugin with the `IExecutionEnvironment` contract (id, label, capabilities, prepare, exec, putFile, getFile, teardown, env), the eight-member capability vocabulary and `ExecutionEnvRegistry`, which registers by id and refuses duplicates. `exec` takes an argument vector so data can never become shell syntax.
- acceptance:
  - "Contract exposes id, label, capabilities(), prepare(), exec(), putFile(), getFile(), teardown(), env()."
  - "ExecutionCapability union includes persistent-workspace, isolated-filesystem, isolated-network, shell-bash, shell-pwsh, suspend-resume, forward-secrets, preserve-between-slices."
  - "Registry accepts registrations by id."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S2 — Local adapter baseline
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/adapters/local.service.ts`, `plugins/execution-env/src/lib/runners/spawn-process-runner.service.ts`, `plugins/execution-env/src/lib/helpers/env-redaction.helper.ts`, `plugins/execution-env/src/lib/helpers/run-planned.helper.ts`, `plugins/execution-env/src/lib/contracts/constants/env-redaction.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/env-redaction.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/local-execution.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/process-runner.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/run-planned.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/tests/src/lib/adapters/fake-process-runner.ts`, `plugins/execution-env/tests/src/lib/adapters/local.spec.ts`, `plugins/execution-env/tests/src/lib/helpers/env-redaction.spec.ts`, `plugins/execution-env/tests/src/lib/runners/spawn-process-runner.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: the local adapter over a typed `IProcessRunner` seam. The real runner spawns with `shell: false` behind `guardEffectCapability('spawn')`, so a dry run cannot start a process; `runPlanned` reports the planned argument vector instead. `env()` shows the process environment through a name-based redaction policy while commands still receive the real values. Files are contained to the workspace (safe reader, atomic writer). `prepare` and `teardown` succeed without doing anything.
- acceptance:
  - "Wraps Bun child_process with proper stdio piping."
  - "env() returns process.env filtered through a redaction policy."
  - "prepare and teardown are no-ops but return successfully."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S3 — Docker CLI adapter
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/adapters/docker-cli.service.ts`, `plugins/execution-env/src/lib/helpers/docker-args.helper.ts`, `plugins/execution-env/src/lib/helpers/docker-env.helper.ts`, `plugins/execution-env/src/lib/contracts/constants/docker-cli.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/docker-cli-execution.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/execution-env-types.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/tests/src/lib/adapters/docker-cli.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: `DockerCliExecutionEnvironment` drives the docker CLI by spawn through the `IProcessRunner` seam (no daemon socket). `prepare` runs a detached idle container with `--network=none`, `--user=1000:1000` and `--rm` by default, mounting only what is listed (read-only unless stated) and refusing the docker socket without `allowDockerSocket`. Every option uses the `--flag=value` form and `--` ends options before the image, the container name and the command. Files move over stdin and a constant script with the path as a positional parameter. `env()` reads `docker inspect` and redacts. Dry run returns the planned argument vectors. All specs use a typed fake runner, so none needs a docker CLI and none can block CI.
- acceptance:
  - "Uses docker CLI via spawn (no daemon socket for portability)."
  - "Defaults are network=none, user=1000:1000, cleanupOnExit=always."
  - "Mounts workspace only when explicitly listed."
  - "Capability isolated-filesystem=true; isolated-network only when network=none."
  - "Test skips when docker CLI is not available, never blocks CI."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S4 — Docker Compose adapter
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/adapters/docker-compose.service.ts`, `plugins/execution-env/src/lib/adapters/command-only-environment.service.ts`, `plugins/execution-env/src/lib/adapters/docker-cli.service.ts`, `plugins/execution-env/src/lib/helpers/compose-parser.helper.ts`, `plugins/execution-env/src/lib/helpers/compose-args.helper.ts`, `plugins/execution-env/src/lib/helpers/file-transfer.helper.ts`, `plugins/execution-env/src/lib/contracts/constants/compose.constant.ts`, `plugins/execution-env/src/lib/contracts/constants/file-transfer.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/compose-file.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/compose-execution.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/exec-function.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/package.json`, `plugins/execution-env/tests/src/lib/adapters/docker-compose.spec.ts`, `plugins/execution-env/tests/src/lib/helpers/compose-parser.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: `parseComposeFile` reads the basic shape of a compose file (services with image, working directory, environment as map or list, ports, volumes, and limits from `mem_limit`, `cpus` or `deploy.resources.limits`). `DockerComposeExecutionEnvironment` is one service: `prepare` reads the file through the safe reader and checks the service exists and that its declared limits are within an optional ceiling; `exec` runs `docker compose run --rm -T --no-deps ... -- service bash -lc 'exec "$@"' bash <command>`, so the command is positional parameters and never shell text. Host variables are forwarded by name only. `CommandOnlyEnvironment` holds file transfer once for the docker and compose adapters. Compose cannot set limits on `run`, so limits are read from the file and enforced as a precondition rather than applied.
- acceptance:
  - "Parses compose file (basic shape) and exposes per-service prepare and exec."
  - "Invokes docker compose run --rm service bash -lc for shell commands."
  - "Supports workdir, env pass-through, and resource limits per service."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S5 — SSH adapter with keepalive and jump host
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/adapters/ssh.service.ts`, `plugins/execution-env/src/lib/helpers/ssh-args.helper.ts`, `plugins/execution-env/src/lib/helpers/shell-quoting.helper.ts`, `plugins/execution-env/src/lib/contracts/constants/ssh.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/ssh-execution.interface.ts`, `plugins/execution-env/src/lib/contracts/interfaces/remote-command.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/tests/src/lib/adapters/ssh.spec.ts`, `plugins/execution-env/tests/src/lib/helpers/shell-quoting.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: `SshExecutionEnvironment` drives the ssh binary through the process seam. Defaults: `BatchMode=yes`, `StrictHostKeyChecking=yes`, `ForwardAgent=no`, `ServerAliveInterval=30`, `ServerAliveCountMax=4`. It takes an identity file (with `IdentitiesOnly`), an optional ssh-agent opt-out, a jump host (`-J`) or a proxy command given as an argument vector, and refuses a host, user or port that could be read as an option; `--` ends the options before the host. ssh can only carry one string to the remote shell, so the command is quoted per dialect: POSIX single quotes with the `'\''` escape, PowerShell single quotes doubling the ASCII and typographic quote characters, variable names validated and never quoted. On a Windows host file paths travel in a variable, not in script text. `forward-secrets` is promised only when `forwardAgent` is set.
- acceptance:
  - "Supports identity file, ssh-agent, and ProxyCommand for jump host (ForwardAgent disabled by default)."
  - "Default keepalive is 30s interval, 4 count max."
  - "Shell quoting is OS-aware (POSIX vs Windows quoting)."
  - "Capability forward-secrets is false unless ssh-agent-forward is configured."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S6 — Docker Exec adapter for sidecars
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/adapters/docker-exec.service.ts`, `plugins/execution-env/src/lib/contracts/constants/docker-cli.constant.ts`, `plugins/execution-env/src/lib/contracts/interfaces/docker-exec-execution.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/tests/src/lib/adapters/docker-exec.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: `DockerExecExecutionEnvironment` runs `docker exec` into an existing container given by name or id (the reference must start alphanumeric, so it cannot be an option). `prepare` only inspects that the container is running. `--user` switches user, `--workdir` sets the directory, the command follows `--`. `env()` reads `docker inspect` and redacts. `teardown` runs nothing: the container was there before and is not ours to stop.
- acceptance:
  - "Resolves container by name or id, supports user switching."
  - "env() reads container env via docker inspect."
  - "teardown does not stop the container (it was existing)."
- shipped-in: `197d9d2cfd61`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S7 — Secret resolver
- **Status**: done
- **Files**: `plugins/execution-env/src/lib/secret-resolver.service.ts`, `plugins/execution-env/src/lib/contracts/interfaces/secret-resolver.interface.ts`, `plugins/execution-env/src/public/index.ts`, `plugins/execution-env/tests/src/lib/secret-resolver.spec.ts`
- **Gate**: `npx vitest run --root plugins/execution-env`
- shipped: `resolveSecrets` turns references into in-memory values: `env` (host variable, optionally under another name), `file` (content, one trailing newline dropped) and `ssh-agent-forward` (the socket from `SSH_AUTH_SOCK`, an error when unset). Sources are injected so specs need no real host. Errors name the reference, never the value. The module has no write path, and a spec proves resolving from the real host leaves the directory unchanged. The returned `redact` removes every resolved value (longest first) and then applies the core secret redactor, for any text about to be logged.
- acceptance:
  - "Resolves env(file references), file(content references), and ssh-agent-forward (using $SSH_AUTH_SOCK)."
  - "Never writes resolved secrets to disk."
  - "Redaction policy strips values from any accidental log output."
- shipped-in: `e6f2613329ac`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b201fe50ec0d, validate exit 0, tests 101/101 — Ran the plugin suite in the review unit (11 files, 101 tests, green) and read the code against each criterion; every command is an argv with the options ended before data, and nothing needs a daemon or a host to test.

### S8 — Lifecycle integration in orchestrator-runner
- **Status**: review
- **Files**: `plugins/orchestrator-runner/src/lib/services/execution-env.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/execution-env-lifecycle.interface.ts`, `plugins/orchestrator-runner/src/public/index.ts`, `plugins/orchestrator-runner/tests/execution-env.service.spec.ts`
- **Gate**: `npx vitest run --root plugins/orchestrator-runner tests/execution-env.service.spec.ts`
- shipped: `runInExecutionEnvironment` prepares an environment, runs the slice, then tears down, logging each phase with its duration (and passing it to an `onLog` sink). When `prepare` fails or throws the slice is never called; teardown runs whenever prepare was attempted, also after a failing slice; a failed teardown after a good slice is reported as a failure. The environment is described by a two-method structural interface, so the runner takes no package dependency on the environment plugin.
- acceptance:
  - "Runner calls prepare before slice and teardown after, reporting durations in the slice log."
  - "On prepare failure, the slice is aborted before any code change."
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- shipped-in: `e1504fba93b0`

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
