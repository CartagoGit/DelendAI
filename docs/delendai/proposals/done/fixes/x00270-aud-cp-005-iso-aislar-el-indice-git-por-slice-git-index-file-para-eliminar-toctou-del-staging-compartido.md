---
id: x00270
title: "AUD-CP-005.iso — Aislar el índice Git por slice (`GIT_INDEX_FILE`) para eliminar TOCTOU del staging compartido"
kind: fix
status: done
shipped-in:
    - 7a253726
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
    - x00263 # sliceScoping stagea archivos exactos del slice
    - x00264 # threshold medir y stagear mismo conjunto dirty
    - x00269 # validate-before-commit (predecesor de invariante; este aísla el estado)
    - f00182 # CommitPolicyEngine orquestador central (compone el aislamiento)
    - t00022 # E2E real Git HEAD unchanged (predecesor)
    - t00023 # invariante stage→validate→commit (predecesor)
---

# x00270 — AUD-CP-005.iso: aislar el índice Git por slice vía `GIT_INDEX_FILE`

## Goal

Eliminar la **TOCTOU del staging compartido** que la revisión
externa señaló como riesgo subyacente a `x00263`/`x00264`/
`x00269`: aunque todos los drivers validen "después de `git add` y
antes de `git commit`", siguen dependiendo de un único
`.git/index` mutable por proceso / agente. Si dos slices
concurren sobre el mismo working tree:

```
slice A: git add -- A.ts            # modifica index compartido
slice B: git add -- B.ts            # mismo index → ahora contiene A.ts + B.ts
slice A: assertSubset(staged, [A.ts])  # falla: hay B.ts staged que A no pidió
```

El staging compartido convierte `assertSubset` en una carrera,
no en una invariante. Esta propuesta aísla el índice por
operación para eliminar la condición de carrera.

> "La solución fuerte para varios agentes sería una de estas:
> mutex alrededor de index+commit, o mejor aún:
> índice Git aislado mediante `GIT_INDEX_FILE` por
> operación/agente. Así cada agente construye su propio índice
> y no comparte staging state con otros agentes." — ChatGPT 5.6
> Sol, cuarta pasada.

Garantizar:

1. Cada invocación de `commitWithGuard` (`x00269`) opera sobre
   un **índice temporal** distinto, bajo `GIT_INDEX_FILE=<tmp>`,
   dentro de un mutex por `(repoRoot, sliceKey)`.
2. El engine (`f00182`) usa `withFileMutex(repoRoot/.mcp-vertex/index-lock)`
   para serializar commits **dentro** del mismo repo, pero el
   staging es privado por operación.
3. El árbol real (`git write-tree` desde el índice aislado) se
   fusiona al HEAD por un `git commit-tree` + `git update-ref`
   atómico; nunca tocando el `.git/index` real durante la
   preparación.
4. El conjunto de paths de trabajo sigue siendo `event.files.paths`
   — solo cambia **cómo** se stagea, no **qué** se stagea.
5. `t00022`/`t00023` validan este modo como modo por defecto.

### Comportamiento actual (BUG raíz)

```
.git/index (compartido por todos los agentes del proceso)

A: git add -- A.ts    # index += A.ts
B: git add -- B.ts    # index += A.ts + B.ts
A: assertSubset(['A.ts'])  # falla por contaminación de B
A: refusal
A: git reset HEAD --       # limpia A.ts del index compartido
B: assertSubset(['B.ts'])  # ya no hay A.ts por el reset; pasa
B: commit → includes [A.ts'? no... wait, sí — git add -- significa staging WORKING TREE, no index.]
```

El reset confunde el análisis posterior. Y `withFileMutex` que
existe en el plugin (`x00261`, `f00183`) solo cubre stores,
nunca el índice Git. No hay defensa real.

### Comportamiento deseado

