---
id: x00202
kind: fix
title: "mcpv init's fallback agent catalog was always the ONLY path, and it shipped stale tool names + no user-invocable flag to every adopter"
status: done
type: proposal
track: init+adopter-experience+self-hosting
date: 2026-08-01
shipped-in:
    - 29115c3e # S1 — rot-proof redirector bodies + user-invocable fix in init-render.service.ts
related:
    - x00201 # closed the same class of bug (namespace + user-invocable) on the create_project/scaffold-host.ts code path
    - f00031 # single-orchestrator redirector contract this proposal also protects
    - f00088 # added the locale-keyed fallback + PROP_ substitution this proposal replaces
---

# x00202 — mcpv init's fallback agent catalog was always the ONLY path, and it shipped stale tool names + no user-invocable flag to every adopter

## Goal

Fix `mcpv init`'s agent-file generation (`packages/cli/src/lib/init/`) —
the OTHER of the two parallel scaffolders x00201's Notes section flagged
as a follow-up — which turned out to have the same two families of bug
x00201 just fixed on the `create_project` / `<prefix>_scaffold` path,
except worse: every single project that has ever run `mcpv init`,
including mcp-vertex's own dogfood, has gone through the code path that
had the bugs, because the "read the live catalog first" branch this
module documents as its primary path has never actually fired for anyone.

## Why

While investigating whether the fix in x00201 needed to be mirrored in
`mcpv init` too (x00201 explicitly deferred this, having verified only
that `init-catalog.constant.ts`'s tool-name prefixing didn't have the
SAME namespace bug), a closer read of `init-catalog.constant.ts` and
`init-render.service.ts` surfaced three real, currently-live bugs:

1. **The "live catalog" branch is dead code, for every project,
   always.** `loadAgentDescriptors` reads
   `<workspace>/docs/mcp-vertex/agent-catalog.generated.json` and looks
   for an `agents` array in it. Nothing in this repo has ever written
   that key — `generate-agent-catalog.script.ts` (the only thing that
   produces this file, in any mode) never emits `agents`. Verified live:
   `docs/mcp-vertex/agent-catalog.generated.json` in mcp-vertex's own
   repo — the ONE project where the file is guaranteed to exist and be
   fresh — has no `agents` key. Every `mcpv init` run, in every project
   that has ever existed, has used `FALLBACK_AGENTS_BY_LOCALE`. The
   module's own docblock ("degrades gracefully when the catalog is
   missing") undersold this badly — there was nothing to degrade FROM.
2. **The fallback hardcoded real, plugin-specific tool names — and at
   least one had already rotted.** `technical-investigator` and
   `implementation-runner` both listed `PROP_search_search`, which
   becomes `<prefix>_search_search` after prefixing. The real tool
   (`plugins/search/src/lib/tools/search.tool.ts`) registers
   `${prefix}_search` — no second `_search`. Every adopter who ever
   asked their agent to use the search tool by the name their own
   `.github/agents/mcp-vertex-technical-investigator.agent.md` told them
   to use got a tool-not-found error. This is exactly the invariant
   AGENT-BOOTSTRAP.md states and this repo's own dogfood just violated:
   "No hardcoded lists of skills / tools / proposal ids... any hardcoded
   list will be wrong within days."
3. **`renderAgentFile` (the Copilot `.github/agents/*.agent.md` writer)
   never emitted `user-invocable` at all.** x00201 fixed this exact flag
   on the `scaffoldAgentFile` path and on this repo's own hand-authored
   dogfood files; this sibling function, used by every `mcpv init`
   adopter, was never touched. Every project that ran `mcpv init` got
   all 5 agents (orchestrator + 4 bounded subagents) visible and
   selectable in the Copilot picker — the exact regression f00031 and
   x00201 both exist to prevent, just via the one code path neither had
   reached yet.

## Non-goals

- **Not merging the two scaffolders into one implementation.** x00201's
  Notes already scoped that as a larger, separate refactor. This
  proposal fixes `mcpv init`'s own bugs in place, using the same
  rot-proof pattern `create_project` already uses, without unifying the
  two code paths.
- **Not adding an `agents` writer to `generate-agent-catalog.script.ts`.**
  Making the "live catalog" branch actually fire is a legitimate
  follow-up (it would let a project's own catalog override the generic
  fallback body), but it's new capability, not a bug fix, and the
  fallback redirector body is correct and sufficient on its own — it
  never needs live catalog data to stay correct, by construction.
- **Not touching `packages/core`'s `scaffold-host.ts`.** That path was
  x00201's scope and is already fixed.

## Slices

### S1 — Replace hardcoded tool names with the rot-proof redirector body; fix `user-invocable`
- **Status**: done
- **Implementation**: `IAgentDescriptor` drops `tools` entirely (it was
  either unused — Claude/Codex renderers already ignored it, correctly,
  per their own docblocks — or used unsafely — Copilot emitted it
  verbatim with no server qualification and a stale entry). Rewrote all
  10 `FALLBACK_AGENTS_BY_LOCALE` bodies (5 roles × en/es) to the same
  rot-proof redirector shape used in x00201's `.claude/agents/mcp-vertex-*.md`:
  call `{PREFIX}_overview` (the one tool name safe to hardcode — a core
  contract every mcp-vertex server guarantees), follow
  `recommendedNextAction`, never restate a plugin's tool surface.
  `prefixTools` (which substituted `PROP_` inside a `tools` array) became
  `applyNamespacePrefix` (substitutes the `{PREFIX}` token inside
  `body`). `renderAgentFile` (Copilot) now grants the fixed
  `mcp-vertex/*` server-key wildcard (matching `renderVscodeMcpJson`
  /`renderGenericMcpJson`, which always register the server under the
  literal key `mcp-vertex` regardless of `namespacePrefix` — the tool
  NAMES are prefixed, the server KEY is not) instead of the descriptor's
  own list, and now emits `user-invocable: ${role === 'orchestrator'}`.
  `renderClaudeAgentFile` / `renderCodexAgentFile` needed no behavioural
  change (they already omitted `tools:`) beyond dropping the now-removed
  field from their parameter types.
