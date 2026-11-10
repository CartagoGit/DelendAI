---
id: d00001
status: done
type: proposal
track: docs
date: 2026-06-22
kind: docs
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - d00001 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass

archived-on: 2026-08-24
---

# d00001 — Update budget skills tool names

## Goal

Update budget skills documentation to use canonical, namespace-qualified tool names (e.g. proposals_proposal_board instead of proposal_board) (Audit finding H6).

## Slices

- global_gate: none

### S1 — Update tool names in budget skills
- files: skills/delendai-token-budget-discipline/SKILL.md
- files: skills/token-budget-playbook/SKILL.md
- gate: none
- acceptance:
  - "bun run validate"
- status: done
