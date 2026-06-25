# Claude Code

**Class:** Terminal agent with `opusplan`, advisor, subagent models.

---

## Summary

Anthropic's terminal agent. **The most ergonomic "per-task model
selection" UX of any tool**, but **subscription-scoped to Claude
only** — no GPT/Gemini routing.

## Routing model

**Multiple orthogonal mechanisms, all declared:**

- **Aliases** — `default` (tier-dependent), `best` (Fable 5 if
  available, else Opus), `fable`, `opus`, `sonnet`, `haiku`,
  `opus[1m]`, `sonnet[1m]`, `opusplan`. **`opusplan` is the killer
  primitive**: "in plan mode uses Opus for complex reasoning and
  architecture decisions, in execution mode automatically switches
  to Sonnet for code generation and implementation" — pure
  declarative mode-based routing.
- **Pin per family**:
  `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-8` (also
  `*_SONNET_MODEL`, `*_HAIKU_MODEL`, `*_FABLE_MODEL`). Pin
  provider-form IDs for Bedrock / Vertex / Foundry.
- **`--model` flag** at startup, `/model <alias>` mid-session,
  `/model` picker UI.
- **`fallbackModel: ["sonnet", "haiku"]`** setting or
  `--fallback-model sonnet,haiku` — *content-agnostic* fallback
  chain (tries primary, on overload tries next; retries last only
  one turn).
- **`CLAUDE_CODE_SUBAGENT_MODEL`** — overrides the model for ALL
  subagents / agent teams.
- **`advisorModel`** / `--advisor opus|sonnet|fable` — enables a
  **server-side advisor tool** that runs alongside the main model;
  the advisor decides mid-task when to consult the main model.
  (Documented separately; this is essentially an LLM-as-judge
  auto-routing layer.)
- **Subagent frontmatter `model:`** + **Agent tool `model:`
  parameter** — different model per spawned subagent.
- **`availableModels`** allowlist + **`enforceAvailableModels: true`**
  — restrict what's selectable.
- **Automatic fallback** — when Fable 5's safety classifiers flag
  a request, auto-switch to Opus 4.8 (or refuses). This is
  content-based routing, not prompt-based.
- **Effort levels** — `low/medium/high/xhigh/max/ultracode` change
  reasoning depth, not which model.

## Catalog freshness

Aliases update with each Claude Code release (e.g. `opus` rolled
forward from 4.6 → 4.7 → 4.8). Pinning is explicit.

## Subscription-only support

❌ (Claude only) — but the *Claude Code subscription* itself is the
subscription. You can also use Bedrock / Vertex / Foundry / Claude
Platform on AWS / an LLM gateway behind `ANTHROPIC_BASE_URL` +
`modelOverrides`.

## Pricing

$20 Pro / $100 Max / $200 Ultra per month; API via Anthropic Console.

## URLs

- <https://code.claude.com/docs/en/model-config> (model aliases,
  opusplan, fallbackModel, subagent model, advisorModel,
  availableModels)
- <https://code.claude.com/docs/en/cli-reference> (`--model`,
  `--fallback-model`, `--advisor`, `--effort`)
- <https://code.claude.com/docs/en/sub-agents> (per-subagent model
  frontmatter)
- <https://code.claude.com/docs/en/advisor> (server-side advisor
  tool — the LLM-as-judge layer)
- <https://code.claude.com/docs/en/llm-gateway> (routing via gateway
  + `modelOverrides`)

## What we can borrow for Option D

- **`opusplan` is the single most important idea in this entire
  wiki.** Don't make the advisor pick a model by reading the prompt
  — make it pick a *mode* (plan / explore / implement / review) and
  look up the model for that mode in the roster. Plan mode → Opus-
  class; explore → Haiku-class; implement → Sonnet-class; review →
  Haiku-class. This collapses an N-models decision into an N-modes
  decision and is fully introspectable.
- **`advisorModel`** — proves that an LLM-as-judge routing layer
  is a viable production pattern, not just an academic toy. Our
  `<prefix>_advise_routing` is the same shape, exposed as an MCP
  tool.
- **`fallbackModel`** — content-agnostic fallback chains are a v2
  extension for our `alternates` field.
- **Pin per family** (`ANTHROPIC_DEFAULT_OPUS_MODEL`) — translates
  in our scheme to `preferredProvider` on a slice (overrides the
  roster match for that slice).
- **`/model` mid-session** — translates to our `sessionId`
  stickiness.
- **Subagent frontmatter `model:`** — translates directly to our
  `requiresCapability` + `preferredProvider` on a slice.
