---
id: r00020
title: "presets — summaries y presupuestos derivados del membership real (PRE2-001 + PRE2-002)"
kind: refactor
status: done
type: proposal
track: quality
date: 2026-08-25
priority: P2
classification: CONFIRMADO / MENOR
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§12 PRE2-001 + PRE2-002 + §25 REG2-003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00174 # manifests (predecesor)
    - f00175 # generators
    - i00005 # token gate
shipped-in:
  - 916c0673 # refactor: derive preset summaries from membership
---

# r00020 — presets: summaries + budgets derivados

## Goal

Dos problemas relacionados:

1. **PRE2-001**: summaries de presets mencionan plugins ausentes o "opt-in" ambiguos. Ejemplo: el summary de `backend-api` habla de "audit (opt-in)" y "perf" pero su membership efectiva no corresponde.
2. **PRE2-002**: cada preset debe tener un presupuesto asociado (tool count, bytes, tokens, permissions union, max marginal, warning/hard).

Hoy, ambos campos son manuales y pueden derivarse.

Reglas violadas: R3.2 (one source of truth), §12 PRE2-001/002.


```ts
// packages/presets/src/definitions.ts (aprox)
export const PRESETS = {
  'backend-api': {
    summary: 'Backend API development with audit (opt-in) and perf...',
    plugins: ['git', 'quality', 'deps', 'security', '...'],  // falta coherencia con summary
    // No hay budget definido.
  },
  // ...
};
```


`CONFIRMADO / MENOR`.

## Why

- Summaries precisos.
- Budgets verificables.
- Menos drift entre summary y membership.


Cero.


- Budgets por preset mejoran tracking, no cambian tokens directamente.

## Non-goals

**Permitido**:

- `packages/presets/src/lib/derive-summary.ts` (generador).
- `packages/presets/src/lib/derive-budget.ts` (generador).
- `packages/presets/src/definitions.ts` (mantiene solo membership; summary/budget generados).
- Tests.

**No permitido**:

- Cambiar la membership de presets.
- Cambiar manifests.


- Reducción del coste de presets (cada reducción va en su propuesta).
- Decisión de qué plugins incluir en `standard` (PRE2-003 — separado).

## Architecture

### 1. Summary derivado

```ts
// packages/presets/src/lib/derive-summary.ts
export function derivePresetSummary(preset: IPreset): string {
  const plugins = preset.plugins.map((id) => getPluginById(id));
  const tags = new Set<string>();
  for (const p of plugins) {
    for (const t of p.tags) tags.add(t);
  }
  const categories = categorize(plugins);  // orchestration, analysis, file, network, process, ...

  const categoriesList = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  return [
    preset.name,
    `${plugins.length} plugins`,
    `focus: ${categoriesList.join(', ')}`,
    `tags: ${Array.from(tags).slice(0, 5).join(', ')}`,
  ].join('; ');
}
```

Si el preset contiene plugins no presentes (drift), el derivado refleja la realidad.

### 2. Budget derivado

```ts
// packages/presets/src/lib/derive-budget.ts
export interface IPresetBudget {
  toolCount: number;
  toolsListBytes: number;
  estimatedTokens: number;
  permissionsUnion: ReadonlyArray<string>;
  maxMarginalPlugin: { id: string; toolsListBytes: number };
  warning: number;  // soft limit
  hard: number;     // hard limit (no se sube automáticamente)
}

export function derivePresetBudget(preset: IPreset): IPresetBudget {
  const plugins = preset.plugins.map((id) => getPluginById(id));

  const toolCount = plugins.reduce((acc, p) => acc + p.toolsListEntries.length, 0);
  const toolsListBytes = plugins.reduce((acc, p) => acc + p.tokenBudget.toolsListBytes, 0);

  const permissionsUnion = Array.from(new Set(plugins.flatMap((p) => p.permissions)));

  const sortedByBytes = [...plugins].sort((a, b) => b.tokenBudget.toolsListBytes - a.tokenBudget.toolsListBytes);
  const maxMarginalPlugin = {
    id: sortedByBytes[0]?.id ?? '<unknown>',
    toolsListBytes: sortedByBytes[0]?.tokenBudget.toolsListBytes ?? 0,
  };

  // Warning = 80% del target; hard = target.
  // Target derivado del preset: minimal<lean<standard<swarm<full<vertex.
  const target = deriveTargetBytes(preset.name);

  return {
    toolCount,
    toolsListBytes,
    estimatedTokens: Math.ceil(toolsListBytes / 4),
    permissionsUnion,
    maxMarginalPlugin,
    warning: Math.floor(target * 0.8),
    hard: target,
  };
}
```

