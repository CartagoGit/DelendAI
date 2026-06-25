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

## Seed catalog policy — three tiers

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
- The **discoverable tier** is the breadth. ~60+ servers the LLM
  can ask about on demand without any network call. Cost: only
  what the LLM chooses to load.
- The **live tier** is the escape hatch. When a workspace uses a
  server nobody curated (e.g. `zig-mcp` for a niche language),
  the LLM can propose one — but the human must ack every
  candidate before it boots. Cost: a network roundtrip, plus the
  ack overhead.

The full candidate list lives in
[`docs/mcp-vertex/skills/external-mcps-seed-catalog.md`](../../../skills/external-mcps-seed-catalog.md)
(planned for unpause; the file ships empty + this proposal
prescribes the structure so it can grow).

### Curated tier (⭐ — always in the catalog summary)

> **Criteria for "curated"**: maintained in the last 12 months,
> semver-stable release available, has at least one sponsor who
> is not the original author, no known supply-chain incidents.
> Updated annually via `audit-curated-seeds` (f00068 P7).

These ~25 servers appear in `external_mcp_catalog` on every turn:

| Category | Server | `namespacePrefix` | Source |
|---|---|---|---|
| Filesystem & shell | `@modelcontextprotocol/server-filesystem` | `ext.fs` | Anthropic (official) |
| Filesystem & shell | `@modelcontextprotocol/server-git` | `ext.gitops` | Anthropic (official) |
| Languages & LSPs | `mcp-language-server` (isaacphi) | `ext.lsp` | Community (multi-LSP wrapper) |
| Frontend frameworks | `angular-mcp` | `ext.angular` | Community (picks maintained fork) |
| Frontend frameworks | `@react/mcp` | `ext.react` | Community (React docs + RSC) |
| Frontend frameworks | `vue-mcp` | `ext.vue` | Community (Vue + Nuxt) |
| Frontend frameworks | `svelte-mcp` | `ext.svelte` | Community (SvelteKit + runes) |
| Frontend frameworks | `next-mcp` | `ext.nextjs` | Community (Next.js App Router) |
| Backend frameworks | `@modelcontextprotocol/server-postgres` | `ext.pg` | Anthropic (official) |
| Backend frameworks | `@modelcontextprotocol/server-sqlite` | `ext.sqlite` | Anthropic (official) |
| Backend frameworks | `mcp-server-docker` | `ext.docker` | Anthropic community |
| Cloud & DevOps | `@modelcontextprotocol/server-kubernetes` | `ext.k8s` | Anthropic community |
| Cloud & DevOps | `mcp-aws` | `ext.aws` | Community (AWS SDK wrapper) |
| Communication | `@modelcontextprotocol/server-slack` | `ext.slack` | Anthropic (official) |
| Communication | `@modelcontextprotocol/server-github` | `ext.gh` | Anthropic (official) |
| Communication | `@modelcontextprotocol/server-gitlab` | `ext.gitlab` | Anthropic (official) |
| Communication | `mcp-linear` | `ext.linear` | Community |
| Productivity | `@modelcontextprotocol/server-notion` | `ext.notion` | Anthropic community |
| Productivity | `mcp-jira` | `ext.jira` | Community |
| Documentation | `@modelcontextprotocol/server-fetch` | `ext.fetch` | Anthropic (official) |
| Documentation | `@modelcontextprotocol/server-brave-search` | `ext.search` | Anthropic (official) |
| Documentation | `@modelcontextprotocol/server-puppeteer` | `ext.puppet` | Anthropic (official) |
| Testing & QA | `mcp-playwright` | `ext.pw` | Community (Microsoft Playwright) |
| Build & package mgrs | `mcp-npm` | `ext.npm` | Community |
| Build & package mgrs | `mcp-pypi` | `ext.pypi` | Community |

### Discoverable tier (🟡 — load on demand)

> **Criteria for "discoverable"**: actively maintained OR has a
> well-known sponsor; LLM can ask the catalog for the full schema
> and metadata without network cost; never loaded into the
> system prompt.

These ~60+ servers are available via `external_mcp_discover`
without any npm call. The LLM sees them only when it asks
specifically ("are there any Angular MCP servers?"). Each entry
gets a one-line description and `ext.<namespacePrefix>`.

