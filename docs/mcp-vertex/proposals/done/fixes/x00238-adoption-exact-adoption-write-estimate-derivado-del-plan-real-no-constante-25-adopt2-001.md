---
id: x00238
title: "adoption — `EXACT_ADOPTION_WRITE_ESTIMATE` derivado del plan real, no constante 25 (ADOPT2-001)"
kind: fix
status: done
type: proposal
track: quality
date: 2026-08-25
priority: P3
classification: CONFIRMADO / PRECISIÓN
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§13 ADOPT2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00170 # adoption-assessment (predecesor)
shipped-in:
  - b9009bb8 # fix: derive adoption write estimate from plan
---

# x00238 — adoption: exact count derivado del plan

## Goal

```ts
// packages/adoption/src/lib/assessment.service.ts (aprox)
const EXACT_ADOPTION_WRITE_ESTIMATE = 25;

export function estimateWriteCount(plan: AdoptionPlan): IWriteEstimate {
  return {
    count: EXACT_ADOPTION_WRITE_ESTIMATE,
    exact: true,  // ← MENTIRA: no se calcula del plan
  };
}
```

Esto reporta `exact: true` con un número hardcoded que **no refleja el plan real**. Si `buildAgentFiles()` cambia (más/menos archivos, otros artifacts), el assessment miente al usuario.

Reglas violadas: §13 ADOPT2-001.


El constant existe en el código y se reporta como `exact: true` sin derivar del plan.


`CONFIRMADO / PRECISIÓN`.

## Why

Confianza en el assessment. Si el plan cambia, el count sigue correcto automáticamente.


Cero.


Cero.

## Non-goals

**Permitido**:

- `packages/adoption/src/lib/assessment.service.ts` (derivar count).
- `packages/adoption/src/lib/plan-types.ts` (tipos).
- Tests actualizados.

**No permitido**:

- Cambios en la lógica de adoption.
- Cambios en otros plugins.


- Adoption assessment refinements (`ADOPT2-002`, `ADOPT2-003`).

## Architecture

### 1. Derivar count del plan

```ts
// packages/adoption/src/lib/assessment.service.ts
export interface IWriteEstimate {
  count: number;
  exact: boolean;
  breakdown: ReadonlyArray<{
    kind: 'config' | 'proposal-store' | 'generated' | 'other';
    count: number;
    description: string;
  }>;
}

export function estimateWriteCount(plan: AdoptionPlan): IWriteEstimate {
  const breakdown: IWriteEstimate['breakdown'] = [];
  let total = 0;

  // 1. Config write.
  breakdown.push({ kind: 'config', count: 1, description: 'mcp-vertex.config.json (or overwrite)' });
  total += 1;

  // 2. Proposal store files (proposals/{ready,in-progress,review,...}/<id>.md).
  breakdown.push({
    kind: 'proposal-store',
    count: plan.proposals?.length ?? 0,
    description: 'Initial proposal scaffolding (1 file per proposal)',
  });
  total += plan.proposals?.length ?? 0;

  // 3. Generated artifacts (from buildAgentFiles).
  const generatedCount = plan.buildAgentFiles()?.length ?? 0;
  breakdown.push({
    kind: 'generated',
    count: generatedCount,
    description: 'Generated files from buildAgentFiles()',
  });
  total += generatedCount;

  // 4. Other artifacts (env, CI, etc.) — depende del proyecto.
  const otherCount = plan.otherArtifacts?.length ?? 0;
  if (otherCount > 0) {
    breakdown.push({
      kind: 'other',
      count: otherCount,
      description: 'Other artifacts (env templates, CI configs, etc.)',
    });
    total += otherCount;
  }

  return {
    count: total,
    exact: true,  // ahora sí es exacto porque se deriva
    breakdown,
  };
}
```

### 2. Test que verifica la fidelidad

```ts
// packages/adoption/tests/src/lib/assessment.spec.ts
describe('estimateWriteCount', () => {
  it('reflects buildAgentFiles() changes', () => {
    const plan = makePlan({ proposals: 3 });
    const before = estimateWriteCount(plan);

    // Modificar buildAgentFiles para que devuelva más archivos.
    plan.buildAgentFiles = () => [...defaultFiles, ...extraFiles];

    const after = estimateWriteCount(plan);

    expect(after.count).toBe(before.count + extraFiles.length);
    expect(after.breakdown.find((b) => b.kind === 'generated')?.count).toBe(defaultFiles.length + extraFiles.length);
  });

  it('reports exact: true with breakdown', () => {
    const plan = makePlan({ proposals: 5 });
    const result = estimateWriteCount(plan);
    expect(result.exact).toBe(true);
    expect(result.breakdown.length).toBeGreaterThan(1);
  });

  it('reports exact: false when plan is not fully derivable', () => {
    // Si hay alguna parte del plan que no se puede derivar exactamente (p. ej. heurística), marcar como no exacto.
    const plan = makePlan({ proposals: 5, heuristics: ['detect-package-manager'] });
    const result = estimateWriteCount(plan);
    expect(result.exact).toBe(false);
    expect(result.breakdown.find((b) => b.description.includes('heuristic'))))?.toBeDefined();
  });
});
```

### 3. UI

El assessment ahora muestra el breakdown:

```json
{
  "writeEstimate": {
    "count": 12,
    "exact": true,
    "breakdown": [
      { "kind": "config", "count": 1, "description": "mcp-vertex.config.json" },
      { "kind": "proposal-store", "count": 5, "description": "Initial proposal scaffolding" },
      { "kind": "generated", "count": 6, "description": "Generated files from buildAgentFiles()" }
    ]
  }
}
```

El usuario ve exactamente qué se va a escribir.

## Slices

- global_gate: type

### S1 — Derivar count + breakdown

- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adoption-assessment.service.ts`
- **Gate**: type
- acceptance:
  - "Constant eliminada."
  - "Breakdown visible."

### S2 — Tests + UI

- **Status**: done
- **Files**: `packages/core/tests/src/lib/adopt/adoption-assessment.spec.ts`, UI updates
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "UI muestra breakdown."

## Acceptance

- **Unit**: count refleja `buildAgentFiles()` cambios.
- **Unit**: `exact: true` cuando todo se deriva.
- **Unit**: `exact: false` cuando hay heurística.
- **Regression**: cambiar `buildAgentFiles()` no rompe el assessment.


- [ ] Constant `EXACT_ADOPTION_WRITE_ESTIMATE = 25` eliminado.
- [ ] Count derivado del plan real (config + proposal store + buildAgentFiles + other).
- [ ] `exact: true` solo cuando todo es derivable.
- [ ] UI muestra breakdown.
- [ ] Tests verdes.
- [ ] `bun run validate` verde.


- Count derivado del plan.
- `exact` honesto.
- Tests verdes.

---

## Notes

- **Test**: cambiar `buildAgentFiles()` actualiza count automáticamente.
- **Property test**: count nunca negativo; suma de breakdown == count total.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - packages/adoption/src/lib/assessment.service.ts
        - packages/adoption/tests/src/lib/assessment.spec.ts
    - before/after:
        before: "Constante 25 hardcoded; exact: true mentiroso"
        after:  "Count derivado del plan; breakdown visible; exact honesto"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track F.
- **Auditoría legada**: §13 ADOPT2-001.
- **Predecesor**: `f00170` (adoption-assessment).
