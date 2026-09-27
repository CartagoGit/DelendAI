---
id: x00713
title: "The server knows who called it"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00694, x00699, x00626]
---

# x00713 — The server knows who called it

## goal

A delendai server started by the CLI sees who is working: the agent
markers and `DELENDAI_*` settings of the shell that called it, and no
secret.

## why

Driven in a throwaway consumer repository on 2026-09-28 with
`DELENDAI_AGENT_ID=model-b` and `AI_AGENT` set, the server the CLI
started announced that work refs "will be named `unknown-agent` — no
model or agent is declared here". The CLI starts its server through the
MCP SDK, which, given no `env`, passes only `PATH`, `HOME`, `SHELL`,
`TERM`, `USER`, `LOGNAME`. Every tool an agent called through the CLI
therefore ran as nobody: work refs lost their model, and the guard's
agent-only rules read the caller as a person. The host decides nothing
here. It is the same on every host.

## why this design

- **Forward exactly what identifies the caller.** The core's
  `AGENT_ENVIRONMENT_MARKERS` (one list, already used by the guard) and
  `DELENDAI_*` settings. A name that says it holds a secret
  (`TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `…_KEY`) never passes,
  even under the prefix.
- **On the SDK's baseline.** `serverEnvironment` adds to
  `getDefaultEnvironment()`; nothing else of the caller's environment
  reaches the server.

## non-goals

- The environment a host gives the servers it starts itself.

## architecture

- `packages/client/src/lib/transport/mcp-stdio-client.ts`: `serverEnvironment`, exported.
- `packages/core/src/cli.ts`: exports `AGENT_ENVIRONMENT_MARKERS`.
- `packages/cli/src/lib/stdio-context.factory.ts`: `forwardedToServer`.

## Slices

- global_gate: none

### S1 — Identity reaches the server

- **Status**: in-progress
- **Gate**: `npx vitest run packages/cli/src/lib/stdio-context.factory.spec.ts`
- **Files**:
  - `packages/client/src/lib/transport/mcp-stdio-client.ts`
  - `packages/client/src/public/index.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/lib/stdio-context.factory.ts`
  - `packages/cli/src/lib/stdio-context.factory.spec.ts`

## dependency graph

None.

## acceptance

- `forwardedToServer` passes the markers and `DELENDAI_*` settings and
  drops `DELENDAI_BOOTSTRAP_TOKEN`, `DELENDAI_API_KEY`, `GITHUB_TOKEN`.
- In a consumer repository, with `DELENDAI_AGENT_ID=model-b`, develop's
  server announces `unknown-agent` and this one does not. Driven for real.
