---
id: x00272
title: "Track A.guard — Bloquear push directo a `main` (defense in depth); `develop` y `agent/*` fuera de esta capa"
kind: fix
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / x00258 (override por retractación del reviewer)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (rectificación)
related:
    - q00006
    - x00257 # force-with-lease eliminado para protegidas (general, consumido aquí)
    - x00258 # bloquea push directo a develop (predecesor a supersede)
    - c00144 # protection YAML bifurcada (predecesor conceptual: defensa = default del YAML + invariante driver)
    - c00145 # protectedBranches default sin develop (predecesor: el driver aplica este default al push)
shipped-in:
    - d40e64b13a41a016df9ca3e4fca134d1fb932979 # x00272 S1: canonical inline main guard in push-driver
    - 333222cb9ac8098e0fde800712834aa08aa4cfa5 # x00272 S2: commit-push-strictness lint + package.json wiring
    - 5544c803acf7ac588e40fd6c97e69ade57e75c57 # x00272 S3: x00258 superseded-by x00272
---

# x00272 — Track A.guard: bloquear push directo a `main` (no a `develop`)

## Goal

Invertir el foco de `x00258`. Donde `x00258` rechazaba "push
directo a `develop`", la retractación del reviewer externo
ChatGPT 5.6 Sol cambió el modelo:

- `main` = rama de release; push directo debe estar bloqueado
  (toda promoción va por PR).
- `develop` = rama de integración; push directo del owner está
  permitido por diseño.
- `agent/<name>` = worktrees efímeros; libres por convención.

Esta hija reemplaza la invariante central de `x00258`
("rechaza push directo a develop") por la nueva invariante
("rechaza push directo a main"). `x00258` queda como
**superseded explícito** por esta hija y se archiva en su
cierre con `superseded-by: x00272`.

> "La retractación invalida el invariante central de x00258:
> 'develop = flexible, force-with-lease allowed, direct commits
> allowed'. Mantener x00258 y añadir otra regla produciría dos
> contratos incompatibles dentro del mismo driver." — subagente
> de la diagnosis de la retractación (Track A).

Garantizar:

1. El driver rechaza **push directo** a `main` con reason code
   `DIRECT_PUSH_TO_MAIN_NOT_ALLOWED`.
2. Sugerencia: `"open a PR from a feature branch (release/* or
   develop)"`.
3. Mensaje: `"direct push to 'main' is not allowed; cuts the
   release/publish path."`.
4. La regla **no** se ve afectada por `protectedBranches` del
   usuario: aunque alguien quite `main` del override, esta
   invariante sigue activa.
5. `develop`, `release/*`, `agent/*`, `worktree/*`, y cualquier
   rama que no sea exactamente `main` no se ven afectadas por
   esta capa.
6. La invariante queda como lint estructural: si alguien futuro
   permite push directo a `main`, el lint
   `commit-push-strictness.script.ts` falla antes de mergear.

### Comportamiento actual (BUG tras retractación)

`x00258` rechaza `git push origin develop` con
`DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`. Eso bloquea el workflow
del owner humano de hacer trabajo libremente en `develop`.

### Comportamiento deseado

```ts
// plugins/commit-policy/src/lib/services/push-driver.ts
async handlePush(branch: string, target: 'origin' | 'upstream') {
  // Defense in depth: main nunca acepta push directo
  if (branch === 'main') {
    return {
      refusal: {
        code: 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED',
        message: "direct push to 'main' is not allowed; cuts the release/publish path.",
        suggestedNextAction: "open a PR from a feature branch (release/* or develop).",
      },
    };
  }
  // Para otras ramas, consultar policy normal
  return this.policyGate(branch, target);
}
```

## Why

- "retractación invalida el invariante central de x00258"
  (subagente de diagnosis sobre la retractación del reviewer).
- Sin la inversión, el plugin seguiría bloqueando el workflow
  flexible de `develop` que el owner necesita.
- Defense in depth: aunque el owner quite `main` de
  `protectedBranches` por error, esta regla lo protege.
- Coherente con `c00144` (YAML bifurcado) y `c00145`
  (default sin develop).

## Non-goals

- No bloquea `release/*` ni `hotfix/*`. Esas pasan por la
  policy normal.
- No modifica la lógica de `x00266` (push policy engine). Esta
  hija es **anterior** a esa; el engine sigue gobernando
  cuándo hacer push automáticamente.
