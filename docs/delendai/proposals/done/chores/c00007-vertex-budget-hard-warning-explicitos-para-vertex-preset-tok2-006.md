---
id: c00007
title: "vertex budget — hard/warning explícitos para `vertex` preset (TOK2-006)"
kind: chore
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P2
classification: REVISAR / MEJORA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2028-08-25-develop-external-audit-chatgpt-sol.md
    section: "§9 TOK2-006"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00005 # token gate (predecesor)
    - i00006 # dashboard check
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# i00007 — vertex budget explícito

## Goal

Hoy el dashboard tracked da `vertex = 161 tools, 301,503 B` (probablemente desactualizado, pero la cifra actual es aún mayor — ~35 plugins).

Pero los **budgets hard/warning** solo están definidos para `swarm` y `lean` (los más críticos). `vertex` no tiene techo explícito, así que no hay gate que verifique.

Reglas violadas: R4.1, §9 TOK2-006.


```ts
// tools/scripts/test/token-budgets.ts (aprox)
export const BUDGETS = {
  minimal:   { hard:  64_000, warning:  48_000 },
  lean:      { hard:  96_000, warning:  72_000 },
  standard:  { hard: 144_000, warning: 112_000 },
  swarm:     { hard: 192_000, warning: 160_000 },
  full:      { hard: 256_000, warning: 200_000 },
  // vertex: NO BUDGET
};
```

`vertex` es el preset más completo y debería tener un techo explícito para detectar regresiones.


`REVISAR / MEJORA`.

## Why

Detección temprana de regresiones en el preset más completo.


Cero.


- **Actual vertex**: ~350,000 B (medido en HEAD).
- **Hard propuesto**: 384,000 B (admite crecimiento moderado; el preset es el más completo).
- **Warning propuesto**: 320,000 B.

## Non-goals

**Permitido**:

- `tools/scripts/test/token-budgets.ts` (añadir entry vertex).
- `docs/mcp-vertex/tokens/TOKEN-BUDGETS.md` regenerado.
- Tests actualizados.

**No permitido**:

- Cambios en plugins.
- Cambios en el gate (`i00005`).


- Reducción del coste de `vertex` (esta propuesta solo define el budget; las reducciones van en sus propias propuestas).
- Schema diet (`r00018`).

## Architecture

### 1. Definir budgets para `vertex`

```ts
// tools/scripts/test/token-budgets.ts
export const BUDGETS = {
  minimal:   { hard:  64_000, warning:  48_000 },
  lean:      { hard:  96_000, warning:  72_000 },
  standard:  { hard: 144_000, warning: 112_000 },
  swarm:     { hard: 192_000, warning: 160_000 },
  full:      { hard: 256_000, warning: 200_000 },
  vertex:    { hard: 384_000, warning: 320_000 },  // ← NUEVO
} as const;
```

### 2. Justificación del número

`vertex` contiene todos los plugins públicos del monorepo. Es el caso "todo incluido":

- Core surface: ~50,000 B.
- 35+ plugins × ~10,000 B promedio: ~350,000 B.
- Schema overhead: ~30,000 B.

**Hard = 384,000 B** admite el preset completo con un margen de ~10% para crecimiento futuro.

**Warning = 320,000 B** señala regresiones antes de llegar al hard.

### 3. Gate automático

`i00005` ya ejecuta el gate para todos los presets listados en `BUDGETS`. Al añadir `vertex`, el gate lo cubre automáticamente.

### 4. Documentación

```md

## Slices

- global_gate: type

### S1 — Definir budget vertex + documentar

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "Entry `vertex` añadida."
  - "Gate la cubre."
  - "Documentación actualizada."

## Acceptance

- **Unit**: el gate incluye `vertex` y reporta correctamente.
- **E2E**: si vertex excede el hard, CI falla.


- [ ] Entry `vertex` añadida a `BUDGETS`.
- [ ] Gate `i00005` cubre `vertex`.
- [ ] Dashboard regenerado refleja los budgets.
- [ ] Documentación explica la justificación.
- [ ] `bun run validate` verde.


- `vertex` tiene budget explícito.
- Gate lo cubre.

---

## Notes

The `vertex` preset bundles every public plugin in the monorepo. It is the
largest preset and has its own explicit budget:

- **Hard**: 384,000 B (≈ 96,000 tokens @ 4 bytes/token)
- **Warning**: 320,000 B

If `vertex` exceeds the hard budget, the token gate CI fails. Reduce the
cost (consolidate tools, move data to resources, lazy-activate capabilities)
before considering raising the ceiling — budgets are constraints, not numbers
to auto-increase (R4.1).
```


- El gate CI (`i00005`) verde.
- Si vertex crece más allá de 384,000 B, el CI falla.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-budget:
        vertex:
          hard: 384_000
          warning: 320_000
    - before/after:
        before: "vertex sin budget; regresiones no detectadas"
        after:  "vertex con hard/warning; CI detecta regresiones"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track C.
- **Auditoría legada**: §9 TOK2-006.
- **Predecesor**: `i00005` (gate).
- **Principio §41**: *"Budgets are constraints, not numbers to auto-increase."*

## Slices

- global_gate: type

### S1 — Definir budget vertex + documentar

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "Entry `vertex` añadida."
  - "Gate la cubre."
  - "Documentación actualizada."

## Acceptance

- `vertex` tiene budget explícito.
- Gate lo cubre.
- `bun run validate` verde.
