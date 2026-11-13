---
name: delendai-auto-agent-selector-playbook
plugin: auto-agent-selector
tools: ['delendai_auto-agent-selector_auto_status', 'delendai_auto-agent-selector_auto_recommend', 'delendai_auto-agent-selector_auto_run', 'delendai_auto-agent-selector_auto_record', 'delendai_auto-agent-selector_auto_evaluate']
appliesTo: ['@delendai/auto-agent-selector']
description: How to pick the cheapest capable provider for a task and learn from the outcome with the auto-agent-selector tools. Advisory only; nothing here spends.
---

# auto-agent-selector playbook

Zero-config routing: it finds the providers the workspace can reach, ranks them for a task
on a cost-to-quality dial, and learns from what you record.

## The loop

1. `auto_status`: reachable providers, cheapest first, and each missing one with a single
   command to enable it. Call it when a recommendation looks empty.
2. `auto_recommend`: rank providers for the task, with a reason for each. Pass
   `costQualityTradeoff` to move the dial. It advises; you decide.
3. `auto_run`: the ladder to follow. Run the first provider; if its output fails the
   project's acceptance gate, escalate to the next stronger one, inside your cost ceiling.
4. `auto_record`: after the task, record `providerId`, `success` and an optional `taskType`.
   Later rankings blend in these measured win-rates, so skipping this keeps the ranking blind.
5. `auto_evaluate`: read the evidence per provider and task type, and see newly reachable
   providers with too little evidence. Never contacts a provider.

## Notes

- All five are advisory and free; running the chosen provider is a separate step.
- Record failures too: a provider only shifts the ranking once it has enough evidence.
