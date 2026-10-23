---
id: x00269
title: "AUD-CP-005.fix — Cross-agent contamination: validate staged subset BEFORE `git commit`; never move HEAD on refusal"
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
    - x00263 # sliceScoping stagea archivos exactos del slice (acepta esta corrección)
    - x00264 # threshold medir y stagear mismo conjunto dirty
    - f00182 # CommitPolicyEngine orquestador central (debe aplicar el orden aquí)
    - t00018 # slice event staging cross-agent safe (happy path; esta hija cierra el unhappy path)
    - t00022 # E2E real Git HEAD unchanged on contamination (define el caso de aceptación)
    - t00023 # invariante stage→validate→commit (define el contrato estructural)
---

# x00269 — AUD-CP-005.fix: validar staged subset antes del commit; el refusal nunca mueve HEAD

## Goal

Cerrar el delta concreto que la revisión externa (ChatGPT 5.6 Sol,
cuarta pasada) identificó sobre la corrección de `x00263`:

> "El problema es el orden. `commitAndPush()` hace literalmente
> `git add ↓ git commit ↓ get HEAD hash ↓ return committed=true`
> y **solo después** comprueba si había contaminación. Pero el
> commit ya existe."

Garantizar —dentro de `CommitPolicyEngine` (`f00182`) y de los
drivers de `x00263`/`x00264`— que:

1. La inspección del staged set ocurre **después** de `git add` y
   **antes** de `git commit`; nunca después de crear el commit.
2. Si la inspección falla con `CROSS_AGENT_CONTAMINATION` o
   `SLICE_HAS_NO_FILES`, el flujo devuelve un `refusal` con
   `headMoved: false`, `commitCreated: false`. **HEAD no cambia.**
3. El motor expone `CommitTrace { commitCreated, headBefore,
   headAfter, stagedSetAtPreCommit }` para que
   `t00022`/`t00023` puedan asertar el invariante.
4. La regla aplica también a `x00264` (threshold) y a `f00182`
   (engine) para que ningún otro path del plugin pueda saltarse el
   orden.

### Comportamiento actual (BUG recurrente)

```
slice done, files = ['a.ts']
  driver: git add -- a.ts
  driver: assertSubset(staged, ['a.ts'])   # subset ok → no contamination
  driver: git commit -m "..."               # ⚠ auditada pero no bloqueada
  driver: devueleve { committed: true }     # ⚠ OK accidental
```

Si `files = []` y `skipAdd` sigue existiendo, o si un commit
sucede sin haber llamado al subset-check, el commit entra antes
de cualquier diagnóstico.

### Comportamiento deseado

```
slice done, files = ['a.ts']
  driver: git add -- a.ts
  driver: assertSubset(staged, ['a.ts'])
  if !subset:
      return { refusal: 'CROSS_AGENT_CONTAMINATION', commitCreated: false, headMoved: false }
  driver: git commit -m "..."
  return { committed: true, commitCreated: true, headMoved: true, trace }
```

```
slice done, files = []
  if options.skipStageExplicit:
      return { ack: 'SKIP', commitCreated: false, headMoved: false }
  return { refusal: 'SLICE_HAS_NO_FILES', commitCreated: false, headMoved: false }
```

## Why

- AUD-CP-005 (Track B) es el hallazgo más serio del plan
  `q00006`; los fixes `x00263` y `x00264` cubren el "qué stage"
  pero no el "cuándo" respecto al commit.
- Sin esta invariante de orden, cualquier futuro helper
  (lazy-loading de plugins, engine paralelo, retry lógico) puede
  reintroducir el bug saltándose el subset-check.
- ChatGPT fue explícito: "un refusal posterior al commit no es
  suficiente. El test debe comprobar que HEAD no cambia y que no
  se crea ningún commit cuando existen staged files fuera del
  conjunto autorizado."
- Es precondición dura de `t00022` y `t00023`; sin este fix, los
  nuevos tests no tienen contrato que defender.

## Non-goals

- No modificar el contrato del evento `SliceDoneEvent` (`x00260`,
  `x00263`). Esta propuesta ataca el **driver**, no el listener.
- No añadir un nuevo event bus global (eso queda fuera del Track
  B; ya está marcado como Track U futuro en `x00260`).
- No cambiar `x00257`/`x00267` (force-with-lease / branch
  protection); esta hija es de staging → commit, no de push.
- No aceptar `files: []` como "skipAdd" implícito nunca (la
  regla sigue siendo la de `x00263`).

## Architecture

### 1. Helper único `commitWithGuard`

Toda ruta de código que termine en `git commit` debe pasar por:

```ts
// plugins/commit-policy/src/lib/services/commit-driver.ts
async commitWithGuard(args: {
  allowList: readonly string[]; // event.files.paths o dirty set
  message: string;
  options: DriverOptions;
}): Promise<
  | { commitCreated: true; headBefore: string; headAfter: string; trace: CommitTrace }
  | { commitCreated: false; headMoved: false; refusal: Refusal }
> {
  const headBefore = await this.gitStdout(['rev-parse', 'HEAD']);
  if (args.allowList.length === 0 && !args.options.skipStageExplicit) {
    return { commitCreated: false, headMoved: false, refusal: { code: 'SLICE_HAS_NO_FILES', extras: [] } };
  }
  await this.runGit(['add', '--', ...args.allowList]);
  const staged = (await this.gitStdout(['diff', '--cached', '--name-only']))
    .split('\n').filter(Boolean);
  const ref = assertSubsetOrRefuse(staged, args.allowList);
  if (ref !== null) {
    await this.runGit(['reset', 'HEAD', '--']); // limpia el stage antes de devolver
    return { commitCreated: false, headMoved: false, refusal: ref };
  }
  await this.runGit(['commit', '-m', args.message]);
  const headAfter = await this.gitStdout(['rev-parse', 'HEAD']);
  return {
    commitCreated: true,
    headBefore,
    headAfter,
    trace: { commitCreated: true, headBefore, headAfter, stagedSetAtPreCommit: staged },
  };
}
```

