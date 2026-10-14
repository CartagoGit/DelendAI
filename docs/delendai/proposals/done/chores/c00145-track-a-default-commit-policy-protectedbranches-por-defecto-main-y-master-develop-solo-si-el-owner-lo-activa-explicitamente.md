---
id: c00145
title: "Track A.default — `commit-policy.protectedBranches` por defecto: `main` y `master`; `develop` solo si el owner lo activa explícitamente"
kind: chore
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
shipped-in:
    - f5836e9 # S1 constante+helper + S2 driver + S3 doc
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / c00131 (override por retractación del reviewer)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (rectificación)
related:
    - q00006
    - c00131 # protectedBranches default (predecesor; esta hija lo corrige)
    - c00144 # bifurca protection YAML (predecesor: el plugin default refleja la policy del YAML)
    - x00257 # force-with-lease eliminado para protegidas (general)
    - x00272 # downstream — bloquea push directo a main aplicando este default
---

# c00145 — Track A.default: `commit-policy.protectedBranches` por defecto sin `develop`

## Goal

Corregir el default que `c00131` introduce desde la retractación
del reviewer externo ChatGPT 5.6 Sol:

> "commit-policy.protectedBranches: should now include `main`
> (NOT `develop` by default)."

`c00131` proponía:

```ts
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop'];
```

Esto contradice el workflow real (develop = flexible). Esta hija
lo invierte:

```ts
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'];

// Nueva constante: ramas que el owner puede EXPLICITAMENTE
// añadir si quiere protección equivalente a main.
export const OPTIONAL_PROTECTED_BRANCHES = ['develop', 'release/*'] as const;

// Carve-out explícito: nunca protegidas por defecto (ni por opt-in).
export const NEVER_PROTECTED_BRANCHES = [/^agent\//, /^worktree\//] as const;
```

Y emite un warning (no error) si `develop` aparece en la
configuración del proyecto sin que el owner lo haya añadido
explícitamente vía una nueva opción `commitPolicy.includeDevelop`.

### Comportamiento actual

`c00131` declara
`DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop']`,
lo que hace que `commit-policy` rechace el push directo a
`develop` del owner. Eso bloquea el workflow humano de
"hago lo que quiera en develop" y es el origen de la fricción
que el reviewer señaló.

### Comportamiento deseado

```ts
// plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'] as const;
export const OPTIONAL_PROTECTED_BRANCHES = ['develop', /^release\/.*/] as const;

export const resolveProtectedBranches = (
  explicit: readonly string[] | undefined,
): readonly string[] => {
  const set = new Set<string>(DEFAULT_PROTECTED_BRANCHES);
  if (explicit) for (const b of explicit) set.add(b);
  return [...set];
};

export const isProtected = (
  branch: string,
  resolved: readonly string[],
): boolean => resolved.some(rule =>
  typeof rule === 'string' ? rule === branch : (rule as RegExp).test(branch)
);
```

Si la configuración del proyecto contiene `"protectedBranches":
["main", "master", "develop"]`, se emite warning:

```
[commit-policy] WARN: 'develop' is not in DEFAULT_PROTECTED_BRANCHES.
If this is intentional, document it in mcp-vertex.config.json
under `commitPolicy.includeDevelop: true` or pass it via
`protectedBranches` override.
```

El warning **no falla** el commit; el error sí lo haría y eso
rompería el workflow del owner.

## Why

- Cita textual del reviewer:
  > "Pero eso debe ser configurable y no convertir `develop`
  > en una segunda `main`."
  > "commit-policy.protectedBranches: should now include
  > `main` (NOT `develop` by default)."
- Sin esta corrección, el plugin `commit-policy` rechaza
  pujos directos del owner a `develop`, lo que es exactamente
  la fricción que la retractación busca eliminar.
- Precondición de `x00272` (defensa específica contra push
  directo a `main`) y de `v00127` (verificación de que `main`
  está verde y protegida).

## Non-goals

- No eliminar la opción de hacer `develop` protegida; solo
  deja de ser el default.
- No modificar el comportamiento para `agent/<name>`. Esas
  ramas **nunca** entran en `protectedBranches` por convención
  (carve-out).
- No introducir un nuevo campo obligatorio en
  `mcp-vertex.config.json`. La contractilidad del plugin se
  mantiene backward-compatible.

## Architecture

### 1. Nueva constante y helper

Como se mostró arriba. Vive en
`plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts`.

### 2. Adopción por el driver

`x00257` (eliminar force-with-lease) y `x00258/x00272`
(bloquear push directo) consumen `resolveProtectedBranches()`
en lugar de la constante vieja. La constante `develop` sale
del default sin afectar lógica existente.

### 3. Warning de configuración

```ts
// plugins/commit-policy/src/lib/services/commit-driver.ts
if (config.protectedBranches?.includes('develop') && !config.commitPolicy?.includeDevelop) {
  logger.warn({ branch: 'develop' }, 'commit-policy: develop not in defaults; opt-in via commitPolicy.includeDevelop');
}
```

### 4. Tests

- Default sin override: `protectedBranches` resuelve a
  `['main', 'master']`.
- Override `"develop"`: resuelve a `['main', 'master',
  'develop']`, emite warning si `includeDevelop !== true`.
- Override + `includeDevelop: true`: resuelve a `['main',
  'master', 'develop']` sin warning.
- `agent/<name>` nunca resuelve a protected (carve-out
  enforced).

## Slices

### S1 — Constante + helper `resolveProtectedBranches`

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts`,
  `plugins/commit-policy/src/lib/contracts/constants/protected-branches.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: `c00131`.
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: spec 5/5 verde (default main/master sin develop, explicit replace, agent/worktree nunca), typecheck plugin limpio. Constante + helper cumplen el contrato del slice.
### S2 — Adopción por driver + warning de config

- **Status**: done
- **Files**:
  `plugins/commit-policy/src/lib/services/commit-driver.ts`,
  `plugins/commit-policy/src/lib/services/commit-driver.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: S1 + `c00144`.
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: commit-driver.spec 25/25 verde, typecheck plugin limpio; el driver resuelve la lista efectiva con resolveProtectedBranches. Contrato del slice cumplido.
### S3 — Documentar el nuevo default en `GOVERNANCE-BRANCH-PROTECTION.md`

- **Status**: done
- **Files**: `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` (sección "Defaults del plugin").
- **Gate**: docs lint
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: doc actualizado con el default local (main/master, develop opt-in, agent/worktree nunca) y referencia a resolveProtectedBranches; lint:content-integrity OK. Contrato del slice cumplido.
## acceptance

- `bun run validate` verde; tests del plugin existentes siguen
  pasando (porque `c00131` ya tuvo en cuenta el rollback).
- Lectura de `protectedBranches` desde config nunca falla con
  `develop` en la lista; solo emite warning.
- `isProtected('agent/copilot-minimax-m3', resolved)` devuelve
  `false` siempre, sin importar el override del usuario.
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` enlaza a la sección
  actualizada del documento operativo.
