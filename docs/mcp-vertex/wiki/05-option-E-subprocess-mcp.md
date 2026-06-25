# 05 — Option E: subprocess invocation + MCP-over-stdio

> **Status:** design draft. Born from the user's second pass at the
> problem on 2026-06-25: *"si se pudiera ejecutar las extensiones de
> las que tenemos via terminal, podría pasarse lo que queremos por
> terminal a la extension que queramos como queramos para que la
> procese, y según lo que nos vaya devolviendo que el orquestrador
> sepa como actuar con el siguiente paso."*

This page **supersedes** [`04-recommended-approach.md`](04-recommended-approach.md)
for the parts that change. Option D's config schema and slice
extension still apply; only the **execution model** changes.

---

## The user's insight, restated

> *"The user doesn't know how to value or configure models. That's
> what the IA is for. And that's what this MCP is for — to have
> context protocols for models."*

The previous options (A/B/C/D) put the **burden of knowledge** on
the user: they had to know what Opus 4.8 is, what tier 5 means, what
`kind: "subscription"` vs `"api"` does.

Option E flips it: **the orchestrator asks the LLM to figure it
out**, and **invokes the model as a subprocess** so the orchestrator
controls the loop, not the user.

Two technical ideas combine:

1. **Every modern LLM tool has a non-interactive CLI mode** (`-p`,
   `exec`, `--message`). Spawn a subprocess, pipe prompt in, parse
   response out.
2. **The orchestrator can be an MCP client** and the model CLI can
   be an MCP server. Spawn `codex mcp-server` (or equivalent), talk
   to it over stdio using the MCP JSON-RPC protocol, get
   `CallToolResult` payloads back. **No shelling out, no parsing
   plain text — the wire format is the protocol.**

---

## What we can do today (June 2026)

### Tools that have a non-interactive subprocess mode

| Tool | Command | Output format | Streaming |
|---|---|---|---|
| Claude Code | `claude -p "..."` (`--print`) | text / json / stream-json (NDJSON) | ✅ events |
| Codex CLI | `codex exec "..."` | text / `--json` (NDJSON with typed events) | ✅ events |
| Copilot CLI | `copilot -p "..."` | text + OTel GenAI spans | ⚠️ partial |
| Aider | `aider --message "..."` | plain text diff | ⚠️ token stream |
| Continue `cn` | `cn -p "..."` | text | ❌ headless |
| Cursor `agent` | `agent -p "..."` | text / `--output-format json` | ❌ headless |

**All 6 are spawn-and-wait compatible.** Aider, Continue `cn`,
Cursor `agent` are TTY-first with headless modes. Claude Code and
Codex are **API-first with structured events** — the right shape
for an orchestrator.

### Tools that expose themselves as MCP servers

| Tool | MCP server command | Tools exposed | Wire |
|---|---|---|---|
| **Codex CLI** | `codex mcp-server` | `codex`, `codex-reply`, `thread/*`, `turn/*`, `model/list`, `account/read`, `config/read`, `collaborationMode/list` | stdio JSON-RPC 2.0 |
| **GitHub Copilot CLI** | `copilot` (ACP, not MCP) | — | Agent Client Protocol (ACP) |

**Only Codex is a real MCP server today.** Copilot CLI exposes ACP
(Agent Client Protocol — MCP-adjacent, similar shape, not the same
wire format). Everyone else is a CLI you shell out to.

---

## The architecture

### What changes vs Option D

| Aspect | Option D | Option E |
|---|---|---|
| User configures roster | yes (JSON) | **LLM configures it from prose** |
| How the orchestrator invokes the model | generates prompt + command, user runs | **spawns subprocess directly** |
| How the orchestrator reads the response | human reads it | **structured JSON from stdio** |
| How the orchestrator chains to next step | user pastes output | **fully automated** |
| Where the user's API key lives | env var | env var (unchanged) |
| Subscription support | CLI handoff (`claude --model …`) | **subprocess invocation** (`claude -p --model …`) |
| Token usage signal | none | **Codex `turn.completed.usage` event** |

