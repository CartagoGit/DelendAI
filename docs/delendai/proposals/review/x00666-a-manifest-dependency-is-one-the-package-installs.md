---
id: x00666
title: "A manifest dependency is one the package installs"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P2
related: []
last-transition-id: 21668554-4f54-4568-ab4c-9104c2776e11
last-correlation-id: 21668554-4f54-4568-ab4c-9104c2776e11
last-transition-from: in-progress
---

# x00666 — A manifest dependency is one the package installs

## goal

Every dependency a plugin's manifest names is declared in its
`package.json` where a consumer's install brings it: in
`dependencies`, `peerDependencies` or `optionalDependencies`.

## why

An external audit (2026-09-26) found that the `container` manifest
names `@modelcontextprotocol/sdk`, which its `package.json` does not
declare. The lint called `manifest-vs-package` compared the name,
version, visibility, id and some tool permissions, but not the
dependencies, so the gate promised more than it checked. Once the rule
was added it found a second drift. `audit-orchestrator` imports `zod`
at runtime but had it only in `devDependencies`, which a consumer does
not install. Inside this workspace a hoisted copy hid the gap.

## why this design

- The runtime never reads `manifest.dependencies`, so this lint is the
  only thing that gives the field meaning. It checks one direction:
  what the manifest claims must be installable. `package.json` may
  declare more, such as a peer used only for types.
- `container` does not import the SDK at all, so the entry is removed
  from its manifest. `audit-orchestrator` moves `zod` to
  `dependencies`.

## non-goals

- Deriving `manifest.dependencies` from `package.json`.
- Checking source imports against `package.json`. A text scan of
  imports has false positives (import-looking strings in generated
  configuration and in doc comments), so it needs its own design.

## architecture

- `tools/scripts/lint/manifest-vs-package.script.ts`: `MANIFEST-DEP-001`.

## Slices

- global_gate: none

### S1 — `MANIFEST-DEP-001`, and the two drifts it found

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/lint/manifest-vs-package.spec.ts`
- **Files**:
  - `tools/scripts/lint/manifest-vs-package.script.ts`
  - `tools/scripts/lint/manifest-vs-package.spec.ts`
  - `plugins/container/plugin.manifest.ts`
  - `plugins/audit-orchestrator/package.json`
  - `bun.lock`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A manifest dependency present only in `devDependencies`, or absent,
  is a `MANIFEST-DEP-001` violation naming the plugin and the package.
- One declared in `dependencies`, `peerDependencies` or
  `optionalDependencies` is accepted.
- The repository's own plugins pass.
