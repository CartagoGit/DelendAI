---
id: f00131
kind: feat
title: changelog/release plugin — changelog generation and semver-bump inference from conventional commits, exposing the internal release-plan
status: done
date: 2026-07-23
track: plugin+release+automation
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing f00131 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - ba27f816 # feat(f00131 S3): changelog plugin README + catalog closure
  - d3a52566 # feat(f00131 S2): release_bump inference + release_plan tool + public barrel
  - a14a70a6 # feat(f00131): S1 changelog render from conventional commits
---

# f00131 — changelog/release plugin

## goal

A `changelog`/`release` plugin that generates a changelog and infers the next
**semver bump** from conventional commits / merged PRs, and drives the release
plan — **exposing mcp-vertex's internal release-plan machinery** (the
`PUBLISH_ORDER`/publishing pipeline it already uses for itself) as an
adopter-facing surface.

## why

Release automation (git-cliff, changesets) is a common need, and this repo
already (a) enforces conventional commits via a gate and (b) has an internal
release plan for publishing its own packages. Promoting that to a plugin is
low-cost, high-value, and dogfoods immediately: generate this repo's changelog
and version bumps from the commit history it already curates.

## why this design

Reuse the existing conventional-commit parsing (the `commit-msg-conventional`
lint already understands the format) and the internal `release-plan` module;
the changelog renderer is **pure over an injected git log**, and bump inference
is a pure mapping over commit types (feat→minor, fix→patch, breaking→major).
Publishing itself stays consent-gated and out of scope here.

## non-goals

- No npm publish without explicit consent; no git-history rewriting.
- No bundled changelog binary — pure rendering.
- Not a versioning policy engine — it suggests; the human decides.

## slices

### S1 — changelog render from conventional commits/PRs

- **Status**: done
- **Files**: `plugins/changelog/src/lib/render/`, `plugins/changelog/src/lib/tools/changelog-generate.tool.ts`
- **Gate**: bun run validate

implementation:
- `plugins/changelog/package.json`
- `plugins/changelog/tsconfig.json`
- `plugins/changelog/vitest.config.ts`
- `plugins/changelog/src/index.ts`
- `plugins/changelog/src/lib/render/conventional-commit.ts`
- `plugins/changelog/src/lib/render/group-by-type.ts`
- `plugins/changelog/src/lib/render/render-markdown.ts`
- `plugins/changelog/src/lib/render/index.ts`
- `plugins/changelog/src/lib/tools/changelog-generate.tool.ts`
- `plugins/changelog/src/lib/tools/changelog-generate.tool.spec.ts`

`changelog_generate` groups a commit range by type/scope into a changelog
section. Pure over injected git log; reuses the conventional-commit parser.

### S2 — semver bump inference + release-plan surface

- **Status**: done
- **Files**: `plugins/changelog/src/lib/bump/infer-bump.ts`, `plugins/changelog/src/lib/bump/infer-bump.spec.ts`, `plugins/changelog/src/lib/tools/release-plan.tool.ts`, `plugins/changelog/src/lib/tools/release-plan.tool.spec.ts`, `plugins/changelog/src/public/index.ts`
- **Gate**: bun run validate
- **Wiring**: `tsconfig.base.json` paths, `vitest.shared.ts` aliases, `packages/core/src/lib/plugins/plugin-defaults.ts` (`changelog: {}`), `packages/core/src/lib/plugins/preset-catalog.ts` (`full` membership). PUBLISH_ORDER already lists `plugins/changelog`.

Implemented `inferBump(commits)` (pure: breaking→major, feat→minor, fix/perf/revert→patch, else→none with reason + considered count) and `buildReleasePlan(publishOrder, bump)` (per-entry semver bump). Tool `release_plan` exposes a read-only preview. 33/33 changelog tests green, `bun run typecheck` clean.

`release_bump` infers the next version from commit types; `release_plan`
exposes the internal ordered publish plan (read/preview). Pure inference.

### S3 — catalog + pack

- **Status**: done
- **Files**: `plugins/changelog/README.md`, `plugins/changelog/package.json` (description refresh)
- **Gate**: bun run validate

Authored the plugin README covering both tools (`changelog_generate`,
`release_plan`), the bump-inference ladder, the public re-exports,
and the no-options contract. `preset-catalog.ts` already lists
`changelog` in the `full` preset (done in S2), and `PUBLISH_ORDER`
already names `plugins/changelog` — no further catalog wiring was
needed. The `library` pack noted in r00011 does not yet exist in
`preset-catalog.ts`; skipping pack-membership until that preset is
introduced.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Generates a correct changelog section from a fixture commit range.
- Infers minor for a feat, patch for a fix, major for a breaking change.
- `release_plan` previews the ordered plan without publishing.

## notes

Reuses the conventional-commit lint + internal release-plan. Prior art:
git-cliff, changesets, semantic-release, release-please.
