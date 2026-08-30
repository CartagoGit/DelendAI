---
id: x00258
title: "Bloquear push directo a `develop` en `commit-policy` driver"
kind: fix
status: retired
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / x00258"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - x00257 # eliminar force-with-lease (predecesor)
    - c00131 # protectedBranches por defecto (transitivo)
    - t00018 # tabla property-based del push driver
    - x00272 # hija que la supersede: bloquea push directo a main, no a develop
superseded-by: x00272
---

# x00258 — Bloquear push directo a `develop` en `commit-policy` driver

> **SUPERSEDED por [x00272](../../ready/fixes/x00272-block-direct-push-to-main-only.md).**
> Tras la retractación del reviewer externo (ChatGPT 5.6 Sol), el modelo
> de gobernanza invierte el foco: `main` = rama de release (push directo
> bloqueado, toda promoción va por PR) y `develop` = rama de integración
> donde el owner trabaja libremente. Por eso la invariante central de
> esta propuesta —"rechaza push directo a `develop`"— queda **retirada**
> y reemplazada por la de x00272: "rechaza push directo a `main`". Este
> documento se archiva como histórico; el código vigente del driver
> refleja la invariante de x00272.

## Goal

**Defense in depth** adicional: aunque el usuario configure la
policy del plugin `commit-policy` para permitir force, el driver
rechaza cualquier push directo a `develop`. Los merges a `develop`
deben pasar por PR.

### Comportamiento actual (BUG)

- Push a `develop` se permite si la rama no está en
  `protectedBranches` (escenario por defecto antes de `c00131`).
- Combinación: un dev local puede hacer
  `git push origin develop` y el plugin lo aprueba, saltándose la
  revisión humana.

### Comportamiento deseado

- Push directo a `develop` se rechaza con reason code estable
  `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`.
- Mensaje:
  `"direct push to 'develop' is not allowed; open a PR."`
- `suggestedNextAction`: `"open a PR from a feature branch"`.
- Los worktrees (`agent/<name>`) **no** se ven afectados: solo
  `develop` exacto queda bloqueado, no `agent/foo`.
- La regla es independiente de `protectedBranches`: aunque el
  usuario quite `develop` de su override, este chequeo sigue
  activo (es un segundo muro, no el mismo).

## why

- AUD-P0-001: defense in depth — incluso si la policy local se
  debilita, el driver defiende `develop`.
- Cierra el riesgo "push directo a develop" sin PR.
- Es aditivo sobre `x00257`: dos razones de refusal independientes,
  dos razones para auditar.
- La regla es invariante del proyecto (`develop` solo via PR),
  no de la config del usuario.

## non-goals

- No elimina push a worktrees (`agent/<name>`) — esos sí van
  directos al remoto del worktree.
- No bloquea push a `main` (eso ya lo cubre `x00257` via
  `protectedBranches`).
- No introduce un sistema de "PR-required" en general; es solo
  `develop`.
- No cambia el comportamiento del CI bot que mergea PRs
  (esa lógica no pasa por este driver).

## architecture

### 1. Push driver — segunda capa

- `plugins/commit-policy/src/lib/services/push-driver.ts` (extensión sobre
  `x00257`):
  ```ts
  export async function push(args: PushArgs): Promise<PushResult> {
      const cfg = loadConfig();
      // Capa 1: ramas protegidas (x00257).
      if (cfg.protectedBranches.includes(args.branch)) {
          return refusal('PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED', ...);
      }
      // Capa 2: develop solo via PR (x00258).
      if (args.branch === 'develop') {
          return {
              ok: false,
              reason: 'DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED',
              message:
                  `direct push to 'develop' is not allowed; open a PR.`,
              suggestedNextAction: `open a PR from a feature branch`,
          };
      }
      // ...resto del flujo
  }
  ```

### 2. Tests

- `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`
  (extensión):
  - `push({branch:'develop', from:'main', ...})` → refusal
    `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`.
  - `push({branch:'develop', from:'feature/x', ...})` → refusal
    `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`.
  - `push({branch:'agent/foo', from:'main', ...})` → ok.
  - Override del usuario que quita `develop` de
    `protectedBranches` → refusal sigue activo (capa 2 es
    invariante).
  - `push({branch:'main', ...})` → refusal
    `PUSH_TO_PROTECTED_BRANCH_NOT_ALLOWED` (capa 1, ya cubierto por
    `x00257`).

### 3. Documentación

- `plugins/commit-policy/README.md` (o equivalente) documenta
  explícitamente: "push directo a `develop` requiere PR,
  independientemente de la configuración del usuario".

## Slices

### S1 — Refusal invariante + tests + doc

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/README.md`
- **Gate**: type

## acceptance

- Push directo a `develop` rechazado con reason code
  `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`.
- Worktrees `agent/<name>` no afectados.
- Override del usuario no desactiva la regla.
- Tests cubren los 4 casos del plan.
- `bun run validate` verde.

## notes

Implementado y verificado el 2026-08-27. La ruta real difiere de la que
esta propuesta anticipaba (`src/lib/drivers/push.ts`): el driver vive en
`src/lib/services/push-driver.ts`.

- `plugins/commit-policy/src/lib/services/push-driver.ts:155` devuelve el
  refusal con el reason code `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`, y el
  comentario que lo acompaña lo declara independiente de
  `protectedBranches`, de modo que la regla se mantiene aunque un host
  quite `develop` de su override.
- `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts:252`
  cubre el reason code.

Era la política vigente a esa fecha, pero quedó **superseded por
x00272** (2026-08-25, retractación del reviewer externo): el driver
ahora bloquea push directo a `main` y deja `develop` libre para el
workflow del owner. Este documento se conserva como histórico de la
decisión original; el contrato vigente vive en x00272.
