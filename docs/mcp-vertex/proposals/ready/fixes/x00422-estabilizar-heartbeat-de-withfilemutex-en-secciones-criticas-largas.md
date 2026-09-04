---
id: x00422
title: "Estabilizar heartbeat de withFileMutex en secciones críticas largas"
kind: fix
status: ready
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

_Sin slices: el trabajo vive en `x00420`._

## acceptance

- Esta propuesta queda cerrada como superseded cuando `x00420` se cierre.
- `lint:proposal-hygiene` deja de reportar el duplicado.
