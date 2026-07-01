# Scenario: Copilot with MiniMax M3 as BYOK

> This is the user's exact example from the 2026-06-25 conversation:
> *"en el chat de Copilot al orquestador, con pongamos de ejemplo M3
> MiniMax de modelo como BYOK en Copilot, y que este sepa como
> trabajar si no tiene acceso para lanzar subagentes de otros modelos
> si no tiene acceso a Codex o a Claude o a otros modelos de
> Copilot..."*

This page walks through **what the user has**, **what they
configure once**, **what happens when the orchestrator sees a slice
that needs a different model**, and **what the user sees** in each
case.

---

## What the user has

- **GitHub Copilot Pro** (or Pro+ / Max).
- **MiniMax M3 configured as BYOK** in Copilot's settings (the user
  added their own API key for MiniMax in Copilot's "Models" panel).
- **No Claude Code subscription** (they'd have to buy one
  separately).
- **No Codex subscription** (same).
- **OpenRouter API key** in `OPENROUTER_API_KEY` env var
  (optional).

The user is sitting in the Copilot chat. M3 is the *current*
model — the one generating the agent's responses. The orchestrator
is connected as an MCP server.

## What the user configures once

```jsonc
// mcp-vertex.config.json
{
  "providers": [
    {
      "id": "copilot-m3",
      "kind": "subscription",
      "invoke": "vscode-copilot",
      "modelId": "MiniMax-M3",
      "contextWindow": 200000,
      "costTier": 1,
      "strengths": ["code-edit", "fast-iteration", "json-strict"],
      "weaknesses": ["very-long-context"]
    },
    {
      "id": "openrouter-minimax",
      "kind": "api",
      "invoke": "https://openrouter.ai/api/v1/chat/completions",
      "envVar": "OPENROUTER_API_KEY",
      "modelId": "minimax/minimax-m3",
      "contextWindow": 200000,
      "costTier": 1,
      "strengths": ["code-edit", "fast-iteration"],
      "weaknesses": ["very-long-context"]
    },
    {
      "id": "openrouter-opus",
      "kind": "api",
      "invoke": "https://openrouter.ai/api/v1/chat/completions",
      "envVar": "OPENROUTER_API_KEY",
      "modelId": "anthropic/claude-opus-4-8",
      "contextWindow": 500000,
      "costTier": 5,
      "strengths": ["architecture", "security-audit", "reasoning", "long-context"],
      "weaknesses": []
    },
    {
      "id": "openrouter-sonnet",
      "kind": "api",
      "invoke": "https://openrouter.ai/api/v1/chat/completions",
      "envVar": "OPENROUTER_API_KEY",
      "modelId": "anthropic/claude-sonnet-4-6",
      "contextWindow": 500000,
      "costTier": 2,
      "strengths": ["balanced", "code-edit", "long-context"],
      "weaknesses": []
    },
    {
      "id": "openrouter-gemini",
      "kind": "api",
      "invoke": "https://openrouter.ai/api/v1/chat/completions",
      "envVar": "OPENROUTER_API_KEY",
      "modelId": "google/gemini-3.1-pro",
      "contextWindow": 2000000,
      "costTier": 3,
      "strengths": ["very-long-context", "vision"],
      "weaknesses": []
    }
  ]
}
```

The user did **not** add a `claude-code` or `codex` entry because
they don't have those subscriptions.

## What the orchestrator does NOT do

The orchestrator **cannot invoke Claude Opus directly** even though
the user might want it for a hard architecture task. The user has
no Claude Code subscription. They have an OpenRouter key, which
gives them API access to Claude Opus through OpenRouter — and
that's exactly what `openrouter-opus` is.

**No handoff to Claude Code happens** because the user didn't
configure a Claude Code provider. The orchestrator doesn't know
"Claude Code" exists as an option. That's by design — the user
declared their roster; the orchestrator respects it.

If the user later gets a Claude Code subscription, they add one
line:

```jsonc
{
  "id": "claude-code-opus",
  "kind": "subscription",
  "invoke": "claude --model opus-4-8",
  "contextWindow": 500000,
  "costTier": 5,
  "strengths": ["architecture", "security-audit", "reasoning", "long-context"]
}
```

…and now handoffs to Claude Code appear in the routing decisions.

## Three concrete scenarios

### Scenario A — Small refactor slice

**Slice:** "rename `userId` to `userID` across 12 files in
`packages/core/src/`."

**Slice declares:**

```yaml
requiresCapability: ["code-edit"]
maxCostTier: 2
```

**What the orchestrator returns** (via
`<prefix>_advise_routing`):

```jsonc
{
  "decision": {
    "strategy": "passthrough",        // use the current agent's model
    "targetProvider": { "id": "copilot-m3", ... },
    "mode": "implement",
    "rationale": "code-edit capability matches; cost tier 1 is below max; no need for frontier model.",
    "estimatedCostTier": 1
  },
  "alternates": [
    { "targetProvider": "openrouter-sonnet", ... },
    { "targetProvider": "openrouter-minimax", ... }
  ],
  "scoringTrace": [
    { "provider": "copilot-m3", "score": 4, "reasons": ["+2 code-edit", "+1 tier<=2"] },
    { "provider": "openrouter-sonnet", "score": 2, "reasons": ["+2 code-edit"] },
    { "provider": "openrouter-opus", "score": -1, "reasons": ["+2 code-edit", "-3 overpaying"] }
  ],
  "sessionId": "s_8f3a..."
}
```

