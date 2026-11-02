---
id: x00288
title: "AUD-D01 — lint de fronteras de efectos: prohibir imports directos de node:child_process/fs/net/http en plugins"
kind: fix
status: done
type: fix
track: security
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011]
---

# x00288 — lint de fronteras de efectos (`node:child_process`/`fs`/`net`/`http`)

## Goal

Que ningún plugin pueda ejecutar un efecto secundario (spawn de
proceso, escritura de fichero, socket de red) importando directamente
un módulo builtin de Node, saltándose por completo la capa declarativa
de efectos (`IToolEffect`, `ctx.effects`, `guardEffectCapability`,
`runWithDryRunGate`) — vía un lint de fronteras que sea un ratchet en
CI, con baseline medida en vivo (no asumida) y un mecanismo explícito y
greppable para adaptadores autorizados.

## Why

`lint:capabilities` (`capabilities-declared.script.ts`) detecta uso de
capabilities con **tres expresiones regulares textuales** sobre
`ctx.capabilities.<group>.<action>(...)`. Un plugin que en cambio
importe `node:child_process` o `node:fs` directamente es invisible para
ese lint: no hay ningún uso de `ctx.capabilities` que detectar, no hay
ninguna discrepancia, y el lint reporta éxito.

Evidencia medida en este slice (no sólo citada del audit):

```
$ grep -rln "node:child_process" plugins/*/src | sed 's#plugins/\([^/]*\)/.*#\1#' | sort -u | wc -l
13
```

Ese `13` es el número citado por el audit — pero es el recuento de
**plugins** que importan **únicamente `node:child_process`** con una
búsqueda textual de `from '...'`. Al construir el escáner real pedido
por el hallazgo (`node:child_process`, `node:fs`, `node:fs/promises`,
`node:net`, `node:http`, `node:https`, `node:dgram`, con y sin el
prefijo `node:`, incluyendo `require(...)` dinámico, sobre
`plugins/**/src/**` excluyendo specs/tests) el número real es:

```
$ bun tools/scripts/lint/effect-boundaries.script.ts --report
effect-boundaries: 100 files / 104 violations across 35 plugin(s)
```

**104 violaciones en 100 ficheros, en 35 plugins** — no 13. La
discrepancia tiene dos causas independientes, ambas confirmadas al
comparar el escáner real contra la búsqueda textual del audit:

1. El `13` del audit sólo cuenta `node:child_process`. Los otros seis
   módulos objetivo (`fs`, `fs/promises`, `net`, `http`, `https`,
   `dgram`) añaden 22 plugins más — `fs`/`fs/promises` son, con
   diferencia, los más usados (config, locks, colas persistentes).
2. Incluso restringido a `node:child_process`/`fs`, una búsqueda
   textual de `from '...'` sub-cuenta: tres ficheros del plugin
   `proposals` (`index-reader-fs.ts`, `locate-fs.ts`,
   `proposal-id-allocator-fs.ts` — puertos de fs con nombre explícito)
   cargan el builtin vía `require('node:fs/promises')` dinámico, no
   `import ... from`, y una búsqueda de sólo `from` los pasa por alto
   igual que el propio `lint:capabilities` pasa por alto los imports
   directos.

Esto no invalida el hallazgo — lo confirma con más fuerza: el
"inventario fiable de qué plugin puede escribir, ejecutar o llamar a la
red" que el audit dice que no existe, en efecto no existe, y es
sustancialmente más grande de lo que la evidencia rápida del audit
sugería.

## Why this design

La solución mínima que pide el hallazgo es invertir la puerta: en vez
de "declara lo que enrutas" (que un plugin satisface trivialmente **no
usando** la capa), "no se permite importar el builtin crudo", con una
vía de escape explícita para adaptadores ya revisados.

Para el mecanismo de la vía de escape, el propio hallazgo señala el
patrón que el repo ya tiene: el marcador de comentario por fichero de
`capabilities-declared.script.ts` (`// capabilities-pending: ...` /
`// capabilities-migration-due: ...`, documentado ahí mismo como
"per-FILE"). Este proposal reutiliza esa idea — `//
effect-boundary-authorized: <razón, ≥ 12 caracteres>` en cualquier
parte del fichero exime el fichero completo — en vez de introducir un
segundo formato de waiver (`*.waivers.json`, el patrón de
`style-integrity`/`shared-ui-ratchet`) para el mismo problema. La
longitud mínima de 12 caracteres para la razón replica
`MIN_WAIVER_LENGTH` de esos mismos scripts: un waiver debe ser una
razón documentada, no un "TODO".

