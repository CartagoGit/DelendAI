<div align="center">

<img src="../../apps/shared/brand/logo.svg" alt="DelendAI" width="88" height="88">

# DelendAI documentation

**Every guide in this repository, and the order worth reading them in.**

</div>

---

## Pick the road you are on

Four people arrive at this directory, and they do not need the same
pages. Find yourself below; each row is a complete path, in order.

### I want to **use** DelendAI in my project

1. [Using DelendAI](README-DELENDAI.md) — install, register it with your
   client, the CLI arguments, the built-in tools.
2. [Presets](presets.md) — which curated set to start from, and what each
   one is for.
3. [Configuration Center](CONFIGURATION-CENTER.md) — every setting the
   runtime reads, and which source wins when two disagree.
4. [Cross-IDE](CROSS-IDE.md) and [Cross-project setup](CROSS-PROJECT-SETUP.md)
   — the same server from VS Code, Cursor, Claude Code, Codex, and from
   more than one repository.

### I want to **extend** it with my own capabilities

1. [Writing a plugin](PLUGINS-DELENDAI.md) — the contract, the tools, the
   permissions, the scaffolding.
2. [Plugin configuration guide](PLUGIN-CONFIGURATION-GUIDE.md) — how a
   plugin receives values, and how not to invent a second config system.
3. [Envelopes](ENVELOPES.md) — the response shape every tool returns, and
   why it is the same one everywhere.
4. [Stable API](STABLE-API.md) and [Deprecation policy](DEPRECATION-POLICY.md)
   — what you may depend on, and what happens when it changes.
5. [Extension authoring](EXTENSION-AUTHORING.md) — going beyond plugins,
   into the IDE surface.

### I want to **understand** how it is built

1. [Architecture](ARCHITECTURE.md) — layers, contracts, request flow, the
   invariants, with diagrams.
2. [Code map](CODE-MAP.md) — where each thing lives, so you can stop
   grepping.
3. [Vision and operating model](VISION-AND-OPERATING-MODEL.md) — the north
   star, the growth rule, the two speeds, the dogfooding loop.
4. [Shared-develop model](SHARED-DEVELOP-MODEL.md) — how many agents work
   one repository without colliding.

### I want to **work in this repository**

1. [AGENT-BOOTSTRAP](AGENT-BOOTSTRAP.md) — the only place agent rules
   live. Read it once per session; everything else defers to it.
2. [Repo rules](REPO-RULES.md) and [File conventions](FILE-CONVENTIONS.md)
   — the shape a file must have before a gate will accept it.
3. [Development strategies](DEVELOPMENT-STRATEGIES.md) — how a change
   travels from a worktree to `main`.
4. [CI gates](CI-GATES.md) — what each gate asserts, and why it exists.
   None of them are decoration.
5. [Publishing](NPM_PUBLISH.md) — how a release is cut. It is asked for,
   never a side effect of landing code.

---

## Every guide

> The table below is generated from the files themselves — the guides in
> `docs/` and `docs/delendai/`, with each one's own heading and opening
> line. Do not edit it by hand: run `bun run docs:index`. Proposals and
> generated plugin pages are indexed by their own catalogues, not here.

