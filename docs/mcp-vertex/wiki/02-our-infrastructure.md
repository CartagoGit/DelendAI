# 02 — Our infrastructure today

What `mcp-vertex` already has, mapped to the routing problem. The goal
is to find the **minimal extension points** that turn what's there into
a working routing layer — not to invent a parallel system.

This page is a structured summary; the full research report that
produced it lives in the chat history of the originating session
(2026-06-25, conversation
`398fa81a-372b-4df0-99a5-56ff1bfe75ce`).

---

## 1. Agent discovery / catalog

**What's there:**
- `buildCatalog()` in
  [`packages/core/src/lib/catalog/agent-discovery-catalog.ts`](../../packages/core/src/lib/catalog/agent-discovery-catalog.ts)
  returns an `ICatalogSnapshot` of **tools, skills, and proposals** —
  i.e. what the MCP server exposes.
- `proposals_agent_catalog` is a second catalog tool with the same shape.
- `<prefix>_overview` returns `IOverviewSnapshot` with
  `server.name`, `version`, `namespacePrefix`, `corePaths`,
  `plugins`, `tools`, `knowledge` — but **no host, model, or
  provider identity**.
- `IHostIdentity` (in `host-config.interface.ts`) carries `metadata`
  + `namespacePrefix`, never a model/provider. The composite
  `IMcpVertexHostConfig` has 5 sub-interfaces
  (Identity/Paths/Content/Observability/Registrations) — **no
  `Providers` sub-interface exists today**.