#### Languages & LSPs (extended)

| Server | Language | `namespacePrefix` |
|---|---|---|
| `python-mcp` (pyright + ruff) | Python | `ext.py` |
| `pyright-mcp` | Python (types only) | `ext.pyright` |
| `ruff-mcp` | Python (lint only) | `ext.ruff` |
| `golang-mcp` | Go (gopls) | `ext.go` |
| `gopls-mcp` | Go (gopls direct) | `ext.gopls` |
| `rust-mcp` | Rust (rust-analyzer) | `ext.rs` |
| `rust-analyzer-mcp` | Rust (direct) | `ext.rust-analyzer` |
| `ruby-mcp` | Ruby (rubocop + sorbet) | `ext.rb` |
| `sorbet-mcp` | Ruby (Sorbet) | `ext.sorbet` |
| `mcp-java` | Java (jdtls) | `ext.java` |
| `kotlin-mcp` | Kotlin | `ext.kotlin` |
| `swift-mcp` | Swift (sourcekit-lsp) | `ext.swift` |
| `csharp-mcp` | C# (omnisharp-roslyn) | `ext.cs` |
| `fsharp-mcp` | F# (FCS) | `ext.fs` (collision with `fs` → renamed `ext.fsharp`) |
| `elixir-mcp` | Elixir (elixir-ls) | `ext.ex` |
| `phoenix-mcp` | Elixir (Phoenix framework) | `ext.phoenix` |
| `zig-mcp` | Zig (zls) | `ext.zig` |
| `php-mcp` | PHP (phpactor) | `ext.php` |
| `dart-mcp` | Dart | `ext.dart` |
| `flutter-mcp` | Flutter | `ext.flutter` |
| `scala-mcp` | Scala (Metals) | `ext.scala` |
| `haskell-mcp` | Haskell (hls) | `ext.hs` |
| `clojure-mcp` | Clojure (clj-kondo + clojure-lsp) | `ext.clj` |
| `ocaml-mcp` | OCaml (ocaml-lsp) | `ext.ml` |
| `erlang-mcp` | Erlang (erlang_ls) | `ext.erl` |
| `lua-mcp` | Lua (lua-language-server) | `ext.lua` |
| `r-mcp` | R (languageserver) | `ext.r` |
| `julia-mcp` | Julia (LanguageServer.jl) | `ext.jl` |
| `nim-mcp` | Nim (nimlsp) | `ext.nim` |
| `crystal-mcp` | Crystal (scry) | `ext.cr` |
| `gleam-mcp` | Gleam | `ext.gleam` |
| `elm-mcp` | Elm | `ext.elm` |
| `purescript-mcp` | PureScript | `ext.purs` |
| `vhdl-mcp` | VHDL | `ext.vhdl` |
| `verilog-mcp` | Verilog | `ext.verilog` |
| `terraform-mcp` | HCL/Terraform | `ext.tf` |
| `nix-mcp` | Nix | `ext.nix` |
| `dockerfile-mcp` | Dockerfile | `ext.dockerfile` |

#### Frontend frameworks (extended)

| Server | Framework | `namespacePrefix` |
|---|---|---|
| `nuxt-mcp` | Nuxt | `ext.nuxt` |
| `astro-mcp` | Astro | `ext.astro` |
| `remix-mcp` | Remix | `ext.remix` |
| `solidjs-mcp` | Solid | `ext.solid` |
| `qwik-mcp` | Qwik | `ext.qwik` |
| `ember-mcp` | Ember | `ext.ember` |
| `preact-mcp` | Preact | `ext.preact` |
| `lit-mcp` | Lit | `ext.lit` |
| `alpine-mcp` | Alpine.js | `ext.alpine` |
| `stimulus-mcp` | Stimulus | `ext.stimulus` |
| `marko-mcp` | Marko | `ext.marko` |
| `meteor-mcp` | Meteor | `ext.meteor` |
| `react-native-mcp` | React Native | `ext.rn` |
| `expo-mcp` | Expo | `ext.expo` |
| `ionic-mcp` | Ionic | `ext.ionic` |
| `tailwind-mcp` | Tailwind | `ext.tw` |
| `vite-mcp` | Vite | `ext.vite` |
| `webpack-mcp` | webpack | `ext.webpack` |
| `rollup-mcp` | Rollup | `ext.rollup` |
| `parcel-mcp` | Parcel | `ext.parcel` |
| `storybook-mcp` | Storybook | `ext.storybook` |
| `cypress-mcp` | Cypress (component testing) | `ext.cy` |
| `jest-mcp` | Jest | `ext.jest` |
| `vitest-mcp` | Vitest | `ext.vitest` |
| `playwright-component-mcp` | Playwright (component) | `ext.pwcomp` |

