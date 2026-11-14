---
id: c00535
title: "Actions are pinned by SHA, packages by exact version, and provenance reaches npm"
kind: chore
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: 255e690e-657c-4adb-92bd-b32a4ac68be7
last-correlation-id: 255e690e-657c-4adb-92bd-b32a4ac68be7
last-transition-from: review
last-transition-at: 2026-11-05T00:47:52.783Z
---

# c00535 — Actions are pinned by SHA, packages by exact version, and provenance reaches npm

## goal

Every workflow uses actions pinned to a commit SHA with Dependabot keeping them current, external MCP servers run the exact version their metadata names, npm provenance is passed to the publisher when requested, and every plugin declares the monorepo zod range.

## why

Joint audit a00095 and gpt-6.1-sol. G130: the 74 GitHub action references use mutable tags, none a SHA; third-party oven-sh/setup-bun@v2 runs in the job that publishes with NPM_TOKEN and id-token: write. sol EXT-02: an exact version in metadata does not pin the executable package. sol ORCH-04: requested provenance is not propagated to the npm publisher. G45: changelog and database declare zod ^4.0.0 while 63 manifests use ^4.4.3.

## non-goals

- Publishing to npm (the owner decides).

## slices

- global_gate: type

### S1 — Actions by SHA
- **Status**: pending
- **Files**: `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/setup-bun.yml`, `tools/scripts/lint/workflow-yaml.script.ts`
- **Gate**: type
- acceptance:
  - "Every `uses:` names a 40-hex SHA with the tag in a comment; a lint fails on a tag reference; Dependabot updates github-actions weekly (G130)."
- shipped-in: `51fbac099a82`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Stale review round: rebase this slice on current develop and provide fresh validation evidence before approval.

### S2 — Exact external servers and npm provenance
- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/options-schema.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/skills/external-mcps/SKILL.md`, `tools/scripts/release/publish-tarballs.ts`, `tools/scripts/release/release.script.ts`
- **Gate**: type
- acceptance:
  - "A server entry with a version runs `pkg@<version>` exactly (EXT-02)."
  - "--provenance reaches npm publish when requested; a spec on the argv proves it (ORCH-04)."
- shipped-in: `6a9105675c79`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Stale review round: rebase this slice on current develop and provide fresh validation evidence before approval.

### S3 — One zod range
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/chores/c00535-actions-are-pinned-by-sha-packages-by-exact-version-and-provenance-reaches-npm.md`
- **Gate**: type
- acceptance:
  - "Both declare the monorepo zod range and lint:dependency-versions keeps them aligned (G45). Already true at c00535: both declare ^4.6.6, and the lint governs zod; no manifest change was needed."
- shipped-in: `00dc0104b1f5`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Stale review round: rebase this slice on current develop and provide fresh validation evidence before approval.

## acceptance

- Every `uses:` names a 40-hex SHA with the tag in a comment; a lint fails on a tag reference; Dependabot updates github-actions weekly (G130).
- A server entry with a version runs `pkg@<version>` exactly (EXT-02).
- --provenance reaches npm publish when requested; a spec on the argv proves it (ORCH-04).
- Both declare the monorepo zod range and lint:dependency-versions keeps them aligned (G45).
