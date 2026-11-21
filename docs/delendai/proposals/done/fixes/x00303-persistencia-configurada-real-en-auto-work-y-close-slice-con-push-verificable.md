---
id: x00303
title: "Persistencia configurada real en auto_work y close_slice con push verificable"
kind: fix
status: done
type: proposal
track: proposals-commit-persistence
date: 2026-08-29
shipped-in: ["d2e53cae8 # S1 runner", "9c3ed108a # S2 close_slice persist", "645c623d7 # S3/S4 managed-lazy merge + engine wait-for-push"]
last-transition-id: 562c6237-5f72-4615-8037-eb1d8fb05990
last-correlation-id: 562c6237-5f72-4615-8037-eb1d8fb05990
last-transition-from: review
---

# x00303 — Persistencia configurada real en auto_work y close_slice con push verificable

## Goal

Hacer efectiva la persistencia configurada en plugins.proposals.persist: el cierre de una slice debe ejecutar el commit y, cuando el modo sea commit-and-push, esperar y verificar el push antes de reportar éxito. El flujo debe funcionar desde un host MCP con superficie managed/lazy y no depender de que el modelo invoque un helper TypeScript no expuesto como herramienta.

## why

La configuración del repositorio pide commit-and-push, pero auto_work sólo emite texto, close_slice no persiste, y maybePersistAfterSlice usa un runner no-op cuando no se inyecta uno. En paralelo, commit-policy puede activarse lazy y su scheduler hace push fuera de la respuesta del commit, por lo que un host puede observar éxito local mientras el push sigue pendiente o nunca ocurre. La reproducción del 2026-08-29 deja develop ahead 1 de origin/develop, con 25 cambios locales; el commit 06ea54e está en origin/wip/mcp-vertex-work, no en origin/develop. x00299 sólo trata el guard de develop y no cubre ejecución ni verificación de persistencia.

## non-goals

- No permitir push directo a main o master.
- No incluir cambios ajenos al conjunto de archivos de la slice.
- No cambiar la política de worktrees ni crear automatismos de merge/PR.
- No duplicar x00299: la autorización de develop queda sujeta a la política configurada y separada de la ejecución transaccional.

## Slices

- global_gate: type

### S1 — Runner de persistencia real y contrato estricto commit-and-push
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/auto-work-persist.ts`, `plugins/proposals/src/lib/shared/git-runner.ts`, `plugins/proposals/tests/src/lib/tools/auto-work-persist.spec.ts`
- **Gate**: type
- acceptance:
  - "La producción usa un runner real async en cwd cuando no se inyecta un fake; nunca cae silenciosamente a un no-op que simula persistencia configurada."
  - "En modo commit-and-push, el resultado sólo tiene pushed=true después de que git push devuelve ok=true; committed=true,pushed=false siempre es un resultado de error/incompleto, nunca éxito."
  - "Se conservan staging explícito por archivos, identidad configurada y rechazo de ramas protegidas según la política efectiva."
  - "Las pruebas cubren runner real inyectado/por defecto, push rechazado, timeout o error de git y éxito completo con hash y push verificado."
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: el commit d2e53cae contiene los tres archivos declarados de S1; el gate type salió con exit code 0 y la suite enfocada pasó 27/27. La implementación satisface runner real async, staging explícito, protección de ramas y resultados incompletos en fallos de push.
### S2 — close_slice ejecuta la persistencia configurada y expone el resultado
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/authoring.spec.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "close_slice obtiene los archivos declarados de la slice y ejecuta la persistencia configurada después de validar y antes de liberar el lock."
  - "El modo commit-and-push espera el push; si commit o push fallan, close_slice devuelve un envelope de error/incompleto con reason y nunca reporta closed=true como éxito final."
  - "La respuesta de close_slice y el plan de auto_work incluyen un bloque persistido tipado con mode, committed, pushed, hash/reason cuando corresponda."
  - "La ruta legacy sin persistencia conserva mode none y no toca git; no se hace git add . ni se incorporan cambios ajenos."
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: la implementación 9c3ed108 cubre los cuatro archivos de producción/prueba declarados y 4940b0dd corrige el fixture para habilitar explícitamente agentWorktree en commit-and-push. El gate type devuelve exit code 0 y ambas suites pasan 42/42; close_slice no cierra ni libera ante persistencia incompleta y auto_work expone el bloque persistido.
### S3 — Host managed/lazy y activación de commit-policy antes de eventos de slice
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/cli/managed-lazy-assembly.spec.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts`, `plugins/proposals/tests/src/lib/e2e/sync-and-locks.e2e.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Con surfaceMode managed y loading lazy, un host que configura commit-policy con commit/push/cadence habilitados activa el plugin startup antes de que el cambio de index de close_slice pueda perder el evento."
  - "La invocación MCP real auto_work → close_slice no depende de llamar funciones TypeScript privadas ni de una segunda activación manual del plugin."
  - "La prueba verifica observables reales: commit creado, push terminado y refs remotas actualizadas; un commit local sin push hace fallar la prueba."
  - "La activación explícita por router y la activación startup siguen siendo idempotentes y no duplican listeners/schedulers."
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: el e2e managed/lazy configura un único propietario Git (proposals.persist), habilita agentWorktree y usa la rama agent/* con refspec HEAD:wip/x00298-s3. El flujo MCP real confirma commit, push terminado y ref remota actualizada; las suites e2e declaradas pasan 15/15 y el typecheck de proposals devuelve exit code 0. La activación startup de commit-policy queda cubierta sin duplicar listeners de slice.
### S4 — Commit-policy devuelve estado final y no éxito prematuro
- **Status**: done
- **DependsOn**: [S1, S3]
- **Files**: `plugins/commit-policy/src/lib/tools/commit-tool.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/lib/services/push-scheduler.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/push-scheduler.spec.ts`, `plugins/commit-policy/tests/src/lib/engine.spec.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: type
- acceptance:
  - "El camino de commit con onCommit=true espera el resultado del push o devuelve un estado explícito de persistencia pendiente/fallida; no reporta éxito final con pushed=false."
  - "Los errores de push, ramas protegidas, timeout y detached HEAD se propagan con refusal/reason estructurado y métricas de committed/pushed coherentes."
  - "El scheduler no deja un push fire-and-forget que sobreviva a la respuesta del tool sin una señal observable de finalización."
  - "Dogfood cubre un remote bare/local y comprueba que cada éxito reportado implica que la referencia remota contiene el commit."
