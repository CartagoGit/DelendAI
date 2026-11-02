---
id: x00166
title: "vertex preset drift — 3-way disagreement (catalog vs its own anti-drift lint vs live config) leaves new adopters without the orchestrator by default"
kind: fix
status: done
type: proposal
track: core+preset+init+self-hosting
date: 2026-07-29
shipped-in:
    - ea9d7507 # S1-S3 — fix vertex preset drift, orchestrator now default for adopters
---

# x00166 — vertex preset drift — 3-way disagreement (catalog vs its own anti-drift lint vs live config) leaves new adopters without the orchestrator by default

## Goal

User asked why `mcpv init:default` (the primary "an AI adopts mcp-vertex in a new project" flow) never brings the orchestrator (proposals plugin) along. Root cause: `init:default` defaults to the `vertex` preset, and `vertex`'s definition in `packages/core/src/lib/plugins/preset-catalog.ts` is stale — it excludes `proposals`, `memory`, `rules`, `deps`, `notification`, `logs`, `security`, `container`, `diagram`, `env`, `forge`, `i18n`, `link-check`, `orchestrator-runner`, `prompts-pack`, `tech-debt`, `usage-tracking` (17 real, currently-loaded plugins missing) while still listing 6 phantom plugins that are NOT actually loaded (`web-fetch`, `issues`, `refactor`, `api`, `prompt-eval`, `database`). Verified against the live root `mcp-vertex.config.json`, which is the actual source of truth `vertex` claims to mirror ("Snapshot of the mcp-vertex project itself... mirrors mcp-vertex.config.json exactly"). Made worse: `tools/scripts/lint/no-preset-drift.script.ts` — the dedicated anti-drift gate whose own mission statement is "the canonical preset catalog lives at preset-catalog.ts; hand-kept mirrors are not allowed because they drift" — maintains its OWN hardcoded `PRESET_MEMBERSHIPS` mirror instead of importing the real catalog, and that mirror is a THIRD, independently-wrong version of `vertex`'s membership. Fix all three: correct `vertex`'s members to match the live config exactly, make the anti-drift lint import the real catalog instead of hand-copying it (closing the exact category of drift it exists to prevent), and verify end-to-end that a fresh `mcpv init:default` run now provisions `proposals` (and therefore the orchestrator subagent files) for every new adopter, not just mcp-vertex's own dev repo.

## why

The user was explicit: every project that adopts mcp-vertex should get the orchestrator automatically, and right now telling an AI to "implement mcp-vertex" in a fresh project does not bring it along. That's a real, adopter-facing regression in the project's own core value proposition (multi-agent orchestration), not a cosmetic issue — and it was caused by a preset definition drifting silently out of sync with the very config it claims to mirror, in a file whose own dedicated anti-drift lint should have caught it but didn't (because the lint itself hand-copied the same stale data instead of reading the canonical source).

## non-goals

- Changing init:default's default preset away from vertex, or making host-detection choose between presets automatically — out of scope; the fix is correcting what vertex itself contains, not which preset is chosen.
- Auditing every OTHER preset (minimal/lean/standard/swarm/full/stack-packs) for the same kind of drift — vertex is the one proven stale against a concrete, checkable source (the live root config); a broader pass is a separate follow-up if warranted.
- Changing which plugins mcp-vertex's own root mcp-vertex.config.json loads — that live config is treated as ground truth here, not something to edit.

## Slices

- global_gate: type

