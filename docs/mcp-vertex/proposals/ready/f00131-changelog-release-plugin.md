---
id: f00131
kind: feat
title: changelog/release plugin — changelog generation and semver-bump inference from conventional commits, exposing the internal release-plan
status: ready
date: 2026-07-23
track: plugin+release+automation
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

- **Status**: pending
- **Files**: `plugins/changelog/src/lib/render/`, `plugins/changelog/src/lib/tools/changelog-generate.tool.ts`
- **Gate**: bun run validate

`changelog_generate` groups a commit range by type/scope into a changelog
section. Pure over injected git log; reuses the conventional-commit parser.

### S2 — semver bump inference + release-plan surface

- **Status**: pending
- **Files**: `plugins/changelog/src/lib/bump/`, `plugins/changelog/src/lib/tools/release-plan.tool.ts`
- **Gate**: bun run validate

`release_bump` infers the next version from commit types; `release_plan`
exposes the internal ordered publish plan (read/preview). Pure inference.

### S3 — catalog + pack

- **Status**: pending
- **Files**: `plugins/changelog/README.md`, `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: bun run validate

Catalog + wiki + `library` pack membership (r00011).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Generates a correct changelog section from a fixture commit range.
- Infers minor for a feat, patch for a fix, major for a breaking change.
- `release_plan` previews the ordered plan without publishing.

## notes

Reuses the conventional-commit lint + internal release-plan. Prior art:
git-cliff, changesets, semantic-release, release-please.
