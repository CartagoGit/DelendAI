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

- **Status**: pending
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
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts`

### S2 — Que el conflicto se vea al arrancar, no por slice

- **Status**: pending
- **Files**: [`packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/cli/assemble.ts`]
- Una regla de coherencia nueva: si `commit-policy` declara
  `commit.enabled` y la política resuelta no tiene ruta de persistencia
  que ese plugin sirva, es un conflicto de config, no un rechazo en
  caliente.
- Acceptance: "un config con `agentWorktree` y `commit.enabled` reporta
  el conflicto en el arranque; hoy arranca limpio y falla en cada
  cierre."
- **Gate**: `bun run test`

## Acceptance

- Un config legacy con `agentWorktree: true` y `commit-policy`
  persistiendo, o bien persiste, o bien lo dice al arrancar.
- Ningún cierre de slice deja trabajo sin commitear en silencio.

## Notes

`auto-work.e2e` se ajustó para usar la ruta que sí existe hoy (sin
`--agent-worktree=true`) y lleva un comentario que apunta aquí. Ese
cambio pin­cha la conducta actual; no decide esta propuesta.