### 3. Target por preset

```ts
function deriveTargetBytes(presetName: string): number {
  // Targets derivados del ranking actual.
  const TARGETS = {
    minimal:  64_000,
    lean:     96_000,
    standard: 144_000,
    swarm:    192_000,
    full:     256_000,
    vertex:   384_000,
  };
  return TARGETS[presetName] ?? 256_000;
}
```

### 4. Schema actualizado

```ts
// packages/presets/src/definitions.ts (refactor)
export interface IPreset {
  id: string;
  plugins: ReadonlyArray<string>;
  // summary y budget ya NO son manuales; se derivan.
}

// El export público solo necesita membership:
export const PRESETS = {
  minimal:  { id: 'minimal', plugins: [...] },
  lean:     { id: 'lean', plugins: [...] },
  // ...
};
```

### 5. Snapshot / drift test

```ts
// packages/presets/tests/src/derive.spec.ts
describe('derivePresetSummary', () => {
  it('reflects actual plugin membership', () => {
    const summary = derivePresetSummary(PRESETS['backend-api']);
    expect(summary).toContain('15 plugins');  // actual count
    expect(summary).not.toContain('audit (opt-in)');  // ya no manual
  });

  it('flags drift if summary mentions missing plugin', () => {
    // Crear un preset de prueba con un summary manual que menciona un plugin ausente.
    // El derivado no debe coincidir → test verifica la diferencia.
  });
});

describe('derivePresetBudget', () => {
  it('reflects actual toolsList bytes', () => {
    const budget = derivePresetBudget(PRESETS.swarm);
    expect(budget.toolsListBytes).toBeGreaterThan(0);
  });

  it('identifies max marginal plugin', () => {
    const budget = derivePresetBudget(PRESETS.swarm);
    expect(budget.maxMarginalPlugin.id).toMatch(/proposals|context-for-change|memory|search/);
  });
});
```

## Slices

- global_gate: type

### S1 — Derive summary + budget

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
- **Gate**: type
- acceptance:
  - "Funciones exportadas."
  - "PRESETS solo tiene membership."

### S2 — Tests + docs

- **Status**: done
- **Files**: `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "Documentación actualizada."

## Acceptance

- **Unit**: `derivePresetSummary` + `derivePresetBudget`.
- **Snapshot**: el summary derivado es estable.
- **Drift detection**: si un plugin se quita de un preset, el summary cambia automáticamente.


- [ ] `derivePresetSummary` implementado y exportado.
- [ ] `derivePresetBudget` implementado y exportado.
- [ ] Summary manual eliminado de `PRESETS`.
- [ ] Budget manual eliminado de `PRESETS`.
- [ ] Documentación: `docs/mcp-vertex/presets.md` explica la derivación.
- [ ] Tests verdes.
- [ ] `bun run validate` verde.


- Summary + budget derivados.
- Tests verdes.

---

## Notes

- **Drift detection**: si el summary derivado no coincide con uno manual, falla el test.
- **Snapshot**: el derivado es estable entre runs.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - packages/presets/src/lib/derive-summary.ts
        - packages/presets/src/lib/derive-budget.ts
    - before/after:
        before: "Summary + budget manuales; drift frecuente"
        after:  "Derivados del membership real; imposible drift"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track F.
- **Auditoría legada**: §12 PRE2-001/002, §25 REG2-003.
- **Predecesores**: `f00174` (manifests), `f00175` (generators).
- **Principio §41**: *"One source of truth for machine-readable metadata."*
