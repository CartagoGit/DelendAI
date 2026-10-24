---
id: c00010
title: "CI — required checks en `develop` branch policy (CI2-001)"
kind: chore
status: retired
paused-reason: "Superseded: q00005/c00017/c00018 established that develop remains intentionally unprotected; required checks belong to the protected release/staging flow. Retain this proposal only as historical audit trace."
type: proposal
track: ci
date: 2026-08-25
priority: P2
classification: CONFIRMADO
parent-plan: q00004
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§19 CI2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00005 # token gate (uno de los required checks)
    - i00006 # dashboard check
    - i00011 # generator gates + workflow evidence
    - f00175 # generators
shipped-in:
  - e1ee275a # ci(track-g): harden develop checks and proposal evidence gate
superseded-by:
  - c00017
  - c00018
---

# i00010 — CI: required checks en develop

## Goal

Historical goal retained for traceability. It is not the current repository
policy; the active policy is defined by `docs/delendai/REPO-RULES.md` and
the successor proposals above.

`develop` continúa sin protección requerida:

```yaml
# .github/branch-protection.yml (o equivalente)
"protected": false
"requiredChecks": []
```

Esto importa porque:

- Agentes pueden pushear a `develop` directamente.
- Velocidad de agentes > velocidad de revisión humana.
- Nada bloquea silenciosamente un push que rompe el build.

Reglas violadas: §19 CI2-001.


```yaml
# .github/CODEOWNERS / branch-protection / settings (consultar)
```


`CONFIRMADO`.

## Why

- Ningún agente puede dejar `develop` en rojo silenciosamente.
- Push se rechaza si los required checks fallan.


Cero.


Cero.

## Non-goals

**Permitido**:

- `.github/branch-protection.yml` (o equivalente).
- `.github/workflows/ci.yml` (definir jobs con nombres canónicos).
- Documentación.

**No permitido**:

- Cambiar otros workflows.
- Cambiar plugins.


- Token dashboard check (`i00006`).
- Generator gates + workflow run evidence (`i00011`).
- PR humano obligatorio (la auditoría explícitamente dice que no es necesario).

## Architecture

### 1. Definir required checks canónicos

```yaml
# .github/branch-protection.yml (o equivalente)
required_status_checks:
  - typecheck           # canonical name
  - tests               # canonical name
  - lint-architecture
  - lint-security
  - lint-governance
  - lint-presets
  - lint-docs
  - lint-biome
  - quality-gate
  - verify-runtime
  - metrics-gate
  - tokens-budget-real  # from i00005
  - manifests-check     # from f00175 + i00008 + i00009
  - generated-artifacts-check  # from i00011
```

Cada check es un job name canónico en `.github/workflows/ci.yml`.

### 2. Workflow con nombres canónicos

```yaml
# .github/workflows/ci.yml
name: ci

jobs:
  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run typecheck

  tests:
    name: Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run test

  # ... (todos los demás)

  tokens-budget-real:
    name: Token budget (real preset)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run tokens:gate

  manifests-check:
    name: Manifests check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run lint:manifest-vs-package
      - run: bun run lint:manifest-vs-presets

  generated-artifacts-check:
    name: Generated artifacts check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run check:generated
```

### 3. Branch protection (via repo settings)

```yaml
# Settings → Branches → develop
"required_status_checks":
  "strict": true
  "contexts":
    - typecheck
    - tests
    - lint-architecture
    - lint-security
    - lint-governance
    - lint-presets
    - lint-docs
    - lint-biome
    - quality-gate
    - verify-runtime
    - metrics-gate
    - tokens-budget-real
    - manifests-check
    - generated-artifacts-check
"enforce_admins": true
"required_pull_request_reviews": null  # NO obligatorio para agents
"restrictions": null
```

### 4. Documentación

`docs/delendai/ci/branch-policy.md`:

