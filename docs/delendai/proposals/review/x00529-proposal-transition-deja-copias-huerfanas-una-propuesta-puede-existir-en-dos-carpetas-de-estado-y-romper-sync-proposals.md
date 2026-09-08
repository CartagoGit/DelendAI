---
id: x00529
title: "proposal_transition deja copias huerfanas: una propuesta puede existir en dos carpetas de estado y romper sync_proposals"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-08
last-transition-id: b83df43f-652b-494c-8483-8efab640dc35
last-correlation-id: b83df43f-652b-494c-8483-8efab640dc35
last-transition-from: in-progress
---

# x00529 — proposal_transition deja copias huerfanas: una propuesta puede existir en dos carpetas de estado y romper sync_proposals

## Goal

Garantizar que una propuesta existe exactamente en una carpeta de estado, y que sync_proposals nunca pueda quedar bloqueado por un duplicado.

## why

Auditoria 2026-09-08. sync_proposals fallaba con 'refusing to overwrite existing target via rename' porque f00284 existia a la vez en ready/feats/ y done/feats/. El inventario completo encontro 11 pares duplicados (f00284, f00500, f00502, f00522, x00306, x00323 en TRES carpetas, x00510, x00514, x00515, x00524, r00047). En cada caso la copia avanzada llevaba shipped-in, closed-at, last-transition-* y review-state done, y la copia atrasada era una instantanea pre-transicion: la transicion copio en vez de mover, o escribio el destino sin borrar el origen. El efecto es exactamente el fallo que q00022 quiere eliminar: dos representaciones de la misma entidad y ningun mecanismo que decida cual creer. Peor: al bloquear sync_proposals, un solo duplicado congela la regeneracion del indice para todo el repositorio. Los 11 duplicados ya se han limpiado a mano; esta propuesta cierra la causa raiz y anade el guardarrail.

## non-goals

- No cambiar el modelo carpeta-igual-estado.
- No migrar el indice a SQLite (eso es q00022).

## Slices

- global_gate: type

### S1 — la transicion es un move atomico: origen y destino nunca coexisten
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/services/lifecycle-outcome.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.spec.ts`
- **Gate**: type
- acceptance:
  - "Una transicion que encuentra el destino ya ocupado por el MISMO id resuelve el conflicto en vez de abortar: conserva la copia mas avanzada en el ciclo (ready < in-progress < review < done) y elimina la otra, registrando la resolucion."
  - "Una transicion que encuentra el destino ocupado por un id DISTINTO sigue fallando de forma ruidosa."
  - "Tras cualquier transicion exitosa existe exactamente un fichero para ese id en todo el arbol de proposals."
  - "Un crash simulado entre escritura del destino y borrado del origen deja un estado reparable, no dos verdades."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Focused transition suite passes; duplicate resolution and atomic move behavior are covered.
### S2 — guardarrail: lint de unicidad de propuesta por id, cableado en validate
- **Status**: done
- **Files**: `tools/scripts/lint/proposal-uniqueness.script.ts`, `tools/scripts/lint/proposal-uniqueness.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "El lint recorre docs/delendai/proposals y falla si un id aparece en mas de una carpeta de estado."
  - "El lint reporta cada duplicado con sus rutas y con que copia es la mas avanzada."
  - "El lint esta cableado en bun run validate y hoy pasa en verde."
  - "El lint distingue legacy/ (archivo historico) y no lo reporta."
- review-state: done
- review-implementer: Khmer
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Uniqueness lint suite passes 20/20 and the guard is wired into validation.
### S3 — sync_proposals degrada con diagnostico en vez de abortar el repositorio entero
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`, `plugins/proposals/tests/src/lib/tools/sync-proposals.spec.ts`
- **Gate**: type
- acceptance:
  - "Ante un duplicado, sync_proposals indexa todo lo demas y devuelve el duplicado en errors[] en vez de lanzar y dejar el indice sin regenerar."
  - "El campo count refleja las entidades efectivamente indexadas."
  - "Un repositorio limpio sigue devolviendo errors vacio."
- review-state: done
- review-implementer: Han
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — The sync_proposals degradation path satisfies all declared S3 criteria.
## acceptance

- Una transicion que encuentra el destino ya ocupado por el MISMO id resuelve el conflicto en vez de abortar: conserva la copia mas avanzada en el ciclo (ready < in-progress < review < done) y elimina la otra, registrando la resolucion.
- Una transicion que encuentra el destino ocupado por un id DISTINTO sigue fallando de forma ruidosa.
- Tras cualquier transicion exitosa existe exactamente un fichero para ese id en todo el arbol de proposals.
- Un crash simulado entre escritura del destino y borrado del origen deja un estado reparable, no dos verdades.
- El lint recorre docs/delendai/proposals y falla si un id aparece en mas de una carpeta de estado.
- El lint reporta cada duplicado con sus rutas y con que copia es la mas avanzada.
- El lint esta cableado en bun run validate y hoy pasa en verde.
- El lint distingue legacy/ (archivo historico) y no lo reporta.
- Ante un duplicado, sync_proposals indexa todo lo demas y devuelve el duplicado en errors[] en vez de lanzar y dejar el indice sin regenerar.
- El campo count refleja las entidades efectivamente indexadas.
- Un repositorio limpio sigue devolviendo errors vacio.
