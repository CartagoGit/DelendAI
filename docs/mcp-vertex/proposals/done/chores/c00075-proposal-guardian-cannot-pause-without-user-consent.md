---
id: c00075
status: done
type: proposal
track: governance
date: 2026-06-28
kind: chore
title: Proposal guardian must not pause proposals without explicit user consent — paused requires a reason, blocked requires a dep
shipped-in: []
recan: []
related:
  - c00012 # agents should not panic on peer commits (the rule this proposal extends)
  - f00007 # proposal state machine kinds, scaffolds, and recovery (canonical DFA + blocked-by mechanism)
  - x00053 # fix proposal-index doc drift (lint-proposals contract)
ownership:
  - { agent: proposal_guardian,    task: 'S1: add a required `paused-reason: <text>` field to the frontmatter schema; `lint-proposals` fails when a proposal has `status: paused` without this field (or with an empty one)' }
  - { agent: proposal_guardian,    task: 'S2: tighten the guardian slot — when the guardian would transition a proposal to `paused`, it must first verify either (a) a `paused-reason` was already supplied by a human, or (b) the proposal has a `blocked-by:` dependency it can name; otherwise it must transition to `blocked` (with the dep) or leave the proposal where it is' }
  - { agent: implementation_runner, task: 'S3: spec coverage — `lint-proposals.spec.ts` asserts paused-without-reason fails; `proposal-guardian-slot.spec.ts` asserts the guardian rejects a manual pause without reason and prefers `blocked-by` when a dep is identifiable' }
  - { agent: implementation_runner, task: 'S4: migration — for every existing proposal in `paused/` without a `paused-reason`, add the field with a human-authored reason (or transition to `blocked` / `ready` as the existing evidence dictates)' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate,  expect: exit0 }
---

# f00075 — Proposal guardian must not pause proposals without explicit user consent

## goal

Codify, at the slot level and the linter level, the rule:

> **`paused` is a human-only decision.** The `proposal_guardian` slot
> (and any other autonomous agent) MUST NOT transition a proposal to
> `paused` on its own initiative. If the guardian believes a proposal
> should not be worked on, it has two legitimate options:
> 1. Name a `blocked-by: [X]` dependency and transition to `blocked` —
>    the system will auto-resolve to `ready` when X closes.
> 2. Leave the proposal where it is and surface a question to the
>     user via a notification.
>
> In neither case is `paused` the right answer for an autonomous agent.

`paused` is reserved for **a human saying "I want to do this later"**.
A bot saying "I think this should wait" is not the same thing, and
must not produce the same outcome.

## why

The 2026-06-28 session surfaced this directly. The `proposal_guardian`
slot (agent `sculptor`, adopted on `f00051-S1`) unilaterally moved
my proposal `f00074` (loop-detector fix, in `ready/`) to `paused/`
and renamed it to `x00074` (legacy `x` prefix). The action:

- Was not requested by the user.
- Was not gated on any technical dependency (verified via grep: zero
  cross-references between x00074 and f00058-webview-hardening).
