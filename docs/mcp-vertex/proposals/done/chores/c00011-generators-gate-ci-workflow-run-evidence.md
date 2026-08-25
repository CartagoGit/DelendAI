---
id: c00011
title: "CI — generators gate + workflow run evidence en cada proposal (CI2-003 + CI2-005)"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
priority: P2
classification: MEJORA / CI
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§19 CI2-003 + CI2-005"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00010 # branch policy (predecesor)
    - f00175 # generators
    - i00008 # manifest vs package.json
    - i00009 # manifest vs preset catalog
shipped-in:
  - e1ee275a # ci(track-g): harden develop checks and proposal evidence gate
---

# i00011 — CI: generators gate + workflow run evidence

## Goal

Dos problemas relacionados:

1. **CI2-003**: los generadores (manifests, web catalog, docs, permissions, token dashboard) deben fallar CI si quedan desincronizados. `i00006` ya cubre el dashboard; falta el resto.

2. **CI2-005**: una proposal que se mueve a `review` debería guardar evidencia de los gates ejecutados. Hoy, el campo `closed-evidence` puede ser solo "comandos locales" sin confirmación CI.

Reglas violadas: §19 CI2-003 + CI2-005.


Generadores actuales:

- `i00006`: `tokens:dashboard:check`.
- `f00175`: `check:generated` (registry + web + docs + permissions).

Workflow run evidence:

- Hoy, las proposals pueden transicionar a `review`/`done` sin documentar qué gates corrieron.


`MEJORA / CI`.

## Why

- Generators desincronizados se detectan automáticamente.
- Proposals tienen evidencia verificable de CI.


Cero.


Cero.

## Non-goals

**Permitido**:

- `tools/scripts/lint/check-generated-artifacts.script.ts` (unifica checks).
- `.github/workflows/ci.yml` (job `generated-artifacts-check`).
- `tools/scripts/proposals/collect-evidence.script.ts` (nuevo).
- `plugins/proposals/src/lib/proposals/transition.service.ts` (validación de evidence).
- Documentación.

**No permitido**:

- Cambios en plugins.


- Token dashboard check (`i00006`, ya implementado).
- Branch policy (`i00010`).

## Architecture

### 1. Generators gate unificado

```ts
// tools/scripts/lint/check-generated-artifacts.script.ts
import { execSync } from 'node:child_process';

const generators = [
  {
    name: 'FIRST_PARTY_PLUGIN_INDEX',
    generate: 'bun run generate:first-party-index',
    check: 'git diff --exit-code plugins/proposals/src/lib/first-party-plugin-index.generated.ts',
  },
  {
    name: 'WEB_CATALOG',
    generate: 'bun run generate:web-catalog',
    check: 'git diff --exit-code apps/web/src/data/plugins/catalog.generated.ts',
  },
  {
    name: 'PLUGIN_DOCS',
    generate: 'bun run generate:plugin-docs',
    check: 'git diff --exit-code docs/mcp-vertex/plugins/auto-generated/',
  },
  {
    name: 'PERMISSION_MATRIX',
    generate: 'bun run generate:permission-matrix',
    check: 'git diff --exit-code docs/mcp-vertex/security/permission-matrix.md',
  },
  {
    name: 'TOKEN_DASHBOARD',
    generate: 'bun run generate:token-dashboard',
    check: 'git diff --exit-code docs/mcp-vertex/tokens/TOKEN-BUDGETS.md',
  },
];

const failures: string[] = [];

for (const gen of generators) {
  console.log(`Checking ${gen.name}...`);
  try {
    execSync(gen.check, { stdio: 'inherit' });
  } catch (err) {
    failures.push(`${gen.name}: drift detected. Run \`${gen.generate}\` and commit.`);
  }
}