```md
# Branch policy: develop

## Slices

- global_gate: type

### S1 — Workflow con nombres canónicos

- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Jobs con nombres canónicos."

### S2 — Branch protection + docs

- **Status**: pending
- **Files**: branch protection (settings), `docs/delendai/ci/branch-policy.md`
- **Gate**: type
- acceptance:
  - "≥14 required checks."
  - "enforce_admins: true."
  - "Documentación explica política."
- review-state: changes_requested
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: requested_changes by delivery_verifier — Bloqueo de aprobación: S2 exige proteger develop con >=14 required checks y enforce_admins: true, pero la política declarativa vigente declara develop protected: false y required_checks: [] en .github/branch-protection.ts, mientras la documentación actual también dice que develop sigue abierto y que solo main requiere ci-complete. El workflow sí define ci-complete como agregado de 16 jobs y defaults.enforce_admins: true, pero eso solo aplica a ramas protegidas. Hay que resolver el alcance de S2 (cambiar la propuesta para aceptar develop abierto con agregado en main) o cambiar la política declarativa para que develop quede realmente protegido.
## Acceptance

- **E2E**: push que rompe un check → push rechazado.
- **E2E**: push con todos los checks verdes → push aceptado.


- [ ] Workflow CI con jobs canónicos (≥14 jobs).
- [ ] Branch protection configurada en `develop`.
- [ ] `enforce_admins: true`.
- [ ] Documentación: `docs/delendai/ci/branch-policy.md` explica la política.
- [ ] Push que rompe check es rechazado (verificado manualmente).
- [ ] Todos los checks actuales pasan.


- Branch protection configurada.
- ≥14 required checks.
- Documentación.

---

## Notes

- `typecheck` — TypeScript typecheck
- `tests` — vitest run
- `lint-architecture` — plugin/tool contract lints
- `lint-security` — secret/env/safe-reader lints
- `lint-governance` — proposals lifecycle lints
- `lint-presets` — preset consistency lints
- `lint-docs` — docs structure lints
- `lint-biome` — biome lint
- `quality-gate` — quality plugin run
- `verify-runtime` — runtime verification
- `metrics-gate` — metrics sanity
- `tokens-budget-real` — real preset budget vs hard (from `i00005`)
- `manifests-check` — manifest vs package.json + preset catalog (from `i00008`+`i00009`)
- `generated-artifacts-check` — manifests/web/docs/permissions sync (from `i00011`)


Agents push directly. Velocity is high. The required checks are the
quality gate — they ensure correctness without human-in-the-loop.

If a check fails, the push is rejected. To unblock:
1. Fix the issue locally.
2. Push the fix.
3. CI re-runs.


`enforce_admins: true` means admins cannot bypass. There is no escape hatch
except fixing the issue.

If a check is genuinely wrong (false positive), open a proposal to fix it
("lint X is failing incorrectly because Y") — the proposal is the audit trail.
```


- La branch protection **es** el regression guard.
- Cualquier intento de pushear código que rompe un check se rechaza.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - .github/workflows/ci.yml (job names canónicos)
        - .github/branch-protection.yml (o via settings)
        - docs/delendai/ci/branch-policy.md (nuevo)
    - before/after:
        before: "develop sin required checks; push libre"
        after:  "develop con ≥14 required checks; push bloqueado si falla"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track G.
- **Auditoría legada**: §19 CI2-001.
- **Hermanas**: `i00011` (generators + evidence).
- **Predecesoras**: `i00005`, `i00006`, `f00175`, `i00008`, `i00009`.
- **Principio §41**: *"A proposal is not done until the acceptance evidence exists."* Esta propuesta blinda el flujo.

## Slices

- global_gate: type

### S1 — Workflow con nombres canónicos

- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Jobs con nombres canónicos."

### S2 — Branch protection + docs

- **Status**: pending
- **Files**: branch protection (settings), `docs/delendai/ci/branch-policy.md`
- **Gate**: type
- acceptance:
  - "≥14 required checks."
  - "enforce_admins: true."
  - "Documentación explica política."

## Acceptance

- Branch protection configurada.
- ≥14 required checks.
- Documentación.
- `bun run validate` verde.
