# 04 — Recommended approach (Option D)

This page is the **concrete design** for Option D. The previous pages
in the wiki explained why; this one explains how. If we decide to
build it, this is the spec.

> **Status:** design draft. To ratify, write a proposal under
> `docs/mcp-vertex/proposals/ready/` referencing this page.

---

## 1. Config schema (additive)

```jsonc
// mcp-vertex.config.json — top-level extension
{
  "$schema": "...",
  "plugins": { /* ... existing ... */ },

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
      "id": "claude-code-opus",
      "kind": "subscription",
      "invoke": "claude --model opus-4-8",
      "contextWindow": 500000,
      "costTier": 4,
      "strengths": ["architecture", "security-audit", "reasoning", "long-context"],
      "weaknesses": ["cost"]
    },
    {
      "id": "openrouter-sonnet",
      "kind": "api",
      "invoke": "https://openrouter.ai/api/v1/chat/completions",
      "envVar": "OPENROUTER_API_KEY",
      "modelId": "anthropic/claude-sonnet-4-6",
      "contextWindow": 500000,
      "costTier": 2,
      "strengths": ["balanced", "code-edit"],
      "weaknesses": []
    }
  ]
}
```

**Validation rules (in `mcp-vertex.config.schema.json`):**
- `id`: required, kebab-case, unique.
- `kind`: enum `api | subscription | cli | web`.
- `invoke`: required, non-empty string.
- `envVar`: required when `kind = "api"`, must match
  `^[A-Z][A-Z0-9_]*$`, must not be present in any other config
  field (lint check).
- `costTier`: integer 1-5.
- `strengths`, `weaknesses`: arrays of the `CapabilityTag` enum.

**Secrets posture:**
- `envVar` declares the variable name; the value is never stored in
  this file.
- A linter (`tools/scripts/lint/no-cleartext-secrets.script.ts`)
  greps the schema and rejects any field whose name includes
  `key|secret|token|password` and whose value doesn't match the env
  var pattern.
- `redactSecrets` continues to be the belt-and-braces guard on any
  accidental leak.

---

## 2. Slice schema (additive)

```typescript
// plugins/proposals/src/lib/swarm/proposal-slice-plan.ts
export type CapabilityTag =
  | "code-edit"
  | "long-context"
  | "very-long-context"
  | "architecture"
  | "security-audit"
  | "reasoning"
  | "vision"
  | "fast-iteration"
  | "json-strict"
  | "multilingual"
  | "agentic"
  | "summarization";

export interface IProposalSliceContract {
  id: string;
  title: string;
  files: string[];
  gate: "lint" | "type" | "e2e" | "none";
  dependsOn: string[];
  acceptanceCriteria: string[];

  // NEW (optional, backward-compatible):
  requiresCapability?: CapabilityTag[];
  preferredProvider?: string;   // overrides roster match
  maxCostTier?: 1 | 2 | 3 | 4 | 5;
}
```

The slice parser in `proposal-slice-plan.ts:54-100` reads these from
the markdown front-matter. Defaults: empty `requiresCapability`,
no `preferredProvider`, `maxCostTier = 5`.

---

## 3. Provider capabilities interface (new)

Lives next to `IHostCapabilities` in
`plugins/proposals/src/lib/swarm/`:

```typescript
// plugins/proposals/src/lib/swarm/provider-capabilities.ts
import type { CapabilityTag } from "./proposal-slice-plan";

export type ProviderKind = "api" | "subscription" | "cli" | "web";

export interface IProviderCapabilities {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly modelId: string;
  readonly invoke: string;
  readonly envVar?: string;
  readonly contextWindow: number;
  readonly costTier: 1 | 2 | 3 | 4 | 5;
  readonly strengths: CapabilityTag[];
  readonly weaknesses: CapabilityTag[];
}

export const GENERIC_PROVIDER_CAPABILITIES: IProviderCapabilities[] = [];

export interface IRoutingDecision {
  strategy: "api" | "cli" | "handoff";
  targetProvider: IProviderCapabilities;
  mode: "plan" | "explore" | "implement" | "review";
  prompt: string;
  invoke: string;
  rationale: string;
  estimatedCostTier: 1 | 2 | 3 | 4 | 5;
}
```

`IProviderCapabilities` is to providers what `IHostCapabilities` is
to IDEs. Same DIP registration path via `ctx.options.providers`.

---

## 4. The two MCP tools

### 4.1 `<prefix>_advise_routing`

**Input:**

```typescript
{
  taskDescription: string;
  sliceCapabilityHints?: CapabilityTag[];
  mode?: "plan" | "explore" | "implement" | "review";
  costPreference?: "minimize" | "balanced" | "maximize";
  // session stickiness:
  sessionId?: string;
}
```

**Behaviour:**
1. Read roster from `ctx.options.providers` (or fall back to
   `GENERIC_PROVIDER_CAPABILITIES`).
2. **If roster is empty:** use Option C — ask the LLM of the caller
   to make a recommendation without a roster (LLM uses its own
   knowledge). Always works, lower quality.
3. **Otherwise:** pick a mode if not given, score each provider
   against `(mode, capability hints, costPreference)` using a
   deterministic scoring function, return the top 1 (with the top 2
   as alternates).
4. **Session stickiness:** if `sessionId` matches a recent decision
   and the requested provider is still in the roster, return it.

**Scoring function (deterministic, fully auditable):**

