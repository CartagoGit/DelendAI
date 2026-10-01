---
id: r00036
title: "AUD-B03 — ratchet descendente de presupuestos: subir un techo exige excepción documentada con caducidad"
kind: refactor
status: done
type: refactor
track: tokens
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-B03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00283]
---

# r00036 — los techos sólo suben: ratchet descendente para el presupuesto de tokens

## Goal

Un lint nuevo (`lint:token-budget-ceiling-ratchet`) impide que cualquier
`hard`/`warning`/`marginalPluginHard`/`marginalPluginWarning` del
contrato (`token-budgets.constant.ts`) suba respecto al valor
comprometido en `tools/scripts/lint/token-budget-ceiling-ratchet.baseline.json`
salvo que el fichero del contrato lleve, junto al valor, un par de
comentarios `budget-exception-pending`/`budget-exception-expires` sin
caducar. Bajar un techo nunca requiere excepción. El `bumpPolicy` que ya
declaraba el contrato (`justify-the-cost`, `show-the-benefit`,
`attempt-a-compensation`, `document-the-decision`) deja de ser prosa sin
verificación.

## why

Los propios comentarios del contrato documentan la deriva: *"the
current 69,115 B roster needs a small, explicit guard band"* →
`lean.toolsList.hard: 70_000`; *"the bump covers that cost plus a small
safety margin"* → `swarm.toolsList.hard: 210_000`. `minimal` mide
58.634 B contra `warning: 58_000` (ya superado) con `hard: 64_000` (9%
de margen) — un techo fijado justo por encima de la medición, no un
límite de diseño.

`bumpPolicy` existe desde antes de esta propuesta con cuatro pasos
declarados, pero **nada comprobaba que se hubieran seguido**: subir un
número y hacer commit pasaba el gate igual que bajarlo. El presupuesto
acababa siendo un registro de lo que ya había pasado, no un límite de lo
que podía pasar — y ya se había materializado dos veces según los
propios comentarios del fichero.

## why this design

