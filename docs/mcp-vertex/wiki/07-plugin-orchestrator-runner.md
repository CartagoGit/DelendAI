# 07 — Plugin `orchestrator-runner`

The home of the routing brain. New plugin; sibling to
`plugins/proposals`, `plugins/memory`, etc.

---

## Why this name

The user (2026-06-25): *"orchestrator-runner o algo asi mejor, no?"*

**`orchestrator-runner`** is the chosen name because:

- **`runner`** alone is too generic (test runners, code runners…).
- **`router`** is taken by the *concept* — every plugin that touches
  model selection has a router. We don't want the name to overlap.
- **`orchestrator-runner`** says exactly what it does: runs the
  orchestrator's hands. The orchestrator (the LLM in the IDE) plans;
  the runner executes the plan across providers.

The plugin slug becomes `mcp-vertex-orchestrator-runner` for npm and
`@mcp-vertex/orchestrator-runner` for the workspace. Namespace
prefix at runtime: `orchestrator_runner_` (e.g.
`orchestrator_runner_advise_routing`).

---

## What it owns

| Responsibility | Source page |
|---|---|
| Healthcheck of installed CLIs | [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) §2 |
| Bootstrap wizard (`bootstrap_providers`) | [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) §3 |
| Quota tracking (3 sources, merged) | [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) §4 |
| Fallback chains with TTL | [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) §5 |
| Routing advice (`advise_routing`) | [`04-recommended-approach.md`](04-recommended-approach.md) §4.1 |
| Handoff formatting (`format_handoff`) | [`04-recommended-approach.md`](04-recommended-approach.md) §4.2 |
| Subprocess invocation + MCP-client connection | [`05-option-E-subprocess-mcp.md`](05-option-E-subprocess-mcp.md) |
| LLM-as-cost-analyst (`advise_spend`) | [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) §6 |

It does **not** own:

- Token-usage persistence (`usage-tracking` plugin, see
  [`08-usage-tracking-plugin.md`](08-usage-tracking-plugin.md)).
