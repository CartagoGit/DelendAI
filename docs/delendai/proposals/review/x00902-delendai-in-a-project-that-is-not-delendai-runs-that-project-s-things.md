---
id: x00902
title: "delendai in a project that is not delendai runs that project's things"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: 6fd4f7c0-12ff-45a5-bc93-672f8de40c92
last-correlation-id: 6fd4f7c0-12ff-45a5-bc93-672f8de40c92
last-transition-from: in-progress
last-transition-at: 2026-10-14T13:38:54.409Z
shipped-in:
  - "21b9f1814e2269a5053da40a607c6bd989f4353b"
---

# x00902 — delendai in a project that is not delendai runs that project's things

## goal

A project that uses delendai gets a server that runs only what belongs to that project: it does not run delendai's own repository upkeep, it reads its own forge and not delendai's, its shared MCP configuration names no one's home directory, and its agents are told plainly not to evade the guard.

## why

The owner, 2026-10-14, from a project that uses delendai (`logistics-app`, profile `shared-checkout-merge`), with its MCP server log and an agent's report:

1. **delendai's own upkeep ran there.** Every ten minutes the log read `candidate refresh did not complete: … Module not found "tools/scripts/git/hydrate-candidates-after-merge.script.ts"`. The host server runs that script relative to the workspace it serves; it is delendai's own maintenance (certifying its integration branch, regenerating its artifacts, moving its queue) and exists only in delendai's repository.
2. **It read delendai's forge.** The host gave its forge seam `REPOSITORY_SLUG`, delendai's own repository, whatever the workspace: the startup mirror of pull requests and check runs of `logistics-app` read CartagoGit/DelendAI's.
3. **The shared MCP configuration carried one person's home.** The server exited with `Module not found "/home/<a colleague>/…/delendai/tools/scripts/host/host-server.script.ts"`: `init --delendai-root` writes the host entry as an absolute path into `.vscode/mcp.json`, a file the project commits, so a colleague's path reached this machine.
4. **An agent got past the guard by unsetting its marker.** Refused in the shared checkout (writes belong to a unit of work), the agent closed a proposal by hand and committed with `env -u AI_AGENT git commit`, "because the guard identifies you as an agent by that variable". The refusal named the unit to work in; nothing told the agent that evading the guard is off limits.

## non-goals

- Making the guard impossible to evade: an agent that clears every marker in a terminal looks like a person; the rule is stated, and its commits remain visible in history.

## slices

- global_gate: type

### S1 — The host runs delendai's upkeep only in delendai's repository, and reads the workspace's own forge

- **Status**: review
- **Files**:
  - `tools/scripts/host/host-server.script.ts`
  - `tools/scripts/host/workspace-forge-slug.helper.ts`
  - `tools/scripts/host/workspace-forge-slug.helper.spec.ts`
- **Gate**: type
- acceptance:
  - The periodic candidate refresh, and the one after a fast-forward, run only when the workspace ships `tools/scripts/git/hydrate-candidates-after-merge.script.ts`.
  - The forge seam is given `owner/name` read from the workspace's own `origin` (ssh or https, any host); with no remote to read, no forge seam is bound.
- shipped-in: `907a909e14ce`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — `init` writes the host entry relative to the workspace

- **Status**: review
- **Files**:
  - `packages/cli/src/lib/init/portable-entry.helper.ts`
  - `packages/cli/src/lib/init/portable-entry.helper.spec.ts`
  - `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - With `--delendai-root`, the entry in `.vscode/mcp.json` is `${workspaceFolder}/<path from the workspace>` (inside `node_modules` or beside the project), not an absolute path of this machine.
- shipped-in: `bcef0d64a985`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Agents are told not to clear their markers to get past a refusal

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`
- **Gate**: type
- acceptance:
  - The rules every agent receives say never to unset or override the identification variables to get a git or delendai call past a refusal, and why.
- shipped-in: `907a909e14ce`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 21b9f1814e22, validate exit 0, tests 1/1; acceptance 1/1: (1) Read at the delivered tree 21b9f1814e2269a5053da40a607c6bd989f4353b (merge of PR #1108). The added sentence in AGENT_ENVIRONMENT_MARKER_RULES (agent-environmen… — One commit, one constant, one sentence, and the sentence is the criterion. Typecheck green (TC_EXIT=0, no new tools errors). Delivery attributed to 907a909e14ce ('fix(host): delendai in another project runs only that project's things'), which the queue also lists as shipped-in. Approving.

## acceptance

- In a project that is not delendai, the server logs no `Module not found`, reads that project's forge, and its committed MCP configuration works on a colleague's machine laid out the same way.
