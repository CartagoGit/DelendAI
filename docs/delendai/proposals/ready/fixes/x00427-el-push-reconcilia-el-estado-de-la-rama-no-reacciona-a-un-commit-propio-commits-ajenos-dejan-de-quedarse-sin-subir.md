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

La causa es que el push está atado al evento equivocado. El motor lo dispara en el paso 7 bajo `result.commitCreated`, y antes de llegar ahí, un tick de intervalo sobre un árbol limpio sale en el paso `stage` con `TRIGGER_HAS_NO_FILES`. Es decir: en cuanto alguien commitea por su cuenta —un agente por su terminal, un hook, el propio operador— el árbol queda limpio, el motor no crea ningún commit, y el push deja de ocurrir para siempre. El remoto se queda atrás en silencio y nadie recibe una señal, porque desde dentro no ha fallado nada: no había nada que commitear.

El error de fondo es conceptual. Un push cuyo trabajo es mantener el remoto en sincronía es una reconciliación de estado, no la reacción a un evento propio. La pregunta correcta no es "¿acabo de hacer un commit?" sino "¿está la rama por delante de su upstream?". Un árbol limpio con commits sin subir no es "nada que hacer": es "nada que commitear, algo que subir".

## non-goals

- Cambiar la política de ramas protegidas, el modo de force ni ninguna otra decisión sobre QUÉ se sube. Esto sólo corrige CUÁNDO se intenta.
- Pushear cuando el push está deshabilitado, o desde una rama protegida. La reconciliación se somete a las mismas guardas que el push actual, no las esquiva.
- Convertir un fallo de push en un fallo del commit. Un commit que se creó correctamente sigue siendo un éxito aunque el push posterior no pueda completarse; lo que cambia es que deja de ser silencioso.

## Slices

- global_gate: type

### S1 — Decisión pura: qué debe hacer un tick según el estado de la rama, no según su propio commit
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/push-reconciliation.ts`, `plugins/commit-policy/src/lib/services/push-reconciliation.spec.ts`
- **Gate**: type
- acceptance:
  - "Un árbol limpio con la rama por delante de su upstream decide pushear, aunque el tick no haya creado ningún commit."
  - "Un árbol limpio con la rama al día decide no hacer nada, y lo dice como estado normal y no como fallo."
  - "Una rama protegida o un push deshabilitado nunca deciden pushear, sea cual sea el número de commits por delante."
  - "Una rama sin upstream configurado se distingue de una rama al día: no es un error, pero tampoco es reconciliable en silencio."
  - "La decisión es una función pura sobre el estado observado y la configuración, sin ejecutar git."

### S2 — El tick de intervalo consulta la reconciliación antes de rendirse por árbol limpio
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/engine-push-reconciliation.spec.ts`
- **Gate**: type
- acceptance:
  - "Un tick de intervalo sobre un árbol limpio con commits sin subir ejecuta el push en lugar de salir por `TRIGGER_HAS_NO_FILES`."
  - "El resultado distingue “no había nada que hacer” de “no había nada que commitear pero se subió lo pendiente”."
  - "Un fallo del push reconciliador se reporta con su motivo y no se confunde con un fallo de commit."
  - "El camino existente —commit creado y luego push— se comporta exactamente igual que antes."

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
