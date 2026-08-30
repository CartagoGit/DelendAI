---
id: f00189
title: "`dryRun` transversal para tools con `effects: ['write']`"
kind: feat
status: done
type: proposal
track: security
date: 2026-08-25
priority: P1
parent-plan: q00006
shipped-in:
    - d4ff3b59
    - e9cb1bcb
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track F / f00189"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00188 # capabilities (prerequisito lógico para `effects`)
    - c00137 # lint capabilities no declaradas
---

# f00189 — `dryRun` transversal para tools con `effects: ['write']`

## Goal

Introducir un protocolo de **`dryRun` transversal**: cuando una tool
declara `effects: ['write']` en su manifest, el handler puede
recibir `args.dryRun = true` y debe devolver un plan de cambio sin
ejecutarlo.

### Comportamiento actual

- Algunas tools aceptan `dryRun: true` ad-hoc; otras no.
- No hay un protocolo unificado: el LLM no sabe si una tool
  soporta dryRun o no.
- No hay enforcement de que una tool marcada con `effects: ['write']`
  implemente dryRun de forma segura.
- La auditoría externa (§29) lo señala como bug de safety: el
  usuario no puede "ver qué pasaría" antes de ejecutar.

### Comportamiento deseado

- Toda tool con `effects` distinto de `[]` declara en su manifest:
  ```ts
  definePlugin({
    name: 'commit-policy',
    tools: [{
      name: 'commit_run',
      effects: ['git:write', 'fs:write'],
      dryRunSupported: true,
      inputSchema: z.object({ dryRun: z.boolean().optional(), … }),
    }],
  });
  ```
- El router (`packages/core/src/lib/plugins/router.ts`) garantiza
  que si `args.dryRun === true`:
  - El handler se llama con `args.dryRun = true`.
  - El handler debe devolver `{ dryRun: true, wouldChange: [...],
    wouldRun: [...], risk: 'low' | 'medium' | 'high' }` y **no**
    debe ejecutar side effects.
- El manifest es parseado al boot; si `effects !== []` y
  `dryRunSupported === false`, el plugin no arranca (o arranca con
  warning bloqueante).

## why

- Habilita flujos agent seguros: el LLM puede proponer "voy a hacer
  X" antes de hacerlo.
- Habilita debugging: el usuario puede ver qué cambiaría antes de
  que cambie.
- Cierra el bug de §29.
- Es la base para el patrón `proposal → apply` que el plugin
  proposals ya intenta hacer pero sin dryRun transversal.

## non-goals

- No introduce un sistema de "transacciones" (eso es `f00201`,
  Track O).
- No ejecuta dryRun automáticamente; lo decide el caller.
- No añade un sandbox; confía en que el handler no hace side
  effects cuando `args.dryRun === true`.

## architecture

### 1. Protocol

- `packages/core/src/lib/dry-run/protocol.ts`:
  ```ts
  interface DryRunResult {
    dryRun: true;
    wouldChange: PlannedChange[];
    wouldRun: PlannedRun[];
    risk: 'low' | 'medium' | 'high';
  }
  type DryRunOrRun<R> = DryRunResult | R;
  ```

### 2. Router enforcement

- `packages/core/src/lib/plugins/router.ts` (extensión a la
  integración de `f00188`):
  - Si la tool tiene `effects !== []` y `dryRunSupported === false`,
    warning bloqueante.
  - Si `args.dryRun === true`, el handler se llama con
    `args.dryRun = true` y el resultado se verifica: debe incluir
    `dryRun: true`. Si no, el router lo marca como bug del plugin
    y devuelve refusal.

### 3. Plugin ejemplo (commit-policy)

- `plugins/commit-policy/src/lib/engine.ts` (o donde esté el
  handler de `commit_run`) implementa `dryRun`:
  - Lista los commits que crearía.
  - Lista los archivos que modificaría.
  - Calcula `risk` en base al scope.

### 4. Tests

- `packages/core/tests/src/lib/dry-run/protocol.spec.ts`:
  - Type narrowing: `DryRunOrRun<X>` se ramifica.
- `packages/core/tests/src/lib/dry-run/router-enforcement.spec.ts`:
  - Tool con `effects !== []` y `dryRunSupported: false` no arranca.
  - Tool con `dryRunSupported: true` recibe `args.dryRun`.
  - Handler que ignora `args.dryRun` y modifica estado → refusal.
- Test del plugin commit-policy:
  `plugins/commit-policy/tests/src/lib/dry-run-commit.spec.ts`.

## Slices

### S1 — Protocol + router enforcement + commit-policy dry-run

- **Status**: done
- **Files**: `packages/core/src/lib/dry-run/protocol.ts`, `packages/core/src/lib/plugins/router.ts`, `plugins/commit-policy/src/lib/engine.ts` (o equivalente), `packages/core/tests/src/lib/dry-run/protocol.spec.ts`, `packages/core/tests/src/lib/dry-run/router-enforcement.spec.ts`, `plugins/commit-policy/tests/src/lib/dry-run-commit.spec.ts`
- **Gate**: type
- **Done notes**: Protocol + router enforcement + commit-policy dry-run implementados. Protocol en `packages/core/src/lib/dry-run/protocol.ts`; enforcement en el router real (`packages/core/src/lib/dry-run/router-enforcement.ts` + `effect-guard.helper.ts`); dry-run de `commit_policy_run` en `plugins/commit-policy/src/lib/tools/run-tool.ts` (`planCommitPolicyRun`). Specs verdes: protocol.spec, router-enforcement.spec, dry-run-commit.spec (19/19).
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: protocol + router enforcement + commit-policy dry-run implementados (d4ff3b59 + e9cb1bcb). Specs de f00189 verdes 19/19 (protocol.spec, router-enforcement.spec, dry-run-commit.spec); typecheck de core y commit-policy sin errores.
## acceptance

- Protocol `DryRunOrRun` exportado.
- Router enforces `dryRunSupported` y verifica el resultado.
- `commit_run` del plugin commit-policy implementa dryRun.
- Tests verdes.
- `bun run validate` verde.
