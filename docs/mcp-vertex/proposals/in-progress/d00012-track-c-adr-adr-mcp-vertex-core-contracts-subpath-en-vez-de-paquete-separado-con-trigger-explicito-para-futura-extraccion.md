---
id: d00012
title: "Track C.adr — ADR: `@mcp-vertex/core/contracts` (subpath) en vez de paquete separado, con trigger explícito para futura extracción"
kind: docs
status: in-progress
type: proposal
track: architecture
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00028 (decisión arquitectónica)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (decisión recomendada)
related:
    - q00006
    - r00027 # inventario core/public stable/experimental/internal (predecesor)
    - r00028 # subpath exports en @mcp-vertex/core (predecesor de implementación)
    - r00029 # extraer @mcp-vertex/contracts como paquete (esta hija lo REDEFINE)
    - r00030 # cliente importa de contracts (predecesor)
    - b00237 # deprecar nodeDynamicImport (predecesor)
    - c00146 # realinear Track C con subpath + trigger (hermano)
last-transition-id: 72d3e433-71f7-46f6-aa6d-07e4eebaed9e
last-correlation-id: 72d3e433-71f7-46f6-aa6d-07e4eebaed9e
last-transition-from: ready
---

# d00012 — ADR: `@mcp-vertex/core/contracts` (subpath) en vez de paquete separado

## Goal

Dejar constancia arquitectónica —en forma de ADR siguiendo el
estilo Markdown mínimo del repo— de la decisión que el agente
tomó en `r00028`/`b00237` y que el reviewer externo ChatGPT
5.6 Sol rectificó / confirmó:

> Propuesta original (auditoría):
> ```
> @mcp-vertex/contracts  (paquete separado)
> ```

> Decisión implementada (agente):
> ```
> @mcp-vertex/core/contracts  (subpath dentro de @mcp-vertex/core)
> ```

> Razón:
> ```
> minimize package fragmentation while preserving boundary
> ```

Esta hija **no cambia el código**. Produce un ADR en
`docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`
con:

1. Contexto (el audit proponía un paquete separado).
2. Decisión (subpath).
3. Razones (3 bullets: minimizar fragmentación, preservar la
   boundary, evitar npm-publish independiente prematuro).
4. Consecuencias (positivas y negativas).
5. **Trigger de reversión**: condiciones explícitas bajo las
   que en el futuro se debe extraer `@mcp-vertex/contracts` a
   paquete separado.

Garantizar:

1. Existe `docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`.
2. Sigue la plantilla estándar (Status: Accepted, Date,
   Deciders: orchestrator + ChatGPT-5.6-Sol).
3. La tabla "Trigger de reversión" enumera al menos 4
   condiciones medibles.
4. `r00028` y `r00029` referencian este ADR en su frontmatter
   `related:` (lo hace `c00146`).
5. El ADR está enlazado desde `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
   en la sección "Architecture decisions".

### Comportamiento actual

El audit proponía `@mcp-vertex/contracts` como paquete. El
agente ejecutó `r00028` y eligió subpath. Esa decisión no
quedó registrada; vive solo en los commits.

```
$ git log --oneline | grep contracts
a89a68b feat(core): expose @mcp-vertex/core/contracts subpath ...
```

Si en 6 meses alguien pregunta "¿por qué subpath y no paquete?",
la única respuesta está en `git log`. Eso no es durable.

### Comportamiento deseado

`docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`
existe y es canónico:

```md
# ADR 0007 — `@mcp-vertex/core/contracts` (subpath) vs paquete separado

- Status: Accepted
- Date: 2026-08-25
- Deciders: orchestrator (q00006 Track C) + ChatGPT-5.6-Sol (cuarta pasada)

## Context

(...)
## Decision
(...)
## Consequences
(...)
## Trigger for reversal

| # | Condición | Métrica | Estado |
|---|-----------|---------|--------|
| 1 | `core/contracts` se importa desde fuera de `@mcp-vertex/{core,client,vscode,web}` (>3 packages externos) | contador de importers | medir trimestralmente |
| 2 | necesitamos publicar `@mcp-vertex/contracts` a npm independientemente | npm publish runbook | bloqueante |
| 3 | el subpath `core/contracts` arrastra dependencias transitivas Node no permitidas (R1.x) | `tsc --noEmit -p contracts` falla | bloqueante |
| 4 | R7 / complejidad de surface API pública crece > X contratos | conteo de tipos exportados | medir trimestralmente |

