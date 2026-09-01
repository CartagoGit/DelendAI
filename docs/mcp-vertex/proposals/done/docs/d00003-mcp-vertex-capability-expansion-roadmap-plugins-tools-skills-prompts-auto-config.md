---
id: d00003
kind: docs
title: mcp-vertex capability-expansion roadmap — plugins, tools, skills, prompts, auto-config
status: done
date: 2026-07-23
track: roadmap+plugins+ecosystem
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - d00003 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass
---

# d00003 — capability-expansion roadmap

## goal

A single, prioritised map of everything worth adding to mcp-vertex so the
toolkit becomes "11/10 in everything": new **plugins**, new **tools inside
existing plugins**, **skills**, **prompts**, and two cross-cutting
**meta-capabilities** (auto-config packs + a project→plugin generator). Each
item is grounded in a live 2026 market scan and in what mcp-vertex already
owns, so we **reuse/refactor before we reinvent**. Prioritisation rule:
**dogfooding value first** — the things that most improve working *on
mcp-vertex itself* ship earliest, so the project keeps getting better *by
using itself*. Every standalone proposal referenced here (f00120, r00011,
r00012, f00121…f00138) is created as its own DFA-valid document; this doc is
the index and the rationale that ties them together.

## why

The market's most-adopted developer MCP servers in 2026 are GitHub, Playwright
(browser), a database server, observability (Sentry/Datadog), SonarCloud
(security/quality) and Context7 (docs) — see the sources in `## notes`.
mcp-vertex already owns the **local-code** surface (filesystem, git-local,
docs-grounding, quality/lint, deps, memory, proposals, search, conventions),
so the real opportunity is the **remote/runtime** gaps plus a few
high-leverage additions, delivered the mcp-vertex way: project-aware, gated,
SOLID, and **auto-configured on adopt**. The user's directive: create
proposals for all of it, enrich with research, propose *more* where useful,
always clean/maintainable/DRY, prioritising what makes this very project more
efficient and more powerful — and make everything either auto-configured or
trivially configurable, with **auto-config packs** so adopters never have to
hand-tune, and an **automated way to turn a project (or part of one) into a
plugin**.

## why this design

Two foundations ship **before** the scanner/agent plugins so those plugins
stay thin and uniform instead of each re-implementing subprocess+parse+probe:

- **r00012 — shared external-tool / scanner core**: one reusable runner
  (over `run-command`/command-policy), one tool-presence+install-hint probe
  (generalising `auto-agent-selector` known-providers + orchestrator-runner
  `bootstrap.discoverProviders`), one allow-listed network path (web-fetch),
  and one normalised `IFinding`/`IScanResult` shape rendered identically in
  CLI + extension. Security, deps-audit, perf, forge, browser and database all
  compose it → DRY/SOLID, no drift.
- **f00120 — project→plugin generator + wiring-doctor**: automates the exact
  6-step monorepo wiring every internal plugin needs today (tsconfig paths,
  vitest aliases, PLUGIN_DEFAULTS, release-plan PUBLISH_ORDER, preset-catalog
  membership, catalog regen) and adds a gate that fails a half-wired plugin.
  This is the "create a plugin from the project / from parts of it,
  automatically" capability, and it makes every subsequent plugin cheaper.

Then **r00011 — auto-config packs** extends the existing `PRESET_CATALOG`
(minimal→lean→standard→swarm→full→vertex) with **stack/domain packs**
(`web-app`, `backend-api`, `library`, `cli-tool`, `security-hardened`,
`data`) + `init`-time **auto-detection**, so adopters "autoconfiguran todo del
tirón" while keeping per-plugin overrides.

## non-goals

- Not a commitment to build all of it at once — this is the ordered backlog;
  each item ships as its own proposal on its own branch, gated by `validate`.
- No hosted service, no bundled ML models, no silent installs, no secrets
  written to disk or logs — every scanner/agent tool obeys the existing
  security seams (command-policy, web-fetch allow-list, containment).
- No re-implementation of capability we already ship — every candidate names
  the existing seam it reuses (orchestrator-runner brain, preset-catalog,
  PLUGIN_DEFAULTS, web-fetch, run-command/command-policy, injected-I/O).

