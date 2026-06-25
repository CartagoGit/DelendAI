# 03 — Four options considered

The user asked how this could work. We considered four approaches. Each
one is honest about its tradeoffs; the wiki recommends Option D but
keeps the others documented so a future change of constraints can
re-evaluate.

The shared constraints:

- The orchestrator is a **router**, not an LLM runtime. We don't
  execute models; we tell the user (or the agent) which one to use.
- The catalog of models **changes weekly**. Any approach that
  hardcodes the catalog dies in months.
- **API keys are sensitive.** Anything that ends up in our repo,
  logs, proposals, or memory must not contain a cleartext key.

---

## Option A — Catalog declared in code + LLM analyzes

**The naive version.**

```typescript
// plugins/router/src/lib/catalog.ts
export const KNOWN_MODELS = {
  'claude-opus-4-8': { tier: 5, strengths: ['architecture', 'security'] },
  'gpt-5.5':         { tier: 4, strengths: ['code-edit'] },
  'gemini-3.1-pro':  { tier: 4, strengths: ['long-context'] },
  // ... must be updated weekly
};
```

When asked "which model for this task?", the plugin passes the catalog
plus the task description to the LLM of the caller; the LLM picks.

| Pros | Cons |
|---|---|
| Trivial to implement | Catalog is wrong within weeks |
| Zero new infrastructure | Requires a code change every release |
| LLM does the matching | We bake in a vocabulary that has to track the field |

**Verdict:** ❌ Fails the freshness constraint.

---

## Option B — Auto-detect via probes

**The "trust no one" version.**

The plugin, when configured with API keys, runs a battery of 10-20
probes against each model:

- "Summarize this 100k-token document"
- "Write a regex that matches email addresses"
- "Refactor this function to use map instead of forEach"
- "Find the security vulnerability in this snippet"
- "Output strict JSON matching schema X"
- …

It measures speed, cost, success rate, and stores the profile in a
local cache (e.g. `~/.cache/mcp-vertex/provider-profiles.json`).
Routing reads the cached profile.

| Pros | Cons |
|---|---|
| **No catalog to maintain** — profiles are observed | Probes cost money (real API spend) |
| Profiles reflect *actual* model behaviour | Probes take minutes per model |
| Self-healing as models update | Some capabilities (e.g. "writes good tests") are impossible to probe |
| | Privacy: probes send real prompts to third-party APIs |

**Verdict:** ⚠️ Powerful but heavy. Maybe right for a future
"Provider Auditor" skill, not for the MVP routing layer.

---

## Option C — Empty plugin, LLM fills it

**The minimalist version.**

The plugin has zero model knowledge. It exposes two tools:

- `route_task({ taskDescription, availableProviders })` — passes
  both to the LLM of the caller, gets back `{ strategy, target,
  rationale }`.
- `format_handoff({ decision, kind })` — turns the decision into a
  copy-pasteable prompt + command.

The user declares their roster (just names + how to invoke each one,
no capabilities) in `mcp-vertex.config.json`. The LLM does the
matching because **that's what LLMs are good at**.

```jsonc
// mcp-vertex.config.json
{
  "providers": [
    { "id": "copilot-m3",       "kind": "subscription", "invoke": "vscode-copilot" },
    { "id": "claude-code-opus",  "kind": "subscription", "invoke": "claude --model opus-4-8" },
    { "id": "openrouter-sonnet","kind": "api", "envVar": "OPENROUTER_API_KEY" }
  ]
}
```

| Pros | Cons |
|---|---|
| Zero catalog maintenance | Every routing decision costs an LLM round-trip |
| LLM is the routing brain (its job) | Quality depends on how well you describe your roster |
| User adds a model = adds a JSON line | LLM can hallucinate capabilities |
| Survives weekly model churn | No guarantees ("for this task class, this model") |

**Verdict:** ⚠️ Cheapest to build. Loses the "deterministic policy"
property. Worth keeping as a fallback.

---

## Option D — Declarative roster + LLM-as-advisor + mode-keyed routing

**The wiki's recommended approach.** Hybrid of B (catalog freshness
via declared roster) and C (LLM as the advisor), with a strong
opinion borrowed from Claude Code's `opusplan` ([external/claude-code.md](external/claude-code.md)):

1. **The roster is declared, not hardcoded.** User maintains
   `mcp-vertex.config.json#providers`. Each entry has:
   - `id`, `kind` (`api` / `subscription` / `cli` / `web`)
   - `invoke` (command or URL or `vscode-copilot`)
   - `contextWindow`, `costTier` (1-5)
   - `strengths`, `weaknesses` (small enum: `code-edit`, `long-context`,
     `architecture`, `security-audit`, `reasoning`, `vision`,
     `fast-iteration`, `json-strict`, `multilingual`)

2. **Slices declare what they need.**
   `IProposalSliceContract.requiresCapability: CapabilityTag[]`. Empty
   array = "use whatever's cheapest."

3. **The LLM is the advisor, not the router.** A single MCP tool,
   `<prefix>_advise_routing`, passes `(taskDescription, sliceCapabilityHints, roster)`
   to the caller's LLM and gets back a recommendation. The plugin
   formats it.

4. **Mode-keyed routing.** Inspired by `opusplan`: rather than
   matching on the entire task description, the advisor first picks
   a *mode* (`plan`, `explore`, `implement`, `review`) and looks up
   the model for that mode in the roster. N models → N modes
   decision space.

5. **Three execution modes** depending on provider kind:
   - `api` → return the curl/SDK call template for the user to run,
     or (if user opts in) make the call from the plugin.
   - `cli` → return the CLI command (e.g. `claude --model opus-4-8 "..."`).
   - `web` / `subscription` → return a copy-paste prompt + the IDE
     command to open it.

6. **Secrets posture:** API keys live in `process.env`. Config
   declares `envVar: "OPENROUTER_API_KEY"`, not the key itself.
   `redactSecrets` is the belt-and-braces guard.

| Pros | Cons |
|---|---|
| User adds a new model = 5-line JSON edit | LLM still does the heavy lifting on routing |
| Mode-keyed routing is auditable and predictable | Roster quality is bounded by user's knowledge of models |
| Subscription, CLI, API all supported uniformly | Three execution modes add UX surface |
| Survives weekly churn | Still no real-time token stream for price-routing |
| `IProviderCapabilities` follows existing `IHostCapabilities` DIP | |

**Verdict:** ✅ Recommended. Minimum viable scope is small (~400
lines), matches existing patterns, doesn't introduce new runtime
dependencies.

---

## Decision matrix

| Criterion | A | B | C | D |
|---|---|---|---|---|
| Survives weekly churn | ❌ | ✅ | ✅ | ✅ |
| Implementation cost (lines) | ~100 | ~2000 | ~250 | ~400 |
| Audit / determinism | ❌ | ⚠️ | ❌ | ✅ |
| Supports subscription providers | ✅ | ⚠️ | ✅ | ✅ |
| Supports API providers | ✅ | ✅ | ✅ | ✅ |
| Hard secrets in repo | ❌ | ⚠️ | ✅ | ✅ |
| Maintains real-time token stream | ❌ | ✅ | ❌ | ⚠️ |
| User-visible UX complexity | low | high | low | medium |

**Recommendation:** build D, with C as the fallback when no roster is
configured. If B-style probes become valuable later, they layer on
top of D's roster (probe-driven `strengths/weaknesses` override the
declared ones).
