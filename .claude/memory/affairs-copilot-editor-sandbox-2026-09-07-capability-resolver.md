# Affair workspace: 2026-09-07 — CapabilityResolver foundation (x00512)

Long autonomous session driven by an external audit feedback (delivered
via ChatGPT to user) calling for an architectural fix to the
"tool disabled" symptom in the lazy-load UX.

## What was delivered

The user pasted a critique of my earlier architectural responses
(specifically: hardcoding tool counts, asking the LLM to remember
`tool_search → plugin_activate → call`). They wanted a generic
control-plane abstraction. We agreed on a foundation + orchestrator-driven
implementation.

### Proposal authoring

Authored `x00512` (the master fix proposal) and `q00033` (the
foundation plan that groups S1+S2+S4+S6). Both needed to satisfy
`lint:proposals`'s canonical scaffold (goal → why → why this design
→ non-goals → architecture → slices → dependency graph → acceptance
→ risks → notes). Initial authoring was rejected with multiple
fatal errors; rewrote to match the canonical scaffold and added
`Status`/`Files`/`Gate` fields to every slice.

### Foundation implementation (S1+S2+S4+S6 ship)

`packages/core/src/lib/dispatch/`:
- `capability-resolver.error.ts` — discriminated `IResolverError` with
  the six terminal reasons (`catalog_missing`, `policy_denied`,
  `host_read_only`, `activation_failed`, `argument_validation_failed`,
  `execution_failed`).
- `capability-resolver.identity.ts` — `resolveIdentity`,
  `readRuntime`, `toRequestRecord` (split out to keep the SRP surface
  ≤400 LOC per file).
- `capability-resolver.ts` — `resolveAndInvoke` orchestration.

`packages/core/src/lib/project/tool-surface-runtime.service.ts`:
- S2 single-flight: added
  `private readonly activationsInFlight = new Map<string, Promise<IPluginSurfaceChange | null>>()`
  and rewired `activatePluginAsync` to dedupe concurrent activations
  by `pluginId`.

`packages/core/src/lib/tools/resolve-capability.tool.ts`:
- S4 always-visible primitive `delendai_resolve_capability`. Lives
  in `BOOTSTRAP_CORE_TOOL_IDS`, delegates entirely to the resolver,
  contains no plugin id / namespace / skill id.

`packages/core/tests/src/lib/dispatch/`:
- `_fixtures/fake-runtime.ts` — synthetic catalog
  (`fake_alpha`/`fake_beta`/`fake_gamma`). Mirrors real-runtime
  contract including single-flight + `ToolNotAuthorizedError` for
  deactivated records.
- `capability-resolver.spec.ts` — 11 generic tests covering every
  terminal reason plus the success path and a filesystem-fallback
  invariant.

Wired into `assemble-core-tools.ts`.

### What was deferred and why

**S3 (auto-activate-on-miss in compact_router) was deferred** as
`x00512 S3.PR`. Reason: the compact_router's `ROUTER_RESULT` output
schema is load-bearing for several downstream tests and parsers.
Routing through the resolver changes the envelope shape and trips
MCP `outputSchema` validation in the existing fixture for "compact
exposes the vertex router while keeping long tool docs in knowledge".
The compact_router stays on its current `resolveRoute → invokeTool`
pipeline. The new `delendai_resolve_capability` primitive (S4) is
the path that exercises the resolver end-to-end today.

S5 / S7 / S8 were captured as future tracks (host adapter parity,
skill lazy-loader, generic bootstrap doc update) and intentionally
NOT implemented in this session.

## Concurrency / parallel-agent notes

1. **Parallel agents shipped the same work**. The orchestrator or a
   parallel agent landed commit `9d32794d7 feat(core): x00512 S1+S2+S4+S6
   — CapabilityResolver + resolve_capability tool` while I was
   mid-session iterating locally. My re-edits of `tool-surface-runtime`,
   `bootstrap-core-tool-ids`, `assemble-core-tools` were line-similar
   duplicates. Detected by `git status -s M ...` BEFORE staging and
   discarded via `git checkout HEAD -- ...`.

2. **`auto-reap` and force-close**: another agent closed f00505 +
   f00507 (force-close, work shipped in HEAD) which left
   `proposal-files-exist` lint with 2 dangling file refs. Fixed via
   `bun tools/scripts/lint/proposal-files-exist.script.ts --update`
   (canonical, scripted — never hand-edit lint baselines unless the
   script explicitly tells you to, see AGENT-BOOTSTRAP §4.e).

3. **The "exists in catalog but not in surface → disabled" symptom is
   no longer terminal**: with `delendai_resolve_capability` always
   visible, a host that fails to refresh `tools/list` after
   `plugin_activate` can still invoke the lazy capability through
   the generic primitive, with a structured terminal-error envelope
   if anything genuinely fails. This is the architectural fix the
   user wanted.

## Lessons

1. **Generic fixtures** with synthetic ids (`fake_alpha` etc.) keep
   resolver tests independent of any domain and prevent the lint
   regression the user explicitly worried about. Pattern: build a
   `FakeRuntimeAccess` that mirrors the public surface of
   `IToolSurfaceRuntime` and is generic enough to be reused.

2. **Single-flight at the runtime, not the resolver**. The resolver
   stays simple (`await runtime.activatePluginAsync(pluginId)`); the
   runtime owns the lifecycle map. This avoids duplicating dedupe
   logic in the dispatcher, the router, and any future primitive.

3. **MCP `outputSchema` validation strictness** is non-obvious: a
   schema-tight error envelope from a `toolError(...)` path can fail
   validation, breaking callers that today depend on the success-shape
   envelope. Fix the router output schema FIRST, then route it
   through the resolver — never both at once.

4. **Worktree races**: when multiple agents edit the same
   `tool-surface-runtime.service.ts`, the late one can appear to
   "revert" the early one's changes. Best move: `git status -s` before
   any commit to catch duplicates.

## State snapshot at session end

- HEAD = `035d96404` (pushed to origin/develop)
- 1 commit authored this session: the rebaseline.
- The actual foundation commits (`9d32794d7` and `a6a5db641`) were
  authored by parallel agents — content matches my implementation
  intent verbatim (verified by reading `git show 9d32794d7`).
- All S1+S2+S4+S6 acceptance criteria from x00512 green:
  - 11/11 resolver tests pass
  - `bun run typecheck` green
  - `bun run lint` green (biome-baseline even shrank 94→92)
  - `bun run lint:proposals` green (after rebaseline)
  - `delendai_resolve_capability` always visible in every surface mode
- Locks: 0 active
- Cascade: next action is whatever the team's roadmap decides; S3.PR
  is the closest follow-up.

## File-by-file state

- `packages/core/src/lib/dispatch/capability-resolver.{ts,error.ts,identity.ts}` — three modules totaling 535 LOC.
- `packages/core/src/lib/tools/resolve-capability.tool.ts` — always-visible primitive.
- `packages/core/src/lib/project/tool-surface-runtime.service.ts` — `activationsInFlight` map + single-flight `activatePluginAsync`.
- `packages/core/src/lib/cli/assemble-core-tools.ts` — registered the new tool.
- `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts` — added `resolve_capability`.
- `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts` — synthetic catalog.
- `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts` — 11 generic tests.
- `docs/delendai/proposals/done/fixes/x00512-capabilityresolver-...md` — closed.
- `docs/delendai/proposals/done/plans/q00033-plan-capabilityresolver-...md` — closed.
