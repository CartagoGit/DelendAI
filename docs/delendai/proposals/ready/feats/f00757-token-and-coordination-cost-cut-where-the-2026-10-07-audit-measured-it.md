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
- **Status**: review
- **Files**: `plugins/proposals/src/lib/surface/packs.ts`, `plugins/proposals/src/lib/surface/disclosure.ts`, `plugins/proposals/src/lib/contracts/constants/proposals-tool-pack.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposals-pack.interface.ts`, `plugins/proposals/tests/src/lib/surface/packs.spec.ts`, `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: `npx vitest run --project proposals plugins/proposals/tests/src/lib/surface`
- acceptance:
  - "The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema."
  - "The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md."

- Design, measured 2026-10-07 (`token-budget-report-lib.ts`, native surface, proposals only: 50 tools, 79,022 B). Packs: `read` (proposal_get, proposals_search, proposal_board, round_context, compact_status, get_proposal_workflow, proposals_compile_context, continue_proposal, sync_proposals, branch_status, plan, proposal_stale_list — 13,604 B); `author` (create_proposal, proposal_transition, proposal_adopt, close_slice, proposals_close_plan, incident_proposals, delegate, inherit_host_instructions — 20,235 B); `review` (review_queue, proposal_review, review_claim — 6,939 B); `work` (agent_lock, agent_worktree, agent_names, auto_work, task_queue, auto_fix_queue, branch_gc, swarm_hygiene, agent_lock_release_orphan — 14,592 B); `repair` (the diagnose, force, reconcile and `proposals_db_*` tools — 23,652 B). A reviewer then lists 20.5 KB instead of 79 KB, an implementer 48.4 KB. The seam: an optional `pack` beside `disclosure` on `IToolRegistration` and the surface descriptor, emitted by the managed-lazy catalog generator, and `activatePack` in `tool-surface-runtime.service.ts` reusing `setPluginState`'s loop filtered by pack; the lazy loader materializes one pack, and a call to an unlisted tool still works through `invokeTool`'s per-tool activation, which then lists its pack. Risks to cover: tools whose next actions name tools of other packs (`auto_work`, `continue_proposal`), the stable-tools API (registered once, not per pack), and the gates that count tools and bytes (`tokens:gate`, `disclosure.spec.ts`, the catalogs).
- Correction 2026-10-07, measured before building: the 79,022 B is the `native` surface. Under the runtime's default (`managed`, adaptive) the bootstrap is 6,251 B, and the first proposals call lists only the 8 tools `disclosure.ts` marks essential — 16,999 B (`TOKEN-BUDGETS.md`, dogfood row; the MCP log shows the host discovering 15 tools after proposals activates, 7 core + 8). Every other proposals tool is already reached through the router without being listed. So packs save a read-only managed session about 12 KB (close_slice, create_proposal, proposal_adopt and agent_lock among the essentials), and the full 65 KB only for hosts that run `native`. Narrower and cheaper first step: make the essential set depend on what the session does (read, author, review, work) instead of one fixed eight, through the existing `disclosure` seam, before any new pack concept in core.

- Delivered, on the narrower design (no new concept in core): the five packs exist as a typed map (`packs.ts`: every registration id in exactly one pack, compared with the generated catalog), and the fixed eight essentials became four: `auto_work`, `get_proposal_workflow`, `compact_status`, `continue_proposal` (the start verb plus the read pack). `create_proposal`, `proposal_adopt`, `close_slice` and `agent_lock` are contextual: still authorized and callable through the router and named by `auto_work` and `continue_proposal` as the exact next action, but no longer listed. No schema changed. Measured with `tokens:dashboard:generate` under the managed surface, proposals row: 8 tools / 16,999 B before, 4 tools / 4,835 B after, 12,164 B less on every first proposals call (swarm and full presets: native manifest 169,240 -> 157,072 B and 198,612 -> 186,444 B). A spec lists the real server and proves a read-only session lists only read-pack tools plus the start verb, under 8,000 B, while a repair-pack tool (`state_health`) still answers through the router. Not built: an `activatePack` seam in core; the router already reaches every unlisted tool, so a pack activation would only list more schemas, and the remaining native-surface saving (79,022 B) belongs to hosts that run `native` without progressive disclosure.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A publication carries its regenerated views in the same commit
- **Status**: retired
- **Files**: `packages/core/src/lib/work-units/publish-regeneration.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`
- **Gate**: type
- acceptance:
  - "work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows."
- Retired 2026-10-09 on reading the code, because its premise holds only in part. The work commit already carries its regenerated catalog: the pre-commit hook regenerates and stages it (`stage_fixed`). What follows a merge is regenerated by `refreshGeneratedAfterMerge` as its own commit ON PURPOSE (a merge that leaves modified files behind sweeps them into somebody else's next commit), and the queue reads that commit (`headIsRegeneration`) to regenerate a candidate once and never loop; folding it into the publication would remove the signal that stops the loop. What could be folded safely was: the orchestrator's publication chain now leaves the merge of the integration branch open and commits the regenerated views in the merge commit itself, one commit fewer per publication. The measure of S4 (`coordination_tax`) is what will say whether the after-merge commit is worth attacking in the queue, as its own proposal.

### S3 — A plan document has a generated compact view
- **Status**: review
- **Files**: `packages/cli/src/lib/review/slice-sections.service.ts`, `packages/cli/src/lib/review/slice-sections.service.spec.ts`, `packages/cli/src/lib/review/review-brief.service.ts`, `packages/cli/src/commands/review.command.ts`, `packages/cli/src/contracts/constants/review-command.constant.ts`
- **Gate**: type
- acceptance:
  - "Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document."
- Delivered, for the review brief: `review next` hands the reviewer each waiting slice's own section of the document (`section`, cut at the next heading) and tells it to open the whole file only where a section refers to another part of it. On x00875, the two slices waiting for a verdict are 4,224 characters of a 56,074-character document: 92 % less to read before judging. Still to do: the same view for `work enter`'s briefing, which reads the proposal through core and so needs the section from the proposals plugin.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — The coordination cost of a swarm is measured
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/coordination-cost.service.ts`, `packages/core/tests/src/lib/work-units/coordination-cost.service.spec.ts`, `packages/core/src/lib/contracts/interfaces/workflow-kpis.interface.ts`, `packages/core/src/lib/work-units/workflow-kpis.service.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.schema.ts`
- **Gate**: type
- acceptance:
  - "A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs."
