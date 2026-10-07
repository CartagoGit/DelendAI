---
id: x00193
title: "Two more pre-existing CI breaks unmasked by x00192: Node-vs-Bun plugin resolution gap + typedoc/TypeScript-7 incompatibility"
kind: fix
status: done
type: proposal
track: ci+audit-followup
date: 2026-07-30
---

# x00193 — Two more pre-existing CI breaks unmasked by x00192: Node-vs-Bun plugin resolution gap + typedoc/TypeScript-7 incompatibility

> **Reopened 2026-08-24**: S2 (typedoc isolation) shipped in `0a16172f`, but
> S1 (Node-vs-Bun plugin resolution) was never implemented. The proposal was
> closed as `done` with only S2 done; this reopens it so the remaining S1 work
> stays visible instead of silently rotting in a `done` proposal.

## Goal

x00192 (PR #27) fixed the "Build dist" step that was failing on every open PR, but that only unmasked two FURTHER pre-existing CI failures that were sitting later in the same job pipelines (each CI job stops at its first red step, so these never got a chance to run before):

1. **Node-vs-Bun plugin resolution gap** (`pack smoke`'s "Smoke — Node runs the compiled CLI" step, and the `metrics longitudinal regression gate` job's candidate-snapshot collection step). Running the compiled `packages/core/dist/cli.js` under real `node` (not `bun`) fails to load EVERY plugin — not just auto-agent-selector — with Node ESM errors of the exact shape `Cannot find package '@mcp-vertex/git' imported from .../packages/core/dist/cli.js` (confirmed for git, search, memory, docs, i18n, prompts-pack, rules, quality, refactor, deps, database, container, diagram, env, skills-pack, proposals, notification, logs, status-marker, test-convention, forge — i.e. essentially the WHOLE swarm preset). The `pack smoke` job's own step comment says explicitly: "The published CLI must run under plain Node (npx/npm/pnpm/yarn), not only bun — guard that the compiled bin starts and resolves its deps" — so this is a KNOWN, deliberately-tested risk area that appears to be currently failing across the board. Bun's own install/link strategy evidently produces a `node_modules` layout (or a bun-specific resolution table) that Bun's own runtime understands but real Node's ESM resolver does not.

2. **typedoc/TypeScript-7 incompatibility** (`web site build` job's `docs:api` step). `typedoc@0.28.19` (repo's installed version, and 0.28.20 is the newest available — confirmed via `bun info typedoc versions`, no newer line exists yet) declares `peerDependencies.typescript: "5.0.x || ... || 6.0.x"`, but the repo pins TypeScript 7.0.2 repo-wide. typedoc's `discovery.js` crashes with `TypeError: Cannot read properties of undefined (reading 'PropertyDeclaration')` — `ts.SyntaxKind.PropertyDeclaration` doesn't exist in the shape typedoc expects from TS7's AST. Tried the obvious fix (a nested `overrides.typedoc.typescript` pin, mirroring how `apps/web/package.json` already pins its own nested `typescript: 6.0.3` for `@astrojs/check`) — Bun does NOT support nested/scoped `overrides` (`warn: Bun currently does not support nested "overrides"`, confirmed live). The real fix needs the same STRUCTURAL isolation `apps/web` uses (its own workspace package with its own conflicting devDependency, which bun de-hoists correctly) — i.e. moving typedoc + a pinned typescript devDependency into their own small dedicated workspace package (e.g. `tools/docs-api/`) and pointing the root `docs:api` script at it. Not done in this proposal — flagged as the concrete next step for whoever picks this up.

Neither issue was introduced by any proposal shipped this session (x00183-x00192) — both are confirmed pre-existing on `develop` itself, unmasked only because x00192 fixed the earlier failure that was hiding them.

## why

Both are required CI checks blocking every PR in this repo, including all 11 currently open. Neither can be safely fixed and verified from this environment: this sandbox has no real Node binary at all (only Bun), so any attempted fix for the Node-resolution gap would be unverifiable here — shipping a guessed fix for something this deep (it touches how every plugin package resolves under Node) without being able to confirm it actually resolves the real CI failure would violate this session's own established practice of never shipping unverified changes. The typedoc fix is scoped and understood but requires creating a new workspace package + moving config, which is more invasive than a single-sitting drive-by fix warrants without the user weighing in on where that new package should live.

## non-goals

- Guessing at a fix for the Node/Bun resolution gap without a way to verify it locally — that risk is explicitly called out as why this is a separate, unimplemented proposal rather than a shipped fix.
- Deciding the typedoc restructuring's exact location/shape (tools/docs-api/ is a suggestion, not a decision) without a chance to check with the user first.

## Slices

- global_gate: none

### S1 — Node-vs-Bun plugin resolution investigation
- **Status**: done
- **Files**: `tools/scripts/compile/build.script.ts` (produces the
  packages/core/dist/cli.js build output exercised below — build
  output is gitignored, never a Files: entry)
- **Gate**: e2e
- acceptance:
  - "Reproduce locally with a REAL node binary (this session's sandbox has none — only Bun): `node packages/core/dist/cli.js --check --plugins=` from a fresh `bun install` + `bun run build`"
  - "Identify whether the cause is bun's install linker mode (isolated vs hoisted), a missing packages/core dependency declaration (same class of bug as x00192, but for ALL plugins rather than one), or something in how the compiled dist re-exports plugin specifiers"
  - "`tools/scripts/smoke/cli.script.ts` and the CI's 'Smoke — Node runs the compiled CLI' step both pass under real Node"
- implementation:
  - "Verificado 2026-08-24 con Node v26.5.1: `node packages/core/dist/cli.js --check` carga los plugins del preset por defecto sin errores `Cannot find package`; `tools/scripts/smoke/cli.script.ts` sirve el CLI compilado sobre stdio (20 core tools). La brecha ya no se reproduce; la instalación real de paquetes de plugin bajo Node la cubre el tarball-install e2e (verify:external-install)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Isolate typedoc's TypeScript peer dependency
- **Status**: done
- **ShippedIn**: 0a16172f # fix(x00193): isolate typedoc's typescript peer dep via tools/docs-api workspace
- **Files**: `config/typedoc.json`, `package.json`
- **Gate**: e2e
- acceptance:
  - "typedoc runs against a TS version within its declared peerDependencies range (5.0.x-6.0.x) without touching the repo-wide TS7.0.2 pin, following the same nested-workspace-devDependency pattern apps/web already uses for @astrojs/check"
  - "`bun run docs:api` exits 0"
  - "`bun run site:strict` exits 0 end-to-end"

## acceptance

- Reproduce locally with a REAL node binary (this session's sandbox has none — only Bun): `node packages/core/dist/cli.js --check --plugins=` from a fresh `bun install` + `bun run build`
- Identify whether the cause is bun's install linker mode (isolated vs hoisted), a missing packages/core dependency declaration (same class of bug as x00192, but for ALL plugins rather than one), or something in how the compiled dist re-exports plugin specifiers
- `tools/scripts/smoke/cli.script.ts` and the CI's 'Smoke — Node runs the compiled CLI' step both pass under real Node
- typedoc runs against a TS version within its declared peerDependencies range (5.0.x-6.0.x) without touching the repo-wide TS7.0.2 pin, following the same nested-workspace-devDependency pattern apps/web already uses for @astrojs/check
- `bun run docs:api` exits 0
- `bun run site:strict` exits 0 end-to-end
