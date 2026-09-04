---
id: x00295
title: "AUD-D07 — el guard de verify:tools deja de enumerar literales de IToolEffect"
kind: fix
status: done
type: fix
track: security
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D07
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, x00294]
---

# x00295 — el guard de `verify:tools` deja de enumerar literales de `IToolEffect`

## Goal

Que ninguna herramienta que declare efectos secundarios
(`IToolEffect`: `write`, `spawn`, `network`, `destructive`) se invoque
con `{}` durante el arnés `verify:tools`, arreglando el guard de raíz —
sin re-enumerar los literales del union, para que la siguiente
desincronización sea un error de compilación y no un bug silencioso.

## Why

`runEmptyInputProbe` (`tools/scripts/verify/verify-probes.ts`) protege
al arnés `verify:tools` de invocar con `{}` herramientas que declaran
efectos. Su propio comentario explica el peligro con precisión:
*"invoking them with `{}` would execute real subprocesses (e.g.
`run_quality` running `vitest`, `tsc`, `bun run build`) and hang the
verify harness"*. El guard, antes de este fix, era:

```ts
tool.effects.some((e) => e === 'spawn' || e === 'fs:write' || e === 'network')
```

El tipo real de `tool.effects[]` (`IToolEffect`, en
`packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`)
es `'write' | 'spawn' | 'network' | 'destructive'`. De los tres
literales comparados, `'fs:write'` no existe en el union —es un typo de
`'write'`— y `tsc` ya lo señala:

```
tools/scripts/verify/verify-probes.ts(93,28): error TS2367: This comparison
  appears to be unintentional because the types
  '"destructive" | "network" | "write"' and '"fs:write"' have no overlap.
```

(El mensaje de `tsc` muestra el union sin `spawn` porque el propio
`some(...)` ya lo había descartado por control-flow narrowing en la
rama anterior del `||` — `spawn` sí es un miembro real y esa
comparación sí funciona. La comparación muerta es únicamente
`'fs:write'`.)

Impacto medido: **33 herramientas** declaran `effects: ['write']`
(`grep -rn "effects: \['write'\]" plugins/*/src --include='*.ts' | wc -l`)
— entre ellas `memory_compact`, `external-mcps ack` e
`issues ingest_issue` — y ninguna se saltaba: el guard sólo cubría
`'network'` (que funciona) y `'spawn'` (que también funciona, pero por
casualidad de qué tools lo usan). `'destructive'`, el efecto más
peligroso del union, no estaba contemplado en absoluto — ni siquiera
como literal mal escrito. El arnés invocaba con `{}` cualquier
herramienta `write`/`destructive` cuyo `inputSchema` aceptara un
payload vacío.

Nadie vio el `TS2367` porque `tools/` no se typechecaba (`AUD-A12`,
`x00294`) — de ahí que ambos hallazgos entren juntos en la misma
secuencia de `q00011`: este fix no debe fusionarse sin `x00294`, o el
próximo guard roto volverá a pasar desapercibido.

## Why this design

La solución mínima —corregir los tres literales a los del union real—
deja el problema de fondo intacto: un módulo (`verify-probes.ts`)
re-enumerando a mano los miembros de un union declarado en otro
(`tool-registration.interface.ts`). Es exactamente el patrón que causó
el bug: dos listas que deberían ser una sola se desincronizaron.

La solución elegida no enumera literales en absoluto: si
`tool.effects` no está vacío, no se sondea. Cualquier efecto declarado
—presente o futuro— es motivo suficiente para no invocar con entrada
vacía. Esto hace imposible que un nuevo miembro de `IToolEffect` quede
sin cubrir por descuido en este guard concreto.

Como contrapeso —el propio guard ya no ejercita el union, así que no
hay ninguna garantía de que siga conociendo su forma real— se añade un
canario de exhaustividad (`describeEffect`, un `switch` con `never` en
el `default`) que sí enumera los cuatro miembros actuales, con el único
propósito de que `tsc` rompa la compilación el día que `IToolEffect`
gane un miembro nuevo, forzando a quien lo añada a mirar este fichero.
`describeEffect` se usa además en el mensaje `detail` del resultado
`needs-input`, así que no es código muerto: describe con qué efecto se
saltó cada herramienta.

## Non-goals

- No tocar `IToolEffect` en
  `tool-registration.interface.ts` — pertenece al territorio de otro
  agente en este momento y el union en sí no tiene ningún bug.
- No cambiar el comportamiento del *happy-path probe*
  (`runHappyPathProbe`) — sólo conoce tres IDs por nombre y no usa
  `effects` en absoluto.
- No arreglar los otros 94/97 errores de `tsc -p tools/tsconfig.json`
  no relacionados con este guard — eso es `x00294`.
- El fix del `TS2367` gemelo en
  `tools/scripts/lint/no-internal-imports.script.ts:164` (la nota
  adyacente del hallazgo) se resuelve en este mismo proposal por
  compartir fichero de territorio y baseline, pero es un bug
  independiente (walker de directorios, no de efectos) — ver Slices/S3.

## Architecture

- `verify-probes.ts`: nueva función pura `declaresAnyEffect(effects)`
  — un type-guard sobre `readonly IToolEffect[] | undefined` que
  sustituye la comparación `.some(...)` contra literales sueltos.
  `runEmptyInputProbe` la usa como guard de entrada, antes de llegar al
  gate de `inputSchema`.
- Nueva función pura y exportada `describeEffect(effect: IToolEffect)`
  — el canario de exhaustividad — usada para formatear el `detail` del
  resultado `needs-input`.
