---
id: x00535
title: "Ciclo de dependencias real entre proposals, error-reporting y commit-policy: ningun orden de compilacion puede satisfacerlo"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# x00535 — Ciclo de dependencias real entre proposals, error-reporting y commit-policy: ningun orden de compilacion puede satisfacerlo

## Goal

Romper el ciclo plugins/proposals -> plugins/error-reporting -> plugins/commit-policy -> plugins/proposals para que exista un orden topologico valido y bun run build deje de necesitar una valvula de escape.

## why

Descubierto al implementar x00531, que sustituyo los rangos hardcodeados del builder por un sort topologico real. El grafo derivado de los manifests tiene un ciclo, y las tres aristas estan declaradas en dependencies Y presentes en el codigo: plugins/commit-policy/src/lib/services/repair-proposer.ts:60 importa @delendai/proposals/public; plugins/error-reporting/src/lib/intake/log-diagnosis.helper.ts:4 importa @delendai/commit-policy/lib/services/storm-detector; plugins/proposals/src/lib/services/incident-proposal.service.ts:6 importa @delendai/error-reporting/public. El orden por rangos anterior no lo detectaba porque nunca miro las dependencias. Ademas la arista de error-reporting es un deep import a /lib/services/, o sea que ademas viola la frontera de subpaths que x00530 esta cerrando. Mientras el ciclo exista, el builder solo compila con DELENDAI_BUILD_ALLOW_CYCLES=1, que es una degradacion deliberadamente ruidosa pero no una solucion.

## non-goals

- No fusionar los tres plugins.
- No eliminar ninguna funcionalidad: las tres colaboraciones son legitimas, lo que sobra es el acoplamiento en tiempo de compilacion.

## Slices

- global_gate: type

### S1 — cortar la arista commit-policy -> @delendai/proposals invirtiendo la dependencia
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/repair-proposer.ts`, `plugins/commit-policy/package.json`, `plugins/commit-policy/tests/src/lib/services/repair-proposer.spec.ts`
- **Gate**: type
- acceptance:
  - "repair-proposer deja de importar @delendai/proposals: lo que necesita se expresa como un puerto (interfaz) que el host inyecta, o como un tipo en @delendai/contracts."
  - "@delendai/proposals desaparece de las dependencies de commit-policy."
  - "El comportamiento observable de repair-proposer no cambia: sus tests actuales siguen verdes sin cambiar expectativas."

### S2 — error-reporting deja de hacer deep import a commit-policy/lib
- **Status**: pending
- **Files**: `plugins/error-reporting/src/lib/intake/log-diagnosis.helper.ts`, `plugins/error-reporting/package.json`, `plugins/commit-policy/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "log-diagnosis.helper deja de importar @delendai/commit-policy/lib/services/storm-detector."
  - "Si sigue necesitando esa capacidad, commit-policy la expone por un subpath publico declarado en su exports; si no, la dependencia se elimina."
  - "Cero deep imports a /lib/ entre plugins."

### S3 — el builder deja de tolerar ciclos y el guardarrail lo prueba
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `tools/scripts/compile/build-graph.ts`, `tools/scripts/compile/build-graph.spec.ts`
- **Gate**: type
- acceptance:
  - "bun run build compila sin DELENDAI_BUILD_ALLOW_CYCLES."
  - "Se elimina la valvula de escape DELENDAI_BUILD_ALLOW_CYCLES, o queda documentada como exclusiva de diagnostico y cubierta por un test que verifica que esta desactivada por defecto."
  - "Existe un test sobre los manifests reales que falla si alguien reintroduce un ciclo."

## acceptance

- repair-proposer deja de importar @delendai/proposals: lo que necesita se expresa como un puerto (interfaz) que el host inyecta, o como un tipo en @delendai/contracts.
- @delendai/proposals desaparece de las dependencies de commit-policy.
- El comportamiento observable de repair-proposer no cambia: sus tests actuales siguen verdes sin cambiar expectativas.
- log-diagnosis.helper deja de importar @delendai/commit-policy/lib/services/storm-detector.
- Si sigue necesitando esa capacidad, commit-policy la expone por un subpath publico declarado en su exports; si no, la dependencia se elimina.
- Cero deep imports a /lib/ entre plugins.
- bun run build compila sin DELENDAI_BUILD_ALLOW_CYCLES.
- Se elimina la valvula de escape DELENDAI_BUILD_ALLOW_CYCLES, o queda documentada como exclusiva de diagnostico y cubierta por un test que verifica que esta desactivada por defecto.
- Existe un test sobre los manifests reales que falla si alguien reintroduce un ciclo.
