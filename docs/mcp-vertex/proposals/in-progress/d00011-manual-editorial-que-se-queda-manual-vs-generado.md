---
id: d00011
title: "Manual editorial: qué se queda manual vs generado"
kind: docs
status: in-progress
type: proposal
track: docs
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track H / d00011"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00140 # generar datos cuantitativos
    - f00190 # AGENT.md por package/plugin
    - d00009 # capability matrix
    - d00010 # vertex://code-map
last-transition-id: ca9949e1-e377-4b61-af62-bc2c78f67309
last-correlation-id: ca9949e1-e377-4b61-af62-bc2c78f67309
last-transition-from: ready
---

# d00011 — Manual editorial: qué se queda manual vs generado

## Goal

Escribir un documento que defina la **convención editorial** del
repo: qué partes de la documentación son manuales (prosa, decisiones
de producto, narrativa) y qué partes son generadas (números,
inventarios, tablas de capabilities, dashboards).

### Comportamiento actual

- No existe convención escrita.
- Mezclado: números hardcodeados en prosa; tablas que alguien
  actualiza a mano; bloques `<!-- mcp-vertex:begin/end -->` que
  solo algunas personas saben interpretar.
- La auditoría externa lo detecta: la falta de convención produce
  drift constante (§34, §36, §37).

### Comportamiento deseado

- Documento: `docs/mcp-vertex/DOCS-MANUAL-VS-GENERATED.md`.
- Secciones:
  - **Filosofía**: una sola fuente de verdad para datos
    machine-readable (R3.2).
  - **Manual** (prosa editorial):
    - `AGENT-BOOTSTRAP.md` (decisiones de producto, reglas).
    - `ARCHITECTURE.md` (visión de capas).
    - ADRs en `docs/mcp-vertex/decisions/**`.
    - Narrativa de propuestas (frontmatter, Goal, Why, etc.).
  - **Generado** (script + drift check):
    - Conteos cuantitativos (`c00140`).
    - Inventario de core/public (`r00027`).
    - Capability matrix (`d00009`).
    - Token budget dashboard.
    - AGENT.md por package/plugin (`f00190`).
    - `vertex://code-map` (`d00010`).
  - **Híbrido** (bloques `<!-- mcp-vertex:begin/end -->` en prosa):
    - Cómo se delimitan; cómo se actualizan sin pisar la prosa.
  - **Reglas de oro**:
    - Si un dato sale del estado del repo → generado.
    - Si un dato es juicio editorial → manual.
    - Si un dato cambia en cada commit → generado, sin excepción.

## why

- Cierra la causa raíz del drift (§34, §36, §37).
- Da a contribuidores (humanos y agentes) una regla clara: "¿este
  número lo escribo yo o lo regenero?".
- Habilita que los lints de drift (`c00140`, `d00009`) tengan una
  convención a la que apuntar.
- Documenta el patrón de bloques `<!-- mcp-vertex:begin/end -->`
  para que se use consistentemente.

## non-goals

- No decide qué datos generar (eso está en cada hija
  correspondiente).
- No cambia la prosa existente; solo documenta la convención.
- No introduce una herramienta nueva; es solo un documento.

## architecture

### 1. Estructura del documento

- Markdown estándar; ubicación: `docs/mcp-vertex/DOCS-MANUAL-VS-GENERATED.md`.
- Sin bloques generados (es 100% manual).
- Enlaces a cada hija correspondiente para que el lector
  profundice.

### 2. Revisión editorial

- PR que añade el documento requiere review de:
  - Owner del repo.
  - Uno o más contribuidores que hayan vivido el drift.

### 3. Sincronización con lints

- El documento referencia a los scripts generadores; los scripts
  referencian al documento. Bidireccionalidad intencional para que
  cualquiera encuentre la convención.

## Slices

### S1 — Documento editorial + enlaces cruzados

- **Status**: pending
- **Files**: `docs/mcp-vertex/DOCS-MANUAL-VS-GENERATED.md`, referencias en `c00140`, `r00027`, `d00009`, `d00010`, `f00190`, `tools/scripts/gen/*/README.md` (opcional)
- **Gate**: type

## acceptance

- Documento publicado y revisado.
- Bidireccionalidad: lints/scripts mencionan al documento y viceversa.
- Sin números cuantitativos hardcodeados en el documento (es
  convención, no datos).
- Tests N/A (es un doc).
