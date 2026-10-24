---
id: x00321
title: "Hardening agnostic commit policy"
kind: fix
status: done
type: proposal
track: commit-policy-hardening
date: 2026-08-30
shipped-in:
  - working-tree-2026-08-31-commit-policy-hardening
---

# x00321 — Hardening agnostic commit policy

## Goal

Corregir commit-policy de extremo a extremo: eliminar contradicciones de política, separar protección local/remota, soportar proveedores mediante una capacidad agnóstica, hacer segura la idempotencia y el scheduler, completar el contrato MCP/manifest y cubrirlo con pruebas, smoke checks y documentación alineada.

## why

La auditoría detectó bloqueos hardcodeados de ramas, acoplamiento a gh/glab/origin, side effects no declarados al arranque, idempotencia concurrentemente insegura, scheduler incompleto, errores no estructurados y cobertura contractual ausente.

## non-goals

- No modificar el plugin forge completo salvo extraer interfaces reutilizables estrictamente necesarias.
- No alterar reglas generales de Git fuera del contrato requerido por commit-policy.
- No tocar cambios ajenos ya presentes en el worktree.

## Slices

- global_gate: type

### S1 — Unificar política de ramas y errores
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/contracts/branch.ts`, `plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/tools/commit-tool.ts`, `plugins/commit-policy/src/lib/tools/push-tool.ts`, `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`
- **Gate**: type
- acceptance:
  - "No existe bloqueo hardcodeado para main/master ni nombres de rama fuera de la configuración efectiva."
  - "Commit, push, scheduler y status consumen la misma decisión de protección."
  - "Las negativas de push y commit tienen códigos estructurados y mensajes accionables."
  - "La suite cubre consistencia status versus ejecución en ramas configurables."
- review-state: done
- review-implementer: copilot-orchestrator
- review-reviewer: technical-investigator
- review-log: requested_changes by delivery-verifier — La implementación pasa 49/49 tests y typecheck, pero no cumple completamente la aceptación: varias negativas de commit/push siguen como texto libre sin código estructurado y falta una prueba directa de consistencia entre status, commit y push para una rama protegida configurable. Añadir códigos reutilizables y mensajes accionables, actualizar las capas tool si hace falta, y cubrir el contrato en tests.
- review-log: approved by technical-investigator — Validado: ramas protegidas unificadas, rechazos tipados y consistencia status/commit/push cubierta.
### S2 — Abstraer protección de proveedores
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/branch-protection-adapter.ts`, `plugins/commit-policy/src/lib/tools/branch-protection-tool.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/tests/src/lib/services/branch-protection-adapter.spec.ts`, `plugins/commit-policy/tests/src/index.spec.ts`
- **Gate**: type
- acceptance:
  - "La protección remota no depende de origin fijo ni de una única pareja github.com/gitlab.com."
  - "Existe una interfaz/adaptador de proveedor agnóstico con fallback local explícito."
  - "El refresh no ejecuta red/procesos implícitamente durante register salvo opt-in documentado y controlado."
  - "La herramienta, el estado y el manifest pueden representar remoto no soportado, stale y error."
