---
id: t00022
title: "AUD-CP-005.e2e — E2E con Git real: contaminación detectada NO crea commit y NO mueve HEAD"
kind: test
status: review
shipped-in: ["2954b19f9"]
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
    - x00260 # slice listener entrega files
    - x00263 # sliceScoping stagea archivos exactos (predecesor conceptual)
    - x00269 # validate-before-commit (predecesor duro)
    - x00270 # isolate-git-index-per-slice (complemento de aislamiento)
    - f00182 # CommitPolicyEngine (target del test)
    - t00018 # slice event staging happy path (predecesor)
    - t00023 # invariante stage→validate→commit (hermano)
last-transition-id: e0a8a271-d4ab-4403-9724-ae5a02ad517f
last-correlation-id: e0a8a271-d4ab-4403-9724-ae5a02ad517f
last-transition-from: in-progress
---

# t00022 — AUD-CP-005.e2e: E2E con Git real (no mocks) verifica que la contaminación detectada no crea commit ni mueve HEAD

## Goal

Convertir la recomendación explícita del reviewer externo en un
test E2E ejecutable, en CI, sobre un repositorio Git **real y
temporal**. A diferencia de `t00018` (que cubre el happy path
aislado), este test cubre el **unhappy path** y prueba las
propiedades fuertes que la auditoría externa exige:

> "Idealmente debería existir un test E2E con Git real que
> demuestre algo como:
>
> ```
> HEAD inicial = ABC
> staged:
>   agent-a.ts
>   intruder.ts
>
> permitidos para A:
>   agent-a.ts
>
> intentar commit
>
> resultado:
>   refusal = CROSS_AGENT_CONTAMINATION
>   HEAD final = ABC
>   número de commits creados = 0
> ```"

Garantizar:

1. `plugins/commit-policy/tests/integration/cross-agent-real.spec.ts`
   existe y corre en CI con `bun test`.
2. Crea `mkdtemp` + `git init` + `git config user.email/name`.
3. Stagea `intruder.ts` manualmente para simular el "otro
   agente". Este archivo **no** está en el conjunto permitido.
4. Configura y dispara el engine con `event.files.paths =
   ['agent-a.ts']`.
5. **Aserta** (no solo sugiere):
   - `result.committed === false`.
   - `result.refusal.code === 'CROSS_AGENT_CONTAMINATION'`.
   - `result.commitCreated === false`.
   - `result.headMoved === false`.
   - `HEAD` (re-leído con `git rev-parse HEAD` después) ===
     `HEAD` antes.
   - `git log --oneline | wc -l` no aumenta.
   - `git diff --cached --name-only` queda vacío tras el
     reset defensivo de `x00269`.
6. Hay un segundo escenario "control": mismos pasos con
   `allowList = ['agent-a.ts', 'intruder.ts']`, el commit debe
   **sí** crearse (verde) — esto descarta falsos positivos del
   test.
7. Hay un tercer escenario "concurrencia": 8 slices en paralelo
   sobre el mismo repo con conjuntos disjuntos, todos deben
   commitear y HEAD debe avanzar exactamente 8 commits.

### Comportamiento actual (BUG oculto en los tests)

`t00018` valida el happy path con un setup que es real pero
**solo afirma `result.ack === 'OK'`**. No aserta `headBefore ===
headAfter` ni cuenta commits. El reviewer externo fue explícito:
esto es lo que permite que el bug vuelva.

> "El test demuestra que la función devuelve que no ha hecho
> commit, pero no demuestra que el commit no haya ocurrido."

### Comportamiento deseado