Para la estructura del propio script, se sigue al pie de la letra el
idioma de `types-in-contracts.script.ts` — que ya es exactamente este
patrón (ratchet por fichero, JSON baseline, `--update` lo reescribe, el
gate falla sólo cuando un fichero SUBE su cuenta o aparece un fichero
nuevo, regex hermético sin AST) — en vez de reinventar la forma con la
que `solid-compliance.script.ts` resuelve el mismo problema
(`--baseline=`/`--write-baseline=` explícitos). La homogeneidad con el
ratchet gemelo más cercano importa más que la preferencia del autor.

## Non-goals

- No implementar el `EffectBroker` (la "solución arquitectónica ideal"
  del hallazgo, con `dryRun` como frontera real de prevención) — eso es
  `AUD-D02` / `r00037`, y depende explícitamente de este proposal
  primero.
- No migrar ningún plugin de los 35 afectados a `ctx.effects` — el
  ratchet congela la deuda existente (104 violaciones baselineadas) y
  sólo bloquea deuda **nueva**; drenar la deuda existente es trabajo
  incremental posterior, plugin a plugin.
- No añadir todavía ningún marcador `effect-boundary-authorized` real —
  ninguno de los 100 ficheros actuales ha sido revisado como adaptador
  legítimo; ese juicio pertenece a quien conozca cada plugin, no a este
  slice.
- No tocar `capabilities-declared.script.ts` ni su vocabulario
  `group:action` — ese lint sigue existiendo para el problema que sí
  resuelve (detectar uso de capabilities no declarado); este es un lint
  nuevo e independiente para el problema que aquél no resuelve.

## Architecture

- `tools/scripts/lint/effect-boundaries.script.ts` (nuevo): motor puro
  `scanViolations(root) -> Record<relPath, count>` + `countEffectBoundaryViolations(body)`
  + `isAuthorizedAdapter(body)` + `groupByPlugin(current)`, y un shell
  CLI con `--update` (reescribe el baseline) y `--report` (sólo
  imprime el recuento, agrupado por plugin, en stderr) — misma forma
  que `types-in-contracts.script.ts`.
- Ámbito del escaneo: `plugins/**/src/**`, excluyendo `*.spec.ts`,
  `*.test.ts`, `*.d.ts`, `*.generated.ts`, y cualquier árbol bajo un
  directorio `tests/` o `__tests__/` (mismo `EXCLUDE_DIR` que
  `types-in-contracts.script.ts` — un `tests/src/**` de arnés de e2e no
  es código de producción del plugin aunque anide su propio `src/`).