### S1 — Correct vertex preset membership to match the live root config exactly
- **Status**: done
- **Implementation**: replaced `vertex`'s 17-member list (6 phantom: web-fetch, issues, refactor, api, prompt-eval, database) with the exact 28 plugin keys read live from `mcp-vertex.config.json`'s `plugins` object. Updated the preset's own doc comment and summary string to stop claiming specific exclusions ("does not load memory/rules/deps/proposals/notification/logs") that were no longer true. Updated `preset-catalog.spec.ts`'s member-count assertions (17→28) and containment checks (added the 17 real-but-missing plugins, flipped the "not toContain" checks for proposals/memory/rules/deps/notification/logs to "toContain", added "not toContain" for the 6 phantoms).
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`
- **Gate**: type
- acceptance:
  - "vertex's members list is exactly the 28 plugin keys currently in mcp-vertex.config.json's `plugins` object (audit, auto-agent-selector, container, conventions, deps, diagram, docs, env, forge, git, i18n, link-check, logs, memory, notification, orchestrator-runner, perf, prompts-pack, proposals, quality, rules, search, security, status-marker, tech-debt, test-convention, test-policy, usage-tracking) — no more, no less."
  - "The 6 phantom plugins (web-fetch, issues, refactor, api, prompt-eval, database) are removed from vertex since they are not actually loaded by the live config."
  - "preset-catalog.spec.ts's member-count and containment assertions are updated to match reality; the stale 'proposals/memory/rules/deps/notification/logs are intentionally absent' assertions are removed since they are now present."

### S2 — Anti-drift lint imports the real catalog instead of hand-copying it
- **Status**: done
- **Implementation**: removed the script's local `PRESET_KIND` array (redeclared what `@mcp-vertex/core/public` already exports) and its hand-copied `PRESET_MEMBERSHIPS` literal object (which had ALSO been a third, independently-wrong `vertex` definition — missing 18 real plugins, listing 6 phantoms, none matching S1's fix). Both are now imported/derived: `PRESET_MEMBERSHIPS = Object.fromEntries(PRESET_KIND.map((id) => [id, resolvePresetMembers(id)]))`. This closes the drift permanently for this file — it can no longer disagree with the catalog because it no longer holds an independent copy. Bonus: the 3 stack packs (web-app, backend-api, cli-tool), previously absent from the hand-copied object entirely, are now automatically covered by the verbatim-`--plugins=` drift check too.
- **Files**: `tools/scripts/lint/no-preset-drift.script.ts`
- **Gate**: type
- acceptance:
  - "no-preset-drift.script.ts's PRESET_MEMBERSHIPS is derived by calling resolvePresetMembers per PRESET_KIND (imported from @mcp-vertex/core), not hand-maintained as a literal object — removing the exact category of drift this script's own mission statement says is not allowed."
  - "bun tools/scripts/lint/no-preset-drift.script.ts still exits 0 on the current (post-S1) repo state."
  - "Existing test coverage for the script's drift-detection behavior (docs/web/vscode prose scanning) is unchanged and still green."

### S3 — End-to-end verification: a fresh init:default now provisions the orchestrator for new adopters
- **Status**: done
- **Implementation**: reproduced live (not just asserted) via the existing `init-default.command.spec.ts` end-to-end suite — a real `--dry-run` run against a fresh tmpdir now lists `mcp-vertex-orchestrator.md`/`.agent.md` and all 4 bounded subagents in BOTH `.claude/agents/` and `.github/agents/`, plus a scaffolded `f00001-adopt-mcp-vertex-...md` proposal, and `proposals`/`memory`/etc. are all present (previously undefined) in the rendered `mcp-vertex.config.json`. Updated that spec's plugin-presence assertions (flipped proposals/memory to defined, issues/web-fetch to undefined) and `init-render.service.spec.ts`'s equivalent standalone-render test to the same 28-member reality. Also caught and fixed a third, previously-undiscovered copy of the same stale assumption in `apps/web/scripts/__tests__/preset-table.spec.ts` (the `/es/presets` docs page's own test), which would otherwise have failed after S1.
- **Files**: `packages/cli/src/lib/init/init-default.command.spec.ts`, `packages/cli/src/lib/init/init-render.service.spec.ts`, `apps/web/scripts/__tests__/preset-table.spec.ts`
- **Gate**: type
- acceptance:
  - "Running mcpv init:default --dry-run against a fresh workspace lists .claude/agents/mcp-vertex-orchestrator.md, .github/agents/mcp-vertex-proposal-guardian.agent.md (and siblings), and proposals-plugin config among the files/plugins it would create — reproduced live, not just asserted in a unit test."
  - "A new or updated spec case pins that resolvePresetMembers('vertex') (the preset init:default uses) contains 'proposals', preventing this exact regression from recurring silently."

## acceptance

- vertex's members list is exactly the 28 plugin keys currently in mcp-vertex.config.json's `plugins` object (audit, auto-agent-selector, container, conventions, deps, diagram, docs, env, forge, git, i18n, link-check, logs, memory, notification, orchestrator-runner, perf, prompts-pack, proposals, quality, rules, search, security, status-marker, tech-debt, test-convention, test-policy, usage-tracking) — no more, no less.
- The 6 phantom plugins (web-fetch, issues, refactor, api, prompt-eval, database) are removed from vertex since they are not actually loaded by the live config.
- preset-catalog.spec.ts's member-count and containment assertions are updated to match reality; the stale 'proposals/memory/rules/deps/notification/logs are intentionally absent' assertions are removed since they are now present.
- no-preset-drift.script.ts's PRESET_MEMBERSHIPS is derived by calling resolvePresetMembers per PRESET_KIND (imported from @mcp-vertex/core), not hand-maintained as a literal object — removing the exact category of drift this script's own mission statement says is not allowed.
- bun tools/scripts/lint/no-preset-drift.script.ts still exits 0 on the current (post-S1) repo state.
- Existing test coverage for the script's drift-detection behavior (docs/web/vscode prose scanning) is unchanged and still green.
- Running mcpv init:default --dry-run against a fresh workspace lists .claude/agents/mcp-vertex-orchestrator.md, .github/agents/mcp-vertex-proposal-guardian.agent.md (and siblings), and proposals-plugin config among the files/plugins it would create — reproduced live, not just asserted in a unit test.
- A new or updated spec case pins that resolvePresetMembers('vertex') (the preset init:default uses) contains 'proposals', preventing this exact regression from recurring silently.