#### Backend frameworks

| Server | Framework | `namespacePrefix` |
|---|---|---|
| `nestjs-mcp` | NestJS | `ext.nestjs` |
| `express-mcp` | Express | `ext.express` |
| `fastify-mcp` | Fastify | `ext.fastify` |
| `koa-mcp` | Koa | `ext.koa` |
| `hapi-mcp` | Hapi | `ext.hapi` |
| `django-mcp` | Django | `ext.django` |
| `flask-mcp` | Flask | `ext.flask` |
| `fastapi-mcp` | FastAPI | `ext.fastapi` |
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
| `maud-mcp` | Maud (Rust) | `ext.maud` |

#### Databases & data stores

| Server | DB | `namespacePrefix` |
|---|---|---|
| `mcp-mysql` | MySQL / MariaDB | `ext.mysql` |
| `mcp-mariadb` | MariaDB | `ext.mariadb` |
| `mcp-redis` | Redis | `ext.redis` |
| `mcp-mongo` | MongoDB | `ext.mongo` |
| `mcp-cassandra` | Cassandra | `ext.cassandra` |
| `mcp-elasticsearch` | Elasticsearch | `ext.es` (collision with `ext.es` → renamed `ext.elastic`) |
| `mcp-opensearch` | OpenSearch | `ext.opensearch` |
| `mcp-dynamodb` | DynamoDB | `ext.dynamo` |
| `mcp-cosmosdb` | Cosmos DB | `ext.cosmos` |
| `mcp-bigquery` | BigQuery | `ext.bq` |
| `mcp-snowflake` | Snowflake | `ext.snowflake` |
| `mcp-redshift` | Redshift | `ext.redshift` |
| `mcp-databricks` | Databricks | `ext.databricks` |
| `mcp-neo4j` | Neo4j | `ext.neo4j` |
| `mcp-arangodb` | ArangoDB | `ext.arangodb` |
| `mcp-chromadb` | ChromaDB | `ext.chroma` |
| `mcp-qdrant` | Qdrant | `ext.qdrant` |
| `mcp-pinecone` | Pinecone | `ext.pinecone` |
| `mcp-weaviate` | Weaviate | `ext.weaviate` |
| `mcp-milvus` | Milvus | `ext.milvus` |
| `mcp-influxdb` | InfluxDB | `ext.influx` |
| `mcp-timescaledb` | TimescaleDB | `ext.timescale` |
| `mcp-clickhouse` | ClickHouse | `ext.clickhouse` |
| `mcp-cockroachdb` | CockroachDB | `ext.crdb` |
| `mcp-surreal` | SurrealDB | `ext.surreal` |
| `mcp-firestore` | Firestore | `ext.firestore` |
| `mcp-supabase` | Supabase | `ext.supabase` |
| `mcp-planetscale` | PlanetScale | `ext.planetscale` |
| `mcp-fauna` | Fauna | `ext.fauna` |
| `mcp-rabbitmq` | RabbitMQ | `ext.rabbit` |
| `mcp-kafka` | Kafka | `ext.kafka` |
| `mcp-nats` | NATS | `ext.nats` |
| `mcp-redis-streams` | Redis Streams | `ext.redis-streams` |
| `mcp-sqs` | AWS SQS | `ext.sqs` |
| `mcp-pulsar` | Pulsar | `ext.pulsar` |

#### Cloud & DevOps

