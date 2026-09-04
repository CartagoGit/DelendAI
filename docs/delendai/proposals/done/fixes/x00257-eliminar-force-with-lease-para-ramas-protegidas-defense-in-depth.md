---
id: x00257
title: "Eliminar `force-with-lease` para ramas protegidas (defense in depth)"
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
    section: "Track A / x00257"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00131 # protectedBranches por defecto (predecesor)
    - x00258 # bloquear push directo a develop (depende de este)
    - t00018 # tabla property-based del push driver
---

# x00257 — Eliminar `force-with-lease` para ramas protegidas (defense in depth)

## Goal

Aunque la policy local diga que `--force-with-lease` es aceptable,
**nunca** se debe permitir contra una rama protegida (`main`,
`master`, `develop`). El driver de push de `commit-policy` debe
rechazar el push **incondicionalmente** cuando el target está en
`protectedBranches`, sin importar el modo (`force`, `force-with-lease`
o normal).

### Comportamiento actual (BUG)

- `plugins/commit-policy/src/lib/services/push-driver.ts` rechaza push a
  `protectedBranches` solo si la rama está protegida **y** el modo
  es `force`. El modo `force-with-lease` pasa si la rama no está en
  `protectedBranches` (lo cual, sin `c00131`, excluía `develop`).
- Combinación: un usuario puede hacer
  `git push --force-with-lease origin develop` y el plugin lo
  aprueba.

### Comportamiento deseado

- Push a `protectedBranches` se rechaza **incondicionalmente**, con
  reason code estable `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED`.
- Mensaje de error claro y accionable:
  `"branch 'develop' is in protectedBranches; push rejected. Open a PR instead."`
- Los worktrees efímeros (`agent/<name>`, `worktree/*`) **no** se
  ven afectados: la regla aplica a `protectedBranches` exactos, no
  a prefijos.

## why

- AUD-P0-001: el audit detecta que `force-with-lease` sortea la
  protection actual.
- Es defense in depth: aunque `c00130` configura branch protection
  en GitHub, el plugin debe coincidir. Si un día GitHub permite
  force (admin override, repo mal configurado), el plugin sigue
  protegiendo.
- Cierra un hueco de semántica entre "force" (rechazado) y
  "force-with-lease" (aceptado) — son distintas formas del mismo
  riesgo.
- Habilita que `x00258` extienda la regla a "ningún push directo a
  develop".

## non-goals

- No elimina `--force-with-lease` para worktrees efímeros
  (`agent/<name>`).
- No introduce un nuevo reason code por rama; un solo
  `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED` para todas las protegidas.
- No cambia el comportamiento para worktrees propios de CI
  (esos nunca pasan por el driver).

## architecture

### 1. Push driver

- `plugins/commit-policy/src/lib/services/push-driver.ts`:
  ```ts
  export type PushRefusalReason =
      | 'PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED'
      | 'DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED' // x00258
      | 'BRANCH_NOT_FOUND'
      | 'REMOTE_DENIED';

  export async function push(args: PushArgs): Promise<PushResult> {
      const cfg = loadConfig();
      if (cfg.protectedBranches.includes(args.branch)) {
          return {
              ok: false,
              reason: 'PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED',
              message:
                  `branch '${args.branch}' is in protectedBranches; ` +
                  `push rejected. Open a PR instead.`,
              suggestedNextAction:
                  `open a PR from a feature branch`,
          };
      }
      // ...resto del flujo
  }
  ```

### 2. Tests

- `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`
  (extensión):
  - `push({branch:'develop', mode:'force'})` → refusal
    `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED`.
  - `push({branch:'develop', mode:'force-with-lease'})` → refusal
    `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED`.
  - `push({branch:'develop', mode:'normal'})` → refusal
    `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED`.
  - `push({branch:'agent/foo', mode:'force'})` → ok (no protegida).
  - `push({branch:'agent/foo', mode:'force-with-lease'})` → ok.
  - Override del usuario que omite `develop` → warning + refusal
    (consistente con `c00131`).

## Slices

### S1 — Refusal incondicional + tests property-based

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`
- **Gate**: type

## acceptance

- Push a `protectedBranches` rechazado en cualquier modo.
- Reason code `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED` estable.
- Worktrees `agent/<name>` no afectados.
- Tests cubren los 6 casos del plan.
- `bun run validate` verde.

## Evidence

Implementado y verificado el 2026-08-27.

- `plugins/commit-policy/src/lib/services/push-driver.ts:140` rechaza
  cualquier push a una rama de `protectedBranches` **antes** de evaluar
  el modo de force, así que `with-lease` contra una rama protegida queda
  refusada igual que `--force`. Eso es exactamente la defensa en
  profundidad que pedía esta propuesta.

Matiz que conviene dejar escrito: en la capa de core, `gitPush`
(`packages/core/src/lib/shared/git-write.ts`) sí admite forzar contra una
rama protegida **si el llamante aporta una autorización explícita**
(`{ by, reason }`), que además queda registrada. Son dos capas con
criterios distintos a propósito: el plugin rechaza sin excepción, y la
primitiva permite la emergencia legítima dejando rastro. Si se prefiere
que la primitiva también rechace sin excepción, eso es un cambio de
diseño separado y merece su propia propuesta.
