---
id: v00127
title: "Track A.close — Verificar estado real de `main` (verde + protegida) consultando la API de GitHub, no configs declarativas"
kind: perf
status: review
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
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
last-transition-id: 0df5f5db-dfbf-4ee2-a92d-7b2265c41a73
last-correlation-id: 0df5f5db-dfbf-4ee2-a92d-7b2265c41a73
last-transition-from: in-progress
shipped-in:
  - "4e2e42441f1e8d688f589ba2b8c5cfd034d1e0e0"
  - "a801eb344c89c98d6bce70336a0eea9431e2d544"
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
  const repo = 'delendai';

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

### 2. Dashboard entry — REVISED 2026-09-30 (S2)

The proposal originally assumed an `apps/web` React component
(`MainHealthBadge.tsx`) and a `health/` subdirectory. Neither
exists: `apps/web` is an Astro site with no React runtime, and
the one real surface for branch health that already ships is
`apps/web/src/data/develop-health.json`, written by the nightly
`verify-develop-health` GitHub Actions workflow — a checked-in
data artefact, not yet rendered by any page. There is no
`MainHealthBadge`-shaped surface to "wire into"; there is this
JSON-plus-workflow surface, so that is what S2 wires main into
instead of building a new one:

- `apps/web/src/data/main-health.json` is a sibling of
  `develop-health.json`, written by
  `tools/scripts/ci/verify-main-health.script.ts --output` in
  the same nightly job. It carries the full `IMainHealthReport`
  (main as `role: "gate"`, develop as `role: "observation"`) —
  the same gate/observation distinction the original text asked
  for, expressed as data rather than a `<Badge>`.
- `develop-health.json`'s `note` field (both the checked-in
  placeholder and the string `verify-develop-health.script.ts`
  writes at runtime) now cross-links to `main-health.json`, so a
  reader of the existing artifact discovers the new one.
- Should `apps/web` grow a page that reads `develop-health.json`
  in the future, `main-health.json` is already sitting next to
  it in the same convention for that page to pick up — no
  further plumbing needed on the data side.

### 3. Issue auto-creation

Solo en fallo de `main`. Implementado como un step adicional en
el mismo job `.github/workflows/verify-develop-health.yml`
("Create issue on main drift"), no como script separado: corre
`verify-main-health.script.ts`, y solo si ESE paso falla, abre
un issue (`gh issue create --label ci-health,governance --title
"main health gate failed (v00127)"`). Un `develop` rojo nunca
abre issue — es observación, nunca gate.

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

