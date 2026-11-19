# `@delendai/docs-api`

Isolated typedoc + typescript@6.x workspace. Generated for **x00193 S2**.

`typedoc@0.28.19` declares `peerDependencies.typescript: "5.0.x || 5.1.x || 5.2.x || 5.3.x || 5.4.x || 5.5.x || 5.6.x || 6.0.x"`. The repo pins `typescript@7.0.2` repo-wide (modern plugins need it). typedoc's `discovery.js` imports `ts.SyntaxKind.PropertyDeclaration`, which doesn't exist in TS 7's AST surface typedoc expects → `TypeError: Cannot read properties of undefined (reading 'PropertyDeclaration')`.

This package pins a dedicated `typescript@6.0.3` to satisfy typedoc's peer dep without touching the repo-wide TS 7 pin. Bun de-hoists to per-workspace for top-level deps so typedoc resolves THIS package's TS, not the root's.

## Why a workspace, not `overrides`

Bun warns and silently drops nested `overrides` (`overrides.typedoc.typescript`), so the apps/web pattern of nested-workspace-devDependencies is the only durable fix.

## CI

`bun run docs:api` (root) is now `bun run --cwd tools/docs-api build` (see root `package.json#scripts.docs:api`). CI requires no change.
