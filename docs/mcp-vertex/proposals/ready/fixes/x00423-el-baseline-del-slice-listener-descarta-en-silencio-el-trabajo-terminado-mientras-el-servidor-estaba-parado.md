---
id: x00423
title: "El baseline del slice listener descarta en silencio el trabajo terminado mientras el servidor estaba parado"
kind: fix
status: ready
type: proposal
track: concurrency
date: 2026-09-03
---

# x00423 — El baseline del listener descarta trabajo real

## Goal

Que el primer sondeo del `slice-listener` distinga **"esto ya está
persistido"** de **"esto terminó mientras yo no miraba"**, en vez de
tratar ambos casos como baseline y no emitir nada.

## why

La corrección del replay (`f00417`) hizo lo correcto con el síntoma: al
arrancar, el listener emitía un evento por cada slice `done` del
historial — 83 de golpe el 2026-09-02, todos rechazados, todos
reintentados. La corrección fue tomar el primer sondeo válido como
baseline y emitir cero eventos.

Pero eso descarta **todo**, no sólo lo histórico:

```ts
const { events, refusals } = initialized
    ? diffSlices(prev, curr, config.onStatuses)
    : { events: [], refusals: [] };   // primer sondeo: nada, nunca
```

Consecuencia en producción: **cualquier slice que llegue a `done` antes
del primer sondeo del listener no se commitea jamás.** No hay error, no
hay reintento, no hay traza. El trabajo se queda sucio en el worktree
hasta que un sweep lo recoja con el nombre de otra propuesta — o hasta
que se pierda.

Ocurre en tres situaciones nada exóticas:

1. El servidor MCP se reinicia (cosa que hacemos a menudo) y durante la
   parada un agente cerró una slice.
2. El plugin `commit-policy` se activa de forma perezosa **después** de
   que la slice se cerrara.
3. Arranque en frío de una sesión de enjambre sobre un repo con trabajo
   pendiente del día anterior.

Evidencia: `plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts`
→ *"closes a slice, then commit-policy pushes the observed done
transition"* falla con `commits=1`, `remoteRef=(absent)`, `tracked.txt`
sin seguimiento. Instrumentado, el engine recibe **cero** eventos de
slice: el listener nunca emitió el que el test espera.

## non-goals

- **NO** volver al replay del historial. Los 83 eventos eran un bug real
  y no se reintroducen.
- **NO** commitear automáticamente cualquier cosa que estuviera sucia al
  arrancar. El scope sigue siendo el resuelto de la slice (invariante de
  `f00417`, ya cerrada).

- Cambiar el formato de `eventId` (hoy es el evento entero serializado,
  lo que hincha el store y el log). El log ya se arregló por separado
  usando un digest sólo para imprimir; cambiar la identidad exige
  migración y va en su propia propuesta.

## Slices

- global_gate: lint, types, test

### S1 — El baseline consulta el almacén de eventos procesados

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts` — el primer sondeo deja de ser incondicionalmente mudo. Para cada slice en `onStatuses`, pregunta al `IProcessedEventsStore` si su clave de idempotencia ya tiene un resultado terminal. Si lo tiene, es historia: baseline silencioso. Si no lo tiene, terminó sin que nadie la persistiera: se emite.
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts` — el listener recibe el store por inyección; ausente, conserva el comportamiento actual (mudo) en vez de arriesgar una tormenta.
- **Gate**: lint, types, test

### S2 — Cota y aviso para el arranque en frío

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts` — en un repo cuyo store está vacío (instalación nueva, o `.commit-policy/` borrado) TODAS las slices `done` parecerían no persistidas. Cota explícita: como mucho `BASELINE_EMIT_LIMIT` eventos en el primer sondeo, los más recientes primero, y una línea de stderr que diga cuántos se omitieron y con qué comando revisarlos. Nunca una tormenta, nunca un descarte mudo.
  - `plugins/commit-policy/src/lib/contracts/constants/slice-listener.constant.ts` (nuevo) — `BASELINE_EMIT_LIMIT`.
- **Gate**: lint, types, test

### S3 — Tests que fijan las dos mitades del contrato

- **Status**: done
- **Files**:
  - `plugins/commit-policy/tests/src/lib/triggers/slice-listener-baseline.spec.ts` (nuevo) — dos casos que hoy no se pueden distinguir: (a) 83 slices `done` con resultado terminal en el store → cero eventos; (b) una slice `done` ausente del store → exactamente un evento. Y el caso de cota: 200 slices desconocidas → `BASELINE_EMIT_LIMIT` eventos más un aviso que nombra el resto.
- **Gate**: lint, types, test

## acceptance

1. Reiniciar el servidor con una slice cerrada durante la parada
   produce su commit, no silencio.
2. Reiniciar sobre el historial completo del repo produce cero eventos.
3. El e2e `auto-work` *"closes a slice, then commit-policy pushes the
   observed done transition"* vuelve a verde, y falla si S1 se revierte.
4. Un store vacío nunca emite más de `BASELINE_EMIT_LIMIT` eventos, y
   dice por stderr cuántos omitió.

## risks and mitigations

- **R1**: el store se corrompe o no se puede leer y todo parece no
  persistido. Mitigación: un error de lectura del store cae al
  comportamiento actual (baseline mudo) y lo anuncia; es el fallo seguro.
- **R2**: la clave de idempotencia cambia de formato y el store deja de
  reconocer lo ya procesado — un replay acotado por S2, no una tormenta.