| Server | Service | `namespacePrefix` |
|---|---|---|
| `mcp-azure` | Azure | `ext.azure` |
| `mcp-gcp` | GCP | `ext.gcp` |
| `mcp-oci` | Oracle Cloud | `ext.oci` |
| `mcp-ibm-cloud` | IBM Cloud | `ext.ibmcloud` |
| `mcp-digitalocean` | DigitalOcean | `ext.do` |
| `mcp-linode` | Linode | `ext.linode` |
| `mcp-hetzner` | Hetzner | `ext.hetzner` |
| `mcp-vultr` | Vultr | `ext.vultr` |
| `mcp-helm` | Helm | `ext.helm` |
| `mcp-terraform` | Terraform | `ext.terraform` |
| `mcp-pulumi` | Pulumi | `ext.pulumi` |
| `mcp-ansible` | Ansible | `ext.ansible` |
| `mcp-puppet` | Puppet | `ext.puppet` |
| `mcp-chef` | Chef | `ext.chef` |
| `mcp-argo` | Argo CD | `ext.argo` |
| `mcp-flux` | Flux CD | `ext.flux` |
| `mcp-spinnaker` | Spinnaker | `ext.spinnaker` |
| `mcp-github-actions` | GitHub Actions | `ext.gh-actions` |
| `mcp-circleci` | CircleCI | `ext.circleci` |
| `mcp-jenkins` | Jenkins | `ext.jenkins` |
| `mcp-gitlab-ci` | GitLab CI | `ext.gitlab-ci` |
| `mcp-travis` | Travis CI | `ext.travis` |
| `mcp-buildkite` | Buildkite | `ext.buildkite` |
| `mcp-drone` | Drone CI | `ext.drone` |
| `mcp-cloudflare` | Cloudflare | `ext.cf` |
| `mcp-vercel` | Vercel | `ext.vercel` |
| `mcp-netlify` | Netlify | `ext.netlify` |
| `mcp-fly` | Fly.io | `ext.fly` |
| `mcp-railway` | Railway | `ext.railway` |
| `mcp-render` | Render | `ext.render` |
| `mcp-heroku` | Heroku | `ext.heroku` |
| `mcp-deno-deploy` | Deno Deploy | `ext.deno-deploy` |
| `mcp-supabase-edge` | Supabase Edge Functions | `ext.sb-edge` |

