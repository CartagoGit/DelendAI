---
id: i00003
title: "web: perfiles de token/permisos por plugin y cobertura de la UI"
kind: infra
status: done
type: proposal
track: web-release
date: 2026-08-24
---

# i00003 — web: perfiles de token/permisos por plugin y cobertura de la UI

## Goal

Fortalecer la web/UI: mantener la generación desde datos vivos, añadir cobertura de tests y mostrar perfiles de token/permisos por plugin.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §25 WEB-001 — mantener generación desde datos vivos (reducir duplicación)
- §25 WEB-002 — coverage/test strategy (build real, component tests, critical E2E, i18n checks)
- §25 WEB-003 — mostrar token/permission profiles por plugin (cost, permissions, maturity, presets)

La página de plugin (`apps/web/src/pages/[lang]/plugins/[plugin].astro`) y el catálogo (`apps/web/src/data/manifests/`) ya se alimentan de manifests; se extienden con perfiles de coste/permisos/maturity y se añade cobertura.

## why

La web es la cara pública del catálogo: si muestra coste, permisos y maturity por plugin, ayuda a la adopción y a la decisión de qué activar. Y la generación desde datos vivos evita que la web se desincronice del código.

## non-goals

- No rediseñar la web.
- No sustituir astro check por build (ambos se mantienen).
- No duplicar datos de manifests (siempre generado).

## Slices

- global_gate: type

### S1 — Perfiles de token/permisos en la página de plugin
- **Status**: done
- **Files**: `apps/web/src/pages/[lang]/plugins/[plugin].astro`
- **Gate**: type
- acceptance:
  - "Muestra cost, permissions, maturity y presets por plugin desde manifests (WEB-003)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde.
### S2 — Cobertura de la web
- **Status**: done
- **Files**: `apps/web/tests/data/plugin-catalog.spec.ts`
- **Gate**: type
- acceptance:
  - "Component tests + build snapshots + i18n checks para la página de plugin (WEB-002)."
  - "El spec nuevo de perfiles se crea en apps/web/tests/plugin-profile.spec.ts."
  - "El build real se mantiene como check (WEB-001)."

## acceptance

- Muestra cost, permissions, maturity y presets por plugin desde manifests (WEB-003).
- Component tests + build snapshots + i18n checks para la página de plugin (WEB-002).
- El build real se mantiene como check (WEB-001).