- El parámetro deja de tiparse como `string` implícito: se importa
  `IToolEffect` desde `@mcp-vertex/core/public` (ya exportado) y se usa
  en las firmas de `declaresAnyEffect` y `describeEffect`, así que un
  literal inexistente es un error de compilación, no una comparación
  que evalúa a `false` en silencio.
- `tools/scripts/lint/no-internal-imports.script.ts`: el `walk()` que
  recorre directorios dejaba tipar `entries` con
  `Awaited<ReturnType<typeof readdir>>` — la firma genérica de una
  función sobrecargada sin llamar, que resuelve más ancha que la
  llamada real y arrastra la sobrecarga que devuelve `Buffer`. Se
  sustituye por inferencia directa del `await readdir(...)` real (que
  sí resuelve a `Dirent[]` con `name: string`), sin castear nada. Se
  decide **arreglar y conectar** el script en vez de borrarlo — ver
  Notes.

## Slices

### S1 — el guard deja de enumerar literales; canario de exhaustividad

- **Status**: done
- **Files**: `tools/scripts/verify/verify-probes.ts`, `tools/scripts/verify/verify-probes.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/scripts/verify/verify-probes.spec.ts`

### S2 — verificación end-to-end contra el arnés real

- **Status**: done
- **Files**: (sin cambios de código; slice de verificación)
- **Gate**: `bun run verify:tools` — confirma que `memory_compact`, `external-mcps ack` e `issues ingest_issue` (los tres citados en `AUD-D07`) aparecen como `needs input`, no `ok`

### S3 — arreglar y conectar `no-internal-imports.script.ts` (nota adyacente)

- **Status**: done
- **Files**: `tools/scripts/lint/no-internal-imports.script.ts`, `package.json`
- **Gate**: `bun tools/scripts/lint/no-internal-imports.script.ts` (0 violaciones, ya no desciende a `node_modules`); `bunx tsc --noEmit -p tools/tsconfig.json` (sin `TS2367` en este fichero)

## Dependency graph

```
S1 ──► S2
S3 (independiente de S1/S2 — mismo fichero de territorio, bug distinto)
```

`x00294` no es una dependencia de build de este proposal, pero ambos
deben aterrizar juntos: sin `x00294`, `tsc` vuelve a no ver este
fichero y el próximo guard roto pasa desapercibido otra vez (ver Why).

## Acceptance

1. Una herramienta con `effects: ['destructive']`, `['write']` o
   `['network']` produce `needs-input` en `runEmptyInputProbe` y su
   `invoke`/`invokeRaw` NO se llama. Antes de este fix, `destructive` y
   `write` fallaban esta aserción (se invocaban); `network` y `spawn`
   ya pasaban.
2. Una herramienta sin `effects` declarados SÍ se sondea (el handler se
   invoca).
3. Un `switch` exhaustivo sobre `IToolEffect` sin actualizar tras
   añadir un miembro nuevo al union rompe `tsc`, no sólo el test.
4. `bun run verify:tools` no invoca con `{}` ninguna de las 33
   herramientas con `effects: ['write']` citadas en el hallazgo.
5. `bunx tsc --noEmit -p tools/tsconfig.json` no reporta `TS2367` en
   `verify-probes.ts` ni en `no-internal-imports.script.ts`.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Saltarse el sondeo de TODA herramienta con cualquier efecto reduce la cobertura de `verify:tools` frente a corregir sólo los tres literales | Es la intención: el sondeo de *happy-path* (`runHappyPathProbe`) y el test suite propio de cada plugin siguen cubriendo esas herramientas; el arnés de entrada vacía nunca fue la única barrera para tools con efectos, y ahora es honesto sobre eso |
| El canario de exhaustividad se vuelve código muerto si nadie lo lee al fallar `tsc` | Se usa también para el `detail` del resultado — no es un `switch` aislado, así que aparece en cualquier fallo real de CI, no sólo en la compilación |
| Conectar `no-internal-imports.script.ts` a `validate` introduce hallazgos nuevos en el resto del repo | Medido antes de conectarlo: 0 violaciones hoy; si aparece alguna en el futuro es una regresión real del boundary `@internal`, no ruido |

## Notes

- Evidencia reproducida en este slice, no sólo citada del audit: un
  spec temporal que invocaba `runEmptyInputProbe` con cada miembro de
  `IToolEffect` confirmó que `destructive` y `write` fallaban
  (`outcome: 'ok'`, handler invocado) contra el código pre-fix, y que
  `network`/`spawn` ya pasaban — el fix mínimo habría podido limitarse
  a corregir el `'fs:write'` typo, pero se optó por la solución
  arquitectónica según pide el hallazgo.
- Decisión sobre `no-internal-imports.script.ts`: **arreglar y
  conectar**, no borrar. A diferencia de lo que sugiere el nombre
  parecido, no es un duplicado de `no-internal-core-imports.script.ts`
  (que bloquea importar `packages/core/src/lib` desde fuera del core):
  este script enforza una convención distinta y más amplia —cualquier
  símbolo que termine en `Internal`, o el subpath
  `@mcp-vertex/core/_internal`, sólo puede consumirse dentro de
  `packages/core/**`— documentada en su cabecera como b00238 (Track N /
  q00006 §50), con una spec suite de 179 líneas que ya lo ejercita a
  fondo. Borrar 242 líneas de enforcement real y su spec porque nunca
  se conectó habría sido perder protección, no limpiarla. Se conecta
  vía `lint:internal-naming` en `package.json`, dentro de `validate`,
  junto a `lint:cli-imports`.