### The two execution modes (replacing Option D's `handoff`)

| `kind` | Option D strategy | Option E strategy |
|---|---|---|
| `subscription` | handoff (user runs) | **subprocess spawn** (`claude -p …`) |
| `cli` | handoff (user runs) | **subprocess spawn** |
| `api` | curl template OR live HTTP | **subprocess spawn of any tool with API key** OR direct HTTP |
| `mcp-server` | (not modelled) | **MCP client connection** |

The `mcp-server` kind is the killer addition. The orchestrator's
`registerProvider({ kind: "mcp-server", command: "codex mcp-server" })`
opens a stdio MCP connection. From then on, `<prefix>_advise_routing`
returns:

```jsonc
{
  "strategy": "mcp-tool",
  "targetProvider": {
    "id": "codex-mcp",
    "kind": "mcp-server",
    "command": "codex mcp-server",
    "modelId": "gpt-5.5",
    "tools": ["codex", "codex-reply", "model/list", ...]
  },
  "prompt": "<formatted>",
  "invoke": {
    "server": "codex-mcp",
    "tool": "codex",
    "args": { "PROMPT": "<prompt>", "model": "gpt-5.5" }
  },
  "rationale": "..."
}
```

The orchestrator **calls the tool directly**. Codex thinks with
GPT-5.5. The result comes back as a structured MCP tool result. The
orchestrator decides the next step.

---

## Discovery: how the orchestrator knows what's installed

Today the user has to declare their roster in JSON. With Option E,
the orchestrator can:

1. **Probe the PATH** at startup:
   ```bash
   for tool in claude codex copilot aider cn agent; do
     command -v "$tool" && echo "✓ $tool installed"
   done
   ```
   This tells us which CLIs are present, not what they can do.

2. **Spawn each one with `--help` / `auth status`** to learn its
   model roster and auth state:
   - `codex mcp-server` → `model/list` returns the configured
     model list with `inputModalities`, `supportedReasoningEfforts[]`,
     `isDefault`, etc.
   - `claude auth status --text` → tells us which auth tier the
     Claude Code subscription is on (free / pro / max).
   - `copilot help providers` → BYOK provider metadata.
   - `aider --list-models` → the provider's catalog.

3. **Ask the LLM to fill the gaps.** Once we know what's installed,
   the user says "I have Claude Code Max + an OpenRouter key", and
   the LLM fills in `strengths`, `weaknesses`, `costTier` based on
   what it knows about the models.

