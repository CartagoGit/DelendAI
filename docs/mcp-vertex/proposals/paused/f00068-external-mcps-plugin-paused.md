---
id: f00068
status: paused
type: proposal
track: core+plugins+host+config+i18n+docs+web+extensions/vscode
date: 2026-06-26
paused: 2026-06-26
kind: feat
title: external-mcps plugin — compose third-party MCP servers under the host with LLM-assisted config and lazy subprocess boot
related:
    - a00032 # master audit — overview/token-budget constraints below must coexist with the snapshot budget
    - f00050 # parking lot convention (slice deferred behind a precondition list)
    - f00067 # multi-model orchestrator — analogous "host composes an external thing under a namespace" precedent; both rely on `toolSchemaVersion` and human-ack
    - AGENTS.md # the invariants this proposal must not break (no process.cwd in engines, plugin owns its namespace, durable writes go through the primitives)
---

# f00068 — external-mcps plugin (paused)

> **Status: paused.** The proposal captures the design we agreed on
> during the 2026-06-26 session (filesystem + angular as the seed
> servers, lazy boot, LLM-assisted config, `ext.*` namespace prefix).
> The slice below is the **gate to unpause**, not work to do today.
> Until the gate is met, no code under `plugins/external-mcps/` is
> authored; no test fixtures are created; no host wiring is started.

## Goal

Add an opt-in **`external-mcps` plugin** to `@mcp-vertex/core` so a
workspace can **compose third-party MCP servers** alongside the
mcp-vertex-native plugins, with:

1. **A declarative section** in `mcp-vertex.config.json`
   (`plugins.external-mcps.servers.<name>`) listing the servers the
   host should be able to mount, each with a pinned version, a
   transport (`command` + `args`), a namespace prefix, and an
   optional auto-detect rule.
2. **Lazy subprocess boot by default** — the host **declares** the
   server, but does not spawn the process until the LLM invokes an
   `ext.<server>.*` tool for the first time. The first call pays the
   boot cost; subsequent calls reuse the cached child.
3. **An LLM-assisted config flow** — the plugin exposes
   `external_mcp_suggest` so the agent can propose a JSON patch when
   it sees a gap, and `external_mcp_validate_config` so the agent
   (and the host) can dry-run validation against a Zod schema without
   applying anything.
4. **Three autonomy knobs** in `plugins.external-mcps.options`:
   `llmDecidesActivation` (default `true`),
   `requireHumanAckWhenLlmDecides` (default `true`),
   `allowDiscoverySearch` (default `false`). The defaults match the
   security posture the user asked for on 2026-06-26: the LLM may
   activate within the declared set, but every activation is
   human-acked, and npm/internet discovery is off until opted in.
5. **Strict `ext.<server>.<tool>` namespace prefix** — external tools
   never collide with native mcp-vertex tools (`fs_read`, `search`,
   etc.); the prefix is the contract.

## Why

Today every LLM call in an mcp-vertex workflow sees only the
mcp-vertex-native tool surface. If a workspace needs filesystem
operations beyond what `fs_read`/`fs_write` provide, Angular
introspection, a language server, or a database adapter, the only
path is **re-implementing the capability inside an mcp-vertex
plugin** — months of work for what is, in most cases, a published
MCP server maintained by someone else.

