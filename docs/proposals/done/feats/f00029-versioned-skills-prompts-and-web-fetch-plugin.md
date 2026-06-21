---
id: f00029
status: done
type: proposal
track: skills+plugins+docs
date: 2026-06-21
kind: feat
title: Versioned skills/prompts + opt-in @mcp-vertex/web plugin
shipped-in: []
ownership:
    - { agent: implementation_runner, task: 'S1-S5: skill manifest + 5 new skills + web/fetch plugin + skill loader + audit close' }
---

# f00029 — Versioned skills/prompts + opt-in `@mcp-vertex/web` plugin

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

- [x] `skills/manifest.json` exists and is enforced by CI
      (`tools/scripts/lint/check-skills.script.ts`).
- [x] All 5 new skills exist with semver and `minCoreVersion`.
- [x] `plugins/web-fetch` ships and is opt-in via the config (npm package
      `@mcp-vertex/web-fetch`; `@mcp-vertex/web` was already the docs site's
      package name — see rationale).
- [x] `ISkillBundle` is in the public surface
      (`packages/core/src/public/index.ts`, via `loadSkills`).
- [x] Master audit line 298 is `[x]` (the proposal's original "line 281"
      reference was stale relative to the current file).

## risks and mitigations

- **R1 — Skill bodies drift from the code they reference**: each new
  skill's "worked example" must cite a file/line that exists at the
  proposal's `date`. The check-skills script will not catch this (it's a
  manual convention). Documented in the new SKILL.md template.
- **R2 — `web` plugin becomes a SSRF vector**: the allow-list is enforced
  *before* the fetch; `redirect chain` test in S3 covers the case where
  the allow-listed URL redirects to a non-allow-listed host (the redirect
  is rejected). DNS-rebinding and IPv6 bypass are out of scope and
  documented as host-level concerns in the plugin README.

## notes

- Master audit: `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
  (line 298, "Skills/prompts versionados … plugin web/fetch").
- Existing skills: `skills/mcp-vertex-plugin-authoring/SKILL.md`,
  `skills/mcp-vertex-failure-modes/SKILL.md`.
- Plugin preset config: `mcp-vertex.config.json`,
  `packages/core/src/lib/plugins/parse-cli-args.ts` (`PLUGIN_PRESETS`).

## rationale

Design decisions not obvious from the slices above:

- **`@mcp-vertex/web-fetch`, not `@mcp-vertex/web`**: the proposal's literal
  package name `@mcp-vertex/web` collides with the pre-existing `apps/web`
  workspace (the Astro docs site), which `bun install` rejects outright
  ("Workspace name already exists"). Renamed the npm package AND the
  plugin's registered `name` to `web-fetch` — `--plugins=<name>` resolves a
  bare specifier to `@mcp-vertex/<name>` first
  (`resolvePluginSpecifier` in `packages/core/src/lib/plugins/load-plugins.ts`),
  so `--plugins=web` would never find this package if only the npm name
  changed. Tool names are unaffected either way (`namespacePrefix` defaults
  to the plugin's own name, e.g. `web-fetch_web_fetch` — same convention as
  `docs_docs_list`).
- **Flat `z.object` output schema, not `z.discriminatedUnion`**: the first
  implementation modelled `web_fetch`'s success/failure as a
  `z.discriminatedUnion('ok', [...])`, which type-checks fine but breaks at
  *runtime* — the installed `@modelcontextprotocol/sdk`'s `outputSchema`
  compat layer (`normalizeObjectSchema` in its `zod-compat.js`) only
  recognises plain `z.object` schemas (checks for a top-level `.shape`); a
  discriminated union has none, so the SDK silently resolves the schema to
  `undefined` and then crashes inside its own parse helper on the next
  call (`"undefined is not an object (evaluating 's._zod')"` — an SDK
  internal error, not a Zod validation error, which made it easy to miss
  without an actual end-to-end tool-call smoke test). Fixed by flattening
  to one `z.object` with optional fields for both branches, matching every
  other tool in the repo (`buildMetricsToolRegistration`,
  `buildDocsToolRegistrations`). **This is a load-bearing constraint for
  any future tool in this repo: `outputSchema` must be a flat `z.object`,
  never a union/discriminated-union/intersection** — worth a callout in
  `mcp-vertex-plugin-authoring/SKILL.md` as a follow-up.
- **`PLUGIN_PRESETS` left untouched, no `web-fetch` entry added**: the
  proposal's S3 said "add `web` to the `swarm` preset as opt-in", but
  `parse-cli-args.ts`'s own comment establishes the actual convention: an
  opt-in, side-effecting capability (the precedent is `audit`) is
  deliberately **not** added to any preset, including `swarm` — a user
  opts in explicitly with `--plugins=web-fetch`. Following the proposal's
  literal instruction would have contradicted the codebase's own
  documented invariant; followed the invariant instead.
- **`tools/scripts/types/generate-tool-types.script.ts` + `emit-tool-types.ts`
  updated to harvest `web-fetch`**: this generator hardcodes its plugin
  list (no dynamic discovery), so a new plugin's `outputSchema` is silently
  excluded from the generated SDK (`src/generated/tool-outputs.ts`) unless
  added explicitly to both `PLUGIN_SPECIFIERS`/`PLUGIN_LIST` (generator) and
  `PACKAGE_ROUTES` (emitter) — not part of any reserved file for another
  in-flight proposal, so this is a safe, additive 3-line change per file.
- **No `discover-plugins.ts`**: the proposal's notes reference
  `packages/core/src/lib/plugins/discover-plugins.ts`, which does not exist
  in this codebase (likely stale from an earlier draft). Plugin discovery
  is purely `resolvePluginSpecifier` + dynamic `import()` in
  `load-plugins.ts`; no separate discovery module to wire into.
- **`skills/manifest.json` is additive to, not a replacement for,
  `apps/web/scripts/gen-skills.ts`**: that script already scans `skills/`
  for `SKILL.md` files and regenerates the doc site's catalogue dynamically
  (no manifest needed for that path). `manifest.json` adds the *version*
  axis (`version` + `minCoreVersion` per skill) that the dynamic scan does
  not and cannot infer from the filesystem alone — the two coexist by
  design, per `f00029`'s own framing as "version-pinning contract", not a
  new discovery mechanism.
