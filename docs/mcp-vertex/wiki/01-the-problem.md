# 01 — The problem

The user (in this conversation, on 2026-06-25) asked, in Spanish:

> *"¿Podríamos hacer que el orquestador analice los modelos que tiene
> disponibles el que use nuestro repo y se decida cuál es mejor para cada
> tarea, para hacer la tarea eficientemente, gastando pocos tokens pero
> llegando al mejor resultado posible?"*

Followed by a clarification:

> *"Entiendo que lo mismo hay que hacer un lugar donde pasar apikeys y
> tal, y que Claude o Codex no facilitan apikeys para sus planes, pero
> si ellos pueden acceder desde sus extensiones deberíamos tener
> mecanismos para acceder a ellas."*

And the immediate context (a real example):

> *"Como manejar, el decir por ejemplo en el chat de Copilot al
> orquestador, con pongamos de ejemplo M3 MiniMax de modelo como BYOK
> en Copilot, y que este sepa como trabajar si no tiene acceso para
> lanzar subagentes de otros modelos si no tiene acceso a Codex o a
> Claude o a otros modelos de Copilot..."*

Distilled, there are **three sub-problems** and **one hard constraint**.

---

## Sub-problem 1 — Discovery

> *"¿Qué modelos tengo disponibles ahora mismo?"*

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

> *"¿Qué tarea va mejor en qué modelo?"*

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

> *"¿Cómo lo ejecuto?"*

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

> *"Los modelos no paran de crecer, no podemos estar actualizando
> nuestro proyecto continuamente con los nuevos modelos que salgan
> cada 2 días."*

This kills any approach where the canonical model catalog lives in our
code. Mitigations:

| Strategy | Lives where | Survives weekly churn |
|---|---|---|
| Hardcoded in `mcp-vertex` source | `packages/core/src/...` | ❌ worst |
| YAML file in our repo | `config/providers.yaml` | ⚠️ needs PRs |
| User's `mcp-vertex.config.json` | at project root | ✅ user-maintained |
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