**What the user sees:** nothing changes. The orchestrator says "M3
is fine for this" and the agent uses M3. Zero network round-trips.

### Scenario B — Architecture decision slice

**Slice:** "evaluate whether the swarm coordination should use
Postgres or SQLite for the agent-lock table."

**Slice declares:**

```yaml
requiresCapability: ["architecture", "reasoning"]
mode: "plan"
```

**What the orchestrator returns:**

```jsonc
{
  "decision": {
    "strategy": "api",
    "targetProvider": { "id": "openrouter-opus", "kind": "api", "envVar": "OPENROUTER_API_KEY", ... },
    "mode": "plan",
    "rationale": "Plan mode + architecture requires frontier tier; copilot-m3 (tier 1) is too cheap for the reasoning depth needed; cost is justified.",
    "estimatedCostTier": 5
  },
  "alternates": [
    { "targetProvider": "openrouter-sonnet", ... },
    { "targetProvider": "openrouter-gemini", ... }
  ],
  "scoringTrace": [
    { "provider": "openrouter-opus", "score": 5, "reasons": ["+2 architecture", "+2 reasoning", "+1 tier>=4"] },
    { "provider": "openrouter-sonnet", "score": 3, "reasons": ["+2 architecture", "+1 tier>=2"] },
    { "provider": "openrouter-gemini", "score": 1, "reasons": ["+2 architecture", "-1 missing reasoning"] },
    { "provider": "copilot-m3", "score": -4, "reasons": ["-3 missing architecture", "-1 below target tier"] }
  ],
  "sessionId": "s_8f3a..."
}
```

**What the user sees:** the orchestrator generated a
`<prefix>_format_handoff` artifact with:

- `strategy: "api"` (because OpenRouter exposes Opus via API).
- A complete prompt, ready to send.
- A `curl` command AND a TypeScript snippet for the OpenAI SDK.
- Estimated cost tier 5.
- Instructions: *"Run this with `OPENROUTER_API_KEY` set. If you
  prefer to delegate in-Copilot, paste the prompt into a new Copilot
  chat with Opus as the model."*

The user **decides** whether to run the curl directly or paste into
Copilot. The orchestrator did not assume.

### Scenario C — Massive log analysis

**Slice:** "summarize 800k tokens of GitHub Actions logs to find
the recurring failure pattern."

**Slice declares:**

```yaml
requiresCapability: ["very-long-context", "summarization"]
mode: "explore"
```

**What the orchestrator returns:**

```jsonc
{
  "decision": {
    "strategy": "api",
    "targetProvider": { "id": "openrouter-gemini", "kind": "api", "modelId": "google/gemini-3.1-pro", ... },
    "mode": "explore",
    "rationale": "very-long-context (2M tokens) maps to Gemini; exploration tier is fine (cost tier 3).",
    "estimatedCostTier": 3
  },
  "alternates": [
    { "targetProvider": "openrouter-opus", ... },
    { "targetProvider": "openrouter-sonnet", ... }
  ],
  "scoringTrace": [
    { "provider": "openrouter-gemini", "score": 4, "reasons": ["+2 very-long-context", "+1 tier>=1", "+1 explore"] },
    { "provider": "openrouter-opus", "score": 2, "reasons": ["+2 very-long-context", "-1 overpaying for explore"] },
    { "provider": "copilot-m3", "score": -3, "reasons": ["-3 very-long-context in weaknesses"] }
  ],
  "sessionId": "s_8f3a..."
}
```

**What the user sees:** a handoff to Gemini via OpenRouter API.

## What the orchestrator explicitly does NOT do

- It does **not** try to invoke Claude Opus through the Copilot
  extension (Copilot is not an open API surface).
- It does **not** try to invoke Codex (the user doesn't have a
  ChatGPT subscription in this scenario).
- It does **not** make any HTTP call to an LLM API without explicit
  user opt-in (`executeApi: true` plugin option, default `false`).
  Even with `executeApi: true`, the user sees the curl/snippet
  first.
- It does **not** store `OPENROUTER_API_KEY` anywhere. The env var
  is read at request time only.
- It does **not** silently upgrade to a more expensive model. The
  `costPreference` knob and the `maxCostTier` field on the slice
  cap the decision.

## The user's overall experience

After the one-time config edit, the user mostly forgets about the
router. Most slices route to "use whatever I'm using" (copilot-m3,
cost tier 1, zero extra spend). The orchestrator only intervenes
when a slice is unusual:

- A slice that needs **architecture reasoning** → orchestrator
  suggests Opus via OpenRouter API; user runs the curl or pastes
  the prompt.
- A slice that needs **800k-token context** → orchestrator suggests
  Gemini; user runs the curl.
- A slice that needs **security audit** → orchestrator suggests the
  highest-tier available; user decides whether to spend.

The user **stays in control** of the cost. The orchestrator's job
is to *suggest*, not to spend.

## What changes if the user adds a Claude Code subscription

One config edit:

```jsonc
{
  "id": "claude-code-opus",
  "kind": "subscription",
  "invoke": "claude --model opus-4-8",
  ...
}
```

Now the orchestrator has a different way to invoke Opus for the
architecture slice: instead of `api` strategy (curl), it returns
`handoff` strategy with `command: "claude --model opus-4-8 '<prompt>'"`.

The user opens a terminal, pastes the command, Claude Code does
the work. The orchestrator did not pretend to invoke Claude Code
itself — it generated the command for the user to run.

This is the **honest answer** to the user's question: the
orchestrator cannot call a model it has no API for; it can only
**prepare the call for you to make**. That's what handoff means.
