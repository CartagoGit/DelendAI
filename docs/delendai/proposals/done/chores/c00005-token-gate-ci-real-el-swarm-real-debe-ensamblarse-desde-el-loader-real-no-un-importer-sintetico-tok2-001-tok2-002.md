---
id: c00005
title: "token gate CI real — el swarm real debe ensamblarse desde el loader real, no un importer sintético (TOK2-001 + TOK2-002)"
kind: chore
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P1
classification: CONFIRMADO EN DASHBOARD GENERADO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§9 TOK2-001 + TOK2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00006 # dashboard check (hermano)
    - r00018 # proposals schema diet
    - i00007 # vertex budget
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# i00005 — token gate CI real con ensamblado real del preset swarm

## Goal

Hoy el test E2E de budget de tokens usa un **importer sintético** con un subconjunto manual de plugins:

```ts
// tools/scripts/test/token-budget.spec.ts (aprox)
const syntheticPlugins = [
  'proposals', 'rules', 'memory', 'git', 'quality',
  'search', 'notification', 'docs', 'deps', 'logs',
  'status-marker', 'test-convention', 'test-policy',
  'conventions',
];
```

Pero el swarm real contiene **muchos más** plugins. Resultado:

- Test E2E: **verde**.
- Dashboard tracked: **229,740 B > 192,000 B** (hard budget) → **rojo**.

Esto es un P1 de producto: la promesa "low-token" está rota en la superficie nativa real.

Reglas violadas: R4.1 (presupuestos son constraints), §9 TOK2-001 + TOK2-002.


Dashboard tracked (`docs/mcp-vertex/tokens/TOKEN-BUDGETS.md` o equivalente):

```text
Preset      Tools   tools/list
minimal     29      53,024 B
lean        41      68,601 B
standard    80      119,386 B
swarm       143     229,740 B   ← excede hard budget de 192,000 B
full        150     238,184 B
vertex      161     301,503 B
```

Test E2E pasa porque importa solo 14 plugins, no los ~35 del swarm real.


`CONFIRMADO EN DASHBOARD GENERADO` — discrepancia reproducible leyendo el dashboard y el test.

## Why

- Usuarios que cargan swarm preset consumen ~38KB extra de context sin saberlo.
- La promesa "low-token" no se cumple en nativo.
- Adaptive surface mitiga pero no resuelve (no es default).


Cero.


- **Medición actual**: swarm real = 229,740 B.
- **Target**: swarm real <= 192,000 B (hard).
- **Stretch**: swarm real <= warning threshold.
- **Coste del gate**: añadir ~5–10s al CI (medición real en lugar de sintética).

## Non-goals

**Permitido**:

- `tools/scripts/test/token-budget.spec.ts` (reescribir para usar loader real).
- `tools/scripts/test/run-token-budget-check.script.ts` (nuevo).
- `tools/scripts/test/run-actual-preset-budget.script.ts` (nuevo: ensambla un preset y mide).
- `package.json` scripts.
- `docs/mcp-vertex/tokens/TOKEN-BUDGETS.md` regenerado.
- CI workflow (`.github/workflows/ci.yml`).

**No permitido**:

- Cambios en plugins para reducir tokens (cada reducción va en su propuesta: `r00018`, etc.).
- Cambios en budgets hard/warning (otra propuesta si se quiere; **no** se suben los presupuestos sin aprobación).


- Reducción del coste de `proposals` (`r00018`).
- Dashboard check independiente (`i00006`).
- Vertex budget (`i00007`).
- Adaptive default (`r00019`).

## Architecture

### 1. Eliminar el importer sintético

```diff
- // tools/scripts/test/token-budget.spec.ts
- const syntheticPlugins = [
-   'proposals', 'rules', 'memory', 'git', 'quality',
-   // ...subset
- ];
- const syntheticConfig = {
-   preset: 'swarm',
-   plugins: syntheticPlugins,
- };
```

### 2. Usar el loader real

```ts
// tools/scripts/test/token-budget.spec.ts
import { loadPreset } from '@mcp-vertex/core/loader';
import { measureToolsList } from '@mcp-vertex/core/metrics';

describe('token budget — real preset', () => {
  it.each(['minimal', 'lean', 'standard', 'swarm', 'full', 'vertex'])(
    'preset %s must fit within hard + warning budget',
    async (presetName) => {
      // Cargar el preset exactamente como lo haría el runtime.
      const config = await loadPreset(presetName);

      // Medir el tools/list real (mismo path que el dashboard).
      const measurement = await measureToolsList(config);

      const budget = BUDGETS[presetName];

      expect(measurement.bytes).toBeLessThanOrEqual(budget.hard);
      if (measurement.bytes > budget.warning) {
        console.warn(
          `[token-budget] ${presetName} exceeds warning: ` +
          `${measurement.bytes} B > ${budget.warning} B`,
        );
      }
    },
  );
});
```

