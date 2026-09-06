---
id: x00427
title: "El push reconcilia el estado de la rama, no reacciona a un commit propio: commits ajenos dejan de quedarse sin subir"
kind: fix
status: ready
type: proposal
track: workflow
date: 2026-09-04
---

# x00427 — El push reconcilia el estado de la rama, no reacciona a un commit propio: commits ajenos dejan de quedarse sin subir

## Goal

Que `push.onCommit` cumpla lo que su configuración promete: si la rama está por delante de su upstream y el push está habilitado, se sube — lo haya commiteado el motor o cualquier otra cosa.

## why

Con `push.enabled: true` y `push.onCommit: true` configurados, este repositorio acumuló seis commits sin subir mientras commit-policy se reportaba sano. No es un fallo del remoto ni de los hooks: un `git push --dry-run` pasa las ocho comprobaciones de pre-push, drift-check incluido. El push simplemente nunca se intenta.

La causa está en dos capas, y la primera versión de esta propuesta sólo vio la de arriba. Conviene dejar las dos escritas porque la corrección cambia el arreglo.

**Capa 1 — el push está atado al evento equivocado.** El motor lo dispara en el paso 7 bajo `result.commitCreated`, y antes de llegar ahí, un tick de intervalo sobre un árbol limpio sale en el paso `stage` con `TRIGGER_HAS_NO_FILES`. En cuanto alguien commitea por su cuenta —un agente por su terminal, un hook, el propio operador— el árbol queda limpio, el motor no crea ningún commit, y `onCommit` no vuelve a dispararse.

**Capa 2 — el mecanismo que sí reconciliaría existe y está apagado.** `push-scheduler.ts` ya implementa exactamente la pregunta correcta: `hasPendingAutomaticPush()` consulta `gitUnpushedCommitCount()`, es decir si la rama está por delante de su upstream, sin importar quién hizo los commits. Pero su `start()` sale en la primera línea cuando `push.everyNMinutes` es `undefined`, y la configuración de este repositorio no lo declara. Así que la reconciliación está construida, es correcta y nunca arranca.

Esto reencuadra el arreglo. No hay que construir un segundo mecanismo de push: hay que dejar de tratar la ausencia de `everyNMinutes` como "nunca reconciliar". Un host que declara `push.enabled` junto con `onCommit` o `everyNCommits` ya ha dicho que quiere el remoto en sincronía; que los commits ajenos se queden atrás para siempre no es una política que nadie haya elegido, es un hueco. `everyNMinutes` debe significar *cada cuánto*, no *si acaso*.

El error de fondo es conceptual. Un push cuyo trabajo es mantener el remoto en sincronía es una reconciliación de estado, no la reacción a un evento propio. La pregunta correcta no es "¿acabo de hacer un commit?" sino "¿está la rama por delante de su upstream?". Un árbol limpio con commits sin subir no es "nada que hacer": es "nada que commitear, algo que subir".

## non-goals

- Cambiar la política de ramas protegidas, el modo de force ni ninguna otra decisión sobre QUÉ se sube. Esto sólo corrige CUÁNDO se intenta.
- Pushear cuando el push está deshabilitado, o desde una rama protegida. La reconciliación se somete a las mismas guardas que el push actual, no las esquiva.
- Convertir un fallo de push en un fallo del commit. Un commit que se creó correctamente sigue siendo un éxito aunque el push posterior no pueda completarse; lo que cambia es que deja de ser silencioso.

## Slices

- global_gate: type

