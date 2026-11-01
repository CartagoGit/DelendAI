---
id: c00535
title: "Actions are pinned by SHA, packages by exact version, and provenance reaches npm"
kind: chore
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
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

### S2 — Exact external servers and npm provenance
- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/options-schema.ts`, `plugins/external-mcps/src/lib/subprocess/server-registry.ts`, `plugins/external-mcps/skills/external-mcps/SKILL.md`, `tools/scripts/release/publish-tarballs.ts`, `tools/scripts/release/release.script.ts`
- **Gate**: type
- acceptance:
  - "A server entry with a version runs `pkg@<version>` exactly (EXT-02)."
  - "--provenance reaches npm publish when requested; a spec on the argv proves it (ORCH-04)."

### S3 — One zod range
- **Status**: pending
- **Files**: `plugins/changelog/package.json`, `plugins/database/package.json`
- **Gate**: type
- acceptance:
  - "Both declare the monorepo zod range and lint:dependency-versions keeps them aligned (G45). Already true at c00535: both declare ^4.6.6, and the lint governs zod; no manifest change was needed."

## acceptance

- Every `uses:` names a 40-hex SHA with the tag in a comment; a lint fails on a tag reference; Dependabot updates github-actions weekly (G130).
- A server entry with a version runs `pkg@<version>` exactly (EXT-02).
- --provenance reaches npm publish when requested; a spec on the argv proves it (ORCH-04).
- Both declare the monorepo zod range and lint:dependency-versions keeps them aligned (G45).
