---
id: f00757
title: "Token and coordination cost cut where the 2026-10-07 audit measured it"
kind: feat
status: ready
type: proposal
track: tokens
date: 2026-10-06
---

# f00757 — Token and coordination cost cut where the 2026-10-07 audit measured it

## goal

Cut what an agent pays per call and what a swarm pays per landed slice, by measurement: proposals tools in lazy capability packs, publications that carry their regenerated views, compact views of large plans, and the swarm's coordination cost and each tool's output size measured. From the external audit of the second review swarm (ChatGPT, 2026-10-07, .cache/chat-with-llms/2026_10_07_01:08_…), triaged against the code: its swarm-residue and upgrade findings are already x00875, x00877 and x00878; these are the ones nothing covered.

## why

The tools an agent sees are what it pays for on every request, and the proposals plugin is the largest of them: its first call makes all 50 of its tools visible, 79,022 B of schemas, most of it output schemas, whatever the session came to do. A session that reads proposals needs 12 of them (13,604 B). A swarm pays a second cost per landed slice: merges and regeneration commits that carry no work, and publications going stale against each other because each regenerates the same views apart. Both were measured in the audit of 2026-10-07 and re-measured here; neither had a proposal.

## non-goals

- Weakening any output schema to save bytes: x00543 keeps contracts whole; packs change what is listed, not what a tool promises.
- The swarm-residue and upgrade findings of the same audit: x00875, x00877 and x00878 own them.

## slices

- global_gate: none

### S1 — The proposals plugin loads its tools in capability packs
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/surface/packs.ts`, `plugins/proposals/src/index.ts`, `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`
- **Gate**: type
- acceptance:
  - "The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema."
  - "The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md."

- Design, measured 2026-10-07 (`token-budget-report-lib.ts`, native surface, proposals only: 50 tools, 79,022 B). Packs: `read` (proposal_get, proposals_search, proposal_board, round_context, compact_status, get_proposal_workflow, proposals_compile_context, continue_proposal, sync_proposals, branch_status, plan, proposal_stale_list — 13,604 B); `author` (create_proposal, proposal_transition, proposal_adopt, close_slice, proposals_close_plan, incident_proposals, delegate, inherit_host_instructions — 20,235 B); `review` (review_queue, proposal_review, review_claim — 6,939 B); `work` (agent_lock, agent_worktree, agent_names, auto_work, task_queue, auto_fix_queue, branch_gc, swarm_hygiene, agent_lock_release_orphan — 14,592 B); `repair` (the diagnose, force, reconcile and `proposals_db_*` tools — 23,652 B). A reviewer then lists 20.5 KB instead of 79 KB, an implementer 48.4 KB. The seam: an optional `pack` beside `disclosure` on `IToolRegistration` and the surface descriptor, emitted by the managed-lazy catalog generator, and `activatePack` in `tool-surface-runtime.service.ts` reusing `setPluginState`'s loop filtered by pack; the lazy loader materializes one pack, and a call to an unlisted tool still works through `invokeTool`'s per-tool activation, which then lists its pack. Risks to cover: tools whose next actions name tools of other packs (`auto_work`, `continue_proposal`), the stable-tools API (registered once, not per pack), and the gates that count tools and bytes (`tokens:gate`, `disclosure.spec.ts`, the catalogs).

### S2 — A publication carries its regenerated views in the same commit
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publish-regeneration.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`
- **Gate**: type
- acceptance:
  - "work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows."

### S3 — A plan document has a generated compact view
- **Status**: in-progress
- **Files**: `packages/cli/src/lib/review/slice-sections.service.ts`, `packages/cli/src/lib/review/slice-sections.service.spec.ts`, `packages/cli/src/lib/review/review-brief.service.ts`, `packages/cli/src/commands/review.command.ts`, `packages/cli/src/contracts/constants/review-command.constant.ts`
- **Gate**: type
- acceptance:
  - "Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document."
- Delivered, for the review brief: `review next` hands the reviewer each waiting slice's own section of the document (`section`, cut at the next heading) and tells it to open the whole file only where a section refers to another part of it. On x00875, the two slices waiting for a verdict are 4,224 characters of a 56,074-character document: 92 % less to read before judging. Still to do: the same view for `work enter`'s briefing, which reads the proposal through core and so needs the section from the proposals plugin.

### S4 — The coordination cost of a swarm is measured
- **Status**: in-progress
- **Files**: `packages/core/src/lib/work-units/coordination-cost.service.ts`, `packages/core/tests/src/lib/work-units/coordination-cost.service.spec.ts`, `packages/core/src/lib/contracts/interfaces/workflow-kpis.interface.ts`, `packages/core/src/lib/work-units/workflow-kpis.service.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.schema.ts`
- **Gate**: type
- acceptance:
  - "A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs."
- Progress 2026-10-07: the workflow KPIs (`readWorkflowKpis`, read by `project-kpis`'s snapshot) carry `coordination`: over the integration branch's last 7 days, the commits, the merges, the bookkeeping commits (`chore(generated|delendai|review)`: regenerated views and the tools' own records) and `tax = (merges + bookkeeping) / commits`. Measured here on 2026-10-07: 1,450 commits, 610 merges, 454 bookkeeping, tax 0.734 — the audit's 74.5 %. Still to do: the per-run summary (agents, units, accepted slices, invalid verdicts, orphans left, manual interventions) and the trend across runs, which the KPI history can carry once the snapshot records this field.

### S5 — Tool output size is measured per tool
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/tool-output-size.service.ts`
- **Gate**: type
- acceptance:
  - "Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement."

## acceptance

- The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema.
- The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md.
- work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows.
- Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document.
- A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs.
- Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement.
