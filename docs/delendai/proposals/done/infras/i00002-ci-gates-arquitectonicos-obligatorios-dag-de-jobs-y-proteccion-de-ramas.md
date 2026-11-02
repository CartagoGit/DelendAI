---
id: i00002
title: "CI: gates arquitectónicos obligatorios, DAG de jobs y protección de ramas"
kind: infra
status: done
type: proposal
track: ci-test-docs
date: 2026-08-24
---

# i00002 — CI: gates arquitectónicos obligatorios, DAG de jobs y protección de ramas

## Goal

Hacer que todos los gates arquitectónicos locales sean required checks en CI, con nombres claros, jobs paralelos (DAG) y protección de ramas.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §18 CI-001 — los lints arquitectónicos deben ser required checks (mapear cada validación local a un job)
- §18 CI-002 — no usar un job "lint" que valide solo una subárea (nombres: lint:biome, lint:architecture, lint:presets, lint:docs, lint:security)
- §18 CI-003 — parallelizar `validate` (DAG de jobs)
- §18 CI-004/CI-005 — required checks en `develop` y `main` (branch protection)
- §18 CI-006/007/008 — mantener pack smoke bajo Node, tarball install e2e y site build real (fortalezas)

Hoy el job `lint` ejecuta `bun run lint` (limitado a la extensión VS Code + i18n) mientras la batería de validaciones arquitectónicas vive en `bun run validate`, que CI no ejecuta completo. Resultado: reglas que parecen invariantes no bloquean PRs.

## why

La calidad existe localmente pero no obliga en CI: una PR puede violar preset drift, plugin wiring, docs o secret patterns sin ser bloqueada. Si un gate no bloquea una PR, no es un gate.

## non-goals

- No eliminar los jobs existentes de smoke/tarball/site (se mantienen).
- No cambiar las reglas locales (solo hacerlas obligatorias en CI).
- No gestionar secrets de GitHub aquí.

## Slices

- global_gate: type

### S1 — Descomponer validate en jobs con nombres claros
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Cada validación local mapea a un job (lint:biome, lint:architecture, lint:presets, lint:docs, lint:security, typecheck, tests)."
  - "No hay un job 'lint' que valide solo una subárea (CI-002)."
  - "Los jobs se paralelizan en un DAG (CI-003)."
  - "Pack smoke Node, tarball install e2e y site build real se mantienen como checks (CI-006/007/008)."
  - "Se documentan los required checks para develop y main (CI-004/005) en el doc nuevo docs/mcp-vertex/CI-GATES.md."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. Fase 1 review 2026-08-25: validate verde.
## acceptance

- Cada validación local mapea a un job (lint:biome, lint:architecture, lint:presets, lint:docs, lint:security, typecheck, tests).
- No hay un job 'lint' que valide solo una subárea (CI-002).
- Los jobs se paralelizan en un DAG (CI-003).
- Pack smoke Node, tarball install e2e y site build real se mantienen como checks (CI-006/007/008).
- Se documentan los required checks para develop y main (CI-004/005).
- Se documenta el mapeo validación local -> job CI.
