# @delendai/state-telemetry

Work Event Bus for the @delendai state telemetry (q00020 F1). Append-only stream of work_events with SQLite primary and NDJSON fallback. NO @delendai/core dependency.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/state-telemetry/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Develop

```sh
bun run --cwd packages/state-telemetry test
bun run --cwd packages/state-telemetry build
```
