---
id: i00006
title: "token dashboard — `tokens:dashboard:check` en CI para evitar drift del artefacto generado (TOK2-003)"
kind: infra
status: ready
type: proposal
track: tokens
date: 2026-08-25
priority: P2
classification: MEJORA / CI
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§9 TOK2-003 + §19 CI2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00005 # real preset budget gate (predecesor)
    - r00018 # proposals schema diet
---

# i00006 — token dashboard check

## Problem

El dashboard de tokens (`docs/mcp-vertex/tokens/TOKEN-BUDGETS.md` o equivalente) se genera automáticamente desde una fuente tipada. Pero hoy:

- El artefacto se puede quedar viejo respecto a HEAD.
- Cambiar presets/plugins/schemas sin regenerar el dashboard no rompe CI.
- El dashboard tracked decía 29 plugins / 161 tools mientras el vertex actual tiene ~35 plugins.

Reglas violadas: R3.2 (one source of truth), §9 TOK2-003.

## Evidence

Dashboard tracked:

```text
Preset      Tools
vertex      161
```

Pero el `vertex` actual incluye `adaptive-optimizer`, `context-for-change`, `impact-analysis`, `project-health`, `quality-policy`, `completion`, etc. — no coincide con 161.

## Classification

`MEJORA / CI`.

## User impact

Confianza en el dashboard tracked: refleja el HEAD.

## Privacy impact

Cero.

## Token impact

Cero.

## Scope

**Permitido**:

- `tools/scripts/test/run-token-dashboard-check.script.ts` (nuevo).
- `package.json` scripts.
- `.github/workflows/ci.yml`.
- `docs/mcp-vertex/tokens/TOKEN-BUDGETS.md` regenerado.

**No permitido**:

- Cambios en la generación del dashboard.
- Cambios en presets o plugins.

## Out of scope

- Gate de presupuesto real (`i00005`).
- Reducción de tokens (`r00018`).
- Vertex budget (`i00007`).

## Design

### 1. Script de check

```ts
// tools/scripts/test/run-token-dashboard-check.script.ts
import { generateTokenDashboard } from '@mcp-vertex/core/token-dashboard';
import { readFileSync } from 'node:fs';

const DASHBOARD_PATH = 'docs/mcp-vertex/tokens/TOKEN-BUDGETS.md';

// Generar en memoria.
const generated = await generateTokenDashboard();

// Comparar con el tracked.
const tracked = readFileSync(DASHBOARD_PATH, 'utf8');

if (generated !== tracked) {
  console.error('[token-dashboard-check] Dashboard is out of sync.');
  console.error('');
  console.error('Tracked (current):');
  console.error(tracked.slice(0, 500));
  console.error('');
  console.error('Generated (expected):');
  console.error(generated.slice(0, 500));
  console.error('');
  console.error('Run `bun run tokens:dashboard:generate` and commit the result.');
  process.exit(1);
}

console.log('[token-dashboard-check] Dashboard is in sync.');
```

### 2. Scripts

```json
// package.json
{
  "scripts": {
    "tokens:dashboard:generate": "bun tools/scripts/test/run-token-dashboard-generate.script.ts",
    "tokens:dashboard:check": "bun tools/scripts/test/run-token-dashboard-check.script.ts"
  }
}
```

### 3. CI

```yaml
# .github/workflows/ci.yml (extracto)
- name: Token dashboard sync check
  run: bun run tokens:dashboard:check
```

Añadir a `bun run validate`.

### 4. Workflow de Mantenimiento

- Al commite cambiar presets/plugins/schemas: regenerar con `bun run tokens:dashboard:generate` y commitear el diff.
- Si CI falla con "Dashboard is out of sync": ejecutar el comando, commitear, reintentar.

## Tests

- **Unit**: el script detecta drift correctamente.
- **E2E**: cambiar un preset sin regenerar el dashboard rompe el CI.

## Acceptance criteria

- [ ] `bun run tokens:dashboard:check` implementado.
- [ ] Integrado en CI y `bun run validate`.
- [ ] Si se regenera y se commitea el diff, CI pasa.
- [ ] Si se cambia un preset sin regenerar, CI falla con mensaje claro.
- [ ] Documentación: `docs/mcp-vertex/tokens/README.md` explica el flujo.

## Regression guards

- El check es el **regression guard**. Cualquier drift rompe CI.
- Los hooks de lefthook pueden ejecutar el check pre-commit (opcional).

## Resolution evidence (template)

```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/test/run-token-dashboard-check.script.ts
    - before/after:
        before: "Dashboard puede quedar desincronizado sin que CI falle"
        after:  "Dashboard drift rompe CI con mensaje claro"
```

---

## Slices

- global_gate: type

### S1 — Script de check + integración CI

- **Status**: pending
- **Files**: `tools/scripts/test/run-token-dashboard-check.script.ts`, `package.json`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Script detecta drift."
  - "CI ejecuta el check."

## acceptance

- `tokens:dashboard:check` añadido a CI.
- Drift detectado y reportado.

---

## Cómo se relaciona con el plan y la auditoría

- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track C.
- **Auditoría legada**: §9 TOK2-003, §19 CI2-002.
- **Hermanas**: `i00005` (gate), `r00018` (schema diet).
- **Principio §41**: *"One source of truth for machine-readable metadata."*