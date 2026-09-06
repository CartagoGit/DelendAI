# 01 — The problem

The user (in this conversation, on 2026-06-25) asked, in Spanish:

> *"Could we make the orchestrator analyze the models available to
> whoever uses our repo and decide which one is best for each task,
> so we can do the task efficiently, spending few tokens but reaching
> the best possible result?"*

Followed by a clarification:

> *"I understand that we still need a place to pass API keys and
> such, and that Claude or Codex don't make API keys easy for their
> plans, but if they can access from their extensions we should have
> mechanisms to access them too."*

And the immediate context (a real example):

> *"How to handle, say for example in the Copilot chat to the
> orchestrator, let's say M3 MiniMax as the model with BYOK in
> Copilot, and that it knows how to work if it has no access to spawn
> subagents from other models — if it doesn't have access to Codex or
> Claude or other Copilot models..."*

Distilled, there are **three sub-problems** and **one hard constraint**.

---

## Sub-problem 1 — Discovery

> *"What models do I have available right now?"*

You might have:
- A Copilot Pro subscription (gives access to Claude Sonnet 4.5/4.6,
  GPT-5.x, Gemini 3.x, and MiniMax M3 as BYOK).
- A Claude Code Pro / Max subscription (Claude family, model picked by
  Anthropic).
- A ChatGPT Plus / Pro subscription (GPT family + Codex CLI).
- An OpenRouter API key (200+ models on demand).
- An Anthropic API key (Claude via direct API).
- An OpenAI API key (GPT via direct API).
- A Google AI Studio key (Gemini via API).
- Any combination.

The orchestrator should know which subset applies to you, how each one
is reachable from your environment, and at what relative cost.

## Sub-problem 2 — Routing

> *"What task goes best on which model?"*

Each task has implicit requirements:

| Task class | Implicit needs |
|---|---|
| Small refactor | fast, cheap, code-edit |
| Architectural decision | deep reasoning, large context |
| Security audit | adversarial reasoning, careful reading |
| 1M-token log analysis | huge context window |
| Quick "what does this error mean?" | speed, low cost |
| Multi-file rewrite with tests | code-edit precision, follow-through |

Models specialize differently. The decision changes weekly. **The
routing policy cannot live in hardcoded code.**

## Sub-problem 3 — Execution / handoff

> *"How do I run it?"*

Three modes:

1. **Direct API call** — if the model is reachable via API (you have a
   key, the model is exposed at a URL).
2. **CLI handoff** — if the model is reachable only via a terminal
   command in another tool (`claude`, `codex`, `cursor-agent`).
3. **IDE handoff** — if the model is reachable only by opening a chat
   in another IDE and pasting a prompt.

The orchestrator can't always do (1); it can always do (2) and (3).

---

## The hard constraint — Catalog freshness

> *"Models keep growing non-stop, we can't keep updating our project
> continuously with every new model that comes out every 2 days."*

This kills any approach where the canonical model catalog lives in our
code. Mitigations:

| Strategy | Lives where | Survives weekly churn |
|---|---|---|
| Hardcoded in `delendai` source | `packages/core/src/...` | ❌ worst |
| YAML file in our repo | `config/providers.yaml` | ⚠️ needs PRs |
| User's `delendai.config.json` | at project root | ✅ user-maintained |
| Subscribed upstream feed (LiteLLM JSON, OpenRouter API) | external | ✅ auto |
| LLM-as-advisor interprets declared roster | user's config + LLM | ✅ most resilient |

The last two are the only ones that actually scale.

---

## Non-goals (what we are NOT trying to solve)

- **Replace the user's IDE model picker.** Cursor's model picker,
  Copilot's model picker, Claude Code's `/model` command are all
  fine. We're adding *advice and automation on top*, not replacing
  user choice.
- **Become an LLM gateway.** We don't proxy API calls. We may
  *delegate* to existing gateways (OpenRouter, Portkey, LiteLLM
  proxy) but we don't run one.
- **Auto-detect which model the caller is using.** MCP stdio doesn't
  carry host identity. We accept this; the user declares what they
  have.
- **Pay for the user's tokens.** The user already has their billing
  set up. We don't add a payment layer.

---

## The user-visible shape

What the user actually wants, in three sentences:

1. Tell my orchestrator what models I have access to (one config block).
2. Have it **suggest** which model to use for each piece of work
   (slice, task, conversation), explaining why.
3. When the suggested model isn't directly callable from the
   orchestrator, give me a copy-paste-able prompt and the exact
   command to run it in the right tool.

Everything in [`03-four-options-considered.md`](03-four-options-considered.md)
and [`04-recommended-approach.md`](04-recommended-approach.md) is
about delivering those three things without building an LLM gateway,
without hardcoding model catalogs, and without leaking API keys into
project files.
