---
id: f00260
title: "Catálogo dinámico base de modelos y capacidades"
kind: feat
status: done
type: proposal
track: multi-model-coordination
date: 2026-08-29
---

# f00260 — Catálogo dinámico base de modelos y capacidades

## Goal

Implementar la primera fase del plan maestro sobre los contratos multi-modelo existentes: un registro in-memory de descriptores de modelos con aliases, capacidades, límites, lifecycle y fuente; filtros deterministas; resolución de aliases; y pruebas enfocadas. No incluye discovery de red, cuotas, health, routing ni mutación de configuración.

## why

El repositorio ya tiene IProviderCapabilities, IProviderSummary, IProviderAvailability y scoring de providers, pero no existe un catálogo de modelos reutilizable con aliases y filtros. Esta slice evita duplicar el router externo y establece la base para discovery posterior.

## non-goals

- No consultar APIs externas ni documentación web.
- No implementar cuota, health probes, circuit breaker o fallback runtime.
- No cambiar defaults de routing ni configuración existente.
- No aplicar auto-healing ni editar secretos.

## Slices

- global_gate: type

### S1 — Implementar catálogo y contratos
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/model-catalog.interface.ts`, `packages/core/src/lib/catalog/model-catalog.ts`, `packages/core/src/lib/catalog/index.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/catalog/model-catalog.spec.ts`, `docs/mcp-vertex/MODEL-CATALOG.md`
- **Gate**: type
- acceptance:
  - "El catálogo registra descriptores sin duplicar keys ni aliases de forma ambigua."
  - "Soporta list, get, search y resolveAlias con filtros de capabilities, provider y contexto mínimo."
  - "Devuelve snapshots inmutables y no realiza I/O."
  - "Conserva la separación entre catálogo y routing."
  - "Los tests cubren registro, filtros, alias ambiguo/desconocido, lifecycle y límites."
- review-state: done
- review-implementer: mcp-vertex-implementation-runner
- review-reviewer: delivery_verifier
- review-log: requested_changes by mcp-vertex-delivery-verifier — S1 no es aprobable todavía. En packages/core/src/lib/catalog/model-catalog.ts, cloneEntry copia invoke.args de mcp-server solo con { ...entry.invoke.args }, que es superficial. Si args contiene objetos o arrays anidados, la entrada suministrada y el snapshot comparten referencias; además freezeDeep congela esas referencias originales al registrar. Esto contradice la aceptación y MODEL-CATALOG.md de snapshots defensivos/profundamente congelados. Añadir copia profunda independiente y un test que mutile/inspeccione args anidados. No hay commit asociado en el árbol actual.
- review-log: approved by delivery_verifier — Verificado: cloneValue recurre por objetos/arrays, freezeDeep congela el clon y la prueba cubre mutación anidada del input sin afectar el snapshot.
## acceptance

- El catálogo registra descriptores sin duplicar keys ni aliases de forma ambigua.
- Soporta list, get, search y resolveAlias con filtros de capabilities, provider y contexto mínimo.
- Devuelve snapshots inmutables y no realiza I/O.
- Conserva la separación entre catálogo y routing.
- Los tests cubren registro, filtros, alias ambiguo/desconocido, lifecycle y límites.
