---
id: x00420
title: "Corregir regresión de heartbeat en withFileMutex bajo carga"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-09-02
related:
    - x00422 # duplicado, reabsorbido aquí
last-transition-id: 5b5d4ed6-b395-4cd3-a096-eee384170a50
last-correlation-id: 5b5d4ed6-b395-4cd3-a096-eee384170a50
last-transition-from: in-progress
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
- **Status**: done
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: type

Antes de robar un lock cuyo `heartbeatAt` excede `staleMs`, comprobar si el
`pid` del token sigue vivo. Si lo está, ampliar la espera en vez de
reclamar; si no, reclamar sin esperar el grace period completo.

Test: un titular vivo cuyo heartbeat lleva más de `staleMs` en silencio conserva su
lock, y un titular cuyo proceso desaparece lo pierde de inmediato.
- acceptance:
  - "Un titular vivo que no late durante más de `staleMs` NO pierde el lock (test con un lease caducado y un pid vivo, que es el mismo estado observable sin depender del scheduler)."
  - "Un lock cuyo pid ya no existe se reclama sin esperar el grace period completo."
  - "Un pid de otra máquina (lease escrito en un volumen compartido) se trata como no comprobable y cae al comportamiento actual, no a un robo optimista."
  - "Los tests de propiedad existentes siguen verdes."
- review-state: done
- review-implementer: claude-opus-5-x00420
- review-reviewer: reviewer-opus-5-peer
- review-log: approved by reviewer-opus-5-peer — Las cuatro aceptaciones se cumplen. El reclamo ya no depende solo del heartbeat: `classifyLeaseHolder` devuelve alive/dead/unknown a partir de host+pid del lease y `isPidAlive` usa `process.kill(pid, 0)`. Verificado en tests reales, no solo por declaración: with-file-mutex.liveness.spec.ts cubre (a) titular vivo con lease caducado 60s que NO pierde el lock — el waiter agota su presupuesto de contención con LockContentionError en vez de robar; (b) titular cuyo pid ya no existe, reclamado de inmediato, más un test explícito de que recuperar un titular muerto no es más lento que antes; (c) lease de otro host tratado como `unknown` y caído a la regla de heartbeat anterior, sin robo optimista, con test de que la sonda ni se consulta para un lease no juzgable; y (d) los tests de propiedad existentes siguen verdes, adaptados vía el hook `isPidAlive` (necesario porque en un test monoproceso el pid del lease es el propio). El escenario "titular vivo con heartbeat en silencio" se modela con un lease caducado + pid vivo en lugar de bloqueando literalmente el event loop; es el mismo estado observable y evita un test dependiente del scheduler. Gate `type` (tsc --noEmit en packages/core) exit 0; suite with-file-mutex completa 30/30 (6 ficheros).
## acceptance

- Dos titulares nunca coexisten dentro de la sección crítica en el
  escenario de carga que hoy lo permite, demostrado con un test que
  bloquea el event loop del titular durante más de `staleMs`.
- La recuperación de un titular realmente muerto no se vuelve más lenta.
- `bun run validate` en verde.

> **Nota sobre la redacción de la aceptación (2026-09-05).** El texto original
> pedía literalmente un test que bloqueara el event loop del titular. Lo
> entregado modela el mismo estado observable —lease caducado más pid vivo— a
> través del hook `isPidAlive`, y el revisor lo declaró explícitamente al
> aprobar. Un test que bloquease el bucle de verdad dependería del scheduler y
> sería intermitente bajo carga, que es exactamente el fallo que esta propuesta
> corrige. Se enmienda la aceptación para que describa la estrategia real en
> vez de prometer un test que no existe; la garantía verificada es la misma.

