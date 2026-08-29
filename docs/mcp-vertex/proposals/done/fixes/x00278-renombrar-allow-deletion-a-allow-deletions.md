---
id: x00278
title: "AUD-A06 — renombrar allow_deletion a allow_deletions en los dos verificadores"
kind: fix
status: done
type: fix
track: governance
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-A06
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, x00277, x00276, x00279]
---

# x00278 — renombrar `allow_deletion` a `allow_deletions` en los dos verificadores

## Goal

Hacer que `verify-branch-protection.script.ts` y
`verify-develop-health.script.ts` lean el campo que la API de GitHub
realmente devuelve (`allow_deletions`, plural) en vez del campo que
llevan comparando desde siempre (`allow_deletion`, singular), para que
dejen de reportar drift falso de forma permanente incluso cuando se
les da un token con scope de administrador.

## Why

Los dos verificadores declaran `readonly allow_deletion?: { enabled?:
boolean } | null` en su interfaz de respuesta y comparan
`live.allow_deletion?.enabled`. La respuesta real de la API de GitHub
para `main` es:

```
"allow_deletions":{"enabled":false}
```

El campo leído (`allow_deletion`, sin la `s` final) no existe en la
respuesta, así que `live.allow_deletion` es siempre `undefined`:

- `verify-branch-protection.script.ts` → `diffBranch()`:
  `if (live.allow_deletion?.enabled !== false)` → `undefined !== false`
  → **siempre** drift, sea cual sea el estado real de la rama.
- `verify-develop-health.script.ts` → `inspectBranch()`:
  `allow_deletion: live?.allow_deletion?.enabled === false` → siempre
  `false` → `isHealthy()` devuelve siempre `false`.

La política declarada ya usa el nombre correcto —
`.github/branch-protection.ts:47`, `readonly allow_deletions: boolean`
— así que el typo está aislado a los dos verificadores y a sus
interfaces de respuesta de la API.

Este bug bloquea a `x00277` y `x00276`: aunque se arreglen el falso
verde y la explosión por 403 y alguien aporte un token con scope
admin, ambos verificadores seguirían reportando drift falso en todas
las ramas para siempre. Por eso entra primero en la secuencia de `S1`.

## Non-goals

- No tocar la política declarativa en `.github/branch-protection.ts`
  — ya usa el nombre correcto.
- No introducir el cliente compartido ni el modelo de tres estados
  (`pass`/`fail`/`unverified`) — eso es `x00277` + `x00276`.
- No tocar `defaults` ni el resto de comparaciones — eso es `x00279`.

## Architecture

Cambio puntual, sin nuevo módulo: en ambos ficheros, renombrar el
campo `allow_deletion` a `allow_deletions` tanto en la interfaz
`IGitHubBranchProtectionResponse` / `IGitHubProtection` como en la
comparación (`diffBranch`, `inspectBranch`) y en el campo de salida
`IBranchHealth.allow_deletion` → `IBranchHealth.allow_deletions`.

## Slices

### S1 — renombrar el campo en `verify-branch-protection.script.ts`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-branch-protection.script.ts`, `tools/tests/ci/verify-branch-protection.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-branch-protection.spec.ts`

### S2 — renombrar el campo en `verify-develop-health.script.ts`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-develop-health.script.ts`, `tools/tests/ci/verify-develop-health.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-develop-health.spec.ts`

## Acceptance

1. Un fixture que es la respuesta literal de la API para `main`
   (`"allow_deletions":{"enabled":false}`, con el resto de campos que
   cumplen la política) produce **0 drifts** en `diffBranch` y
   `healthy: true` en `verify-develop-health`.
2. Un fixture con `allow_deletions.enabled: true` produce drift en
   ambos verificadores.
3. Ningún test ni código de producción referencia ya `allow_deletion`
   (singular) tras el cambio.
4. `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run`
   sigue en verde.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| El campo se usa en más de un sitio y algún uso queda sin renombrar | Grep de `allow_deletion` (sin `s`) tras el cambio, en código y tests |

## Notes

- Este cambio es un prerequisito literal de `x00277` y `x00276`: la
  extracción del cliente compartido (`x00277`/`x00276`) parte ya del
  nombre de campo correcto para no reintroducir el bug al fusionar los
  dos scripts.
