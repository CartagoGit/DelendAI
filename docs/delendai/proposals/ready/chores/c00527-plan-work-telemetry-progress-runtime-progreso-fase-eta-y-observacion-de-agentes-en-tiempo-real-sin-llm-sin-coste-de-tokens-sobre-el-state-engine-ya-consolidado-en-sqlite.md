---
id: c00527
title: "Plan — Work Telemetry & Progress Runtime: progreso, fase, ETA y observación de agentes en tiempo real, sin LLM, sin coste de tokens, sobre el State Engine ya consolidado en SQLite"
kind: chore
status: ready
type: proposal
track: trust
date: 2026-09-06
---

# c00527 — Plan — Work Telemetry & Progress Runtime: progreso, fase, ETA y observación de agentes en tiempo real, sin LLM, sin coste de tokens, sobre el State Engine ya consolidado en SQLite

## Goal

Convertir el progreso del trabajo — humano o de agente, en CLI, en extensión, en chat — en una **proyección determinista** del State Engine, no en una pregunta al modelo. Cuando el usuario mira la terminal, la barra de estado de la extensión o el chat, ve, sin gastar tokens, qué está haciendo cada agente, en qué fase está, cuánto le queda, con qué confianza y por qué. Este plan orquesta cuatro propuestas hijas (`F1`–`F4`) —eventos, projector, ETA, superficies— y las hace depender explícitamente de que `q00019` (SQLite shadow driver) esté consolidada, porque la persistencia de eventos y la promoción de la sombra SQLite son requisitos no negociables de la primera propuesta ejecutable.

## why

El dolor original (cita textual del autor): *"Cuando varios agentes trabajan en worktrees es imposible saber si lo que están haciendo es lo que queremos de verdad, y no voy a estar cambiando de ramas"*. Las propuestas `f00277` (`AgentSession` + `delendai agents`) y `f00278` (`WorkIntent` + completion gates) cubren **la foto estática** de qué está tocando cada agente, pero no **la película** — cuánto lleva, cuánto le queda, si avanza o está en bucle, qué fase ejecuta ahora mismo. Hoy, cubrir esa película cuesta LLM (preguntarle al modelo "¿cuánto llevas?") y por tanto tokens, contexto y reliability. La conversación con ChatGPT del 2026-09-06 mapeó una arquitectura limpia: un bus de eventos barato, un projector determinista que vive **como un productor más** del State Engine (`IStateProducer`), un motor de ETA puramente estadístico y unas superficies (CLI, extensión, chat) que consumen esa proyección. Lo que este plan añade es la gobernanza: que cada hija tenga slices disjuntos y comprobables, que la dependencia de `q00019` (SQLite) sea dura —no un nice-to-have— y que el resultado sea **no-rompedor** por construcción (la feature arranca en opt-in y degrada con elegancia si la sombra no está consolidada).

## non-goals

- Reemplazar `usage-tracking`, `observability`, `auto-plugin-selector`, `adaptive-optimizer` ni `project-kpis`. Esta feature los **consume** cuando aplican (tokens gastados vienen de `usage-tracking`; presupuesto de superficie viene de `adaptive-optimizer`).
- Introducir ML, embeddings ni cualquier llamada a un LLM para inferir progreso, fase o ETA. Toda la inteligencia de esta feature es aritmética sobre eventos locales: frecuencias, medianas, percentiles y grafos.
- Telemetría hacia fuera. Todos los eventos y proyecciones viven en `.cache/delendai/telemetry/` del proyecto. Lo único que sale del equipo es lo que `error-reporting` ya envía, con su validador de privacidad intacto.
- Sustituir al watchdog de `f00504` (`Progress Watchdog`). Este plan produce las **snapshots** que `f00504` consume: el watchdog decide cuándo rotar, este plan le dice cuánto falta.
- Bloquear trabajo en curso por progreso. La comparación con la fase esperada se hace al cierre de la slice (a través de `f00278`), no a mitad. Un agente sigue siendo libre de leer, escribir y testear fuera del alcance, sólo no puede declarar terminado sin resolver la deriva.
- Inventar un nuevo daemon persistente en segundo plano. El bus de eventos es append-only a SQLite; el projector se ejecuta bajo demanda (`delendai work status` o `getProjection()`). Si la sombra SQLite no está consolidada, `delendai work status` degrada a una vista derivada de las fuentes que ya son fuente de verdad (`git worktree list`, `agent-lock` y los logs ya existentes).
- Inventar un sub-lenguaje de progress. Las fases (`investigating`, `designing`, `implementing`, `testing`, `fixing`, `validating`, `reviewing`, `reconciling`, `done`, `blocked`) son una enumeración cerrada con cardinalidad estable; no se extiende sin proposal aparte.

## Slices

- global_gate: type

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