if (failures.length > 0) {
  console.error('');
  console.error('Generated artifacts drift:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('All generated artifacts in sync.');
```

### 2. CI integration

```yaml
# .github/workflows/ci.yml
generated-artifacts-check:
  name: Generated artifacts check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: bun install --frozen-lockfile
    - run: bun run check:generated
```

Añadir a la lista de required checks (`i00010`).

### 3. Workflow run evidence

```ts
// tools/scripts/proposals/collect-evidence.script.ts
import { execSync } from 'node:child_process';

interface IRunEvidence {
  proposalId: string;
  commit: string;
  gatesRun: Array<{
    name: string;
    status: 'success' | 'failure' | 'skipped';
    logUrl?: string;
    runId: string;
  }>;
  timestamp: string;
}

export async function collectProposalEvidence(proposalId: string): Promise<IRunEvidence> {
  const commit = execSync('git rev-parse HEAD').toString().trim();

  // Asumimos que el caller tiene acceso a GitHub Actions.
  const gatesRun: IRunEvidence['gatesRun'] = [];

  // Recolectar runs de GitHub Actions para el commit actual.
  // (Asume `gh` CLI configurada.)
  try {
    const runsJson = execSync(
      `gh run list --commit ${commit} --json name,conclusion,databaseId,htmlUrl --limit 50`,
      { encoding: 'utf8' },
    );
    const runs = JSON.parse(runsJson);
    for (const run of runs) {
      gatesRun.push({
        name: run.name,
        status: run.conclusion === 'success' ? 'success' : run.conclusion === 'failure' ? 'failure' : 'skipped',
        runId: run.databaseId,
        logUrl: run.htmlUrl,
      });
    }
  } catch (err) {
    // Si `gh` no está disponible, omitir (modo dev).
    console.warn('[collect-evidence] gh CLI not available; skipping CI evidence collection');
  }

  return {
    proposalId,
    commit,
    gatesRun,
    timestamp: new Date().toISOString(),
  };
}
```

### 4. Validación en transición a review/done

```ts
// plugins/proposals/src/lib/proposals/transition.service.ts (refactor)
export async function transitionToReview(proposalId: string, opts: { requireEvidence?: boolean }) {
  const proposal = await loadProposal(proposalId);

  // Si opts.requireEvidence es true (default en CI), verificar evidencia.
  if (opts.requireEvidence) {
    const evidence = await collectProposalEvidence(proposalId);
    if (!evidence.commit || evidence.gatesRun.length === 0) {
      throw new Error(
        `[proposal-transition] Cannot transition "${proposalId}" to review without CI evidence. ` +
        `Run \`bun run collect-evidence ${proposalId}\` and attach to proposal.`,
      );
    }

    // Adjuntar evidencia al proposal (en frontmatter).
    await attachEvidence(proposalId, evidence);
  }

  // ... transición normal
}
```

### 5. Frontmatter schema actualizado

```yaml
---
id: x00245
title: ...
kind: fix
status: review
type: proposal
track: privacy
date: 2026-08-25
evidence:
  commit: <hash>
  ci-runs:
    - name: typecheck
      status: success
      runId: 12345
      logUrl: https://github.com/.../runs/12345
    - name: tokens-budget-real
      status: success
      runId: 12346
      logUrl: https://github.com/.../runs/12346
---
```

### 6. Documentación

`docs/mcp-vertex/ci/evidence.md`:

```md
# Workflow run evidence

Proposals moving to `review` should attach CI evidence:

- `commit`: SHA of the commit.
- `ci-runs`: list of CI jobs + status + log URL.

To collect evidence locally:

```bash
bun run collect-evidence <proposalId>
```

This writes evidence to the proposal's frontmatter (or appends a `.evidence.yaml`).

CI gates that count as evidence:

- typecheck, tests, lint-*, quality-gate, verify-runtime, metrics-gate
- tokens-budget-real, manifests-check, generated-artifacts-check

A proposal without evidence cannot transition to `done` (unless explicitly
overridden by a human reviewer).
```

## Slices

- global_gate: type

### S1 — Generators gate unificado

- **Status**: done
- **Files**: `tools/scripts/lint/check-generated-artifacts.script.ts`
- **Gate**: type
- acceptance:
  - "5 generadores cubiertos."
  - "Drift detectado."

### S2 — Collect evidence + transition validation

- **Status**: done
- **Files**: `tools/scripts/proposals/collect-evidence.script.ts`, `plugins/proposals/src/lib/services/transition-evidence.ts`
- **Gate**: type
- acceptance:
  - "Evidence recolectable."
  - "Transición exige evidence en CI."

### S3 — Documentación

- **Status**: done
- **Files**: `docs/mcp-vertex/ci/evidence.md`
- **Gate**: type
- acceptance:
  - "Flujo documentado."

## Acceptance

- **Unit**: `collectProposalEvidence` parsea correctamente el output de `gh run list`.
- **Integration**: una proposal sin evidence no puede transicionar a `review` (en CI).
- **E2E**: drift en artifacts rompe CI.


- [ ] `check-generated-artifacts.script.ts` unifica los 5 checks.
- [ ] CI ejecuta el check.
- [ ] `collect-evidence.script.ts` implementado.
- [ ] Transición a `review` exige evidence en CI.
- [ ] Documentación: `docs/mcp-vertex/ci/evidence.md` explica el flujo.
- [ ] `bun run validate` verde.


- Generators gate verde.
- Evidence recolectable.
- Transición validada.

---

## Notes

- **Generators CI** verde.
- **Transition validation** en CI exige evidence.
- **Dev override** documentado (agentes locales pueden omitir evidence).


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/lint/check-generated-artifacts.script.ts
        - tools/scripts/proposals/collect-evidence.script.ts
        - docs/mcp-vertex/ci/evidence.md
    - ci-integration: check-generated-artifacts-check + transition require-evidence
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track G.
- **Auditoría legada**: §19 CI2-003 + CI2-005.
- **Predecesor**: `i00010` (branch policy).
- **Hermanas**: `f00175`, `i00006`.
- **Principio §41**: *"A proposal is not done until the acceptance evidence exists."*

## Slices

- global_gate: type

### S1 — Generators gate unificado

- **Status**: done
- **Files**: `tools/scripts/lint/check-generated-artifacts.script.ts`
- **Gate**: type
- acceptance:
  - "5 generadores cubiertos."
  - "Drift detectado."

### S2 — Collect evidence + transition validation

- **Status**: done
- **Files**: `tools/scripts/proposals/collect-evidence.script.ts`, `plugins/proposals/src/lib/services/transition-evidence.ts`
- **Gate**: type
- acceptance:
  - "Evidence recolectable."
  - "Transición exige evidence en CI."

### S3 — Documentación

- **Status**: done
- **Files**: `docs/mcp-vertex/ci/evidence.md`
- **Gate**: type
- acceptance:
  - "Flujo documentado."

## Acceptance

- Generators gate verde.
- Evidence recolectable.
- Transición validada.
- `bun run validate` verde.