- **Files**: `packages/cli/src/contracts/interfaces/agent-descriptor.interface.ts`,
  `packages/cli/src/lib/init/init-catalog.constant.ts`,
  `packages/cli/src/lib/init/init-render.service.ts`,
  `packages/cli/src/lib/init/init-catalog.constant.spec.ts` (rewrote 3
  tests, added a "never hardcodes a plugin-specific tool name" pin
  across both locales),
  `packages/cli/src/lib/init/init-render.service.spec.ts` (new describe
  block, 2 cases).
- **Gate**: type+test — `bunx tsc --noEmit -p packages/cli/tsconfig.json`
  clean; `bun test packages/cli` 287/287 pass.
- **Acceptance**: `renderAgentFiles('/no-catalog', { namespacePrefix: 'acme' })`
  produces a `.github/agents/mcp-vertex-orchestrator.agent.md` with
  `user-invocable: true` and `mcp-vertex/*`, and every other role with
  `user-invocable: false` and no stale tool name anywhere — reproduced
  live (see Verification log), not just asserted.

## Acceptance

- `mcpv init` (via `renderAgentFiles`, its only-ever-exercised code path)
  emits Copilot agent files where exactly the orchestrator is
  `user-invocable: true` and every bounded subagent is
  `user-invocable: false`.
- No fallback body, in either locale, contains a hardcoded plugin tool
  name (verified by an explicit test pinning the historical rotten list:
  `auto_work`, `fs_write`, `search_search`, `proposal_adopt`,
  `quality_run_quality`, `proposal_review`, `docs_read`, …).
- The Copilot `tools:` grant references the real, fixed `mcp-vertex/*`
  server key `mcpv init` itself registers, not a bare, un-namespaced,
  potentially-stale tool list.
- `bun run validate` is green.

## Risks

- `renderAgentFile`'s new `user-invocable` field is a behavioural change
  for every future `mcpv init` run (existing adopters' already-generated
  files are untouched — this only affects files generated from here
  on). Mitigated: this is exactly the intended fix, matching what
  `scaffoldAgentFile` already does and what f00031 established as the
  correct contract.
- Dropping `tools` from `IAgentDescriptor` is a public-surface-adjacent
  interface change (the type is exported). Mitigated: grepped the whole
  repo for consumers outside `packages/cli/src/lib/init/` — none found;
  the type's own docblock already scoped it to that module.

## Notes

- **This is the same root cause pattern as x00201, on the sibling code
  path.** Both scaffolders independently accumulated the identical two
  bugs (hardcoded/stale tool names, missing `user-invocable`) because
  neither has ever been driven from one shared implementation. The
  Notes section of x00201 already flagged unifying them as a valuable,
  larger, separate follow-up; this proposal is further evidence for it,
  not a reason to rush that unification tonight.
- **The "live catalog" branch is not deleted, just confirmed dead.**
  Making `generate-agent-catalog.script.ts` actually populate `agents`
  would let it start firing, which is a legitimate, separate feature
  proposal (a project could then customise its fallback body without
  patching this repo) — intentionally left as a Non-goal here since nothing
  about it needs to change for the fallback itself to be correct.
- **Verification log**:

```
$ bunx tsc --noEmit -p packages/cli/tsconfig.json
(no output — clean)

$ bun test packages/cli
287 pass  0 fail

$ bun test packages/cli/src/lib/init/init-catalog.constant.spec.ts \
           packages/cli/src/lib/init/init-render.service.spec.ts \
           packages/cli/src/lib/init/init-render-convention.spec.ts
43 pass  0 fail
```

Live dry-run of `renderAgentFiles('/tmp/definitely-does-not-exist', { namespacePrefix: 'acme', locale: 'en' })`
(the guaranteed-fallback path — the workspace does not exist, so no
catalog file could possibly be read):

```
=== .github/agents/mcp-vertex-orchestrator.agent.md ===
---
name: mcp-vertex-orchestrator
description: Multi-agent orchestrator for mcp-vertex
tools: [read, search, edit, execute, todo, agent, mcp-vertex/*]
user-invocable: true
---

This file is a thin redirector. The canonical contract lives in the `mcp-vertex` MCP server. On the first call of every turn, invoke `acme_overview` and follow its `recommendedNextAction`. For non-trivial work, delegate through the swarm-coordination tools `overview` reports. Do not restate the workflow here — hardcoded tool names rot within days.

=== .github/agents/mcp-vertex-implementation-runner.agent.md ===
---
name: mcp-vertex-implementation-runner
description: Slice executor (atomic writes with locks)
tools: [read, search, edit, execute, todo, mcp-vertex/*]
user-invocable: false
---

This file is a thin redirector. The canonical contract lives in the `mcp-vertex` MCP server. On the first call of every turn, invoke `acme_overview` and follow its `recommendedNextAction`. Claim files before writing with the agent-lock tool `overview` reports; a hardcoded tool list here would go stale. Do not restate the workflow here.
```