- review-state: done
- review-implementer: copilot-x00298-s4
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — typecheck exit 0; 4 archivos / 45 tests focalizados pasando; commit 2c6ea3ed
## acceptance

- La producción usa un runner real async en cwd cuando no se inyecta un fake; nunca cae silenciosamente a un no-op que simula persistencia configurada.
- En modo commit-and-push, el resultado sólo tiene pushed=true después de que git push devuelve ok=true; committed=true,pushed=false siempre es un resultado de error/incompleto, nunca éxito.
- Se conservan staging explícito por archivos, identidad configurada y rechazo de ramas protegidas según la política efectiva.
- Las pruebas cubren runner real inyectado/por defecto, push rechazado, timeout o error de git y éxito completo con hash y push verificado.
- close_slice obtiene los archivos declarados de la slice y ejecuta la persistencia configurada después de validar y antes de liberar el lock.
- El modo commit-and-push espera el push; si commit o push fallan, close_slice devuelve un envelope de error/incompleto con reason y nunca reporta closed=true como éxito final.
- La respuesta de close_slice y el plan de auto_work incluyen un bloque persistido tipado con mode, committed, pushed, hash/reason cuando corresponda.
- La ruta legacy sin persistencia conserva mode none y no toca git; no se hace git add . ni se incorporan cambios ajenos.
- Con surfaceMode managed y loading lazy, un host que configura commit-policy con commit/push/cadence habilitados activa el plugin startup antes de que el cambio de index de close_slice pueda perder el evento.
- La invocación MCP real auto_work → close_slice no depende de llamar funciones TypeScript privadas ni de una segunda activación manual del plugin.
- La prueba verifica observables reales: commit creado, push terminado y refs remotas actualizadas; un commit local sin push hace fallar la prueba.
- La activación explícita por router y la activación startup siguen siendo idempotentes y no duplican listeners/schedulers.
- El camino de commit con onCommit=true espera el resultado del push o devuelve un estado explícito de persistencia pendiente/fallida; no reporta éxito final con pushed=false.
- Los errores de push, ramas protegidas, timeout y detached HEAD se propagan con refusal/reason estructurado y métricas de committed/pushed coherentes.
- El scheduler no deja un push fire-and-forget que sobreviva a la respuesta del tool sin una señal observable de finalización.
- Dogfood cubre un remote bare/local y comprueba que cada éxito reportado implica que la referencia remota contiene el commit.
