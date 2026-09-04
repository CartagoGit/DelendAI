---
slug: agent-slots-enum-rejected
symptom: "A custom agent name (anything outside the 5 canonical slots — `proposal_guardian`, `implementation_runner`, `delivery_verifier`, `technical_investigator`, plus the orchestrator) gets rejected by `agent_lock` or `task_queue` with a schema validation error mentioning `agentSlot`."
cause: "An older version of the `proposals` plugin validated `agentSlot` with `z.enum(AGENT_SLOTS)`, which hard-rejected any name not in the 5-role list. That made the swarm impossible to use with project-specific agent names (e.g. `falcon`, `owl`, the bird-themed pool some configs use)."
fix: "Update to a version where `agentSlot` is `z.string().min(1)` in both `task-queue-engine.ts` and `persistent-task-queue.ts` — the 5 canonical names now live as `DEFAULT_AGENT_SLOTS`, a documented default rather than an enforced restriction. Any non-empty string is a valid slot. If you still see the enum rejection, you are on a stale build; re-run `bun run build` at the repo root and restart the host process."
tags: [proposals, multi-agent, schema]
closedBy: "M2 — agentSlot agnostic (session resume n00006)"
---

The fix is deliberately permissive: the swarm coordination primitives
(`agent_lock`, `agent_names`, `task_queue`) care about *uniqueness* of an
agent's identity within a session, not about matching a fixed vocabulary.