## slices

### S1 — Wave 1: foundations + generator (ships first, unblocks the rest)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00120-project-to-plugin-generator.md`, `docs/mcp-vertex/proposals/done/refactors/r00011-auto-config-packs.md`, `docs/mcp-vertex/proposals/done/refactors/r00012-shared-external-tool-scanner-core.md`
- **Gate**: none (roadmap tracking slice)

r00012 (shared scanner core) + f00120 (project→plugin generator +
wiring-doctor) + r00011 (auto-config packs). Highest strategic leverage:
they make every later plugin thinner, uniform, and auto-configured, and they
directly deliver the user's "self-generating, self-configuring" vision.

### S2 — Wave 2: tier-1 dogfooding plugins

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00121-forge-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00122-security-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00123-refactor-codemod-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00124-semantic-search.md`
- **Gate**: none (roadmap tracking slice)

The plugins that most improve working on mcp-vertex itself: **forge**
(GitHub/GitLab PR/issues/CI — this repo lives on GitHub), **security**
(secrets + dep-CVE + SAST — promotes the internal secret lint), **refactor**
(ast-grep/ts-morph safe codemods — directly counters the documented
"merged codemods silently corrupt files" hazard), **semantic-search**
(embedding upgrade to `search` for a large repo).

### S3 — Wave 3: tier-1.5 / tier-2 plugins

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00125-browser-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00126-perf-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00127-prompt-eval-plugin.md`, `docs/mcp-vertex/proposals/done/feats/f00128-database-plugin.md`
- **Gate**: none (roadmap tracking slice)

**browser** (Playwright: E2E/screenshot/a11y for apps/web + the extension
webview; market #2), **perf** (bench/bundle-size/profiling — extends the
metrics gate), **prompt-eval / bench-providers** (evaluate a prompt across the
providers `auto-agent-selector` discovers → feeds its S4 calibration),
**database** (read-only SQL introspect+query). Then the tier-2 tail:
observability (f00129), api/openapi (f00130), changelog/release (f00131),
diagram (f00132), container (f00133), i18n (f00134), env (f00135).

### S4 — Wave 4: cross-cutting tools, skills, prompts

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00136-tools-in-existing-plugins.md`, `docs/mcp-vertex/proposals/done/feats/f00137-skills-pack.md`, `docs/mcp-vertex/proposals/done/feats/f00138-prompts-pack.md`
- **Gate**: none (roadmap tracking slice)

Cheap high-value wins that need no new plugin: **tools inside existing
plugins** (deps_audit/outdated/licenses, git_pr, quality_coverage/complexity,
search_symbol/references, docs_generate), a **skills pack** (debugging,
perf-optimization, security-hardening, incident-response, pr-review,
migrate-from-X), and a **prompts pack** (explain-this-code, write-tests-for,
review-this-diff, generate-docstrings, security-audit-this-file, optimize-this).

## acceptance

- Every candidate in this roadmap exists as its own `lint:proposals`-valid
  proposal in `ready/` (or a later status), with a named reuse seam and a
  dogfooding-value justification.
- The two foundations (r00012, f00120) and the auto-config packs (r00011) are
  authored before the scanner/agent plugins that depend on them.
- Prioritisation is explicit and dogfooding-first; each proposal states which
  existing seam it reuses and whether it needs a refactor of current code.

## notes

Market scan (user-requested): [Firecrawl — Best MCP Servers for
Developers](https://www.firecrawl.dev/blog/best-mcp-servers-for-developers),
[Builder.io — Best MCP Servers 2026](https://www.builder.io/blog/best-mcp-servers-2026),
[Skyvia — Top MCP Servers](https://skyvia.com/blog/best-mcp-servers/),
[mcpbundles](https://www.mcpbundles.com/blog/best-mcp-servers). mcp-vertex's
differentiators vs those servers: project-aware, gated by the project's own
acceptance matrix, SOLID/injected-I/O, auto-configured on adopt, and
self-improving (it works on itself using itself).
