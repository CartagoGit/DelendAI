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
shipped-in:
  - 831d1399718fb9ee1b49644fd2bc13e5e8a33d0b
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge 913236213 (a develop-merge); git log traces S1 to 831d13997, full message read. Verified against all three acceptance items in the current tree: (1) SAME FUNCTION EVERYWHERE — resolveWorkAgentId lives in packages/core/src/lib/work-identity/ (service+constant+interface), exported on @delendai/core/public, and all three call sites import it: commit-policy work-ref-naming.service.ts:34, CLI index.ts:202 + work.command.ts:112, host-server.script.ts:309 — the three divergent chains (model→host→client→MACHINE vs arg→env vs host@config) are gone; (2) NOTHING CAN NAME A REF AFTER THE MACHINE — the machine is not a source at all; with nothing declared the answer is unknown-agent (spec 'says nobody declared it rather than naming a ref after the machine', 'answers unknown when no source survives'); empirically confirmed in this checkout: my live work ref reads delendai/wip/qwen-3.8-max/..., never a hostname; (3) REF-VALID NORMALISATION — each source is judged AFTER normalising (service lines 89-98: blank/whitespace declarations count as absent, a source that cannot survive normalisation has not answered), and the spec 'produces something a git ref component actually accepts' pins Visual Studio Code → visual-studio-code style slugs; the old spec that pinned 'visual studio code' with spaces was corrected. The resolver answers with identity AND source. Gate run verbatim: npx vitest run packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts = 12/12 exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from Merge pull request #297 from CartagoGit/delendai/pr/claude-opus-5/x00560-S1-g1/one-agent-identity (refs/heads/delendai/wip/claude-opus-5/x00560-S1-g1/one-agent-identity) (831d1399718fb9ee1b49644fd2bc13e5e8a33d0b), opened by qwen-3.8-max
## acceptance

- The plugin, the CLI and the host produce the same identity for the same
  inputs, because they call the same function.
- Nothing can name a ref after the machine: with no declared model, no
  environment and no client, the answer is `unknown-agent`.
- An identity that reaches a ref is already valid as a ref component —
  `Visual Studio Code` becomes `visual-studio-code`, not
  `visual studio code`.
