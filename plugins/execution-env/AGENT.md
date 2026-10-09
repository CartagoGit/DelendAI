# AGENT.md — plugin `plugins/execution-env`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Execution environments: one contract and registry for running commands locally, in Docker, Docker Compose, over SSH or inside an existing container.

## Public API

- default
- EXECUTION_CAPABILITIES
- ExecutionEnvRegistry
- REDACTED_VALUE
- defaultEnvRedactionPolicy
- redactEnvironment
- runPlanned
- LocalExecutionEnvironment
- createSpawnProcessRunner
- DockerCliExecutionEnvironment
- inspectContainerEnvironment
- parseEnvironmentEntries
- DockerComposeExecutionEnvironment
- parseComposeFile

## Depends on

- zod
- yaml
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/execution-env/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/execution-env/tests/src/lib/adapters/docker-cli.spec.ts
- plugins/execution-env/tests/src/lib/adapters/docker-compose.spec.ts
- plugins/execution-env/tests/src/lib/adapters/docker-exec.spec.ts
- plugins/execution-env/tests/src/lib/adapters/local.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

