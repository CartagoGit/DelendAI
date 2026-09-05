---
id: f00504
title: "Progress Watchdog: un agente bloqueado se detecta, cambia de estrategia o termina con diagnóstico"
kind: feat
status: ready
type: proposal
track: execution-policy
date: 2026-09-04
related:
    - f00050 # S-H parks the brake contract; this proposal inherits its chaos-spec gate
---

# f00504 — Progress Watchdog: un agente bloqueado se detecta, cambia de estrategia o termina con diagnóstico

## Goal

Consolidar los dos detectores de bucle que ya existen bajo una única máquina de estados de progreso (`advancing` / `exploring` / `waiting` / `retrying` / `churning` / `stalled` / `blocked`). **Enmienda 2026-09-05**: la enumeración original incluía `completed` y `dead` y omitía `exploring`, `retrying` y `churning`. Se corrige a los estados que S1 entrega, porque los dos terminales no pertenecen a esta máquina: `completed` no es un estado de progreso sino la ausencia de una ejecución que observar — un watchdog al que hay que decirle que la tarea terminó ya lo sabe porque dejan de llegarle observaciones —, y `dead` es el veredicto del último peldaño de la escalera de S3, no una lectura de la evidencia. Los tres estados añadidos sí son lecturas distintas de la evidencia y separan casos que el enunciado original colapsaba en `suspected-stall` y añadir lo que falta: la evidencia de progreso que alimenta esos estados y la escalera de recuperación que se aplica cuando el progreso se detiene.

Un agente no puede quedarse indefinidamente pensando, esperando un lock, repitiendo la misma herramienta, releyendo el mismo fichero o revalidando el mismo digest. Cuando el estado deja de evolucionar, el sistema compacta el estado, reevalúa el bloqueo, cambia de estrategia, rota de agente o modelo y, si nada avanza, termina como `blocked` con un diagnóstico compacto en lugar de seguir gastando llamadas.

## why

Esto no es trabajo desde cero y no debe tratarse como tal. Ya existen dos detectores parciales que cubren buena parte de la detección:

- `plugins/proposals/src/lib/agents/agent-loop-detector.ts` — fingerprint de herramienta y argumentos, ventana consciente del resultado, cooldown temporal y filtro por `progressHash`.
- `plugins/agent-orchestrator/src/lib/rotation/loop-detector.ts` — presupuesto agotado, salida repetida, tormenta de errores y violación de schema, con historia por `slotId` para que la rotación herede el contexto.

Lo que no existe es lo que los une: una noción común de "ha habido progreso" y una respuesta escalonada. Hoy cada detector dispara su propia acción local y ninguno puede decir si la tarea, en conjunto, está avanzando. Un agente puede repetir legítimamente una herramienta, así que mirar sólo la herramienta produce falsos positivos; lo que decide es si el estado evoluciona.

Un apunte de gobierno: cambiar el freno no es libre. `f00050` S-H lo tiene
aparcado desde 2026-06-23 precisamente para que nadie lo toque de pasada, y
S2 de esta propuesta lo toca — los dos detectores dejan de tener su propia
noción de repetición. No hace falta promover S-H, porque el trabajo ya vive
aquí; lo que sí hace falta es heredar la única garantía que S-H añade y esta
propuesta no tenía: el spec de caos con 5 o más agentes concurrentes. Está
incorporado a la aceptación de S2.

## non-goals

- No duplicar los dos detectores existentes: esta propuesta los consume y unifica, y si alguno queda redundante se retira, no se clona.
- No implementar la agregación de tormentas de error por fingerprint — eso es de x00419.
- No arreglar la inanición del mutex — eso es de x00420/x00422; el watchdog sólo observa la espera y la clasifica como legítima o no.
- No terminar trabajo ajeno: el watchdog actúa sobre el agente que observa, nunca sobre los demás.

## Slices

- global_gate: type