- Detección: una regex por línea sobre
  `(?:from\s+|require\(\s*)['"](?:node:)?(child_process|fs\/promises|fs|net|https?|dgram)['"]`
  — cubre `import`, `import type`, y `require(...)` dinámico (la causa
  #2 de la discrepancia de arriba).
- `tools/scripts/lint/effect-boundaries.baseline.json` (nuevo): `{
  relPath: count }`, generado por `--update` a partir del escaneo real
  (104 violaciones / 100 ficheros — ver Why).
- Vía de escape: marcador de comentario `// effect-boundary-authorized:
  <razón>` en cualquier parte del fichero exime el fichero completo del
  recuento (no sólo la línea) — `isAuthorizedAdapter(body)` es una
  función pura y exportada, testeada por separado del recuento.

## Slices

### S1 — motor + CLI + baseline real medido

- **Status**: done
- **Files**: `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/effect-boundaries.baseline.json`
- **Gate**: `bun tools/scripts/lint/effect-boundaries.script.ts` (sale 0, 104 violaciones baselineadas)

### S2 — spec del lint (fixtures: violación, adaptador autorizado, fichero no-plugin, ratchet sólo-baja, --update)

- **Status**: done
- **Files**: `tools/scripts/lint/effect-boundaries.script.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/scripts/lint/effect-boundaries.script.spec.ts`

### S3 — registrar el gate (`package.json` + CI)

- **Status**: done
- **Files**: `package.json`, `.github/workflows/ci.yml`
- **Gate**: `bun run lint:effect-boundaries` sale 0; el step `lint architecture` de `.github/workflows/ci.yml` invoca el script

## Dependency graph

```
S1 ──► S2 ──► S3
```

`AUD-D02` (`r00037`, el `EffectBroker`) depende de este proposal: sin
la frontera de imports, un plugin de terceros podría seguir alcanzando
un efecto sin pasar nunca por el broker que `r00037` construye.

## Acceptance

1. Un fichero de plugin con `import { spawn } from 'node:child_process'`
   (o cualquiera de los otros seis módulos, con o sin prefijo `node:`,
   vía `import` o `require`) fuera de `plugins/**/src/**` no cuenta; el
   mismo import dentro de `plugins/**/src/**` sí cuenta.
2. El mismo import, en un fichero que además contiene `//
   effect-boundary-authorized: <razón ≥ 12 caracteres>`, no cuenta —
   ceroa el fichero completo. Una razón de menos de 12 caracteres NO
   autoriza (sigue contando).
3. Un fichero fuera de `plugins/**/src/**` (p. ej. `packages/core/src/**`
   o `tools/scripts/**`) nunca se escanea, sin importar qué importe.
4. El ratchet: un fichero nuevo con violaciones, o un fichero existente
   cuya cuenta SUBE por encima del baseline, es una regresión (exit 1);
   una cuenta igual o menor nunca lo es, y `--update` recongela el
   estado actual como el nuevo baseline.
5. `bun tools/scripts/lint/effect-boundaries.script.ts` sale 0 contra
   el baseline actual (104 violaciones, medidas en vivo el
   2026-08-27/28, no las 13 citadas por el audit — ver Why para la
   causa exacta de la diferencia).
6. `bunx vitest run --project tools` sigue en verde con la spec nueva
   incluida.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Regex por línea, sin AST: un import multilínea partido de forma inusual, o un alias de módulo que reexporte `node:fs`, puede escapar la detección | Mismo trade-off que todos los ratchets hermanos (`types-in-contracts`, `solid-compliance`): heurística rápida y sin dependencias, no un analizador completo; falsos negativos son un techo conocido, no una regresión de este slice |
| El marcador `effect-boundary-authorized` exime el fichero ENTERO, no sólo la línea — un fichero autorizado para un puerto de `fs` podría más tarde añadir un `spawn` sin revisión | Mismo modelo que `capabilities-pending` (que el propio hallazgo cita como precedente): la exención es por fichero porque la unidad de revisión real es el fichero-adaptador, no la línea; drenar hacia un broker real (`AUD-D02`) es la mitigación estructural, no este lint |
| 104 violaciones baselineadas de golpe congela mucha deuda de una vez, no 13 | Es la lectura honesta de la evidencia real (ver Why) — congelar 13 cuando el número real es 104 habría dejado 91 imports sin cubrir por el ratchet desde el día uno, el mismo defecto que el hallazgo denuncia en `lint:capabilities` |
| Un nuevo plugin legítimo que necesite `node:fs` (p. ej. un plugin de I/O de primera clase) queda bloqueado por defecto | Es la intención: declarar `// effect-boundary-authorized: <razón>` es una decisión explícita y revisable en el diff, no un silencio que un reviewer puede pasar por alto |

## Notes

- El número `104`/`100 ficheros`/`35 plugins` es reproducible con `bun
  tools/scripts/lint/effect-boundaries.script.ts --report`; no depende
  de este documento para ser creído.
- Se consideró (y se descartó) usar `*.waivers.json` en vez del
  marcador de comentario, por consistencia con
  `style-integrity`/`shared-ui-ratchet`. Se prefirió el marcador porque
  (a) es el mecanismo que el propio hallazgo AUD-D01 propone
  explícitamente citando `capabilities-pending`, y (b) evita introducir
  un segundo formato de waiver activo en el repo para el mismo tipo de
  problema (imports/capabilities de un plugin) cuando ya existe uno.
