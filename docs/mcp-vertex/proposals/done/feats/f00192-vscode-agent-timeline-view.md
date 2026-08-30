---
id: f00192
title: "VSCode Agent Timeline view"
kind: feat
status: done
type: proposal
track: vscode
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 24900c2c
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track J / f00192"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00185 # plugin states (alimenta eventos del timeline)
    - c00134 # métricas plugin lifecycle
---

# f00192 — VSCode Agent Timeline view

## Goal

Introducir una **vista "Agent Timeline"** en la extensión de VSCode
que muestre, en orden cronológico, los eventos del agente durante
una sesión: claim, activate, change, test, cost, commit, close. Cada
evento con su why/cost/inputs/outputs cuando estén disponibles.

### Comportamiento actual

- La extensión VSCode no tiene una vista dedicada al lifecycle del
  agente.
- Los eventos se imprimen en el output channel mezclados con otra
  información.
- La auditoría externa (§26, §27) lo señala: el usuario no puede
  responder "¿qué hizo el agente en los últimos 10 minutos?".

### Comportamiento deseado

- Nueva vista en `extensions/vscode/src/views/agent-timeline.ts`:
  - Webview con una línea de tiempo vertical.
  - Cada evento se renderiza como una tarjeta con:
    - Timestamp.
    - Tipo (claim, activate, change, test, cost, commit, close).
    - Plugin / slice afectado.
    - Costo (tokens consumidos si está disponible).
    - Inputs / outputs (truncados para legibilidad).
    - Why (motivo registrado por el plugin, si lo expone).
  - Acciones:
    - Click en un evento → abre el commit/slice relacionado.
    - Filtro por plugin / por tipo de evento.
    - Persistencia: la timeline persiste entre sesiones (en
      `.vscode/mcp-vertex/timeline.json`).
- Privacidad: el log es **local**; no se envía a ningún sink
  externo (R1.9).

## why

- Cierra §26, §27 de la auditoría.
- Habilita debugging: "¿por qué el agente decidió X?" se responde
  con un click.
- Habilita auditoría humana: el revisor puede ver el timeline del
  PR agent.
- Da feedback visual al usuario durante sesiones largas.

## non-goals

- No introduce telemetría a un sink externo.
- No reemplaza al output channel; es una vista adicional.
- No incluye eventos de plugins externos (Track K).
- No es interactivo (no permite undo).

## architecture

### 1. Provider

- `extensions/vscode/src/views/agent-timeline.ts`:
  - `TreeDataProvider` + `WebviewView`.
  - Lee de `.vscode/mcp-vertex/timeline.json` (generado por el
    plugin core).
- Comando: `mcp-vertex.showAgentTimeline`.

### 2. Source del log

- `packages/core/src/lib/observability/timeline.ts`:
  - Append-only log de eventos.
  - Cada plugin emite vía `ctx.events.emit({ type, ... })` (o
    reusa el bus de eventos del lifecycle).
  - Persistencia en `.vscode/mcp-vertex/timeline.json` (rotación
    por tamaño / tiempo).

### 3. Privacidad

- El log es local; sin sync a ningún servidor.
- Redacción opcional: tool names externos se ofuscan automáticamente
  antes de persistir (R1.1).
- Logs con timestamps muy antiguos se truncan (rotación).

### 4. Tests

- `extensions/vscode/src/test/agent-timeline.spec.ts`:
  - Mock del JSON; verifica render de eventos.
- `packages/core/tests/src/lib/observability/timeline.spec.ts`:
  - Append + rotación + redacción.

## Slices

### S1 — Source del log + vista webview + tests

- **Status**: done
- **Files**: `packages/core/src/lib/observability/timeline.ts`, `extensions/vscode/src/views/agent-timeline.ts`, `extensions/vscode/src/test/agent-timeline.spec.ts`, `packages/core/tests/src/lib/observability/timeline.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: la vista Agent Timeline pasa 18/18, el buffer core pasa 21/21 y el typecheck del workspace pasa. La cobertura fija render, filtros, CSP, escape HTML, redacción y rotación sin sink externo.
## acceptance

- Vista "Agent Timeline" abre en VSCode.
- Log persiste entre sesiones.
- Redacción de tool names externos funciona.
- Sin sink externo.
- Tests verdes.
- `bun run validate` verde.
