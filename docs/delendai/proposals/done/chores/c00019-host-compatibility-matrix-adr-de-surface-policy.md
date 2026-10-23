---
id: c00019
title: "Host compatibility matrix — ADR de surface policy"
kind: chore
type: proposal
status: done
track: surface
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "TOK-003 / TOK-004 — gate real preset y surface policy"
    finding: TOK-003
related:
    - r00019 # decisión surface-adaptive inicial (q00004)
    - r00026 # flip default adaptive para plain clients
    - c00018 # develop-nunca-rojo integration design
shipped-in:
    - 11d31317 # docs(filesystem+surface): d00007 + d00008 + c00019 ADRs and implementation
---

# c00019 — Host compatibility matrix + ADR de surface policy

## Goal

Producir dos artefactos complementarios:

1. **`docs/mcp-vertex/adr/0016-surface-policy-adaptive-default.md`** —
   ADR que cierra TOK-004 explícitamente: la surface por defecto para
   clientes MCP **ordinarios** (los que no declaran la capability
   privada `mcp-vertex/surface`) es `adaptive`. `native` queda como
   fallback explícito (opt-in por capability privada, por
   `--surface=native` o por `mcp-vertex.config.json#surfaceMode`).
   La ADR documenta el rationale (MCP spec no define capability
   cliente para `tools/list_changed`; cualquier cliente spec-compliant
   ya tolera la notificación; r00019 invertía la decisión sobre una
   capability que ningún host mainstream declara).

2. **`docs/mcp-vertex/host-compatibility-matrix.md`** — matriz que
   tabula, para cada host conocido (Claude Code, Cursor, VS Code
   Copilot Chat, Aider, Codex, MCP Inspector, mcp-vertex itself,
   etc.), qué capability privada declara, qué surface recibe por
   defecto, y qué override aplica si quiere `native`.

## why

TOK-003 (P2) y TOK-004 (P2). El gate `tokens-budget-real` corre hoy
con un cliente dinámico privado de Vertex; renombrar / separar ese
gate en dos (`--static-client` para native, default para adaptive)
sin la ADR deja el contrato implícito. Además, la decisión de
producto "adaptive por defecto" (cerrada en `r00026` + esta ADR)
necesita un lugar canónico donde figure explícita, y la matriz de
hosts evita que un futuro cambio de spec reintroduzca el bug "host
ordinario queda en native sin quererlo".

## non-goals

- No introduce una nueva capability privada `mcp-vertex/surface` —
  la que existe (de r00019) sigue siendo la misma; lo que cambia es
  el default.
- No rompe el comportamiento opt-in: declarar
  `mcp-vertex/surface: adaptive` sigue forzando adaptive, declarar
  `native` sigue forzando native.
- No toca el runner `run-actual-preset-budget.script.ts` — ese se
  modifica en `c00015` (Track E).

## Slices

- global_gate: none

### S1 — ADR surface-policy-adaptive-default

- **Status**: pending
- **Files**: `docs/mcp-vertex/adr/0016-surface-policy-adaptive-default.md`
- **Gate**: none
- notes: "Captura contexto (la spec, el problema), decisión, trade-offs,
  referencias (r00019, r00026, c00018, el commit 58ef6288)."

### S2 — Host compatibility matrix

- **Status**: pending
- **Files**: `docs/mcp-vertex/host-compatibility-matrix.md`
- **Gate**: none
- notes: "Tabla con columnas: host, mcp-vertex/surface declaration,
  default surface received, override para native. Filas: claude-code,
  cursor, vscode-copilot-chat, aider, codex, mcp-inspector, plain
  mcp-client, mcp-vertex itself."

## acceptance

- `docs/mcp-vertex/adr/0016-surface-policy-adaptive-default.md`
  existe con las 5 secciones estándar (Contexto, Decisión,
  Consecuencias, Trade-offs, Referencias).
- `docs/mcp-vertex/host-compatibility-matrix.md` existe con al menos
  6 filas.
- La matriz menciona explícitamente que el default es `adaptive`
  para hosts que no declaran `mcp-vertex/surface`.
- La ADR referencia `r00026` (commit `58ef6288`) y al e2e
  *"a client that never refreshes tools/list can still reach an
  activated tool via the vertex router"* como prueba de que el
  cambio no rompe clientes no-refreshers.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