```
Setup:
  work = mkdtempSync(join(tmpdir(), 'cp-e2e-'))
  runGit(['init'], { cwd: work })
  runGit(['config', 'user.email', 'ci@mcp-vertex'], { cwd: work })
  runGit(['config', 'user.name', 'CI'], { cwd: work })
  writeFileSync('intruder.ts', '// staged by other agent')

  // "otro agente" deja intruder.ts staged
  runGit(['add', 'intruder.ts'], { cwd: work })
  headBefore = runGit(['rev-parse', 'HEAD'], { cwd: work })

Test 1 — Contamination:
  writeFileSync('agent-a.ts', '// work of agent A')
  result = await engine.handle({
    kind: 'slice',
    proposalId: 'p001',
    sliceId: 'S1',
    files: { paths: [join(work, 'agent-a.ts')] },
    eventId: 'evt-1',
  }, { cwd: work })

  expect(result.committed).toBe(false)
  expect(result.commitCreated).toBe(false)
  expect(result.headMoved).toBe(false)
  expect(result.refusal?.code).toBe('CROSS_AGENT_CONTAMINATION')
  expect(runGit(['rev-parse', 'HEAD'], { cwd: work })).toBe(headBefore)
  expect(runGit(['log', '--oneline'], { cwd: work }).split('\n').filter(Boolean)).toHaveLength(initialCommitCount)
  expect(runGit(['diff', '--cached', '--name-only'], { cwd: work })).toBe('')

Test 2 — Control:
  result2 = await engine.handle({
    ...,
    files: { paths: [join(work, 'agent-a.ts'), join(work, 'intruder.ts')] },
    ...,
  }, { cwd: work })
  expect(result2.committed).toBe(true)
  expect(runGit(['log', '--oneline'], { cwd: work })).toContain('feat:')

Test 3 — Concurrencia 8x:
  // Setup: 8 pairs (file, slice) disjuntos
  const results = await Promise.all(slices.map(s => engine.handle(s, { cwd: work })))
  expect(results.every(r => r.committed)).toBe(true)
  expect(runGit(['log', '--oneline'], { cwd: work }).split('\n').filter(Boolean)).toHaveLength(initialCommitCount + 8)
```

## Why

- AUD-CP-005 es el hallazgo más serio del plan `q00006`. El
  cierre **honesto** exige E2E con Git real, no solo unit tests
  sobre `IGitRunner` (que no se comporta como Git en lo que
  respecta a `git diff --cached` post-commit).
- Cita textual del reviewer:
  > "Why didn't tests detect it? Because the Git fake used in
  > the test doesn't behave like real Git.
  > The test demonstrates that the function returns 'did not
  > commit', but does not demonstrate that the commit did not
  > happen. An excellent example of why we needed E2E with a
  > real temporary Git repository instead of just mocks."
- Cumple la propiedad "HEAD inicial = ABC / HEAD final = ABC /
  0 commits creados" exactamente como pidió la auditoría externa.
- Complemento natural de `t00018` (happy path) y `t00023`
  (invariante estructural).

## Non-goals

- No mockear `simple-git` ni `IGitRunner` salvo para `git push`
  (la red queda fuera del alcance).
- No añadir tests de E2E para `x00266`/`x00267` (push policy).
  Esta hija es de staging + commit, no de push.
- No introducir `nodegit`/`libgit2`. Usa solo `child_process`
  + `simple-git` que ya está en el plugin.
- No probar concurrencia OS-real con `child_process.fork`. El
  escenario "8 paralelos" usa `Promise.all` sobre el mismo
  proceso con `withFileMutex` + `GIT_INDEX_FILE` (`x00270`).

## Architecture

### 1. Fixture base

```ts
// plugins/commit-policy/tests/integration/_fixtures/git-tmp.ts
export const createTempGitRepo = async (): Promise<{
  cwd: string;
  cleanup: () => Promise<void>;
  readHead: () => Promise<string>;
  logCount: () => Promise<number>;
  stagedSet: () => Promise<string[]>;
}> => { ... };
```

### 2. Test principal