- Progress 2026-10-07: the workflow KPIs (`readWorkflowKpis`, read by `project-kpis`'s snapshot) carry `coordination`: over the integration branch's last 7 days, the commits, the merges, the bookkeeping commits (`chore(generated|delendai|review)`: regenerated views and the tools' own records) and `tax = (merges + bookkeeping) / commits`. Measured here on 2026-10-07: 1,450 commits, 610 merges, 454 bookkeeping, tax 0.734 — the audit's 74.5 %. Still to do: the per-run summary (agents, units, accepted slices, invalid verdicts, orphans left, manual interventions) and the trend across runs, which the KPI history can carry once the snapshot records this field.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Tool output size is measured per tool
- **Status**: review
- **Files**: `plugins/usage-tracking/src/lib/result-size-ranking.helper.ts`, `plugins/usage-tracking/src/lib/contracts/result-size-ranking.interface.ts`, `plugins/usage-tracking/src/lib/tools/report.tool.ts`, `plugins/usage-tracking/tests/src/lib/result-size-ranking.spec.ts`
- **Gate**: type
- acceptance:
  - "Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement."
- Delivered: most of this was there — every invocation record carries `responseBytes`, the KPIs give per-plugin p50/p95, and `usage_report` ranks tools by total and by largest result. Each ranked tool now carries its own `p50Bytes`, `p95Bytes` and `p99Bytes` too, so a tool whose every answer is big is told from one with a single huge answer. The ranking spec pins them.
- review-state: in_review
- review-implementer: claude-opus-5-5


### S6 — A workflow edit runs the tests it can reach
- **Status**: review
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.constant.ts`, `tools/scripts/ci/test-zones.interface.ts`
- **Gate**: type
- acceptance:
  - "An edit of a workflow file that leaves the test-running jobs of the test workflow (plan, zones, merge) and its workflow-wide `env` and `defaults` as they were reaches only the zones observed to read that file; an edit of those jobs, of a composite action, of a root file, or one whose effect cannot be read, still runs every zone."
- Asked by the owner on 2026-10-07: a pull request waited for checks that had nothing to do with its change. Measured on #912, which changed one trigger of `ci.yml`, a lint script and its spec: the planner ran all eleven shards ("a root file or a workflow can reach any zone"), the proposals zone alone taking eleven minutes. Replayed on the same diff, the planner now selects the tools zone only.
## acceptance

- The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema.
- The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md.
- work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows.
- Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document.
- A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs.
- Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement.