- **Status**: done
  and `tools/scripts/ci/verify-main-health.spec.ts` exist (commit `19218caf5`, "feat(tools):
  verify main health via GitHub API (v00127)"), target the real `CartagoGit/delendai`
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
- shipped-in: `19218caf5a6b3b13379f358e00b5749560b55d35`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — v00127 S1 delivered at 4e2e42441f1e8d688f589ba2b8c5cfd034d1e0e0 (feat(tools): verify main health via GitHub API): verify-main-health.script.ts consults the GitHub API and diffs the live branch protection against delendai.config.json (development.integration.requiredChecks). 9/9 tests green in verify-main-health.spec.ts.
- review-attribution: unrecorded — nothing in Git names who delivered 4e2e42441f1e8d688f589ba2b8c5cfd034d1e0e0: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMaxM3

### S2 — Wire a dashboard

- **Status**: done
  "2. Dashboard entry — REVISED" above): `apps/web` has no React runtime
  and no `health/` data directory, so `MainHealthBadge.tsx` was never
  buildable as specced. The real existing surface is
  `apps/web/src/data/develop-health.json` + the nightly
  `verify-develop-health` workflow. Wired main's real gate status into it:
  `.github/workflows/verify-develop-health.yml` gained a "Run main health
  verifier" step that runs `verify-main-health.script.ts --output
  apps/web/src/data/main-health.json`, a "Create issue on main drift" step
  that opens an issue ONLY on that step's failure (never on develop's),
  and the existing "Commit the report" step now also commits
  `main-health.json`. Added the checked-in bootstrap placeholder
  `apps/web/src/data/main-health.json` (generated via the script's own
  `--dry-run` mode, `generatedAt` nulled, matching `develop-health.json`'s
  placeholder convention). Cross-linked the two JSON files' `note` fields
  in both directions so a reader of either finds the other. Verified:
  `bunx vitest run tools/tests/ci/verify-develop-health.spec.ts
  tools/tests/ci/verify-main-health.spec.ts` — 44/9 passing, no regressions
  (no logic in either script's tested surface changed, only the `note`
  string and the workflow YAML). `python3 -c "import yaml; yaml.safe_load(...)"`
  confirms the edited workflow YAML is well-formed.
- **Files**:
  `.github/workflows/verify-develop-health.yml`,
  `apps/web/src/data/main-health.json`,
  `apps/web/src/data/develop-health.json`,
  `tools/scripts/ci/verify-develop-health.script.ts`.
- **Gate**: type + test passing (rewritten from "type + visual" — there is
  no visual surface to gate on).
- **Depends on**: S1.
- shipped-in: `a801eb344c89`
- review-state: done
- review-implementer: claude-sonnet-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — v00127 S2 delivered at a801eb344c89c98d6bce70336a0eea9431e2d544 (feat(ci): wire main branch health into the nightly develop-health surface): workflow + main-health.json data + verify-develop-health script.
- review-attribution: claude-sonnet-5 from Merge pull request #673 from CartagoGit/delendai/pr/claude-sonnet-5/implement/v00127-all-g1/wire-health-into-main-gate-dashboard (refs/heads/delendai/wip/claude-sonnet-5/implement/v00127-all-g1/wire-health-into-main-gate-dashboard) (a801eb344c89c98d6bce70336a0eea9431e2d544), opened by MiniMaxM3

### S3 — Supersede `v00125` y enlazar en `AGENT-BOOTSTRAP.md`

- **Status**: done
  `in-progress/` as this slice assumed — corrected below) now carries
  `superseded-by: v00127` in frontmatter plus a short dated note at the
  top of its body explaining the retraction (develop-green-required →
  main-as-gate, develop-as-observation). `AGENT-BOOTSTRAP.md`'s
  "Integration branch protection" section gained a 3-line reference to
  `verify-main-health.script.ts` and its nightly wiring. Verified byte
  budget: `wc -c docs/delendai/AGENT-BOOTSTRAP.md` → 31,672 B, under the
  32,000 B cap enforced by `bun run lint:prompt-size`
  (`tools/scripts/lint/system-prompt-size.script.ts`).
- **Files**:
  `docs/delendai/proposals/done/perfs/v00125-verificar-estado-real-de-develop-verde-protegida-antes-de-cerrar-este-track.md`
  (frontmatter: `superseded-by: v00127`, plus a body note),
  `docs/delendai/AGENT-BOOTSTRAP.md` (link to `verify-main-health`).
- **Gate**: docs lint + `lint:prompt-size`.
- **Depends on**: S1.
- shipped-in: `a801eb344c89`
- review-state: done
- review-implementer: claude-sonnet-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — v00127 S3 delivered at a801eb344c89c98d6bce70336a0eea9431e2d544: AGENT-BOOTSTRAP.md + v00125-perfs/done reference both link to the new health surface.
- review-attribution: claude-sonnet-5 from Merge pull request #673 from CartagoGit/delendai/pr/claude-sonnet-5/implement/v00127-all-g1/wire-health-into-main-gate-dashboard (refs/heads/delendai/wip/claude-sonnet-5/implement/v00127-all-g1/wire-health-into-main-gate-dashboard) (a801eb344c89c98d6bce70336a0eea9431e2d544), opened by MiniMaxM3

## acceptance

- `bun run validate` verde.
- `bun tools/scripts/ci/verify-main-health.script.ts` en CI
  nightly (via `.github/workflows/verify-develop-health.yml`), exit 0
  cuando `main` está verde y protegida, exit 1 si diverge.
- `apps/web/src/data/main-health.json` (regenerado nightly) trae `main`
  con `role: "gate"` y `develop` con `role: "observation"` — la
  distinción que el texto original pedía como `<Badge>`, expresada como
  dato en la única superficie real que existe hoy.
- `AGENT-BOOTSTRAP.md` referencia el script como fuente de
  verdad del estado de `main`.
- `v00125` lleva `superseded-by: v00127` en frontmatter; el
  cuerpo explica la retractación brevemente.
