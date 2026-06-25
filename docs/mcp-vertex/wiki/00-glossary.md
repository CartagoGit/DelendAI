# 00 — Glossary

The terms used across this wiki, with the working definitions we adopt.
Where the field uses a word in two senses, the wiki's preferred meaning
is the first one listed.

---

## A

### Advisor
An LLM (or rule system) consulted at routing time to pick which model
should handle a task. The advisor is itself a model call; it's the
"brain" of the routing decision. See Claude Code's
`advisorModel` ([external/claude-code.md](external/claude-code.md)) and
OpenRouter's `openrouter/auto` ([external/openrouter.md](external/openrouter.md))
for two production examples.

### Auto-router
A routing layer that picks the model **automatically** (without an explicit
user choice) per request. Distinct from a *router* (the user picks a model
explicitly, the router just delivers the request). Examples: Cursor Auto,
GitHub Copilot Auto, OpenRouter `openrouter/auto`, LiteLLM Adaptive Router.

### `auto_work` (mcp-vertex concept)
The `<prefix>_auto_work` MCP tool from the `proposals` plugin. Polls for
next slice, executes the orchestration loop. **Not** a model router —
it decides *what* to do (which slice) but never *who* (which LLM).

---

## B

### Bandit / Multi-armed bandit
A learning algorithm that picks among options (arms) by balancing
exploration and exploitation, accumulating a reward signal over time.
LiteLLM's Adaptive Router uses a *contextual bandit* over
`(task_type, model)` cells. See
[external/litellm.md](external/litellm.md).

### BYOK — Bring Your Own Key
A pricing/auth model where you supply credentials for one or more
providers (e.g. your Anthropic API key) and the platform acts as an
identity/observability layer without adding markup on tokens. OpenRouter
BYOK, Portkey BYOK. **Distinct from "I have a Claude Code subscription
and want to use it"** — BYOK refers to API credentials, not IDE
subscriptions.

---

## C

### Cascade
A configured ordering of models used for the same logical task at
different cost tiers. Aider's `weak_model_name` + `editor_model_name`
pattern is a 3-tier cascade: main model for the hard work, a cheap
model for commit messages / summaries, and a format-strict model for
editor diffs. See [external/aider.md](external/aider.md).

### Cold-start (bandit)
The state before enough samples have been observed for a
`(task_type, model)` cell to have a reliable reward estimate.
Strategies: declared priors (tier, cost), heuristic fallback,
"ask the advisor LLM."

### Cost tier
A 1–5 integer we use in the proposed roster to express relative cost
per task. Tier 1 ≈ sub-cent per typical coding task (Haiku, Flash,
MiniMax). Tier 5 ≈ multiple cents per task (Opus 4.8, GPT-5.5 max
effort). Tunable per user.

---

## D

### Dispatch (mcp-vertex concept)
The act of sending a tool call to a registered handler. The dispatch
path is currently host-agnostic; a future routing layer sits in front
of the handler to pick *which* provider's handler receives the call.

---

## H

### Handoff
**The canonical wiki definition.** When the orchestrator cannot itself
invoke a target model (because it has no API key, no subscription
bridge, or because the model lives only inside a closed IDE), it
prepares everything the user needs to invoke it themselves and
returns it as a structured envelope:

```typescript
{
  strategy: "handoff",
  targetProvider: "claude-code-opus",
  prompt: "<fully formed prompt, no placeholders>",
  command: "claude --model opus-4-8 '<prompt>'",
  rationale: "<why this model beats the alternatives for this task>"
}
```

The user pastes/runs it in their IDE. The MCP server made zero
network calls to the model. **Handoff is honest about the limits of
our position** — we are not the LLM runtime, we are the routing brain.

