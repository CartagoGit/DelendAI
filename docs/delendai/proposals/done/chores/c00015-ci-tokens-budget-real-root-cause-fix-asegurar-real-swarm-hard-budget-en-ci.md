---
id: c00015
title: "\"ci-tokens-budget-real-root-cause-fix-asegurar-real-swarm-hard-budget-en-ci\""
kind: chore
status: done
type: proposal
track: tokens
date: 2026-08-25
parent-plan: q00005
---

# c00015 — el gate de tokens mide la superficie nativa real por defecto

## Goal

Hacer que `tokens:gate` mida por defecto la superficie nativa real del preset, de modo que `bun run tokens:gate --preset=swarm` y el CI expongan el hard breach verdadero en vez de la superficie adaptativa mínima.

## why

El root cause del rojo en CI era semántico: el script de budget usaba implícitamente un cliente dinámico, por lo que el preset `swarm` medía solo 6 tools adaptativas y aparecía dentro del presupuesto. Eso ocultaba el breach real de 150 tools y 215,652 B en la superficie nativa que el hard budget pretende gobernar.

## non-goals

- No sube presupuestos para hacer pasar el gate.
- No cambia el comportamiento del runtime de selección de superficie; solo hace determinista la semántica de la medición.

## Slices

- global_gate: none

### S1 — Corregir la semántica por defecto del gate
- **Status**: done
- **Files**: `tools/scripts/test/run-actual-preset-budget.script.ts`
- **Gate**: none

## acceptance

- `bun run tokens:gate --preset=swarm` mide `native` por defecto.
- La ejecución por defecto revela el breach real de `swarm` en lugar de reportar 6 tools adaptativas.
- El script sigue permitiendo medir `adaptive` explícitamente para comparación (`--surface=adaptive --dynamic-client`).

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=c00015` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
