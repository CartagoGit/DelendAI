---
id: c00138
title: "Affected CI: grafo de dependencias + filtro"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 script affected + workflow + tests
    section: "Track G / c00138"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00139 # tier 1/2/3 jobs (consume el filtro affected)
    - x00268 # pack smoke (corre en el set afectado)
    - v00126 # verify CI local repro (consume affected)
---

# c00138 — Affected CI: grafo de dependencias + filtro

## Goal

Hacer que el pipeline de CI ejecute **solo los jobs de los paquetes
afectados** (transitivamente) por el diff de un PR o push, en lugar
de correr la matriz completa siempre. Esto reduce el tiempo de
feedback de CI en PRs pequeños y evita falsos negativos por
"todo se ejecuta en un PR cualquiera".

### Comportamiento actual

- GitHub Actions corre workflows completos en cada push (full
  matrix).
- No hay filtro por paquete modificado.
- En PRs que tocan un solo plugin, se ejecutan tests de los 50+
  paquetes.
- La auditoría externa (§30, §49) señala esto como falta de
  eficiencia y como posible causa de falsos positivos.

### Comportamiento deseado

- `tools/scripts/ci/affected.script.ts`:
  - Lee `git diff --name-only <base>..<head>`.
  - Carga el grafo de dependencias (de `package.json#workspaces`,
    `tsconfig.base.json#references`, manifests de plugins).
  - Calcula el conjunto **transitivo** de paquetes afectados
    (ascendente: si cambia `core/public`, afecta a todos los
    plugins; descendente: si cambia un manifest de plugin, afecta
    a `apps/web` que lo consume).
  - Emite:
    - JSON con la lista afectada (`build/ci/affected.json`).
    - Variable de entorno / archivo `.affected-set` para que los
      workflows la consuman.
- `.github/workflows/affected.yml`:
  - Llama al script y filtra jobs con la matrix basada en la
    lista.
- `--base all` (modo nightly): corre toda la matriz.

## why

- Reduce feedback loop en PRs pequeños (objetivo: < 2 min para un
  cambio en un solo plugin).
- Habilita los tier jobs de `c00139` (tier 1 corre solo lo
  afectado).
- Cumple R5.3: lints/scripts viven bajo `tools/scripts/...` y son
  ejecutados por `bun run validate`.
- Reduce el ruido en PRs (menos failures por paquetes no tocados).

## non-goals

- No cambia el comportamiento del test runner (Vitest sigue
  igual); solo decide qué paquetes testear.
- No implementa cache distribuido (eso es scope futuro).
- No cambia `bunfig.toml` ni `vitest.config.ts`.
- No crea un nuevo job "all" — se usa el existente con
  `affected=false`.

## architecture

### 1. Grafo de dependencias

- Input:
  - `package.json#workspaces` (top-level) para paquetes npm.
  - `tsconfig.base.json#references` para project references TS.
  - `plugins/*/plugin.json#dependsOn` (si existe) para plugins.
  - `apps/web/src/data/pages/...` para páginas que referencian
    plugins por id.
- Output: `Map<PackageName, Set<PackageName>>` (forward) y el
  reverse.

### 2. Algoritmo de affected

```ts
function affected(diffFiles, graph): Set<PackageName> {
  const direct = diffFiles.map(f => fileToPackage(f));
  const transitive = new Set(direct);
  let added = true;
  while (added) {
    added = false;
    for (const p of [...transitive]) {
      for (const dep of graph.reverse.get(p) ?? []) {
        if (!transitive.has(dep)) { transitive.add(dep); added = true; }
      }
    }
  }
  return transitive;
}
```

### 3. Integración con GitHub Actions

- Job `detect-affected`:
  - Step: `bun tools/scripts/ci/affected.script.ts --base ${{ github.event.pull_request.base.sha || github.event.before }} --head ${{ github.sha }} > build/ci/affected.json`.
  - Output: matriz filtrada.
- Otros jobs consumen `affected.json` y filtran su matrix.

### 4. Tests

- `tools/scripts/ci/affected.spec.ts`:
  - Cambios en `packages/core/src/public/index.ts` afectan a
    todos los plugins.
  - Cambios en un solo plugin afectan solo a ese plugin + sus
    consumidores directos.
  - `--base all` ignora el diff y devuelve todos.

## Slices

### S1 — Script affected + workflow + tests

- **Status**: done
- **Files**: `tools/scripts/ci/affected.script.ts`, `tools/scripts/ci/affected.spec.ts`, `.github/workflows/affected.yml`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: affected.script.spec + affected-vitest-project-map.spec 6/6 verde; computeAffected cubre el caso de cambio en un plugin; workflow affected.yml existe. Contrato del slice cumplido.
## acceptance

- Script ejecutable, output JSON estable.
- Grafo de dependencias completo.
- Workflow de GitHub Actions filtra jobs.
- Tests verdes.
- Cambio en un plugin individual → PR < 2 min de feedback
  (medición documentada).
