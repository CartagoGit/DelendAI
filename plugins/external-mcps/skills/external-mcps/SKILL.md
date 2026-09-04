---
name: delendai-external-mcps
appliesTo: ['@delendai/external-mcps']
description: The token-lean, human-acked workflow for composing third-party MCP servers under the host — catalog (discover on demand) → suggest (propose a pinned config patch) → validate_config (dry-run) → ack (human gate) → call (lazy ext.<server>.<tool> proxy). Use when a workspace needs a capability the native delendai tools do not cover.
---

# delendai external-mcps

Use this when the native delendai tool surface (`fs_*`, `search`, `git_*`, …)
does not cover a capability the workspace needs — a database adapter, a browser
driver, an Angular/CLI helper — and a published third-party MCP server does.

The plugin is **opt-in** (a host loads it explicitly) and **token-lean by
design**: nothing about the catalog rides in the system prompt. Every server is
declared with a **pinned version** and activated only behind a **human ack**.
The `ext.<server>.<tool>` namespace keeps external tools from ever colliding
with native ones.

## The five-step workflow

Always in this order. Each step is cheap, offline, and reversible until `call`.

### 1. `catalog` — discover on demand

Search the curated + discoverable seed catalog. Compact by default: up to 10
`{id, category, summary}` rows plus a real `total`. Narrow with `query`
(substring over id/category/summary) when `total` exceeds 10; pass
`detail: "<id>"` for one full entry (tier, pinned install command/args, env var
NAMES). Read-only and offline — nothing here boots a server or hits the network.

Entries a workspace probe matched (e.g. an Angular workspace via
`package.json#dependencies['@angular/core']`) carry `detected: true`. That is a
**hint only** — detection never activates anything; activation stays governed by
the autonomy knobs and the human ack.

### 2. `suggest` — propose a pinned config patch

Describe the capability gap in free text (`need`). Get up to 3 candidates, each
with a one-line rationale, plus an **RFC 6902 JSON Patch** that ADDS them to
`delendai.config.json#plugins.external-mcps.options.servers` (pinned versions,
env var NAMES only; already-declared ids skipped). `suggest` **never writes** —
it hands you a patch to review.

### 3. `validate_config` — dry-run before applying

Run the proposed servers block through the Zod schema without writing or
booting. It rejects floating tags like `latest` (`missing-version-pin`),
non-kebab ids, and env entries that smuggle a cleartext value instead of a NAME.
Fix any issue by code, then apply the patch on **user confirm**.

### 4. `ack` — the human gate

With `requireHumanAckWhenLlmDecides: true` (the default), an LLM-decided
activation must be acknowledged by a human first. `ack { list: true }` shows
pending requests; `ack { server, accept }` records an accept/reject (durable,
redacted, one entry per server). A server stays **blocked** until it has an
accepted ack.

### 5. `call` — lazy `ext.<server>.<tool>` proxy

Invoke a tool on a declared server through `ext.<server>.<tool>`. The subprocess
**boots lazily** on the first call and is reused afterwards — the first call
pays the cold-boot cost; use `status` to see whether a server is already booted.
Calls are contained to the workspace and results are redacted before anything
durable is written. Without an accepted ack (when required), `call` returns a
structured hint pointing you back to step 4.

## Rules of thumb

- **Prefer native tools.** `ext.*` is additive breadth, never the default path.
  Reach for it only when no native tool covers the need.
- **Pin everything.** `npx -y pkg@latest` is a supply-chain hole; the schema
  rejects it. Copy the catalog's `pinExample`.
- **Secrets by NAME.** Declare env variable NAMES in config; values live in the
  host/shell secret store, never in `delendai.config.json`.
- **Never skip the ack.** Detection and suggestion are advisory. A server only
  runs after a human accepts it.
