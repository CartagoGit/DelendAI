---
id: v00135
title: "Los presets swarm y full superan su presupuesto duro porque cada capability interna nueva sigue publicando una tool"
kind: perf
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# v00135 — Los presets swarm y full superan su presupuesto duro de tokens

## Goal

Devolver `swarm` y `full` por debajo de su presupuesto duro sin retirar
capacidades, decidiendo qué superficie ve el LLM por defecto.

## why

`bun run tokens:gate` está en rojo con dos breaches duros medidos hoy:

| preset | tools | tools/list | warning | hard | exceso |
|---|---:|---:|---:|---:|---:|
| swarm | 188 | 235,307 B | 204,000 | 210,000 | **+12,0%** |
| full | 218 | 268,758 B | 236,000 | 256,000 | **+5,0%** |
| managed | — | 133,936 B | 132,000 | 144,000 | warning |
| dogfood | 220 | 291,520 B | 320,000 | 384,000 | ok |

El origen está localizado y no es un misterio: `proposals` aporta 75,527 B en
48 tools, el 25,9% de `full` y el 28,1% de `swarm`. Ningún otro plugin pasa del
5%.

No es una regresión puntual sino una tendencia. Sólo en las últimas jornadas el
plugin ha publicado `db_status`, `db_reconcile`, `db_rebuild`, `db_doctor`,
`db_verify`, `db_diff`, `conflicts`, `quarantine_list`, `quarantine_repair`,
`summary_backfill`, `search` y `compile_context`. Cada una está justificada por
separado. Sumadas hacen que `proposals` sea casi un protocolo dentro del
protocolo.

**Lo que esta proposal NO propone.** Fusionar tools en una mega-tool con
`z.discriminatedUnion`. Esa opción ya se evaluó y se descartó, y el argumento
está escrito en la cabecera de `plugins/proposals/src/lib/surface/disclosure.ts`:
mover 34 tools a una sola traslada el peso de nombres y descripciones al
`inputSchema` y no ahorra nada. Sigue siendo cierto, así que consolidar
`db_doctor`/`db_verify`/`db_diff`/`conflicts` en un `proposals_db_admin` con un
discriminador sería trabajo para no ganar bytes.

**Dónde está realmente la palanca.** El mecanismo correcto ya existe y ya está
poblado: `PROPOSALS_TOOL_DISCLOSURE` clasifica las 48 tools en `essential`,
`contextual` y `administrative`, y su propia documentación dice que
`administrative` debe ser *"always discoverable (searchTools/resolveRoute),
never a static tools/list line item"*. Hay 29 ids clasificados
`administrative`. La política está escrita y las tools están etiquetadas.

Lo que falta es que `native` la aplique. Hoy `native` lista las 48, porque
"native" significa precisamente superficie verbosa completa. De ahí que la
clasificación exista y el presupuesto siga desbordado: no hay ningún defecto de
etiquetado que corregir, hay una decisión de producto pendiente.

Por eso la proposal es una decisión, no un arreglo, y necesita respuesta
humana antes de tocar código.

## non-goals

- No retirar ninguna capability ni ninguna tool.
- No fusionar tools en una mega-tool con discriminador; ya descartado, ver arriba.
- No subir los presupuestos sin una decisión explícita: el gate es la única
  señal que hoy dice que la superficie crece más rápido que su presupuesto, y
  subir el número cada vez que molesta lo convierte en un adorno.

## Slices

- global_gate: none

### S1 — Decidir la política de superficie por defecto de `swarm` y `full`
- **Status**: pending
- **Files**: `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: none
- acceptance:
  - "Queda escrita cuál de las tres opciones se toma y por qué."
  - "Si la opción elegida cambia presupuestos, el nuevo número queda justificado con la medición que lo respalda."

Las opciones, con su coste:

1. **`native` respeta `administrative`.** Las 29 tools administrativas dejan de
   ser líneas estáticas y siguen siendo alcanzables por router/búsqueda. Es lo
   que la documentación de disclosure ya promete. Coste: `native` deja de
   significar "todo visible", y un host que enumere tools sin usar el router ve
   menos.
2. **`swarm` y `full` pasan a superficie gestionada por defecto**, y `native`
   queda como modo explícito de depuración. Coste: cambia el arranque por
   defecto de los agentes.
3. **Subir el presupuesto duro** a lo que hoy mide. Coste: se pierde la única
   alarma temprana que tenemos; la siguiente tanda de tools vuelve a romperlo y
   la conversación se repite con números mayores.

La recomendación es la 1: no cambia lo que un agente puede hacer, y hace que el
código cumpla lo que su propia documentación ya afirma.

## acceptance

- Queda escrita cuál de las tres opciones se toma y por qué.
- Si la opción elegida cambia presupuestos, el nuevo número queda justificado con la medición que lo respalda.

## notes

Medido el 2026-09-08 con `bun run tokens:gate` en modo `native` (el modo por
defecto del gate). La auditoría externa del mismo día señaló esta misma
tendencia de forma independiente.
