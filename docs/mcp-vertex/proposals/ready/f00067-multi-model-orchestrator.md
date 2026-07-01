---
id: f00067
status: ready
type: proposal
track: core+plugins+config+i18n+docs+ui-extension
date: 2026-06-25
kind: feat
title: Multi-model orchestrator — provider roster, routing, quotas, subprocess invocation, usage tracking
related:
    - f00006 # Multi-model audit plugin — the design memo Option E evolved from; same conceptual ground
    - f00046 # CLI coverage — the runner + usage-tracking plugins need CLI subcommands (S5 here consumes f00046 conventions)
    - f00037 # Contracts and conventions — the IProviderCapabilities interface is a new public contract under packages/core/src/lib/contracts/
    - f00041 # mcp.json parity — the roster auto-discovery (S3 here) must respect the same canonical resolver
    - a00032 # Audit slice — S2 here addresses a00032 S4 ("overview compactness") by adding `providers` to ICatalogSnapshot; S5 here addresses a00032 S5 (drift budget) indirectly
    - a00022 # Master audit — H1 "agent as cost analyst" comes from this proposal
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run lint:plugins-imports, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00067 — Multi-model orchestrator

> **Status:** ready. The design is documented across
> [`docs/mcp-vertex/wiki/00–08`](../../wiki/) (9 pages, ~2400 lines,
> audited 2026-06-25). This proposal is the executive summary + the
> slice breakdown that turns the design into shippable work.

## goal

Make `mcp-vertex` route each tool call to the **best LLM provider the
user has access to**, automatically, while:

1. **Honoring the user's "trust gradient"**: confirmed settings live
   in `mcp-vertex.config.json#providers` (versionado, the user owns
   it); runtime state lives in `${corePaths.cacheDir}/<plugin>/`
   (gitignored, the orchestrator owns it).
2. **Never spending money without confirmation**:
   `executeApi: false` and `confirmBeforeExecute: true` are the
   default; the runner returns prompts and commands for the user to
   run unless they explicitly opt in per session.
3. **Falling back gracefully** when a provider's quota is exhausted:
   chained fallback with **TTL-based reset** (no polling). The
   fallback del fallback is bounded by `maxFallbackDepth: 3`.
4. **Observing cost in real time** via the `usage-tracking` plugin,
   which records every tool call (by agent, plugin, model, extension)
   and surfaces a `usage_report` to the user and to a future
   `advise_spend` LLM-as-cost-analyst tool.
5. Discovering what the user has at first run: PATH probe + auth RPCs + LLM-as-bootstrap-wizard that asks the user 2-3 questions in prose and writes a `roster.draft.json` for the user to review.

> **Scope note:** the **Webview Dashboard visualisation** of provider
> status, quotas, and live spend (originally proposed as a goal #6
> + S11) is **out of scope for f00067** and will be filed as
> `f00068-ui-provider-dashboard.md` once S3–S7 close and the data
> surface stabilises. f00067 ships the data and the CLI; f00068
> ships the visualisation.

The wiki pages cited throughout this proposal are the **source of
truth for design decisions**; this document only summarises and
schedules.

## why

Today every LLM call in the user's `mcp-vertex` workflow goes to
whichever model the host IDE is configured for. If that model is
wrong for the task — too cheap for a security audit, too expensive
for a typo fix, out of quota — the user notices after the fact (or
doesn't notice at all). Three concrete pain points observed across
recent sessions:

- **f00006** (multi-model audit) shipped the manual brief-paste
  approach: the user generates a brief in one IDE, pastes it into
  another IDE with a different model. This works but does not scale
  beyond 2-3 IDEs and forces the user to be the routing brain.
- **a00022 / a00032** consistently flagged the absence of a
  `providers` block in `ICatalogSnapshot`: agents have no way to
  inspect what models are reachable from the current workspace.
- **The user (2026-06-25 session)** explicitly asked for
  per-task model selection with cost awareness and graceful
  quota-failure handling. The design memo + audit + wiki pages in
  this proposal are the answer.

## why this design

- **Two new plugins, not one.** `orchestrator-runner` (the brain)
  and `usage-tracking` (the eyes). Splitting them matches the
  repo's pattern (`proposals` vs `notification`, `quality` vs
  `audit`): one plugin owns a concern, plugins consume each other
  via well-defined contracts.
- **A single canonical contract file**
  ([`packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`](../../../packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts))
  exports `CapabilityTag`, `IProviderCapabilities`, `IProviderSummary`,
  `IProviderAvailability`, `IRoutingDecision`. All wiki pages and
  both plugins import from here. No drift between wiki text and
  code.
- **The deterministic scoring function is pure.** `scoreProvider(p,
  hint, health): number` has no I/O and is trivially testable. The
  LLM-as-advisor sits behind an MCP tool call, not in the hot path
  (lesson from LangChain's deprecated `LLMRouterChain`: don't put
  the LLM in the routing loop).
- **Subprocess invocation + MCP client for Codex.** Codex CLI is
  the only tool that exposes itself as a real MCP server
  (`codex mcp-server`). Other CLIs (`claude -p`, `aider --message`,
  `cn -p`, `copilot -p`, `agent -p`) are spawned as plain
  subprocesses with structured output.
