# Dependency Versions Policy

This document is the single source of truth for shared dependency version drift
that is allowed inside the monorepo. The lint at
`tools/scripts/lint/dependency-versions.script.ts` reads the tables below
directly; there is no duplicated allowlist anywhere else.

## Scope

- Governed manifests: the root `package.json` plus first-party workspace
  manifests discovered from the root `workspaces` list.
- Governed keys: `typescript`, `@modelcontextprotocol/sdk`, `zod`, and Bun via
  the root `packageManager` field.
- Comparison mode: raw string equality. `7.0.2` and `^7.0.2` are treated as
  different declarations and must be documented explicitly when both are
  allowed.

## Defaults

| Dependency | Default version | Notes |
| --- | --- | --- |
| typescript | 7.0.2 | Default compiler pin for most packages and plugins. |
| @modelcontextprotocol/sdk | ^1.29.0 | Default runtime SDK range for core packages and most plugins. |
| zod | ^4.4.3 | Default schema runtime used across the monorepo. |
| bun | 1.3.14 | Root toolchain pin from `packageManager`. |

## Exceptions

| Dependency | Manifest | Allowed version | Justification |
| --- | --- | --- | --- |
| typescript | package.json | ^7.0.2 | Root orchestration manifest keeps a caret range for repository tooling while publishable packages stay pinned. |
| typescript | apps/web/package.json | 6.0.3 | The Astro site remains on its current TypeScript 6 toolchain. |
| typescript | packages/ui-extension/package.json | 6.0.3 | The shared UI package stays aligned with the current frontend toolchain. |
| typescript | plugins/changelog/package.json | ^5.0.0 | This package still declares a broader TypeScript compatibility range. |
| typescript | plugins/database/package.json | ^7.0.2 | This package keeps the caret range it already declares today. |
| typescript | plugins/prompt-eval/package.json | ^5.4.0 | This package still declares a broader TypeScript compatibility range. |
| typescript | tools/docs-api/package.json | 6.0.3 | The docs API builder is deliberately isolated on TypeScript 6 (x00193) because typedoc's peer range stops at `6.0.x`; it tracks the same 6.0.3 as the other TS 6 consumers. |
| @modelcontextprotocol/sdk | package.json | 1.30.0 | Root tooling already consumes the newer SDK line. |
| @modelcontextprotocol/sdk | apps/web/package.json | 1.30.0 | The web app already consumes the newer SDK line. |
| zod | plugins/changelog/package.json | ^4.0.0 | This package retains a wider Zod 4 compatibility range. |
| zod | plugins/database/package.json | ^4.0.0 | This package retains a wider Zod 4 compatibility range. |