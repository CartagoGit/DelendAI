---
id: c00157
title: "Ratchet lint: todo `type`/`interface` exportado empieza por `I`"
kind: chore
status: done
type: proposal
track: conventions
date: 2026-08-28
priority: P2
related:
    - c00125 # solid-compliance.script.ts — mismo idioma de ratchet
    - c00126 # types-in-contracts.script.ts — mismo idioma de ratchet (baseline por fichero)
---

# c00157 — Ratchet lint: todo `type`/`interface` exportado empieza por `I`

## Goal

Añadir un lint de tipo **ratchet** (`type-naming.script.ts`) que exija
que todo `export type` / `export interface` del repo empiece por `I`
(p. ej. `IThing`, nunca `Thing`), en línea con la convención ya
mayoritaria del código (~83% de las declaraciones ya la cumplen). Un
baseline JSON por fichero registra la deuda actual; el lint falla solo
cuando el conteo de un fichero **sube** o aparece un fichero nuevo con
violaciones — la deuda existente se permite, la deuda nueva no, y el
baseline solo puede bajar.

## why

El usuario detectó violaciones introducidas en esta misma rama
(`ActivationDenialCode`, `HasRecordedAck`, `FunnelStage`,
`SelfTestCheckId`, `ProtectionFetchResult`, `ProbeOutcome`,
`ProbeInputBuilder`) y pidió que el lint garantice que **todos** los
`type`/`interface` exportados sigan el prefijo `I`, para homogeneidad
en todo el repo. Sin un gate, cada agente/sesión puede reintroducir el
mismo defecto — como pasó aquí.

Medición reproducida en esta sesión (no confiar en una cifra ajena sin
volver a correrla):

```
grep -rnE '^\s*export (type|interface) [A-Za-z]' packages/*/src plugins/*/src tools apps/web/src extensions/*/src --include='*.ts' --include='*.tsx' | grep -v '/dist/' | grep -v '\.d\.ts'
```

da 3167 declaraciones, 2605 ya prefijadas con `I`, **562** sin
prefijo. Un escaneo propio con AST-lite (multi-línea, genéricos,
`.tsx`, listas `export { type Foo } from '...'`) sobre los mismos
roots más `tools/` encuentra **582** violaciones en bruto sobre 3290
declaraciones — la diferencia frente a las 562 originales es ruido de
grep de una sola línea (genéricos `export type Foo<T> =`, listas de
re-exportación) que sí detecta el escaneo del lint.

De esas 582, **268 viven en ficheros generados**
(`packages/core/src/generated/**`, `*.generated.ts`) — nombres que no
elige una persona, así que no cuentan como deuda humana. Descontando
generados, specs/tests (2 más, insignificante) y sumando las ~23
violaciones adicionales que sí detecta el escaneo de listas de
re-exportación internas, el **baseline real que persiste el lint es de
327 violaciones en 204 ficheros** (bajado a **320 en 198 ficheros**
tras las 7 renombradas más abajo). `packages/core` sigue siendo, con
diferencia, el mayor bloque de deuda restante (fuera del territorio de
esta propuesta — lo trabaja otro agente en paralelo); el resto se
reparte sobre todo entre `plugins/proposals` (39),
`plugins/orchestrator-runner` (27) y `tools/scripts` (29).

## why this design

Mismo idioma que `types-in-contracts.script.ts` y
`solid-compliance.script.ts` (c00125/c00126): baseline JSON por
fichero, `--update` para re-grabar, `--report` para solo contar,
exit 0/1. Una arquitectura nueva (AST real, ESLint rule propia)
sería más precisa pero rompería la homogeneidad que el usuario pidió
explícitamente ("el codebase debería ser homogéneo") — los scripts de
lint de este repo son deliberadamente regex + `node:fs`, sin
dependencias de un compilador, para mantenerse rápidos y sin estado.
Un ratchet (no zero-tolerance) es la única opción viable con 320
violaciones pre-existentes: un lint duro bloquearía `validate` para
todo el equipo en la primera ejecución.

## non-goals

- **Drenar las ~320 violaciones restantes.** Es trabajo de
  seguimiento (mayormente `packages/core`, fuera de este territorio
  por estar otra sesión trabajando ahí en paralelo; después
  `plugins/proposals`, `plugins/orchestrator-runner` y
  `tools/scripts`). Esta propuesta solo instala el gate + corrige las
  7 violaciones introducidas en esta misma rama.
