---
id: x00276
title: "AUD-A04 — verify-develop-health deja de explotar con 403"
kind: fix
status: done
type: fix
track: governance
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-A04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, x00277, x00278, x00279]
---

# x00276 — `verify-develop-health` deja de explotar con 403

## Goal

Que `verify-develop-health.script.ts` trate el 401/403 de la API de
GitHub con la misma política de tres estados (`pass` / `fail` /
`unverified`) que `x00277`, en vez de dejar que la excepción se
propague y tumbe el job en cada ejecución.

## Why

`fetchProtection` sólo trata el 404 (`return null`); cualquier otro
`!res.ok` —incluido el 403 que el `GITHUB_TOKEN` del workflow recibe
siempre, porque leer branch protection exige scope `administration`,
que no es un `permissions:` válido de workflow— lanza:

```
error: GitHub API 403 on develop: {"message":"Resource not accessible by integration", ...}
  at .../tools/scripts/ci/verify-develop-health.script.ts:95:13
  at async .../verify-develop-health.script.ts:150:22
##[error]Process completed with exit code 1.
```

El job `develop-health` de `tier3` es, a fecha de esta auditoría, **el
único check rojo que queda en `develop`** — y lo es en cada ejecución,
nightly y en cada push, no de forma intermitente.

Es además la mitad inconsistente de una pareja: `verify-branch-protection`
consulta el mismo endpoint y ya trata ese mismo 403 como
`UnverifiableProtectionError` (aunque hoy lo convierte en un falso verde,
que es lo que arregla `x00277`). Dos scripts contra el mismo endpoint con
políticas de error opuestas es exactamente el tipo de divergencia que
este plan quiere hacer imposible.

## Why this design

En vez de copiar el `try/catch` de `verify-branch-protection` a este
script — que perpetuaría dos implementaciones del mismo fetch que ya
demostraron poder divergir —, ambos consumen el mismo cliente
`tools/scripts/ci/lib/github-protection.lib.ts` introducido por
`x00277`. Este proposal entrega la migración de
`verify-develop-health` a ese cliente compartido; `x00277` entrega el
cliente en sí. Se implementan en el mismo slice (`S1` del plan padre)
precisamente para que no haya una ventana en la que el cliente exista
pero sólo un consumidor lo use.

## Non-goals

- No reescribe el modelo de reporte JSON de `IHealthReport` — sólo el
  origen del dato (`inspectBranch` sigue produciendo `IBranchHealth`),
  añadiendo el caso `unverified` a lo que antes sólo distinguía
  `protected`/`unprotected`.
- No toca `allow_deletion` → `allow_deletions` aquí — depende de
  `x00278`, que va primero.
- No añade el `BRANCH_PROTECTION_TOKEN` al workflow — eso es `x00277`
  S3 (compartido: un único cambio a `tier3.yml` cubre los dos jobs).

## Architecture

```
verify-develop-health.script.ts
  inspectBranch(expected, result: FetchProtectionResult) -> IBranchHealth
    result.kind === 'unverified' → healthy para ESA rama se marca
      `verified: false`; no cuenta como drift, pero isHealthy() global
      exige que al menos una rama se haya verificado con éxito.
    result.kind === 'live'|'unprotected' → misma lógica de hoy.
  main(): igual que verify-branch-protection, cuando TODAS las ramas
    son 'unverified' sin token explícito ⇒ exit 0 + ::warning:: +
    $GITHUB_STEP_SUMMARY; con token explícito y 401/403 ⇒ exit 1.
```

## Slices

### S1 — `verify-develop-health.script.ts` consume `github-protection.lib.ts`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-develop-health.script.ts`, `tools/tests/ci/verify-develop-health.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-develop-health.spec.ts`

### S2 — paridad de veredicto con `verify-branch-protection`

- **Status**: done
- **Files**: `tools/tests/ci/verify-develop-health.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci`

## Dependency graph

```
x00278 ──► x00276 ──┐
       └──► x00277 ─┴──► (comparten github-protection.lib.ts, entregado por x00277 S1)
```

## Acceptance

1. Todas las ramas 403 sin token explícito ⇒ `exit 0`, `healthy` no se
   fuerza a `true`, pero el proceso no lanza; se emite `::warning::` y
   una línea en `$GITHUB_STEP_SUMMARY`.
2. Todas las ramas 403 **con** token explícitamente proporcionado ⇒
   `exit != 0`.
3. Fixture con la respuesta literal de la API para `main` (ver
   `x00278`) ⇒ `healthy: true`, `exit 0`.
4. Test de paridad: para el mismo fixture (200 con drift, 403 sin
   token, 403 con token, 404), `verify-develop-health` y
   `verify-branch-protection` llegan al mismo veredicto agregado
   (`pass`/`fail`/`unverified`).
5. `tier3/develop-health` deja de ser el único check rojo permanente de
   `develop`.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Migrar a un fetch compartido podría cambiar sutilmente el formato del `IHealthReport` que consume un dashboard downstream | El campo nuevo (`verified`) se añade sin quitar los existentes; los specs actuales de forma de reporte se mantienen en verde |
| Confundir "unverified" con "healthy" en el reporte JSON | `isHealthy()` exige explícitamente que al menos una rama tenga `verified: true`; un test lo demuestra (todas unverified ⇒ `healthy` no puede ser `true` por vacuidad) |

## Notes

- Comparte solución con `x00277` (AUD-A05) y depende de `x00278`
  (AUD-A06) por el nombre del campo `allow_deletions`.