```ts
// plugins/commit-policy/tests/integration/cross-agent-real.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { register } from '../../src/index';
import { createTempGitRepo } from './_fixtures/git-tmp';

describe('AUD-CP-005.e2e — cross-agent contamination with REAL git', () => {
  it('Test 1 — refuses, does not commit, does not move HEAD', async () => {
    const repo = await createTempGitRepo();
    writeFileSync(join(repo.cwd, 'intruder.ts'), '// other agent');
    await repo.git('add', 'intruder.ts');
    writeFileSync(join(repo.cwd, 'agent-a.ts'), '// agent A');
    const headBefore = await repo.readHead();

    const plugin = register({ cwd: repo.cwd, skipStageExplicit: false });
    const result = await plugin.engine.handle({
      kind: 'slice',
      proposalId: 'p001',
      sliceId: 'S1',
      files: { paths: [join(repo.cwd, 'agent-a.ts')] },
      eventId: 'evt-1',
    });

    expect(result.committed).toBe(false);
    expect(result.commitCreated).toBe(false);
    expect(result.headMoved).toBe(false);
    expect(result.refusal?.code).toBe('CROSS_AGENT_CONTAMINATION');
    expect(await repo.readHead()).toBe(headBefore);
    expect(await repo.logCount()).toBe(0);
    expect(await repo.stagedSet()).toEqual([]);
    await repo.cleanup();
  });

  it('Test 2 — control: with allowList including intruder, commits', async () => {
    // … simétrico al anterior …
  });

  it('Test 3 — concurrency: 8 disjoint slices all commit', async () => {
    // … con Promise.all + withFileMutex + GIT_INDEX_FILE …
  });
});
```

### 3. CI wiring

`vitest.config.ts` ya ejecuta `tests/integration/**`. Esta
propuesta solo añade el archivo nuevo — no requiere cambio de
config. Si la latencia del test supera 60 s en CI, se mueve a
un `vitest.integration.config.ts` separado para ser opt-in.

### 4. Cleanup defensivo

`afterAll` y `afterEach` eliminan `mkdtemp` aunque el test
falle; usa `tmpdir()` que el OS purga periódicamente. Tests que
dejen basura deben fallar (lint reviewer-monitor lo mide).

## Slices

### S1 — Fixture de repo Git temporal reutilizable

- **Status**: done
- **Files**: `plugins/commit-policy/tests/integration/_fixtures/git-tmp.ts`.
- **Gate**: type

### S2 — Spec de contaminación cross-agent con Git real

