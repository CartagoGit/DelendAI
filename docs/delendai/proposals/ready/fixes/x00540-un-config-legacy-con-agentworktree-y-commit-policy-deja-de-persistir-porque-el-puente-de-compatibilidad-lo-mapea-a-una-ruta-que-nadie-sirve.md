---
id: x00540
title: "Un config legacy con agentWorktree y commit-policy deja de persistir porque el puente de compatibilidad lo mapea a una ruta que nadie sirve"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-10
---

# x00540 — El puente legacy manda `agentWorktree` a una ruta sin salida

## Goal

Decidir qué hace un config legacy que combina `--agent-worktree=true`
con `commit-policy` persistiendo slices, y hacer que esa decisión sea
explícita en el arranque en lugar de un rechazo por slice.

## why

`resolveLegacyDevelopmentPolicy` mapea `agentWorktree: true` a
`persistence.strategy = 'branch'`. Los flags derivados de `branch` son:

```
allowsDirectIntegrationCommit: false
usesWipRefs:                   false
```

que es exactamente el par que `resolvePersistenceRoute` rechaza:

```
POLICY_ROUTE_UNSUPPORTED: persistence.strategy=branch forbids direct
integration commits and does not use WIP refs; commit-policy has no
path for it.
```

Es decir: **cada slice cerrada bajo ese config rechaza al persistir y su
trabajo se queda sin commitear.** El rechazo es correcto y está bien
redactado —"persist through the worktree host instead of commit-policy"—
pero llega slice a slice, no al arrancar, y el config sigue declarando
`commit.enabled: true` y `push.enabled: true` como si fueran a ocurrir.

Lo encontró `auto-work.e2e`, que llevaba tiempo agotando su espera de
sincronización remota con `commits=1` y `remoteRef=(absent)`.

Lo importante: **no hay mapeo alternativo evidente**. Se intentaron dos y
el propio modelo los rechaza, con razón en ambos casos:

| intento | regla que lo rechaza |
|---|---|
| `direct-commit` | `worktree-needs-own-ref` — cada agente tiene su worktree pero commitea sobre la rama de integración |
| `wip-ref` | `work-ref-template-needs-generation` y `wip-ref-needs-pull-request` |

La combinación legacy —worktrees por agente + push directo a una rama
fija— no tiene asiento en el modelo nuevo. Eso es una decisión de
producto, no un bug que se arregle eligiendo un enum.

## Non-goals

- No cambia el perfil `worktree-pr`. Ahí `branch` es correcto y el host
  de worktrees es quien persiste.
- No reintroduce el commit directo sobre la rama de integración desde un
  worktree: `worktree-needs-own-ref` tiene razón.

## Slices

### S1 — Decidir el destino del config legacy

- **Status**: done — **opción 3, retirar**.
- **Files**: [`packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/validate.ts`]
- Tres opciones, a elegir por el propietario del producto:
  1. **Migrar**: `agentWorktree: true` + `commit-policy` persistiendo
     resuelve al perfil `worktree-pr` completo (persistencia por el host
     de worktrees), y `commit-policy` se desactiva explícitamente en vez
     de rechazar por slice.
  2. **Preservar**: se añade una ruta `branch` a `commit-policy` que
     commitea sobre la rama de trabajo del agente y la empuja — la
     conducta legacy, ahora con nombre propio.
  3. **Retirar**: la combinación se declara no soportada y el arranque
     falla con un remedio, en lugar de arrancar y no persistir.
- **Decisión y por qué, para que nadie la relitige:** la opción 2
  (preservar) crea una semántica híbrida cuyo único propósito es
  conservar una conducta vieja, y el modelo ya rechaza con razón las dos
  rutas que la sostendrían. La opción 1 (migrar a `worktree-pr`) cambia
  **dónde aterriza el trabajo** —por el forge en lugar de un push
  directo— y ninguna combinación de estos dos ajustes pidió eso; hacerlo
  en silencio sería exactamente el tipo de decisión que este modelo
  existe para no tomar por el operador. Queda **disponible** como remedio
  explícito: el mensaje de arranque la nombra. Lo que se retira es
  arrancar limpio y no persistir.
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts` — 9 pass.

### S2 — Que el conflicto se vea al arrancar, no por slice

- **Status**: done
- **Files**: [`packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/cli/assemble.ts`]
- Una regla de coherencia nueva: si `commit-policy` declara
  `commit.enabled` y la política resuelta no tiene ruta de persistencia
  que ese plugin sirva, es un conflicto de config, no un rechazo en
  caliente.
- Acceptance: "un config con `agentWorktree` y `commit.enabled` reporta
  el conflicto en el arranque; hoy arranca limpio y falla en cada
  cierre."
- **Gate**: `bun run test` — `validate.spec.ts` 32 pass, commit-policy 581 pass.
- **Cómo quedó:** la regla vive en `validatePolicyAlignment`, que
  `assemble.ts` ya ejecuta al arrancar. El **tipo** de ruta lo decide
  ahora `persistenceRouteKind` en core, y `resolvePersistenceRoute` del
  plugin lo consume en vez de volver a leer los mismos ejes — dos
  lecturas de una política es justo el defecto que esta comprobación
  existe para cazar.

## Acceptance

- Un config legacy con `agentWorktree: true` y `commit-policy`
  persistiendo, o bien persiste, o bien lo dice al arrancar.
- Ningún cierre de slice deja trabajo sin commitear en silencio.

## Notes

`auto-work.e2e` se ajustó para usar la ruta que sí existe hoy (sin
`--agent-worktree=true`) y lleva un comentario que apunta aquí. Ese
cambio pin­cha la conducta actual; no decide esta propuesta.
