---
id: l117
status: ready
type: proposal
track: skills+plugins+docs
date: 2026-06-21
kind: feat
title: Versioned skills/prompts + opt-in @mcp-vertex/web plugin
---

# l117 — Versioned skills/prompts + opt-in `@mcp-vertex/web` plugin

## Goal

Close the master audit's `[ ]` on *"Skills/prompts versionados
(operator, swarm-runner, plugin-author…); plugin `web`/`fetch`"* (line 281)
by:

1. **Versioning** the existing in-repo skills (`mcp-vertex-plugin-authoring`,
   `mcp-vertex-failure-modes`) and adding the missing ones
   (`mcp-vertex-operator`, `proposal-swarm-runner`, `state-repair-playbook`,
   `token-budget-playbook`, `concurrency-patterns`).
2. Shipping an **opt-in `web`/`fetch` plugin** that lets the agent fetch a
   URL with an allow-list, parse it, and feed the result back through a
   single tool — without replacing or duplicating `fetch_webpage` for the
   host.

## Why

- The audit's review panel was unanimous (8/8) that the skill layer is the
  next "framework → platform" gap. Today the skills are first-class but
  their **versions** are pinned to the repo's git SHA, which is fine for
  dogfooding and terrible for downstream consumers that pin a specific
  version of `@mcp-vertex/core` and want a matching skill bundle.
- The `web`/`fetch` plugin is the cleanest way to let consumers opt into
  "the agent can hit the network" without making it a default capability
  (i.e. without forcing `effects: ['network']` on `overview`).

## Non-goals

- Replacing or duplicating the `fetch_webpage` tool the host provides — the
  plugin is for *inside the MCP server*, not the host's browsing tool.
- Adding a full web-scraping DSL. The plugin is a single tool with an
  allow-list, not a crawler.
- i18n on the skill bodies (the existing ones are in English only; we
  formalise the convention instead of translating).

## Slices

### S1 — Skill manifest + version-pinning contract
  - **Status**: ready
  - **Files**: `skills/manifest.json` (new — declares every skill under
    `skills/<name>/SKILL.md` with `id`, `version` (semver), `minCoreVersion`,
    `tags`, `bodyPath`), `scripts/check-skills.ts` (new — fails CI if a
    skill is added without an entry).
  - **Command**: `bun run lint:proposals && bun scripts/check-skills.ts`
  - **Expect**: green; every existing skill is in the manifest.

### S2 — Add the 5 missing skills
  - **Status**: ready
  - **Files**: `skills/mcp-vertex-operator/SKILL.md` (new),
    `skills/proposal-swarm-runner/SKILL.md` (new),
    `skills/state-repair-playbook/SKILL.md` (new),
    `skills/token-budget-playbook/SKILL.md` (new),
    `skills/concurrency-patterns/SKILL.md` (new),
    `skills/manifest.json` (5 new entries).
  - **Command**: `bun scripts/check-skills.ts`
  - **Expect**: green; each SKILL.md is a self-contained prompt
    (~150–300 lines) with worked examples from the repo.

### S3 — `web`/`fetch` plugin
  - **Status**: ready
  - **Files**: `plugins/web/package.json` (new),
    `plugins/web/src/index.ts` (new),
    `plugins/web/src/lib/engine.ts` (new — `web_fetch { url, selector?,
    maxBytes? }` with allow-list read from `plugins.web.options.allowList:
    string[]`, `effects: ['network']`, response capped to 50 KiB),
    `plugins/web/src/lib/tools.ts` (new),
    `plugins/web/tests/src/lib/engine.spec.ts` (new — 8 cases: allowed URL,
    blocked URL, oversized response, invalid selector, malformed JSON,
    redirect chain, timeout, fetch error),
    `mcp-vertex.config.json` (add `web` to the `swarm` preset as opt-in).
  - **Command**: `bun run validate`
  - **Expect**: green; the plugin is discoverable by
    `discover-plugins.ts` and its tool appears in `overview` with
    `effects: ['network']`.

### S4 — Skill consumer helper
  - **Status**: ready
  - **Files**: `packages/core/src/lib/skills/load-skills.ts` (new — loads
    `skills/manifest.json` and returns `ISkillBundle[]` filtered by
    `minCoreVersion`; the proposal's slices S1–S2 become the data the
    helper exposes), `packages/core/src/public/index.ts` (re-export
    `ISkillBundle`, `loadSkills`).
  - **Command**: `bun run typecheck && bunx vitest run packages/core`
  - **Expect**: green; `ISkillBundle` is part of the public surface.

### S5 — Audit close
  - **Status**: ready
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 281 → `[x]`
    with link to this proposal; the original line splits into the two
    sub-items: "skills/prompts versionados" and "plugin `web`/`fetch`"
    both `[x]`).
  - **Command**: none.
  - **Expect**: master audit line 281 is now `[x]`.

## Acceptance

- [ ] `skills/manifest.json` exists and is enforced by CI.
- [ ] All 5 new skills exist with semver and `minCoreVersion`.
- [ ] `plugins/web` ships and is opt-in via the config.
- [ ] `ISkillBundle` is in the public surface.
- [ ] Master audit line 281 is `[x]`.

## Risk register

- **R1 — Skill bodies drift from the code they reference**: each new
  skill's "worked example" must cite a file/line that exists at the
  proposal's `date`. The check-skills script will not catch this (it's a
  manual convention). Documented in the new SKILL.md template.
- **R2 — `web` plugin becomes a SSRF vector**: the allow-list is enforced
  *before* the fetch; `redirect chain` test in S3 covers the case where
  the allow-listed URL redirects to a non-allow-listed host (the redirect
  is rejected). DNS-rebinding and IPv6 bypass are out of scope and
  documented as host-level concerns in the plugin README.

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 281).
- Existing skills: `skills/mcp-vertex-plugin-authoring/SKILL.md`,
  `skills/mcp-vertex-failure-modes/SKILL.md`.
- Plugin preset config: `mcp-vertex.config.json`.
- `discover-plugins.ts`: `packages/core/src/lib/plugins/discover-plugins.ts`.
