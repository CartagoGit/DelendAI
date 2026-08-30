---
id: x00263
title: "AUD-CP-005 — `sliceScoping=true` debe stagear exactamente los archivos del slice"
kind: fix
status: done
shipped-in:
    - d0b2ab17
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00263"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-005
related:
    - q00006
    - t00018 # cross-agent safe staging (acepta esta corrección)
    - x00260 # slice listener entrega files (dependencia dura)
    - f00182 # engine central
---

# x00263 — AUD-CP-005: `sliceScoping=true` debe stagear exactamente los archivos del slice

## Goal

Cuando el slice listener emite el evento de cierre con `files: []`,
el driver git actual lo interpreta como `skipAdd: true` y commitea
lo que haya staged — incluyendo el trabajo de **otros agentes**.
Este bug está detrás de la contaminación cross-agent detectada en
la auditoría externa.

Tras la corrección:

1. El listener emite el evento **siempre** con
   `files: SliceFiles` no vacíos cuando el slice tiene archivos
   declarados.
2. El driver stagea **solo** esa lista, llamando `git add -- <paths>`
   con paths absolutos resueltos al root del repo.
3. Si la lista está vacía, **fallo tipado**:
   `SLICE_HAS_NO_FILES` o `SKIP_STAGE_EXPLICIT` (configurable, nunca
   default).
4. Verificación post-stage: `git diff --cached --name-only` ⊆
   `files` (test exacto).

### Comportamiento actual (BUG)

```
slice done, files: []
  → driver: skipAdd = true
  → git commit -m "..." (lo que esté staged entra)
  → entra trabajo de OTRO agente
```

### Comportamiento deseado

```
slice done, files: ['a.ts', 'b.ts']
  → driver: git add -- a.ts b.ts
  → git commit -m "..." (solo lo del slice)
  → git diff --cached --name-only === ['a.ts', 'b.ts']

slice done, files: []
  → refusal SLICE_HAS_NO_FILES
  → o SKIP_STAGE_EXPLICIT si el operador lo activó por CLI/flag
```

## Why

- Cross-agent contamination es el hallazgo más serio del track B:
  el commit de un agente mete cambios de otro agente sin advertencia.
- La regla "load only required capabilities" del repo exige que el
  slice stagee solo lo que le toca.
- Pieza base para `t00018`: el test adversarial cross-agent no puede
  pasar si el driver acepta `files: []`.
- Aceptar `files: []` como "skipAdd" es un comportamiento por
  defecto silencioso, contrario a "fail-closed on uncertainty".

## Non-goals

- No aceptar `files: []` como "skipAdd" implícito.
- No añadir heurísticas para inferir archivos del slice desde el
  filesystem; el listener emite `files` exactos.
- No cambiar la lógica de selección de slice (eso es `x00262`).

## Architecture

### 1. Emisión tipada del evento

```ts
// plugins/commit-policy/src/lib/triggers/slice-listener.ts
export interface SliceFiles { paths: string[]; } // nunca vacíos accidentalmente
export interface SliceDoneEvent {
  kind: 'slice';
  proposalId: string;
  sliceId: string;
  files: SliceFiles;
  eventId: string;
}
```

Si el slice del snapshot no declara archivos → el listener emite
`SLICE_HAS_NO_FILES` y NO entrega el evento al engine.

### 2. Driver git estricto

```ts
// plugins/commit-policy/src/lib/services/commit-driver.ts
async stageSlice(event: SliceDoneEvent) {
  if (event.files.paths.length === 0) {
    if (this.options.skipStageEmpty) return { ack: 'SKIP' };
    throw new Refusal('SLICE_HAS_NO_FILES');
  }
  const repoRoot = await this.repoRoot();
  const relative = event.files.paths.map(p => path.relative(repoRoot, p));
  await this.runGit(['add', '--', ...relative]);
  const staged = await this.gitStdout(['diff', '--cached', '--name-only']);
  this.assertSubset(staged.split('\n').filter(Boolean), relative);
  // …
}
```

`assertSubset` falla si hay staged extras (cross-agent contamination).

### 3. Verificación post-stage (defensa en profundidad)

`git diff --cached --name-only` debe ser ⊆ `files.paths`. Si hay
extras → `refusal('CROSS_AGENT_CONTAMINATION', { extras })`.

### 4. Modo `skipStageExplicit`

Configurable vía flag del tool u opción del plugin. Si activo y
`files: []` → emite `SKIP` (continúa sin stagear, decisión humana).
Si inactivo (default) → refusal.

## Slices

- global_gate: lint

### S1 — Driver stagea únicamente `files.paths` y verifica post-stage

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`
- **Gate**: type
- **Dependency**: `x00260`
- acceptance:
  - "slice con 3 archivos → driver stagea exactamente esos 3"
  - "staged ajenos preexistentes → no entran (assertSubset falla)"
  - "slice sin archivos → refusal SLICE_HAS_NO_FILES"
  - "dos agentes dirty simultáneos → cada uno stagea solo los suyos"
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Aprobacion independiente sobre el working tree actual encima de HEAD 6ff19f8d; el commit hash se adjunta solo como referencia del checkout porque la evidencia validada no proviene de un commit del slice. Verifique que commit-driver stagea exactamente sliceContext.files cuando sliceScoping=true, rechaza SLICE_HAS_NO_FILES y detecta CROSS_AGENT_CONTAMINATION mediante el subset check del index cacheado; tambien verifique que slice-listener rehusa slices done sin files. Gates ejecutados en este checkout: vitest enfocado verde y typecheck del plugin verde. No observe cambios fuera del slice que bloqueen esta aprobacion.
## acceptance

- `t00018` (cross-agent safe) verde.
- `git diff --cached --name-only ⊆ files.paths` siempre cierto.
- Cero contaminación cross-agent detectable.
- `bun run lint` verde; `tsc --noEmit` verde.
- Breaking para clientes que dependían de `skipAdd` implícito:
  release notes claras, gate deprecation window.
