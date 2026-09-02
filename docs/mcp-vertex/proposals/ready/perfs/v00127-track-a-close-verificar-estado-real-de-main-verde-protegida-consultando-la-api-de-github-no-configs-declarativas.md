---
id: v00127
title: "Track A.close — Verificar estado real de `main` (verde + protegida) consultando la API de GitHub, no configs declarativas"
kind: perf
status: ready
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / v00125 (override por retractación del reviewer)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (rectificación)
related:
    - q00006
    - v00125 # verifica develop verde + protegida (irrelevante tras retractación, supersede-by: v00127)
    - c00130 # branch protection YAML (predecesor lejano)
    - c00132 # quality gate pre-merge (predecesor)
    - c00133 # drift CI gate (predecesor)
    - c00144 # protection YAML bifurcada (predecesor duro — debe estar aplicado a main)
    - c00145 # protectedBranches default main-only (predecesor — el plugin debe coincidir con main)
    - x00272 # bloquea push directo a main (predecesor — driver de la invariante a verificar)
---

# v00127 — Track A.close: verificar `main` verde y protegida en GitHub (API real)

## Goal

Reemplazar `v00125` (que verificaba que `develop` estuviese
"verde + protegida" — un requisito que la retractación del
reviewer eliminó) por una verificación equivalente para `main`:

```
Estado a verificar:
  - main está REALLY verde: el último CI run sobre el último
    commit de main pasó (quality-gate + tests + tokens +
    governance + security)
  - main está REALLY protegida en GitHub:
      required_status_checks.strict === true
      required_status_checks.contexts ⊇ { quality-gate, tests,
        tokens, governance, security }
      enforce_admins === true
      required_linear_history === true
      allow_force_pushes === false
      allow_deletions === false
  - develop solo como observación (no como gate)
```

La verificación **consume la API de GitHub**, no infiere el
estado desde configs declarativas. Esta es la fuente única de
verdad que el reviewer externo echó en falta para considerar
cerrado `AUD-P0-001`.

> "Lo que sí conservaría es una protección lógica distinta:
> evitar que una automatización haga accidentalmente algo
> destructivo que no pretendías."

Garantizar:

1. Script `tools/scripts/ci/verify-main-health.script.ts`
   que devuelve:
   - Estado del último commit en `main` (`SHA`, CI run id,
     conclusion).
   - Lista de required status checks reales.
   - JSON de la policy de protection real (de GitHub API).
   - Diff entre la policy real y la declarativa
     (`.github/branch-protection.yml` con la bifurcación de
     `c00144`).
   - `develop`: solo se lee como dato secundario (protección
     y estado CI) pero no se exige gate.
   - `exit 0` si `main` cumple; `exit 1` con detalle si no.
2. Entry en el dashboard (`apps/web/src/data/...`) que muestre
   el último estado verificado de `main` y `develop` (con
   etiqueta que distinga gate vs observación).
3. CI nightly invoca el script; failure → issue automático solo
   si `main` falla (no si `develop` falla).
4. Se enlaza desde `AGENT-BOOTSTRAP.md` como fuente de verdad
   del estado de la rama publicable.

### Comportamiento actual

`v00125` verifica que `develop` esté "verde + protegida". Pero
la retractación dice que `develop` no es la rama que debe
garantizar release-readiness. `v00125` se queda como
**superseded-by: v00127** para no duplicar trabajo.

### Comportamiento deseado

```ts
// tools/scripts/ci/verify-main-health.script.ts
import { fetchJson, diffPolicies } from './lib/verify-branch-protection';
import { fetchCiRuns } from './lib/verify-ci-run';

const STRICT_BRANCH = 'main';
const OBSERVED_BRANCH = 'develop';

async function main() {
  const owner = 'CartagoGit';
  const repo = 'mcp-vertex';

  // 1. CI run del último commit
  const mainCi = await fetchCiRuns(owner, repo, STRICT_BRANCH, 1);
  const mainGreen = mainCi.runs[0]?.conclusion === 'success';

  // 2. Protection real
  const mainProtected = await fetchProtected(owner, repo, STRICT_BRANCH);
  const declared = parseDeclaredYAML('.github/branch-protection.yml');
  const diff = diffPolicies(mainProtected, declared[STRICT_BRANCH]);

  // 3. develop solo como observación
  const developCi = await fetchCiRuns(owner, repo, OBSERVED_BRANCH, 1);

  const result = {
    main: {
      sha: mainCi.runs[0]?.sha,
      conclusion: mainCi.runs[0]?.conclusion,
      protected: mainProtected.enabled,
      diff,
    },
    develop: {
      observed: true,
      conclusion: developCi.runs[0]?.conclusion,
    },
  };

  const exit = mainGreen && diff.length === 0 ? 0 : 1;
  console.log(JSON.stringify(result, null, 2));
  process.exit(exit);
}
```

