---
id: f00394
title: "Integrar UI completa de MCP Vertex en la extension VS Code"
kind: feat
status: ready
type: proposal
track: vscode-shared-ui
date: 2026-08-31
---

# f00394 — Integrar UI completa de MCP Vertex en la extension VS Code

## Goal

Convertir la extension de VS Code en una aplicacion usable con la UI compartida de MCP Vertex como shell principal, todos los datos reales del workspace y acciones funcionales, manteniendo los arboles nativos solo como compatibilidad secundaria.

## why

La extension ya monta un dashboard compartido parcial, pero Memory, detalles de tools y propuestas, configuracion, agentes, knowledge y acciones siguen fragmentados en webviews o vistas nativas. La experiencia visible no representa aun el producto UI completo definido para MCP Vertex.

## non-goals

- No duplicar la UI compartida con HTML especifico de VS Code.
- No eliminar inmediatamente los arboles nativos mientras existan consumidores de compatibilidad.
- No inventar datos cuando un plugin o fuente no este cargado; deben mostrarse estados explicitos de unavailable o not-configured.

## Slices

- global_gate: e2e

### S1 — Modelo completo de workspace
- **Status**: done
- **Files**: `packages/client/src/lib/contracts/interfaces/dashboard.interface.ts`, `packages/client/src/lib/services/dashboard.service.ts`
- **Gate**: type
- acceptance:
  - "El modelo del dashboard contiene overview, tools, plugins, memory, proposals, agents, KPIs, health y docs con estados ready, empty, loading y unavailable."
  - "DashboardService obtiene los datos reales mediante el cliente MCP y respeta el namespace prefix sin duplicar llamadas innecesarias."
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente aprobada tras reparar la compatibilidad pública: loading queda en el wrapper workspace, memory legacy no exige state, snapshot y namespace se mantienen. Evidencia: typecheck y tests focalizados verdes.
### S2 — Shell unico de UI compartida
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/ui-extension/src/dashboard/render-dashboard.ts`, `packages/ui-extension/src/dashboard/builders/build-tabs-bar.ts`, `packages/ui-extension/src/dashboard/builders/build-panels.ts`, `packages/ui-extension/src/dashboard/render-panel-memory.ts`
- **Gate**: type
- acceptance:
  - "Existe una navegacion unica y usable para Overview, Tools, Memory, Proposals, Agents, KPIs, Plugins, Docs y configuracion."
  - "Memory y las nuevas secciones usan los componentes y estilos compartidos, sin HTML paralelo especifico de VS Code."
  - "Los estados de carga, vacio, error y no disponible son visibles y coherentes."
- review-state: in_review
- review-implementer: sparrow
### S3 — Puente VS Code del shell
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`, `extensions/vscode/src/extension.ts`, `extensions/vscode/src/commands/refresh.ts`
- **Gate**: e2e
- acceptance:
  - "La vista principal de la extension monta el shell compartido como WebviewView persistente."
  - "El bridge tipado permite navegar, refrescar y ejecutar acciones sin abrir superficies nativas como flujo principal."
  - "La vista se actualiza con datos reales y conserva seguridad CSP y ciclo de vida correcto."

### S4 — Detalles y acciones integrados
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/ui-extension/src/components/host-bridge.ts`, `packages/ui-extension/src/components/runtime.ts`, `extensions/vscode/src/commands/open-tool-detail.ts`, `extensions/vscode/src/commands/open-proposal.ts`
- **Gate**: e2e
- acceptance:
  - "Tool detail muestra schema, lazy/eager, resumen, metricas y acciones desde el shell."
  - "Proposal detail muestra plan, slices, agentes, progreso y ETA desde el shell."
  - "Las acciones de abrir tool, proposal y refresh funcionan mediante mensajes validados."

### S5 — Configuracion y superficies restantes
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/ui-extension/src/configuration-center/render-configuration-center.ts`, `extensions/vscode/src/commands/open-configuration-center.ts`, `extensions/vscode/src/commands/open-plugin-config.ts`, `extensions/vscode/src/commands/open-knowledge.ts`
- **Gate**: e2e
- acceptance:
  - "Plugin configuration, Memory actions, Knowledge y Settings se pueden abrir desde la navegacion unica."
  - "Los controles de configuracion son editables, persistentes y muestran errores de validacion."
  - "Las superficies nativas antiguas quedan como compatibilidad secundaria, no como entrada principal."

### S6 — Validacion visual y distribucion
- **Status**: pending
- **DependsOn**: [S4, S5]
- **Files**: `extensions/vscode/package.json`, `extensions/vscode/scripts/build.ts`, `extensions/vscode/scripts/package.script.ts`, `extensions/vscode/src/test/build-smoke.spec.ts`, `extensions/vscode/src/test/dashboard-with-injected-vscode.spec.ts`
- **Gate**: e2e
- acceptance:
  - "El bundle y el VSIX se generan bajo build/extensions/vscode en sus rutas canonicas."
  - "El VSIX instalado en VS Code remoto muestra el shell completo con datos reales."
  - "La validacion cubre desktop y viewport estrecho, navegacion, refresco, estados y acciones principales."
  - "La suite focalizada y la validacion final del repositorio pasan sin regresiones."

## acceptance

- El modelo del dashboard contiene overview, tools, plugins, memory, proposals, agents, KPIs, health y docs con estados ready, empty, loading y unavailable.
- DashboardService obtiene los datos reales mediante el cliente MCP y respeta el namespace prefix sin duplicar llamadas innecesarias.
- Existe una navegacion unica y usable para Overview, Tools, Memory, Proposals, Agents, KPIs, Plugins, Docs y configuracion.
- Memory y las nuevas secciones usan los componentes y estilos compartidos, sin HTML paralelo especifico de VS Code.
- Los estados de carga, vacio, error y no disponible son visibles y coherentes.
- La vista principal de la extension monta el shell compartido como WebviewView persistente.
- El bridge tipado permite navegar, refrescar y ejecutar acciones sin abrir superficies nativas como flujo principal.
- La vista se actualiza con datos reales y conserva seguridad CSP y ciclo de vida correcto.
- Tool detail muestra schema, lazy/eager, resumen, metricas y acciones desde el shell.
- Proposal detail muestra plan, slices, agentes, progreso y ETA desde el shell.
- Las acciones de abrir tool, proposal y refresh funcionan mediante mensajes validados.
- Plugin configuration, Memory actions, Knowledge y Settings se pueden abrir desde la navegacion unica.
- Los controles de configuracion son editables, persistentes y muestran errores de validacion.
- Las superficies nativas antiguas quedan como compatibilidad secundaria, no como entrada principal.
- El bundle y el VSIX se generan bajo build/extensions/vscode en sus rutas canonicas.
- El VSIX instalado en VS Code remoto muestra el shell completo con datos reales.
- La validacion cubre desktop y viewport estrecho, navegacion, refresco, estados y acciones principales.
- La suite focalizada y la validacion final del repositorio pasan sin regresiones.