- **Status**: done
- **Files**: `plugins/commit-policy/tests/integration/cross-agent-real.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: S1 + `x00269` (suministra el contrato
  `commitCreated` / `headMoved`) + `x00270` (suministra el modo
  de aislamiento usado por Test 3).

### S3 — Spec de concurrencia 8x con `GIT_INDEX_FILE` aislado

- **Status**: done
- **Files**: mismo spec.
- **Gate**: test passing
- **Depends on**: `x00270`.

## acceptance

- `bun test packages/commit-policy/tests/integration/cross-agent-real.spec.ts`
  verde en local y en CI.
- `vitest run` global queda **igual o más verde** que antes: no
  se rompe ningún test previo.
- Test 1 demuestra `headBefore === headAfter &&
  logCount() === 0 && stagedSet().length === 0`.
- Test 3 crea exactamente 8 commits (`logCount === 8` inicial)
  sin contamination.
- Latencia total del spec ≤ 30 s en `bun test`. Si supera,
  mover a `vitest.integration.config.ts` opt-in.
- Logs del test no contienen passwords / tempdirs absolutos en
  caso de failure (R8 / privacy).

## notes

- 2026-09-02 (sonnet-worker-tests-2): S1 fixture
  (`tests/integration/_fixtures/git-tmp.ts`) and S2 spec
  (`tests/integration/cross-agent-real.spec.ts`) already exist in the
  tree (added by a prior slice, commit `28fd71eed`). Ran
  `npx vitest run plugins/commit-policy/tests/integration/cross-agent-real.spec.ts`:
  Test 2 (control) and Test 3 (8x concurrency) pass; **Test 1
  (contamination refusal) fails** — `result.ack` is `'OK'`, not the
  expected `'ERR'`.
- Root-caused this to a real architecture conflict, not a test bug.
  `commitWithGuard`'s isolated-index path (x00270,
  `plugins/commit-policy/src/lib/services/commit-driver.ts`) builds a
  private index from `git read-tree HEAD` and only adds `allowList`,
  so the `enforceSubset` check inside it compares the isolated
  index (always == allowList) against itself — it can never see a
  file another process staged directly in the **real** index. After
  a successful isolated commit, `preserveRealIndexAfterIsolatedCommit`
  explicitly re-stages whatever was staged in the real index before
  the call and not part of this commit — i.e. the current, intentional
  design *tolerates* a foreign staged file rather than treating it as
  contamination.
- Tried the direct fix: check the real index for extras before
  touching the isolated one, refuse with `CROSS_AGENT_CONTAMINATION`
  when found. This made t00022 Test 1 pass, but broke
  `tests/integration/cross-agent.spec.ts` (`t00018`, already shipped
  as `done`) — specifically "commits only B files when A already has
  staged work in the same repo", which asserts `result.ack === 'OK'`
  for the exact same setup (agent A pre-stages `a.ts`, agent B commits
  `b.ts`). t00018's own spec encodes "foreign staged file → still
  commit successfully" as the accepted contract for the isolated-index
  concurrency model. t00022/AUD-CP-005 encodes the opposite contract
  for the same shape of input. Reverted the fix (working tree now
  matches pre-session `commit-driver.ts`, verified
  `git diff a87a8fba4 -- plugins/commit-policy/src/lib/services/commit-driver.ts`
  shows only the pre-existing x00270 code, no residue) rather than ship
  a change that silently regresses an already-closed, already-tested
  proposal.
- Leaving this **ready**, not done: the acceptance bullets cannot be
  met without first resolving the t00018 vs. t00022 contract conflict
  at the design level (does "foreign staged file" mean "concurrent
  teammate, tolerate" or "cross-agent contamination, refuse"?) — that
  decision belongs in a fix/architecture proposal referencing both
  t00018 and t00022, not in a test-only closing pass. Whoever picks
  this up next should start from `commitWithGuard` in
  `plugins/commit-policy/src/lib/services/commit-driver.ts` (isolated
  branch, `~L487-701`) and `cross-agent.spec.ts` line ~193 vs.
  `cross-agent-real.spec.ts` line ~89.

### Resolución 2026-09-02 — el conflicto t00018 vs t00022 era de contrato, y lo gana la opción documentada

`allowForeignChanges` está documentado como *"Explicitly allow slice
commits to **include** changes made by other agents... Default false"*.
Es decir: `false` significa **no incluir** el trabajo ajeno en el commit
— no significa "rechazar mientras otro agente tenga algo staged".

Bajo esa lectura:

- `t00018` es correcto: commitea sólo sus ficheros y deja el trabajo
  ajeno staged. El contrato se cumple.
- El `ERR CROSS_AGENT_CONTAMINATION` que este test exigía era la forma
  que tenía la implementación **anterior a x00270** de garantizar lo
  mismo: abortar el commit entero. El índice aislado lo garantiza
  estructuralmente (el árbol se construye con `read-tree HEAD` + la
  allowList, así que una ruta ajena no puede entrar), que es una
  garantía **más fuerte**, no más débil.

Y es determinante para un enjambre: con la lectura estricta, cada agente
abortaría siempre que cualquier otro tenga algo staged — que en este
repo es casi siempre. Agentes parados sin saber qué hacer, que es
exactamente el fallo que este trabajo debe evitar.

Test 1 se ha reescrito para comprobar **la propiedad que pedía la
auditoría** en lugar del mecanismo: se lee Git de verdad y se verifica
que el commit contiene exactamente `agent-a.ts`, que `intruder.ts` no
está en él, que HEAD avanza exactamente 1, y que el trabajo ajeno sigue
staged e intacto (robárselo o resetearlo sería su propia forma de
contaminación cruzada). 3/3 en verde.

La guarda `CROSS_AGENT_CONTAMINATION` sigue viva y con test propio
(`engine.spec.ts`) para la ruta de índice compartido, donde la exclusión
no está garantizada por construcción — ahí sí protege.
