---
id: f00385
title: "Recuperar o retirar el work item migrado f00385"
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/2026-08-29-full-working-tree-audit.md#item-25047
---

# f00385 — Recuperar o retirar el work item migrado f00385

## Goal

Convertir la migracion corrupta de f00385 en una decision verificable: o bien recuperar el contenido real del item 25047 desde una fuente confiable y reescribir esta propuesta con alcance implementable, o bien retirarla explicitamente como irrecuperable sin seguir arrastrando texto placeholder ni estado de revision falso.

## why

La propuesta actual no describe trabajo real. El titulo es generico, el goal quedo como placeholder, el ancla migrada no identifica contenido recuperable dentro del repositorio y el documento conserva metadatos de revision que simulaban una validacion cerrada. Mantenerla en este estado introduce ruido en la cola ready y dificulta el triaje posterior.

## non-goals

- Implementar una feature sin haber recuperado antes el alcance original.
- Inferir requisitos tecnicos inventados a partir del identificador f00385 o del numero de item migrado.
- Mantener historiales de revision migratorios que no aportan evidencia accionable.

## Slices

### S1 — Recuperar evidencia del item migrado

- **Status**: pending
- **Files**: `ready/feats/f00385-recuperar-o-retirar-el-work-item-migrado-f00385.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)
- acceptance:
  - "Existe una fuente verificable del item 25047 fuera de este placeholder."
  - "La propuesta se reescribe con alcance, archivos afectados y aceptacion concretos derivados de esa fuente."
  - "Se elimina todo texto placeholder o de migracion que ya no aporte contexto operativo."

### S2 — Retirar la propuesta si la evidencia no puede recuperarse

- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `ready/feats/f00385-recuperar-o-retirar-el-work-item-migrado-f00385.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)
- acceptance:
  - "Si no aparece una fuente verificable, la propuesta deja explicitamente documentado por que es irrecuperable."
  - "La decision deja de depender de notas historicas ambiguas o review logs heredados."
  - "El siguiente paso operativo queda claro: reescritura completa con evidencia o retiro deliberado por otro cambio de estado posterior."

## acceptance

- La propuesta describe una decision de trabajo real y verificable, no un placeholder migratorio.
- Goal, why y non-goals explican por que el item no puede implementarse todavia sin evidencia adicional.
- Los slices dejan claro como recuperar el alcance original o cuando retirar la propuesta.
- No quedan bloques de review heredados ni narrativa duplicada que simule cierre o aprobacion previa.

## notes

- La referencia `migrated-from` se conserva como pista historica, pero no cuenta como evidencia suficiente del alcance.
- El problema actual no es una implementacion incompleta sino una migracion incompleta: antes de cualquier trabajo tecnico, hace falta recuperar el texto fuente o declarar la propuesta irrecuperable.
