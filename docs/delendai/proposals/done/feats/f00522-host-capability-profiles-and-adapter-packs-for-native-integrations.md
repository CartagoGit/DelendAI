---
id: f00522
title: "Host capability profiles and adapter packs for native integrations"
kind: feat
status: done
type: proposal
track: architecture
date: 2026-09-07
shipped-in:
  - f0ac6e3d5
last-transition-id: f00522-done-2026-09-07
last-correlation-id: f00522-autonomous-orchestration
last-transition-from: review
last-idempotency-key: f00522-done-1
---

# f00522 — Host capability profiles and adapter packs for native integrations

## Goal

Consolidar en delendai una capacidad host-neutral para declarar capacidades de cada entorno, generar adapter packs portables y derivar integraciones sin copiar nombres, formatos ni implementación de proyectos externos.

## why

La investigación comparativa aportó ideas útiles sobre manifiestos canónicos, capacidades declarativas, validación de deriva y separación entre detección y autorización. Este trabajo incorpora esas ideas como contratos propios de delendai, sin dependencia de ningún proyecto externo.

## non-goals

- No importar nombres, formatos de configuración ni código de otros proyectos.
- No instalar agentes ni escribir configuración del host desde core.
- No añadir un segundo workflow, memoria o enrutador de modelos.

## Slices

- global_gate: type

### S1 — Public host capability contract and registry
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/host-capabilities.interface.ts`, `packages/core/src/lib/host/host-capability-registry.ts`, `packages/core/tests/src/lib/host/host-capability-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "El contrato público describe capacidades host-neutrales y valida identidad/versiones."
  - "El registro rechaza duplicados y manifiestos inválidos y devuelve copias defensivas."
  - "Las pruebas cubren lookup, orden estable, capacidades desconocidas y deriva estructural."
- review-state: done
- review-implementer: host-capability-contract
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S2 — Deterministic adapter pack generation
- **Status**: done
- **Files**: `packages/core/src/lib/hosts/host-capability-profile.ts`, `packages/core/src/lib/hosts/host-adapter-pack.ts`, `packages/core/tests/src/lib/hosts/host-capability-profile.spec.ts`
- **Gate**: type
- acceptance:
  - "El plan y el adapter pack son deterministas y serializables."
  - "MCP tools es baseline obligatorio; instrucciones, skills y lifecycle son opcionales."
  - "La continuación manual produce handoff explícito y host-loop exige runner del adaptador."
- review-state: done
- review-implementer: host-adapter-pack
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S3 — Public exports and integration coverage
- **Status**: done — `f0ac6e3d5`
- **DependsOn**: [S1-contract-registry, S2-adapter-pack]
- **Files**: `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/hosts/host-adapter-pack.spec.ts`
- **Gate**: type
- acceptance:
  - "Los contratos y builders se exportan desde la superficie pública soportada."
  - "Existe una prueba de integración que construye registro, perfil y pack sin rutas internas."
  - "No aparecen nombres ni formatos de proyectos externos en el API."
- review-state: done
- review-implementer: host-capability-public
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier

## acceptance

- El contrato público describe capacidades host-neutrales y valida identidad/versiones.
- El registro rechaza duplicados y manifiestos inválidos y devuelve copias defensivas.
- Las pruebas cubren lookup, orden estable, capacidades desconocidas y deriva estructural.
- El plan y el adapter pack son deterministas y serializables.
- MCP tools es baseline obligatorio; instrucciones, skills y lifecycle son opcionales.
- La continuación manual produce handoff explícito y host-loop exige runner del adaptador.
- Los contratos y builders se exportan desde la superficie pública soportada.
- Existe una prueba de integración que construye registro, perfil y pack sin rutas internas.
- No aparecen nombres ni formatos de proyectos externos en el API.
