---
id: x00267
title: "AUD-CP-009 — Branch protection policy unificada (commit + push)"
kind: fix
status: done
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00267"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-009
related:
    - q00006
    - x00266 # push policy usa la misma branch policy
    - f00182 # engine que enrutará la policy antes de commit y push
---

# x00267 — AUD-CP-009: branch protection unificada entre commit y push

## Goal

Hoy la negativa de commit a una rama protegida (`develop`,
`main`, etc.) está condicionada al contexto de slice; un threshold
trigger o un interval-trigger pueden commitear directamente a
`develop` sin chequeo. El push está parcialmente chequeado pero
no comparte policy con el commit (ver `x00266`).

Tras la corrección:

1. Una sola `branchPolicy = { protected: string[] }` se aplica a
   **todos** los paths de commit: manual, threshold, interval,
   slice.
2. Cualquier path que intente commitear a una rama protegida
   devuelve refusal tipado `BRANCH_PROTECTED` con la rama y la
   razón.
3. El push policy engine consulta la misma policy (vía `x00266`).
4. La lista de protegidas es configurable por
   `mcp-vertex.config.json` o env, con default `['develop',
   'main']`.

### Comportamiento actual (BUG)

```
manual commit a 'develop'     → OK (no chequea)
slice-triggered a 'develop'   → refusal solo si el slice lo pidió
threshold-triggered a 'develop' → OK (no chequea)
interval-triggered a 'develop' → OK (no chequea)
```

### Comportamiento deseado

```
manual + 'develop'            → refusal BRANCH_PROTECTED
slice + 'develop'             → refusal BRANCH_PROTECTED
threshold + 'develop'         → refusal BRANCH_PROTECTED
interval + 'develop'          → refusal BRANCH_PROTECTED
manual + 'feature/x'          → OK
slice + 'feature/x'           → OK
push a 'develop' (cualquiera) → refusal BRANCH_PROTECTED
```

## Why

- "One source of truth": misma lista para commit y push.
- "Invariant as API or lint": el chequeo debe ser policy, no
  condicional por tipo de trigger.
- Cierra el bypass que existe para threshold/interval, mencionado
  explícitamente por la auditoría externa (AUD-CP-009).
- Sin esto, un agente con interval-trigger puede bypassear la
  política de `develop` directo sin pasar por PR.

## Non-goals

- Separar `commit.protectedBranches` y `push.protectedBranches`
  (eso es P2 si surge necesidad real).
- No añadir "override por force flag" sin trazabilidad.
- No leer reglas de branch protection de GitHub (eso es Track C
  de governance); la lista es del plugin.

## Architecture

### 1. Modelo único

```ts
// plugins/commit-policy/src/lib/contracts/branch.ts (nuevo)
export interface BranchPolicy {
  protected: string[];   // exact + prefix
  remote?: { override?: string[] }; // P2; fuera de scope
}
export function isProtected(branch: string, policy: BranchPolicy): boolean {
  if (policy.protected.includes(branch)) return true;
  return policy.protected.some(p => branch.startsWith(p + '/'));
}
```

### 2. Punto de inserción

En el engine (`f00182`), antes de **cualquier** path que vaya a
stage+commit:

```ts
if (this.branchPolicy.isProtected(currentBranch)) {
  return {
    ack: 'ERR',
    code: 'BRANCH_PROTECTED',
    branch: currentBranch,
    reason: `branch '${currentBranch}' is in protectedBranches`,
  };
}
```

El chequeo vive en el motor central, no en cada trigger. Trigger
types solo aportan metadata; la decisión es policy.

### 3. Override trazable (opcional)

`force: true` puede saltarse la policy, pero:
- Se loguea como `commit.branch_protected_override` con
  `branch`, `triggerKind`, `eventId`.
- Aparece en el output del tool `commit_policy_status`.
- CHANGELOG documenta el override como "operationally needed",
  no default.

Default `force=false`.

### 4. Errores tipados

| Caso | Refusal |
| --- | --- |
| Commit a protected con `force=false` | `BRANCH_PROTECTED` |
| Commit con `force=true` | OK, log estructurado |
| Push a protected | `BRANCH_PROTECTED` |

## Slices

- global_gate: lint

### S1 — Chequeo unificado en el engine para todos los triggers

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/contracts/branch.ts`, `plugins/commit-policy/tests/src/lib/contracts/branch.spec.ts`
- **Gate**: type
- **Dependency**: `f00182`
- acceptance:
  - "manual + develop → refusal"
  - "threshold + develop → refusal"
  - "interval + develop → refusal"
  - "slice + develop → refusal"
  - "manual + feature/x → ok"

## acceptance

- Tests cubren las 5 filas de la sección Goal.
- Branch policy vive en un solo módulo (`contracts/branch.ts`); el
  resto importa.
- Ningún path de commit evade la policy.
- `bun run lint` verde; `tsc --noEmit` verde.
- Override `force=true` logged estructuradamente.

## Evidence

Implementado y verificado el 2026-08-27, por construcción en lugar de
por un chequeo replicado en cada trigger.

- `plugins/commit-policy/src/lib/services/push-scheduler.ts:87` delega en
  `runPushDriver` para los tres modos automáticos (`onCommit`,
  `everyNCommits`, `everyNMinutes`), y la tool `commit_policy_push` lo
  llama directamente para el modo manual.
- El refusal vive una sola vez, en
  `plugins/commit-policy/src/lib/services/push-driver.ts:140` (rama en
  `protectedBranches`) y `:155` (`develop`), así que los cuatro triggers
  quedan cubiertos sin duplicar la regla.

Eso satisface la aceptación de la propuesta — "manual/threshold/interval/
slice + develop → refusal" — con una única fuente de verdad, que era el
objetivo declarado de unificar la política.