- No bloquea `git push origin main --tags` durante un release.
  Esa es una operación deliberada con credenciales release.
- No reintroduce `force-with-lease` para `main`. Eso es
  `x00257`'s job.

## Architecture

### 1. Push driver estricto

```ts
// plugins/commit-policy/src/lib/services/push-driver.ts
const MAIN_PUSH_BLOCKLIST = new Set(['main']);

export async function enforceMainPushGuard(
  branch: string,
  policy: CommitPolicy,
): Promise<{ refusal: Refusal } | { ok: true }> {
  if (MAIN_PUSH_BLOCKLIST.has(branch)) {
    return {
      refusal: {
        code: 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED',
        message: "direct push to 'main' is not allowed; cuts the release/publish path.",
        suggestedNextAction: "open a PR from a feature branch (release/* or develop).",
      },
    };
  }
  return { ok: true };
}
```

### 2. Lint estructural

```ts
// tools/scripts/lint/commit-push-strictness.script.ts
import { execSync } from 'node:child_process';

const FORBIDDEN = /enforceMainPushGuard|PUSH_BLOCKLIST/;
// Debe estar en push-driver.ts (único archivo que la contiene).
// Cualquier otro uso (test aparte, helper exportado al público)
// es violación.
```

### 3. Coordinación con `x00258`

`x00258` se cierra al mergear `x00272` con
`superseded-by: x00272` en su frontmatter. El bloque "Reason
codes" del plugin pasa de:
- `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED` (x00258) →
- `DIRECT_PUSH_TO_MAIN_NOT_ALLOWED` (x00272).

### 4. Tests

- Push directo a `main` desde worktree del owner → refusal
  `DIRECT_PUSH_TO_MAIN_NOT_ALLOWED`.
- Push directo a `develop` desde worktree del owner → ok.
- Push a `release/0.4.0` desde worktree del owner → ok.
- Push desde `agent/copilot-minimax-m3` a `main` (improbable
  pero no impossible por el path) → refusal
  `DIRECT_PUSH_TO_MAIN_NOT_ALLOWED`.

## Slices

### S1 — `enforceMainPushGuard` + adopción por `push-driver`

- **Status**: done
- **Files**:
  `plugins/commit-policy/src/lib/services/push-driver.ts`,
  `plugins/commit-policy/src/lib/services/push-driver.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: `x00257`, `c00144`, `c00145`.
- review-state: done
- review-implementer: copilot
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente: guard ahora usa la forma canonica inline `if (branch === 'main')` ratcheteada por lint:commit-push-strictness (exit 0), sin constante MAIN_BRANCH intermedia. push-driver.spec 16/16 y suite unit del plugin 196/196. Coherente con S2.
### S2 — Lint estructural `commit-push-strictness`

- **Status**: done
- **Files**:
  `tools/scripts/lint/commit-push-strictness.script.ts`,
  `package.json` (añadir a `lint:`).
- **Gate**: lint
- review-state: done
- review-implementer: copilot
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente: lint estructural commit-push-strictness presente y cableado en package.json (commit 333222cb); `bun run lint:commit-push-strictness` exit 0 ratchetea la forma canonica `if (branch === 'main')` del push-driver. Suite unit del plugin 196/196.
### S3 — Supersede de `x00258`

- **Status**: done
- **Files**:
  `docs/mcp-vertex/proposals/ready/fixes/x00258-bloquear-push-directo-develop-commit-policy.md`
  (frontmatter actualizado; cuerpo añade nota de supersede).
- **Gate**: docs lint
- **Depends on**: S1.
- review-state: done
- review-implementer: copilot
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente: x00258 (done) ya lleva `superseded-by: x00272` en frontmatter (commit 5544c803) y la nota de supersede en el cuerpo con enlace correcto. Gate docs: proposals.script exit 0 (636 archivos, 0 fatal) + proposal-id-prefix exit 0.
## acceptance

- `bun run validate` verde.
- Push directo a `main` (incluso con `protectedBranches =
  []` config) → refusal reproducible.
- Push directo a `develop` con owner-cookie sigue funcionando.
- `lint:commit-push-strictness` verde.
- `x00258` lleva `superseded-by: x00272` en frontmatter;
  `commit-policy` README documenta el supersede.
