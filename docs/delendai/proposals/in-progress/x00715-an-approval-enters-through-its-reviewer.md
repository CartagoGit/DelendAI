---
id: x00715
title: "An approval enters through its reviewer"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00696, x00694, x00714]
---

# x00715 — An approval enters through its reviewer

## goal

An approval reaches the integration branch only in the pull request of
the unit of the agent it names.

## why

`reviewer ≠ implementer` (x00696) compares the names agents declare. An
agent can approve its own work by typing another name, and on
2026-09-27 one effectively did: MiniMax's `pr/minimax-3/…` (#545)
rewrote f00525's approvals into "approved by Claude …". No check linked
the name in an approval to the agent whose work delivered it.

## why this design

- **At the frontier every host crosses.** CI's
  `closed-with-independent-approval` reads the approvals a pull request
  adds (`+ review-log: approved by R`, with rename detection so a close
  that moves a file adds none) and the agent its head belongs to
  (`<publication-prefix>/<agent>/…`). Each R must be that agent.
- **Identity becomes three consistent acts.** Approving as someone else
  now means entering, publishing and approving under that name. A
  confused agent (`minimax-3`, `copilot`) or a lazy self-approval shows up
  as a mismatch.
- **A person's branch is not judged.** A head outside the agents'
  namespace has no agent. delendai governs agents.

## non-goals

- Cryptographic identity. An agent willing to lie consistently still can.

## architecture

- `tools/scripts/lint/closed-with-independent-approval.script.ts`:
  `agentOfRef`, `approvalsNotBy`, wired into the existing CI step.

## Slices

- global_gate: none

### S1 — Approvals match their pull request

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`

## dependency graph

None.

## acceptance

- Replayed on real pull requests: #550 (27 approvals by its own
  `glm-5.3-max`) and the closer's #561, #567 and #572 pass. #545
  (`minimax-3` adding approvals by `Claude`) fails.
