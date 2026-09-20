---
id: x00560
title: "The agent a ref is named after has one source of truth"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - identity
    - work-refs
    - contracts
    - swarm
---

# x00560 — The agent a ref is named after has one source of truth

## goal

"Who is working" is answered in exactly one place, reused by every entry
point, and the answer is never the computer.

## why

Three parts of the system answer this question, each its own way:

- the `commit-policy` plugin walks model → host → MCP client → **machine**;
- the CLI reads `--agent`, then `DELENDAI_AGENT_ID`, then nothing;
- the host builds `host@<config name>`.

The refs show it. In this repository, right now:

```
delendai/wip/desktop-9ctqrs7/x00080-S3-g1-…
delendai/wip/visual-studio-code/r00043-S0-g1-…
delendai/wip/claude-opus-5/…
```

Three naming schemes for the same convention, and one of them names the
**hardware**. That is wrong twice over: it tells a reader who owns the
computer rather than who did the work, and in a swarm it collapses every
agent on one machine into a single name — destroying the attribution the
whole work model rests on.

The previous implementation also only lowercased, so an MCP client called
`Visual Studio Code` produced `visual studio code` — spaces included —
and its spec pinned that as correct. A git ref component cannot contain a
space; the name only survived because `resolveWorkRef` sanitises again
downstream, which is itself a second source of truth about what a valid
identity looks like.

## non-goals

- **No renaming of existing refs.** Work that already carries a
  machine-named ref keeps it; deleting or rewriting somebody's ref to fix
  a name is exactly the trade this project refuses.
- **No new configuration.** Every source used here is one a host already
  has: the declared model, the environment, the MCP handshake.

## slices

### S1 — One resolver, in core, reused everywhere

- **Status**: done — `resolveWorkAgentId` answers with the identity AND
  the source it came from (`model | environment | client | none`), and
  normalises it to what a git ref component accepts. The machine is not
  a source: when nothing declares who is working the answer is
  `unknown-agent`, which is a statement an operator can fix rather than a
  hostname that looks like an answer. The plugin, the CLI and the host
  all ask it.
- **Files**: `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`,
  `packages/core/src/lib/work-identity/resolve-work-agent.constant.ts`,
  `packages/core/src/lib/work-identity/resolve-work-agent.interface.ts`,
  `packages/core/src/public/index.ts`,
  `packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`,
  `plugins/commit-policy/src/lib/services/work-ref-naming.service.ts`,
  `plugins/commit-policy/src/lib/contracts/interfaces/work-ref-naming.interface.ts`,
  `plugins/commit-policy/src/index.ts`,
  `packages/cli/src/commands/work.command.ts`,
  `tools/scripts/host/host-server.script.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`

## acceptance

- The plugin, the CLI and the host produce the same identity for the same
  inputs, because they call the same function.
- Nothing can name a ref after the machine: with no declared model, no
  environment and no client, the answer is `unknown-agent`.
- An identity that reaches a ref is already valid as a ref component —
  `Visual Studio Code` becomes `visual-studio-code`, not
  `visual studio code`.