#### Observability

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-sentry` | Sentry | `ext.sentry` |
| `mcp-datadog` | Datadog | `ext.datadog` |
| `mcp-grafana` | Grafana | `ext.grafana` |
| `mcp-prometheus` | Prometheus | `ext.prom` |
| `mcp-newrelic` | New Relic | `ext.nr` |
| `mcp-loki` | Loki | `ext.loki` |
| `mcp-tempo` | Tempo (tracing) | `ext.tempo` |
| `mcp-jaeger` | Jaeger | `ext.jaeger` |
| `mcp-opentelemetry` | OTel Collector | `ext.otel` |
| `mcp-logflare` | Logflare | `ext.logflare` |
| `mcp-betterstack` | Better Stack | `ext.betterstack` |
| `mcp-rollbar` | Rollbar | `ext.rollbar` |
| `mcp-bugsnag` | Bugsnag | `ext.bugsnag` |
| `mcp-honeybadger` | Honeybadger | `ext.honeybadger` |
| `mcp-pagerduty` | PagerDuty | `ext.pd` |
| `mcp-opsgenie` | Opsgenie | `ext.opsgenie` |
| `mcp-statuspage` | Statuspage | `ext.statuspage` |
| `mcp-uptime` | Uptime monitoring | `ext.uptime` |
| `mcp-pingdom` | Pingdom | `ext.pingdom` |

#### Communication, productivity, business

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-confluence` | Confluence | `ext.confluence` |
| `mcp-airtable` | Airtable | `ext.airtable` |
| `mcp-coda` | Coda | `ext.coda` |
| `mcp-clickup` | ClickUp | `ext.clickup` |
| `mcp-asana` | Asana | `ext.asana` |
| `mcp-monday` | Monday.com | `ext.monday` |
| `mcp-trello` | Trello | `ext.trello` |
| `mcp-basecamp` | Basecamp | `ext.basecamp` |
| `mcp-slack-enterprise` | Slack Enterprise | `ext.slack-ent` |
| `mcp-discord` | Discord | `ext.discord` |
| `mcp-teams` | MS Teams | `ext.teams` |
| `mcp-zoom` | Zoom | `ext.zoom` |
| `mcp-meet` | Google Meet | `ext.meet` |
| `mcp-twilio` | Twilio | `ext.twilio` |
| `mcp-sendgrid` | SendGrid | `ext.sendgrid` |
| `mcp-mailgun` | Mailgun | `ext.mailgun` |
| `mcp-postmark` | Postmark | `ext.postmark` |
| `mcp-resend` | Resend | `ext.resend` |
| `mcp-ses` | AWS SES | `ext.ses` |
| `mcp-mailchimp` | Mailchimp | `ext.mailchimp` |
| `mcp-stripe` | Stripe | `ext.stripe` |
| `mcp-paypal` | PayPal | `ext.paypal` |
| `mcp-square` | Square | `ext.square` |
| `mcp-braintree` | Braintree | `ext.braintree` |
| `mcp-adyen` | Adyen | `ext.adyen` |
| `mcp-paddle` | Paddle | `ext.paddle` |
| `mcp-chargebee` | Chargebee | `ext.chargebee` |
| `mcp-quickbooks` | QuickBooks | `ext.quickbooks` |
| `mcp-xero` | Xero | `ext.xero` |
| `mcp-freshbooks` | FreshBooks | `ext.freshbooks` |
| `mcp-zendesk` | Zendesk | `ext.zendesk` |
| `mcp-intercom` | Intercom | `ext.intercom` |
| `mcp-freshdesk` | Freshdesk | `ext.freshdesk` |
| `mcp-helpscout` | Help Scout | `ext.helpscout` |
| `mcp-zoho` | Zoho CRM | `ext.zoho` |
| `mcp-hubspot` | HubSpot | `ext.hubspot` |
| `mcp-salesforce` | Salesforce | `ext.sf` |
| `mcp-pipedrive` | Pipedrive | `ext.pipedrive` |
| `mcp-microsoft-dynamics` | MS Dynamics | `ext.dynamics` |
| `mcp-zoom-info` | ZoomInfo | `ext.zoominfo` |
| `mcp-clearbit` | Clearbit | `ext.clearbit` |
| `mcp-typeform` | Typeform | `ext.typeform` |
| `mcp-google-forms` | Google Forms | `ext.gforms` |
| `mcp-survey-monkey` | SurveyMonkey | `ext.surveymk` |
| `mcp-tally` | Tally | `ext.tally` |

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
| `mcp-webdriverio` | WebdriverIO | `ext.wdio` |
| `mcp-testcafe` | TestCafe | `ext.testcafe` |
| `mcp-codecept` | CodeceptJS | `ext.codecept` |
| `mcp-detox` | Detox (mobile) | `ext.detox` |
| `mcp-appium` | Appium | `ext.appium` |
| `mcp-maestro` | Maestro (mobile) | `ext.maestro` |
| `mcp-pact` | Pact (contract testing) | `ext.pact` |
| `mcp-wiremock` | WireMock | `ext.wiremock` |
| `mcp-mountebank` | Mountebank | `ext.mountebank` |
| `mcp-mock-server` | mock-server | `ext.mock` |

#### Build tools & package managers

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

#### AI / ML / data

| Server | Tool | `namespacePrefix` |
|---|---|---|
| `mcp-huggingface` | Hugging Face | `ext.hf` |
| `mcp-ollama` | Ollama | `ext.ollama` |
| `mcp-openai` | OpenAI | `ext.openai` |
| `mcp-anthropic` | Anthropic API | `ext.anthropic` |
| `mcp-mistral` | Mistral | `ext.mistral` |
| `mcp-gemini` | Gemini | `ext.gemini` |
| `mcp-cohere` | Cohere | `ext.cohere` |
| `mcp-replicate` | Replicate | `ext.replicate` |
| `mcp-together` | Together | `ext.together` |
| `mcp-groq` | Groq | `ext.groq` |
| `mcp-perplexity` | Perplexity | `ext.perplexity` |
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
| `mcp-dbt` | dbt | `ext.dbt` |
| `mcp-airflow` | Airflow | `ext.airflow` |
| `mcp-prefect` | Prefect | `ext.prefect` |
| `mcp-dagster` | Dagster | `ext.dagster` |
| `mcp-kedro` | Kedro | `ext.kedro` |
| `mcp-mlflow` | MLflow | `ext.mlflow` |
| `mcp-weights-biases` | Weights & Biases | `ext.wb` |
| `mcp-neptune` | Neptune.ai | `ext.neptune` |
| `mcp-label-studio` | Label Studio | `ext.labelstudio` |
| `mcp-argilla` | Argilla | `ext.argilla` |
| `mcp-ragas` | Ragas (RAG eval) | `ext.ragas` |
| `mcp-langsmith` | LangSmith | `ext.langsmith` |
| `mcp-langfuse` | Langfuse | `ext.langfuse` |

