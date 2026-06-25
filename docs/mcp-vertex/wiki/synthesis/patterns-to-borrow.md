# Patterns to borrow

Eight concrete patterns from the surveyed tools that map directly to
Option D's MVP. Each one is annotated with the file in
[`../04-recommended-approach.md`](../04-recommended-approach.md) it
informs and the source tool it comes from.

---

## 1. Aider's two-tier cascade as the default declared config

**From:** [Aider](../external/aider.md).

**Idea:** every entry in the roster gets a `primary`, a `weak`
(cheap summarizer / commit-message model), and optionally an
`editor` (cheap format-strict model). This is the simplest, most
auditable schema and it matches how real cost is paid: 90% of
tokens are cheap-tier work, 10% are frontier.

**Maps to:** the `IProviderCapabilities` interface in
`provider-capabilities.ts`. Add `weak?: IProviderCapabilities` and
`editor?: IProviderCapabilities` fields. Default to the entry
itself when omitted.

**Why it works at scale:** Aider proves this pattern scales to
500+ model entries in committed YAML.

---

## 2. Claude Code's `opusplan` as the LLM-as-advisor's first primitive

**From:** [Claude Code](../external/claude-code.md).

**Idea:** don't make the advisor pick a model by reading the
prompt — make it pick a *mode* (`plan`, `explore`, `implement`,
`review`) and look up the model for that mode in the roster. Plan
mode → Opus-class; explore → Haiku-class; implement → Sonnet-class;
review → Haiku-class.

This collapses an N-models decision into an N-modes decision and
is fully introspectable. **The richest UX primitive in the entire
field.**

**Maps to:** the `mode` enum in `IRoutingDecision` and the
`modeTier` table in the scoring function in
[`../04-recommended-approach.md`](../04-recommended-approach.md#41-prefix_advise_routing).

**Why it works:** the agent doesn't have to describe its own mode
in detail — it picks one of four labels. The roster declares which
model handles which mode. Same shape as Claude Code's
`opusplan` alias.

---

## 3. LiteLLM's cost-of-quality curve as the fallback

**From:** [LiteLLM](../external/litellm.md).

**Idea:** when the roster has no entry for the task type, fall
through to `LiteLLM Adaptive Router`-style bandit. Quality estimate
per `(task_type, model)` cell, cost weight 0.3–0.7, cold-start
priors from declared `quality_tier`.

**Maps to:** v2 of Option D's scoring function. The MVP uses
declared-only scoring; the bandit is layered on once
`onTokenUsage` exists.

**Why it works:** the user can still get a routing decision when
their roster is incomplete. The bandit improves over time without
the user doing anything.

---

## 4. OpenRouter's `cost_quality_tradeoff` knob and `session_id` stickiness

**From:** [OpenRouter](../external/openrouter.md).

**Idea:** one integer (0–10) for "cost vs quality now". Pin the
chosen model across a session's turns (otherwise prompt cache
misses and inconsistent behaviour). 5-minute idle expiry is the
sensible default.

**Maps to:** `costPreference: "minimize" | "balanced" | "maximize"`
and `sessionId` in the input to `<prefix>_advise_routing`.

**Why it works:** matches user mental model ("I want quality now"
vs "I'm being conservative") without exposing a confusing numeric
slider. Session stickiness is non-negotiable for prompt-cache
efficiency.

---

## 5. Subscribe to the Aider + LiteLLM shared catalog as the upstream feed

**From:** [Aider](../external/aider.md) +
[LiteLLM](../external/litellm.md).

**Idea:** don't roll our own pricing/context metadata. Aider's
`ModelInfoManager` already pulls
`model_prices_and_context_window.json` from LiteLLM with a 24h
cache; reuse that path (or mirror its structure). New models show
up automatically.

**Maps to:** a future `tools/scripts/lib/refresh-provider-catalog.script.ts`
that fetches the JSON and updates `contextWindow` / `costTier` in
the user's local roster. **Not in MVP.**

**Why it works:** the field has converged on this file as the
canonical source. Reusing it is free.

---

## 6. Use leaderboard data as advisor-side priors

**From:** [Leaderboards](../external/leaderboards.md).

**Idea:** at advisor decision time, look up the model's
`ArtificialAnalysisIntelligenceIndex` and `cost_per_task`, and use
those to initialize the scoring function's quality estimate.

**Maps to:** v2. The MVP uses declared-only priors.

**Why it works:** even when the user's roster is stale, the
advisor can sanity-check the recommendation against an independent
benchmark.

---

## 7. Expose the routing decision itself as MCP tools

**From:** [MCP routing servers](../external/mcp-routing-servers.md).

**Idea:** OpenRouter's `_mcp/server` and Portkey's MCP integration
prove the model: a `<prefix>_advise_routing(task_type, budget,
mode)` MCP tool is the right shape. Agents call it explicitly when
they want a deliberate choice; auto-agents can subscribe to its
output. The advisor LLM sits behind this MCP tool, so the
LLM-as-advisor is **just a tool call**, not a coupling point in
the agent runtime.

**Maps to:** the two MCP tools in
[`../04-recommended-approach.md`](../04-recommended-approach.md#4-the-two-mcp-tools).

**Why it works:** the agent runtime doesn't change. We add two
tools; agents that care call them, agents that don't, don't.

---

## 8. Don't try to learn across subscriptions

**From:** synthesis of [LiteLLM](../external/litellm.md),
[OpenRouter](../external/openrouter.md),
[Aider](../external/aider.md).

**Idea:** LiteLLM/OpenRouter can't route to a Claude Code or
Copilot subscription; Aider can only because it has hand-maintained
token-exchange shims. For the Option D MVP, the advisor's
"subscription" flag should just mean **"use this specific
OAuth-bearer bridge"** — and the canonical list of those bridges
today is:

- **Copilot** (`https://api.github.com/copilot_internal/v2/token` —
  already in Aider).
- **Claude Code** (`claude setup-token` — could be added).
- **Codex subscription** requires ChatGPT auth, not a bearer-token
  API, so it's **not bridgeable** in the same way; treat it as
  CLI-handoff only (`codex --model <name> "<prompt>"`).

**Maps to:** the `kind: "subscription"` provider entries use
`invoke: "claude --model …"`, `invoke: "codex --model …"`, etc.
No bearer-token bridge in MVP.

**Why it works:** honest about the limit. The orchestrator doesn't
pretend to call a model it can't; it formats the command the user
needs to run.

---

## Summary — what changes if we adopt all 8

- **Schema:** +200 lines (cascades, modes, cost prefs, session ids).
- **Logic:** +200 lines (scoring function, mode-keyed lookup,
  session stickiness cache).
- **No new runtime dependencies.**
- **No secrets in repo.**
- **Survives weekly model churn** (declared roster + LiteLLM feed +
  leaderboard priors).
- **Supports all 4 provider kinds** (api, subscription, cli, web).
- **Auditable** (scoring trace returned alongside the decision).
