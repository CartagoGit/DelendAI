---
id: c00533
title: "Every logo comes from apps/shared/brand and the mono logo is monochrome"
kind: chore
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# c00533 — Every logo comes from apps/shared/brand and the mono logo is monochrome

## goal

apps/shared/brand is the only authored copy of each logo; web and extension copies are generated and gated by lint:brand, and logo-mono.svg is a real single-colour mark.

## why

Joint audit a00095. G9: apps/shared/README declares apps/shared/brand the source of truth, but the web serves its own copies. G46: logo-mono.svg is a fourth brand copy with no gate (three byte-identical files). G72: logo-mono.svg is not monochrome: it is byte-identical to the colour logo.svg.

## non-goals

- Redesigning the logos: the authored files keep their artwork; only copies and the mono variant change.

## slices

- global_gate: type

### S1 — One source, generated copies
- **Status**: pending
- **Files**: `extensions/vscode/scripts/sync-logo.ts`, `extensions/vscode/scripts/regenerate-icons.ts`, `apps/shared/README.md`, `apps/web/src/layouts/Base.astro`
- **Gate**: type
- acceptance:
  - "lint:brand checks every copy of logo.svg and logo-mono.svg against apps/shared/brand (G9, G46)."

### S2 — A monochrome mark
- **Status**: pending
- **Files**: `apps/shared/brand/logo-mono.svg`, `apps/web/public/logo-mono.svg`, `extensions/vscode/media/logo-mono.svg`, `apps/web/public/logo.svg`
- **Gate**: type
- acceptance:
  - "logo-mono.svg uses one fill colour (currentColor) and differs from logo.svg (G72)."

## acceptance

- lint:brand checks every copy of logo.svg and logo-mono.svg against apps/shared/brand (G9, G46).
- logo-mono.svg uses one fill colour (currentColor) and differs from logo.svg (G72).
