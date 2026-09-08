---
id: x00534
title: "develop-protection-live pasa en verde cuando no puede verificar nada y no forma parte del check agregado"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-08
---

# x00534 — develop-protection-live pasa en verde cuando no puede verificar nada y no forma parte del check agregado

## Goal

Que el check de proteccion de rama tenga tres salidas semanticas (PASS, FAIL, NOT_EXECUTABLE) y que en CI de gobernanza NOT_EXECUTABLE cuente como FAIL, ademas de entrar en el agregado delendai-validate.

## why

Auditoria 2026-09-08. x00526 esta cerrada y su guard es correcto: branch-protection-guard.script.ts:150 lanza si live.protected no es true. El problema esta en como lo invoca CI. En .github/workflows/ci.yml el job develop-protection-live hace: si GH_TOKEN esta vacio, imprime 'live verification skipped' y exit 0. O sea que sin credencial el check sale verde sin haber probado nada, que es exactamente el patron 'green = property proven OR unable to verify' que la propia auditoria de gobernanza identifico como el fallo a eliminar. Ademas el job NO esta en la lista de needs de delendai-validate, asi que aunque fallara no bloquearia el merge, y su condicion es github.ref igual a refs/heads/develop, con lo que no corre en pull requests hacia develop. Estado real comprobado hoy con gh api: develop devuelve protected false y required_status_checks.enforcement_level off. La proteccion efectiva sigue sin existir mientras varios agentes empujan a la rama.

## non-goals

- No cambiar el guard: su logica ya falla cerrado.
- No configurar el secreto ni la proteccion en GitHub: eso es una accion de administrador del repositorio, no de codigo.

## Slices

- global_gate: lint

### S1 — el job distingue PASS, FAIL y NOT_EXECUTABLE y no puede salir verde sin haber probado
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`
- **Gate**: lint
- acceptance:
  - "Sin credencial, el job termina en FAIL con un mensaje que dice que no se pudo verificar la propiedad, no en exit 0."
  - "Existe una unica valvula de escape explicita y nombrada para forks, activada por una condicion que no puede cumplirse por accidente en el repositorio de origen."
  - "El job entra en la lista de needs de delendai-validate."
  - "El job corre tambien en pull_request hacia develop, no solo en push a develop."

### S2 — el summarizer trata skipped y cancelled como fallo tambien para este job
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/validate-summary.script.ts`, `tools/scripts/ci/validate-summary.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Un job en estado skipped o cancelled dentro de needs hace fallar el agregado, con el nombre del job en el mensaje."
  - "Existe un test que cubre los tres estados (success, skipped, failure) y el resultado esperado del agregado."
  - "Hoy pasa en verde con el conjunto real de jobs."

## acceptance

- Sin credencial, el job termina en FAIL con un mensaje que dice que no se pudo verificar la propiedad, no en exit 0.
- Existe una unica valvula de escape explicita y nombrada para forks, activada por una condicion que no puede cumplirse por accidente en el repositorio de origen.
- El job entra en la lista de needs de delendai-validate.
- El job corre tambien en pull_request hacia develop, no solo en push a develop.
- Un job en estado skipped o cancelled dentro de needs hace fallar el agregado, con el nombre del job en el mensaje.
- Existe un test que cubre los tres estados (success, skipped, failure) y el resultado esperado del agregado.
- Hoy pasa en verde con el conjunto real de jobs.
