---
id: x00617
title: "A host is not an agent"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-23
shipped-in:
  - "f936bf444"
  - "51eac8ae486461654cf1ee64c924c69dc74b92ca"
  - "41215c45ff2aae21d476989b73970c2e7114865a"
last-transition-id: 2e4143da-c478-425c-bae5-09760af83f93
last-correlation-id: 2e4143da-c478-425c-bae5-09760af83f93
last-transition-from: review
---

# x00617 — A host is not an agent

## goal

`delendai/wip/claude-code/…` sits in this repository's graph beside
`delendai/pr/claude-opus-5/…`. One names a model; the other names an
application, and nothing in the ref says which is which.

## why

`resolve-work-agent.service.ts` is already the single answer to "who is
working", and its own opening names this exact symptom as the disease it
was written to cure:

> *the plugin walked model → host → MCP client → MACHINE. Three answers to
> "who am I", and the refs show it: `delendai/wip/desktop-9ctqrs7/…` and
> `delendai/wip/visual-studio-code/…` sit in this repository next to
> `delendai/wip/claude-opus-5/…`*

It removed the machine. It kept the client — and the client is where
`visual-studio-code` came from. So the symptom the header cites came
straight back under a different name, and `delendai/wip/claude-code/…` is
in the graph today.

The handshake reports **which application connected**. It answers "what
program is talking to me", never "who did the work". Beside a real model
it is indistinguishable from one, which is the property that makes a ref
attributable — and the whole work model rests on that property.

## why this design

**Marked, not dropped.** Removing the source would throw away real
attribution: knowing a checkpoint came from Claude Code is worth
something. An identity that came from the handshake is now
`client-<name>`, so the graph keeps what it knew and stops implying a
model. That is the same argument `WORK_AGENT_UNKNOWN` already rests on —
a name that says what it is beats a plausible one that does not.

**A declared identity is never marked.** `model` and `environment` are
somebody stating who did the work; those stay bare. Only the inferred one
carries the label.

**And it is said at boot.** By the time `client-claude-code` appears in
the graph the branch already exists. The server now says, once, that work
refs will not carry a model here, and names the one variable that fixes
it — and says nothing at all when an agent is declared, because a server
that recites what is already fine teaches its reader to skip the report
that is not.

## non-goals

- Making the handshake carry a model. It does not, and inventing one is
  the guess this proposal exists to stop.
- Renaming refs that already exist.

## Slices

### S1 — An inferred identity says it was inferred

- **Status**: done
  `codex` (environment), `client-claude-code` (handshake) and
  `unknown-agent` (nothing). Three assertions changed, all of which
  pinned the unmarked form, including one that pinned
  `visual-studio-code` — the very name the module's header cites as the
  disease.
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-identity plugins/commit-policy/tests/src/lib/services/work-ref-naming.service.spec.ts`
- **Files**: `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`,
  `packages/core/src/lib/work-identity/resolve-work-agent.constant.ts`,
  `packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`,
  `plugins/commit-policy/tests/src/lib/services/work-ref-naming.service.spec.ts`
- An identity resolved from the MCP handshake is `client-<name>`; one
  declared as a model or by the environment is unchanged.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5, reviewer minimax-3. Verifiqué 51eac8ae48. PR MERGED. An inferred identity says it was inferred
- review-attribution: claude-opus-5 from commit 51eac8ae4864 names refs/heads/delendai/wip/claude-opus-5/x00617-S1-g1/a-host-is-not-an-agent (51eac8ae486461654cf1ee64c924c69dc74b92ca), opened by minimax-3
### S2 — The server says it before the ref is written

- **Status**: done
  declared.
- **Gate**: `npx vitest run packages/cli/src/index.spec.ts`
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`
- A boot with no declared agent reports the name work refs will carry and
  the variable that changes it; a boot with one reports nothing.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5, reviewer minimax-3. Verifiqué 41215c45ff. PR MERGED. The server says it before the ref is written
- review-attribution: claude-opus-5 from commit 41215c45ff2a names refs/heads/delendai/wip/claude-opus-5/x00617-S1-g1/a-host-is-not-an-agent (41215c45ff2aae21d476989b73970c2e7114865a), opened by minimax-3
## acceptance

- `resolveWorkAgentId({ client: 'Claude Code' })` is
  `client-claude-code`; `{ model: 'claude-opus-5' }` and
  `{ environment: 'codex' }` are unchanged.
- An undeclared boot says `unknown-agent` and names `DELENDAI_AGENT_ID`;
  a declared boot says nothing about identity.