- **AST real / type-checker.** El enfoque regex-sobre-texto es
  suficiente para esta convención (nombre en la línea de declaración)
  y coherente con el resto de `tools/scripts/lint/*`.
- **Decidir si los tipos `*Props` de componentes React/Astro deben
  llevar `I`.** Ver "notes" — se deja abierto a decisión del usuario;
  el lint por ahora **no los exime** (cuentan como violación,
  pagable en el burn-down).
- **Renombrar tipos zod-inferred (`z.infer<...>`) o alias de unión de
  literales de string como categoría exenta.** Se decidió
  explícitamente NO eximirlos — ver "notes".

## architecture

`tools/scripts/lint/type-naming.script.ts` escanea
`packages`, `plugins`, `apps`, `extensions`, `tools` (a diferencia de
`types-in-contracts`, que excluye `tools/` — aquí se incluye porque
los 7 offenders originales del usuario viven en parte en
`tools/scripts/`).

Detección por fichero, sobre el contenido completo (no solo
línea-a-línea) para capturar:

- `export type Foo<T> = ...` (genéricos).
- `export interface Foo extends Bar {` con cuerpo multi-línea (basta
  con matchear la línea de declaración).
- `.tsx`.
- `export type { Foo, Bar as Baz } from '...'` — listas de
  re-exportación, incluso multi-línea.

Una declaración cuenta como violación si el nombre exportado no
matchea `/^I[A-Z0-9]/`.

Exenciones (una por línea, con justificación):

- `*.spec.ts` / `*.test.ts` — fixtures de test, no superficie pública.
- `*.d.ts` — declaraciones ambient que no autoramos nosotros.
- `*.generated.ts` y cualquier ruta bajo `generated/` — nombres
  producidos por una herramienta, no una elección humana (268 de las
  582 violaciones en bruto caen aquí, casi todas en
  `packages/core/src/generated/`).
- `export type { Foo } from '<paquete-de-terceros>'` — re-exportación
  de un nombre que no nos pertenece, no se puede renombrar sin un
  wrapper. Los alias internos (`.`, `/`, `#`, `@mcp-vertex/*`) NO
  cuentan como terceros y se siguen lintando igual.

Deliberadamente NO exentos (y por qué):

- **Tipos zod-inferred** (`z.infer<...>`). El nombre lo elegimos
  nosotros igual que cualquier otro `type`; de hecho
  `IGitHubBranchProtectionResponse` (uno de los ficheros tocados en
  esta rama) ya sigue la convención con zod-infer, demostrando que no
  hay obstáculo técnico.
- **Alias de unión de literales de string** (`type Foo = 'a' | 'b'`).
  Es exactamente el patrón de uno de los 7 offenders renombrados aquí
  (`ActivationDenialCode` → `IActivationDenialCode`), así que el
  propio caso de uso que motivó esta propuesta demuestra que deben
  contar.

## Slices

### S1 — Lint ratchet + baseline + spec

- **Status**: done
- **Files**:
    - `tools/scripts/lint/type-naming.script.ts` (nuevo)
    - `tools/scripts/lint/type-naming.script.spec.ts` (nuevo)
    - `tools/scripts/lint/type-naming.baseline.json` (nuevo)
    - `package.json` (`lint:type-naming` + inserción en `validate`)
    - `.github/workflows/ci.yml` (línea en el job `lint architecture`)
- **Gate**: `bunx vitest run tools/scripts/lint/type-naming.script.spec.ts`,
  `bun tools/scripts/lint/type-naming.script.ts`

### S2 — Corregir las 7 violaciones introducidas en esta rama

- **Status**: done
- **Files**:
    - `plugins/external-mcps/src/lib/activation/activation-policy.interface.ts`
      (`ActivationDenialCode` → `IActivationDenialCode`)
    - `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`
      (`HasRecordedAck` → `IHasRecordedAck`)
    - `plugins/error-reporting/src/lib/contracts/interfaces/funnel-counters.interface.ts`,
      `plugins/error-reporting/src/public/index.ts`,
      `plugins/error-reporting/tests/funnel-counter-store.spec.ts`
      (`FunnelStage` → `IFunnelStage`)
    - `plugins/error-reporting/src/lib/contracts/interfaces/self-test.interface.ts`,
      `plugins/error-reporting/src/public/index.ts`
      (`SelfTestCheckId` → `ISelfTestCheckId`)
    - `tools/scripts/ci/lib/github-protection.lib.ts`
      (`ProtectionFetchResult` → `IProtectionFetchResult`)
    - `tools/scripts/verify/verify-probes.ts`
      (`ProbeOutcome` → `IProbeOutcome`, `ProbeInputBuilder` →
      `IProbeInputBuilder`)
