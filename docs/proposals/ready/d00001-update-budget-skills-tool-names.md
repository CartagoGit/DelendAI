---
id: d00001
status: ready
type: proposal
track: docs
date: 2026-06-22
---

# d00001 — Update budget skills tool names

## Goal

Update budget skills documentation to use canonical, namespace-qualified tool names (e.g. proposals_proposal_board instead of proposal_board) (Audit finding H6).

## Slices

- global_gate: none

### S1 — Update tool names in budget skills
- files: skills/mcp-vertex-token-budget-discipline/SKILL.md
- files: skills/token-budget-playbook/SKILL.md
- gate: none
- acceptance:
  - "bun run validate"
- status: done
