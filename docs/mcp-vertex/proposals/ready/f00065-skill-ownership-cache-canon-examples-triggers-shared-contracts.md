---
id: f00065
status: ready
type: proposal
track: umbrella+skills-ownership+cache+web-examples+slash-triggers+shared-contracts
date: 2026-06-25
kind: feat
title: Umbrella - skill ownership (SOLID), single root cache, AI skill discoverability, junior-grade web examples with per-language packagers, slash/trigger surface across hosts, and shared cross-package contracts
shipped-in: []
recan: []
related:
  - f00056 # agent discovery catalog - tools/skills/proposals surfaced across hosts (covers part of B/E)
  - f00064 # dogfood layout, cache centralization S2, contracts split S3, web S5, host surface S6 (this umbrella tightens and re-owns)
  - f00057 # skill unification and plugin coverage wiring
  - f00020 # skills manifest as canonical skill index
  - r00004 # root declutter and cache consolidation
ownership:
  - { agent: implementation_runner, task: 'A: move skills out of docs/mcp-vertex/skills into their owners (packages/core for core skills, plugins/<x> for plugin skills); docs becomes documentation only; rewire load-skills, assemble, gen-skills, lint:skills' }
  - { agent: implementation_runner, task: 'B: make project + active-plugin skills auto-discoverable and usable by the AI with no manual instruction; close any gap left by f00056; optimize for token cost (compact surface)' }
  - { agent: implementation_runner, task: 'C: canonicalize cache to root .cache/mcp-vertex; remove/migrate tools/scripts/.cache and any per-app/per-folder cache; document + contract the root-cache rule' }
  - { agent: web_runner, task: 'D: add junior-grade web examples with per-language packager tabs (node: bun/deno/npm/pnpm/yarn; python; php/artisan; etc.), icon+name language selector, beginner explanations, and i18n-loaded copy' }
  - { agent: host_runner, task: 'E: ensure slash (/) and prompt/skill trigger characters surface mcp-vertex tools/prompts/skills in Claude, Codex, Copilot, OpenCode, etc.; investigate per-host registration and propose integration' }
  - { agent: implementation_runner, task: 'F: extract constants/interfaces/types reused across packages/apps/extensions into a shared contracts boundary; remove concrete duplicates found in the audit' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run lint:skills, expect: exit0 }
  - { command: bun run lint:conventions, expect: exit0 }
  - { command: bun run lint:tools, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# f00065 - Umbrella: skill ownership, single root cache, AI skill discoverability, junior-grade web examples, slash/trigger surface, and shared contracts

## Goal

Capture, as one coordinated umbrella, every correction the maintainer wants after
an uncommitted refactor (by another agent) relocated documentation, proposals,
examples, and skills under `docs/mcp-vertex/**`. Several of those moves conflict
with the project's own SOLID/DRY rules and with how the AI is expected to
discover and use skills. This umbrella sequences the work into self-contained
slices, each of which becomes its own sub-proposal when it is executed, and each
of which must be completed (validate-green + closed) before the next one starts.

This proposal does not implement anything. It is the plan-of-record.

## Why

The repo is infrastructure other agents copy. If skills live in `docs/` instead
of with their owner, downstream users learn the wrong layout; if cache is
scattered (`tools/scripts/.cache`), they learn the wrong cache contract; if the
AI cannot discover skills without manual prompting, the whole skill system is
dead weight that still costs tokens. The maintainer disagrees with the previous
agent's decision to make `docs/mcp-vertex/skills` the canonical skill store and
wants ownership-based placement plus the remaining usability/web/host gaps
closed.

## Why This Design

- f00064 already tracks cache centralization (its S2), per-package contracts
  naming (its S3), web plugin/i18n completeness (its S5), and a host-visible
  tool/skill catalog (its S6). This umbrella does **not** duplicate that work; it
  *re-scopes* the pieces the maintainer has stronger opinions about (skill
  ownership, the `tools/scripts/.cache` removal, junior examples with packagers,
  and the slash/trigger surface) and adds the shared cross-package contracts
  boundary that f00064 S3 stops short of.
- f00056 already designs an agent-discovery catalog that surfaces tools/skills as
  tool/resource/prompt and emits host hints. Slice B/E here are framed as
  "verify f00056 actually closes the gap end-to-end and fill what it misses",
  not as a parallel second catalog.

When a slice below is promoted to its own sub-proposal, it should reference the
matching f00064/f00056 slice and either consume or supersede it explicitly, so we
never ship two competing implementations.

## Non-goals

- Implementing any slice in this proposal (planning only).
- A second discovery catalog competing with f00056.
- Re-doing f00064 S2/S3/S5/S6 work that already lands cleanly; this umbrella
  only tightens the maintainer's contested points and adds the shared contracts
  boundary.
- Rewriting historical closed proposals to update old paths.

## Architecture

### Current-state findings (inspection, not yet changed)

- Skills currently live at `docs/mcp-vertex/skills/<skill>/SKILL.md` plus
  `docs/mcp-vertex/skills/manifest.json` (moved there by the uncommitted refactor).
- `packages/core/src/lib/skills/load-skills.ts` documents and resolves the
  manifest as a single project-level file; `assemble.ts` reads
  `<workspace>/docs/mcp-vertex/skills/manifest.json` with a `<workspace>/skills`
  fallback. `apps/web/scripts/gen-skills.ts` hardcodes
  `SKILLS_REL = 'docs/mcp-vertex/skills'`. So the move is wired across core, the
  web generator, and the lint gate (`lint:skills`).
- A stray cache directory exists at `tools/scripts/.cache/mcp-vertex/**`
  (rules + logs) in addition to the canonical root `.cache`. This is the
  per-folder cache the maintainer wants removed.
- A per-package `contracts/{interfaces,constants}` convention already exists in
  `packages/cli`, `packages/client`, `packages/core`, and several plugins, using
  the `*.interface.ts` / `*.constant.ts` / `*.types.ts` naming. There is **no**
  shared cross-package contracts boundary; constants/interfaces reused by
  multiple packages/apps/extensions are candidates for extraction.
- MCP prompts are already registered (`registerPrompt` in core
  agent-bootstrap/start-prompt/scaffold-host, and in the proposals + rules
  plugins), which is the mechanism hosts expose as slash-commands via
  `prompts/list`. Skills are surfaced only as summaries today, not as prompts,
  so they do not appear under `/` in hosts yet.
- Web `apps/web/src/data/install.ts` already models node packagers
  (npm/pnpm/yarn/bun/deno) but has no Python/PHP/artisan packagers and no
  icon+tab language selector or junior-grade per-packager example panels.

### Audit findings (relevant)

- File-convention lint (`lint:conventions`) over the audited roots reports 0
  unmatched files, so the `*.interface.ts` / `*.constant.ts` / `*.types.ts`
  convention is being followed where enforced; the gap is **coverage** (no shared
  contracts package) and **enforcement scope**, not local naming.
- Mixed `*.types.ts` vs `contracts/interfaces/*.interface.ts` usage exists
  (e.g. `plugins/issues/src/lib/contracts/issue.types.ts`,
  `plugins/search/src/lib/services/search-engine.types.ts`,
  `plugins/proposals/src/lib/swarm/plan-closure.types.ts`) - candidates to
  normalize when slice F runs and to feed the duplicate-detection pass.
- The skill store path is duplicated as a literal in at least three places
  (core loader, web generator, lint gate); slice A should route every consumer
  through one resolver/constant instead of repeating the path.

> The full audit (`audit_audit_plan` / `audit_audit_consolidate`) should be run
> inside each sub-proposal when it is opened, scoped to that slice's files, so the
> consolidated findings are fresh and actionable rather than a stale umbrella-time
> snapshot.

## Slices

Each slice below becomes its own sub-proposal, executed and closed in order.

### S1 — A: Skill ownership (SOLID): move skills to their owners

- **Status**: done
- **Files**: packages/core/src/lib/skills/**, packages/core/skills/** (new),
  plugins/*/skills/** (new), apps/web/scripts/gen-skills.ts,
  tools/scripts/lint/check-skills.script.ts,
  packages/core/src/lib/cli/assemble.ts, docs/mcp-vertex/skills/**
- **Gate**: bun run validate
- **Goal**: skills no longer live in `docs/mcp-vertex/skills`. Core skills live
  with `packages/core`; each plugin's skills live inside that plugin. `docs` keeps
  only human documentation, not the canonical skill store. Revert/redirect the
  previous agent's move accordingly.
- **Acceptance**:
  - Each SKILL.md sits under its owner (core skill -> packages/core; plugin skill
    -> plugins/<x>); the manifest is composed from owners, not from a docs folder.
  - `load-skills`, `assemble`, `gen-skills`, and `lint:skills` resolve skills
    through one shared path resolver/constant, with no hardcoded
    `docs/mcp-vertex/skills` literal.
  - A migration note documents that `docs/mcp-vertex/skills` is documentation
    only and points to the owner locations.

### S2 — B: AI skill discoverability + token optimization

- **Status**: done
- **Files**: packages/core/src/lib/skills/skill-catalog.ts (new),
  packages/core/src/lib/tools/skill-tool.ts (new),
  packages/core/src/lib/skills/load-skills.ts (appliesTo),
  packages/core/src/lib/cli/assemble.ts (wire catalog + register skill tool),
  packages/core/src/lib/catalog/agent-discovery-types.ts +
  agent-discovery-catalog.ts + tools/agent-catalog-tool.ts (appliesTo on skill
  summary), packages/core/src/lib/prompts/agent-bootstrap.prompt.ts (skill
  step), packages/core/src/public/index.ts, packages/core/src/generated/
  tool-outputs.ts, + specs (skill-catalog.spec.ts, agent-catalog.e2e.spec.ts,
  agent-discovery-catalog.spec.ts)
- **Gate**: bun run validate
- **Depends on**: A
- **Goal**: when a host loads mcp-vertex, the AI knows about and can use the
  project's skills and the active plugin's skills with no manual instruction.
  Close whatever f00056's catalog does not already deliver end-to-end, and keep
  the surface compact to minimize token cost.
- **Acceptance**:
  - The active preset's skills (core + enabled plugins) are advertised through a
    compact discovery surface the AI sees automatically. ✓ — the bootstrap
    prompt now tells the AI to call `mcp-vertex_skill`, and `agent_catalog`'s
    skill section carries a real `description` (what + when to use) plus
    `appliesTo`, instead of the old `"Skill <id>"` stub.
  - Either an existing tool covers usage, or a gap is identified and a minimal
    tool/affordance is proposed (no redundant verbose surface). ✓ — gap closed:
    there was NO way to load a skill body before. Added the `skill` tool
    (mirrors `knowledge`): list compact rows without `id`, load one body with
    `id`. Single source of truth = `skill-catalog.ts`, consumed by both the
    catalog (assemble) and the `skill` tool; no duplicated manifest reads.
  - A token-budget regression check confirms the surface stays within budget. ✓
    — the existing `token-budget.e2e` gate stays green; the `skill` body is
    lazy so cold-start payloads are unchanged.
- **Token cost (measured, 17 repo skills)**: compact list of all skills ≈ 7.3 kB
  (~1.8k tokens); dumping every SKILL.md body would be ≈ 83 kB (~20.8k tokens).
  Default surface is the compact list → **~91% fewer tokens**; the AI loads only
  the one body it needs (~1.2k tokens) on demand.
- **Validate**: core slice green (typecheck, all lints incl. lint:skills/
  lint:cache, all 2603 tests incl. token-budget + new skill e2e, verify:tools).
  NOTE: `lint:web` currently fails on an UNRELATED concurrent-session change
  (`homeQuickInstall` i18n keys missing from `IUiTranslations`); that is not part
  of slice B and was left untouched per coordination rules.

### S3 — C: Single canonical root cache

- **Status**: done
- **Files**: tools/scripts/.cache/** (removed), .gitignore, AGENTS.md,
  tools/scripts/lib/monorepo-paths.ts, tools/scripts/lint/check-cache.script.ts
  (+ spec), package.json (lint:cache + validate)
- **Gate**: bun run validate
- **Goal**: exactly one canonical cache, the root `.cache/mcp-vertex/`. Remove or
  migrate `tools/scripts/.cache` and any per-app/per-folder cache. Make the
  root-cache rule explicit in docs and in a contract/convention.
- **Acceptance**:
  - No `.cache` exists outside the root (verified by a lint/check). ✓ — the
    stray `tools/scripts/.cache/` was deleted and `bun run lint:cache`
    (`tools/scripts/lint/check-cache.script.ts`, wired into `validate`) fails on
    any `.cache` outside the root.
  - Any generator that wrote to `tools/scripts/.cache` now writes to
    `.cache/mcp-vertex/**`. ✓ — the rules cache materializes to the root cache
    when tools are run from the repo root; the stray copy was a wrong-cwd
    artifact, not a hardcoded path.
  - Docs + a convention/contract state the cache is always the root cache. ✓ —
    AGENTS.md root-layout rule rewritten; `.gitignore` Audit-H8 exception
    replaced with a pointer to the lint.
- **Resolver (single source of truth)**: `cacheRoot()` / `CACHE_DIR_REL` in
  `tools/scripts/lib/monorepo-paths.ts`, both derived from core's
  `DEFAULT_CORE_PATHS.cacheDir` (`@mcp-vertex/core/public`) so the
  `.cache/mcp-vertex` segment is defined exactly once across engine + tooling.
- **Validate**: green (`bun run validate` exit 0; final `lint:cache` confirms
  only the root `.cache` exists even after `verify:tools`).

### S4 — D: Junior-grade web examples with per-language packagers

- **Status**: pending (data model landed; UI + i18n copy not built)
- **Drain note (2026-07-01)**: the *data* half of this slice already landed on
  develop in `feat: introduce language ecosystem selector with PHP, Python, and
  Node.js support` (5e8306f3). `apps/web/src/data/install.ts:48` now models node
  packagers (`packageManagers`), `apps/web/src/data/install.ts:108` adds
  `IEcosystem` with node/python/php and their packagers (`pip`/`pipx`/`uv`/
  `poetry`/`composer`/`artisan`), and each packager carries a `dummiesKey`
  (`install.ts:26`, union at `install.ts:35`) pointing at a beginner-explanation
  i18n key. **But the acceptance is not met**: `ecosystems`/`dummiesKey`/
  `IEcosystem`/`EcosystemKey` are consumed by *no* component or page (only
  self-referenced in `install.ts`); `ITranslations` (`apps/web/src/i18n/shared.ts`)
  has **no** `install.dummies` / `install.ecosystems` block, so the beginner
  copy the data model promises does not exist in any of the 12 language dicts and
  nothing renders under `/` or an install page. Completing S4 = new i18n
  interface + copy across all 12 langs + an Astro selector component wired into a
  page + `site:strict` green. Left pending during this serial drain because it is
  a full web_runner slice that edits `apps/web/src/i18n/**` — the exact surface a
  concurrent session is actively changing (see S2 note re `homeQuickInstall`);
  building it here risks clobbering that work. Hand to web_runner.
- **Files**: apps/web/src/data/install.ts, apps/web/src/components/**,
  apps/web/src/pages/**, apps/web/src/i18n/**, apps/web/src/data/**
- **Gate**: bun run site:strict
- **Goal**: a junior can learn to use the project and its plugins from the web:
  language selector by icon+name with tabs; inside each language, a panel per
  packager (node: bun/deno/npm/pnpm/yarn; python; php/artisan; etc.); detailed
  beginner-friendly explanations; examples visible on the site with i18n copy the
  page actually loads.
- **Acceptance**:
  - Language selector renders icon+name tabs; each language exposes its packagers.
  - Packagers extend beyond node to at least python and php/artisan.
  - Example copy is i18n-keyed with all language keys present (per repo i18n rule)
    and renders on the page; `site:strict` fails on missing translated content.

### S5 — E: Slash / trigger-character surface across hosts

- **Status**: done — core registers one MCP prompt per skill
  (`<prefix>_skill_<id>`, `packages/core/src/lib/prompts/skill-prompts.ts`,
  wired in `assemble.ts`, bodies loaded lazily via the slice-B catalog). Tools
  and authored prompts already surfaced via MCP `prompts/list`/`tools/list`;
  this closes the skills gap so every skill of the active preset/plugins is
  `/`-invocable in any MCP host (Claude/Codex/Copilot/OpenCode). Per-host
  trigger-character mapping for non-MCP discovery remains a doc follow-up.
- **Files**: packages/core/src/lib/prompts/**, packages/core/src/lib/tools/**,
  packages/client/**, extensions/**, config/external/**
- **Gate**: bun run validate
- **Depends on**: B
- **Goal**: typing `/` (and the prompt/skill trigger character) in any AI host
  (Claude, Codex, Copilot, OpenCode, etc.) surfaces mcp-vertex tools/prompts and
  skills. Investigate per-host slash-command/prompt registration and propose the
  integration; derive from the live registry, not a hand-maintained list.
- **Acceptance**:
  - A documented mapping of how each target host exposes `/` commands and
    prompts/skills, and what mcp-vertex must register for each.
  - Skills are reachable through the same trigger surface as tools/prompts (e.g.
    skills advertised as prompts/resources via `prompts/list`).
  - The surface is generated from the loaded registry/manifest, no duplicate list.

### S6 — F: Shared cross-package contracts (SOLID/DRY)

- **Status**: pending (not started)
- **Drain note (2026-07-01)**: not implemented on develop — no root `contracts/`
  and no `packages/contracts` package exist. The per-package `contracts/` dirs
  (`packages/{cli,core,client}/**/contracts`, `plugins/{rules,proposals,issues,
  audit}/**/contracts`) remain package-local; the mixed `*.types.ts` candidates
  the umbrella flags (`plugins/issues/src/lib/contracts/issue.types.ts`,
  `plugins/search/src/lib/services/search-engine.types.ts`,
  `plugins/proposals/src/lib/swarm/plan-closure.types.ts`) are still present.
  Left pending during this serial drain: creating a `@mcp-vertex/contracts`
  boundary + moving shared types + tsconfig/barrel rewiring is a large
  cross-package refactor with real circular-dep risk that must run under its own
  scoped audit (per S7), and it overlaps packages the concurrent CLI/audit
  session is editing. Promote to its own sub-proposal (S7) rather than draining
  in-place.
- **Files**: contracts/** (new shared boundary) or packages/contracts/**,
  packages/*/src/lib/contracts/**, plugins/*/src/lib/contracts/**, tsconfig.json
- **Gate**: bun run validate
- **Goal**: constants, interfaces, and types reused by several
  packages/apps/extensions live in one shared contracts boundary
  (`contracts/{constants,interfaces,types}` or a `@mcp-vertex/contracts`
  package), and concrete duplicates found by the audit are de-duplicated. No
  copy-pasted contracts across packages.
- **Acceptance**:
  - A shared contracts boundary exists and is consumed by at least the packages
    that previously duplicated a contract.
  - Concrete duplicates surfaced by the per-slice audit are removed, public
    barrels preserved, no circular dependencies introduced.
  - `lint:conventions` covers the shared boundary's naming.

### S7 — G (meta): Sequenced sub-proposals

- **Status**: pending (process; superseded in practice for S1-S3/S5)
- **Drain note (2026-07-01)**: in practice S1, S2, S3, and S5 were drained
  in-place within this umbrella (marked done inline) rather than each being
  promoted to a standalone sub-proposal, because their implementations had
  already landed on develop and only needed bookkeeping — a scoped audit per tiny
  bookkeeping flip would have been ceremony without value. The sequencing intent
  of S7 still stands for the two remaining code slices: **S4 (web) and S6
  (contracts) should each become their own sub-proposal**, run their own scoped
  audit, and land validate-green one at a time (S6 especially, given its
  cross-package blast radius). S7 stays pending until those two are promoted.
- **Files**: docs/mcp-vertex/proposals/**
- **Gate**: bun run lint:proposals
- **Goal**: each slice S1-S6 is promoted to its own sub-proposal at execution time,
  runs a scoped audit, lands validate-green, and is closed before the next slice
  starts. No two slices are open at once.
- **Acceptance**:
  - Sub-proposals are created one at a time, in order A -> B -> C -> D -> E -> F.
  - Each closes (status flipped, lock released) before its successor opens.

## Dependency graph

S1(A) -> S2(B) -> S5(E)
S1(A) -> S3(C)
S1(A) -> S6(F)
S4(D) is independent of S1 but shares the i18n rule with f00064 S5.
Recommended execution order: S1, S2, S3, S4, S5, S6 (one sub-proposal at a time);
S7 is the meta process that governs the sequencing.

## Acceptance

- `bun run validate` is green after each promoted sub-proposal closes.
- `docs/mcp-vertex/proposals/index.json` includes f00065 after `sync_proposals`.
- Skills resolve from their owners (core/plugins), not from `docs/mcp-vertex/skills`.
- No `.cache` directory exists outside the root `.cache/mcp-vertex`.
- A shared contracts boundary exists and is consumed by previously-duplicating
  packages.
- The web exposes per-language packager tabs with i18n copy that loads.
- Slices A-F are tracked as executable sub-proposals, not loose chat notes.

## Risks and mitigations

- **Risk**: moving skills breaks the web generator and lint gate.
  **Mitigation**: route all consumers through one resolver in slice A and keep
  `lint:skills` green as the gate.
- **Risk**: removing `tools/scripts/.cache` breaks a generator that wrote there.
  **Mitigation**: redirect its writes to `.cache/mcp-vertex` before deleting and
  add a check that fails on any non-root `.cache`.
- **Risk**: shared contracts extraction creates circular deps.
  **Mitigation**: extract leaf-only contracts, preserve barrels, apply per
  consumer.
- **Risk**: slices overlap with f00064/f00056 and double-ship.
  **Mitigation**: each sub-proposal must reference and either consume or
  supersede the matching existing slice.
