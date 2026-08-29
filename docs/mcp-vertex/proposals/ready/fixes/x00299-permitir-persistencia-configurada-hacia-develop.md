---
id: x00299
title: "Permitir persistencia configurada hacia develop"
kind: fix
status: ready
type: proposal
track: governance
date: 2026-08-29
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
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/services/push-scheduler.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/push-scheduler.spec.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: type
- acceptance:
  - "develop no se rechaza por nombre cuando no está en protectedBranches."
  - "main y master siguen rechazándose."
  - "Los tests cubren allow/deny según configuración."

### S2 — Alinear helper auto-work y documentación
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/auto-work-persist.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/tools/auto-work-persist.spec.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`, `plugins/commit-policy/README.es.md`
- **Gate**: type
- acceptance:
  - "commit-and-push respeta pushTarget origin develop cuando la política lo permite."
  - "No existe guard hardcodeado que desvíe a wip sin declararlo."
  - "La documentación refleja el comportamiento configurado."

## acceptance

- develop no se rechaza por nombre cuando no está en protectedBranches.
- main y master siguen rechazándose.
- Los tests cubren allow/deny según configuración.
- commit-and-push respeta pushTarget origin develop cuando la política lo permite.
- No existe guard hardcodeado que desvíe a wip sin declararlo.
- La documentación refleja el comportamiento configurado.
