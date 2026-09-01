---
id: x00299
title: "Permitir persistencia configurada hacia develop"
kind: fix
status: ready
type: proposal
track: governance
date: 2026-08-29
shipped-in: ["0c0be56d6 # feat(core): enforce cross-plugin configuration compatibility, develop push guard"]
---

# x00261 — Permitir persistencia configurada hacia develop

## Goal

Alinear commit-policy y auto_work con la configuración explícita del repositorio: cuando el operador habilita commit-and-push con destino origin develop, el sistema debe poder commitear y pushear a develop usando la identidad configurada, sin protecciones hardcodeadas que contradigan el archivo de configuración. Mantener main/master protegidas y cubrir el comportamiento con tests.

## why

La configuración declara commit-and-push a origin develop, pero push-driver y auto-work-persist rechazan develop de forma incondicional; por eso las slices terminan sin push aunque el plugin esté habilitado.

## non-goals

- No habilitar pushes a main o master.
- No modificar la política de worktrees del repositorio.
- No incluir cambios concurrentes ajenos en el commit.

## Slices

- global_gate: type

### S1 — Alinear guards y tests de push en develop
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/services/push-scheduler.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/push-scheduler.spec.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: type
- acceptance:
  - "develop no se rechaza por nombre cuando no está en protectedBranches."
  - "main y master siguen rechazándose."
  - "Los tests cubren allow/deny según configuración."
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: push-driver y push-scheduler mantienen guard duro para main/master fuera de protectedBranches; develop solo se rechaza si la configuracion lo incluye. Vitest focalizado verde (33/33) y typecheck del plugin verde sobre el commit de referencia b51172dbd8ab57b033491346d0cba7ab80946def.
### S2 — Alinear helper auto-work y documentación
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/auto-work-persist.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/tools/auto-work-persist.spec.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`, `plugins/commit-policy/README.es.md`
- **Gate**: type
- acceptance:
  - "commit-and-push respeta pushTarget origin develop cuando la política lo permite."
  - "No existe guard hardcodeado que desvíe a wip sin declararlo."
  - "La documentación refleja el comportamiento configurado."
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: maybePersistAfterSlice honra pushTarget configurado y solo rehusa ramas incluidas en la politica efectiva; auto_work ya no sugiere ni inventa desvio a wip/* y la documentacion de commit-policy describe develop como permitido solo cuando no figura en push.protectedBranches. Typecheck del plugin proposals y vitest focalizado verdes en este HEAD, sin bloqueadores externos observables para este slice.
## acceptance

- develop no se rechaza por nombre cuando no está en protectedBranches.
- main y master siguen rechazándose.
- Los tests cubren allow/deny según configuración.
- commit-and-push respeta pushTarget origin develop cuando la política lo permite.
- No existe guard hardcodeado que desvíe a wip sin declararlo.
- La documentación refleja el comportamiento configurado.
