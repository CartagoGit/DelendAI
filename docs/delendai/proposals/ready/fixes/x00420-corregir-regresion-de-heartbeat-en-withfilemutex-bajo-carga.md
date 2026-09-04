---
id: x00420
title: "Corregir regresión de heartbeat en withFileMutex bajo carga"
kind: fix
status: ready
type: proposal
track: concurrency
date: 2026-09-02
related:
    - x00422 # duplicado, reabsorbido aquí
---

# x00420 — Corregir regresión de heartbeat en withFileMutex bajo carga

## Goal

Garantizar que el heartbeat de `withFileMutex` siga refrescando el lease
mientras el titular está vivo **aunque la máquina esté saturada**, de modo
que un titular lento nunca sea confundido con uno abandonado y reclamado.

## why

`withFileMutex` decide que un lock está abandonado comparando
`now - lease.heartbeatAt` contra `staleMs` (30 s por defecto), y el titular
refresca ese sello con un `setInterval` cada `staleMs / 3`. Todo el diseño
descansa en que ese temporizador dispare.

Un `setInterval` no dispara mientras el event loop está ocupado. La sección
crítica que el mutex protege es precisamente donde el proceso hace su
trabajo pesado, y este repositorio la usa alrededor de comandos que
saturan la máquina: hoy mismo, cuatro `bun run validate` simultáneos —
provocados por `verify:tools` invocando una tool que lanzaba la suite
entera— tuvieron el equipo al límite durante quince minutos.

Si tres latidos consecutivos se pierden, el lease parece caducado. Otro
contendiente lo roba, y **dos titulares quedan dentro de la sección
crítica a la vez**, que es exactamente lo que el mutex existe para
impedir. Y el fallo es silencioso: nadie recibe un error, simplemente dos
escritores pisan el mismo fichero.

Lo que hay ya escrito está bien pensado: hay guarda de solapamiento
(`heartbeatInFlight`), grace period con marcador antes de reclamar, y
tokens por adquisición para que un release no borre un lock ajeno. Lo que
falta es que el juicio de "está muerto" no dependa de un temporizador que
la carga puede silenciar.

## non-goals

- No se rediseña el protocolo de lease ni el formato del sidecar `.mutex`.
- No se cambia `staleMs` por defecto: subirlo esconde el problema y
  retrasa la recuperación real de un titular que sí murió.
- No se aborda la contención entre agentes a nivel de política (eso es
  trabajo del lock de agente en `proposals`), solo el mecanismo de fichero.

## Architecture

La corrección tiene que separar dos preguntas que hoy responde el mismo
dato:

1. *¿Sigue vivo el proceso titular?* — comprobable sin temporizador: el
   token del lease lleva el `pid`, y la existencia del proceso es
   observable directamente.
2. *¿Sigue progresando?* — para eso sirve el heartbeat.

Un reclamador que exige AMBAS señales antes de robar un lock deja de
depender de que el temporizador del titular haya podido correr. Un titular
vivo pero congelado por la carga conserva su lock; uno cuyo proceso ya no
existe se reclama de inmediato, más rápido que hoy.

## Slices

- global_gate: type

### S1 — El reclamo exige proceso muerto además de heartbeat vencido
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: type

Antes de robar un lock cuyo `heartbeatAt` excede `staleMs`, comprobar si el
`pid` del token sigue vivo. Si lo está, ampliar la espera en vez de
reclamar; si no, reclamar sin esperar el grace period completo.

Test: un titular que bloquea el event loop más de `staleMs` conserva su
lock, y un titular cuyo proceso desaparece lo pierde de inmediato.
- acceptance:
  - "Un titular vivo que no late durante más de `staleMs` NO pierde el lock (test con el event loop bloqueado)."
  - "Un lock cuyo pid ya no existe se reclama sin esperar el grace period completo."
  - "Un pid de otra máquina (lease escrito en un volumen compartido) se trata como no comprobable y cae al comportamiento actual, no a un robo optimista."
  - "Los tests de propiedad existentes siguen verdes."
- review-state: in_review
- review-implementer: claude-opus-5-x00420
## acceptance

- Dos titulares nunca coexisten dentro de la sección crítica en el
  escenario de carga que hoy lo permite, demostrado con un test que
  bloquea el event loop del titular durante más de `staleMs`.
- La recuperación de un titular realmente muerto no se vuelve más lenta.
- `bun run validate` en verde.