4. **Persist the roster.** `~/.cache/mcp-vertex/roster.json` (or
   `mcp-vertex.config.json#providers` if the user prefers explicit
   config). Re-probe on a TTL (24h like Aider's LiteLLM cache).

The user goes from *"edit JSON for 5 providers"* to *"click OK on a
bootstrap wizard that reads your disk."*

---

## Bootstrap from prose (the user's real ask)

> *"El usuario no va a saber valorarlo ni configurarlo, para eso
> está la IA."*

One tool call: `<prefix>_bootstrap_providers`. Behaviour:

1. Run the PATH probe (`command -v claude codex copilot aider cn
   agent`).
2. For each found tool, run the cheapest "tell me about yourself"
   command (`claude auth status`, `codex mcp-server` + `model/list`,
   `copilot help providers`, `aider --list-models`, etc.).
3. Present a **prose summary** to the LLM of the caller:

   > *"The user has installed: Claude Code (logged in, Pro tier),
   > Codex CLI (logged in, Pro tier), GitHub Copilot CLI (default
   > Claude Sonnet 4.5), Aider (no API key configured), Continue
   > CLI (config: ~/.continue/config.yaml with anthropic + openai
   > providers). The user has these env vars set: OPENROUTER_API_KEY,
   > OPENAI_API_KEY, ANTHROPIC_API_KEY. Ask the user 2-3 questions
   > to determine their cost preference and which subscription
   > capabilities they want exposed, then propose a roster."*

4. The LLM asks the user 2-3 questions in natural language.
5. The orchestrator converts the LLM's prose answer to the JSON
   roster and persists it.

**The user never touches JSON.** The LLM does. The orchestrator
enforces the schema.

---

## What this changes for the wiki

- [`02-our-infrastructure.md`](02-our-infrastructure.md) gets a new
  section: "Subprocess invocation surface" (the existing
  filesystem-only HTTP clients become "spawn a tool + read its
  stdout").
- [`03-four-options-considered.md`](03-four-options-considered.md)
  becomes `03-options-considered.md` with a 5th column for Option E.
- [`04-recommended-approach.md`](04-recommended-approach.md) gets a
  v2 with:
  - `kind: "mcp-server"` added to `ProviderKind`.
  - `IRoutingDecision.strategy: "api" | "cli" | "handoff" | "mcp-tool"`.
  - New `invoke` shape for `mcp-tool`: `{ server, tool, args }`
    instead of just a string.
  - Bootstrap from prose documented.
- New page: this one (`05-option-E-subprocess-mcp.md`).

---

## What this does NOT change

- The slice schema (`requiresCapability`, `preferredProvider`,
  `maxCostTier`) is unchanged.
- The secrets posture (env vars only, never persisted) is unchanged.
- The scoring function in `04-recommended-approach.md` is unchanged.
- The `redactSecrets` guard is unchanged.
- Session stickiness via `sessionId` is unchanged.

---

## Risks and unknowns

1. **Subprocess lifecycle.** Long-running `codex mcp-server` needs
   restart on crash. Today `mcp-vertex` has no process supervisor
   for spawned children — we'd need to add one. Bun supports
   `Bun.spawn` natively, so this is tractable, but it's new surface.

2. **Streaming events.** Codex and Claude Code stream JSON events
   mid-call. The orchestrator needs to handle them (forward to
   caller? aggregate? store for debugging?). Not specified today.

3. **Approval prompts.** Codex's MCP server can send
   `applyPatchApproval` / `execCommandApproval` requests back to
   the client. **The orchestrator becomes responsible for
   mediating these** — either auto-approving within a configured
   allow-list or surfacing them to the user. New UX surface.

4. **Concurrent invocations.** Can the orchestrator make 3 parallel
   `codex exec` calls? Codex supports multiple `codex mcp-server`
   processes but resource cost grows linearly. Need a pool +
   semaphore pattern.

5. **Tool policies.** Each subprocess has its own permission model
   (`--permission-mode`, `--sandbox`, `--allow-tool`). The
   orchestrator should pass these through **transparently** —
   whatever the user has configured at the CLI level is what the
   orchestrator uses. Do not invent a new policy layer on top.

6. **Cost observability.** Codex's `turn.completed.usage` is the
   first real-time token stream we've had access to. The
   orchestrator should persist this — a single SQLite or JSONL file
   per session. This **finally** unlocks the
   `onTokenUsage` hook that's been missing from `IHostObservability`.

---

## Next step

Two open questions for the user before promoting Option E to a
ratified proposal:

1. **Plugin home.** Option E needs a new plugin (`plugins/runner`?)
   that owns subprocess lifecycle, MCP-client connections, and the
   bootstrap wizard. Or do we extend `plugins/proposals` to host
   it? (Proposal workflow would then own the routing decision.)

2. **Bootstrap authority.** When the LLM proposes a roster from
   prose, does the user have to **confirm** before it lands in
   `mcp-vertex.config.json`, or do we trust the LLM and let the
   user review later? (The safer answer is "confirm always"; the
   smoother answer is "trust, show diff, one-click revert".)

Once these are decided, [`04-recommended-approach.md`](04-recommended-approach.md)
v2 is small enough (~150 line delta) to ratify as a proposal.