#### Security & secrets

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
| `mcp-copacetic` | Copacetic | `ext.copa` |
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

> **The 🟡 catalog is illustrative**: each entry becomes
> claimable as a discrete slice during unpause. The list is the
> **policy intent**, not a frozen inventory; P1 confirms each
> entry against the live ecosystem and removes the ones that no
> longer exist or are abandoned.

### Live tier (⛔ — runtime npm/GitHub fetch)

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

  1. **Decision: scope of the curated tier (⭐).** The user
     approves the curated catalog (~25 servers) that ships in the
     system prompt. The defaults are listed in the §"Curated tier"
     table above; the user may add, remove, or reorder before
     unpausing P2.
  2. **Decision: scope of the discoverable tier (🟡).** The user
     confirms the discoverable catalog (~200+ servers, across 9
     categories). Each 🟡 entry becomes claimable as a discrete
     slice after P2 lands; none enter the system prompt. The user
     may trim categories before unpausing.
  3. **Decision: live search policy (⛔).** The user picks the
     default for `allowDiscoverySearch` (recommended `false`; off
     until explicitly enabled). If enabled, the rate-limit budget
     (10 calls / 10 min) and per-candidate ack requirement are
     accepted as the cost of breadth.
  4. **Decision: namespace prefix taxonomy.** The user confirms
     the `ext.<category>.<tool>` contract and the
     `namespacePrefix` value for each curated entry. Collisions
     (e.g. `ext.fs` for filesystem vs `ext.fs` for F#) are
     resolved here — see the discoverable tier for renames
     already applied.
  5. **Decision: ack surface.** The user picks how
     `external_mcp_ack` surfaces in the VS Code host:
     notification + dashboard action, or host-modal dialog.
  6. **Token budget green.** A benchmark run of `overview` plus
     `external_mcp_catalog` plus the curated tier (~25 entries)
     stays under the existing budget envelope; the
     `packages/core/tests/src/lib/plugin-drift-budget.spec.ts`
     suite still passes.
  7. **Security review.** The user (or a designated reviewer) signs
     off on the
     [security risks table](#risks-and-mitigations) below and the
     proposed mitigations (workspace containment via
     `resolveWorkspaceContained`, `redactSecrets` middleware,
     mandatory version pinning, rate-limit budget for live tier).
  8. **No conflict with `f00067`.** The multi-model orchestrator's
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
- ✅ The §"Seed catalog policy" lists at least 1 ⭐ entry, at
  least 50 🟡 entries across ≥5 categories, and an explicit
  ⛔ policy. Counts at the moment of writing: 25 ⭐ entries, 200+ 🟡 entries across 9 categories (Languages & LSPs, Frontend frameworks, Backend frameworks, Databases, Cloud & DevOps, Observability, Communication/productivity, Testing & QA, Build tools, AI/ML/data, Security & secrets).

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

## Notes

- **Seed catalog tiers** (full table in §"Seed catalog policy"):
  - **Curated (⭐, ~25 entries)**: Anthropic-official servers +
    highest-signal community servers. Always in the system
    prompt via `external_mcp_catalog`.
  - **Discoverable (🟡, ~200+ entries)**: language/framework/DB/
    cloud/AI/security catalogs. LLM asks via
    `external_mcp_discover`; no network cost.
  - **Live (⛔)**: npm/GitHub search, off by default, ack-gated,
    rate-limited.
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