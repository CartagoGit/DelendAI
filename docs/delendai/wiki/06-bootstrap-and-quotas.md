# 06 — Bootstrap wizard, cache/config split, healthcheck, quotas & fallback

This page collects the runtime concerns that fall out of Option E
([`05-option-E-subprocess-mcp.md`](05-option-E-subprocess-mcp.md))
once you actually try to use it. It was born from the user's third
pass at the problem on 2026-06-25:

> *"I can have the tools but not the CLI installed in the terminal,
> maybe it's necessary to install them in the terminal for them to
> work? We should have control or a warning to the user about that."*
>
> *"if any of them has hit its max quota, we don't want to spend
> money, we should have mechanisms so that if one has run out we can
> jump to the next most-capable efficient one among the ones we have
> available, right?"*
>
> *"the LLM should be able to analyze which models and which quota
> we've spent in each of the tools so it knows whether it can push
> hard or whether it should go to a cheaper one for tasks that don't
> look complex... the whole point of all this is to optimize spend
> and tokens and increase speed and efficiency so the work comes out
> right the first time, or at least in far fewer requests."*

It also includes the user's ratification on three earlier questions:

- **Config location:** extend `delendai.config.json` with a
  `providers` block at the **root**, not nested under each plugin.
  Plugins that need provider-aware options read from the root block;
  they don't add to it. The config file grows in **sections**, not in
  lines per plugin.
- **Quota sources:** combine all three (HTTP headers + account/auth
  RPCs + local token count). Always include number + **% of total** +
  **reset timestamp**.
- **Fallback depth:** chained fallback with TTL — when quota resets,
  the orchestrator retries the original model automatically (no
  polling).

---

## 1. Cache vs config — the split