```
Por cada llamada a commitWithGuard:

  tmp = mkdtempSync(join(tmpdir(), 'cp-index-<rid>-'))
  env = { GIT_INDEX_FILE: join(tmp, 'index'), ... }
  withFileMutex(repoRoot/.mcp-vertex/index-lock):
    runGit(['read-tree', 'HEAD'], { env })
    runGit(['add', '--', ...allowList], { env })         # stage privado
    tree = runGit(['write-tree'], { env })               # tree object
    head = runGit(['commit-tree', tree, '-p', 'HEAD', '-m', message], { env })
    runGit(['update-ref', 'refs/heads/<branch>', head])  # atómico
  return { commitCreated: true, headBefore, headAfter: head, tree }
```

El `.git/index` real **nunca se modifica** durante la operación.
El mutex solo coordina el `update-ref` y la construcción del
commit, no el staging.

## Why

- El fix de orden (`x00269`) defiende contra "validar después
  de commit"; este fix defiende contra "staging cruzado durante
  add".
- Cita literal del reviewer externo:
  > "A strong solution for multiple agents would be one of these:
  > mutex alrededor de index+commit, or even better:
  > índice Git aislado mediante `GIT_INDEX_FILE`."
- Sin aislamiento, todo el cierre de AUD-CP-005 depende de la
  suerte de la planificación del listener y de la ventana
  entre `add` y `commit`. Eso sigue siendo un TOCTOU real entre
  agentes.
- Es compatible con `withFileMutex` que ya existe en
  `packages/core/public`; reutiliza el primitive, no introduce
  una nueva librería.

## Non-goals

- No usar worktree subtree; eso es git plumbing de más alto nivel
  y costoso (sub-repos). `GIT_INDEX_FILE` es plumbing nativo y
  barato.
- No reintroducir el `skipAdd` implícito (`x00263` lo prohíbe).
- No mover `withFileMutex` a otra implementación; este primitive
  ya está en producción y `x00044` ya lo validó.
- No tocar `f00183` (idempotency): la idempotency key sigue
  siendo del evento, no del lock.

## Architecture

### 1. Helper `commitWithIsolatedIndex`

```ts
// plugins/commit-policy/src/lib/services/commit-driver.ts
async commitWithGuard(args: {
  allowList: readonly string[];
  message: string;
  options: DriverOptions;
  branch: string; // rama objetivo (develop/<worktree>/main)
}): Promise<GuardResult> {
  if (args.allowList.length === 0 && !args.options.skipStageExplicit) {
    return { commitCreated: false, headMoved: false, refusal: 'SLICE_HAS_NO_FILES' };
  }
  const tmpDir = await mkdtemp(join(tmpdir(), 'cp-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(tmpDir, 'index') };
  const lockPath = join(args.repoRoot, '.mcp-vertex', 'index-lock');
  return withFileMutex(lockPath, async () => {
    await this.runGit(['read-tree', 'HEAD'], { env });
    await this.runGit(['add', '--', ...args.allowList], { env });
    const staged = (await this.runGitOut(['diff', '--cached', '--name-only'], { env }))
      .split('\n').filter(Boolean);
    const ref = assertSubsetOrRefuse(staged, args.allowList);
    if (ref !== null) {
      await this.runGit(['reset', 'HEAD', '--'], { env }); // limpia tmp index
      return { commitCreated: false, headMoved: false, refusal: ref };
    }
    const tree = (await this.runGitOut(['write-tree'], { env })).trim();
    const head = (await this.runGitOut(['commit-tree', tree, '-p', 'HEAD', '-m', args.message], { env })).trim();
    await this.runGit(['update-ref', `refs/heads/${args.branch}`, head]);
    return {
      commitCreated: true,
      headBefore: await this.realHEAD(),
      headAfter: head,
      tree,
      trace: { ... }
    };
  });
}
```

### 2. Lock granularity

- Una sola entrada por `(repoRoot, 'index-lock')` cubre todos los
  `commitWithGuard` paralelos sobre el mismo working tree.
- El mutex **no** impide que dos agentes en worktrees distintos
  (`agent/<name>`) operen en paralelo: cada worktree tiene su
  propio `.git/index` real (escrito por git cuando crea el
  worktree) y, por tanto, su propio lock implícito.
