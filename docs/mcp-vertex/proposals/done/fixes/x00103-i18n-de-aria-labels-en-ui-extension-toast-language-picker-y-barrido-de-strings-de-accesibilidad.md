---
id: x00103
title: "i18n de aria-labels en ui-extension: toast, language-picker y barrido de strings de accesibilidad"
kind: fix
status: done
type: proposal
track: ui
date: 2026-07-13
---

# x00103 — i18n de aria-labels en ui-extension: toast, language-picker y barrido de strings de accesibilidad

## Goal

Que todos los textos de accesibilidad de la UI compartida (aria-label, title, alt) pasen por el sistema i18n de 12 idiomas: hoy toast.ts emite aria-label="Close" y language-picker.ts aria-label="Language" hardcodeados en inglés, y hace falta un barrido para cazar el resto y un guard que evite regresiones.

## why

Finding 7 de a00053: lectores de pantalla en 11 de los 12 idiomas soportados anuncian controles en inglés, incumpliendo la regla "i18n completa o no se shippea" que la web sí cumple.

## non-goals

- Añadir idiomas nuevos
- Rediseñar componentes

## Slices

- global_gate: e2e

### S1 — toast y language-picker con aria-labels i18n + barrido del resto de componentes
- **Status**: done
- **Files**: `packages/ui-extension/src/components/toast.ts`, `packages/ui-extension/src/components/language-picker.ts`, `packages/ui-extension/src/i18n/ui.ts`
- **Gate**: e2e
- acceptance:
  - "aria-label de cerrar toast y del selector de idioma se renderizan en el idioma activo en los 12 idiomas"
  - "un grep de aria-label=" con literal ASCII en src/ no devuelve hardcodes fuera del sistema i18n"

### S2 — Guard: lint que falla ante aria-label/title/alt literales fuera de i18n en ui-extension
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/shared-ui-ratchet.script.ts`
- **Gate**: e2e
- acceptance:
  - "bun run lint:shared-ui-ratchet falla si se introduce un aria-label literal nuevo"

## acceptance

- aria-label de cerrar toast y del selector de idioma se renderizan en el idioma activo en los 12 idiomas
- un grep de aria-label=" con literal ASCII en src/ no devuelve hardcodes fuera del sistema i18n
- bun run lint:shared-ui-ratchet falla si se introduce un aria-label literal nuevo