La solución mínima que sugiere el informe ("convertir `warning` en fallo
cuando lleva N días superado") no ataca la causa: no impide la subida en
sí, sólo penaliza tarde a quien ya la hizo. La arquitectura elegida es el
mismo patrón que el repo ya usa para el problema estructuralmente
idéntico de `capabilities-declared.script.ts`
(`capabilities-pending`/`capabilities-migration-due`): una excepción
declarada junto al valor que la necesita, con una fecha de caducidad
obligatoria, verificada por un lint que compara contra un snapshot
comprometido. Reutilizar la forma en vez de inventar una segunda es
deliberado — el propio informe lo pide explícitamente ("es el mismo
patrón... hay que aplicarlo aquí").

La pieza que sí es nueva (las capabilities no la necesitan) es el
**snapshot comprometido**: sin él no hay "antes" contra el que detectar
una subida. Se modela igual que el ratchet de
`typecheck.script.ts`/`file-conventions.script.ts` — un JSON con
`--update` como única vía de mover el suelo — pero con una verificación
adicional que esos dos ratchets no tienen: `--update` en sí mismo se
niega a hornear una subida que no tenga una excepción válida en el
momento de ejecutarse. Esto cierra el hueco que dejaría un ratchet
"honesto por convención": alguien podría subir el número y correr
`--update` sin más, exactamente el patrón que provocó `AUD-B03`.

Se decidió **no** implementar la reversión automática (reescribir el
fichero fuente cuando caduca una excepción). El lint sólo detecta y
falla — la reversión la hace un humano, deliberadamente, igual que
cualquier otro fallo de gate en este repo. Automatizar la escritura del
`.ts` del contrato añadiría una superficie de escritura no solicitada
sobre un fichero que un humano lee y comenta a mano.

## non-goals

- No se cambia ningún valor de techo como parte de esta propuesta más
  allá de los ya fijados por `x00283` — este refactor blinda los
  valores, no los recalibra. Si una medición real ya supera un techo
  (ver Acceptance/Notes), se reporta como hallazgo, no se sube el techo
  para que el gate pase.
- No se implementa la reversión automática del valor tras la caducidad
  — ver "why this design".
- No se extiende el mecanismo a presupuestos fuera de
  `token-budgets.constant.ts` (por ejemplo, límites de cobertura de
  tests o baselines de lint) — el ámbito es estrictamente el presupuesto
  de tokens que audita `AUD-B03`.
- No se toca `run-actual-preset-budget.script.ts` (`tokens:gate`): ese
  gate mide bytes reales contra el techo vigente; el ratchet vive en un
  lint independiente (`tokens:ceiling-ratchet`) que compara el propio
  contrato contra su historial, no contra una medición.

## architecture

```
token-budgets.constant.ts (fuente)
  // budget-exception-pending: presets.swarm.toolsList.hard
  // budget-exception-expires: 2026-09-30
  hard: 210_000,

token-budget-ceiling-ratchet.baseline.json (snapshot comprometido)
  { "presets.swarm.toolsList.hard": 210000, ... }   // suelo actual

token-budget-ceiling-ratchet.script.ts (lint)
  flattenTokenBudgetCeilings(TOKEN_BUDGETS)   → current  (dotted.path -> number)
  loadRatchetBaseline(baseline.json)          → baseline (dotted.path -> number)
  parseBudgetExceptions(source de .ts)        → exceptions[]

  para cada key:
    current <= baseline           → OK, sin excepción
    baseline[key] === undefined   → primera observación, OK
    current > baseline, sin exception          → FALLA (raised-without-exception)
    current > baseline, exception caducada     → FALLA (exception-expired)
    current > baseline, exception vigente      → OK (no se hornea sola)

  --update:
    si hay alguna key subida sin excepción vigente → SE NIEGA, no escribe
    si no                                          → baseline = current
```

`flattenTokenBudgetCeilings` recorre `toolPayloads` y `presets`
genéricamente (cualquier objeto con un campo numérico `hard` cuenta como
techo), así que cubre los seis presets gobernados, sus
`overviewCompact`/`roundContext` opcionales, y los `toolPayloads.*` —
"cualquier techo", como pide `AUD-B03`, no sólo `toolsList`.

## slices

### S1 — lint + baseline inicial

- **Status**: done
- **Files**: [`tools/scripts/lint/token-budget-ceiling-ratchet.script.ts`, `tools/scripts/lint/token-budget-ceiling-ratchet.baseline.json`, `tools/tests/lint/token-budget-ceiling-ratchet.spec.ts`]
- **Gate**: `bunx vitest run --project tools -- tools/tests/lint/token-budget-ceiling-ratchet.spec.ts && bun tools/scripts/lint/token-budget-ceiling-ratchet.script.ts`

Los cuatro comportamientos exigidos, cada uno con su propio test: subir
`hard` sin excepción falla; con excepción caducada falla; con excepción
vigente pasa; bajar siempre pasa (más casos auxiliares: primera
observación, `--update` se niega sobre una excepción caducada,
`parseBudgetExceptions` sobre fuente sintética). El baseline inicial se
generó con `--update` sobre el estado ya honesto que deja `x00283` (50
techos, ninguno pendiente de excepción).

### S2 — wiring en `package.json` y `validate`

- **Status**: done
- **Files**: [`package.json`]
- **Gate**: `bun run tokens:ceiling-ratchet`

Nuevo script `tokens:ceiling-ratchet`, encadenado en `validate` justo
después de `tokens:gate` y antes de `tokens:dashboard:check` — mismo
punto que ocupa conceptualmente en la secuencia de S4 del plan.

## dependency graph

Depende de `x00283`: el ratchet sólo tiene sentido sobre techos
honestos (sin el `?? 0` que producía "over hard (0B)" en cuatro
presets). El baseline inicial de esta propuesta se tomó DESPUÉS de que
`x00283` fijara los cuatro techos marginales que faltaban.

## acceptance

1. Subir un `hard`/`warning`/`marginalPluginHard`/`marginalPluginWarning`
   sin `budget-exception-pending` ⇒ `bun run tokens:ceiling-ratchet`
   falla.
2. Subir con una excepción cuya `budget-exception-expires` ya pasó ⇒
   falla.
3. Subir con una excepción vigente ⇒ pasa.
4. Bajar cualquier techo ⇒ siempre pasa, con o sin excepción.
5. `--update` se niega a hornear una subida que no tenga excepción
   vigente en el momento de ejecutarse.

## risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| El baseline JSON queda desincronizado si alguien edita el contrato sin correr `--update` y sin que el lint lo detecte | El lint compara el contrato importado en vivo (`TOKEN_BUDGETS`) contra el JSON en cada ejecución — no hay caché ni estado intermedio que pueda desincronizarse silenciosamente |
| Alguien añade una excepción con una fecha de caducidad lejana para evitar el gate indefinidamente | El lint no impone un máximo de días, pero el `bumpPolicy` documentado y el propio comentario en el fichero fuente quedan en el diff del PR — es una decisión visible en revisión de código, no oculta |
| El parser de comentarios (`parseBudgetExceptions`) es sensible a que `budget-exception-expires` sea la siguiente línea no vacía tras `budget-exception-pending` | Documentado explícitamente en el JSDoc del script; los tests cubren el caso "sin línea de expiración" (se ignora, no se cuela como excepción válida) |

## notes

Medición al cerrar esta propuesta (mismo snapshot que `x00283`,
compartiendo worktree con el agente que trabaja en paralelo sobre
`packages/core/src/lib/plugins/managed-lazy-runtime.ts` y ficheros
relacionados — fuera del territorio de esta propuesta): las superficies
de `overview full` (11.727 B) y `overview compact` (1.651 B) del
fixture del dashboard midieron por encima de sus techos ya existentes
(`hard: 11_100`/`1_500`) en el momento de generar el dashboard final.
Esos dos techos NO pertenecen al alcance de `AUD-B02`/`AUD-B03` (son
`toolPayloads.overviewFull`/`overviewCompact`, no un `toolsList` de
preset) y no se tocan aquí — se reportan tal cual, sin subirlos, porque
subir un techo para que el gate pase es exactamente el vicio que este
refactor existe para bloquear. Si al reintegrar esta rama la medición
sigue por encima, es un hallazgo nuevo que necesita su propia propuesta
(o una excepción documentada con este mismo mecanismo), no un ajuste
silencioso aquí.
