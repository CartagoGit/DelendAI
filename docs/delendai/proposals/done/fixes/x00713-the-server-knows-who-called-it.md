---
id: x00713
title: "The server knows who called it"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00694, x00699, x00626]
last-transition-id: 4fc2b07b-0af4-4ab9-a66d-1113e7f31088
last-correlation-id: 4fc2b07b-0af4-4ab9-a66d-1113e7f31088
last-transition-from: review
shipped-in:
  - "9e22a7446c8cd4bf277e6ecb5ba0436e9f2efde3"
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

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/lib/stdio-context.factory.spec.ts`
- **Files**:
  - `packages/client/src/lib/transport/mcp-stdio-client.ts`
  - `packages/client/src/public/index.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/lib/stdio-context.factory.ts`
  - `packages/cli/src/lib/stdio-context.factory.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 9e22a7446c. PR MERGED. Identity reaches the server
- review-attribution: claude-opus-5-5 from Merge pull request #575 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00713-all-g1/the-server-knows-who-called-it (refs/heads/delendai/wip/claude-opus-5-5/implement/x00713-all-g1/the-server-knows-who-called-it) (9e22a7446c8cd4bf277e6ecb5ba0436e9f2efde3), opened by minimax-3
## dependency graph

None.

## acceptance

- `forwardedToServer` passes the markers and `DELENDAI_*` settings and
  drops `DELENDAI_BOOTSTRAP_TOKEN`, `DELENDAI_API_KEY`, `GITHUB_TOKEN`.
- In a consumer repository, with `DELENDAI_AGENT_ID=model-b`, develop's
  server announces `unknown-agent` and this one does not. Driven for real.