## Why

- Es el "último gate" honesto del Track A en el nuevo modelo de
  workflow: si `main` no está realmente protegida y realmente
  verde, no se puede mergear a release.
- Da una fuente única de verdad sobre el estado de `main`
  consumible por humanos y por agentes.
- Permite que futuros tracks asuman como precondición
  "`main` está verde y protegida".
- Requisito explícito de la auditoría externa original:
  "AUD-P0-001 — Hacer verde develop, proteger develop en GitHub"
  reinterpretado a `main` por la retractación.

## Non-goals

- No almacena credenciales de GitHub en el repo.
- No replica la matriz CI completa; solo el último run de `main`.
- No aplica la policy; solo la lee.
- No envía telemetría (R1.9).
- No alerta de la salud de `develop` (eso es
  `c00133`/`project-health`).

## Architecture

### 1. Lógica de verificación

Como arriba. El script separa **`main` (gate)** de
**`develop` (observación)** en el JSON resultante.

### 2. Dashboard entry

`apps/web/src/data/health/main.json` se regenera en cada
ejecución exitosa del script, con el snapshot más reciente.
`apps/web/src/data/health/develop.json` se regenera idéntico,
pero el componente React que lo muestra lleva una etiqueta
`<Badge>observación</Badge>` en lugar de `<Badge>gate</Badge>`.

### 3. Issue auto-creation

Solo en fallo de `main`. Hook en
`tools/scripts/ci/post-verify-main-health-failure.script.ts`
usa `gh issue create --label governance --title "main health
gate failed"`.

### 4. Tests / specs

- `tools/scripts/ci/verify-main-health.spec.ts`:
  - Fixtures: `main` verde + protection declarada coincide →
    exit 0.
  - `main` con CI fallo → exit 1.
  - `main` con protection divergente (faltan required checks)
    → exit 1 con diff legible.
  - `develop` rojo pero `main` verde → exit 0 (no es gate).

## Slices

### S1 — `verify-main-health.script.ts` + bifuración

- **Status**: done — verified 2026-09-02: `tools/scripts/ci/verify-main-health.script.ts`
  and `tools/scripts/ci/verify-main-health.spec.ts` exist (commit `19218caf5`, "feat(tools):
  verify main health via GitHub API (v00127)"), target the real `CartagoGit/mcp-vertex`
  repository, and `bunx vitest run tools/scripts/ci/verify-main-health.spec.ts` passes 9/9.
  S2 (dashboard entry) and S3 (supersede `v00125` + `AGENT-BOOTSTRAP.md` link) remain
  unimplemented — no `apps/web/src/data/health/`, no `MainHealthBadge`, no nightly CI wiring,
  no `superseded-by` frontmatter on `v00125`, no bootstrap reference. This is real
  remaining feature/doc work, not yet built.
- **Files**:
  `tools/scripts/ci/verify-main-health.script.ts`,
  `tools/scripts/ci/verify-main-health.spec.ts`.
- **Gate**: type + test passing
- **Depends on**: `c00144`, `c00132`, `c00133`.

### S2 — Wire a dashboard

- **Status**: pending
- **Files**: `apps/web/src/data/health/main.json` (generado),
  `apps/web/src/components/MainHealthBadge.tsx`,
  `apps/web/src/components/MainHealthBadge.spec.tsx`.
- **Gate**: type + visual
- **Depends on**: S1.

### S3 — Supersede `v00125` y enlazar en `AGENT-BOOTSTRAP.md`

- **Status**: pending
- **Files**:
  `docs/mcp-vertex/proposals/in-progress/v00125-verificar-estado-real-develop-verde-protegida.md`
  (frontmatter: `superseded-by: v00127`),
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (enlace a
  `verify-main-health`).
- **Gate**: docs lint
- **Depends on**: S1.

## acceptance

- `bun run validate` verde.
- `bun tools/scripts/ci/verify-main-health.script.ts` en CI
  nightly, exit 0 cuando `main` está verde y protegida,
  exit 1 si diverge.
- Dashboard `apps/web` muestra `main` con badge `gate` y
  `develop` con badge `observación`.
- `AGENT-BOOTSTRAP.md` referencia el script como fuente de
  verdad del estado de `main`.
- `v00125` lleva `superseded-by: v00127` en frontmatter; el
  cuerpo explica la retractación brevemente.
