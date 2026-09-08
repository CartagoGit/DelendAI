---
id: x00531
title: "El builder ordena por rangos hardcodeados en vez de por el grafo de dependencias declarado en los manifests"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# x00531 — El builder ordena por rangos hardcodeados en vez de por el grafo de dependencias declarado en los manifests

## Goal

Que el orden de compilacion del monorepo salga de un sort topologico sobre las dependencias declaradas, y que exista un build:clean que demuestre que un arbol vacio compila.

## why

Auditoria 2026-09-08. tools/scripts/compile/build.script.ts:94 define buildRank como: packages/core igual a 0, cualquier otro packages/* igual a 1, plugins/* igual a 2, con desempate alfabetico. Ese orden contradice las dependencias reales: packages/core importa @delendai/contracts y @delendai/state, ambos rango 1, o sea que core se compila ANTES que aquello de lo que depende; packages/context-compiler depende de @delendai/state y le gana alfabeticamente; packages/cli depende de los plugins auto-agent-selector y env, que son rango 2. Hoy no siempre explota porque los dist/ previos enmascaran el problema en builds incrementales, y packages/state-telemetry ni siquiera tiene dist todavia. Un checkout limpio es el caso que no esta cubierto.

## non-goals

- No cambiar el compilador ni el formato de salida.
- No reordenar PUBLISH_ORDER en esta propuesta mas alla de hacerlo consistente con el grafo.

## Slices

- global_gate: type

### S1 — grafo topologico derivado de los package.json, con deteccion de ciclos
- **Status**: done
- **Files**: `tools/scripts/compile/build-graph.ts`, `tools/scripts/compile/build-graph.spec.ts`, `tools/scripts/compile/build.script.ts`
- **Gate**: type
- acceptance:
  - "El orden de compilacion se deriva leyendo dependencies, peerDependencies y optionalDependencies de cada workspace y aplicando un sort topologico determinista (desempate alfabetico dentro del mismo nivel)."
  - "buildRank desaparece; no queda ningun nombre de paquete hardcodeado en la logica de orden."
  - "Un ciclo de dependencias falla de forma explicita nombrando el ciclo, en vez de producir un orden arbitrario."
  - "El orden resultante situa contracts y state antes que core, y los plugins de los que depende cli antes que cli."
- review-state: done
- review-implementer: Urartu
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — The build graph implementation and integration satisfy the declared S1 criteria.
### S2 — build:clean y gate de CI sobre arbol vacio
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `package.json`, `tools/scripts/compile/build-clean.script.ts`, `.github/workflows/ci.yml`
- **Gate**: e2e
- acceptance:
  - "bun run build:clean elimina todo dist/ de packages y plugins antes de compilar."
  - "Existe un job de CI que ejecuta build:clean sobre un checkout limpio y falla si cualquier paquete no compila."
  - "packages/state-telemetry entra en el grafo y produce dist."
  - "El job es obligatorio en la lista de required checks agregada de ci.yml."

## acceptance

- El orden de compilacion se deriva leyendo dependencies, peerDependencies y optionalDependencies de cada workspace y aplicando un sort topologico determinista (desempate alfabetico dentro del mismo nivel).
- buildRank desaparece; no queda ningun nombre de paquete hardcodeado en la logica de orden.
- Un ciclo de dependencias falla de forma explicita nombrando el ciclo, en vez de producir un orden arbitrario.
- El orden resultante situa contracts y state antes que core, y los plugins de los que depende cli antes que cli.
- bun run build:clean elimina todo dist/ de packages y plugins antes de compilar.
- Existe un job de CI que ejecuta build:clean sobre un checkout limpio y falla si cualquier paquete no compila.
- packages/state-telemetry entra en el grafo y produce dist.
- El job es obligatorio en la lista de required checks agregada de ci.yml.
