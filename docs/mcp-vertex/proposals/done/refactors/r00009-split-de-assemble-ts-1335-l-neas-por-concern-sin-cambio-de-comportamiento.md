---
id: r00009
title: "Split de assemble.ts (1335 líneas) por concern, sin cambio de comportamiento"
kind: refactor
status: done
type: proposal
track: core
date: 2026-07-13
---

# r00009 — Split de assemble.ts (1335 líneas) por concern, sin cambio de comportamiento

## Goal

Partir packages/core/src/lib/cli/assemble.ts (1335 líneas, 2.6× el umbral de refactor del playbook) en módulos por concern — ensamblado de config, wiring de presets, composición de tools/plugins — manteniendo la API pública de assembleCliConfig idéntica y los tests existentes como red de seguridad.

## why

Finding 12 de a00053: cada cambio de CLI toca un archivo gigante con radio de explosión amplio; los revisores no pueden razonar sobre un concern aislado.

## non-goals

- Cambiar flags, presets o comportamiento observable
- Tocar la superficie pública de @mcp-vertex/core/public

## Slices

- global_gate: e2e

### S1 — Extraer wiring de presets y composición de plugins a módulos propios; assemble.ts queda como orquestador fino
- **Status**: done
- **Files**: `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/run-cli.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble-skills.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts` (the split landed as these 4 modules, not a single `assemble-presets.ts` as originally sketched)
- **Gate**: e2e
- acceptance:
  - "assemble.ts por debajo de 500 líneas"
  - "bun run validate verde sin cambios en ningún spec existente (comportamiento idéntico)"

## acceptance

- assemble.ts por debajo de 500 líneas
- bun run validate verde sin cambios en ningún spec existente (comportamiento idéntico)