### S1 — Evidencia de progreso y máquina de estados unificada
- **Status**: done
- **Files**: `plugins/agent-orchestrator/src/lib/rotation/progress-evidence.ts`, `plugins/agent-orchestrator/tests/src/lib/rotation/progress-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada operación significativa produce evidencia: información nueva, cambio de estado, ficheros modificados, avance de aceptación y cambio de bloqueo."
  - "Los siete estados de progreso se derivan de la evidencia de forma determinista y pura."
  - "Una espera legítima (lock ajeno, notificación pendiente) se distingue de una parada, y no escala."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-watchdog-validation
- review-log: approved by reviewer-watchdog-validation — Las tres aceptaciones se cumplen. `IProgressEvidence` lleva exactamente las cinco señales pedidas (newInformation, stateChanged, filesTouched, acceptanceAdvanced, blockerChanged); `deriveProgressState` es pura y total sobre siete estados con severidad ordenada; y la espera legítima está tratada en dos sitios, no en uno: `waitingOn` corta el `barrenStreak` (así que esperar no acumula esterilidad) y produce `waiting` con `shouldEscalate: false`. El spec cubre "no escala por larga que sea la espera" y "sólo se escala desde stalled o blocked". Defecto anotado, no bloqueante: los siete estados implementados (advancing/exploring/waiting/retrying/churning/stalled/blocked) no son los siete que enumera el Goal de la propuesta (progressing/waiting/suspected-stall/looping/blocked/dead/completed). El renombrado es defendible, pero no hay estado terminal `completed` ni `dead`, así que el watchdog no puede distinguir una tarea acabada de una que avanza. Si eso importa aguas abajo, corregir el Goal o añadir los terminales en una slice posterior.
### S2 — Detección de bucle por evolución del estado, no por herramienta repetida
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/agent-orchestrator/src/lib/rotation/stall-fingerprint.ts`, `plugins/agent-orchestrator/tests/src/lib/rotation/stall-fingerprint.spec.ts`
- **Gate**: type
- acceptance:
  - "El fingerprint combina herramienta, argumentos, digest de entrada, digest de salida y digest del estado de la tarea."
  - "Una repetición legítima con estado que evoluciona no se marca como bucle."
  - "Una revalidación sobre el mismo digest sin cambios sí lo hace."
  - "Los dos detectores existentes alimentan este fingerprint en lugar de mantener su propia noción de repetición."
  - "Un spec de caos con 5 o más agentes concurrentes sobre un repositorio de fixture demuestra que el nuevo contrato del freno maneja el modo de fallo, y los tests de presupuesto de `auto_work` siguen pasando."
- review-state: changes_requested
- review-implementer: claude-opus-5
- review-reviewer: reviewer-watchdog-validation
- review-log: requested_changes by reviewer-watchdog-validation — Tres de las cinco aceptaciones se cumplen y están bien resueltas: el fingerprint combina tool + args + inputDigest + outputDigest + taskDigest con longitud prefijada (defensa real contra colisión por delimitador, con test); una repetición cuyo taskDigest evoluciona no se marca como bucle ni tras 30 iteraciones; y una revalidación sobre el mismo digest sin cambios sí se marca. Fallan las dos que hacen que la slice tenga efecto:

1. "Los dos detectores existentes alimentan este fingerprint en lugar de mantener su propia noción de repetición". No lo hacen. `grep -rn stall-fingerprint plugins --include=*.ts` sólo devuelve el propio módulo y su spec: nada en el árbol lo importa. `plugins/proposals/src/lib/agents/agent-loop-detector.ts` sigue con su `createHash` y su propio fingerprint, y `plugins/agent-orchestrator/src/lib/rotation/loop-detector.ts` está intacto. Lo entregado es `IDetectorObservation`, un tipo al que los detectores "podrían adaptarse", y un test que construye dos observaciones a mano con `detectorId: 'agent-loop-detector'` y `'rotation/loop-detector'` — cadenas literales, no los detectores. Con esto los dos siguen manteniendo su propia noción de repetición, que es exactamente lo que la aceptación prohíbe, y siguen pudiendo discrepar entre sí.

2. "Un spec de caos con 5 o más agentes concurrentes sobre un repositorio de fixture demuestra que el nuevo contrato del freno maneja el modo de fallo". No existe. No hay ningún spec de caos ni ninguna prueba concurrente en `plugins/agent-orchestrator/tests`. Esta es la única garantía que la propuesta hereda de f00050 S-H, y f00050 S-H está aparcada precisamente para que el freno no se toque sin ella; el `why` de la propuesta lo dice de forma explícita. Aprobar sin ese spec es tocar el freno saltándose la condición por la que S-H sigue aparcada.

Para cerrar: (a) adaptar de verdad ambos detectores para que emitan `IOperationFingerprintInput` y deleguen el veredicto en `judgeRepetition`, retirando su lógica de repetición propia — la lista de **Files** de la slice se queda corta y hay que ampliarla a esos dos ficheros y sus specs; (b) añadir el spec de caos con >=5 agentes concurrentes sobre repo de fixture, y confirmar que los tests de presupuesto de `auto_work` siguen pasando.

