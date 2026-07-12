---
id: r00008
kind: refactor
title: Unify shared UI settings and i18n, remove package cycle
status: ready
type: proposal
track: ui-architecture
date: 2026-07-12
---

# r00008 — unify shared ui settings i18n and remove package cycle

## Goal

Create one acyclic host-agnostic design-system and settings contract shared by web and extensions, with complete i18n, accessible rendering and consistent visual behavior.

## Why

El design system tiene una dependencia circular y web/extension discrepan en
temas, idioma, motion, persistencia y copy. La reutilización actual es parcial.

## Non-goals

- No imponer un storage único a todos los hosts.
- No introducir imports de VS Code en paquetes host-agnostic.

## Slices

- global_gate: e2e

### S1 — Remove shared ui package cycle
- **Files**: apps/shared/package.json
- **Files**: apps/shared/src/public/index.ts
- **Files**: packages/ui-extension/package.json
- **Gate**: `bun run typecheck`
- **Status**: pending

### S2 — Canonical settings and theme contract
- **Files**: packages/client/src/lib/contracts/interfaces/settings.interface.ts
- **Files**: packages/client/src/lib/services/settings.service.ts
- **Files**: apps/shared/src/components/dev/theme-picker.ts
- **Gate**: `bun run typecheck`
- **Status**: pending

### S3 — Shared localized settings renderer
- **Files**: packages/ui-extension/src/settings/render-settings.ts
- **Files**: packages/ui-extension/src/settings/settings-schema.ts
- **Files**: apps/shared/src/i18n/shared.ts
- depends_on: [S1, S2]
- **Gate**: `bun run test`
- **Status**: pending

### S4 — Web and VS Code persistence adapters
- **Files**: apps/web/src/components/Config.astro
- **Files**: extensions/vscode/src/commands/open-settings.ts
- **Files**: extensions/vscode/src/i18n/strings.ts
- depends_on: [S3]
- **Gate**: `bun run test`
- **Status**: pending

## Acceptance

- Grafo de paquetes acíclico y typechecks aislados verdes.
- Un contrato de settings y temas compartido con adapters por host.
- Toda copy del renderer recibe i18n y pasa checks de accesibilidad/visual.
