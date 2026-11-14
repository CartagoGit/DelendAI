---
id: f00386
title: "Validación selectiva por agente activo y gate full al cerrar el último agente"
kind: feat
status: done
type: proposal
track: parallel-validation
date: 2026-08-30
shipped-in: [38bfc58ec]
last-transition-id: 770202a6-2e28-4bd1-8029-1522203c48c5
last-correlation-id: 770202a6-2e28-4bd1-8029-1522203c48c5
last-transition-from: review
---

# f00386 — Validación selectiva por agente activo y gate full al cerrar el último agente

## Goal

Hacer que la validación previa al cierre de una slice sea consciente de la
actividad del enjambre: cada agente ejecuta sólo los scopes que cubren sus
archivos cuando hay otros agentes activos, y el último agente activo ejecuta
el gate completo antes de cerrar.

## why

La validación completa repetida por cada agente desperdicia tiempo y puede
producir resultados engañosos cuando el workspace contiene cambios de otras
slices. El cierre necesita una decisión determinista y auditable que distinga
`scoped`, `full` y `blocked`, conserve la identidad del snapshot observado y
explique por qué se eligió cada modo.

## non-goals

- Cambiar la semántica de los gates existentes o inventar scopes que no estén
	configurados por el host.
- Ejecutar escrituras Git, commits o pushes como parte del proveedor de
	actividad y resolución de scopes.
- Resolver conflictos de archivos entre agentes; la propiedad sigue siendo
	responsabilidad del lock de la slice.

## Slices

- global_gate: type

### S1 — Contrato y resolvers de actividad y alcance
- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/validation-activity.types.ts`, `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/quality/src/lib/services/scoped-validation.types.ts`, `plugins/quality/src/lib/services/scoped-validation.resolver.ts`
- **Gate**: `bunx tsc --noEmit -p tsconfig.json`
- Implementar el contrato tipado para decidir validación `scoped`, `full` o `blocked` a partir de actividad, locks y worktrees.
- Derivar scopes seguros desde los archivos propios de una slice y aplicar fallback universal sólo cuando esté configurado explícitamente.
- Añadir tests para deduplicación, señales stale/corruptas, snapshot estable y fallback conservador.
- review-state: done
- review-implementer: f00386-s1-repair
- review-reviewer: technical_investigator
- review-log: requested_changes by delivery_verifier — La revisión independiente exige corregir identidad de branch ambigua, estabilizar snapshotId frente al orden de entradas, degradar close a scoped cuando falta una fuente pero existe otro actor activo, y añadir tests unitarios directos para los tres casos.
- review-log: approved by technical_investigator — Revisión independiente posterior a los cambios: identidad ambigua corregida, snapshotId estable, degradación scoped con fuente missing y suites focalizadas 4/4; Biome y typechecks limpios.

### S2 — Integración de la decisión en close_slice y quality
- **Status**: done
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/quality/src/public/index.ts`, `tools/scripts/quality/run-quality.script.ts`
- **Gate**: `bunx tsc --noEmit -p tsconfig.json`
- Conectar el proveedor de actividad con `close_slice` y propagar modo, scopes y snapshot al quality probe.
- Ejecutar sólo los scopes resueltos en modo `scoped`, ejecutar todos en modo `full` y rechazar el cierre en modo `blocked`.
- Exportar la API pública mínima de quality y aceptar selección explícita de scopes en el script de calidad.
- review-state: done
- review-implementer: f00386-s2
- review-reviewer: delivery_verifier

### S3 — Evidencia y pruebas de integración
- **Status**: done
- **Files**: `plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`, `plugins/proposals/tests/src/lib/close-slice-validation.spec.ts`
- **Gate**: `bunx vitest run plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts plugins/proposals/tests/src/lib/close-slice-validation.spec.ts`
- Verificar empíricamente los modos `scoped`, `full` y `blocked`, incluyendo agentes activos, cobertura de scopes y fuentes ausentes o stale.
- Verificar que la respuesta de `close_slice` incluye modo, scopes resueltos, snapshot, archivos propios, conteos de actividad y motivo.
- Verificar que una validación fallida bloquea el cierre y que una validación válida permite la transición y la reubicación documental posterior.
- review-state: done
- review-implementer: f00386-s3
- review-reviewer: technical_investigator

## acceptance

- Con varios agentes activos, cada cierre ejecuta únicamente los scopes que cubren los archivos propios de su slice y devuelve evidencia con `mode: scoped`.
- Cuando el agente que cierra es el último activo, el cierre ejecuta todos los scopes configurados y devuelve `mode: full`.
- Si no se puede determinar una validación segura, el cierre devuelve `mode: blocked`, incluye `reason` y no marca la slice como `done`.
- La evidencia contiene `mode`, cobertura de scopes, `snapshotId`, archivos propios, scopes resueltos, conteos de agentes activos y motivo.
- Las suites focalizadas de provider, quality y close_slice pasan, y el documento de propuesta conserva slices disjuntos y estados revisables.