Estado verificado en d1feb0a3a: typecheck exit 0, `bunx vitest run --root plugins/agent-orchestrator` 269/269. Los tests pasan; lo que falta es alcance, no corrección.
### S3 — Escalera de recuperación
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/agent-orchestrator/src/lib/rotation/recovery-ladder.ts`, `plugins/agent-orchestrator/tests/src/lib/rotation/recovery-ladder.spec.ts`
- **Gate**: type
- acceptance:
  - "La recuperación avanza por peldanos de coste creciente: compactar estado, reevaluar bloqueo, cambiar estrategia, herramienta alternativa, rotar agente, escalar a ruta más fuerte autorizada y, por último, terminar como bloqueado."
  - "Escalar nunca supera los permisos ni el presupuesto que la configuración autoriza."
  - "Terminar como bloqueado produce un diagnóstico compacto y accionable, no un volcado."
  - "El número de peldanos intentados queda en el receipt para poder aprender de las causas de bloqueo."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-watchdog-validation
- review-log: approved by reviewer-watchdog-validation — Las cuatro aceptaciones se cumplen. `RECOVERY_LADDER` es literalmente la secuencia pedida y en ese orden (compact-state, reevaluate-blocker, change-strategy, alternative-tool, rotate-agent, escalate-route, terminate-blocked), con test de que cada peldaño se ofrece una sola vez. `escalate-route` sólo se ofrece si `mayEscalateRoute`, y `rotate-agent` sólo si `mayRotateAgent`: el watchdog no puede autorizarse gasto a sí mismo. El terminal produce un diagnóstico de una línea (`needsFromHuman`, con test de que no tiene saltos de línea) más el estado, el blocker y la lista de intentos, que es un diagnóstico y no un volcado. Y lo que pedí verificar con más cuidado, los peldaños saltados: `nextRecoveryStep` hace `attempted.push(rung)` en la rama `!isAvailable` antes de continuar, así que un `escalate-route` prohibido aparece en `diagnosis.attempted` en lugar de desaparecer; hay test explícito ("records a skipped rung as attempted rather than pretending it was tried") y `rungsAttempted` los cuenta también en los pasos no terminales.

Dos defectos anotados, ninguno bloqueante: (1) sólo el paso terminal devuelve la lista `attempted`; en un paso intermedio el llamante recibe `rungsAttempted` como número pero no puede saber qué peldaños se saltaron sin recalcularlos, y es él quien debe mantener `permissions.attempted` entre llamadas. (2) La aceptación dice "queda en el receipt": el módulo expone `rungsAttempted` en el resultado pero nada del árbol lo escribe todavía en un receipt real — la lista de **Files** de la slice no daba para cablearlo, así que queda pendiente de la slice que lo consuma.

Verificado en d1feb0a3a: typecheck exit 0, `bunx vitest run --root plugins/agent-orchestrator` 26 ficheros / 269 tests, todos verdes.
## acceptance

- Cada operación significativa produce evidencia: información nueva, cambio de estado, ficheros modificados, avance de aceptación y cambio de bloqueo.
- Los siete estados de progreso se derivan de la evidencia de forma determinista y pura.
- Una espera legítima (lock ajeno, notificación pendiente) se distingue de una parada, y no escala.
- El fingerprint combina herramienta, argumentos, digest de entrada, digest de salida y digest del estado de la tarea.
- Una repetición legítima con estado que evoluciona no se marca como bucle.
- Una revalidación sobre el mismo digest sin cambios sí lo hace.
- Los dos detectores existentes alimentan este fingerprint en lugar de mantener su propia noción de repetición.
- Un spec de caos con 5 o más agentes concurrentes sobre un repositorio de fixture demuestra que el nuevo contrato del freno maneja el modo de fallo, y los tests de presupuesto de `auto_work` siguen pasando.
- La recuperación avanza por peldanos de coste creciente: compactar estado, reevaluar bloqueo, cambiar estrategia, herramienta alternativa, rotar agente, escalar a ruta más fuerte autorizada y, por último, terminar como bloqueado.
- Escalar nunca supera los permisos ni el presupuesto que la configuración autoriza.
- Terminar como bloqueado produce un diagnóstico compacto y accionable, no un volcado.
- El número de peldanos intentados queda en el receipt para poder aprender de las causas de bloqueo.