### 3. Budgets como código

```ts
// tools/scripts/test/token-budgets.ts (nuevo)
export const BUDGETS = {
  minimal:   { hard:  64_000, warning:  48_000 },
  lean:      { hard:  96_000, warning:  72_000 },
  standard:  { hard: 144_000, warning: 112_000 },
  swarm:     { hard: 192_000, warning: 160_000 },  // ← real actual 229,740 B falla
  full:      { hard: 256_000, warning: 200_000 },
  vertex:    { hard: 320_000, warning: 256_000 },
} as const;
```

**Regla**: `hard` no se sube automáticamente. Si un preset falla, se reduce el coste (otra propuesta), o se pide aprobación explícita para subir el techo (con justificación).

### 4. Script ejecutable standalone

```ts
// tools/scripts/test/run-actual-preset-budget.script.ts
import { loadPreset } from '@mcp-vertex/core/loader';
import { measureToolsList } from '@mcp-vertex/core/metrics';
import { BUDGETS } from './token-budgets';

const presetName = process.argv[2] ?? 'swarm';

const config = await loadPreset(presetName);
const measurement = await measureToolsList(config);
const budget = BUDGETS[presetName as keyof typeof BUDGETS];

console.log(`[${presetName}] ${measurement.tools} tools, ${measurement.bytes} B`);
console.log(`  hard:    ${budget.hard} B`);
console.log(`  warning: ${budget.warning} B`);

if (measurement.bytes > budget.hard) {
  console.error(`HARD BREACH: ${measurement.bytes} > ${budget.hard}`);
  process.exit(1);
}
```

### 5. CI integration

```yaml
# .github/workflows/ci.yml (extracto)
- name: Token budget (real preset)
  run: bun run tokens:gate
```

```json
// package.json
{
  "scripts": {
    "tokens:gate": "bun tools/scripts/test/run-actual-preset-budget.script.ts"
  }
}
```

Añadir a `bun run validate`.

### 6. Reporte

Si el test pasa: ✅.
Si falla:

```text
[swarm] 143 tools, 229,740 B
  hard:    192,000 B
  warning: 160,000 B
HARD BREACH: 229,740 > 192,000

Top contributors:
- proposals: 76,776 B (31 tools)
- vertex-core: 22,400 B
- context-for-change: 18,500 B
...
```

## Slices

- global_gate: type

### S1 — Budgets como código + loader real

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "Importe sintético eliminado."
  - "Loader real usado."

### S2 — Script ejecutable + CI

- **Status**: done
- **Files**: `tools/scripts/test/run-actual-preset-budget.script.ts`, `package.json`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "`bun run tokens:gate` añadido."
  - "CI ejecuta el gate."

## Acceptance

- **Unit**: el script `run-actual-preset-budget.script.ts` corre standalone y reporta breach correctamente.
- **Integration**: el test E2E con loader real se ejecuta en CI.
- **Snapshot del breach**: cuando un preset falla, el output incluye los top contributors (ayuda al siguiente fix).


- [ ] Importer sintético eliminado del test E2E.
- [ ] Loader real usado en su lugar.
- [ ] Budgets como código (en `tools/scripts/test/token-budgets.ts`).
- [ ] `hard` no se sube automáticamente; regla documentada.
- [ ] `bun run tokens:gate` añadido a `bun run validate` y al CI workflow.
- [ ] Si swarm sigue excediendo, el test falla con el desglose.
- [ ] Reports muestran top contributors cuando hay breach.
- [ ] `bun run validate` verde (o rojo, pero justificando).


- Gate CI usa loader real.
- Budgets como código.
- Si swarm excede, CI falla con desglose.

---

## Notes

- El gate es el **regression guard**. Cualquier aumento de coste futuro en plugins rompe el CI.
- Si alguien sube `hard`, debe pasar por aprobación explícita (code review + decisión documentada).


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - tools/scripts/test/token-budget.spec.ts (eliminado synthetic)
        - tools/scripts/test/run-actual-preset-budget.script.ts (nuevo)
        - tools/scripts/test/token-budgets.ts (nuevo)
    - before/after:
        before: "Test E2E usa importer sintético; pasa aunque swarm real exceda"
        after:  "Loader real; si swarm excede, CI falla con desglose"
    - current-status: "swarm = 229,740 B / hard = 192,000 B (BREACH; pendiente r00018 para reducir)"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track C.
- **Auditoría legada**: §9 TOK2-001 + TOK2-002.
- **Hermanas**: `i00006` (dashboard), `r00018` (schema diet), `i00007` (vertex budget).
- **Principio §41**: *"Measure real runtime surfaces, not synthetic subsets."* Esta propuesta lo aplica al gate.