<!-- BEGIN GENERATED: docs-index -->
| Guide | What it covers |
| --- | --- |
| [Pages Audit](../PAGES-AUDIT.md) | This audit covers 44 tracked Astro page files under apps/web/src pages by enumerating both root files and nested routes. |
| [Attribution policy](../PRIVACY.md) | This document describes the rules this repository follows to keep LLM |
| [Adopting `delendai` from another workspace](ADOPTER-SURFACE-MODE.md) | Quick reference for someone wiring `delendai` into a project |
| [Universal agent bootstrap — `@delendai/core`](AGENT-BOOTSTRAP.md) | This file is the only place agent rules live. Every host instruction |
| [Architecture — `@delendai/core`](ARCHITECTURE.md) | How the monorepo fits together, what the boundaries are, and which invariants hold |
| [Brand contract — *DelendAI* / `delendai`](BRAND.md) | This document is the single source of truth for how the brand is spelled, |
| [Checkpoint advisories](CHECKPOINT-ADVISORIES.md) | Host-agnostic quality + compute protection. |
| [CI Gates](CI-GATES.md) | This document defines which local validations block pull requests in GitHub Actions and which checks must be marked as required on protected branches. |
| [`delendai://code-map` resource](CODE-MAP.md) | Track H of q00006. |
| [Configuration Center](CONFIGURATION-CENTER.md) | The Configuration Center is the schema-driven project editor included in the |
| [Core -> proposals boundary inventory](CORE-PROPOSALS-BOUNDARY-INVENTORY.md) | Inventario ejecutable de acoplamientos presentes hoy en packages/core/src. |
| [`@delendai/core` public API inventory](CORE-PUBLIC-API-INVENTORY.md) | Total exports: 747 |
| [Cross-IDE guide — building a new `@delendai/<ide>` host](CROSS-IDE.md) | The VS Code extension is the reference implementation of an |
| [Cross-project setup](CROSS-PROJECT-SETUP.md) | This is the canonical guide for wiring `@delendai/core` into any repository and getting the GitHub `issues` plugin ready for that repo. |
| [Dependency Versions Policy](DEPENDENCY-VERSIONS.md) | This document is the single source of truth for shared dependency version drift |
| [Deprecation policy](DEPRECATION-POLICY.md) | This document codifies the project's deprecation contract. |
| [Development strategies](DEVELOPMENT-STRATEGIES.md) | This is the canonical explanation of how work reaches the integration |
| [Documentation manual vs generated](DOCS-MANUAL-VS-GENERATED.md) | Track H of q00006. |
| [Envelopes — shared result shapes](ENVELOPES.md) | Track M / q00006 §46 — close the audit finding "each plugin defines its |
| [Extension Authoring](EXTENSION-AUTHORING.md) | This guide is the public contract for building an IDE host for |
| [Feature flags (f00152 S5 — L3)](FEATURE-FLAGS.md) | Feature flags are how `@delendai/core` and its plugins evolve |
| [File conventions](FILE-CONVENTIONS.md) | Companion to `AGENTS.md` and the `f00037` proposal. |
| [Branch protection governance — `develop` & `main`](GOVERNANCE-BRANCH-PROTECTION.md) | Owner: repository administrators. |
| [IDE Extension](IDE-EXTENSION.md) | The `@delendai` IDE extension ships as a VS Code extension today and |
| [MCP logs](LOGS.md) | The `@delendai/logs` plugin persists an append-only JSONL event log under |
| [Agent Loop Detection & Handoff Protocol](LOOP-DETECTION.md) | This document defines the in-process loop detection and handoff protocol implemented in `@delendai/core` via the `proposals` and `notification` plugins. |
| [Model Catalog](MODEL-CATALOG.md) | `InMemoryModelCatalog` is a synchronous, process-local catalog of model descriptors. |
| [Publishing `@delendai/*` to npm — step-by-step guide](NPM_PUBLISH.md) | Everything is prepared so you only need to run these steps with your account. |
| [Plugin configuration guide — delendai for LLMs](PLUGIN-CONFIGURATION-GUIDE.md) | Source of truth: the server. This guide does not enumerate the full list |
| [Creating plugins for delendai](PLUGINS-DELENDAI.md) | A plugin is an npm package (or a local module) that adds tools, prompts, |
| [Project observability — KPIs, economics and dogfooding](PROJECT-OBSERVABILITY.md) | The `@delendai/project-kpis` plugin turns delendai's own telemetry into |
| [@delendai/core](README-DELENDAI.md) | A project-agnostic core for building MCP servers, plus a CLI that loads |
| [Repo-level rules — `@delendai/core`](REPO-RULES.md) | Read this only if the host you are running in reads a |
| [Shared-develop operating model](SHARED-DEVELOP-MODEL.md) | Superseded for the integration question. This document was written |
| [Stable API (f00152 S2 — L4)](STABLE-API.md) | The Stable API Surface is a small, named subset of tools that the |
| [Token Budgets — generated dashboard](TOKEN-BUDGETS.md) | Generated from the current repository measurements; timestamps are intentionally omitted for deterministic diffs. |
| [Debt: exported types and constants outside contracts](TYPES-IN-CONTRACTS-DEBT.md) |  |
| [Vision & Operating Model](VISION-AND-OPERATING-MODEL.md) | A short north-star document. |
| [Coverage ratchet policy](coverage-ratchet.md) | `vitest.config.ts` (`test.coverage.thresholds`) is a no-regression gate, |
| [Host Compatibility Matrix — MCP surface & capabilities](host-compatibility-matrix.md) | Canonical reference for the stable `surfaceMode` policy. |
| [Preset derivation](presets.md) | `packages/core/src/lib/plugins/preset-catalog.ts` is the single source of truth |
| [Remote Provider Diagnostics](remote-providers.md) | This document describes the conceptual integration for reusable remote CI |
| [Runtime Observability](runtime-observability.md) | `delendai` emits a host-neutral runtime stream outside MCP stdio: |
<!-- END GENERATED: docs-index -->

---

## Where documentation is NOT

| | |
| --- | --- |
| `docs/delendai/proposals/**` | The work itself — plans, slices, verdicts. Indexed by the proposals tooling, not by this page. |
| `docs/delendai/plugins/auto-generated/**` | One page per plugin, produced from the live manifests. |
| `docs/delendai/generated/**` | Generator output. Read it, never edit it. |
| `docs/delendai/wiki/**` | Working notes and external material. |

The rule that decides which of those a new fact belongs in is
[Documentation manual vs generated](DOCS-MANUAL-VS-GENERATED.md), and it
is short: if the repository can produce the fact on demand, it is
generated; if it takes judgment, it is written.