Si 2 o más triggers pasan a "bloqueante" en una revisión,
abrir propuesta `r00035-extraer-contracts-paquete-seguundo-ciclo`.
```

## Why

- Cita textual del reviewer:
  > "But it shouldn't be declared as literally the same proposal
  > without updating its architectural decision. It should
  > register: Proposal originally: `@mcp-vertex/contracts` /
  > Decision: `@mcp-vertex/core/contracts` / Reason: minimize
  > package fragmentation while preserving boundary."
- Decisiones arquitectónicas no documentadas = deuda silenciosa.
  Sin ADR, en cualquier refactor futuro el equipo (humano o
  agente) puede volver a "extraer paquete" sin saber que ya se
  evaluó.
- Los ADRs son output esperado de cualquier plan de boundary /
  arquitectura (Track C del `q00006` cubre boundaries; un ADR
  es el artefacto canónico de boundary decision).
- Habilita que `c00146` (realignment de r00029/r00030 al
  subpath) tenga una referencia formal y no solo un comentario.

## Non-goals

- No introduce una nueva categoría de documentos más allá de
  ADRs (no "design docs", no "RFCs"); sigue el estándar
  `docs/mcp-vertex/adr/NNNN-title.md` ya existente en el repo.
- No debate la decisión; el debate está cerrado. Solo
  documenta el resultado.
- No fuerza la extracción futura; el trigger es opcional y
  medible, no una promesa.

## Architecture

### 1. ADR canónico

Ruta: `docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`.

Plantilla (resumen de la que ya usa el repo):

```md
---
adr_id: 0007
title: "@mcp-vertex/core/contracts (subpath) vs paquete separado"
status: Accepted
date: 2026-08-25
deciders:
  - orchestrator (q00006 Track C)
  - ChatGPT-5.6-Sol (cuarta pasada)
supersedes: null
superseded_by: null
related_proposals:
  - r00028
  - r00029
  - r00030
  - b00237
related_audit:
  - docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
---

## Context

(auditoría proponía paquete separado)

## Decision

`@mcp-vertex/core/contracts` (subpath). Los tipos puros viven
en `packages/core/src/contracts/` y se exponen vía
`exports` field en `packages/core/package.json`.

## Consequences

### Positivas
- Un solo `package.json` que versionar; menos drift de
  contratos entre `core` y `contracts`.
- Tests cross-subpath siguen siendo locales; no requieren
  publicar nada a npm todavía.
- Build / CI no introduce un package adicional que sincronizar.

### Negativas
- Si alguien fuera de `@mcp-vertex/{core,client,vscode,web}`
  quiere consumir tipos puros, hoy **no puede** sin importar
  `@mcp-vertex/core` entero.
- Versionado del subpath está atado al versionado de `core`.
  No hay semver independiente para los contratos.

## Trigger for reversal

(...)
```

### 2. Enlace desde bootstrap

`docs/mcp-vertex/AGENT-BOOTSTRAP.md` añade una línea en la
sección "Architecture decisions":

```
- [ADR 0007 — `@mcp-vertex/core/contracts` (subpath) vs paquete separado](../adr/0007-core-contracts-subpath-vs-package.md)
```

### 3. Validación por lint

`tools/scripts/lint/check-adr-coverage.script.ts` (nuevo, simple):
lee el frontmatter de cada ADR y verifica que cualquier
`related_proposals` apunte a archivos que existan.

## Slices

### S1 — Crear el ADR

- **Status**: pending
- **Files**:
  `docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`.
- **Gate**: docs lint
- **Depends on**: `r00028` (predecesor de implementación).

### S2 — Enlace desde AGENT-BOOTSTRAP.md

- **Status**: pending
- **Files**:
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md`.
- **Gate**: docs lint
- **Depends on**: S1.

### S3 — Lint `check-adr-coverage`

- **Status**: pending
- **Files**:
  `tools/scripts/lint/check-adr-coverage.script.ts`,
  `tools/scripts/lint/check-adr-coverage.script.spec.ts`,
  `package.json` (añadir a `lint:`).
- **Gate**: type + test passing

## acceptance

- `docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`
  existe y sigue la plantilla del repo.
- `AGENT-BOOTSTRAP.md` enlaza al ADR.
- `bun run validate` verde; el lint `check-adr-coverage` pasa.
- `r00028` y `c00146` (siguiente hija) llevan `related: d00012` en
  frontmatter.
