---
id: x00715
title: "An approval enters through its reviewer"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00696, x00694, x00714]
last-transition-id: 375a3486-8037-480c-a3de-09b63fa09a6e
last-correlation-id: 375a3486-8037-480c-a3de-09b63fa09a6e
last-transition-from: review
shipped-in:
  - "fda00a68b"
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

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé fda00a68b (x00715 S1, merge PR #579). fix(ci): an approval enters through its reviewer. Una aprobación de review se registra por el reviewer (no por el implementer). 4/4 verde en independent-approval.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #579 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00715-all-g1/an-approval-enters-through-its-reviewer (refs/heads/delendai/wip/claude-opus-5-5/implement/x00715-all-g1/an-approval-enters-through-its-reviewer) (fda00a68be7e80ac74a9a48e894c47c11aba5d8c), opened by minimax-m3

## dependency graph

None.

## acceptance

- Replayed on real pull requests: #550 (27 approvals by its own
  `glm-5.3-max`) and the closer's #561, #567 and #572 pass. #545
  (`minimax-3` adding approvals by `Claude`) fails.
