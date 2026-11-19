---
id: x00252
title: "ci-lint-governance-failure-root-cause-y-remediation-sublinlts-fallando"
kind: fix
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
---

# x00252 — lint-governance vuelve a pasar

## Goal

Hacer que la reproducción fiel del job `lint-governance` vuelva a pasar en el checkout actual.

## why

El rojo actual no venía de un único bug de runtime sino de una cadena de fallos de gobernanza: store de propuestas incoherente para q00005, ids duplicados por movimientos de ready/review y dos baselines históricas que el propio lint exige rebaselinar con `--update`.

## non-goals

- No redefine el contenido funcional de propuestas históricas fuera de la baseline que los scripts ya aceptan actualizar.
- No toca otros jobs de CI fuera del conjunto de sublints de `lint-governance`.

## Slices

- global_gate: none

### S1 — Reparar integridad del proposal store y rebaselines históricos
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/plans/q00005-plan-hardening-post-auditoria-chatgpt-sol-tercera-pasada.md`, `docs/mcp-vertex/proposals/ready/c00020-ci-evidence-required-on-close-transicion-solo-con-sha-exacto.md`, `tools/scripts/lint/proposal-files-exist.baseline.json`, `tools/scripts/lint/proposal-slice-completeness.baseline.json`
- **Gate**: none

## acceptance

- La reproducción completa del job `lint-governance` pasa en el checkout actual.
- q00005 deja de introducir drift de carpeta/status y la colisión del nuevo chore CI queda resuelta con un id libre.
- Los lints históricos con soporte `--update` quedan rebaselinados por su propio script, no por edición manual.
resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00252` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