> **Origin of the term in this wiki:** borrowed from clinical/hospital
> jargon (handoff = "I'm passing the patient to you, here's their
> chart"). Also used informally by Claude Code and Codex teams to mean
> "I prepared this for the next agent/user."

### Host
The IDE or process that runs an LLM and calls MCP servers. Examples:
VS Code with Copilot, Claude Code terminal, Cursor, Aider, Continue,
Codex CLI.

### Host capabilities (mcp-vertex concept)
An interface in `plugins/proposals/src/lib/swarm/host-capabilities.ts`
that captures what UI affordances a host provides (rename chat, panel
location, etc.). **Does not cover LLM capabilities** — that's what
[`IProviderCapabilities`](#provider-capabilities) would cover.

---

## L

### LLM gateway
A proxy service that fronts many providers behind one URL/auth scheme.
Portkey, Cloudflare AI Gateway, LiteLLM Proxy. The MCP server could
choose to talk to a gateway instead of providers directly.

---

## M

### Mode (routing)
A small set of named routing intents used to collapse the N-models
decision space. Inspired by Claude Code's `opusplan`: `plan`,
`explore`, `implement`, `review`. Each mode maps to a model class
in the roster.

### Model catalog
The list of `(model_id, provider, context_window, cost_per_1k,
capabilities)` triples the router can choose from. Two sources:
declared (in `mcp-vertex.config.json`) and discovered (LiteLLM
JSON, OpenRouter API, Artificial Analysis feeds).

### `mcp-vertex.config.json`
The canonical configuration file for `@mcp-vertex/core`. Lives at the
repo root. Today: cache, docs, plugins, validation matrix. **Future:**
a top-level `providers` block (added in [`04`](04-recommended-approach.md)
and ratified by [`f00066`](../../proposals/ready/f00066-multi-model-orchestrator.md)).

### Cache root (`${corePaths.cacheDir}`)
The single cache directory for the whole `mcp-vertex` instance.
Default: `.cache/mcp-vertex` relative to the workspace root (NOT
under `$HOME` — see AGENTS.md rule 5). Each plugin gets a subfolder
named after the plugin slug (`${cacheDir}/<plugin>/`). For
`orchestrator-runner` the relevant files are `roster.draft.json`,
`quotas.json`, `healthcheck.json`, `sessions.json`. For
`usage-tracking`: `invocations.jsonl`, `usage-summary.json`,
`pricing.json`.

---

## O

### `opusplan` (Claude Code concept)
The `opusplan` model alias in Claude Code automatically switches
between Opus (for plan mode / architecture reasoning) and Sonnet (for
execution / code generation). **The cleanest declarative primitive in
the field for mode-keyed routing.** We propose copying this pattern
under a different name in Option D. See
[external/claude-code.md](external/claude-code.md).

---

## P

### Provider
A backend that serves LLMs. Anthropic, OpenAI, Google, OpenRouter,
GitHub Copilot, Claude Code (via subscription), ChatGPT Codex (via
subscription). A *provider* is distinct from a *model* — Anthropic
serves Claude Opus, Sonnet, and Haiku; one provider, many models.

### Provider capabilities (proposed)
The interface we'd add alongside `IHostCapabilities` to describe
*what a provider/model can do*:

```typescript
interface IProviderCapabilities {
  readonly providerId: string;        // "anthropic", "openrouter", "copilot"
  readonly modelId: string;            // "claude-opus-4-8", "anthropic/claude-opus-4-8"
  readonly kind: "api" | "subscription" | "cli" | "web";
  readonly invoke: string;             // how to call it
  readonly envVar?: string;            // API key env var (api kind only)
  readonly contextWindow: number;
  readonly costTier: 1 | 2 | 3 | 4 | 5;
  readonly strengths: CapabilityTag[];
  readonly weaknesses: CapabilityTag[];
}
```

### Proxy (LLM)
A service that accepts requests in one format (typically OpenAI-
compatible) and forwards them to many backends with unified
observability, fallback, and (sometimes) routing. LiteLLM, Portkey,
Cloudflare AI Gateway, OpenRouter.

---

## R

### Roster
The declared set of `(provider, model, capabilities)` entries in
`mcp-vertex.config.json#providers`. **Statically maintained by the
user** — this is what survives when upstream catalogs go stale.

### Routing policy
The set of rules that, given a task description and a roster, decides
which provider/model to use. In Option D, this is a YAML/JSON file
near the config, with rules like:

```yaml
rules:
  - when: { mode: "plan" }
    prefer: { minCostTier: 4, strengths-includes: ["architecture"] }
  - when: { mode: "implement" }
    prefer: { minCostTier: 2, strengths-includes: ["code-edit"] }
```

---

## S

### Session stickiness
A property of routing: once a model has been picked for a session, all
subsequent turns route to the same model (until idle timeout).
OpenRouter's `session_id` does this; missing it means prompt-cache
misses and inconsistent behaviour across turns.

### Slice (mcp-vertex concept)
The unit of work in a `proposals` proposal. Each slice has
`files`, `gate`, `dependsOn`, `acceptanceCriteria`. **The natural
unit of routing** — adding `requiresCapability: CapabilityTag[]`
to `IProposalSliceContract` is the minimum schema change to enable
per-slice model selection.

### Subscription
A flat-rate plan from a provider that grants you access to one or
more models via a closed IDE/CLI — Claude Code ($20–$200/mo),
GitHub Copilot ($10–$100/mo), ChatGPT Plus/Pro/Team for Codex.
**Subscription access is not bridgeable to a third-party MCP server**
in general: Aider is the one tool that has hand-maintained bridges
(GitHub Copilot via token exchange; Codex and Claude Code require
OAuth workarounds that are unstable).

---

## T

### Tier (quality / cost)
A 1–3 (LiteLLM) or 1–5 (our proposal) integer expressing model class.
Used as a cold-start prior for routing when no observed bandit data
exists.

### Token usage stream
A real-time feed of `(agent, model, input_tokens, output_tokens,
timestamp)` events from the runtime. **Not present in `mcp-vertex`
today** — `IHostObservability` has `onToolCall` but no
`onTokenUsage`. Without this feed, no price-routing. See
[02-our-infrastructure.md](02-our-infrastructure.md).

---

## V

### Vendor scorer
A proprietary, undocumented algorithm a vendor (Cursor, GitHub
Copilot) uses to pick models in their "Auto" mode. We can't reproduce
it; we can only borrow the user-facing shape (one knob for
cost/quality preference).

---

## Cross-references

- For the user's exact example (Copilot + MiniMax M3 as BYOK), see
  [`scenarios/copilot-with-minimax-byok.md`](scenarios/copilot-with-minimax-byok.md).
- For the field's vocabulary as actually used in the wild, see the
  [`external/`](external/) pages.
