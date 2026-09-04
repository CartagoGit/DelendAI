---
id: c00141
title: "Eliminar comentarios `// fNNNNN` del source"
kind: chore
status: done
type: proposal
track: docs
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 lint + spec + baseline
    section: "Track H / c00141"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00140 # generar datos cuantitativos (también limpia fuente)
    - f00190 # AGENT.md por package/plugin
---

# c00141 — Eliminar comentarios `// fNNNNN` del source

## Goal

Eliminar todos los comentarios en código fuente (TypeScript, JS, TSX)
que referencian IDs de propuesta (`// f00087 S2`, `// x00241`,
`// b00236 — error-reporting`, etc.). La trazabilidad vive en git,
proposal graph y provenance generada; el código fuente debe ser
atemporal.

### Comportamiento actual (BUG)

- Decenas de archivos `.ts` contienen comentarios como:
  ```ts
  // f00087 S2: rewrite this fallback
  // b00236 — privacy predecessor
  // x00241: SafeWorkspaceReader — primitive base
  ```
- La auditoría externa (§35) lo marca como bug: estos comentarios
  contaminan al coding agent que lee el archivo porque lo dirigen a
  "seguir" un slice anterior.
- También erosionan confianza: el lector piensa que el comentario
  describe el estado actual, pero en realidad describe la historia.

### Comportamiento deseado

- Cero comentarios del patrón `// [a-z]\d{4,5}` (letra + 4-5 dígitos,
  con prefijo opcional `S\d+:` o "—" y descripción).
- Cero comentarios del patrón `// [a-z]\d{4,5} S\d+` (referencia a
  slice).
- Cero comentarios del patrón `// [a-z]\d{4,5} — …` (provenance).
- La trazabilidad se mantiene en:
  - Commit messages (Conventional Commits con `id` en scope).
  - `proposal-graph.json` (generado).
  - `git log --grep=<id>`.
- Lint arquitectónico `no-proposal-id-comments-in-source` falla CI
  si encuentra un patrón.

## why

- Cierra §35 de la auditoría.
- Cumple R3.5 (nueva regla del plan): la trazabilidad vive fuera
  del código fuente.
- Reduce el ruido visual para coding agents.
- Hace que el código sea más limpio y atemporal.

## non-goals

- No elimina la trazabilidad (sigue en git + proposals graph).
- No toca comentarios que NO son referencias a propuestas (p. ej.
  `// TODO`, `// FIXME`, `// NOTE` siguen permitidos si están
  justificados).
- No cambia tests (los tests pueden tener comentarios que
  referencian bugs reproducibles; el lint distingue contexto).
- No es un rewrite masivo: solo eliminar las referencias
  detectables.

## architecture

### 1. Lint

- `tools/scripts/lint/no-proposal-id-comments-in-source.script.ts`:
  - Regex: `/\/\/\s*[a-z]\d{4,5}(\s|$|S\d|—|-)/`.
  - Escanea `packages/**/src/**`, `plugins/**/src/**`,
    `apps/**/src/**`.
  - Whitelist: `*.spec.ts` puede tener `// repro for xNNNNN`
    para tests adversarios (es trazabilidad legítima).
- Exit 1 si encuentra matches; imprime ruta + línea.

### 2. Remoción

- `tools/scripts/lint/strip-proposal-id-comments.script.ts`:
  - Versión interactiva que elimina las líneas y propone un commit.
  - Solo usar en cleanup inicial; después el lint bloquea
    regresiones.

### 3. Tests

- `tools/scripts/lint/no-proposal-id-comments-in-source.spec.ts`:
  - Fixture con un `.ts` que tiene `// f00087 S2` → exit 1.
  - Fixture con `// TODO` → exit 0.
  - Fixture `.spec.ts` con `// repro for x00241` → exit 0.

## Slices

### S1 — Lint + limpieza inicial del source

- **Status**: done
- **Files**: `tools/scripts/lint/no-proposal-id-comments-in-source.script.ts`, `tools/scripts/lint/no-proposal-id-comments-in-source.spec.ts`, todos los `*.ts` que contengan los patrones (limpieza masiva)
- **Gate**: type
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: spec 5/5 verde (flags f/x/c, ignora TODO/@ts, línea/col), typecheck tools limpio. El lint ya corre en validate con baseline. Contrato del slice cumplido.
## acceptance

- Lint ejecutable; detecta el patrón.
- Source limpio: cero comentarios `// [a-z]\d{4,5}` en código de
  producción.
- Specs adversarios pueden mantener sus referencias (`// repro
  for …`).
- Tests verdes.
- CI bloquea regresiones.
