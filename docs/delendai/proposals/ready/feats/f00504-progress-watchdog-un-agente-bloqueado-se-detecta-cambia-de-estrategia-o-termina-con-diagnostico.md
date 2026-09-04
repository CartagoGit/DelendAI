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

Consolidar los dos detectores de bucle que ya existen bajo una única máquina de estados de progreso (`progressing` / `waiting` / `suspected-stall` / `looping` / `blocked` / `dead` / `completed`) y añadir lo que falta: la evidencia de progreso que alimenta esos estados y la escalera de recuperación que se aplica cuando el progreso se detiene.

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
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/rotation/progress-evidence.ts`, `plugins/agent-orchestrator/tests/src/lib/rotation/progress-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada operación significativa produce evidencia: información nueva, cambio de estado, ficheros modificados, avance de aceptación y cambio de bloqueo."
  - "Los siete estados de progreso se derivan de la evidencia de forma determinista y pura."
  - "Una espera legítima (lock ajeno, notificación pendiente) se distingue de una parada, y no escala."
- review-state: in_review
- review-implementer: claude-opus-5
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
- review-state: in_review
- review-implementer: claude-opus-5
### S3 — Escalera de recuperación
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/agent-orchestrator/src/lib/rotation/recovery-ladder.ts`, `plugins/agent-orchestrator/tests/src/lib/rotation/recovery-ladder.spec.ts`
- **Gate**: type
- acceptance:
  - "La recuperación avanza por peldanos de coste creciente: compactar estado, reevaluar bloqueo, cambiar estrategia, herramienta alternativa, rotar agente, escalar a ruta más fuerte autorizada y, por último, terminar como bloqueado."
  - "Escalar nunca supera los permisos ni el presupuesto que la configuración autoriza."
  - "Terminar como bloqueado produce un diagnóstico compacto y accionable, no un volcado."
  - "El número de peldanos intentados queda en el receipt para poder aprender de las causas de bloqueo."
- review-state: in_review
- review-implementer: claude-opus-5
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
