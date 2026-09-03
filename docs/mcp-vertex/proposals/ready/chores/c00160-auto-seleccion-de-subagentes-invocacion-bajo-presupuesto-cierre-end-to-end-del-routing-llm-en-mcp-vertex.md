---
id: c00160
title: "Auto-selección de subagentes + invocación bajo presupuesto — cierre end-to-end del routing LLM en mcp-vertex"
kind: chore
status: ready
type: proposal
track: routing-policy
date: 2026-09-03
---

# c00160 — Auto-selección de subagentes + invocación bajo presupuesto — cierre end-to-end del routing LLM en mcp-vertex

## Goal

Consolidar, en un único plan canónico, todo el trabajo que ya da al agente LLM la capacidad de elegir y usar subagentes con el mínimo de tokens y la máxima efectividad: el servidor MCP (orient + compact router + tool_search + auto_work + delegate + agent_names), los dos selectores (auto-agent-selector v0.1.1, auto-plugin-selector v0.1.1), el policy plugin (agent-orchestrator en sus seis slices), el runtime (orchestrator-runner con su S4 advisor + S6 invocation manager) y el bridge de gasto (usage-tracking). El plan reconoce explícitamente qué está hecho (con hashes reales) y cierra las dos hijas verdaderamente nuevas — el sniffer cross-plugin que verifica coherencia entre los cinco plugins y un smoke E2E que ejercita el pipeline completo — para que el enjambre pueda dogfoodear el routing LLM en `develop` con confianza.

## why

Hasta ahora la capacidad de auto-selección + invocación está dispersa en cuatro plugins (auto-agent-selector, auto-plugin-selector, agent-orchestrator, orchestrator-runner) más el bridge de usage-tracking, cada uno con su propio id de propuesta y commits independientes. No hay un solo documento canónico que diga "esto es lo que el agente LLM puede hacer hoy, en qué commit, y qué huecos quedan". Esta dispersión provoca tres problemas concretos: (1) cuando un agente nuevo llega al repo, no sabe qué herramienta llamar primero — overview, vertex, auto_recommend, advise_routing, plan, dispatch, invoke — sin probar varias; (2) cuando un plugin del grupo cambia (ej. f00186 dogfood, 23d9fc804 S6 subprocess), no hay forma de saber si los otros siguen coherentes con el nuevo flujo; (3) el sniffer de coherencia cross-plugin no existe todavía, así que un preset que carga los cinco plugins puede fallar en runtime sin que `bun run validate` lo detecte. El plan lo cierra con un índice + dos hijas nuevas.

## non-goals

- Re-implementar model routing — ya existe en auto-agent-selector v0.1.1 (rankProviders + escalation ladder)
- Re-implementar plugin recommendation — ya existe en auto-plugin-selector v0.1.1 (recommendPlugins + buildConfigDiff)
- Re-implementar workflow policy — ya está cerrado en q00007 + f00182..f00187 + t00007
- Cambiar la API pública de orchestrator-runner (advise_routing / advise_spend / invoke ya tienen contratos estables)
- Acoplar el plan a un host concreto — los cinco plugins son `@mcp-vertex/*` agnósticos
- Forzar un único LinearMode como único path — agent-orchestrator ya tiene cuatro modos (single/linear/swarm/auto) y los respeta

## Slices

- global_gate: type

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