### S1 — Decisión pura: qué debe hacer un tick según el estado de la rama, no según su propio commit
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/push-reconciliation.ts`, `plugins/commit-policy/tests/src/lib/services/push-reconciliation.spec.ts`
- **Gate**: type
- acceptance:
  - "Un árbol limpio con la rama por delante de su upstream decide pushear, aunque el tick no haya creado ningún commit."
  - "Un árbol limpio con la rama al día decide no hacer nada, y lo dice como estado normal y no como fallo."
  - "Una rama protegida o un push deshabilitado nunca deciden pushear, sea cual sea el número de commits por delante."
  - "Una rama sin upstream configurado se distingue de una rama al día: no es un error, pero tampoco es reconciliable en silencio."
  - "La decisión es una función pura sobre el estado observado y la configuración, sin ejecutar git."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-config-push
- review-log: approved by reviewer-config-push — decidePushReconciliation es puro (no ejecuta git), las guardas (push deshabilitado, rama protegida) preceden a cualquier estado de rama, aheadCount undefined se distingue de 0 con needsAttention true, y la spec cubre los cinco criterios en tabla. tsc del plugin sale 0; 466 tests pasan (1 skip preexistente). Defecto real no bloqueante: el módulo hoy sólo lo ejecuta su propia spec — push-scheduler.ts sigue decidiendo con hasPendingAutomaticPush() y duplica las guardas, así que la decisión canónica no gobierna todavía el camino de push (ni el caso 'no-upstream' llega a ningún consumidor hasta S3). Conviene que S3, o una slice posterior, consuma decidePushReconciliation desde el tick.
### S2 — El push habilitado arranca el reconciliador aunque no se declare `everyNMinutes`
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/commit-policy/src/lib/services/push-scheduler.ts`, `plugins/commit-policy/src/lib/services/push-scheduler-reconciliation.spec.ts`
- **Gate**: type
- acceptance:
  - "Con `push.enabled` y algún modo de push declarado, el reconciliador periódico arranca aunque `everyNMinutes` no esté configurado, usando un intervalo por defecto."
  - "Declarar `everyNMinutes` sigue decidiendo la frecuencia; lo que deja de significar es \"no reconciliar nunca\"."
  - "Con el push deshabilitado no arranca nada, y una rama protegida se sigue rechazando por las guardas actuales."
  - "El camino existente —commit creado y luego push— se comporta exactamente igual que antes."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-config-push
- review-log: approved by reviewer-config-push — Ambas capas quedan cubiertas: engine.ts:833 dispara onCommitSucceeded bajo commitCreated y src/index.ts lo ata al scheduler en los tres puntos de entrada; y start() ya no sale por everyNMinutes undefined, sino que resuelve la cadencia con resolveReconcileMinutes (5 min por defecto cuando hay push.enabled + onCommit/everyNCommits), con spec dedicada para la config exacta que falló. Push deshabilitado o sin modo automático siguen sin arrancar nada, y la rama protegida se rechaza en branchRefusal antes del push. Defecto real no bloqueante: la spec de S2 sólo ejercita resolveReconcileMinutes; no hay ningún test que llame a start() con onCommit:true y everyNMinutes ausente y compruebe con timers falsos que el intervalo se crea y el tick pushea — el enlace start()->resolveReconcileMinutes queda sin cubrir, y el test antiguo 'start() does not start a timer when everyNMinutes is unset' sigue en verde sólo porque su policy no pide ningún modo automático, lo que puede leerse mal en el futuro.
### S3 — El estado del plugin dice si el remoto está atrás, para que el silencio deje de ser indistinguible de la salud
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/src/lib/tools/status-tool-ahead.spec.ts`
- **Gate**: type
- acceptance:
  - "El estado informa de cuántos commits lleva la rama por delante de su upstream."
  - "Con el push habilitado y commíts sin subir, el estado lo señala como una condición que requiere atención en vez de reportarse sano."
  - "Una rama sin upstream se informa como tal y no como cero commits por delante."

## acceptance

- Un árbol limpio con la rama por delante de su upstream decide pushear, aunque el tick no haya creado ningún commit.
- Un árbol limpio con la rama al día decide no hacer nada, y lo dice como estado normal y no como fallo.
- Una rama protegida o un push deshabilitado nunca deciden pushear, sea cual sea el número de commits por delante.
- Una rama sin upstream configurado se distingue de una rama al día: no es un error, pero tampoco es reconciliable en silencio.
- La decisión es una función pura sobre el estado observado y la configuración, sin ejecutar git.
- Un tick de intervalo sobre un árbol limpio con commits sin subir ejecuta el push en lugar de salir por `TRIGGER_HAS_NO_FILES`.
- El resultado distingue “no había nada que hacer” de “no había nada que commitear pero se subió lo pendiente”.
- Un fallo del push reconciliador se reporta con su motivo y no se confunde con un fallo de commit.
- El camino existente —commit creado y luego push— se comporta exactamente igual que antes.
- El estado informa de cuántos commits lleva la rama por delante de su upstream.
- Con el push habilitado y commíts sin subir, el estado lo señala como una condición que requiere atención en vez de reportarse sano.
- Una rama sin upstream se informa como tal y no como cero commits por delante.
