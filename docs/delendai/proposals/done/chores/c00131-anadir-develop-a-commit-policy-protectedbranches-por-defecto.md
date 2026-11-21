---
id: c00131
title: "Añadir `develop` a `commit-policy.protectedBranches` por defecto"
kind: chore
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / c00131"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
shipped-in:
    - f5836e9 # S1 default + warning + tests
related:
    - q00006
    - c00130 # documentación operativa (predecesor)
    - x00257 # eliminar force-with-lease en protected (depende de este)
    - x00258 # bloquear push directo a develop (depende transitivo)
---

# c00131 — Añadir `develop` a `commit-policy.protectedBranches` por defecto

## Goal

Que el plugin `commit-policy` incluya `develop` en la lista
`DEFAULT_PROTECTED_BRANCHES` por defecto, no solo `main`/`master`.
El override por configuración del usuario sigue funcionando, pero la
ausencia de configuración ya no expone `develop` a force-push.

### Comportamiento actual

- `plugins/commit-policy/src/lib/config/defaults.ts` (o archivo
  equivalente en `src/lib/config/`) define:
  ```ts
  export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'];
  ```
- Sin configuración del usuario, `commit-policy` no trata `develop`
  como protegida → push directo + force quedan permitidos.

### Comportamiento deseado

- `DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop']` con
  tests que verifiquen la lista exacta.
- Si el usuario overridea la lista en su `commit-policy.config.*`,
  su lista gana (no se fusiona implícitamente).
- Validación de config emite **warning** (no error) si la override
  no incluye `develop`, para que un usuario que la omite reciba
  señal explícita.

## why

- AUD-P0-001 (efecto): la auditoría detecta que el plugin acepta
  force-push a `develop` por defecto.
- Es el puente entre la policy declarativa de `c00130` (en GitHub)
  y la policy local del plugin (en el driver de push).
- Sin este cambio, `x00257` y `x00258` no tendrían lista a la que
  referirse.
- Es aditivo: ningún flujo legítimo se rompe.

## non-goals

- No elimina la posibilidad de override por configuración del
  usuario.
- No introduce más ramas protegidas por defecto (e.g. `release/*`)
  en esta hija.
- No cambia el comportamiento para worktrees `agent/<name>` (ya
  están excluidos por convención).

## architecture

### 1. Defaults

- `plugins/commit-policy/src/lib/config/defaults.ts`:
  ```ts
  /**
   * Branches protected by the commit-policy driver by default.
   *
   * Users may override via config; the validator emits a warning
   * when the override drops `develop` (see c00131).
   */
  export const DEFAULT_PROTECTED_BRANCHES = Object.freeze([
      'main',
      'master',
      'develop',
  ] as const);
  ```

### 2. Validación con warning

- `plugins/commit-policy/src/lib/config/validate.ts` (o
  equivalente):
  - Al cargar config del usuario, si `protectedBranches` está
    definida y no incluye `develop`, emitir warning:
    `WARN_PROTECTED_BRANCHES_MISSING_DEVELOP`.
  - El warning es no-bloqueante (no falla el load).
  - El warning se loguea una sola vez por sesión.

### 3. Tests

- `plugins/commit-policy/tests/src/lib/config/defaults.spec.ts`:
  - La constante contiene exactamente `main`, `master`, `develop`.
  - Es `readonly` (`Object.freeze` aplicado).
- `plugins/commit-policy/tests/src/lib/config/validate.spec.ts`:
  - Override que incluye `develop` → sin warning.
  - Override que omite `develop` → warning emitido.
  - Sin override → defaults aplicados, sin warning.

## Slices

### S1 — Defaults + warning + tests

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/config/defaults.ts`, `plugins/commit-policy/src/lib/config/validate.ts`, `plugins/commit-policy/tests/src/lib/config/defaults.spec.ts`, `plugins/commit-policy/tests/src/lib/config/validate.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: options.ts define DEFAULT_PROTECTED_BRANCHES = [main, master, develop] y lo conecta al default efectivo de push.protectedBranches; el override del usuario sigue siendo autoritativo sin fusion implicita; index.ts solo emite WARN_PROTECTED_BRANCHES_MISSING_DEVELOP cuando el override omite develop. Checks ejecutados: plugin typecheck OK; lifecycle spec OK (5/5); push-scheduler spec OK (15/15); smoke parse OK con parsed.push.protectedBranches = [main, master, develop] y override parseado = [main, master].
## acceptance

- `DEFAULT_PROTECTED_BRANCHES` contiene `develop`.
- Override del usuario sigue funcionando (test verde).
- Warning explícito al override que omite `develop`.
- `bun run validate` verde; tests del plugin verdes.
- `commit-policy` rechaza push directo a `develop` con
  `--force-with-lease` (smoke test manual documentado).
