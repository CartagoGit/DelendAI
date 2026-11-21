---
id: f00190
title: "`AGENT.md` por package/plugin (generado)"
kind: feat
status: done
shipped-in:
    - 36972827
type: proposal
track: docs
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track H / f00190"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00140 # generar datos cuantitativos (sinergia)
    - c00141 # eliminar comentarios fNNNNN (limpieza fuente)
    - d00011 # manual editorial
---

# f00190 — `AGENT.md` por package/plugin (generado)

## Goal

Generar un `AGENT.md` por package (`packages/core/AGENT.md`,
`packages/client/AGENT.md`, `apps/web/AGENT.md`) y por plugin
(`plugins/proposals/AGENT.md`, etc.) con un esquema fijo:
**purpose, public, depends, writes, entry, tests, do_not,
token_hotspots**. El documento existe para que un agente de coding
(tipo Copilot, Claude Code, Aider) que aterriza en un directorio
tenga una "puerta de entrada" concisa y verificable.

### Comportamiento actual

- Solo existen `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`
  a nivel raíz, todos apuntando al bootstrap.
- Cuando un agente aterriza en `packages/core/src/lib/plugins/` no
  tiene una vista local de qué hace esa carpeta.
- La auditoría externa (§36) lo marca como gap de UX para coding
  agents.

### Comportamiento deseado

- Script generador: `tools/scripts/gen/agent-md.script.ts`.
- Por package: `packages/<name>/AGENT.md` con secciones:
  - `## Purpose` (1-3 frases).
  - `## Public API` (símbolos exportados, tomados del inventario
    `r00027`).
  - `## Depends on` (otros packages).
  - `## Writes` (archivos / directorios que muta).
  - `## Entry points` (rutas de entrada: CLI, tools, etc.).
  - `## Tests` (qué validar para cambios aquí).
  - `## Do not` (restricciones críticas — p. ej. "do not import
    node:* from contracts").
  - `## Token hotspots` (tools / schemas con `staticBytes >
    threshold`).
- Por plugin: igual pero con secciones adaptadas (tools, capabilities,
  surface).
- Tamaño objetivo: < 400 tokens por AGENT.md.
- Convención: bloque `<!-- mcp-vertex:begin/end -->` para que la prosa
  introductoria siga siendo manual.

## why

- Cumple §36 de la auditoría.
- Reduce el tiempo que un coding agent invierte en "entender qué
  hace este directorio".
- Habilita que el AGENT.md del repo raíz siga siendo delgado y
  apunte a sub-AGENT.md contextuales.
- Es la base para `d00010` (vertex://code-map) y el comando
  `vertex_explain` (futuro).

## non-goals

- No reemplaza al `AGENTS.md` raíz; lo complementa.
- No es interactivo (no es un RAG local).
- No incluye documentación de usuario; solo contexto para
  agentes.
- No se publica en npm.

## architecture

### 1. Generador

- `tools/scripts/gen/agent-md.script.ts`:
  - Recibe `--scope package|plugin|all`.
  - Recorre `packages/*` y `plugins/*`.
  - Para cada uno, compone AGENT.md a partir de:
    - `package.json` (name, deps, scripts).
    - Manifest del plugin (tools, capabilities).
    - Inventario `r00027` (símbolos públicos).
    - `tsconfig.json#references`.
    - Métricas de tokens (Track E).
  - Emite `<dir>/AGENT.md` con frontmatter de generación.

### 2. Tests

- `tools/scripts/gen/agent-md.spec.ts`:
  - Genera para un package fixture; verifica secciones.
  - Verifica que el tamaño es < 400 tokens (medido con la
    heurística del repo).
  - Drift check: si cambia el package, regenerar.

### 3. CI

- Drift check en `tier3` (no en Tier 1).
- Block generado con `<!-- mcp-vertex:begin end -->` para que la
  prosa editorial coexista.

## Slices

### S1 — Generador + drift check + AGENT.md iniciales

- **Status**: done
- **Files**: `tools/scripts/gen/agent-md.script.ts`, `tools/scripts/gen/agent-md.spec.ts`, `packages/*/AGENT.md` (generados), `plugins/*/AGENT.md` (generados)
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: 58 AGENT.md generados con las 8 secciones canónicas; todos <400 tokens (máx 348); check-agent-md 0 drift; specs agent-md.script.spec + check-agent-md.spec 13/13 verdes. Drift conectado a validate (check:agent-md). Aprobado.
## acceptance

- AGENT.md existe para los 50+ plugins y packages.
- Cada AGENT.md < 400 tokens.
- Drift check falla si no está regenerado.
- Tests verdes.
- Sin tool names externos ni paths privados en los documentos.