- **Cache lives inside the workspace, under per-plugin subfolders.**
  Matches AGENTS.md rule 5 + the existing
  [`pluginCacheDir`](../../../packages/core/src/lib/cli/assemble.ts#L231)
  convention. No `~/.cache/mcp-vertex/` anywhere.
- **Safety defaults can be tightened, never silently relaxed.**
  `executeApi` and `confirmBeforeExecute` both default to
  *user-protective*; per-session opt-in is required to override.
- **Catalog freshness is the user's job, the LLM's job, and the
  runner's job — not the code's job.** Models change weekly; we
  do not hardcode model lists. The runner learns from
  `auth status` / `model/list` RPCs; the user keeps the roster
  fresh in config; the LLM fills gaps via the bootstrap wizard.
- **Borrowed primitives** (see
  [`wiki/synthesis/patterns-to-borrow.md`](../../wiki/synthesis/patterns-to-borrow.md)):
  Aider's two-tier cascade, Claude Code's `opusplan` mode-keyed
  routing, OpenRouter's `session_id` stickiness, LiteLLM's
  three-source cost model.

## non-goals

- **No LLM gateway.** The orchestrator does not proxy API calls.
  It delegates to existing gateways (OpenRouter, Portkey,
  LiteLLM) and to subscription CLIs. Adding a proxy is a v2
  conversation (a future `plugins/llm-gateway`).
- **No real-time token usage stream from the host IDE.** The
  runner observes what it itself invokes (Codex's
  `turn.completed.usage`, HTTP headers from API calls); it does
  not snoop on other tools' spend. Adding a host-side
  `onTokenUsage` hook is out of scope; if the host supplies one in
  the future, `usage-tracking` will subscribe.
- **No multi-tenant aggregation.** The cache is per-`mcp-vertex`
  instance. Cross-host aggregation is a future proposal.
- **No replacing the host IDE's model picker.** The orchestrator
  *advises*; the user decides. The user's IDE picker remains the
  source of truth for "what model is the agent right now".
- **No new LLM-provider SDK dependencies in core.** The runner
  plugin uses [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
  for the MCP-client side (already in the repo's transitive deps
  for the MCP server itself); it does **not** import
  `openai`, `@anthropic-ai/sdk`, `langchain`, etc.
- **No retroactive schema break.** The `providers` block at the
  root of `mcp-vertex.config.json` is additive; existing configs
  keep working. The slice contract extension is additive
  (`requiresCapability`, `preferredProvider`, `maxCostTier` are all
  optional and default to "no preference").
- **No rollout in the swarm preset.** Both new plugins ship as
  opt-in via `mcp-vertex.config.json#plugins.orchestrator-runner`
  and `#plugins.usage-tracking`. The default preset does not
  include them in S9; users add them deliberately.
- **No Webview Dashboard visualisation in f00067.** A real-time
  provider status panel, a *Usage Cost Analyst* card, and a
  *Live Swarm Activity Stream* in `packages/ui-extension` are
  explicitly **out of scope** and will be filed as
  `f00068-ui-provider-dashboard.md` once S3–S7 close and the data
  surface stabilises. f00067 ships the data layer + the CLI
  surface; f00068 ships the visualisation.
- **No new `loop-detector` module in orchestrator-runner.** The
  runner consumes the existing `LoopDetectorService` from
  `plugins/proposals/src/lib/agents/`. New heuristics (if any) are
  added as hooks on the existing primitive, never as a sibling.
  One loop detector in the codebase, not two.

## architecture

```
packages/core/src/lib/contracts/interfaces/
  provider-capabilities.interface.ts            NEW · single canonical contract
                                                (CapabilityTag, IProviderCapabilities,
                                                 IProviderSummary, IProviderAvailability,
                                                 IRoutingDecision, RoutingStrategy)

packages/core/schema/
  mcp-vertex.config.schema.json                 EXT · top-level "providers" array,
                                                Zod mirror in config-file-schema.ts

packages/core/src/lib/catalog/
  agent-discovery-types.ts                      EXT · ICatalogSnapshot.providers
  agent-discovery-catalog.ts                    EXT · snapshot includes providers

plugins/proposals/src/lib/swarm/
  proposal-slice-plan.ts                        EXT · IProposalSliceContract gains
                                                readonly requiresCapability?,
                                                preferredProvider?, maxCostTier?

plugins/orchestrator-runner/                    NEW · the brain
  src/index.ts                                  register() — registers 10 tools
  src/lib/router/score.ts                       scoreProvider(p, hint, health) — pure
  src/lib/router/session.ts                     Map<sessionId, IRoutingDecision> + TTL
  src/lib/healthcheck.ts                        PATH probe + auth/status RPC
  src/lib/bootstrap.ts                          wizard state machine
  src/lib/quota.ts                              3-source merge → quotas.json
  src/lib/subprocess/pool.ts                    generic subprocess pool (used by cli, mcp, api)
  src/lib/subprocess/cli.ts                     spawn-cli + parse stream-json
  src/lib/subprocess/mcp-client.ts              stdio MCP client (Codex)
  src/lib/subprocess/api.ts                     HTTP with AbortController + header parser
  src/lib/tools/*.tool.ts                       10 tools
  src/public/index.ts                           barrel
  resources/pricing.snapshot.json               bundled fallback for usage-tracking
  README.md
  tests/                                        unit + e2e (real subprocess smoke)

plugins/usage-tracking/                         NEW · the eyes
  src/index.ts                                  register() — hooks into IHostObservability
  src/lib/record.ts                             buffered NDJSON appender (250ms / 64-entry throttle)
  src/lib/rollup.ts                             5-min rollups
  src/lib/pricing.ts                            LiteLLM fetch + bundled snapshot fallback
  src/lib/detect-agent.ts                       clientInfo → kind/extension
  src/lib/circuit-breaker.ts                    NEW · session/monthly spend limits (S7)
  src/lib/tools/report.tool.ts
  src/lib/tools/clear.tool.ts
  src/public/index.ts                           barrel
  README.md
  tests/

apps/web/src/i18n/tools/
  orchestrator-runner/                          NEW · 12 langs × 10 tools
  usage-tracking/                               NEW · 12 langs × 2 tools

tools/scripts/
  refresh-pricing.script.ts                     NEW · `bun tools/scripts/refresh-pricing.script.ts`
  no-cleartext-secrets.script.ts                NEW · rejects cleartext secrets in config
  lint/cli-i18n.script.ts                       EXT · covers new tool summaries

docs/mcp-vertex/
  wiki/06-bootstrap-and-quotas.md               NEW · runtime concerns
  wiki/07-plugin-orchestrator-runner.md         NEW · plugin design + canonical contracts
  wiki/08-usage-tracking-plugin.md              NEW · observability plugin
```

### Invariants preserved (AGENTS.md §"Hard rules")

| Rule | How this proposal respects it |
|---|---|
| #1 Core stays agnostic | The new `IProviderCapabilities` lives in `packages/core/src/lib/contracts/interfaces/` but exports no vendor vocabulary — it defines `toolName: string` (no hardcoded vendor tools in core). The runner plugin (in `plugins/`) owns the vendor knowledge. |
| #2 No `process.cwd()` | Cache path comes from `ctx.corePaths.cacheDir`; bootstrap discovery uses `Bun.which()` and `process.env.PATH`. |
| #3 Async I/O in hot paths | `usage-tracking` appends are buffered + flushed async (250ms / 64 entries). `IProviderAvailability` and `quotas.json` are mirrored in-memory with a short-TTL (e.g. 5s) / `mtime` check to allow multi-agent processes to stay synced without disk thrashing. |
| #4 Durable writes via primitives | Every cache write goes through `writeFileAtomic` under `withFileMutex`. For the growable `invocations.jsonl`, a safe asynchronous append (`fs/promises.appendFile` guarded by `withFileMutex`) is used to avoid $O(N)$ write overhead. |
| #5 Workspace-scoped paths | Cache stays inside the workspace. No `~/.cache/mcp-vertex/` anywhere. |
| #6 Secrets never persisted | API keys live in `process.env`. The config schema declares `envVar` names only. `redactSecrets` is applied to every cache write. The new `no-cleartext-secrets.script.ts` lint rejects any `key|secret|token|password` field whose value isn't an env-var reference. |
| #7 Token budget is a protected invariant | `usage-tracking`'s append path is async + buffered; p99 latency must not regress. A new test asserts ≤5ms regression under 1000 tool calls in `bun run validate`. |
| #8 Every public tool declares an outputSchema | All 12 new tools (`orchestrator-runner` × 10 + `usage-tracking` × 2) ship with Zod `outputSchema`. `bun run types:generate` regenerates the typed SDK. |
| #9 i18n is complete or it doesn't ship | 12 languages × 12 tool descriptions + 12 command summaries. `bun run lint:cli:i18n` and `apps/web/scripts/check-i18n.ts` gate the build. |
| #10 tools/scripts are TypeScript-exclusive | New scripts use the `*.script.ts` suffix. No `.py` / `.sh` / `.bash`. The shell commands in `installHint` are surfaced as user-facing suggestions, never executed by the runner. |

## Slices

The slices are ordered by ROI: schema + observability first (small,
low-risk, immediately useful), then the routing brain (medium,
medium-risk), then the bootstrap wizard + spend advisor (largest,
highest-risk).

---

### S1 — Canonical provider contract + schema extension (the foundation)

- **Status**: in-progress
- **Landed (2026-07-01)**: the canonical contract file
  `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`
  exports `CapabilityTag` (+ `CAPABILITY_TAGS`), `ProviderKind`,
  `IProviderInvoke` (discriminated on `kind`, CRITICAL C6),
  `IProviderCapabilities`, `IProviderSummary`, `ProviderState`,
  `IProviderAvailability`, `RoutingStrategy`, `RoutingMode`,
  `IRoutingScoreEntry`, `IRoutingDecision`, `CostTier`. Re-exported from
  `packages/core/src/public/index.ts`. Guard spec
  `packages/core/tests/src/lib/contracts/interfaces/provider-capabilities.spec.ts`
  (14 tests) pins the closed unions. This unblocks S2's typing.
- **Deferred (own follow-up)**: the *schema + catalog* half of S1 —
  root-level `providers` block in `mcp-vertex.config.schema.json` + Zod
  mirror in `config-file-schema.ts` + `ICatalogSnapshot.providers` wiring
  into `agent-discovery-catalog.ts`/`overview`/`agent_catalog` + the
  `config:schema` regen. Deferred because it is cross-cutting into the
  catalog snapshot (which other work regenerates concurrently) and needs a
  schema regen that risks collision. Track as a sub-proposal
  `f00067a-provider-schema-catalog`.
- **Files**: `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts` (NEW), `packages/core/schema/mcp-vertex.config.schema.json` (EXT), `packages/core/src/lib/plugins/config-file-schema.ts` (EXT, Zod mirror), `packages/core/src/lib/catalog/agent-discovery-types.ts` (EXT), `packages/core/src/lib/catalog/agent-discovery-catalog.ts` (EXT), `packages/core/tests/src/lib/contracts/interfaces/provider-capabilities.spec.ts` (NEW), `packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts` (EXT).
- **Gate**: `bun run test packages/core && bun run typecheck && bun run config:schema && bun run lint`
- **Acceptance**:
  - "New file `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts` exports `CapabilityTag`, `IProviderCapabilities`, `IProviderSummary`, `IProviderAvailability`, `RoutingStrategy`, `IRoutingDecision` with discriminated unions for `IProviderInvoke` (CRITICAL C6 fix)."
  - "Root-level `providers` block in `mcp-vertex.config.schema.json` accepts an array of entries with kebab-case `id` (regex `^[a-z][a-z0-9-]+$`), `uniqueItems: true`, `kind` enum `{api, subscription, cli, mcp-server}`."
  - "`ICatalogSnapshot.providers: IProviderSummary[]` is included in `<prefix>_overview` and `<prefix>_agent_catalog` (a00032 S4 follow-up)."
  - "`bun run config:schema` regenerates the schema; the JSON schema and the Zod mirror agree."
  - "Wiki pages `04`/`05`/`06`/`07` are updated to reference this single file (no duplicates)."

---

### S2 — Slice contract extension + slice parser regex

- **Status**: done
- **Landed (2026-07-01)**: `IProposalSliceContract` gained the three
  readonly optional fields `requiresCapability?: ReadonlyArray<CapabilityTag>`
  (imported from the S1 core contract), `preferredProvider?: string`,
  `maxCostTier?: ISliceCostTier` (`1|2|3|4|5`). `parseProposalSlicePlan`
  now parses `requires_capability` (YAML-list `[a, b]`, bracketless
  `a, b`, or a single bare token), `preferred_provider`, and
  `max_cost_tier` in both plain (`- field:`) and narrative-bold
  (`- **Field**:`) forms. Unknown capability tags and out-of-range cost
  tiers are dropped. 5 new tests + full 160-test swarm suite green; zero
  regression on the legacy corpus fixture.
- **Known limitation**: only the single-line list form is parsed; a
  multi-line indented YAML sub-bullet form (`requires_capability:` then
  `  - tag` on following lines) is not. No live proposal uses that form.
- **Files**: `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts` (EXT), `plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts` (EXT).
- **Gate**: `bun run test plugins/proposals && bun run typecheck`
- **Acceptance**:
  - "`IProposalSliceContract` gains readonly optional fields: `requiresCapability?: ReadonlyArray<CapabilityTag>`, `preferredProvider?: string`, `maxCostTier?: 1 | 2 | 3 | 4 | 5` (CRITICAL I1 fix: `readonly` to match the existing idiom)."
  - "The `parseProposalSlicePlan` regex is extended to match `requires_capability`, `preferred_provider`, `max_cost_tier` lines (both single-token and YAML-list forms)."
  - "New tests cover: slice with `requires_capability: [code-edit, fast-iteration]`, slice with multi-line bullets, slice with all three new fields, slice with none (backward compat)."

---

### S3 — usage-tracking plugin MVP (the eyes)

- **Status**: ready
- **Files**: `plugins/usage-tracking/` (NEW — full plugin scaffold), `apps/web/src/i18n/tools/usage-tracking/` (NEW — 12 langs × 2 tools).
- **Gate**: `bun run test plugins/usage-tracking && bun run typecheck && bun run lint:cli:i18n`
- **Acceptance**:
  - "Plugin scaffold under `plugins/usage-tracking/` follows the same layout as `plugins/memory/` (package.json, tsconfig.json, vitest.config.ts, src/public/index.ts)."
  - "Subscribes to `IHostObservability.onToolStart` (for `startedAt`) and `IHostObservability.onToolCall` (for `endedAt` + `result`). No new contract."
  - "Append is buffered: one fsync per ≤250ms window OR per ≤64 entries (whichever first). p99 latency regression < 5ms under 1000 tool calls (CRITICAL C2 + AGENTS.md rule 3)."
  - "All cache writes go through `writeFileAtomic` under a single shared `withFileMutex`, piped through `redactSecrets` first."
  - "`${cacheDir}/usage-tracking/invocations.jsonl` records: ts, sessionId, agent{id,kind,extension}, plugin, tool, model{provider,modelId,kind}, usage, costUsd, durationMs, outcome, fallbackFrom, error."
  - "`${cacheDir}/usage-tracking/usage-summary.json` is regenerated every 5 min from `invocations.jsonl`; bucketed by (provider, plugin, agent, extension)."
  - "`${cacheDir}/usage-tracking/pricing.json` is refreshed from `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` with a 24h TTL using a stale-while-revalidate pattern with a 1s timeout to ensure it never blocks tool execution; falls back to the bundled `pricing.snapshot.json` when unreachable."
  - "Subscription providers use `{kind:'subscription', subscriptionUsd, marginalCostUsd:null, fixedCost:true}` — no fabricated per-call price (CRITICAL N4 fix)."
  - "`<prefix>_usage_report {groupBy, windowDays, filter, sortBy, limit}` returns rollup slice + top 10 expensive calls."
  - "`<prefix>_usage_clear` requires confirmation."
  - "`agent.id/kind/extension` table covers at least: GitHub Copilot Chat, Claude Code, Codex CLI, Cursor, Aider, Continue, plus the `cli-doctor` / `cli-direct` host (CRITICAL N6 fix). Schema for user extension lives at `plugins.usage-tracking.options.clientMap: Record<string, {kind, extension}>`."
  - "12 languages × 2 tool summaries ship in `apps/web/src/i18n/tools/usage-tracking/`. `bun run lint:cli:i18n` passes."

---

### S4 — orchestrator-runner plugin: healthcheck + score + advise_routing (the routing brain, headless)

- **Status**: ready
- **Files**: `plugins/orchestrator-runner/` (NEW — partial), `apps/web/src/i18n/tools/orchestrator-runner/` (NEW — 12 langs × 4 tools).
- **Gate**: `bun run test plugins/orchestrator-runner && bun run typecheck && bun run lint:cli:i18n`
- **Acceptance**:
  - "Plugin scaffold under `plugins/orchestrator-runner/` follows the same layout as `plugins/proposals/`."
  - "`register()` throws a clear error if `plugins.usage-tracking` is not loaded (CRITICAL I15)."
  - "`${cacheDir}/orchestrator-runner/healthcheck.json` is written under `withFileMutex` + `redactSecrets`; `IProviderAvailability` is mirrored in-memory (no per-decision fs read)."
  - "`scoreProvider(p, hint, health): number` lives at `plugins/orchestrator-runner/src/lib/router/score.ts` and is exported (CRITICAL C5 fix). Mode tier revised: `{plan:4, review:3, implement:2, explore:1}` (CRITICAL N10 fix). 100% branch coverage in tests."
  - "Tool `<prefix>_healthcheck_providers` returns per-provider `{cli.installed, cli.path, cli.version, auth.authenticated, auth.tier, model.requested, model.available, overall, installHint?}` with `installHint.caveat` localized + `pipeTo: 'sh'` flagged `dangerous: true` (CRITICAL I4 fix)."
  - "Tool `<prefix>_advise_routing {taskDescription, sliceCapabilityHints?, mode?, costPreference?, sessionId?}` returns `{decision, alternates, scoringTrace, sessionId}`. `decision.strategy` is one of `passthrough | api | cli | mcp-tool | handoff` (CRITICAL C4 fix)."
  - "Session stickiness: `Map<sessionId, IRoutingDecision>` in-memory with TTL `sessionStickinessTtlSeconds: 300` (default); pruned every 5 min (CRITICAL I12)."
  - "Tool `<prefix>_get_quota` reads `${cacheDir}/orchestrator-runner/quotas.json` (placeholder; S5 fills it)."
  - "**Loop detection reuses the existing primitive** in `plugins/proposals/src/lib/agents/loop-detector-service.ts` (`LoopDetectorService` + `loop-detector-config.ts`). The runner imports it via `ctx.options.dependencies` (or a thin proposal-side re-export); **no new `loop-detector.ts` is created**. If a new heuristic is needed later (e.g. duplicate task descriptions across providers), it is added as a hook on `LoopDetectorService`, not as a sibling. This avoids duplicating the existing heuristic that distinguishes *stuck* from *iterating* and respects AGENTS.md rule 1 (one loop detector, not two)."
  - "4 of 10 tools ship in this slice (the headless ones). Remaining 6 (bootstrap, invoke, advise_spend, format_handoff, list_models, set_provider_state, cancel_invocation) ship in S5–S7."

---

### S5 — orchestrator-runner plugin: bootstrap wizard + quota tracking (the discovery layer)

- **Status**: ready
- **Files**: `plugins/orchestrator-runner/src/lib/bootstrap.ts` (NEW), `plugins/orchestrator-runner/src/lib/quota.ts` (NEW), `plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts` (NEW), `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts` (NEW), `plugins/orchestrator-runner/src/lib/tools/get-quota.tool.ts` (NEW), tests, i18n.
- **Gate**: `bun run test plugins/orchestrator-runner && bun run typecheck && bun run lint:cli:i18n`
- **Acceptance**:
  - "Tool `<prefix>_discover_providers` runs `command -v` for `claude, codex, copilot, aider, cn, agent` in parallel; returns `{detected: Array<{id, cliPath, version, authTier}>, missing: Array<{id, installHint: {tool, args, pipeTo?, dangerous}}>}`."
  - "Tool `<prefix>_bootstrap_providers` runs the full wizard: PATH probe → auth RPC per detected tool → write `${cacheDir}/orchestrator-runner/roster.draft.json` → return prose brief to caller → on user confirm, copy subset to `mcp-vertex.config.json#providers`."
  - "Diff format: RFC 6902 JSON Patch (CRITICAL I13 fix). User confirms via MCP `elicitation` or CLI prompt (mirrors f00046 conventions)."
  - "Quota tracker (`quota.ts`) merges 3 sources in priority order: HTTP response headers (cheapest, per-request), `account/read` / `auth status` RPCs (5-min cache), local token count (fallback; documented imprecise). Window is mandatory (`hourly` | `monthly` | `weekly`); never averaged across windows (CRITICAL I3 fix)."
  - "`${cacheDir}/orchestrator-runner/quotas.json` is written under `withFileMutex` + `redactSecrets`."
  - "i18n: 12 langs × 3 new tools. `bun run lint:cli:i18n` passes."

---

### S6 — orchestrator-runner plugin: subprocess invocation (Option E core)

- **Status**: ready
- **Files**: `plugins/orchestrator-runner/src/lib/subprocess/pool.ts` (NEW), `cli.ts` (NEW), `mcp-client.ts` (NEW), `api.ts` (NEW), `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts` (NEW), `cancel-invocation.tool.ts` (NEW), `format-handoff.tool.ts` (NEW), `list-models.tool.ts` (NEW), `set-provider-state.tool.ts` (NEW), tests, i18n.
- **Gate**: `bun run test plugins/orchestrator-runner && bun run typecheck && bun run lint:cli:i18n`
- **Acceptance**:
  - "Generic `SubprocessPool` lives at `plugins/orchestrator-runner/src/lib/subprocess/pool.ts` (CRITICAL C8 fix: generic primitive; could move to `core/src/lib/shared/` in a future proposal once a second consumer exists)."
  - "Pool size 2 by default; concurrency limit 4; auto-restart on crash with exponential backoff."
  - "Cancellation semantics per provider kind (CRITICAL I8 fix): `mcp-server` sends standard JSON-RPC `$/cancelRequest` notification with the active request `id`; `cli` sends `SIGTERM` at 5s, `SIGKILL` at 10s; `api` aborts the `fetch` via `AbortController` (upstream spend not refundable); `subscription` is best-effort."
  - "**Configurable timeouts:** `plugins.orchestrator-runner.options.invokeTimeoutMs` (default 30_000) is the wall-clock cap per `<prefix>_invoke` call. Per-invocation override via `timeoutMs` argument. The runner enforces this **before** the cancellation ladder (i.e. timeout fires SIGTERM at 5s before wall-clock cap, SIGKILL at 10s before wall-clock cap, then surfaces a `timeout-exceeded` error). Schema field lives under `plugins.orchestrator-runner.options`; defaults are baked in `OptionsSchema`."
  - "Tool `<prefix>_invoke {task, mode?, capabilityHints?, costPreference?, sessionId?, stream?, toolsAllow?}` returns either `{decision, result{text, structuredContent?, usage?, costUsd?}, invocationId, sessionId}` or `{decision, error{code:'all-providers-failed', tried, nextAvailableAt}, userMessage}`."
  - "Fallback strategy: `fallbackStrategy: 'rerank'` (default) re-scores with the failed provider excluded and `maxCostTier` relaxed by 1 per hop (CRITICAL I7 fix). `fallbackStrategy: 'tier-down'` (alternative) walks the cost tier strictly downward."
  - "Tool `<prefix>_cancel_invocation {invocationId}` cancels in-flight invocations per the per-kind rules above."
  - "Tool `<prefix>_format_handoff {decision}` formats a `handoff` strategy into a ready-to-run CLI command or curl template."
  - "Tool `<prefix>_list_models` enumerates the merged roster (confirmed + discovered + healthcheck-applied)."
  - "Tool `<prefix>_set_provider_state {providerId, state, until?, reason?}` lets the user manually override availability (e.g. *\"force claude-code-opus unavailable until midnight\"*)."
  - "Default safety: `executeApi: false`, `confirmBeforeExecute: true`. With `executeApi: true`, each `api` / `cli` invocation emits an MCP `elicitation` for a signed token tied to that specific invocation. The LLM cannot mint its own tokens (CRITICAL I5 fix). Every auto-bypassed invocation is recorded in `usage-summary.json#autoBypassed`."
  - "i18n: 12 langs × 6 new tools. `bun run lint:cli:i18n` passes."
  - "CLI commands added under `packages/cli/src/commands/groups/orchestrator-runner.ts` (consumes f00046 conventions): `mcpv orchestrator-runner invoke`, `cancel-invocation`, `format-handoff`, `list-models`, `set-provider-state`, `bootstrap`, `discover`, `get-quota`, `advise-routing`, `healthcheck`."

---

### S7 — usage-tracking extension: auto-bypass accounting + advise_spend

- **Status**: ready
- **Files**: `plugins/orchestrator-runner/src/lib/tools/advise-spend.tool.ts` (NEW), `plugins/usage-tracking/src/lib/auto-bypass.ts` (NEW), `usage-tracking/src/lib/tools/report.tool.ts` (EXT — adds `autoBypassed` field), i18n.
- **Gate**: `bun run test plugins/orchestrator-runner plugins/usage-tracking && bun run typecheck && bun run lint:cli:i18n`
- **Acceptance**:
  - "Every invocation that auto-bypassed `confirmBeforeExecute` (per CRITICAL I5 fix) increments a counter in `usage-summary.json#autoBypassed`."
  - "Tool `<prefix>_advise_spend {windowDays?}` returns `{currentState{byProvider, byPlugin, byAgent, byExtension}, observations[], recommendations[]}` with `riskLevel: low|medium|high` on each recommendation. Recommendations are non-destructive; the user must confirm before they touch the config."
  - "Tool `<prefix>_usage_report` adds an `autoBypassed: number` field per provider."
  - "i18n: 12 langs × 1 new tool (`advise_spend`)."
  - "**Circuit breaker** lives at `plugins/usage-tracking/src/lib/circuit-breaker.ts` (not in `orchestrator-runner`): it observes `invocations.jsonl`, computes rolling `sessionSpendUsd` (since session start) and `monthlySpendUsd` (calendar-month window), and writes a `limitsStatus: { sessionSpendUsd, sessionLimitUsd, sessionLimitPct, monthlySpendUsd, monthlyLimitUsd, monthlyLimitPct, breached: 'session'|'monthly'|null }` block into `usage-summary.json`. When `breached` is set, `<prefix>_invoke` returns `{ error: { code: 'spend-limit-exceeded', scope, limitUsd, observedUsd, message } }` **before** spawning any subprocess or HTTP call."
  - "**Integration with the fallback chain** (from `06`): when the circuit breaker breaches, the runner does **not** surface a hard error if `fallbackStrategy: 'rerank'` is set and there exists at least one provider at `costTier <= 1`. In that case the runner degrades automatically to the cheapest available provider and logs the degradation in `usage-summary.json#degradations`. With `fallbackStrategy: 'tier-down'` (or no cheap tier available), the hard error fires."
  - "**Configuration** adds two fields to `plugins.usage-tracking.options`: `maxSessionSpendUsd?: number` (default undefined = unlimited) and `maxMonthlySpendUsd?: number` (default undefined). When either is set, the breaker is active. JSON schema gain is a single `{type:'object', properties: {maxSessionSpendUsd: {type:'number', minimum:0}, maxMonthlySpendUsd: {type:'number', minimum:0}}, additionalProperties:false}` block — no global schema touch needed (per-plugin options)."
  - "**`<prefix>_advise_spend` surfaces `limitsStatus`** in its `currentState` output, so the LLM-as-cost-analyst can recommend *\"you have $12 of your $50 monthly cap left; consider switching to Sonnet for the rest of the week\"* before the user hits the wall."

---

### S8 — Lint + secrets posture

- **Status**: ready
- **Files**: `tools/scripts/lint/no-cleartext-secrets.script.ts` (NEW), `packages/core/src/lib/shared/redact.ts` (EXT — learn `OPENAI_API_KEY = <value>` / `ANTHROPIC_API_KEY = <value>` / `OPENROUTER_API_KEY = <value>` env-var assignment shapes), `vitest.config.ts` (EXT — register new lint), `package.json` (EXT — add `lint:no-cleartext-secrets` to `validate`).
- **Gate**: `bun run lint && bun run lint:no-cleartext-secrets && bun run validate`
- **Acceptance**:
  - "`no-cleartext-secrets.script.ts` walks `mcp-vertex.config.json` and `*.config.json` under the workspace, excluding test fixture directories (e.g., `**/tests/fixtures/**`) and example directories (e.g., `docs/mcp-vertex/examples/**`); rejects any field whose name matches `/key|secret|token|password/i` AND whose value is not a `${ENV_VAR}` reference."
  - "`redactSecrets` learns the env-var assignment shape: matches `OPENAI_API_KEY\s*=\s*<value>`, `ANTHROPIC_API_KEY\s*=\s*<value>`, etc. Any text containing such an assignment is replaced with `OPENAI_API_KEY=<redacted>` before write."
  - "`bun run validate` includes the new lint."

---

### S9 — i18n + docs + plugin surface

- **Status**: ready
- **Files**: `apps/web/src/i18n/tools/orchestrator-runner/` (NEW — full 12-lang coverage for all 10 tools), `apps/web/src/i18n/tools/usage-tracking/` (NEW — 12 langs × 2 tools), `docs/mcp-vertex/CROSS-PROJECT-SETUP.md` (EXT — add `providers` block to the config walkthrough), `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` (EXT — add the two new plugins to the catalog), `plugins/orchestrator-runner/README.md` (NEW), `plugins/usage-tracking/README.md` (NEW).
- **Gate**: `bun run lint:cli:i18n && bun run check-tutorials-i18n && bun run test`
- **Acceptance**:
  - "All 12 tool descriptions × 12 languages are present in `apps/web/src/i18n/tools/`. `check-tutorials-i18n` and `lint:cli:i18n` pass."
  - "Cross-project setup docs show the new `providers` block with one worked example (the user's exact scenario, see `wiki/scenarios/copilot-with-minimax-byok.md`)."
  - "Each new plugin README documents: public tool list (with outputSchema summaries), config schema, cache layout, dependencies, kill switch (`plugins.<name>.options.enabled: false`)."
  - "Plugins are **opt-in**, not in the default preset. `mcp-vertex.config.json` example shows them under `plugins` but not in the `swarm` preset."
  - "**CLI surface for usage-tracking** is added under `packages/cli/src/commands/groups/usage-tracking.ts` (consumes f00046 conventions): `mcpv usage-tracking report --group-by=provider|plugin|agent|extension --window-days=7 --json` and `mcpv usage-tracking clear --confirm`. These wrap `<prefix>_usage_report` and `<prefix>_usage_clear` and let the user inspect spend from a terminal without an IDE — useful for CI dashboards and shell workflows."

---

### S10 — End-to-end smoke + benchmark

- **Status**: ready
- **Files**: `plugins/orchestrator-runner/tests/e2e/invoke-real-subprocess.e2e.spec.ts` (NEW), `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts` (NEW), `plugins/orchestrator-runner/tests/e2e/fallback-chain.e2e.spec.ts` (NEW).
- **Gate**: `bun run test --e2e && bun run validate`
- **Acceptance**:
  - "`invoke-real-subprocess.e2e.spec.ts` boots a real `codex mcp-server` subprocess and makes a round-trip call (no network spend; uses `--model` only if a key is present in env, else mocks). Asserts structured `IRoutingDecision` + `CallToolResult`."
  - "`1000-calls-latency.e2e.spec.ts` fires 1000 tool calls and asserts p99 latency regression < 5ms vs the same scenario without `usage-tracking` subscribed."
  - "`fallback-chain.e2e.spec.ts` marks the top-scored provider as `quota-exceeded` and verifies the runner picks the next-best provider; then advances the clock past `resetAt` and verifies the runner retries the original."
  - "All e2e tests are CI-friendly: no network calls, no real API spend. Use `mocks/` directory under `tests/`."

---

## acceptance

This section mirrors the frontmatter `acceptance:` array. Every
acceptance check must pass before this proposal moves from `ready`
to `done`. The runtime gates are:

```bash
bun run typecheck        # tsc --noEmit -p tsconfig.json
bun run lint             # biome ci .
bun run lint:tools       # no .py/.sh in tools/
bun run lint:plugins-imports
bun run lint:proposals   # every proposal frontmatter + structure valid
bun run test             # vitest run (unit + integration)
bun run validate         # the composite gate
```

A check is **passed** when its command exits 0 and produces no
errors. Warnings are tolerated unless explicitly listed in the
slice's acceptance bullets.

## notes

### Risks (each slice's failure mode)

| Slice | Risk | Mitigation |
|---|---|---|
| S1 | Drift between JSON schema and Zod mirror | `bun run config:schema` regenerates the JSON; a snapshot test asserts the Zod-parsed config round-trips identically. |
| S2 | Slice parser regex breaks existing proposals | Run the full proposals corpus through the new regex in a test; require zero regressions. |
| S3 | Buffered append loses records on crash | Use `writeFileAtomic` per flush (not buffered in memory); crash loses ≤64 entries or ≤250ms of records. |
| S4 | Scoring function drifts between wiki and code | The wiki points at `plugins/orchestrator-runner/src/lib/router/score.ts`; both pages reference the same file. |
| S5 | Quota merge creates false positives | Window is mandatory; merge refuses to combine hourly + monthly into one number. |
| S6 | Subprocess pool leaks memory under long sessions | Pool has explicit `dispose()`; tests assert zero handles after 10k invocations. |
| S7 | Auto-bypass counter is bypassable | Counter increments inside the same code path that issues the invocation; not opt-in. |
| S8 | Lint rejects existing user configs | Lint is run during S10 only; existing configs without `providers` are unaffected (additive schema). |
| S9 | i18n keys miss the gate | i18n script is in `validate`; PR cannot land if any of the 12 langs is missing. |
| S10 | E2E flakiness from real subprocess | Tests use `codex mcp-server` with `--dry-run`-equivalent flag, not real model calls; deterministic. |

### Rollback path

- S1–S9 are **purely additive** (new files, new fields, new
  optional config blocks). Rollback = `git revert` the slice's
  commit; no other slice depends on them in a breaking way.
- S10 is the only slice that touches shared `validate` commands;
  removing the e2e specs is a single-file revert.
- The new plugins are **opt-in**: if a user reports trouble, they
  can `mcpv config set plugins.orchestrator-runner.options.enabled
  false` and the runner stops responding (returns `{ok: false,
  error: 'runner disabled'}`).
- The `IProviderCapabilities` contract, once shipped, becomes a
  public API of `@mcp-vertex/core`. Removing it is a breaking
  change; renaming is not. Plan accordingly.

### What this proposal does NOT do (deferred to f00067+)

- **`onTokenUsage` hook in `IHostObservability`** (so the runner
  could observe non-Codex subprocess spend). Defer until a second
  provider exposes equivalent events.
- **Aider-style Copilot token-exchange shim** (so the runner can
  invoke Copilot subscription directly without going through the
  Copilot CLI). Defer until Aider's shim is stable upstream.
- **LiteLLM proxy integration** as a routing backend (instead of
  per-provider HTTP). Defer until at least one user asks for it
  explicitly.
- **Multi-host aggregation** of `usage-summary.json`. Defer until
  cross-host sync has a concrete UX.
- **A `plugins/llm-gateway`** that proxies API calls. Out of scope
  for this proposal; would require a separate security review.

---

### Closure — 2026-06-25 (draft)

This proposal enters `ready` on 2026-06-25. Slices will close in
order; each close commits a `feat(f00067 S<n>): <title>` per the
project's Conventional Commits convention. Once all ten slices are
shipped and `bun run validate` is green on `main`, this proposal
moves to `done` and is filed under `docs/mcp-vertex/proposals/done/`.