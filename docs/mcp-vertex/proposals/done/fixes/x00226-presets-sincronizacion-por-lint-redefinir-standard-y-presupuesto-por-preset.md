---
id: x00226
title: "presets: sincronización por lint, redefinir standard y presupuesto por preset"
kind: fix
status: done
type: proposal
track: registry
date: 2026-08-24
---

# x00226 — presets: sincronización por lint, redefinir standard y presupuesto por preset

## Goal

Endurecer el sistema de presets: eliminar comparaciones manuales, verificar `vertex` contra la config real, redefinir el rol de `standard` y dotar a cada preset de un presupuesto.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §11 PRE-001 — eliminar comparaciones "a mano" (convertirlas en lint)
- §11 PRE-002 — verificar `vertex` vs config real
- §11 PRE-004 — redefinir rol de `standard` (minimal=orientación, lean=trabajo habitual, standard=adaptive/task-aware, swarm=multiagente, full=diagnóstico)
- §11 PRE-005 — preset budget (tool count, schema bytes, cold-start tokens, permissions, capabilities)

Si el código comenta que cierta sincronización debe hacerse manualmente, se convierte en lint. La membership de cada preset se valida contra manifests/config o con test exacto.

## why

Los presets son la superficie de carga real del runtime; si su membership se sincroniza a mano y su rol es ambiguo, el usuario paga tokens por plugins que no necesita. Lint + budget por preset convierten la selección en algo verificable y económico.

## non-goals

- No fusionar presets con manifests (se alimentan de ellos en la propuesta de manifests).
- No eliminar ningún preset existente (solo redefinir roles).
- No fijar números de budget sin medir.

## Slices

- global_gate: type

### S1 — Lint de sincronización de presets
- **Status**: done
- **Files**: `tools/scripts/lint/preset-drift.script.ts`
- **Gate**: type
- acceptance:
  - "Las comparaciones manuales se convierten en lint (PRE-001)."
  - "La membership de vertex se valida contra la config real (PRE-002)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: lint:preset-drift confirmado 0 findings; validate verde.
### S2 — Roles de presets y budget por preset
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: type
- acceptance:
  - "Roles documentados: minimal/lean/standard(adaptive)/swarm/full (PRE-004)."
  - "Cada preset declara tool count, schema bytes, cold-start tokens, permissions y capabilities (PRE-005)."

## acceptance

- Las comparaciones manuales se convierten en lint (PRE-001).
- La membership de vertex se valida contra la config real (PRE-002).
- Roles documentados: minimal/lean/standard(adaptive)/swarm/full (PRE-004).
- Cada preset declara tool count, schema bytes, cold-start tokens, permissions y capabilities (PRE-005).