> **Updated 2026-06-25 (audit fix, CRITICAL C1 + I10):** the cache
> lives inside the workspace at `${corePaths.cacheDir}/${pluginName}/`
> (per [`AGENTS.md` §"Repo root layout"](../../../AGENTS.md) — "the
> cache is ALWAYS the root cache — never per-folder"). No file in this
> proposal escapes the workspace. The per-plugin subfolder convention
> matches [`packages/core/src/lib/cli/assemble.ts:231`](../../../packages/core/src/lib/cli/assemble.ts#L231)
> (`pluginCacheDir: joinRel(corePaths.cacheDir, pluginName)`).

Two storage locations, two purposes:

| Location | Purpose | Versionado | Example |
|---|---|---|---|
| `${corePaths.cacheDir}/<plugin>/` | Runtime state, regenerated, never edited by hand | **no** (gitignored) | `orchestrator-runner/roster.draft.json`, `orchestrator-runner/quotas.json`, `usage-tracking/invocations.jsonl` |
| `delendai.config.json` | User-confirmed config, project-level | **yes** (in the repo) | `"providers": [...]`, `"plugins": {...}` |

**The split maps to the user's "trust" gradient:**

- **Drafts and observations** (roster auto-discovered, quota
  measurements, invocation log) live in cache. The user trusts the
  orchestrator to maintain them, never edits them.
- **Confirmed intent** (which providers are actually enabled, the
  cost preference, the role assignments) lives in the config. The
  user explicitly approves changes.

### Files in the cache (per plugin)

| File | Owner (plugin) | Format | Purpose |
|---|---|---|---|
| `orchestrator-runner/roster.draft.json` | orchestrator-runner | JSON | Auto-discovered providers from PATH probe + auth RPCs. Always overwritten. |
| `orchestrator-runner/quotas.json` | orchestrator-runner | JSON | Live quota state per provider (used, remaining, %, reset). TTL 5 min. |
| `orchestrator-runner/healthcheck.json` | orchestrator-runner | JSON | Last healthcheck per provider (cli path, auth state, model availability). TTL 5 min. |
| `orchestrator-runner/sessions.json` | orchestrator-runner | JSON | `Map<sessionId, IRoutingDecision>` for stickiness. Pruned by TTL. |
| `usage-tracking/invocations.jsonl` | usage-tracking | NDJSON | Append-only log: one line per tool call with timestamps, tokens, costs. |
| `usage-tracking/usage-summary.json` | usage-tracking | JSON | Periodic rollups by agent/plugin/model/extension. Refreshed every 5 min. |
| `usage-tracking/pricing.json` | usage-tracking | JSON | Pricing table refreshed from LiteLLM. TTL 24h. |

### The merge order at startup

1. Read `delendai.config.json#providers` → `confirmedRoster`.
2. Read `${cacheDir}/orchestrator-runner/roster.draft.json` → `discoveredRoster`.
3. Merge: confirmed wins for any overlapping field; discovered fills
   in gaps (e.g. a new provider you installed since last config
   edit appears as `pending` — visible in `<prefix>_overview`).
4. Apply healthcheck (`${cacheDir}/orchestrator-runner/healthcheck.json`)
   to mark each provider as `reachable: true | false`.

The merged roster is what `<prefix>_advise_routing` sees.

---

## 2. Healthcheck — the user's "CLI not installed?" concern

Three failure modes, three signals, one tool.

### Tool: `<prefix>_healthcheck_providers`

Returns a per-provider report:

```typescript
{
  providers: Array<{
    id: string;
    cli: { installed: boolean; path?: string; version?: string };
    auth: { authenticated: boolean; tier?: string; account?: string };
    model: { requested: string; available: boolean; suggested?: string };
    overall: "ready" | "not-installed" | "not-authenticated" | "model-unavailable" | "ok";
    installHint?: { command: string; url: string };
  }>;
  checkedAt: string;  // ISO timestamp
  ttlSeconds: 300;
}
```

### What the orchestrator does with it

- **At bootstrap:** run the full healthcheck, present a prose summary
  to the LLM, let it draft the roster (see §3).
- **On every routing decision:** if the cached healthcheck is older
  than `ttlSeconds`, **refresh only the providers being considered**
  (cheap — `command -v` + `auth status` is fast).
- **On invocation failure:** mark the provider as `quota-exceeded` or
  `unavailable` for the next `ttlSeconds` so we don't keep
  hammering a dead endpoint.

### `installHint` — the user's "should I install it?" moment

When a provider is `not-installed`, the orchestrator **proactively
shows the install command**. Examples:

| Provider | Install hint |
|---|---|
| `claude-code` | `curl -fsSL https://claude.ai/install.sh \| sh` → <https://docs.claude.com/en/docs/claude-code/installation> |
| `codex` | `npm i -g @openai/codex` → <https://developers.openai.com/codex/install> |
| `copilot` | `npm i -g @github/copilot` → <https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli> |
| `aider` | `uv tool install aider-chat` → <https://aider.chat/docs/install/install.html> |
| `cn` | `npm i -g @continuedev/cli` → <https://docs.continue.dev/guides/cli> |
| `agent` | `curl -fsSL https://cursor.com/install \| sh` → <https://cursor.com/install> |

The hint is **i18n-aware** (12 languages, like the rest of the
extension).

> **CRITICAL I4 fix (2026-06-25):** two of these commands are
> `curl | sh` pipes (Claude Code, Cursor Agent). This is a known
> supply-chain risk and the user explicitly asked for
> *"control o aviso al usuario sobre ello"*. The proposal adds:
>
> - Every install hint carries an `installHint.caveat` field with a
>   localized warning (e.g. *"Review the script before piping into
>   your shell. Prefer signed installers when available."*).
> - The hint is structured (`{ tool: string, args: string[],
>   pipeTo?: "sh" | "bash", dangerous: boolean }`), not a raw string,
>   so the renderer can flag `pipeTo: "sh"` with a warning icon.
> - Whenever the upstream supports a non-piped alternative
>   (`brew install`, signed MSI, AppImage), the hint prefers it.

---

## 3. Bootstrap wizard — `<prefix>_bootstrap_providers`

Replaces the "edit JSON" requirement of Option D. End-to-end flow:

```
┌────────────────────────────────────────────────────────────────┐
│  User says in chat: "configura los modelos que tengo"           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  orchestrator-runner runs PATH probe (5s, parallel)            │
│  → claude ✓  codex ✓  copilot ✗  aider ✓  cn ✗  agent ✗      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  For each installed tool: spawn cheap auth/status RPC         │
│  → claude: Pro tier, opus+sonnet+haiku available              │
│  → codex: Pro tier, gpt-5.5 + gpt-5.5-codex available         │
│  → aider: no API key (skip)                                    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  orchestrator-runner writes ${cacheDir}/orchestrator-runner/  │
│  roster.draft.json (raw discovered state)                      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  orchestrator-runner returns prose brief to the LLM:           │
│  "I've detected 3 models. What's your spend preference:        │
│   minimize / balanced / maximize quality?                       │
│   What kind of tasks will you use this for?"                    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  LLM asks user 2-3 questions in natural language              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  orchestrator-runner translates answers to JSON, writes diff   │
│  to ${cacheDir}/orchestrator-runner/roster.draft.json (still  │
│  draft) and shows the diff to the user:                        │
│                                                                │
│  @@ -0,0 +1,5 @@                                                │
│  +{ "id": "claude-code-opus", "kind": "subscription", ...}    │
│  +{ "id": "codex-gpt-5.5", "kind": "subscription", ...}       │
│  +{ "id": "openrouter-sonnet", "kind": "api", "envVar":       │
│     "OPENROUTER_API_KEY", ...}                                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  User reviews and clicks "Confirm" → orchestrator-runner      │
│  copies the relevant subset to delendai.config.json#providers │
└────────────────────────────────────────────────────────────────┘
```

**Key UX points:**

- The user **never types JSON**. They answer questions in prose.
- The LLM **never writes to the confirmed config directly**. It
  writes to a draft, the user reviews the diff, then confirms.
- The diff is shown in the user's preferred language (12 supported).
- Re-running the wizard is non-destructive — it only adds new
  providers that weren't there before, never silently overwrites.

### Why drafts are in cache and not in config

Two reasons:

1. **The config file is for confirmed intent.** A draft is a
   proposal, not intent. Keeping it in cache makes the boundary
   explicit at the filesystem level: `git status` shows config
   changes (reviewed), not cache changes (auto-regenerated).
2. **Multiple drafts can coexist.** If the user is experimenting
   with two rosters, both can sit in
   `${cacheDir}/orchestrator-runner/drafts/` without polluting the
   source-controlled config.

---

## 4. Quota tracking — three sources combined

Per the user's choice: all three sources are used, in priority order
from cheapest+fastest to most-expensive+most-accurate.

### Source 1: HTTP response headers (free, per-request)

Parsed on every successful API call. Standard headers per provider:

| Provider | Headers |
|---|---|
| OpenRouter | `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset` (seconds) |
| Anthropic API | `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`, `anthropic-ratelimit-requests-reset`, `anthropic-ratelimit-tokens-reset` |
| OpenAI API | `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens` |
| Google AI Studio | `x-ratelimit-remaining-requests`, `x-ratelimit-reset` (varies) |

### Source 2: account/auth RPCs (1 call, 5-min cache)

| Tool | RPC | Output |
|---|---|---|
| Codex CLI | `codex mcp-server` → `account/read` | `{quota: {used, total, resetAt}, tier}` |
| Claude Code | `claude auth status --json` (or `--text`) | `{tier, usage_pct, reset_at}` |
| Copilot CLI | `copilot help providers` + parse (no dedicated quota RPC yet) | `{quota_remaining, reset_at}` (when available) |
| Aider | `aider --list-models` + local key-balance probe | `{key_alias, balance_low: boolean}` |

### Source 3: local token count (imprecise, fallback)

Counted locally from `turn.completed.usage` events (Codex) and from
the orchestrator's own accounting for non-Codex invocations. Stored in
`invocations.jsonl`, aggregated in `quotas.json`.

**Imprecision acknowledged** (per user's note): "the count isn't
exact". When Source 2 gives a real number, Source 3 is shadowed. When
Source 2 is unavailable (e.g. Claude.ai web subscription), Source 3
is the only signal — and the user is told so.

### The data shape

`${cacheDir}/orchestrator-runner/quotas.json`:

```jsonc
{
  "checkedAt": "2026-06-25T14:32:11Z",
  "providers": {
    "claude-code-opus": {
      "source": "auth-rpc",
      "window": "monthly",
      "tier": "Max",
      "used": 432,
      "total": 1000,
      "usedPct": 43.2,
      "remaining": 568,
      "resetAt": "2026-07-01T00:00:00Z",
      "resetIn": "5d 9h 27m"
    },
    "codex-gpt-5.5": {
      "source": "auth-rpc",
      "window": "monthly",
      "tier": "Pro",
      "used": 187,
      "total": 500,
      "usedPct": 37.4,
      "remaining": 313,
      "resetAt": "2026-07-01T00:00:00Z",
      "resetIn": "5d 9h 27m"
    },
    "openrouter-sonnet": {
      "source": "http-header",
      "window": "hourly",
      "usedPct": 12.3,
      "remaining": 876,
      "resetAt": "2026-06-25T15:00:00Z",
      "resetIn": "27m"
    }
  }
}
```

`usedPct` + `resetAt` are the two fields the LLM reasons about when
advising the user. **`window` is mandatory** (CRITICAL I3 — the LLM
must not average a `usedPct` across hourly and monthly windows).

---

## 5. Fallback chains with TTL — "fallback del fallback" handled right

### The rule

```
On invocation failure (quota exceeded, model unavailable, timeout):

  1. Mark provider as unavailable until resetAt.
  2. Score the remaining providers with the same task hints.
  3. If the next-best provider is also unavailable, recurse.
  4. If no provider is available, return error to the user with
     a clear message: "All available providers are exhausted.
     The closest reset is X at Y."
  5. Cap recursion at maxFallbackDepth (default 3, configurable).
```

### What "unavailable" means concretely

```typescript
interface IProviderAvailability {
  state: "available" | "quota-exceeded" | "unauthenticated" | "not-installed" | "rate-limited" | "error";
  until?: string;        // ISO timestamp; only present for time-bound states
  reason?: string;       // human-readable explanation
  lastFailure?: { code: number | string; message: string; at: string };
}
```

This object lives in `healthcheck.json` alongside the basic health
status. The orchestrator checks both before invoking.

### Why "no polling" works

The user's question: *"how do we know when it has reset so we don't
fall into the fallback instead?"*

**We don't poll. We respect the TTL.**

When a provider fails with quota/rate-limit, we extract the
`resetAt` from headers or RPC. We store it. On the **next
invocation** of that provider, we check `Date.now() < resetAt` — if
so, it's still blacklisted; if not, it's available again.

This means:

- No background timers, no wasted RPCs.
- The orchestrator "discovers" the reset lazily, exactly when it
  matters.
- If the user goes idle for 3 days, the next invocation still
  works correctly because the check is timestamp-based.

### Fallback del fallback (the chain)

The user asked: *"and the fallback of the fallback?"*

That's what `maxFallbackDepth` controls. With depth=3:

```
claude-code-opus  → 429 quota
  └→ codex-gpt-5.5 → 429 quota
       └→ openrouter-sonnet → 200 OK ✓
```

If all three fail:

```
claude-code-opus  → 429
  └→ codex-gpt-5.5 → 429
       └→ openrouter-sonnet → 429
            → ERROR to user: "All providers failed.
              Pending resets: claude-code in 5d, codex in 5d,
              openrouter in 27m. Retry in 27m?"
```

The user stays in control of the retry budget.

---

## 6. The LLM as cost analyst

The user's third concern: *"the LLM should be able to analyze which
models and which quota we've spent in each of the tools so it knows
whether it can push hard or whether it should go to a cheaper one for
tasks that don't look complex..."*

This is a **proactive role**, not just reactive. The LLM should
periodically (or on demand) review `quotas.json` + `invocations.jsonl`
and propose redistributions.

### Tool: `<prefix>_advise_spend`

```typescript
{
  windowDays?: number;  // default 7
}
```

**Returns:**

```typescript
{
  currentState: {
    byProvider: Array<{ id: string; costUsd: number; tokensIn: number; tokensOut: number; calls: number; usedPctOfQuota: number }>;
    byPlugin: Array<{ plugin: string; costUsd: number; calls: number }>;
    byAgent: Array<{ agent: string; costUsd: number; calls: number }>;
  };
  observations: string[];
  // E.g. "62% of the spend came from Opus; 80% of those calls
  // were tasks Sonnet would have done just as well."
  recommendations: Array<{
    change: string;       // "Lower defaultCostTier from 5 to 3"
    rationale: string;
    expectedSavingsUsd: number;
    riskLevel: "low" | "medium" | "high";
  }>;
}
```

The recommendations are **non-destructive** — the user must confirm.
On confirm, the orchestrator updates the relevant fields in the
roster draft and shows the diff.

This is the **LLM as cost analyst** role, sitting next to the LLM
as routing advisor.

---

## 7. What this changes in earlier pages

- [`05-option-E-subprocess-mcp.md`](05-option-E-subprocess-mcp.md) §
  "Bootstrap from prose" — the wizard writes to
  `${cacheDir}/orchestrator-runner/roster.draft.json`, not directly
  to the config. The user reviews and confirms. Updated.
- [`04-recommended-approach.md`](04-recommended-approach.md) §1
  (Config schema) — the `providers` block lives at the **root** of
  `delendai.config.json`, not under each plugin. Updated.
- [`02-our-infrastructure.md`](02-our-infrastructure.md) §3 (Secrets)
  — the env-var-only posture is unchanged; the addition is that
  `${cacheDir}/<plugin>/` is the **observation** surface, and
  `redactSecrets` is applied to anything that gets written there
  too (paranoia is cheap). **All four writes**
  (`bootstrap.ts`, `healthcheck.ts`, `quota.ts`, `record.ts`) pipe
  through `redactSecrets` before `writeFileAtomic`.
- New page: [`08-usage-tracking-plugin.md`](08-usage-tracking-plugin.md)
  covers the dedicated `usage-tracking` plugin the user asked for.
