---
id: x00424
title: "Corregir blockers de validate: residuos de cache y regresiones Biome"
kind: fix
status: review
type: proposal
track: general
date: 2026-09-02
last-transition-id: 65731caf-a4c7-47ed-b8a4-4d1481e12a9b
last-correlation-id: 65731caf-a4c7-47ed-b8a4-4d1481e12a9b
last-transition-from: in-progress
---

# x00424 — Corregir blockers de validate: residuos de cache y regresiones Biome

## Goal

Devolver `bun run validate` a verde, porque la puerta de cierre de
propuestas lee su diario: mientras esté en rojo, `proposal_transition` y
`close_slice` se rechazan **para todos los agentes del workspace**, y
ninguna propuesta puede cerrarse por muy terminado que esté su trabajo.

## why

`validate` llevaba en rojo desde el 2026-09-02. Treinta y nueve propuestas
abiertas, ninguna cerrable. Los agentes seguían haciendo slices y
acumulando trabajo que no podía convertirse en un cierre, que es la forma
exacta del bucle que este proyecto quiere impedir.

El detalle importante es que ninguno de los fallos era una regresión del
producto. Eran gates informando sobre algo distinto de lo que examinaban:

- Cuatro gates escaneaban `.d.ts` **generados**. `file-conventions`
  reportaba 113 nombres "no conformes" que había elegido `tsc`;
  `solid-compliance` reportaba violaciones dentro de firmas de tipos
  emitidas. Ninguno señalaba una línea que alguien pudiera editar. Los
  cuatro consumen un mismo walker.
- `lint:cache` fallaba por dos árboles `storms/` vacíos bajo
  `plugins/*/.cache` que ningún proceso había llegado a escribir: el
  escritor creaba su directorio al registrarse el plugin, no al escribir.
- `verify:tools` agotaba su presupuesto de 900 s porque invocaba, con
  payload vacío, una tool que lanza `bun run validate` con reintentos. El
  arnés que se documenta como "pure verification harness; no I/O, no
  writes" estaba ejecutando la suite completa como prueba de humo.
- `architecture-readfile-via-safe-reader` fallaba porque elige su alcance
  leyendo qué plugins declaran `filesystem-read`. Al hacer verdaderas esas
  declaraciones, unos veinte plugins quedaron inscritos en una migración
  que nadie había planificado para ellos: 50 violaciones, ninguna una
  regresión.

## non-goals

- No se relaja ningún gate para ponerlo en verde: cada uno se corrige en
  su causa o se convierte en trinquete con su deuda existente registrada.
- No se toca el contenido de los ficheros generados; se deja de
  escanearlos.

## Slices

- global_gate: validate

### S1 — Resolver los blockers en su causa y registrar evidencia verde
- **Status**: done
- **Files**: `packages/core/src/lib/scan/ts-walker.ts`, `plugins/commit-policy/src/lib/services/storm-log.ts`, `plugins/commit-policy/src/index.ts`, `tools/scripts/verify/plugin-tool-verify.script.ts`, `plugins/quality-policy/src/lib/tools/settlement.tool.ts`, `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts`
- **Gate**: validate

Cada blocker se corrige donde se origina, no donde se manifiesta: el
filtro de `.d.ts` va en el walker compartido y no en cuatro gates; el
directorio de `storms` se crea al escribir y no al registrar; el arnés
respeta el campo `effects` que el contrato de tools ya tenía; y el gate de
arquitectura pasa a trinquete para que la presión sobreviva sin inscribir
a nadie por sorpresa.
- acceptance:
  - "Los cuatro gates que escaneaban `.d.ts` dejan de hacerlo por un único cambio en el walker compartido."
  - "`lint:cache` pasa y ningún plugin crea directorios de caché al registrarse."
  - "`verify:tools` no invoca ninguna tool que declare `effects`, y lo reporta en vez de omitirlo en silencio."
  - "`bun run validate` termina en verde y su resultado queda registrado en el diario que lee la puerta de cierre."
- review-state: changes_requested
- review-implementer: claude-opus-5
- review-reviewer: sonnet-technical-investigator
- review-log: requested_changes by sonnet-technical-investigator — Claim 1 NOT MET. file-conventions.script.ts no usa el walker compartido: tiene su propio bucle readdir inline y recibio un skip de .d.ts duplicado en un commit aparte (39a342bc4). Eso contradice literalmente el cuerpo de S1 (el filtro va en el walker compartido y no en cuatro gates) y su acceptance (por un unico cambio en el walker compartido). El efecto neto hoy es correcto, pero es una duplicacion real y la evidencia de la propuesta es falsa. Claims 2, 3 y 4 MET y verificados en vivo: lint:cache pasa y storm-log no crea nada en un write vacio; verify:tools respeta effects, reporta la fila y quality-policy baja de 883s con timeout a 1.7s; el trinquete de architecture-readfile es genuino, sigue fallando ante hallazgos nuevos. Arreglo pedido: enrutar file-conventions por walkTsFiles, o corregir el texto para describir lo que se construyo.
## acceptance

- `bun run validate` en verde, con su resultado escrito en
  `.cache/mcp-vertex/results/logs/validate.jsonl`.
- `proposal_transition` deja de rechazarse por evidencia roja.
- Ningún gate queda desactivado ni con su umbral relajado para lograrlo.