- Slice-level capability routing (lives in `proposals` plugin; the
  runner reads `requiresCapability` but doesn't own the field).
- The model catalog itself (provided by the user's roster + the
  field's external feeds, not by us).

---

## Public tool surface (MVP)

| Tool | Purpose |
|---|---|
| `orchestrator_runner_healthcheck_providers` | Run healthcheck; return per-provider status |
| `orchestrator_runner_bootstrap_providers` | Run the bootstrap wizard (multi-step) |
| `orchestrator_runner_discover_providers` | PATH probe + raw detection, no questions |
| `orchestrator_runner_advise_routing` | Pick a provider for a task (Option D core) |
| `orchestrator_runner_format_handoff` | Format a handoff (CLI command, curl, prompt) |
| `orchestrator_runner_invoke` | **Option E core** — actually execute via subprocess / MCP |
| `orchestrator_runner_advise_spend` | Cost-analyst role; review past N days |
| `orchestrator_runner_list_models` | Enumerate available models (for agents to inspect) |
| `orchestrator_runner_set_provider_state` | Manual override (e.g. "force unavailable until X") |
| `orchestrator_runner_get_quota` | Read `~/.cache/mcp-vertex/quotas.json` |

All tools declare `outputSchema` per AGENTS.md rule 8.

---

## The central tool: `orchestrator_runner_invoke`

This is the Option E game-changer. The orchestrator (LLM) gives a
**task**, the runner **executes** it on the best provider, and
**returns** the structured result. The user never pastes anything.

```typescript
// Input
{
  task: string;                      // the prompt to send
  mode?: "plan" | "explore" | "implement" | "review";  // default: "implement"
  capabilityHints?: CapabilityTag[];  // default: []
  costPreference?: "minimize" | "balanced" | "maximize";  // default: "balanced"
  sessionId?: string;                // for stickiness
  stream?: boolean;                  // default: false (return final answer)
  toolsAllow?: string[];             // forwarded to subprocess --allowedTools
}
```

```typescript
// Output (success)
{
  decision: IRoutingDecision;        // which provider was chosen, why
  result: {
    text: string;
    structuredContent?: unknown;     // for tools that emit JSON
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    costUsd?: number;                // estimated, when computable
  };
  events?: Array<{ type: string; at: string; payload: unknown }>;  // if stream=false, summary events
  sessionId: string;
}
```

```typescript
// Output (fallback exhausted)
{
  decision: IRoutingDecision;        // what was tried
  error: {
    code: "all-providers-failed";
    tried: Array<{ provider: string; failure: string; at: string }>;
    nextAvailableAt: { provider: string; resetAt: string } | null;
  };
  userMessage: string;               // localized
}
```

### Subprocess lifecycle

The runner maintains a **pool** of subprocesses per provider kind:

- **`mcp-server` providers:** one long-lived subprocess per provider
  (e.g. one `codex mcp-server` process). Pool size 1 by default,
  configurable.
- **`cli` providers:** spawn per invocation, with a small
  warm-pool (size 2) to avoid fork-exec latency on the hot path.
- **`api` providers:** no subprocess; HTTP client with keep-alive.

The pool has:

- A semaphore for concurrency (default 4, configurable).
- A health check loop (every 5 min) that pings each subprocess.
- Auto-restart on crash, with exponential backoff.

### Cancellation

`orchestrator_runner_invoke` supports cancellation via a second
tool call: `orchestrator_runner_cancel_invocation { invocationId }`.

The runner sends the corresponding cancel signal to the subprocess
(`codex turn/interrupt`, `claude --cancel` if it exists) and waits
up to 5s for clean shutdown before SIGKILL.

---

## The plan tool: `orchestrator_runner_advise_routing` (revisited)

The deterministic scoring function from [`04`](04-recommended-approach.md) §4.1
stays. The only change: the function now also reads
`~/.cache/mcp-vertex/healthcheck.json` and penalizes unavailable
providers by -10 (effectively excluding them unless no other option
exists).

```typescript
function scoreProvider(
  p: IProviderCapabilities,
  hint: { mode: string; capabilities: CapabilityTag[]; costPref: string },
  health: IProviderAvailability
): number {
  if (health.state !== "available") return -10;

  let score = 0;
  for (const cap of hint.capabilities) {
    if (p.strengths.includes(cap)) score += 2;
    if (p.weaknesses.includes(cap)) score -= 3;
  }
  const modeTier = { plan: 4, review: 4, implement: 2, explore: 1 };
  const targetTier = modeTier[hint.mode];
  if (p.costTier >= targetTier) score += 1;
  if (p.costTier > targetTier + 1) score -= 1;
  if (hint.costPref === "minimize" && p.costTier <= 2) score += 2;
  if (hint.costPref === "maximize" && p.costTier >= 4) score += 2;
  return score;
}
```

The function is **pure** (over its inputs), trivially testable, and
the scoring trace is returned to the caller for transparency.

---

## Config schema (additive, root-level)

```jsonc
// mcp-vertex.config.json
{
  "$schema": "...",
  "cacheDir": ".cache/mcp-vertex",     // existing
  "providers": [                        // NEW, root-level
    // user-confirmed roster
  ],
  "plugins": {                          // existing
    "orchestrator-runner": {
      "options": {
        "maxFallbackDepth": 3,
        "healthcheckTtlSeconds": 300,
        "quotaCacheTtlSeconds": 300,
        "subprocessPoolSize": 2,
        "concurrencyLimit": 4,
        "defaultCostPreference": "balanced",
        "executeApi": false,            // safety: default OFF
        "confirmBeforeExecute": true    // safety: require user OK before each API spend
      }
    }
  }
}
```

**Important:** the `providers` block is at the **root**, not under
`plugins.orchestrator-runner`. Other plugins (e.g. `proposals`,
`audit`) can read it without coupling to
`orchestrator-runner`. The runner is just the most active consumer.

**Safety defaults:**

- `executeApi: false` — by default, the runner returns `curl`
  templates; it does NOT actually spend the user's money. The user
  must opt in per session.
- `confirmBeforeExecute: true` — even with `executeApi: true`, each
  invocation requires a confirmation (auto-bypass only for explicit
  `costPreference: "maximize"` + a confirmation token).

These defaults can be tightened but never silently relaxed.

---

## Plugin dependencies

`orchestrator-runner` depends on:

- **`usage-tracking`** (new plugin, see [`08`](08-usage-tracking-plugin.md)) —
  for `invocations.jsonl` and quota observation.
- **`redactSecrets`** (existing, in `packages/core`) — to scrub any
  leak from `healthcheck.json` etc.
- **`proposals`** — reads `IProposalSliceContract.requiresCapability`
  if slices drive routing decisions.
- **`notification`** — to surface fallback events to the user in
  real time.

It does **not** depend on the host IDE; it works the same in any
MCP-capable client.

---

## Files to add (MVP estimate)

| File | Lines | Notes |
|---|---|---|
| `plugins/orchestrator-runner/package.json` | 30 | workspace dep on `@mcp-vertex/core` |
| `plugins/orchestrator-runner/tsconfig.json` | 20 | extends root |
| `plugins/orchestrator-runner/vitest.config.ts` | 15 | |
| `plugins/orchestrator-runner/README.md` | 200 | the plugin doc |
| `plugins/orchestrator-runner/src/index.ts` | 100 | `register()` |
| `plugins/orchestrator-runner/src/lib/healthcheck.ts` | 200 | PATH probe + auth/status RPC |
| `plugins/orchestrator-runner/src/lib/bootstrap.ts` | 300 | wizard state machine |
| `plugins/orchestrator-runner/src/lib/quota.ts` | 250 | 3-source merge, TTL cache |
| `plugins/orchestrator-runner/src/lib/router/score.ts` | 100 | scoring fn (pure) |
| `plugins/orchestrator-runner/src/lib/router/session.ts` | 100 | session stickiness |
| `plugins/orchestrator-runner/src/lib/subprocess/pool.ts` | 200 | subprocess lifecycle |
| `plugins/orchestrator-runner/src/lib/subprocess/mcp-client.ts` | 250 | MCP client over stdio |
| `plugins/orchestrator-runner/src/lib/subprocess/cli.ts` | 200 | CLI spawn wrapper |
| `plugins/orchestrator-runner/src/lib/tools/*.tool.ts` | 800 | 10 tools, ~80 each |
| `plugins/orchestrator-runner/src/public/index.ts` | 30 | barrel |
| `plugins/orchestrator-runner/tests/src/lib/**/*.spec.ts` | 1200 | full coverage |
| `plugins/orchestrator-runner/tests/src/e2e/*.e2e.spec.ts` | 400 | real subprocess smoke |
| **Total** | **~4400** | |

That's substantial — but it's **2 plugins worth of work**
(`orchestrator-runner` + `usage-tracking`). Reasonable for a
multi-week slice proposal, not a single PR.

---

## The MVP definition

Ship in this order:

1. **Healthcheck** (no subprocess spawning, just probe + auth RPC).
2. **Bootstrap wizard** (writes roster.draft.json, asks user, awaits
   confirm).
3. **Score function** (pure, testable, no I/O).
4. **`advise_routing`** (uses score + healthcheck + confirmed roster).
5. **`format_handoff`** (formats; does not invoke).
6. **Quota tracking** (3 sources merged into `quotas.json`).
7. **`get_quota`** tool.
8. **`invoke`** tool — **subprocess spawn only** (no MCP-client yet).
9. **MCP-client** for Codex (the only one that supports it well).
10. **Fallback chains** with TTL.
11. **`advise_spend`** (the LLM-as-cost-analyst role).

Steps 1-5 are the "Option D in spirit, easy to test" core. Steps
6-11 are the "Option E in full" upgrade. **1-5 is the smallest
useful thing.** 1-7 is what we should ratify as the first proposal.
