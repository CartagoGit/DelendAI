---
id: d00009
title: "Capability matrix documentada"
kind: docs
status: review
type: proposal
track: security
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track F / d00009"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00188 # capability schema (fuente de verdad)
    - c00137 # lint de capabilities (consume la matriz)
    - f00194 # capability versioning (Track K)
last-transition-id: 2cd16c99-681f-4e71-a836-4618d56e0069
last-correlation-id: 2cd16c99-681f-4e71-a836-4618d56e0069
last-transition-from: in-progress
---

# d00009 — Capability matrix documentada

## Goal

Producir una **matriz legible** que cruce cada plugin con las
capabilities que declara y las que efectivamente usa, generada
automáticamente desde los manifests y desde el análisis estático del
lint `c00137`.

### Comportamiento actual

- No existe una vista agregada de qué plugin usa qué capability.
- Cuando se discute "qué plugin toca git", hay que hacer grep.
- La auditoría externa señala que la **falta de matriz visible**
  impide auditorías de seguridad rápidas.

### Comportamiento deseado

- `docs/mcp-vertex/CAPABILITY-MATRIX.md` (generado).
- Tabla principal: filas = plugins, columnas = capabilities
  (`git:read`, `git:write`, `fs:read`, `fs:write`, `network:fetch`,
  `process:spawn`, `memory:read`, `memory:write`, etc.).
- Celdas:
  - ✅ declarado en manifest.
  - 🟡 declarado pero no usado (candidato a eliminar).
  - 🔴 usado pero no declarado (violación; el lint `c00137` lo
    detecta).
  - ⚪ no usado.
- Sección "Resumen":
  - Total de capabilities únicas.
  - Top 5 plugins por número de capabilities.
  - Capabilities "raras" (declaradas por ≤ 2 plugins).
- Sección "Política recomendada":
  - Capabilities que deberían ser `internal` (solo el plugin mismo).
  - Capabilities que deberían ser `protected` (requieren approval).

## why

- Da a un humano (security review) una vista de un solo golpe de
  quién hace qué.
- Habilita la conversación sobre capabilities "raras" (¿realmente
  `process:spawn` es necesaria en el plugin X?).
- Es la entrada del `f00194` (capability versioning): para versionar
  una capability necesitamos saber dónde se usa.
- Cumple R3.4: una sola fuente de verdad para datos
  machine-readable; el documento es generado, no mantenido a mano.

## non-goals

- No es un panel interactivo (solo MD).
- No incluye capabilities custom de cada plugin; solo las del schema
  (`f00188`).
- No reemplaza al lint `c00137`: la matriz es derivada, no
  normativa.

## architecture

### 1. Generación

- `tools/scripts/gen/capability-matrix.script.ts`:
  - Recorre `plugins/**/plugin.json` y `plugins/**/src/index.ts`.
  - Para cada plugin, computa:
    - `declared`: capabilities en el manifest.
    - `used`: capabilities detectadas por el lint `c00137` (puede
      delegarse al lint si expone una API).
  - Emite tabla MD.
- Output: `docs/mcp-vertex/CAPABILITY-MATRIX.md` (con frontmatter
  de generación: fecha, commit, hash del inventario).

### 2. Tests

- `tools/scripts/gen/capability-matrix.spec.ts`:
  - Genera la matriz contra fixtures.
  - Verifica que cada plugin tiene una fila.
  - Verifica que las celdas `🔴` (usado no declarado) coinciden con
    el lint `c00137`.

### 3. Privacidad

- Sin tool names externos en el documento (R1.1).
- Solo `pluginId` público y capabilities del schema.

## Slices

### S1 — Generador de matriz + tests + integración en CI

- **Status**: pending
- **Files**: `tools/scripts/gen/capability-matrix.script.ts`, `tools/scripts/gen/capability-matrix.spec.ts`, `docs/mcp-vertex/CAPABILITY-MATRIX.md` (generado)
- **Gate**: type

## acceptance

- Script ejecutable regenera la matriz.
- Matriz incluye todos los plugins.
- Celdas `🔴` cuadran con `c00137`.
- Tests verdes.
- Documento versionado y revisado.
- Sin filtración de tool names externos.