- **Gate**: `bunx vitest run --project tools --project external-mcps --project error-reporting`,
  `bun tools/scripts/typecheck.script.ts`, `bun tools/scripts/lint/type-naming.script.ts --update`
  (baseline debe bajar de 327 a 320)

## dependency graph

S2 depende de que S1 exista (el lint es lo que hace visible las 7
violaciones y lo que graba el baseline final tras corregirlas); no hay
paralelismo posible entre ambas. Ninguna otra propuesta abierta toca
estos ficheros.

## acceptance

- `bun tools/scripts/lint/type-naming.script.ts` sale 0 contra el
  baseline en HEAD.
- Añadir un `export type` sin prefijo `I` en un fichero limpio hace
  fallar el lint (exit 1); quitarlo vuelve a exit 0. Probado en vivo
  en esta sesión.
- `bunx vitest run --project tools --project external-mcps --project error-reporting`
  en verde.
- `bun tools/scripts/typecheck.script.ts` sin errores nuevos
  atribuibles a los renombrados (otra sesión tiene cambios en vuelo en
  `packages/core`/`packages/client`/`packages/cli`/`extensions/vscode`;
  cualquier error ahí es preexistente, no de esta propuesta).
- `bun tools/scripts/lint/proposals.script.ts` sin errores ni warnings
  sobre este fichero.
- Baseline: 320 violaciones en 198 ficheros (bajado desde 327/204 al
  corregir los 7 offenders de S2).

## risks and mitigations

- **Riesgo: el baseline se vuelve un cementerio permanente si nadie
  drena la deuda.** Mitigación: mismo patrón que
  `types-in-contracts`/`solid-compliance`, que sí han bajado con el
  tiempo; el mensaje de error del lint indica explícitamente
  "baseline shrank" cuando corresponde, incentivando el pago
  incremental.
- **Riesgo: falsos positivos en re-exportaciones internas complejas
  (alias anidados, `export * as X`).** Mitigación: el patrón
  `export * as X` no declara nombres de tipo individuales y no lo
  detecta el regex (ni falso positivo ni falso negativo relevante);
  los alias `as` dentro de listas `{ }` sí se resuelven explícitamente
  en el engine, cubierto por el spec.
- **Riesgo: renombrar los 7 offenders rompe algo que dependía del
  nombre exacto (imports externos, snapshots).** Mitigación: `grep`
  de cada nombre antiguo confirma cero referencias residuales tras el
  rename; los tests de los tres proyectos afectados
  (`tools`/`external-mcps`/`error-reporting`) se corrieron en verde
  post-rename.
- **Riesgo: incluir `tools/` en el scan (a diferencia de
  `types-in-contracts`) sorprende a quien mantiene ese lint hermano.**
  Mitigación: documentado explícitamente en el header del script y en
  esta propuesta — es una decisión deliberada porque los offenders
  originales viven en parte en `tools/scripts/`.

## notes

Categorías sobre las que el usuario debería pronunciarse (no
resueltas unilateralmente por esta propuesta):

- **Tipos `*Props` de componentes React/Astro** (p. ej.
  `interface ThingProps`). Es una convención muy asentada en el
  ecosistema React/Astro/TSX; forzar `IThingProps` rompería esa
  legibilidad reconocible para cualquiera que lea el JSX/TSX. Por
  ahora el lint **no los exime** (siguen contando como violación en
  el baseline), pero antes de intentar drenarlos en un burn-down
  futuro convendría que el usuario decida si quiere esa excepción
  explícita o prefiere homogeneidad total incluyendo Props.
- Se midieron 9 tipos/interfaces `*Props` en `apps/shared` y
  `apps/web`; volumen pequeño, no bloquea nada, pero es la categoría
  con el argumento de exención más fuerte de las evaluadas.

Ficheros de referencia:

- `tools/scripts/lint/type-naming.script.ts`
- `tools/scripts/lint/types-in-contracts.script.ts` (idioma copiado)
- `tools/scripts/lint/solid-compliance.script.ts` (idioma copiado)
