---
id: f00068
status: done
paused-reason: Blocked on multi-model orchestrator and dependency prerequisites
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
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 6 commits referencing f00068 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 6-commit batch
shipped-in:
  - f812abfb # fix(external-mcps,dev): converge f00068 S4+S5 gates + dev-entry style/i18n fix
  - 1ecc431b # feat(external-mcps): detection annotation + live discover gate + ack surface (f0
  - 757cf404 # feat(core): native authorized-roots filesystem allowlist for fs_read/fs_write
  - 57daa975 # feat(core): cache eviction registry + boot sweep (f00068 slice A)
  - 9b53fc1d # fix(proposals): redactSecrets on user text in proposal_edit, proposal_add_slice,
  - 837feb39 # fix(proposals): derive loop-detector handoffDir from host cacheDir (x00054)

archived-on: 2026-08-31
---

# f00068 — external-mcps plugin

> **Status: UNPAUSED (2026-07-07).** The blocking prerequisite (the
> f00067 multi-model orchestrator) shipped, and the user delegated
> the eight gate decisions on 2026-07-07 ("crealo con todo lo que
> creas que tiene más sentido y es más útil y gaste pocos tokens si
> se usara — lo van a usar modelos como tú"). The resolved gate is
> recorded in `## Unpause gate — RESOLVED`; the claimable slices
> follow it. Design mandate: **token economy first** — the plugin is
> consumed by LLMs, so nothing rides in the system prompt and every
> payload is compact by default.

## Goal

Add an opt-in **`external-mcps` plugin** to `@delendai/core` so a
workspace can **compose third-party MCP servers** alongside the
delendai-native plugins, with:

1. **A declarative section** in `delendai.config.json`
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
   never collide with native delendai tools (`fs_read`, `search`,
   etc.); the prefix is the contract.

## Why

Today every LLM call in an delendai workflow sees only the
delendai-native tool surface. If a workspace needs filesystem
operations beyond what `fs_read`/`fs_write` provide, Angular
introspection, a language server, or a database adapter, the only
path is **re-implementing the capability inside an delendai
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

The user's 2026-06-26 ask — "could delendai use and dispatch other
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
- **Do not modify `@delendai/core`** to expose composition helpers
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
- **Own the "default filesystem" story.** The f00089 umbrella decided that
  "every user reads their own project + explicitly-authorized external paths by
  default" is delivered **natively** by extending `fs_read`/`fs_write` with an
  authorized-roots allowlist (f00089 U5), *not* by unpausing this plugin.
  `ext.fs` therefore remains **additive breadth** (composing the upstream
  `@modelcontextprotocol/server-filesystem`), never the default path. This
  proposal stays paused on its existing 8-item unpause gate; U5 does not change
  that gate.

## Architecture

### Component diagram

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

### Seed catalog policy — three tiers

The LLM cannot be the only gatekeeper (a curated, defensible
catalog protects against npm typosquatting and unmaintained
forks), but a hand-maintained JSON cannot keep up with every
framework a user might adopt. The compromise is **three tiers
with different exposure and different cost**:

| Tier | Symbol | Loaded into system prompt? | How the LLM learns it | Who curates |
|---|---|---|---|---|
| **Curated** | ⭐ | **Yes** — appears in `external_mcp_catalog` summary on every turn | Always visible (~30–50 tokens each) | The repo, via reviewed PR |
| **Discoverable** | 🟡 | **No** — only when LLM calls `external_mcp_discover` | LLM opts in per turn, results are not in the prompt until asked | The repo, via reviewed PR |
| **Live search** | ⛔ | **No** — only when `allowDiscoverySearch: true` AND human has acked | Runtime npm/GitHub fetch, gated by `external_mcp_ack` | The LLM, with mandatory human ack |

**Defaults (recommended):**

- `llmDecidesActivation: true` — LLM may activate within the declared set
- `requireHumanAckWhenLlmDecides: true` — every LLM activation awaits ack
- `allowDiscoverySearch: false` — live npm/GitHub is OFF until the user
  explicitly enables it (kill switch)

**Why this shape:**

- The **curated tier** is the trust foundation. ~25 servers we
  vetted personally — they appear in the prompt so the LLM
  always knows they exist. Cost: bounded (~1 KB).
- The **discoverable tier** is the breadth. ~200+ servers the LLM
  can ask about on demand without any network call. Cost: only
  what the LLM chooses to load.
- The **live tier** is the escape hatch. When a workspace uses a
  server nobody curated (e.g. `zig-mcp` for a niche language),
  the LLM can propose one — but the human must ack every
  candidate before it boots. Cost: a network roundtrip, plus the
  ack overhead.

The full candidate list lives in
[`docs/delendai/skills/external-mcps-seed-catalog.md`](../../../skills/external-mcps-seed-catalog.md)
(planned for unpause; the file ships empty + this proposal
prescribes the structure so it can grow).

### Curated tier (⭐ — always in the catalog summary)

> **Criteria for "curated"**: maintained in the last 12 months,
> semver-stable release available, hosted by a known org or named
> maintainer, ≥ 1k weekly visitors OR explicit official endorsement,
> no known supply-chain incidents. Updated annually via
> `audit-curated-seeds` (f00068 P7).
>
> **Source of truth**: every entry below was verified live on
> 2026-06-26 against the canonical repo / npm package. See
> [`docs/external-mcps/`](../../../../external-mcps/README.md) for
> the underlying rubric and the full failure list (Angular, the
> archived Anthropic servers, etc.).

These 14 servers cover ~80% of everyday needs and appear in
`external_mcp_catalog` on every turn:

| Category | Server (verified 2026-06-26) | `namespacePrefix` | Source / weekly visitors |
|---|---|---|---|
| Filesystem & shell | `@modelcontextprotocol/server-filesystem` | `ext.fs` | Anthropic official / 239k |
| Filesystem & shell | `mcp-server-git` (Python via uvx) | `ext.git` | Anthropic official / 194k |
| Languages & LSPs | `mcp-language-server` (isaacphi) | `ext.lsp` | Community (covers 30+ languages via LSP) |
| Documentation | `@modelcontextprotocol/server-fetch` | `ext.fetch` | Anthropic official / 213k |
| Documentation | `@upstash/context7-mcp` | `ext.c7` | Community / 951k weekly on pulse.mcp.com (solves hallucinated APIs) |
| Databases | `@modelcontextprotocol/server-postgres` | `ext.pg` | Anthropic official / 77k |
| Databases | `@modelcontextprotocol/server-sqlite` | `ext.sqlite` | Anthropic official |
| Databases | `mongodb-js/mcp-server` | `ext.mongo` | MongoDB Inc. official / 86k |
| Databases | `redis/mcp-redis` | `ext.redis` | Redis official (replaces the archived Anthropic one) |
| Cloud / DevOps | `@modelcontextprotocol/server-kubernetes` | `ext.k8s` | Anthropic community |
| Cloud / DevOps | `mcp-server-docker` (ckreiling) | `ext.docker` | Community / 100k+ |
| Communication | `github/github-mcp-server` | `ext.gh` | **GitHub official** (replaces the archived Anthropic one) / 121k |
| Communication | `makenotion/notion-mcp-server` | `ext.notion` | **Notion official** (replaces the archived Anthropic one) / 137k |
| Browser | `chrome-devtools-mcp` (Google ChromeDevTools) | `ext.cdptools` | Official / 2.5M weekly; **or** `@playwright/mcp` (Microsoft, 34.4k★, 5.5M weekly) — pick one |

**Important corrections vs. the previous version of this proposal**:

- **`angular-mcp` is NOT in the curated tier.** As of 2026-06-26 the
  three candidate Angular MCPs (`cyanheads/angular-mcp-server`,
  `darioz-ms/angular-mcp`, `Microcks/angular-mcp`) all return 404. The
  Angular docs are served by `context7`; Angular code navigation by
  `mcp-language-server` against the Angular Language Service; Angular
  runtime debugging by `chrome-devtools-mcp`. See
  [`external-mcps/frameworks.md`](../../../../external-mcps/frameworks.md#angular--no-recommended-mcp-currently-exists)
  for the full reasoning.
- **`@modelcontextprotocol/server-slack`, `-github`, `-gitlab`,
  `-brave-search`, `-puppeteer`, `-redis`, `-notion` are all
  archived by Anthropic.** Each has been moved to its current
  canonical home (Slack → `zencoderai`, GitHub → `github/`, GitLab
  → `zereight/`, Brave → `brave/`, Puppeteer → `chrome-devtools-mcp`,
  Redis → `redis/`, Notion → `makenotion/`). The table above
  reflects the current canonical packages. See
  [`external-mcps/official-anthropic.md`](../../../../external-mcps/official-anthropic.md)
  for the migration map.
- **`@playwright/mcp` and `chrome-devtools-mcp` overlap heavily.**
  Pick one as default per workspace; both are valid. The
  recommendation is `@playwright/mcp` for general code agents
  (cross-browser, smaller surface) and `chrome-devtools-mcp` for
  workspaces that need perf profiling, Lighthouse audits, or
  memory heap snapshots.
- **`mcp-linear` is dropped from curated** (no canonical repo
  verified; promote to 🟡 until Linear ships an official one).
- **`mcp-jira`, `mcp-pypi`, `mcp-npm` are dropped from curated**
  (low traffic / shallow functionality; move to 🟡).

### Discoverable tier (🟡 — load on demand)

> **Criteria for "discoverable"**: actively maintained OR has a
> well-known sponsor; LLM can ask the catalog for the full schema
> and metadata without network cost; never loaded into the
> system prompt.

These ~200+ servers are available via `external_mcp_discover`
without any npm call. The LLM sees them only when it asks
specifically ("are there any Angular MCP servers?"). Each entry
gets a one-line description and `ext.<namespacePrefix>`.


#### Languages & LSPs (extended)

> **Important**: most of these servers are **redundant** with
> `mcp-language-server` (⭐ curated). Wire `mcp-language-server`
> first; only add a language-specific MCP if you need a runtime
> capability the LSP wrapper doesn't provide (lint, format,
> type-check bundled with code navigation).

| Server | Language / runtime capability | `namespacePrefix` |
|---|---|---|
| `python-mcp` (pyright + ruff) | Python — type-check + lint in one MCP | `ext.py` |
| `pyright-mcp` | Python — type-check only | `ext.pyright` |
| `ruff-mcp` | Python — lint only | `ext.ruff` |
| `golang-mcp` | Go — LSP only (use `mcp-language-server`) | `ext.go` |
| `rust-mcp` | Rust — LSP only (use `mcp-language-server`) | `ext.rs` |
| `ruby-mcp` (rubocop + sorbet) | Ruby — lint + typecheck bundled | `ext.rb` |
| `sorbet-mcp` | Ruby — Sorbet typecheck only | `ext.sorbet` |
| `mcp-java` | Java — jdtls only (use `mcp-language-server`) | `ext.java` |
| `kotlin-mcp` | Kotlin — LSP only | `ext.kotlin` |
| `swift-mcp` | Swift — sourcekit-lsp only | `ext.swift` |
| `csharp-mcp` | C# — omnisharp/roslyn only | `ext.cs` |
| `fsharp-mcp` | F# — FCS only | `ext.fsharp` (renamed; avoid `ext.fs` collision with filesystem) |
| `elixir-mcp` | Elixir — elixir-ls only | `ext.ex` |
| `phoenix-mcp` | Elixir — Phoenix framework | `ext.phoenix` |
| `zig-mcp` | Zig — zls only | `ext.zig` |
| `php-mcp` | PHP — phpactor only | `ext.php` |
| `dart-mcp` | Dart — analysis server only | `ext.dart` |
| `flutter-mcp` | Flutter — Dart + widget tools | `ext.flutter` |
| `scala-mcp` | Scala — Metals only | `ext.scala` |
| `haskell-mcp` | Haskell — hls only | `ext.hs` |
| `clojure-mcp` | Clojure — clj-kondo + clojure-lsp | `ext.clj` |
| `ocaml-mcp` | OCaml — ocaml-lsp only | `ext.ml` |
| `erlang-mcp` | Erlang — erlang_ls only | `ext.erl` |
| `lua-mcp` | Lua — lua-language-server only | `ext.lua` |
| `r-mcp` | R — languageserver only | `ext.r` |
| `julia-mcp` | Julia — LanguageServer.jl only | `ext.jl` |
| `nim-mcp` | Nim — nimlsp only | `ext.nim` |
| `crystal-mcp` | Crystal — scry only | `ext.cr` |
| `gleam-mcp` | Gleam — gleam lsp only | `ext.gleam` |
| `elm-mcp` | Elm — elm-language-server only | `ext.elm` |
| `purescript-mcp` | PureScript — psc-ide only | `ext.purs` |
| `vhdl-mcp` | VHDL — hdlcc only | `ext.vhdl` |
| `verilog-mcp` | Verilog — verible only | `ext.verilog` |
| `terraform-mcp` (language) | HCL / Terraform language only | `ext.tf-lang` |
| `nix-mcp` | Nix — nixd only | `ext.nix` |
| `dockerfile-mcp` | Dockerfile — hadolint only | `ext.dockerfile` |

#### Frontend frameworks (extended)

> **Important**: framework-specific MCPs are **rarely worth wiring up**
> individually. The recommended stack covers all of them:
>
> - `context7` ⭐ for version-pinned docs (one server, all frameworks).
> - `mcp-language-server` ⭐ for symbol navigation (one wrapper, all frameworks).
> - `chrome-devtools-mcp` or `@playwright/mcp` ⭐ for runtime debugging.
>
> Only wire a framework-specific MCP if you need a **framework-specific
> runtime capability** (e.g. Storybook story generation, Figma-to-code).

| Server | Framework | `namespacePrefix` |
|---|---|---|
| `storybookjs/addon-mcp` | Storybook — auto-generate + test stories | `ext.storybook` |
| `shadcn-ui-mcp-server` | shadcn/ui — component metadata | `ext.shadcn` |
| `nuxt-mcp` | Nuxt — shallow; prefer `context7` | `ext.nuxt` |
| `astro-mcp` | Astro — shallow; prefer `context7` | `ext.astro` |
| `remix-mcp` | Remix — shallow; prefer `context7` | `ext.remix` |
| `solidjs-mcp` | Solid — shallow; prefer `context7` | `ext.solid` |
| `qwik-mcp` | Qwik — shallow; prefer `context7` | `ext.qwik` |
| `ember-mcp` | Ember — shallow; prefer `context7` | `ext.ember` |
| `preact-mcp` | Preact — shallow; prefer `context7` | `ext.preact` |
| `lit-mcp` | Lit — shallow; prefer `context7` | `ext.lit` |
| `alpine-mcp` | Alpine.js — shallow; prefer `context7` | `ext.alpine` |
| `stimulus-mcp` | Stimulus — shallow; prefer `context7` | `ext.stimulus` |
| `marko-mcp` | Marko — shallow; prefer `context7` | `ext.marko` |
| `meteor-mcp` | Meteor — shallow; prefer `context7` | `ext.meteor` |
| `react-native-mcp` | React Native — bundle tooling | `ext.rn` |
| `expo-mcp` | Expo — mobile tooling | `ext.expo` |
| `ionic-mcp` | Ionic — mobile tooling | `ext.ionic` |
| `tailwind-mcp` | Tailwind CSS — utility reference | `ext.tw` |
| `vite-mcp` | Vite — dev server introspection | `ext.vite` |
| `webpack-mcp` | webpack — dev server introspection | `ext.webpack` |
| `rollup-mcp` | Rollup — bundler introspection | `ext.rollup` |
| `parcel-mcp` | Parcel — bundler introspection | `ext.parcel` |
| `cypress-mcp` | Cypress — component test runner | `ext.cy` |
| `jest-mcp` | Jest — unit test runner | `ext.jest` |
| `vitest-mcp` | Vitest — unit test runner | `ext.vitest` |
| `playwright-component-mcp` | Playwright — component testing | `ext.pwcomp` |
| `react-analyzer-mcp` (azer) | React — static analyzer | `ext.react-analyzer` |

#### Backend frameworks (extended)

> **Recommendation**: backend-framework-specific MCPs are mostly
> **not worth wiring up**. Use `mcp-language-server` + `context7`
> + native bash. The exceptions below are listed for completeness.

| Server | Framework | `namespacePrefix` |
|---|---|---|
| `nestjs-mcp` | NestJS | `ext.nestjs` |
| `express-mcp` | Express | `ext.express` |
| `fastify-mcp` | Fastify | `ext.fastify` |
| `koa-mcp` | Koa | `ext.koa` |
| `hapi-mcp` | Hapi | `ext.hapi` |
| `django-mcp` | Django | `ext.django` |
| `flask-mcp` | Flask | `ext.flask` |
| `fastapi-mcp` | FastAPI — only if you want to expose endpoints as MCP | `ext.fastapi` |
| `starlette-mcp` | Starlette | `ext.starlette` |
| `tornado-mcp` | Tornado | `ext.tornado` |
| `sanic-mcp` | Sanic | `ext.sanic` |
| `spring-mcp` | Spring Boot | `ext.spring` |
| `quarkus-mcp` | Quarkus | `ext.quarkus` |
| `micronaut-mcp` | Micronaut | `ext.micronaut` |
| `rails-mcp` | Rails | `ext.rails` |
| `sinatra-mcp` | Sinatra | `ext.sinatra` |
| `hanami-mcp` | Hanami | `ext.hanami` |
| `actix-mcp` | Actix | `ext.actix` |
| `axum-mcp` | Axum | `ext.axum` |
| `rocket-mcp` | Rocket | `ext.rocket` |
| `gin-mcp` | Gin | `ext.gin` |
| `fiber-mcp` | Fiber | `ext.fiber` |
| `echo-mcp` | Echo | `ext.echo` |
| `chi-mcp` | Chi | `ext.chi` |
| `laravel-mcp` | Laravel | `ext.laravel` |
| `symfony-mcp` | Symfony | `ext.symfony` |
| `lumen-mcp` | Lumen | `ext.lumen` |
| `aspnet-mcp` | ASP.NET Core | `ext.aspnet` |
| `blazor-mcp` | Blazor | `ext.blazor` |
| `maud-mcp` | Maud (Rust templating) | `ext.maud` |

#### Databases & data stores (extended)

> **Recommendation**: pick the database you actually use, not the
> union of all of them. Each is its own subprocess. The first row
> below is the Anthropic reference; the rest are vendor-official or
> solid community.

| Server | Database | `namespacePrefix` |
|---|---|---|
| `crystaldba/postgres-mcp` | PostgreSQL — perf + tuning (in addition to `ext.pg`) | `ext.pg-perf` |
| `JaviMaligno/postgres_mcp` | PostgreSQL — security-first, 14 tools | `ext.pg-secure` |
| `schemabrain` (Arun-kc) | PostgreSQL — trust layer, PII/secret refusal | `ext.pg-trust` |
| `safedb-mcp` | PostgreSQL/MySQL — read-only + allowlists | `ext.db-ro` |
| `hannesrudolph/sqlite-explorer-fastmcp-mcp-server` | SQLite — read-only | `ext.sqlite-ro` |
| `jparkerweb/mcp-sqlite` | SQLite — comprehensive | `ext.sqlite-full` |
| `ofershap/mcp-server-sqlite` | SQLite — query + plan explain | `ext.sqlite-plan` |
| `furey/mongodb-lens` | MongoDB — full-featured | `ext.mongo-full` |
| `kiliczsh/mcp-mongo-server` | MongoDB — simple | `ext.mongo-simple` |
| `redis/mcp-redis-cloud` | Redis — cloud-specific | `ext.redis-cloud` |
| `cr7258/elasticsearch-mcp-server` | Elasticsearch | `ext.es` |
| `elastic/mcp-server-elasticsearch` | Elasticsearch — official | `ext.elastic` |
| `ergut/mcp-bigquery-server` | BigQuery | `ext.bq` |
| `LucasHild/mcp-server-bigquery` | BigQuery — schema inspection | `ext.bq-schema` |
| `Snowflake-Labs/mcp` | Snowflake — official | `ext.snowflake` |
| `isaacwasserman/mcp-snowflake-server` | Snowflake — community alt | `ext.snowflake-alt` |
| `mcp-mysql-server` (benborla) | MySQL | `ext.mysql` |
| `mcp-mysql-server-pro` (wenb1n-dev) | MySQL — SSE + extended | `ext.mysql-pro` |
| `smartdb_mcp` (wenb1n-dev) | Multi-DB | `ext.smartdb` |
| `centralmind/gateway` | Multi-DB — auto-generated MCP | `ext.gateway` |
| `runekaagaard/mcp-alchemy` | Multi-DB — SQLAlchemy-based | `ext.alchemy` |
| `FreePeak/db-mcp-server` | MySQL/Postgres — Go | `ext.freekdb` |
| `thindata-data` | PG/MySQL/MSSQL — 24 dialect-aware tools | `ext.thindata` |
| `wener-mssql-mcp` | MSSQL | `ext.mssql` |
| `mcp-clickhouse` | ClickHouse | `ext.clickhouse` |
| `mongodb-atlas-mcp-server` | MongoDB Atlas | `ext.mongo-atlas` |
| `supabase-community/supabase-mcp` | Supabase — official | `ext.supabase` |
| `neondatabase/mcp-server-neon` | Neon — official | `ext.neon` |
| `chroma-core/chroma-mcp` | ChromaDB | `ext.chroma` |
| `qdrant/mcp-server-qdrant` | Qdrant | `ext.qdrant` |
| `sirmews/mcp-pinecone` | Pinecone | `ext.pinecone` |
| `weaviate/mcp-server-weaviate` | Weaviate | `ext.weaviate` |
| `zilliztech/mcp-server-milvus` | Milvus / Zilliz | `ext.milvus` |
| `InfluxData/influxdb3_mcp_server` | InfluxDB 3 — official | `ext.influx3` |
| `idoru/influxdb-mcp-server` | InfluxDB OSS v2 | `ext.influx2` |
| `VictoriaMetrics-Community/mcp-victorialogs` | VictoriaLogs — official | `ext.vlogs` |
| `GreptimeTeam/greptimedb-mcp-server` | GreptimeDB | `ext.greptime` |
| `pab1it0/adx-mcp-server` | Azure Data Explorer | `ext.adx` |
| `hydrolix/mcp-hydrolix` | Hydrolix | `ext.hydrolix` |
| `tradercjz/dolphindb-mcp-server` | DolphinDB | `ext.dolphindb` |
| `neo4j-contrib/mcp-neo4j` | Neo4j — official | `ext.neo4j` |
| `memgraph/mcp-memgraph` | Memgraph | `ext.memgraph` |
| `confluentinc/mcp-confluent` | Kafka / Confluent — official | `ext.kafka` |
| `jovezhong/mcp-timeplus` | Kafka + Timeplus | `ext.timeplus` |
| `wklee610/kafka-mcp` | Kafka introspection | `ext.kafka-introspect` |
| `aywengo/kafka-schema-reg-mcp` | Kafka Schema Registry | `ext.kafka-schema` |
| `Aiven-Open/mcp-aiven` | Aiven-managed PG/Kafka/ClickHouse | `ext.aiven` |

#### Cloud & DevOps (extended)

> **Recommendation**: only wire what you actually use; each server
> is a real subprocess with auth token requirements.

| Server | Service | `namespacePrefix` |
|---|---|---|
| `awslabs/mcp` | AWS (multi-server: S3, Lambda, DynamoDB, Bedrock, …) | `ext.aws` |
| `alexei-led/aws-mcp-server` | AWS — lighter alternative | `ext.aws-lite` |
| `mcp-server-aws-sso` (aashari) | AWS SSO specifically | `ext.aws-sso` |
| `mcp-gcp` | GCP — generic | `ext.gcp` |
| `mcp-azure` | Azure — generic | `ext.azure` |
| `cloudscope-mcp` (alexpota) | Azure — FinOps / cost | `ext.azure-cost` |
| `jdubois/azure-cli-mcp` | Azure — wraps `az` CLI | `ext.azure-cli` |
| `Infrawise/mcp-server` | Azure — FinOps | `ext.azure-finops` |
| `Flux159/mcp-server-kubernetes` | Kubernetes — TypeScript | `ext.k8s-ts` |
| `manusa/Kubernetes MCP Server` | Kubernetes + OpenShift | `ext.k8s-os` |
| `alexei-led/k8s-mcp-server` | Kubernetes — lightweight | `ext.k8s-lite` |
| `rohitg00/kubectl-mcp-server` | Kubernetes — kubectl wrapper | `ext.kubectl` |
| `cyclops-ui/mcp-cyclops` | Kubernetes — Cyclops abstraction | `ext.cyclops` |
| `portainer/portainer-mcp` | Portainer | `ext.portainer` |
| `antonio-mello-ai/mcp-proxmox` | Proxmox VE | `ext.proxmox` |
| `antonio-mello-ai/mcp-pfsense` | pfSense firewalls | `ext.pfsense` |
| `mcp-terraform` (Matita-Koda) | Terraform — community | `ext.tf` |
| `hashicorp/terraform-mcp-server` | Terraform — **official HashiCorp** | `ext.tfo` |
| `pulumi/mcp-server` | Pulumi — **official** | `ext.pulumi` |
| `nwiizo/tfmcp` | Terraform — Rust | `ext.tf-rs` |
| `ckreiling/mcp-server-docker` | Docker — community | `ext.docker` |
| `docker/hub-mcp` | Docker Hub — **official** | `ext.dockerhub` |
| `ofershap/mcp-server-docker` | Docker — alt | `ext.docker-alt` |
| `friendlygeorge/docker-mcp-server` | Docker — auto-restart + health | `ext.docker-health` |
| `github/github-mcp-server` | GitHub Actions — **official** | `ext.gh-actions` |
| `CircleCI/mcp-server-circleci` | CircleCI — **official** | `ext.circleci` |
| `buildkite/buildkite-mcp-server` | Buildkite — **official** | `ext.buildkite` |
| `bitrise-io/bitrise-mcp` | Bitrise — **official** | `ext.bitrise` |
| `Daghis/teamcity-mcp` | TeamCity — community | `ext.teamcity` |
| `avisangle/jenkins-mcp-server` | Jenkins — community | `ext.jenkins` |
| `imatza-rh/mcp-zuul` | Zuul CI | `ext.zuul` |
| `currents-dev/currents-mcp` | Currents (Playwright reporting) | `ext.currents` |
| `cloudflare/mcp-server-cloudflare` | Cloudflare — **official** | `ext.cf` |
| `ofershap/mcp-server-cloudflare` | Cloudflare — alt | `ext.cf-alt` |
| `mcp-vercel` | Vercel | `ext.vercel` |
| `mcp-netlify` | Netlify | `ext.netlify` |
| `mcp-fly` | Fly.io | `ext.fly` |
| `mcp-render` | Render | `ext.render` |
| `mcp-railway` | Railway | `ext.railway` |
| `mcp-heroku` | Heroku | `ext.heroku` |

#### Observability (extended)

| Server | Vendor | `namespacePrefix` |
|---|---|---|
| `grafana/mcp` | Grafana Cloud — **official** | `ext.grafana` |
| `pab1it0/prometheus-mcp-server` | Prometheus | `ext.prom` |
| `opentelemetry/opentelemetry-mcp` | OpenTelemetry Collector | `ext.otel` |
| `mcp-loki` | Loki | `ext.loki` |
| `mcp-tempo` | Tempo (tracing) | `ext.tempo` |
| `mshegolev/jaeger-mcp` | Jaeger | `ext.jaeger` |
| `BetterDB/monitor` | Valkey / Redis observability | `ext.valkey-monitor` |
| `spre-sre/lumino-mcp-server` | AI SRE for k8s/OpenShift | `ext.lumino` |
| `skyhook-io/radar` | Radar (k8s visibility) | `ext.radar` |
| `tgeselle/bugsnag-mcp` | Bugsnag | `ext.bugsnag` |
| `mcp-datadog` | Datadog | `ext.datadog` |
| `mcp-newrelic` | New Relic | `ext.newrelic` |
| `mcp-honeybadger` | Honeybadger | `ext.honeybadger` |
| `Rootly-AI-Labs/Rootly-MCP-server` | Rootly — **official** | `ext.rootly` |
| `mcp-opsgenie` | Opsgenie | `ext.opsgenie` |
| `mcp-statuspage` | Statuspage.io | `ext.statuspage` |
| `mcp-pagerduty` | PagerDuty | `ext.pd` |
| `mcp-uptime` | Uptime monitoring | `ext.uptime` |
| `mcp-pingdom` | Pingdom | `ext.pingdom` |

#### Communication, productivity, business (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `zencoderai/slack-mcp-server` | Slack — **active fork** (Anthropic one is archived) | `ext.slack` |
| `iprashantraj/mcp-discord-bridge` | Discord — 46 tools | `ext.discord` |
| `OrygnsCode/Omnicord` | Discord — 148 tools | `ext.discord-full` |
| `InditexTech/mcp-teams-server` | MS Teams — official | `ext.teams` |
| `chaindead/telegram-mcp` | Telegram | `ext.telegram` |
| `lharries/whatsapp-mcp` | WhatsApp | `ext.whatsapp` |
| `line/line-bot-mcp-server` | LINE — **official** | `ext.line` |
| `lanchuske/local-mcp-releases` | macOS native apps (Mail, Calendar, etc.) | `ext.macos` |
| `codefuturist/email-mcp` | Email — IMAP/SMTP universal | `ext.email` |
| `marlinjai/email-mcp` | Email — Gmail + Outlook + iCloud | `ext.email-multi` |
| `softeria/ms-365-mcp-server` | Microsoft 365 (mail, files, calendar) | `ext.ms365` |
| `wyattjoh/imessage-mcp` | iMessage — macOS | `ext.imessage` |
| `aashari/mcp-server-atlassian-confluence` | Confluence Cloud | `ext.confluence` |
| `GeiserX/atlassian-browser-mcp` | Confluence — corporate SSO | `ext.confluence-sso` |
| `aashari/mcp-server-atlassian-jira` | Jira Cloud | `ext.jira` |
| `TamarEngel/jira-github-mcp` | Jira + GitHub combined | `ext.jira-gh` |
| `mcp-linear` | Linear | `ext.linear` |
| `mcp-airtable` (domdomegg) | Airtable | `ext.airtable` |
| `mcp-coda` | Coda | `ext.coda` |
| `mcp-clickup` | ClickUp | `ext.clickup` |
| `mcp-asana` | Asana | `ext.asana` |
| `mcp-monday` | Monday.com | `ext.monday` |
| `mcp-trello` | Trello | `ext.trello` |
| `mcp-basecamp` | Basecamp | `ext.basecamp` |
| `discourse/discourse-mcp` | Discourse — **official** | `ext.discourse` |
| `aashari/mcp-server-atlassian-bitbucket` | Bitbucket Cloud | `ext.bitbucket` |
| `zereight/gitlab-mcp-server` | GitLab — community fork (Anthropic one is archived) | `ext.gitlab` |
| `arpitbatra123/mcp-googletasks` | Google Tasks | `ext.gtasks` |
| `Danielpeter-99/calcom-mcp` | Cal.com scheduling | `ext.calcom` |
| `madbonez/caldav-mcp` | CalDAV universal (Yandex, Nextcloud, …) | `ext.caldav` |
| `OverQuotaAI/chatterboxio-mcp-server` | Meeting bots (Zoom, Meet) | `ext.meet` |
| `joinly-ai/joinly` | Browser-based meeting bots | `ext.meet-bot` |

#### Testing & QA (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-postman` | Postman / Newman | `ext.postman` |
| `mcp-insomnia` | Insomnia | `ext.insomnia` |
| `mcp-bruno` | Bruno | `ext.bruno` |
| `mcp-hoppscotch` | Hoppscotch | `ext.hoppscotch` |
| `mcp-k6` | k6 load testing | `ext.k6` |
| `mcp-artillery` | Artillery | `ext.artillery` |
| `mcp-locust` | Locust | `ext.locust` |
| `mcp-jmeter` | JMeter | `ext.jmeter` |
| `mcp-gatling` | Gatling | `ext.gatling` |
| `mcp-selenium` | Selenium | `ext.selenium` |
| `mcp-webdriverio` | WebdriverIO (mobile + browser) | `ext.wdio` |
| `mcp-testcafe` | TestCafe | `ext.testcafe` |
| `mcp-codecept` | CodeceptJS | `ext.codecept` |
| `mcp-detox` | Detox (mobile) | `ext.detox` |
| `mcp-appium` | Appium (mobile) | `ext.appium` |
| `mcp-maestro` | Maestro (mobile) | `ext.maestro` |
| `mcp-pact` | Pact (contract testing) | `ext.pact` |
| `mcp-wiremock` | WireMock | `ext.wiremock` |
| `mcp-mountebank` | Mountebank | `ext.mountebank` |
| `mcp-mock-server` | mock-server | `ext.mock` |

#### Build tools & package managers (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mpn-pnpm` | pnpm | `ext.pnpm` |
| `mcp-yarn` | Yarn | `ext.yarn` |
| `mcp-bun` | Bun | `ext.bun` |
| `mcp-deno` | Deno | `ext.deno` |
| `mcp-pip` | pip | `ext.pip` |
| `mcp-poetry` | Poetry | `ext.poetry` |
| `mcp-uv` | uv | `ext.uv` |
| `mcp-pdm` | PDM | `ext.pdm` |
| `mcp-conda` | Conda | `ext.conda` |
| `mcp-pipenv` | Pipenv | `ext.pipenv` |
| `mcp-hatch` | Hatch | `ext.hatch` |
| `mcp-rye` | Rye | `ext.rye` |
| `mcp-cargo` | Cargo | `ext.cargo` |
| `mcp-go-modules` | Go modules | `ext.gomod` |
| `mcp-maven` | Maven | `ext.maven` |
| `mcp-gradle` | Gradle | `ext.gradle` |
| `mcp-sbt` | sbt (Scala) | `ext.sbt` |
| `mcp-leiningen` | Leiningen (Clojure) | `ext.lein` |
| `mcp-bundle` | Bundler (Ruby) | `ext.bundle` |
| `mcp-composer` | Composer (PHP) | `ext.composer` |
| `mcp-hex` | Hex (Elixir) | `ext.hex` |
| `mcp-rebar3` | rebar3 (Erlang) | `ext.rebar` |
| `mcp-cocoapods` | CocoaPods | `ext.cocoapods` |
| `mcp-swift-pm` | SwiftPM | `ext.swiftpm` |
| `mcp-nuget` | NuGet | `ext.nuget` |
| `mcp-crates` | crates.io queries | `ext.crates` |
| `mcp-homebrew` | Homebrew | `ext.brew` |
| `mcp-winget` | winget | `ext.winget` |
| `mcp-scoop` | Scoop | `ext.scoop` |
| `mcp-chocolatey` | Chocolatey | `ext.choco` |
| `mcp-apt` | apt | `ext.apt` |
| `mcp-dnf` | dnf | `ext.dnf` |
| `mcp-pacman` | pacman | `ext.pacman` |
| `mcp-npm` | npm queries | `ext.npm` |
| `mcp-pypi` | PyPI queries | `ext.pypi` |

#### AI / ML / data (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-ollama` (VrtxOmega) | Ollama — **official-ish** | `ext.ollama` |
| `mcp-openai` | OpenAI | `ext.openai` |
| `mcp-anthropic` | Anthropic API | `ext.anthropic` |
| `mcp-gemini` | Google Gemini | `ext.gemini` |
| `mcp-mistral` | Mistral | `ext.mistral` |
| `mcp-cohere` | Cohere | `ext.cohere` |
| `mcp-replicate` | Replicate | `ext.replicate` |
| `mcp-together` | Together | `ext.together` |
| `mcp-groq` | Groq | `ext.groq` |
| `mcp-perplexity` | Perplexity | `ext.perplexity` |
| `mcp-huggingface` | HuggingFace | `ext.hf` |
| `mcp-deepseek` | DeepSeek | `ext.deepseek` |
| `mcp-xai` | xAI Grok | `ext.xai` |
| `mcp-langchain` | LangChain | `ext.langchain` |
| `mcp-llamaindex` | LlamaIndex | `ext.llamaindex` |
| `mcp-pytorch` | PyTorch | `ext.pytorch` |
| `mcp-tensorflow` | TensorFlow | `ext.tensorflow` |
| `mcp-jax` | JAX | `ext.jax` |
| `mcp-sklearn` | scikit-learn | `ext.sklearn` |
| `mcp-pandas` | pandas | `ext.pandas` |
| `mcp-polars` | polars | `ext.polars` |
| `mcp-dask` | Dask | `ext.dask` |
| `mcp-ray` | Ray | `ext.ray` |
| `mcp-spark` | Apache Spark | `ext.spark` |
| `mcp-dbt` | dbt — **official dbt-labs** | `ext.dbt` |
| `mcp-airflow` | Apache Airflow | `ext.airflow` |
| `mcp-prefect` | Prefect | `ext.prefect` |
| `mcp-dagster` | Dagster | `ext.dagster` |
| `mcp-kedro` | Kedro | `ext.kedro` |
| `mcp-mlflow` | MLflow | `ext.mlflow` |
| `mcp-jupyter` (datalayer) | Jupyter notebooks | `ext.jupyter` |
| `mcp-kaggle` | Kaggle | `ext.kaggle` |
| `mcp-ragas` | Ragas (RAG eval) | `ext.ragas` |
| `mcp-langsmith` | LangSmith | `ext.langsmith` |
| `mcp-langfuse` | Langfuse | `ext.langfuse` |

#### Security & secrets (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-vault` | HashiCorp Vault | `ext.vault` |
| `mcp-1password` | 1Password | `ext.op` |
| `mcp-bitwarden` | Bitwarden | `ext.bw` |
| `mcp-lastpass` | LastPass | `ext.lastpass` |
| `mcp-aws-secrets` | AWS Secrets Manager | `ext.aws-sm` |
| `mcp-gcp-secrets` | GCP Secret Manager | `ext.gcp-sm` |
| `mcp-azure-keyvault` | Azure Key Vault | `ext.akv` |
| `mcp-snyk` | Snyk | `ext.snyk` |
| `mcp-trivy` | Trivy | `ext.trivy` |
| `mcp-grype` | Grype | `ext.grype` |
| `mcp-dependabot` | Dependabot | `ext.depabot` |
| `mcp-renovate` | Renovate | `ext.renovate` |
| `mcp-sonarqube` | SonarQube | `ext.sonar` |
| `mcp-codeql` | GitHub CodeQL | `ext.codeql` |
| `mcp-semgrep` | Semgrep | `ext.semgrep` |
| `mcp-trufflehog` | TruffleHog | `ext.truffle` |
| `mcp-gitleaks` | gitleaks | `ext.gitleaks` |
| `mcp-detect-secrets` | detect-secrets | `ext.detsec` |
| `mcp-oras` | ORAS | `ext.oras` |
| `mcp-cosign` | Sigstore Cosign | `ext.cosign` |
| `mcp-sigstore` | Sigstore | `ext.sigstore` |
| `mcp-in-toto` | in-toto | `ext.in-toto` |
| `mcp-iam-policy` | IAM Policy Generator | `ext.iampoly` |
| `mcp-cloudsploit` | CloudSploit | `ext.cloudsploit` |
| `mcp-pacu` | Pacu (AWS pentest) | `ext.pacu` |
| `mcp-nuclei` | Nuclei | `ext.nuclei` |
| `mcp-zap` | OWASP ZAP | `ext.zap` |
| `mcp-burp` | Burp Suite | `ext.burp` |
| `mcp-mobsf` | MobSF (mobile) | `ext.mobsf` |

#### Utilities (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `tavily/mcp` | Tavily web search | `ext.tavily` |
| `kagi-mcp` | Kagi search | `ext.kagi` |
| `firecrawl-mcp-server` (Mendable) | Firecrawl scraping — official | `ext.firecrawl` |
| `jina-mcp-tools` | Jina AI | `ext.jina` |
| `exa-mcp` | Exa search | `ext.exa` |
| `mcp-devdocs` | DevDocs.io | `ext.devdocs` |
| `mcp-package-version` (sammcj) | Latest stable package versions | `ext.pkgver` |
| `mcp-godoc` | Go package docs | `ext.godoc` |
| `mcp-rust-docs` | Rust crate docs | `ext.rustdocs` |
| `mcp-python-docs` | Python stdlib docs | `ext.pydocs` |
| `swift-patterns-mcp` | Swift/SwiftUI patterns | `ext.swiftpat` |
| `mcp-aws-docs` | AWS documentation | `ext.awsdocs` |
| `mcp-vercel-ai-docs` | Vercel AI SDK docs | `ext.verceldocs` |
| `mcp-shadcn-ui` | shadcn/ui docs | `ext.shadcn` (duplicate w/ framework table; pick one tier) |
| `desktop-commander` | File/process/exec Swiss-army | `ext.dc` |
| `marker-pdf` | PDF → markdown | `ext.pdfmd` |
| `markitdown` (Microsoft) | Same | `ext.markit` |
| `pandoc-mcp` | Document format conversion | `ext.pandoc` |
| `markdownify-mcp` | Various → markdown | `ext.markify` |
| `excel-mcp-server` | Excel manipulation | `ext.excel` |
| `pdf-card-mcp` | PDF → card-based HTML reader | `ext.pdfcards` |
| `devutils-mcp` | Base64/UUID/hash/JWT/cron | `ext.devutils` |
| `mcp-bytesmith` | Encoding + crypto helpers | `ext.bytesmith` |
| `mcp-abacus` | Type-faithful calculator | `ext.abacus` |
| `mcp-time` | Time / timezone | `ext.time` |
| `mcp-uuid` | UUID generation | `ext.uuid` |
| `mcp-base64` | Base64 encoding | `ext.base64` |
| `mcp-cron` | Cron parsing | `ext.cron` |
| `mcp-json-formatter` | JSON formatting/validation | `ext.jsonfmt` |
| `mcp-regex` | Regex testing | `ext.regex` |
| `mcp-password` | Secure password generation | `ext.pwd` |
| `dash-mcp-server` | Dash (macOS API docs) | `ext.dash` |
| `cert-manager-mcp-server` | Kubernetes cert-manager | `ext.certmgr` |
| `spotify-mcp` | Spotify | `ext.spotify` |
| `apple-music-mcp` | Apple Music | `ext.apple-music` |
| `vrchat-mcp` | VRChat | `ext.vrchat` |
| `unity-mcp` | Unity editor | `ext.unity` |
| `godot-mcp` | Godot | `ext.godot` |
| `unreal-engine-mcp` | Unreal Engine | `ext.unreal` |

#### Mobile, embedded, and other niche (extended)

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `agent-device` | iOS / Android / TV / macOS automation | `ext.agent-device` |
| `mobile-mcp` | iOS / Android device automation | `ext.mobile-mcp` |
| `hyperb1iss/droidmind` | Android device control + debug | `ext.droidmind` |
| `mobile-next/mobile-mcp` | iOS Simulator + Android Emulator | `ext.mobile-next` |
| `mobile-device-mcp` (saranshbamania) | 49 tools mobile | `ext.mobile-device` |
| `ios-simulator-mcp` (joshuayoes) | iOS Simulator | `ext.ios-sim` |
| `InditexTech/mcp-server-simulator-ios-idb` | iOS Simulator via idb | `ext.ios-idb` |
| `xcodebuild` (ShenghaiWang) | Xcode build + feed errors to LLM | `ext.xcodebuild` |
| `simctl-mcp` (ambar) | iOS Simulator via simctl | `ext.simctl` |
| `app-store-connect-mcp-server` | App Store Connect | `ext.asc` |
| `ros-mcp-server` (lpigeon) | ROS / ROS2 control | `ext.ros` |
| `mcp-server-ros-2` (wise-vision) | ROS2 | `ext.ros2` |
| `kukapay/modbus-mcp` | Modbus industrial data | `ext.modbus` |
| `kukapay/opcua-mcp` | OPC UA industrial | `ext.opcua` |
| `adancurusul/embedded-debugger-mcp` | Embedded debug (ARM Cortex-M, RISC-V) | `ext.embedded` |
| `yoelbassin/gnuradioMCP` | GNU Radio RF flowcharts | `ext.gnuradio` |### Live tier (⛔ — runtime npm/GitHub fetch)

Only enabled when the user explicitly sets
`allowDiscoverySearch: true`. The runtime fetch consults the
**npm registry's `/-/v1/search` endpoint** and the **GitHub
topics API for `mcp-server`**, with hard limits:

- Max 10 candidates per call.
- Each candidate must have a pinned version before being added
  to the config.
- Every candidate goes through `external_mcp_validate_config`
  before boot.
- Every boot requires human ack via `external_mcp_ack`.
- A rate-limit budget is enforced (10 npm calls / 10 min per
  workspace).

The user should never enable this unless they understand they
are trusting the LLM's judgment about which packages to install.

### Token budget impact

The plugin ships a **summary catalog** in `external_mcp_catalog`,
not full schemas. Per-server cost is roughly:

| Field | Approx tokens |
|---|---|
| `name`, `description` (≤80 chars), `tags[]` | ~30–50 |
| Full `inputSchema` (only if the LLM asks via `external_mcp_discover`) | ~500–1500 |

For the seed configuration (14 ⭐ curated servers — see
[`docs/external-mcps/overview.md`](../../../../external-mcps/overview.md))
the catalog adds **~400–600 tokens** to the system prompt. This is
still well within the existing `overview` budget envelope (a00032
S4) but is **5–6× larger** than the previous "filesystem + angular"
estimate, so `external-mcp` should not be combined with
simultaneous loading of other high-token catalogs without re-running
the budget regression gate.

The 🟡 discoverable tier (~360 entries) does **not** contribute to
the system prompt — it is only loaded on demand via
`external_mcp_discover`, where the LLM asks "do you have anything
for X?" and gets back a one-line summary per matching entry
(~30 tokens each).

## Slices

- global_gate: validate

### S1 — Config schema + catalog tool (pure core of the plugin)

- **Status**: pending
- **Files**: `plugins/external-mcps/src/index.ts`, `plugins/external-mcps/src/lib/options-schema.ts`, `plugins/external-mcps/src/lib/catalog/catalog-data.ts`, `plugins/external-mcps/src/lib/tools/catalog.tool.ts`, `plugins/external-mcps/src/lib/tools/validate-config.tool.ts`, `plugins/external-mcps/tests/src/lib/catalog.spec.ts`, `plugins/external-mcps/tests/src/lib/validate-config.spec.ts`
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "OptionsSchema (Zod): `servers.<name>` entries (pinned version required, command+args transport, namespacePrefix, optional detect rule) + the 3 autonomy knobs with the resolved defaults (llmDecidesActivation:true, requireHumanAckWhenLlmDecides:true, allowDiscoverySearch:false)."
  - "`external_mcp_catalog`: compact by default (id/category/one-liner), `query` filter, max 10 matches, `detail:'<id>'` for one full entry; curated 10 + discoverable tier in catalog-data.ts; NOTHING enters the system prompt."
  - "`external_mcp_validate_config`: dry-run a proposed servers patch against the schema (mandatory-pin + kebab-id + no-cleartext enforced), returns issues — never writes."
- status: done
### S2 — Lazy subprocess registry + status + filesystem seed

- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/src/lib/tools/status.tool.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`, `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`, `plugins/external-mcps/tests/e2e/filesystem-roundtrip.e2e.spec.ts`
- **Depends on**: S1
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "Registry reuses the f00067a createStdioTransport pattern (NDJSON JSON-RPC, SIGTERM→SIGKILL close, timers unref'd, no process.cwd): declared servers spawn LAZILY on first `ext.<server>.*` call, child cached, `eager: true` opt-out per server."
  - "`external_mcp_status`: per-server {declared, running, pid?, bootedAt?, lastError?} — compact. e2e drives a stub MCP child via process.execPath (CI-friendly, no npm dep) through declare→lazy-boot→call→close."
  - "Spec proves an `ext.*`-named call round-trips usage-tracking record→report unchanged (gate decision 8)."
- status: done
### S3 — Suggest + ack flow (LLM-assisted config, human-acked)

- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/tools/suggest.tool.ts`, `plugins/external-mcps/src/lib/tools/ack.tool.ts`, `plugins/external-mcps/src/lib/ack/pending-acks.ts`, `plugins/external-mcps/tests/src/lib/suggest-ack.spec.ts`
- **Depends on**: S1
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "`external_mcp_suggest` returns an RFC6902 patch proposal for the config (same convention as the f00067 bootstrap wizard) + the catalog rationale; it NEVER applies — writing config stays with the human/host."
  - "`external_mcp_ack`: pending activations persist under the cache dir (redactSecrets, writeFileAtomic); when requireHumanAckWhenLlmDecides, first activation of a declared server requires a recorded ack; notification emitted via the standard notify bridge (non-modal, decision 5)."
- status: done
### S4 — Detection, skill, i18n + docs surface

- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/detect/detect-rules.ts`, `plugins/external-mcps/skills/external-mcps.skill.md`, `apps/web/src/i18n/tools/external-mcps.ts`, `docs/delendai/PLUGINS-DELENDAI.md`
- **Depends on**: S2, S3
- **Gate**: bun run validate
- **Acceptance**:
  - "Angular seed detect rule (`package.json#dependencies['@angular/core']`) + generic detect engine; detection only ANNOTATES the catalog/suggest output (`detected: true`), never activates (knob semantics preserved)."
  - "All 6 tools registered in the web i18n table (12-lang per convention); skill documents the LLM workflow (catalog→suggest→ack→call); plugin documented in PLUGINS-DELENDAI; catalog artifacts regenerated; token-budget suite green (decision 6)."
- status: done
### S5 — Gated discovery + vscode ack surface

- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/tools/discover.tool.ts`, `plugins/external-mcps/tests/src/lib/discover-gate.spec.ts`, `extensions/vscode/src/commands/external-mcps-ack.ts`, `tools/scripts/lint/cli-ui-parity.map.json`
- **Depends on**: S2, S3
- **Gate**: bun run validate
- **Acceptance**:
  - "`external_mcp_discover` consults the npm registry ONLY when allowDiscoverySearch:true; spec asserts the off-default returns the structured opt-in hint (never a network call); 10/10min budget enforced in-memory."
  - "vscode: pending-ack notification action + dashboard chip wired (thin adapter over `external_mcp_ack`); parity map updated."
- status: done
## Acceptance

- `bun run typecheck` → exit 0 (root globs `plugins/*/src`, so the new
  plugin is auto-typechecked).
- `bun run test` → exit 0.
- `bun run validate` → exit 0 (i18n table, catalog artifacts,
  no-cleartext-secrets, token-budget suite all green).
- Zero system-prompt cost when the plugin is not loaded AND when it is
  loaded but unused beyond the ~6 tool one-liners in the overview
  (decisions 1 + 6).
- `allowDiscoverySearch` defaults to `false` and a spec pins it.
- Every activation under `requireHumanAckWhenLlmDecides: true` has a
  recorded, durable ack (redacted, atomic).
- ✅ No reference to `externalServers` exists yet in
  `extensions/vscode/src/host-config.ts` or in any other host
  config (verified via `grep -r externalServers extensions/`).
- ✅ The §"Seed catalog policy" lists at least 1 ⭐ entry, at
  least 50 🟡 entries across ≥5 categories, and an explicit
  ⛔ policy. Counts at the moment of writing (verified
  2026-06-26, see [`docs/external-mcps/`](../../../../external-mcps/README.md)):
  **14 ⭐ entries** — all current Anthropic reference servers that
  are still maintained (filesystem, git, fetch, postgres, sqlite)
  plus the actively-used canonical homes of formerly-Anthropic
  servers (Redis → `redis/mcp-redis`, GitHub → `github/github-mcp-server`,
  Notion → `makenotion/notion-mcp-server`, MongoDB →
  `mongodb-js/mcp-server`), plus the industry-standard
  universal stack (`@upstash/context7-mcp`, `mcp-language-server`,
  `chrome-devtools-mcp` or `@playwright/mcp`, `mcp-server-docker`,
  `@modelcontextprotocol/server-kubernetes`); **~360 🟡 entries**
  across 13 categories (Languages & LSPs, Frontend frameworks,
  Backend frameworks, Databases & data stores, Cloud & DevOps,
  Observability, Communication / productivity / business,
  Testing & QA, Build tools & package managers, AI / ML / data,
  Security & secrets, Utilities, Mobile / embedded / niche);
  and an explicit ⛔ live-search policy with rate-limit
  (10 calls / 10 min per workspace) + per-candidate ack.
- ✅ The archived-Anthropic servers (`server-slack`, `-github`,
  `-gitlab`, `-puppeteer`, `-brave-search`, `-redis`, `-notion`)
  are **not** in the ⭐ curated tier; each appears in the
  🟡 discoverable tier with its current canonical home
  documented. The unpause gate must re-verify these on
  activation (vendors keep moving them).
- ✅ Angular is documented as **"no maintained MCP exists"** in
  the frontend-frameworks discoverable table, with the
  pragmatic alternative stack (context7 + LSP + DevTools)
  recommended. The 404s of `cyanheads/angular-mcp-server`,
  `darioz-ms/angular-mcp`, and `Microcks/angular-mcp` (verified
  2026-06-26) are recorded as failures in
  [`docs/external-mcps/quality-and-red-flags.md`](../../../../external-mcps/quality-and-red-flags.md#failures-observed-working-list).

## Risks and mitigations

| Risk | Severity | Mitigation in this proposal |
|---|---|---|
| `npx -y` runs `@latest` — supply chain hole | High | Mandatory version pin in `IServerEntry.version`; Zod schema rejects unpinned entries. |
| External server reads/writes outside workspace | High | `resolveWorkspaceContained` middleware in the subprocess registry; `scope: ${workspace}` enforced before each call. |
| External tool returns secrets into memory/proposals | Medium | `redactSecrets` runs on every external tool result before persisting anywhere durable. |
| Lazy first-call latency | Medium | Optional `eager: true` per server for hot paths; future P7 may add a `preload: ["filesystem"]` warmup. |
| Schema drift in external server (`toolSchemaVersion` mismatch) | Medium | Manifest carries `toolSchemaVersion`; `external_mcp_status` fails loud on drift; CLI command documented. |
| LLM suggests installing an unknown/malicious npm package (live tier only) | High | Live tier stays off by default; on, results still require human ack via `external_mcp_ack` before install; rate-limit budget enforced. |
| Native-vs-external tool confusion for the LLM | Low | Skill `external-mcps` documents when to prefer which; `external_mcp_discover` returns the exact answer. |
| Boot explosion when many servers declared | Low | Lazy boot defers cost; cap `maxBootedServers` per session is a future P7. |
| Token budget regression from a large curated tier | Low | Catalog is summary-only (~30–50 tokens per entry); ~25 ⭐ entries ≈ 1 KB. Discoverable tier is opt-in per turn. |
| `namespacePrefix` collisions across tiers (e.g. `ext.fs` for filesystem vs F#) | Medium | Three-tier taxonomy `ext.<category>.<tool>` with explicit rename policy documented in the 🟡 table (F# → `ext.fsharp`); collisions are surfaced at unpause time. |
| Live tier DoSes npm registry on misuse | Medium | Hard cap: 10 calls / 10 min per workspace; budget visible in `external_mcp_status`; reset requires host restart. |
| Curated tier grows stale (server abandoned upstream) | Low | Annual `audit-curated-seeds` slice (P7) re-validates every ⭐ entry; entries with `lastSeenGoodAt` > 12 months move to 🟡 or get retired. |
| Discoverable tier (~200 entries) becomes a maintenance liability | Low | The 🟡 table is **policy intent**, not a frozen inventory. P1 trims against the live ecosystem; only ⭐ entries are gated by adoption. |
| LLM mis-selects a server from the 🟡 tier that doesn't exist anymore | Medium | `external_mcp_discover` runs a `npm view <name>` ping before returning the schema; non-existent packages return `{ found: false, fallbackSuggestion: <closest alive> }`. |
| Vendors move servers between canonical homes (Slack→Zencoder, GitHub→GitHub, etc.) — curated tier falls behind the latest URL | Medium | The curated tier's `command` / `args` patterns are abstracted through `delendai.config.json#plugins.external-mcps.servers.<name>`; the dossier at [`docs/external-mcps/`](../../../../external-mcps/README.md) is the source of truth for current URLs and is re-verified every 90 days. The audit slice P7 catches drift. |
| **Angular (and other ecosystems with no maintained MCP)**: LLM needs an Angular-specific tool that doesn't exist | Low–Medium | The frontend-frameworks discoverable table explicitly says "no maintained MCP exists" for Angular and recommends the universal stack (`context7` for docs + `mcp-language-server` against `angular-language-server` for symbols + `chrome-devtools-mcp` for runtime). Verified on 2026-06-26 that `cyanheads/angular-mcp-server`, `darioz-ms/angular-mcp`, and `Microcks/angular-mcp` all return 404. |

## Notes

**Unpause gate — RESOLVED (2026-07-07, decisions delegated to the
agent).** The user delegated all eight decisions with the mandate "lo
más útil y que gaste pocos tokens — lo van a usar modelos como tú".
Resolutions:

1. **Curated tier: 10 entries, ZERO system-prompt bytes.** The curated
   catalog is trimmed from ~25 to 10 high-signal servers (filesystem,
   git, github, fetch, memory, sqlite, postgres, playwright, docker,
   angular — the user's stack plus the universal ones) AND — overriding
   the original design — it does NOT ship in the system prompt at all.
   Discovery is one `external_mcp_catalog` call away, compact by
   default (id + category + one-liner ≈ 15 tokens/entry). A cold
   session pays 0 tokens; a session that needs an external server pays
   ~150.
2. **Discoverable tier: on-disk JSON, loaded on demand.** The ~200+
   entry list lives in a data file inside the plugin, queried via
   `external_mcp_catalog { query }` with filtering — never in the
   prompt, never returned whole (max 10 matches per call).
3. **Live search: `allowDiscoverySearch: false` default**, exactly as
   recommended; when enabled, the 10 calls / 10 min budget and
   per-candidate ack apply.
4. **Namespace: `ext.<server>.<tool>` confirmed** (server id, not
   category — unambiguous, no F#/filesystem collisions by
   construction; ids are the roster keys, kebab-case, unique by Zod).
5. **Ack surface: notification + dashboard action** (non-modal). A
   modal blocks agent flows; the notification carries the accept
   action and the pending ack is visible in the provider dashboard.
   `requireHumanAckWhenLlmDecides` stays `true` by default.
6. **Token budget: enforced by spec.** The plugin adds ~6 tools with
   one-line summaries to the overview (≈120 tokens when loaded — it is
   opt-in, so default deployments pay nothing); the budget regression
   suite gates it.
7. **Security: mitigations accepted as designed** — workspace
   containment via `resolveWorkspaceContained`, `redactSecrets` before
   every durable write, mandatory version pinning (no `latest`), env
   secrets by NAME only (lint:no-cleartext-secrets), rate-limit budget
   for the live tier.
8. **usage-tracking compatibility: verified by spec in S2.** Tool
   names are opaque strings in the NDJSON log; an `ext.*`-named call
   must round-trip through record→report unchanged.


- **External MCP dossier** (verified 2026-06-26 against canonical
  repos): see [`docs/external-mcps/`](../../../../external-mcps/README.md)
  for the curated list of servers across 13 categories. Each entry
  in the curated + discoverable tiers below can be cross-referenced
  with its dossier file (e.g. the `ext.gh` row links to
  [`docs/external-mcps/productivity.md`](../../../../external-mcps/productivity.md#code--dev-platforms)).
  The dossier is the source of truth for current canonical URLs and
  is re-verified every 90 days.
- **Seed catalog tiers** (full tables in §"Seed catalog policy"):
  - **Curated (⭐, 14 entries)**: verified-2026-06-26 canonical
    packages — Anthropic reference servers that are still maintained
    + the current canonical homes of formerly-Anthropic servers
    (Redis, GitHub, Notion, MongoDB) + the industry-standard
    universal stack (`@upstash/context7-mcp`, `mcp-language-server`,
    `chrome-devtools-mcp` or `@playwright/mcp`, `mcp-server-docker`,
    `@modelcontextprotocol/server-kubernetes`). Always in the
    system prompt via `external_mcp_catalog`.
  - **Discoverable (🟡, ~360 entries)**: language/framework/DB/
    cloud/AI/security/utilities/niche catalogs across 13 categories.
    LLM asks via `external_mcp_discover`; no network cost.
  - **Live (⛔)**: npm/GitHub search, off by default, ack-gated,
    rate-limited (10 calls / 10 min per workspace).
- **Cross-references:**
  - `f00067` (multi-model orchestrator) sets the
    `toolSchemaVersion` precedent this proposal reuses.
  - `f00050` (parking-lot convention) sets the "park a slice behind
    a precondition list" precedent this proposal follows.
  - `a00032` S4 (overview compactness) is the budget envelope the
    catalog must fit under.
  - [`docs/external-mcps/quality-and-red-flags.md`](../../../../external-mcps/quality-and-red-flags.md)
    documents the 5-signal rubric the curated tier was vetted against,
    plus the failures-observed working list.
- **Wiki stub:** When unpaused, the proposal should grow a
  `docs/delendai/wiki/13-external-mcps.md` page that mirrors the
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