**What's missing:**
- No runtime signal of who is calling this MCP server right now
  (MCP stdio doesn't carry host/model identity).
- No sniffing of `process.env.CLAUDE_CODE` /
  `process.env.COPILOT_MODEL` / etc.
- The catalog doesn't expose `providers`.

**Extension point:** add a `providers: IProviderSummary[]` field to
`ICatalogSnapshot` and `IOverviewSnapshot`. Pure additive change.

---

## 2. Routing / task decomposition

**What's there:**
- `IProposalSliceContract` in
  [`proposal-slice-plan.ts`](../../plugins/proposals/src/lib/swarm/proposal-slice-plan.ts:14-30)
  carries `files`, `gate`, `dependsOn`, `acceptanceCriteria`. **The
  natural unit of routing** — every slice is a candidate for a
  per-slice model choice.
- `IAutoWorkOrchestrationConfig` has only `delegateAfterToolCalls`.
  The orchestration policy is a single hardcoded string
  (`'inspect-then-delegate'`); no per-slice model choice.
- `AGENT_CANONICAL_ROLES` are **task-domain roles**
  (`orchestrator`, `technical_investigator`, `proposal_guardian`,
  `delivery_verifier`, `implementation_runner`) — **not LLM-provider
  roles**. Two orthogonal axes today.
- The slice parser in
  `proposal-slice-plan.ts:54-100` is the natural parse site for a
  new `requiresCapability` field.

**What's missing:**
- No `requiresCapability`, `preferredProvider`, `minCapability`, or
  `minTier` field on slices.
- No decision point in `runAutoWork` between cascade resolution and
  "delegate" that asks "which provider?".

**Extension point:**
1. Add `requiresCapability: CapabilityTag[]` to
   `IProposalSliceContract`. Backward-compatible (optional).
2. Add a "route this slice" step in `runAutoWork` after the cascade
   resolves the next slice.

---

## 3. Secrets / API-key handling

**What's there:**
- `redactSecrets` in
  [`packages/core/src/lib/shared/redact.ts`](../../packages/core/src/lib/shared/redact.ts:38-60)
  matches `sk-…` (OpenAI), `AKIA…` (AWS), `AIza…` (Google),
  `sk_live_/sk_test_…` (Stripe), `gh[posru]_…` (GitHub), `xox[baprs]-…`
  (Slack), `Bearer <token>`, JWTs, and a generic
  `api_key|secret|token|password = <value>` pattern.
- Called via `redactSecrets(input)` from any plugin before disk write.
- The config schema (`mcp-vertex.config.schema.json`) has **no**
  `providers`, `secrets`, `apiKeys`, or `llm` block at any nesting
  level.

**What's missing:**
- No ingestion of `process.env` values into plugin options — config
  is filesystem-only.
- No "secrets" sub-interface in `IMcpVertexPluginConfig`.
- `redactSecrets` only catches on disk-write, not on memory/log.

**Extension point (posture decision):**
- **Recommended posture:** API keys live **only** in `process.env`.
  The config schema declares "which providers are enabled" (boolean
  or object with no key field). `redactSecrets` continues to be the
  belt-and-braces guard for any accidental leak.
- If the user wants config-file keys, they go through `redactSecrets`
  before persistence AND only get read at runtime, never written.

---

## 4. Host capability abstraction

**What's there:**
- `IHostCapabilities` in
  [`plugins/proposals/src/lib/swarm/host-capabilities.ts`](../../plugins/proposals/src/lib/swarm/host-capabilities.ts:21-50)
  captures **IDE UI affordances**: `ideDisplayName`,
  `chatPanelLocation`, `programmaticRenameActionId`, etc.
- Registered via `ctx.options.hostCapabilities` (DIP, opt-in).
- Default is `GENERIC_IDE_CAPABILITIES` (host-agnostic).

**The precedent is exactly right for what we need next:**
- Same shape works for `IProviderCapabilities` (provider name, model
  list, cost tier, capabilities, auth mode).
- Same registration path via `ctx.options.providers`.
- Same default fallback (`GENERIC_PROVIDER_CAPABILITIES` = empty
  roster, advisor says "no providers configured").

**This is the strongest reuse opportunity in the entire codebase.**
The audit plugin's recent `projectName` / `crossCuttingAdditions`
extension followed exactly this pattern.

---

## 5. Plugin-options plumbing

**What's there:**
- `IMcpVertexPluginConfig.options` is the typed tube from
  `OptionsSchema → register() → handler`.
- Path: JSON file → `load-config-file.ts` Zod parse → plugin's
  `OptionsSchema` → `register({ options })` → closure in handler.
- Each plugin owns its options shape; no plugin reads another plugin's
  options.

**Extension point:** add a `providers` block to any plugin's options
schema. Already proven by `plugins/audit/src/index.ts` (extended
recently with `projectName`, `configFileName`,
`crossCuttingAdditions`).

---

## 6. Catalog surface (for "what's available")

**What's there:**
- `ICatalogSnapshot` exposed by `<prefix>_overview` and
  `<prefix>_agent_catalog`.
- Returns tools, skills, proposals — but not providers.

**Extension point:** add a `providers: IProviderSummary[]` field.
Same return shape, additive. Two tools updated in parallel.

---

## 7. Token usage / budget

**What's there:**
- `IProposalBudget` (per-proposal caps: max iterations, premium calls).
- `swarm-closure.ts` reads `observedUsage` (iterations, premiumCalls,
  toolCalls, inputTokens, outputTokens) at closure.
- `IHostObservability.onToolCall` and `isAgentStuck` exist as
  lifecycle hooks.

**What's missing:**
- No real-time `onTokenUsage` hook. Token usage is captured only at
  swarm closure, not mid-session.
- Without this stream, the router can't do price-routing in real
  time (only on a per-proposal basis).

**Extension point (optional, future):** add `onTokenUsage(usage:
ITokenUsage)` to `IHostObservability`. Plugin-side: emit on every
provider-API call we make. Without this, the MVP works fine — we just
don't optimize mid-session on cost.

---

## 8. The f00006 design memo

[`docs/mcp-vertex/proposals/done/feats/f00006-feat-multi-model-audit-plugin.md`](../../proposals/done/feats/f00006-feat-multi-model-audit-plugin.md)
already enumerates the **three viable approaches** for multi-model
support in the audit plugin specifically:

- **(A) Manual brief-paste per IDE** — currently shipped.
- **(B) API fan-out via OpenRouter/Anthropic/OpenAI/Google** with a
  `providers` config block.
- **(C) Declared roster** — what the host IDE can reach.

The wiki's Option D is a **hybrid of B and C**, plus the new idea of
**LLM-as-advisor** (the LLM the user is already running interprets
the declared roster and the task description).

---

## Summary: what's already in place vs. what's missing

| Already in place | Missing |
|---|---|
| Slice-level granularity (`IProposalSliceContract`) | Slice capability field |
| `IHostCapabilities` DIP pattern | `IProviderCapabilities` |
| Plugin-options plumbing (`OptionsSchema → register → handler`) | `providers` schema in `mcp-vertex.config.schema.json` |
| `ICatalogSnapshot` exposed via `overview` / `agent_catalog` | `providers` field in catalog |
| `redactSecrets` regex set | Ingestion of `process.env` keys |
| `IHostObservability.onToolCall` | `onTokenUsage` hook (optional) |
| f00006 design memo (3 options) | Decision ratified as a proposal |

**The minimum viable change to support Option D:**
1. Add `IProviderCapabilities` interface in
   `plugins/proposals/src/lib/swarm/` (or a new
   `plugins/router/src/lib/`).
2. Add `requiresCapability: CapabilityTag[]` to
   `IProposalSliceContract`.
3. Extend `ICatalogSnapshot` with `providers: IProviderSummary[]`.
4. Add two MCP tools: `<prefix>_advise_routing` and
   `<prefix>_format_handoff`.

Everything else is incremental polish. See
[`04-recommended-approach.md`](04-recommended-approach.md) for the
detailed design.
