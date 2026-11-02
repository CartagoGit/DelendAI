---
id: x00279
title: "AUD-A07 — BRANCH_PROTECTION.defaults consumido de verdad por los verificadores"
kind: fix
status: done
type: fix
track: governance
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-A07
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00276, x00277, x00278]
---

# x00279 — `BRANCH_PROTECTION.defaults` consumido de verdad

## Goal

Que `config.defaults` (`enforce_admins`, `required_linear_history`,
`allow_force_pushes`, `allow_deletions`) sea la fuente real de la
expectativa que ambos verificadores comparan contra la API de GitHub,
en vez de un valor que sólo se imprime en `--dry-run` mientras el
código compara contra literales hardcodeados.

## Why

`.github/branch-protection.ts` declara `defaults` como "booleanos que
aplican a cada rama":

```ts
defaults: {
    enforce_admins: true,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
},
```

Pero `diffBranch()` en `verify-branch-protection.script.ts` no recibe
`defaults` — compara contra literales (`!== true`, `!== false`)
escritos directamente en el cuerpo de la función. El único lugar que
lee `config.defaults` es la línea de `--dry-run`:

```ts
out(`  - ${b.name} — checks=${b.required_checks.length}, enforce_admins=${config.defaults.enforce_admins}`);
```

`verify-develop-health.script.ts` repite el patrón: `isHealthy()`
exige los cuatro valores hardcodeados
(`b.enforce_admins && b.required_linear_history && b.allow_force_pushes
&& b.allow_deletion`), sin mirar `config.defaults` en ningún punto de
la comparación real.

Cambiar `defaults.allow_force_pushes` a `true` en el config no
cambiaría el comportamiento de ninguno de los dos scripts: seguirían
exigiendo `false`. Es configuración decorativa, y erosiona la confianza
en el resto del fichero, que sí es real — especialmente peligroso
porque este mismo fichero es la fuente de verdad citada por `x00277` y
`x00276` para razonar sobre lo que "debería" ser cierto.

## Why this design

Pasar `defaults` como parámetro explícito de `diffBranch`/`inspectBranch`
(en vez de importarlo dentro de la función, que reintroduciría el mismo
acoplamiento implícito que ya existe con `BRANCH_PROTECTION` importado
a nivel de módulo) hace que ambas funciones puras sean testeables con
cualquier combinación de `defaults` sin depender del fichero de config
real — que es justo lo que exige el criterio de aceptación de este
proposal ("cada campo de `defaults` cambia el veredicto en al menos un
test").

## Non-goals

- No se construye `branches[].overrides` como una feature aparte con
  su propio esquema de merge — sólo se soporta si sale natural de pasar
  `defaults` como parámetro (p. ej. si una rama futura necesita un
  valor distinto, el llamador puede pasar un `defaults` ya fusionado).
  No sobre-construir.
- No se introduce `enforcement: 'required' | 'advisory'` — eso es
  `AUD-A01` / `d00013`, fuera de este slice.
- No cambia el nombre ni la forma de `IBranchProtectionConfig` en
  `.github/branch-protection.ts` — el fichero ya está bien.

## Architecture

```
diffBranch(expected, live, defaults: IBranchProtectionConfig['defaults']): readonly IDrift[]
  if (live.enforce_admins?.enabled !== defaults.enforce_admins) → drift
  if (live.required_linear_history?.enabled !== defaults.required_linear_history) → drift
  if (live.allow_force_pushes?.enabled !== defaults.allow_force_pushes) → drift
  if (live.allow_deletions?.enabled !== defaults.allow_deletions) → drift

inspectBranch(expected, result, defaults): IBranchHealth
  misma sustitución de literales por defaults.*
```

`main()` en ambos scripts pasa `config.defaults` en la llamada
existente; ningún cambio de firma pública fuera de estas dos funciones.

## Slices

### S1 — `verify-branch-protection.script.ts` consume `defaults`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-branch-protection.script.ts`, `tools/tests/ci/verify-branch-protection.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-branch-protection.spec.ts`

### S2 — `verify-develop-health.script.ts` consume `defaults`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-develop-health.script.ts`, `tools/tests/ci/verify-develop-health.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-develop-health.spec.ts`

## Dependency graph

```
x00278 ──► x00276 ──┐
       └──► x00277 ─┴──► x00279
```

## Acceptance

1. `defaults.allow_force_pushes = true` + rama live con force-push
   habilitado ⇒ `0 drifts` en `verify-branch-protection` y `healthy:
   true` en `verify-develop-health` — el mismo cambio de config que hoy
   no altera nada, ahora sí.
2. Cada uno de los cuatro campos de `defaults`
   (`enforce_admins`, `required_linear_history`, `allow_force_pushes`,
   `allow_deletions`) tiene al menos un test que, al invertir su valor,
   invierte el veredicto.
3. Con los `defaults` actuales del fichero real
   (`enforce_admins: true, required_linear_history: true,
   allow_force_pushes: false, allow_deletions: false`), el
   comportamiento observable de ambos scripts no cambia frente al
   comportamiento anterior a este proposal (regresión cero contra la
   política real).
4. `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run`
   sigue en verde.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Pasar `defaults` explícito podría dejar un camino donde el llamador se olvida de pasarlo y cae de vuelta a un literal | `diffBranch`/`inspectBranch` dejan de tener ningún literal booleano de expectativa en el cuerpo tras este cambio — no queda camino de fallback a lo hardcodeado |
| Los `defaults` reales del repo coinciden hoy con los literales hardcodeados, así que un test que sólo usa la config real no detectaría una regresión que reintroduzca el hardcoding | El criterio de aceptación 1 exige explícitamente un test con `defaults` distintos de los reales |

## Notes

- Depende de `x00278` (nombre correcto `allow_deletions`) y se apoya en
  el cliente compartido de `x00277`/`x00276`, pero es ortogonal a su
  modelo de tres estados: este proposal sólo cambia qué se compara, no
  qué pasa cuando la lectura falla.