- review-state: done
- review-implementer: copilot-orchestrator
- review-reviewer: technical-investigator
- review-log: approved by technical-investigator — Validado: adaptador agnóstico, fallback local explícito y remoto unsupported/stale/error representable.
### S3 — Endurecer idempotencia y scheduler
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/processed-events.ts`, `plugins/commit-policy/src/lib/services/push-scheduler.ts`, `plugins/commit-policy/src/lib/triggers/interval-timer.ts`, `plugins/commit-policy/src/lib/triggers/threshold-tracker.ts`, `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`, `plugins/commit-policy/tests/src/lib/services/push-scheduler.spec.ts`
- **Gate**: type
- acceptance:
  - "Dos escritores concurrentes no pierden claves de idempotencia."
  - "everyNMinutes detecta commits sin publicar aunque el plugin se reinicie."
  - "Los triggers de commit y push no duplican operaciones ni pierden errores."
  - "Hay tests de concurrencia, reinicio y commits existentes sin publicar."
- review-state: done
- review-implementer: copilot-orchestrator
- review-reviewer: technical-investigator
- review-log: approved by technical-investigator — Validado: store JSONL con mutex, reinicio everyNMinutes y scheduler sin duplicación de push.
### S4 — Completar manifest y contrato MCP
- **Status**: done
- **Files**: `plugins/commit-policy/plugin.manifest.ts`, `plugins/commit-policy/tests/src/lib/dry-run-commit.spec.ts`, `tools/scripts/lint/manifest-vs-package.script.ts`, `tools/scripts/lint/manifest-vs-package.spec.ts`
- **Gate**: type
- acceptance:
  - "Todas las herramientas registradas aparecen en el manifest."
  - "Los efectos network/spawn/write están declarados y verificados."
  - "El contrato dry-run y los permisos de host reflejan los efectos reales."
  - "Los validadores fallan ante drift de herramientas o permisos."
- review-state: done
- review-implementer: copilot-orchestrator
- review-reviewer: technical-investigator
- review-log: approved by technical-investigator — Validado: manifest completo, permisos/effects declarados y lint anti-drift en verde.
### S5 — Alinear documentación y pruebas E2E
- **Status**: done
- **DependsOn**: [S1, S2, S3, S4]
- **Files**: `plugins/commit-policy/README.md`, `plugins/commit-policy/README.es.md`, `plugins/commit-policy/src/lib/contracts/options.ts`, `plugins/commit-policy/src/lib/identity/resolver.ts`, `plugins/commit-policy/src/lib/tools/run-tool.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`, `plugins/commit-policy/tests/src/lib/identity/resolver.spec.ts`, `plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`
- **Gate**: e2e
- acceptance:
  - "README y knowledge runtime describen el mismo comportamiento real."
  - "La prioridad de identidad, intervalos, protección remota y configuración multi-remoto están alineadas."
  - "E2E cubre Git remoto genérico, branch configurable, push, dry-run y fallos estructurados."
  - "No quedan referencias incorrectas a GitHub como requisito universal."
- review-state: done
- review-implementer: copilot-orchestrator
- review-reviewer: technical-investigator
- review-log: approved by technical-investigator — Validado: README EN/ES, identidad y E2E alineados con remoto genérico y fallos estructurados.
## acceptance

- No existe bloqueo hardcodeado para main/master ni nombres de rama fuera de la configuración efectiva.
- Commit, push, scheduler y status consumen la misma decisión de protección.
- Las negativas de push y commit tienen códigos estructurados y mensajes accionables.
- La suite cubre consistencia status versus ejecución en ramas configurables.
- La protección remota no depende de origin fijo ni de una única pareja github.com/gitlab.com.
- Existe una interfaz/adaptador de proveedor agnóstico con fallback local explícito.
- El refresh no ejecuta red/procesos implícitamente durante register salvo opt-in documentado y controlado.
- La herramienta, el estado y el manifest pueden representar remoto no soportado, stale y error.
- Dos escritores concurrentes no pierden claves de idempotencia.
- everyNMinutes detecta commits sin publicar aunque el plugin se reinicie.
- Los triggers de commit y push no duplican operaciones ni pierden errores.
- Hay tests de concurrencia, reinicio y commits existentes sin publicar.
- Todas las herramientas registradas aparecen en el manifest.
- Los efectos network/spawn/write están declarados y verificados.
- El contrato dry-run y los permisos de host reflejan los efectos reales.
- Los validadores fallan ante drift de herramientas o permisos.
- README y knowledge runtime describen el mismo comportamiento real.
- La prioridad de identidad, intervalos, protección remota y configuración multi-remoto están alineadas.
- E2E cubre Git remoto genérico, branch configurable, push, dry-run y fallos estructurados.
- No quedan referencias incorrectas a GitHub como requisito universal.
