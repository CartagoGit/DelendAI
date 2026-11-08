---
id: x00422
title: "Estabilizar heartbeat de withFileMutex en secciones críticas largas"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-09-02
superseded-by: x00420
related:
    - x00420
---

# x00422 — Estabilizar heartbeat de withFileMutex en secciones críticas largas

## Goal

Ninguno propio: esta propuesta es un duplicado de [`x00420`](./x00420-corregir-regresion-de-heartbeat-en-withfilemutex-bajo-carga.md)
y queda absorbida por ella. El trabajo se hace allí.

## why

Las dos se crearon con dos minutos de diferencia el 2026-09-02, describen
el mismo defecto del heartbeat de `withFileMutex`, y su única slice
nombraba exactamente los mismos dos ficheros. Ninguna llegó a rellenarse:
las dos se quedaron con `TODO: describe the goal.` en el cuerpo.

Dos identificadores para un solo trabajo garantizan que uno de ellos no se
pueda cerrar honestamente, porque quien haga el trabajo cerrará el otro.
Por eso se resuelve nombrando cuál sobrevive en lugar de dejar que un
agente futuro elija.

El gate `lint:proposal-hygiene` existe a partir de este caso: detecta dos
propuestas abiertas cuyas slices nombran los mismos ficheros, y detecta un
andamiaje sin rellenar, que es lo que permitió que ambas pasaran
desapercibidas.

## non-goals

- No se elimina el fichero: el id ya está publicado y borrarlo dejaría un
  hueco que otra herramienta podría reutilizar.
- No se duplica aquí el contenido de `x00420`; una sola descripción del
  problema es justamente lo que esta propuesta corrige.

## Slices

- global_gate: none

### S1 — Cerrar como superseded cuando x00420 se cierre
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/fixes/x00422-estabilizar-heartbeat-de-withfilemutex-en-secciones-criticas-largas.md`
- **Gate**: none

No hay trabajo de código aquí: la corrección del heartbeat vive en
`x00420`. Esta slice existe porque el andamiaje exige al menos una, y
porque un duplicado necesita un acto explícito de cierre — dejarlo abierto
sin slices es cómo un duplicado sobrevive a la limpieza que lo detectó.

Nótese que sus ficheros deliberadamente ya NO coinciden con los de
`x00420`: mientras coincidieran, `lint:proposal-hygiene` seguiría —
correctamente— señalando dos propuestas abiertas para un mismo trabajo.
- acceptance:
  - "`x00422` pasa a `done/` con `superseded-by: x00420` en el frontmatter, en cuanto `x00420` cierre."
  - "`lint:proposal-hygiene` no reporta duplicado entre ambas."

## acceptance

- Esta propuesta queda cerrada como superseded cuando `x00420` se cierre.
- `lint:proposal-hygiene` deja de reportar el duplicado.
