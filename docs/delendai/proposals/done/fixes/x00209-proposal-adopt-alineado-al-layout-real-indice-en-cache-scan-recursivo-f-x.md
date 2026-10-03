---
id: x00209
title: "proposal_adopt alineado al layout real (índice en cache, scan recursivo, f/x)"
kind: fix
status: done
type: proposal
track: proposals
date: 2026-08-23
---

# x00209 — proposal_adopt alineado al layout real (índice en cache, scan recursivo, f/x)

## Goal

Alinear `proposal_adopt` con el layout real: medir el índice en `.cache/mcp-vertex/proposals/index.json` (no en `proposals/`), escaneo recursivo del árbol de estados, taxonomía canónica `f=feat`/`x=fix`, aplicar el parámetro `dir` a bootstrap+migración+sync, y endurecer el criterio `ready` para que valide estructura real (index + README + carpetas + recolocación de done).

## why

Auditoría 2026-08-24 (hallazgos B1, B2, B3, B4, B5): proposal_adopt mide hasIndex/ready contra un index.json dentro de proposals/ que ya no existe ahí (vive en cache desde x00052), su scan no es recursivo, usa taxonomía vieja (p/f) y el parámetro dir no se aplica a migrate ni sync. Resultado: un LLM que adopta una carpeta de propuestas recibe un diagnóstico equivocado y una adopción a medias.

## non-goals

- No tocar migrate-foreign (propuesta de estados/kinds completa).
- No tocar sync-proposal-registry/proposal-document (propuesta glossary único).
- No cambiar el layout de carpetas en disco.

## Slices

- global_gate: type

### S1 — adopt.ts: layout real, scan recursivo, taxonomía f/x, ready estricto
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/adopt.ts`
- **Gate**: type
- acceptance:
  - "hasIndex/ready usan proposalIndexFile del cache como fuente de verdad."
  - "El scan es recursivo sobre ready/in-progress/review/done/... y clasifica propuestas dentro de carpetas."
  - "La taxonomía es la canónica (f=feat, x=fix) consumida del glossary."
  - "ready exige index + README + carpetas canónicas + recolocación de done."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — adopt.tool.ts: dir coherente en bootstrap+migrate+sync
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/adopt.tool.ts`
- **Gate**: type
- acceptance:
  - "El parámetro dir se aplica a bootstrap, migrateForeign y syncProposalRegistry por igual."
  - "El schema de salida refleja el layout corregido."

### S3 — Tests de adopt
- **Status**: done
- **Files**: `plugins/proposals/tests/src/lib/adopt.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs de adopt cubren scan recursivo, índice en cache, taxonomía y ready estricto."

## acceptance

- hasIndex/ready usan proposalIndexFile del cache como fuente de verdad.
- El scan es recursivo sobre ready/in-progress/review/done/... y clasifica propuestas dentro de carpetas.
- La taxonomía es la canónica (f=feat, x=fix) consumida del glossary.
- ready exige index + README + carpetas canónicas + recolocación de done.
- El parámetro dir se aplica a bootstrap, migrateForeign y syncProposalRegistry por igual.
- El schema de salida refleja el layout corregido.
- Specs de adopt cubren scan recursivo, índice en cache, taxonomía y ready estricto.
