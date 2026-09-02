---
id: t00018
title: "AUD-CP-005 — Slice event staging: cross-agent safe (dos agentes dirty simultáneos)"
kind: test
status: in-progress
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / t00018"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-005
related:
    - q00006
    - x00260 # slice listener entrega files
    - x00263 # sliceScoping stagea exactos (el comportamiento que se cubre)
    - x00261 # dispose al reload
last-transition-id: 8ee9639a-3ad2-47cb-af17-8ed3c7d9f4fb
last-correlation-id: 8ee9639a-3ad2-47cb-af17-8ed3c7d9f4fb
last-transition-from: ready
---

# t00018 — Slice event staging cross-agent safe

## Goal

Reproducir el escenario adversario de la auditoría externa
(AUD-CP-005): dos agentes tocan el mismo working tree en paralelo,
uno cierra un slice y dispara el listener, el otro tiene cambios
pendientes no stageados. El test verifica que:

1. El engine de B stagea únicamente los `files` declarados por el
   slice de B.
2. `git diff --cached --name-only` ⊆ `event.files`.
3. Nada de A entra en el commit de B.
4. El listener de A sigue funcionando independientemente.
5. El listener de B no cross-contamina al recargar
   (`dispose()` de `x00261` se verifica).

Pieza de aceptación para `x00260` y `x00263`.

## Why

- AUD-CP-005 es el hallazgo "cross-agent contamination" más serio
  del track B; el reporte externo no lo descubrió solo, sino
  reproduciendo un escenario.
- Sin un test adversario, este bug vuelve. La propiedad "cada
  agente commitea solo lo suyo" no es visible desde el unit test
  del driver.
- Habilita la propiedad "load only required capabilities"
  del repo: el slice stagea lo que le toca.

## Non-goals

- No probar concurrencia real a nivel OS (eso es integration
  E2E; aquí simulamos dos agentes con dos `register()` aislados
  en el mismo `cwd`).
- No probar la red (`git push`); solo stage + commit local.
- No introducir librería de concurrencia.

## Architecture

### 1. Setup

```ts
// plugins/commit-policy/tests/integration/cross-agent.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register as registerCommitPolicy } from '../../src/index';

const work = mkdtempSync(join(tmpdir(), 'cp-crossagent-'));
// init git repo, set user.email/user.name
// agent A: writeFileSync('a.ts', 'A'); git add a.ts (dirty → staged)
// agent B: writeFileSync('b.ts', 'B'); // working dir
```

### 2. Escenario principal

```ts
it('slice of B stages only B files, not A', async () => {
  const pluginA = registerCommitPolicy({ ctxA });
  const pluginB = registerCommitPolicy({ ctxB });

  // A hace `a.ts`, queda dirty staged ajenos
  // (no commit, solo `git add` lo crea agent A manualmente)

  // B hace `b.ts`, slice B.done emite event.files=['b.ts']
  const resultB = await pluginB.engine.handle({
    kind: 'slice',
    proposalId: 'p001',
    sliceId: 'S1',
    files: { paths: [join(work, 'b.ts')] },
    eventId: 'evt-b-1',
  });

  expect(resultB.ack).toBe('OK');
  const staged = execSync('git diff --cached --name-only', { cwd: work })
    .toString().trim().split('\n');
  expect(staged).toEqual(['b.ts']);
  // o, si hay prefijos, normalize antes de comparar
});
```

### 3. Casos extra

| Caso | Esperado |
| --- | --- |
| A tiene cambios staged antes; B commitea | `git diff --cached` ⊆ B |
| A dirty sin stagear; B commitea | B commitea OK; A sigue dirty |
| B reload N veces; misma operación | un commit por handle |
| B dispose; cualquier evento posterior | DEAD/RETRY, no commit |
| A y B commitean en paralelo (Promise.all) | dos commits, cada uno con sus files |

### 4. Verificación post-stage

Helper:

```ts
async function stagedSubset(repoDir: string, expected: string[]) {
  const staged = execSync('git diff --cached --name-only', { cwd: repoDir })
    .toString().trim().split('\n').filter(Boolean);
  const normalizedExpected = expected.map(p => path.relative(repoDir, p));
  for (const f of staged) {
    if (!normalizedExpected.includes(f)) {
      throw new Error(`CROSS_AGENT_CONTAMINATION: ${f} not in expected`);
    }
  }
}
```

Invocado en cada caso.

### 5. Cleanup

- `dispose()` de ambos plugins.
- `rm -rf` del tmpdir.

### 6. Acceptance

```bash
bunx vitest run plugins/commit-policy/tests/integration/cross-agent.spec.ts
# → 5 escenarios verdes
```

## Slices

- global_gate: lint

### S1 — Escenario cross-agent dirty simultáneo con verificación de subset

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/integration/cross-agent.spec.ts`, posible helper `plugins/commit-policy/tests/integration/_helpers/git-stage.ts`
- **Gate**: type
- **Dependency**: `x00260`, `x00261`, `x00263`
- acceptance:
  - "5 escenarios verdes (ver tabla de la sección Casos extra)"
  - "assertSubset se llama y detecta contaminación si se reintroduce el bug"
  - "test rojo antes del fix de x00260/x00263; verde después"

## acceptance

- `bunx vitest run` del archivo verde.
- Output incluye snapshot del staged subset por escenario para
  facilitar debugging.
- Cleanup robusto: tmpdir borrado aunque el test falle.
- `bun run lint` verde; `tsc --noEmit` verde.