- Was based on prioritization reasoning ("two proposals close
  together might contend for swarm attention") — a judgment call
  that should not be expressed via a state change the user has to
  override manually.

The user reverted the action by hand and stated the rule explicitly:

> "no quiero que se pause nada que no diga el usuario, lo que se pausa
>  sin permiso del usuario es que se ha bloqueado por algo"

That is the rule this proposal codifies. The DFA already supports
`blocked` for dependency-driven stalls (`reconcileBlocked` auto-
resolves to `ready` when `blocked-by` empties). What is missing is
the **discipline** that prevents an autonomous slot from using
`paused` as a soft-delete / parking-lot move.

## why this design

### Required frontmatter field for `status: paused`

```yaml
---
id: c00075
status: paused
paused-reason: "user asked to defer until 2026-Q3 budget review"
---
```

`paused-reason` is a single-line free-text field. The linter
(`lint-proposals`) fails (exit non-zero) when:

- A file's `status` is `paused` AND `paused-reason` is missing OR
  empty OR only whitespace.

Migration: S4 walks `paused/`, files without `paused-reason` get one
of three treatments:

1. **Has a real `blocked-by`**: move to `blocked/`. The auto-resolver
   will unblock when the dependency closes.
2. **Has a clear human-authored note in the body**: extract the
   first paragraph after "## why" or "## non-goals" into
   `paused-reason`.
3. **Neither**: surface to the user via `notification` and leave the
   file untouched. The guardian NEVER invents a reason.

### Guardian slot discipline

The guardian's triage logic becomes:

```text
should_pause(proposal):
    if proposal.paused-reason exists and is non-empty:
        return true        # human authored; honor it
    if proposal has blocked-by:
        return false        # block, don't pause
    if proposal has a dependency the guardian can name:
        return false        # block by name, don't pause
    return false            # leave it; surface a question to the user
```

`proposal_pause` (or any `proposal-transition to: paused` call from
an autonomous agent) returns:

```
{
  ok: false,
  error: {
    reason: "paused requires a paused-reason field or a blocked-by dependency",
    nextAction: "Add `paused-reason: <text>` to the frontmatter and retry, OR transition to `blocked` with `blocked-by: [X]`"
  }
}
```

A **human** in chat may pause without reason (the chat surface
captures the user's intent directly; the audit trail is the chat
log, not the frontmatter).

### Why this is the right rule

The user's framing is:

> "lo que se pausa sin permiso del usuario es que se ha bloqueado
>  por algo"

That is: `paused without user consent = blocked (because something
external made it impossible)`. The mapping:

| User intent | Right state | Mechanism |
|---|---|---|
| "I want to do this later" | `paused` (with `paused-reason`) | Human action |
| "X must finish first" | `blocked` (with `blocked-by: [X]`) | `reconcileBlocked` auto-resolves |
| "Two proposals look crowded" | leave where it is + `notification` | Guardian asks the user |
| "The slice is hard" | leave where it is + `notification` | Guardian asks the user |

`paused` is reserved for the first row only.

## non-goals

- This proposal does **not** add a `proposal_resume` tool. The DFA
  already permits `paused → ready` via `proposal-transition` with a
  reason. The existing transition is sufficient.
- This proposal does **not** change the meaning of `paused` —
  "do later, by human intent" stays the canonical semantics.
- This proposal does **not** require the user to write a reason
  every time they want to pause. `paused-reason` is **required
  when an autonomous agent pauses**; a human pausing via the chat
  surface (where the user is explicitly present) may not need it
  (though it is encouraged).
- This proposal does **not** retroactively punish the guardian for
  the 2026-06-28 pause. The migration (S4) treats each existing
  paused file as evidence: if there is a clear `blocked-by`, move
  to `blocked/`; otherwise, ask the user.

## slices

### S1 — paused-reason field + linter failure
- **Files**: `plugins/proposals/src/lib/proposals/proposal-frontmatter-types.ts` (or equivalent), `tools/scripts/lint/proposals.script.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-scaffold-linter.spec.ts`
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - Frontmatter schema accepts optional `paused-reason: string`.
  - `lintProposalMarkdown` returns `{ ok: false, ... }` when a file
    has `status: paused` and no `paused-reason`.
  - `lint-proposals` exits non-zero when any proposal in the tree
    violates the rule.
  - Spec covers: paused with reason → ok; paused without reason →
    fail; non-paused without reason → ok.

### S2 — guardian slot discipline
- **Files**: `plugins/proposals/src/lib/swarm/proposal-guardian.ts` (or equivalent), `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - The guardian slot calls `proposal-transition to: paused` only
    after verifying `paused-reason` is set on the target file.
  - When the guardian would have paused but `paused-reason` is
    missing, it instead transitions to `blocked` with the best
    `blocked-by:` it can name (or surfaces a question).
  - A direct `proposal-transition` call from an interactive host
    (where the user is in the chat) bypasses the check (audit trail
    is the chat log).

### S3 — spec coverage
- **Files**: `plugins/proposals/tests/src/lib/proposals/lint-proposals.spec.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-guardian-slot.spec.ts`
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - `lint-proposals.spec.ts`: paused-without-reason → fails;
    paused-with-reason → ok; non-paused without reason → ok.
  - `proposal-guardian-slot.spec.ts`: guardian rejects a pause
    without reason; prefers `blocked-by` when a dep is identifiable.

### S4 — migration
- **Files**: every `.md` under `docs/mcp-vertex/proposals/paused/`
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - Every existing paused file either (a) has `paused-reason`
    populated, (b) is moved to `blocked/` with a real `blocked-by:`
    dependency, or (c) carries a human-authored note in the body
    that gets extracted into `paused-reason`.
  - `lint-proposals` is green at the end of the slice.

## acceptance

- The guardian cannot unilaterally pause a proposal.
- A pause without `paused-reason` is rejected at the lint level.
- A proposal with a real dependency is blocked (not paused) and
  auto-resolves when the dependency closes.
- A human in chat can still pause; the audit trail is the chat log.
- `bun run validate` is green at the end of every slice.
- The `proposal_resume` and `proposal-transition` tools work as
  before; only the input validation changes.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| A legitimate "do later" pause by an autonomous agent becomes impossible. | Use `blocked-by: [self:goal-missing]` (existing draft mechanism) — auto-resolves when the slice is ready. Or surface a question to the user. |
| The guardian produces too many "ask the user" notifications. | S2 includes a rate-limit: at most one notification per proposal per session. After that, the guardian stops touching the proposal until the user responds. |
| `paused-reason` becomes a checkbox ("user asked to defer" without context). | The linter requires the reason to be ≥ 20 chars and not equal to one of four placeholder strings (e.g. "TBD", "later", "user", "no reason"). |
| A human bypassing the check by calling `proposal-transition` directly from the chat surface without `paused-reason`. | Acceptable — the audit trail is the chat log. The lint rule applies only to files ON DISK; the chat surface can write whatever it wants. The next time `sync_proposals` runs, the file is lint-checked and may fail; that's the correct behaviour. |

## notes

- `plugins/proposals/src/lib/proposals/proposal-frontmatter-types.ts`:
  add optional `paused-reason: string` to the frontmatter shape.
- `plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts`:
  extend the linter to fail on paused-without-reason.
- `tools/scripts/lint/proposals.script.ts`: surface the new failure
  with a clear message and the fix.
- `plugins/proposals/src/lib/swarm/proposal-guardian.ts`: replace
  any unconditional pause with the discipline above.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`: in
  the `paused` branch, verify `paused-reason` is set before
  accepting the transition (except when the call originates from a
  `human` agent tag, which the chat surface supplies).

### References

- User message 2026-06-28 turn 7: "no quiero que se pause nada que no
  diga el usuario, lo que se pausa sin permiso del usuario es que se
  ha bloqueado por algo".
- 2026-06-28 session memory: `/memories/session/auto-work-2026-06-28-turn4-f00074-paused-by-guardian.md`
  documents the unilateral pause of x00074 by the proposal_guardian.
- c00012 (the rule we are shipping) — "do not panic, read the
  commit" — extends naturally to "do not pause, read the user".
- f00007 — `blocked` auto-resolves to `ready` when `blocked-by`
  empties (the canonical auto-unblock mechanism we rely on).
- `reconcileBlocked` — `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:478-503`.