- Clave derivada: `sha256(repoRoot + branch)`. Si dos agentes
  apuntan a `develop` desde worktrees distintos sobre el mismo
  repoRoot, comparten lock porque el merge se hace contra la
  misma rama.

### 3. Limpieza de tmp

- `tmpDir` se elimina con `rimraf` en `finally`, también dentro
  del mutex, para evitar fugas de archivos `/tmp`.
- Lint nuevo: el directorio `.mcp-vertex/index-lock` debe
  aparecer en `.gitignore` (chore menor, parte de S3).

### 4. Compatibilidad con `f00182`

`CommitPolicyEngine` cambia **una** línea:

```ts
- const r = await this.commitAndPush({ files: event.files.paths, ... });
+ const r = await this.commitWithGuard({ allowList: event.files.paths, branch: this.currentBranch(), ... });
```

`commitAndPush` queda como wrapper deprecated durante una ventana
de releases; eliminado en la versión siguiente a la release que
cierre AUD-CP-005.

## Slices

### S1 — `commitWithGuard` con `GIT_INDEX_FILE` aislado

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/services/commit-driver.ts` — `commitWithGuard`.
  - `plugins/commit-policy/src/lib/services/commit-driver.spec.ts` — tabla: subset ok, subset fail, files vacío, files vacío skipStageExplicit, branch inválida, lock contention.
  - `.gitignore` — añade `.mcp-vertex/`.
- **Gate**: type + concurrency (test que lanza 8 slices paralelos sobre mismo repo).
- **Depends on**: `x00263`, `x00264`, `x00269`, `f00182`
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: commitWithGuard usa GIT_INDEX_FILE temporal con mkdtemp, ejecuta read-tree -> add -> write-tree -> commit-tree -> update-ref bajo withFileMutex en .mcp-vertex/index-lock, preserva .git/index real en la preparacion y deja la via de indice compartido solo como fallback cuando faltan workspaceRoot o branch. Focused vitest verde y typecheck del plugin verde. Hay cambios fuera del slice en el working tree, pero no bloquean esta aprobacion del comportamiento revisado.
### S2 — `engine.ts` adopta `commitWithGuard` y deprecación de `commitAndPush`

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/engine.ts`, `plugins/commit-policy/src/public/index.ts`.
- **Gate**: type
- **Depends on**: S1
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: el engine real enruta el commit por commitWithGuard en lib/engine.ts, la API pública expone commitWithGuard en public/index.ts y no hay reexport vigente de commitAndPush ni consumidores rotos detectados. Validaciones enfocadas verdes: plugins/commit-policy bun run typecheck y engine.spec.ts 16/16.
### S3 — Limpieza de tmp + lint de `.mcp-vertex/`

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`, `.gitignore`, `tools/scripts/lint/ephemeral-paths.script.ts`.
- **Gate**: lint
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente del checkout actual: commit-driver limpia el tmp del indice aislado en el finally interno al callback de withFileMutex; el lint solo exime el patron acotado de commit-policy con mkdtemp+GIT_INDEX_FILE+index-lock+rm(tmpDir); lint:ephemeral, typecheck del plugin y spec focalizada del commit driver pasan sin regresiones locales.
## acceptance

- `t00022` corre con `--git-isolation=index-file`: 8 slices
  paralelos sobre mismo repo, cada uno stagea archivos que no
  se solapan, todos commitean sin contamination y HEAD final
  tiene 8 commits válidos en orden causal.
- Misma suite con `--git-isolation=disabled` (modo legacy,
  para comparar) **debe fallar** a partir de 2 slices paralelos
  si comparten `event.files.paths[0]`. Esto prueba que el
  aislamiento resuelve un bug real y no solo satisface la
  propiedad.
- `commitWithGuard` no contiene `git commit` directo (verify con
  grep + lint).
- `withFileMutex` mantiene latencia media < 50 ms en CI; ningún
  timeout test triggers.
- `bun run validate` verde; `lint:capabilities-declared` ya
  cubre la capability `filesystem.write` que este helper usa.
- `commitAndPush` queda deprecado con warning, eliminado en la
  siguiente minor release.
