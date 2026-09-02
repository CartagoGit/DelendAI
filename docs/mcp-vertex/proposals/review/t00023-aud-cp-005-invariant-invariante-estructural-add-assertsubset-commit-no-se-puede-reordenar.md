---
id: t00023
title: "AUD-CP-005.invariant — Invariante estructural: `add → assertSubset → commit` no se puede reordenar"
kind: test
status: review
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / AUD-CP-005 (close-out)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-005
    external-reviewer: ChatGPT-5.6-Sol (close-out delta)
related:
    - q00006
    - x00263 # sliceScoping stagea archivos exactos (predecesor)
    - x00264 # threshold (predecesor)
    - x00269 # validate-before-commit (predecesor duro)
    - x00270 # isolate-git-index (complemento)
    - f00182 # CommitPolicyEngine (target)
    - t00018 # happy path (predecesor)
    - t00022 # E2E real Git (hermano)
last-transition-id: e90e87ef-685b-4145-885c-b498d0523cd2
last-correlation-id: e90e87ef-685b-4145-885c-b498d0523cd2
last-transition-from: in-progress
---

# t00023 — AUD-CP-005.invariant: el orden `stage → validate → commit` es un invariante estructural, no solo un comportamiento

## Goal

Convertir el orden de operaciones que `x00269` formaliza como
contrato en un **invariante verificable de forma estructural**,
no solo por aserciones funcionales. El reviewer externo lo pidió:

> "The problem is the order."

Y el riesgo es real: cualquier futuro helper (retry, lazy
plugin, paralelización) podría reintroducir el bug saltándose
`assertSubset`. Esta hija blinda el orden a tres niveles:

1. **Lint estructural**: `git commit` solo puede invocarse
   desde `commitWithGuard` (`x00269`) en el código fuente del
   plugin.
2. **Lint de orden**: dentro de `commitWithGuard`, el cuerpo de
   la función debe contener `git add`, `assertSubset`, `git
   commit` **en ese orden sintáctico**. Si alguien reordena el
   cuerpo, el test falla.
3. **Test de invariante runtime**: con un spy sobre
   `commitWithGuard`, ningún consumidor puede llamar a
   `git commit` antes de que `assertSubset` haya sido invocado
   y haya devuelto `null` (sub-set válido).

### Comportamiento actual (RIESGO)

```ts
// plugins/commit-policy/src/lib/services/engine.ts (futuro)
const result = await commitWithGuard(...);
if (someFutureFlag) {
  await runGit(['commit', '--amend', '--no-edit']);  // ⚠ salta assertSubset
}
```

`commitWithGuard` cerró el caso "primer commit", pero un futuro
refactor podría introducir un bypass alrededor del guard. El
invariante estructural es la única defensa contra esto.

### Comportamiento deseado

```
Nivel 1 (lint):
  # tools/scripts/lint/commit-driver-guard.script.ts
  git grep -nE "['\"]git['\"]" plugins/commit-policy/src
    → debe mostrar solo invocaciones dentro de commit-driver.ts
    → cualquier otra invocación es violación del invariante

  git grep -nE "runGit\\(\\['commit" plugins/commit-policy/src/lib/services/commit-driver.ts
    → debe estar SOLO dentro de la función commitWithGuard
    → medir con marker start/end
```

```
Nivel 2 (order lint):
  // plugins/commit-policy/src/lib/services/commit-driver.spec.ts
  it('commitWithGuard body order: add → assertSubset → commit', () => {
    const body = readFileSync('commit-driver.ts', 'utf-8');
    const fnMatch = body.match(/commitWithGuard[\s\S]+?\n\}/);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    const idxAdd = fn.search(/runGit\(\[?'add/);
    const idxSubset = fn.search(/assertSubset/);
    const idxCommit = fn.search(/runGit\(\[?'commit/);
    expect(idxAdd).toBeLessThan(idxSubset);
    expect(idxSubset).toBeLessThan(idxCommit);
  });
```