### 2. `commitAndPush` ahora compone `commitWithGuard`

```ts
const guarded = await this.commitWithGuard({ allowList, message, options });
if (!guarded.commitCreated) {
  return { committed: false, refusal: guarded.refusal, trace: guarded };
}
const push = await this.pushIfPolicy(...);
return { committed: true, commitCreated: true, headBefore: guarded.headBefore, headAfter: guarded.headAfter, trace: { ...guarded.trace, push } };
```

`commitAndPush` ya no se llama a sí mismo para hacer
`commit; check; if (refusal) return`. La única ruta válida pasa
por `commitWithGuard`.

### 3. `CommitPolicyEngine` (`f00182`) elimina la rama tardía

```ts
// antes
await commitAndPush(...);
if (cachedNames.containsForeign(...)) return refusal('CROSS_AGENT_CONTAMINATION');

// después
const result = await commitWithGuard({ allowList: event.files.paths, ... });
return result; // no hay rama "post-commit"
```

### 4. Reset defensivo tras subset-fail

Cuando `assertSubset` falla:

1. `git reset HEAD --` (limpia el staged set).
2. `return refusal(CROSS_AGENT_CONTAMINATION, { commitCreated:
   false, headMoved: false })`.

El reset es seguro porque el working tree queda intacto y el
usuario / agente puede reintentar con `files` correctos. Esto
hace que `git diff --cached --name-only` post-refusal sea vacío,
lo que `t00022` aprovecha para asertar
`assertEmpty(stagedAfterRefusal)`.

## Slices

### S1 — `commitWithGuard` extraído y único

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/services/commit-driver.ts` — añade `commitWithGuard`, refactoriza `commitAndPush` para componerlo.
  - `plugins/commit-policy/src/lib/services/commit-driver.spec.ts` — table-driven: 6 casos (subset ok, subset fail, files vacío, files vacío con `skipStageExplicit`, contamination pre-stage, ref-tipo `libgit2`/`simple-git`).
- **Gate**: type + property-based
- **Depends on**: `x00263`, `x00264`, `f00182`
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: commitWithGuard es la unica ruta hacia gitCommit dentro del driver, el guard corre antes del commit, la refusal por contaminacion no crea commit ni mueve HEAD, y la traza observable queda expuesta en result.trace. Focused test commit-driver.spec 25/25 verde y typecheck del plugin verde. Hay cambios adyacentes fuera del slice en commit-policy, pero no bloquean esta aprobacion porque el contrato focalizado del slice queda cubierto por prueba y compilacion del plugin.
### S2 — `CommitPolicyEngine` adopta `commitWithGuard`

- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/services/engine.ts` — sustituye la rama post-commit por `commitWithGuard`.
  - `plugins/commit-policy/src/lib/services/engine.spec.ts` — actualiza los asserts a `result.commitCreated` / `result.headMoved`.
- **Gate**: type
- **Depends on**: S1
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: CommitPolicyEngine enruta el commit exclusivamente por commitWithGuard, propaga commitCreated/headMoved en respuestas, usa commitCreated para disparar push e idempotencia, y conserva BRANCH_PROTECTED. Diff relacionado acotado a engine/spec y al commit-driver dependiente del mismo flujo; sin bloqueadores externos para aprobar este slice.
### S3 — Reset defensivo y export de `CommitTrace`

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/public/index.ts`
- **Gate**: type
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: commitWithGuard limpia todo el stage con fallback seguro si falla el subset-check, desstagea solo los paths allowlist con fallback seguro si git commit falla tras stagear, y CommitTrace queda exportado desde la API publica. Validacion enfocada verde: commit-driver.spec 25/25 y typecheck del plugin ok. Hay cambios adyacentes en commit-policy fuera del slice, pero no bloquean esta aprobacion porque no invalidan el contrato focalizado ni la gate requerida.
## acceptance

- `t00022` (E2E real Git HEAD unchanged) verde: con staged
  `agent-a.ts` + `intruder.ts`, intento de commit por A → refusal
  + `headBefore === headAfter` + `commitCreated === false`.
- `t00023` (invariante stage→validate→commit) verde: el test
  spy/mockea `git commit` y `assertSubset`; el orden queda
  probadamente `add → subset → commit` aunque se reordene el
  cuerpo del driver.
- `commitWithGuard` es el único path que ejecuta `git commit` en
  `plugins/commit-policy/` (verificado por un lint ad-hoc
  `git commit` invocations must live in `commitWithGuard`).
- `assertSubset` falla → `git reset HEAD --` se ejecuta antes del
  return → `git diff --cached --name-only` queda vacío.
- `bun run validate` (incluido `lint:capabilities-declared`,
  `lint:commit-policy`, `lint:proposal-slice-completeness`,
  `lint:proposal-files-exist`) verde.
- `engine.spec.ts` deja de comparar `result.refusal === undefined`
  y pasa a exigir `result.commitCreated === false` cuando hay
  contaminación.