```typescript
function scoreProvider(
  p: IProviderCapabilities,
  hint: { mode: string; capabilities: CapabilityTag[]; costPref: string }
): number {
  let score = 0;
  // Strength match: +2 per matching strength, -3 per matching weakness
  for (const cap of hint.capabilities) {
    if (p.strengths.includes(cap)) score += 2;
    if (p.weaknesses.includes(cap)) score -= 3;
  }
  // Mode preference (mirror opusplan):
  const modeTier = { plan: 4, review: 4, implement: 2, explore: 1 };
  const targetTier = modeTier[hint.mode];
  if (p.costTier >= targetTier) score += 1;
  if (p.costTier > targetTier + 1) score -= 1;  // overpaying
  // Cost preference:
  if (hint.costPref === "minimize" && p.costTier <= 2) score += 2;
  if (hint.costPref === "maximize" && p.costTier >= 4) score += 2;
  return score;
}
```

The function is **small enough to inspect line by line**. The
rationale is logged alongside the decision so the user can see why.

**Output:**

```typescript
{
  decision: IRoutingDecision;
  alternates: IRoutingDecision[];          // top 2 backups
  scoringTrace: Array<{ provider: string; score: number; reasons: string[] }>;
  sessionId: string;
}
```

### 4.2 `<prefix>_format_handoff`

**Input:** an `IRoutingDecision` (typically the output of
`advise_routing`).

**Behaviour:**
- If `strategy = "api"` and the user has opted in to API execution
  (plugin option `executeApi: boolean`, default `false`), make the
  HTTP call. Otherwise return a curl template.
- If `strategy = "cli"` or `"handoff"`, return the command and the
  prompt.

**Output (handoff / cli):**

```typescript
{
  prompt: string;        // ready to paste
  command: string;       // ready to run
  instructions: string;  // human-readable
  estimatedCostTier: 1 | 2 | 3 | 4 | 5;
}
```

**Output (api):**

```typescript
{
  curl: string;          // ready to run
  sdkSnippet?: string;   // TS/JS snippet
  instructions: string;
  estimatedCostTier: 1 | 2 | 3 | 4 | 5;
}
```

---

## 5. Catalog exposure

Add `providers: IProviderSummary[]` to `ICatalogSnapshot`:

```typescript
interface IProviderSummary {
  id: string;
  kind: ProviderKind;
  modelId: string;
  costTier: 1 | 2 | 3 | 4 | 5;
  reachable: boolean;     // false if envVar is unset
  strengths: CapabilityTag[];
}
```

`<prefix>_overview` and `<prefix>_agent_catalog` both include this.
The `reachable` field is computed at request time, not stored.

---

## 6. Files to add / modify

Estimated footprint for the MVP (≈ 400 lines):

| File | Change | Lines |
|---|---|---|
| `packages/core/schema/mcp-vertex.config.schema.json` | +`providers` block + `CapabilityTag` enum | +60 |
| `packages/core/src/lib/plugins/config-file-schema.ts` | mirror the JSON schema in Zod | +40 |
| `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts` | +`requiresCapability`, `preferredProvider`, `maxCostTier` on `IProposalSliceContract`; export `CapabilityTag` | +30 |
| `plugins/proposals/src/lib/swarm/provider-capabilities.ts` | new file: `IProviderCapabilities`, `IRoutingDecision`, scoring function | +120 |
| `plugins/proposals/src/lib/swarm/score-provider.ts` | extract scoring for unit testing | +50 |
| `plugins/router/src/index.ts` (NEW plugin) or under `plugins/proposals` | two MCP tools + handlers | +150 |
| `tools/scripts/lint/no-cleartext-secrets.script.ts` | reject `key|secret|token|password = <value>` in JSON config | +30 |
| `plugins/router/tests/` | scoring spec + advise_routing spec + format_handoff spec | +250 |
| `docs/mcp-vertex/wiki/scenarios/copilot-with-minimax-byok.md` | worked example | +80 |

Total: ~810 lines. The audit plugin's recent `projectName` refactor
touched ~250 lines for a similar surface-area addition — this is in
the same ballpark.

---

## 7. The ratification checklist

Before this becomes a proposal:

- [ ] Decide plugin home: new `plugins/router/` or extend `plugins/proposals/`?
- [ ] Decide if `executeApi: boolean` ships in MVP or in v2.
- [ ] Decide the canonical `CapabilityTag` enum (the 12 listed above
      or a different set?).
- [ ] Decide session-id TTL (5 min like OpenRouter? Configurable?).
- [ ] Decide whether `redactSecrets` learns the new env-var pattern
      (`OPENAI_API_KEY = <value>`) so it catches leaks in memory and
      logs, not just disk.
- [ ] Decide if `proposal-swarm-runner` skill (already exists) should
      be updated to call `advise_routing` automatically per slice.

---

## 8. Future extensions (out of MVP scope)

These are **deliberately deferred** to keep the MVP small:

1. **Bandit learning over time.** Each routing decision's outcome
   (did the user accept? did the slice pass validation on first try?)
   feeds back into the scoring function. LiteLLM-style Postgres cell.
2. **Probes for capability verification** (Option B as an upgrade).
3. **Real-time token usage stream** (`onTokenUsage` hook).
4. **Multi-provider failover chains** (Portkey-style).
5. **Auto-discovery from LiteLLM JSON / OpenRouter API** to seed the
   roster with sensible defaults.
6. **UI** for editing the roster (today: edit JSON).