```
Nivel 3 (runtime spy):
  it('no consumer puede bypassear assertSubset → commit', async () => {
    const calls: string[] = [];
    const git = {
      add: vi.fn(async () => calls.push('add')),
      diffCached: vi.fn(async () => calls.push('diff-cached')),
      writeTree: vi.fn(async () => calls.push('write-tree')),
      commitTree: vi.fn(async () => { calls.push('commit-tree'); return 'hash'; }),
      updateRef: vi.fn(async () => calls.push('update-ref')),
      revParseHEAD: vi.fn(async () => 'oldHead'),
    };
    const driver = makeDriver({ git });
    await expect(driver.commitWithGuard({
      allowList: ['a.ts'], message: 'feat', branch: 'develop', options: { skipStageExplicit: false },
    })).resolves.toMatchObject({ commitCreated: true });
    expect(calls.indexOf('add')).toBeLessThan(calls.indexOf('diff-cached'));
    expect(calls.indexOf('diff-cached')).toBeLessThan(calls.indexOf('write-tree'));
    expect(calls.indexOf('write-tree')).toBeLessThan(calls.indexOf('commit-tree'));
    expect(calls.indexOf('commit-tree')).toBeLessThan(calls.indexOf('update-ref'));
  });
```

## Why

- El reviewer externo lo pidió literalmente:
  > "El problema es el orden."
  > "The test must check that HEAD doesn't change and that no
  > commit is created when staged files are outside the
  > authorized set."
- `t00022` valida la **propiedad funcional** (no contamination,
  no commit, no HEAD move). `t00023` blinda el **contrato
  estructural** que hace que la propiedad sea sostenible en el
  tiempo.
- Sin invariante, `f00182` puede reordenar el cuerpo del engine
  en cualquier refactor futuro y reintroducir el bug
  silenciosamente. El lint bloquea el commit (`bun run
  validate`) si eso pasa.

## Non-goals

- No introducir un type-level proof (TypeScript no sirve para
  state machines en red de git). El invariante es **runtime +
  lint + spec**, no estático.
- No probar a nivel de integración con Git real (eso es `t00022`).
  Esta hija prueba la **forma** del código.
- No congelar `git reset`, `git read-tree`, `git write-tree`
  dentro de `commitWithGuard`. Solo bloquea el orden relativo
  de `add → assertSubset → commit-tree`.

## Architecture

### 1. Lint ad-hoc estructural

```ts
// tools/scripts/lint/commit-driver-guard.script.ts
import { execSync } from 'node:child_process';

const FORBIDDEN_PATTERNS = [
  // git commit directo fuera de commit-driver.ts
  /runGit\(\[?'commit/,
];

const driverFile = 'plugins/commit-policy/src/lib/services/commit-driver.ts';
const sourceFiles = execSync('git ls-files plugins/commit-policy/src/**/*.ts', { encoding: 'utf-8' })
  .split('\n').filter(Boolean);

let violations = 0;
for (const f of sourceFiles) {
  if (f === driverFile) continue;
  const body = execSync(`cat ${f}`, { encoding: 'utf-8' });
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(body)) {
      console.error(`✖ ${f} contiene invocación git commit directa. Use commitWithGuard.`);
      violations++;
    }
  }
}
process.exit(violations > 0 ? 1 : 0);
```

### 2. Spec de orden sintáctico

Como el bloque "Nivel 2" arriba. Vive en
`plugins/commit-policy/tests/src/lib/services/commit-driver-order.spec.ts`.

### 3. Spec runtime con spies

Como el bloque "Nivel 3" arriba. Vive en
`plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`
(ya existe, se añade el `it`).

### 4. CI wiring

- `bun tools/scripts/lint/commit-driver-guard.script.ts` añadido
  al `bun run validate`.
- `vitest.config.ts` ya ejecuta `tests/**`.

## Slices

### S1 — Lint estructural `commit-driver-guard`

- **Status**: pending
- **Files**: `tools/scripts/lint/commit-driver-guard.script.ts`,
  `package.json` (añadir a `lint:`).
- **Gate**: lint
- **Depends on**: `x00269`

### S2 — Spec de orden sintáctico

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/lib/services/commit-driver-order.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: S1 + `x00269`

### S3 — Spec runtime spy

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts` (añadir `it`).
- **Gate**: test passing
- **Depends on**: `x00269`

## acceptance

- `bun tools/scripts/lint/commit-driver-guard.script.ts` sale 0.
- `bun test packages/commit-policy/tests/src/lib/services/commit-driver-order.spec.ts` verde.
- Si un humano o agente futuro introduce un reordenamiento del
  cuerpo de `commitWithGuard` (o un bypass en otra parte del
  plugin), el lint o el spec de orden falla **antes** de poder
  mergear a `develop`.
- `bun run validate` verde en CI.
