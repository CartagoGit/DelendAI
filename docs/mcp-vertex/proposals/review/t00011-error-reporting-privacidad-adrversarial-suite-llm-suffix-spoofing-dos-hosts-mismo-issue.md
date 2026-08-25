---
id: t00011
title: "error-reporting privacidad adversarial suite llm suffix spoofing y dos hosts mismo issue"
kind: test
status: review
type: proposal
track: privacy
date: 2026-08-25
parent-plan: q00005
---

# t00011 — suite adversarial de privacidad para llm-format

## Goal

Cubrir con pruebas adversariales la ruta llm-format endurecida en x00249: misma issue segura entre hosts distintos y rechazo de spoofing por sufijo interno.

## why

La regresión que motivó q00005 no aparece en la ruta typed-internal normal sino en la reconstrucción sintética de llm-format. Esta suite impide que reaparezcan fugas por nombres de tools host.

## non-goals

- No amplía el validador de privacidad con nuevas heurísticas.
- No cambia el comportamiento funcional del reporter fuera de las pruebas.

## Slices

- global_gate: none

### S1 — Adversarial llm-format invariants
- **Status**: done
- **Files**: `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: none

## acceptance

- Dos payloads privados distintos que recorren llm-format sobre una tool propia de mcp-vertex generan el mismo reporte seguro.
- El body, fingerprint y JSON serializado no contienen marcadores privados de host.
- Un tool host con sufijo interno engañoso no llega a producir un safe report.