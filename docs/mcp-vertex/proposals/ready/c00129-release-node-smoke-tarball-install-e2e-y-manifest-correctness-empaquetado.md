---
id: c00129
title: "release: Node smoke, tarball install e2e y manifest correctness empaquetado"
kind: chore
status: ready
type: proposal
track: web-release
date: 2026-08-24
---

# c00129 — release: Node smoke, tarball install e2e y manifest correctness empaquetado

## Goal

Mantener y verificar las fortalezas de release/empaquetado y corregir la coherencia del manifest en el paquete publicado.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §26 REL-001 — mantener Node smoke (no eliminar)
- §26 REL-002 — mantener tarball install e2e (muy valioso)
- §26 REL-003 — manifest correctness en el paquete publicado (verificar que manifest/registry coincide con lo empaquetado)
- (REL-004 — version injection — cubierto por la propuesta de client)

Estas fortalezas no se eliminan; se añade una verificación de que el manifest/registry de cada package coincide con el artefacto empaquetado.

## why

Probar artefactos publicables (Node smoke, tarball real en limpio) es de las decisiones más maduras del proyecto y debe mantenerse. Añadir la verificación de manifest empaquetado evita publicar un catálogo desincronizado.

## non-goals

- No eliminar los smoke tests existentes.
- No cambiar el proceso de release.
- No duplicar REL-004 (version injection) aquí.

## Slices

- global_gate: type

### S1 — Verificación de manifest en el paquete publicado
- **Status**: pending
- **Files**: `tools/scripts/release/verify-published-manifest.script.ts`
- **Gate**: type
- acceptance:
  - "Verifica que manifest/registry de cada package coincide con lo empaquetado (REL-003)."
  - "Node smoke y tarball install e2e se mantienen como checks (REL-001/002)."

## acceptance

- Verifica que manifest/registry de cada package coincide con lo empaquetado (REL-003).
- Node smoke y tarball install e2e se mantienen como checks (REL-001/002).