The composition pattern is well-established in the MCP ecosystem
([mcp-proxy](https://github.com/sparfenyuk/mcp-proxy),
[metatool](https://github.com/dhravya/metatool), the
[Docker MCP Catalog](https://docs.docker.com/ai/mcp-catalog/), and
the
[MCPJam gateway](https://mcpjam.com/)). The Anthropic-maintained
`@modelcontextprotocol/server-filesystem` and the community
`angular-mcp` are concrete, low-risk seed servers that validate the
whole chain (boot → namespace → middleware → ack → teardown).

The user's 2026-06-26 ask — "could mcp-vertex use and dispatch other
general-purpose MCPs, and other for specific frameworks or
languages?" — is the first time the repo has been asked to take
this composition in. Pausing the proposal gives the user a chance
to review the design without burning slice budget or
half-implementing a feature.

## Why this design

### Why a plugin, not a core feature

`packages/core` must stay project-agnostic. Importing
`@modelcontextprotocol/client` into the core would force every host
to take a transitive dependency on the MCP client SDK, even hosts
that never want an external server. Putting the composition behind a
plugin:

- Keeps the core agnostic (invariant #1).
- Lets hosts opt out by simply not loading the plugin — no config
  flag needed.
- Mirrors the precedent `f00067` set with `usage-tracking` (the
  plugin owns the namespace; the core does not know).

### Why lazy boot, not eager

Eager boot means N subprocess spawns at host activation; on a
workspace with 5 declared servers that is 5×50–200ms of boot cost
the user pays on **every** VS Code reload, even for servers they
will never call in that session. Lazy boot defers that cost to the
first `ext.<server>.<tool>` invocation, then caches the child.
The first call is slower; subsequent calls match native tools.

A user who actually wants eager boot for a specific server
(`filesystem` is a candidate because it is called frequently) sets
`eager: true` on that server entry. The default is `lazy`.

### Why three autonomy knobs, not one

The three knobs are independent:

| Knob | When off | When on |
|---|---|---|
| `llmDecidesActivation` | LLM can only `suggest`; human activates | LLM can activate within declared set |
| `requireHumanAckWhenLlmDecides` | LLM activates silently | Every LLM activation needs human ack |
| `allowDiscoverySearch` | LLM cannot propose new servers, only patch existing ones | LLM can search npm for new candidates |

The recommended default is **true / true / false** — the LLM can
suggest and auto-activate, but only after a human ack, and only
within the servers the user already declared. `allowDiscoverySearch`
is the most dangerous (proposes arbitrary `npx` packages from
npm); it stays off until the user opts in.

### Why `ext.*` namespace, no deprecation

Conflicts between native tools and external tools are resolved by
**prefix**, not by deprecating the native surface. `fs_read` keeps
working; `ext.fs.read` is a separate tool with its own schema and
its own middleware. The skill `external-mcps` documents when to
prefer which.

### Why Zod schema for the config

The config block is editable by humans **and** by the LLM. A Zod
schema:

- Catches typos and missing pins at write time (the schema rejects
  `@latest`).
- Lets `external_mcp_validate_config` be a pure function (no host
  boot required to dry-run validation).
- Mirrors the precedent `packages/ui-extension/src/settings/settings-schema.ts`
  (f00062 S1).

### Why pin versions are mandatory

`npx -y @latest` runs whatever is published at the moment of the
call — that is a **supply-chain hole** for a tool the user trusts
with workspace access. The schema rejects unpinned entries. The
plugin's `external_mcp_validate_config` returns a specific error
code (`missing-version-pin`) so the LLM can fix it on the spot.

## Non-goals

While paused:

- **Do not create `plugins/external-mcps/`** (no plugin folder, no
  OptionsSchema, no tools).
- **Do not add `externalServers` to any host config** (no
  `extensions/vscode/` wiring, no `apps/web/` wiring).
- **Do not generate npm-pinning lint** for `npx` invocations elsewhere.
- **Do not modify `@mcp-vertex/core`** to expose composition helpers
  (`createExternalClient`, etc.) — those would only make sense once
  the plugin exists.
- **Do not move the proposal to `ready/`** until the unpause gate
  below is satisfied and recorded in the frontmatter.

After unpause, this proposal still explicitly **does not**:

- Re-implement the `@modelcontextprotocol/client` SDK (the plugin
  consumes it as a dependency).
- Add per-tool allowlists inside the core (the LLM skill is the
  allowlist surface).
- Touch `tools/scripts/lint/no-shell-python.script.ts` to exempt
  `npx` invocations — the gate is the Zod schema, not the linter.
- Replace the native `fs_read`/`fs_write` family — `ext.fs.*`
  is **additive**.

## Architecture

```
                ┌─────────────────────────────────────────────┐
                │       packages/core (unchanged)             │
                │  IMcpPluginContext · tool registry · host   │
                └─────────────────────────────────────────────┘
                                    ▲
                                    │ register() — pure, no I/O
                                    │
                ┌─────────────────────────────────────────────┐
                │   plugins/external-mcps/   (NEW, paused)    │
                │                                             │
                │   OptionsSchema (Zod)                       │
                │   ├─ llmDecidesActivation  (default true)   │
                │   ├─ requireHumanAck…      (default true)   │
                │   ├─ allowDiscoverySearch  (default false)  │
                │   ├─ bootStrategy          (lazy default)   │
                │   └─ servers: Record<Name, IServerEntry>    │
                │                                             │
                │   Tools (all with outputSchema)             │
                │   ├─ external_mcp_catalog                   │
                │   ├─ external_mcp_discover                  │
                │   ├─ external_mcp_suggest                   │
                │   ├─ external_mcp_validate_config           │
                │   ├─ external_mcp_status                    │
                │   └─ external_mcp_ack                       │
                │                                             │
                │   Engines (pure)                            │
                │   ├─ catalog.ts   — derives summary rows    │
                │   ├─ validate.ts  — Zod parse of patch      │
                │   ├─ suggest.ts   — diff renderer           │
                │   └─ process-registry.ts                    │
                │          (lazy subprocess lifecycle)        │
                └─────────────────────────────────────────────┘
                                    ▲
                                    │ host invokes
                ┌─────────────────────────────────────────────┐
                │   extensions/vscode/host-config.ts          │
                │   plugins/external-mcps: { options, servers│
                │     filesystem: { command, args, version,  │
                │       namespacePrefix: ext.fs, scope,       │
                │       detect: null, requiresHumanAck:true } │
                │     angular:    { ..., detect: 'package.…' }│
                │   }                                          │
                └─────────────────────────────────────────────┘
                                    ▲
                                    │ MCP stdio transport
                ┌─────────────────────────────────────────────┐
                │   @modelcontextprotocol/server-filesystem   │
                │   angular-mcp                                │
                └─────────────────────────────────────────────┘
```

The plugin **owns its namespace** (`ext.*`) and **owns its subprocess
registry** (per-process exit code, pid, last-boot error). The core
sees only the merged tool list.

### Token budget impact

The plugin ships a **summary catalog** in `external_mcp_catalog`,
not full schemas. Per-server cost is roughly:

| Field | Approx tokens |
|---|---|
| `name`, `description` (≤80 chars), `tags[]` | ~30–50 |
| Full `inputSchema` (only if the LLM asks via `external_mcp_discover`) | ~500–1500 |

For the seed configuration (filesystem + angular) the catalog
adds ~80–100 tokens to the system prompt — well within the
existing `overview` budget (a00032 S4).

## Slices

### S1 — Resume external-mcps plugin after the unpause gate is met

- **Status**: paused.
- **Files**:
  [`docs/mcp-vertex/proposals/paused/f00068-external-mcps-plugin-paused.md`](f00068-external-mcps-plugin-paused.md),
  [`plugins/external-mcps/`](../../../plugins/external-mcps/) (new),
  [`extensions/vscode/src/host-config.ts`](../../../extensions/vscode/src/host-config.ts).
- **Gate**: `bun run validate`.
- **Acceptance**: resume **only after** every precondition in the
  list below is confirmed by the user and recorded in this slice's
  `## Unpause gate` block:

  1. **Decision: scope of the seed.** The user confirms the seed
     servers (filesystem + angular) and the per-server
     `namespacePrefix` values (`ext.fs`, `ext.angular`).
  2. **Decision: discovery.** The user picks the default for
     `allowDiscoverySearch` (recommended `false`; off until
     explicitly enabled).
  3. **Decision: ack surface.** The user picks how
     `external_mcp_ack` surfaces in the VS Code host:
     notification + dashboard action, or host-modal dialog.
  4. **Token budget green.** A benchmark run of `overview` plus
     `external_mcp_catalog` plus the two seed servers stays under
     the existing budget envelope; the
     `packages/core/tests/src/lib/plugin-drift-budget.spec.ts`
     suite still passes.
  5. **Security review.** The user (or a designated reviewer) signs
     off on the
     [security risks table](#risks-and-mitigations) below and the
     proposed mitigations (workspace containment via
     `resolveWorkspaceContained`, `redactSecrets` middleware,
     mandatory version pinning).
  6. **No conflict with `f00067`.** The multi-model orchestrator's
     `usage-tracking` plugin records the external tool calls; we
     confirm the cost-tracking shape accepts `ext.*` tool prefixes
     without changes.

  When all six are recorded as resolved in this section, the slice
  is **promoted**: this file moves to `ready/` (or `in-progress/`
  if the user wants to start P1 immediately) and S1 of the
  unpaused version takes over.

### Unpaused slices (preview — do not run while paused)

These are the slices that **will** be claimed once S1 is promoted.
They are documented here so the gate reviewer can audit the full
shape of the work before approving.

- **P1 — Skeleton.** `plugins/external-mcps/` with OptionsSchema
  (Zod) + 6 tool stubs + 6 specs + `external_mcp_*` validators.
  Gate: `bun run typecheck && bun run lint && bun run test`.
- **P2 — Catalog + lazy boot.** `external_mcp_catalog` +
  `external_mcp_status` real implementations. Subprocess registry
  with lazy boot and `eager` override. Seed server: filesystem.
  Gate: `bun run validate` plus a manual e2e.
- **P3 — Suggest + validate.** `external_mcp_suggest` +
  `external_mcp_validate_config` with diff renderer against the
  Zod schema, mandatory-pin enforcement. Gate: `bun run validate`.
- **P4 — Angular + detection.** Second seed server (angular-mcp)
  with `detect: package.json#dependencies['@angular/core']` and
  the `external-mcps` skill documenting the LLM workflow. Gate:
  `bun run validate`.
- **P5 — Discovery (gated).** `allowDiscoverySearch: true` →
  `external_mcp_discover` consults the npm registry. Off by
  default; lint test asserts the off default. Gate: `bun run
  validate`.
- **P6 — Host integration.** `extensions/vscode/` wires the host
  config, the ack notification, and the dashboard action. Gate:
  `bun run validate` plus a manual VS Code reload.

## Acceptance

- ✅ The proposal file exists at
  `docs/mcp-vertex/proposals/paused/f00068-external-mcps-plugin-paused.md`
  with `status: paused` and `kind: feat`.
- ✅ Frontmatter is `lint:proposals`-clean (all six required
  string fields present, id matches `^[a-z]\d{5}$`, folder
  matches `paused/`).
- ✅ Slice S1 satisfies the slice scaffold (Status, Files, Gate)
  and the linter passes.
- ✅ `bun run lint:proposals` reports 0 fatal errors.
- ✅ The 6 unpaused slice previews (P1–P6) are documented for
  reviewer audit and are explicitly not claimable while paused.
- ✅ No code under `plugins/external-mcps/` exists yet (verified
  via `find plugins -type d -name external-mcps`).
- ✅ No reference to `externalServers` exists yet in
  `extensions/vscode/src/host-config.ts` or in any other host
  config (verified via `grep -r externalServers extensions/`).

## Risks and mitigations

| Risk | Severity | Mitigation in this proposal |
|---|---|---|
| `npx -y` runs `@latest` — supply chain hole | High | Mandatory version pin in `IServerEntry.version`; Zod schema rejects unpinned entries. |
| External server reads/writes outside workspace | High | `resolveWorkspaceContained` middleware in the subprocess registry; `scope: ${workspace}` enforced before each call. |
| External tool returns secrets into memory/proposals | Medium | `redactSecrets` runs on every external tool result before persisting anywhere durable. |
| Lazy first-call latency | Medium | Optional `eager: true` per server for hot paths; future P7 may add a `preload: ["filesystem"]` warmup. |
| Schema drift in external server (`toolSchemaVersion` mismatch) | Medium | Manifest carries `toolSchemaVersion`; `external_mcp_status` fails loud on drift; CLI command documented. |
| LLM suggests installing an unknown/malicious npm package (only when `allowDiscoverySearch: true`) | High | Discovery stays off by default; on, results still require human ack via `external_mcp_ack` before install. |
| Native-vs-external tool confusion for the LLM | Low | Skill `external-mcps` documents when to prefer which; `external_mcp_discover` returns the exact answer. |
| Boot explosion when many servers declared | Low | Lazy boot defers cost; cap `maxBootedServers` per session is a future P7. |
| Token budget regression from the catalog | Low | Catalog is summary-only (~80–100 tokens per seed); `external_mcp_discover` is the opt-in for full schema. |

## Notes

- **Seed server URLs:**
  - `@modelcontextprotocol/server-filesystem` (Anthropic, official)
  - `angular-mcp` (community; pick a maintained fork at P4)
- **Cross-references:**
  - `f00067` (multi-model orchestrator) sets the
    `toolSchemaVersion` precedent this proposal reuses.
  - `f00050` (parking-lot convention) sets the "park a slice behind
    a precondition list" precedent this proposal follows.
  - `a00032` S4 (overview compactness) is the budget envelope the
    catalog must fit under.
- **Wiki stub:** When unpaused, the proposal should grow a
  `docs/mcp-vertex/wiki/13-external-mcps.md` page that mirrors the
  reasoning in the §"Why this design" section above; the wiki
  pattern was established by `f00067` for `00–08`.
- **i18n:** All 6 tool descriptions and the skill
  `external-mcps` must add keys for every language in
  `apps/web/src/i18n/ui.ts` (12 languages, f00059 invariant).
- **No-`process.cwd` invariant:** The subprocess registry takes the
  workspace from `ctx.workspace`, never from `process.cwd()`. Tests
  inject a fake workspace path.
- **Concurrency:** Two agents in the same workspace both calling
  `external_mcp_status` must not race the subprocess registry; the
  registry uses `withFileMutex`-style in-memory locking around the
  spawn step.