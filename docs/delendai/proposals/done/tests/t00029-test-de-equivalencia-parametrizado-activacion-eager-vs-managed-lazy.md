---
id: t00029
title: "Test de equivalencia parametrizado: activación eager vs. managed-lazy"
kind: test
status: done
type: test
track: lifecycle
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, r00038, r00039]
---

# t00029 — test de equivalencia entre activación eager y managed-lazy

## Goal

Escribir, ANTES de tocar `managed-lazy-runtime.ts`, una batería de tests
`describe.each(['eager', 'lazy'])` que active un plugin sintético idéntico
por las dos rutas y compare lo que el plugin observa. El test es la
evidencia de que la regresión estructural de AUD-E01 no puede volver: si
alguna de las dos rutas vuelve a descartar `parsed.data`, a saltarse el
timeout o a perder `dispose`, este spec debe fallar sin necesidad de que un
humano lo recuerde.

## Why

Un test unitario contra una sola ruta no habría detectado AUD-E01: cada
ruta, vista de forma aislada, funcionaba "razonablemente" (eager parseaba
bien; lazy registraba y devolvía tools). El bug sólo es visible al
comparar las DOS rutas contra el MISMO plugin y la MISMA config. Ese es
precisamente el test que faltaba.

## Non-goals

- No sustituye los specs unitarios existentes de `load-plugins.spec.ts` ni
  `managed-lazy-runtime.spec.ts` — es un test adicional, de nivel
  "contrato entre rutas", no de detalle interno de cada una.
- No cubre el resto de AUD-E02 (teardown del host) — eso es `r00039`.

## Architecture

`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`:
un plugin sintético con
`z.object({ timeout: z.coerce.number().default(500), path: z.string().transform(...) })`,
activado vía `loadPlugins()` (eager) y vía `createManagedLazyRuntime()`
(lazy), con las mismas aserciones ejecutadas contra las dos.

## Slices

### S1 — escribir el spec y confirmar que falla contra el código pre-refactor

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`]
- **Gate**: (evidencia registrada, no un gate CI en sí — ver Notes)

### S2 — el spec pasa tras `r00038`

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`

## Dependency graph

Bloquea la verificación de `r00038` (el refactor no se considera completo
sin este spec en verde) y precede a `r00039` en el orden de S2.

## Acceptance

Las cinco aserciones nuevas, una por caso:

- `applies optionsSchema defaults, coercion and transforms (AUD-E01.a)` —
  demuestra que `.default()`/`.transform()` se aplican igual en las dos
  rutas.
- `coerces an explicit string timeout to a number` — variante de E01.a con
  `.coerce`.
- `applies registerTimeoutMs to a register() that never resolves (AUD-E01.b)`
  — demuestra que ambas rutas abandonan un `register()` colgado.
- `disposes a late resolution that lost the timeout race, and never
  activates it` — una resolución tardía no debe activar el plugin y su
  runtime debe disponerse.
- `retains dispose and calls it exactly once, idempotently (AUD-E01.c)` —
  demuestra que el `dispose` del plugin sobrevive la activación y que el
  barrido de teardown a nivel host es idempotente.

Criterios verificables:

1. Contra el código de `2cf17373` (pre-`r00038`), las 5 aserciones de la
   ruta `lazy` fallan; las 5 de la ruta `eager` pasan (ver evidencia en
   Notes).
2. Tras `r00038`, las 10 aserciones (5 por ruta) pasan.
3. El spec no depende de ningún detalle interno de una sola ruta —
   sólo de lo que el plugin observa.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| El spec se vuelve frágil por depender de temporizadores reales | Los timeouts usados son cortos (30-60ms) y el spec usa `registerTimeoutMs` explícito por caso, no el default global |

## Notes

Evidencia real registrada al escribir este test contra el código
pre-refactor (`git stash` de `load-plugins.ts` + `managed-lazy-runtime.ts`,
dejando el spec y `plugin-activation-session.ts` sin usar):

```
✕ lazy route > applies optionsSchema defaults, coercion and transforms (AUD-E01.a)
    received { path: '/a/b/' } — expected { timeout: 500, path: '/a/b' }
✕ lazy route > coerces an explicit string timeout to a number
    received { timeout: '750', path: '/x/' } — expected { timeout: 750, path: '/x' }
✕ lazy route > applies registerTimeoutMs to a register() that never resolves (AUD-E01.b)
    Test timed out in 30000ms — activatePlugin() never rejects
✕ lazy route > disposes a late resolution that lost the timeout race, and never activates it
    expected timedOut=false to be true
✕ lazy route > retains dispose and calls it exactly once, idempotently (AUD-E01.c)
    TypeError: runtime.disposeAll is not a function
— eager route: all 5 assertions passed unchanged.
```

Cinco de cinco aserciones de la ruta lazy fallaron exactamente por las
razones que AUD-E01 predice: opciones sin parsear, ausencia de timeout
(cuelga la prueba hasta el límite de 30s de vitest), ninguna disposición de
una activación tardía, y ningún método de teardown expuesto.
