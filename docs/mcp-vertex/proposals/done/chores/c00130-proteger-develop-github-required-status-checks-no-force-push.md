---
id: c00130
title: "Proteger `develop` en GitHub: required status checks + no force-push"
kind: chore
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / c00130"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
shipped-in:
    - f5836e9 # S1 policy declarativa + doc operativo + verificador
related:
    - q00006
    - c00131 # protectedBranches por defecto en commit-policy
    - c00132 # quality gate real pre-merge
    - c00133 # drift CI gate
    - v00125 # verificación final del estado de develop
---

# c00130 — Proteger `develop` en GitHub: required status checks + no force-push

## Goal

Aplicar **branch protection real** en GitHub para `develop` y `main`,
con required status checks que correspondan al quality gate efectivo
(no decorativos), `enforce_admins: true`, `required_linear_history:
true`, `allow_force_pushes: false`, `allow_deletions: false`.

El output del plan debe ser triple:

1. `.github/branch-protection.yml` declarativo (lo que **debe** estar
   en la UI/API de GitHub).
2. `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` con instrucciones
   operativas paso a paso para que un humano aplique los cambios en
   la UI de GitHub (la API `admin:repo` requiere OAuth scope que CI
   no debe asumir).
3. `tools/scripts/ci/verify-branch-protection.script.ts` que falle
   (`exit 1`) si la policy real en GitHub difiere de la declarada.

### Comportamiento actual

- `develop` no está protegida en GitHub.
- El plugin `commit-policy` no lista `develop` en
  `protectedBranches` (lo arregla `c00131`).
- Los GitHub Actions jobs pueden pasar decorativamente (lo aborda
  `c00132`).
- No existe evidencia verificable del estado real de la rama.

### Comportamiento deseado

- `main` y `develop` protegidas en GitHub con
  `required_status_checks` (quality gate, tests, tokens, governance,
  security).
- `enforce_admins: true`, `required_linear_history: true`,
  `allow_force_pushes: false`, `allow_deletions: false`.
- Documento operativo versionado que guíe la aplicación manual.
- Script `verify-branch-protection` ejecutable en CI nightly; falla
  si la policy real difiere.

## why

- AUD-P0-001: la auditoría externa constata que `develop` es
  reescribible (force-push) y que los required checks no
  corresponden al quality gate real.
- Es prerequisito material de `c00131`, `c00132`, `c00133` y
  `v00125`.
- Sin protección real, todos los demás gates del plan son
  subvertibles en un commit.
- La política queda versionada en el repo, no solo en la memoria
  del maintainer.

## non-goals

- No automatiza la aplicación de la policy en GitHub (requiere OAuth
  admin scope fuera del alcance de CI).
- No desactiva quality gates existentes.
- No debilita privacy R1.x.
- No introduce un nuevo servicio de CI.

## architecture

### 1. Policy declarativa

- `.github/branch-protection.yml`:
  ```yaml
  version: 1
  branches:
      - name: main
        protection:
            required_status_checks:
                strict: true
                contexts:
                    - quality-gate
                    - tests
                    - tokens
                    - governance
                    - security
            enforce_admins: true
            required_linear_history: true
            allow_force_pushes: false
            allow_deletions: false
            restrictions: null
      - name: develop
        # misma policy que main
  ```

### 2. Documento operativo

- `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`:
  - Por qué la policy es declarativa + manual.
  - Pasos exactos en la UI de GitHub (con screenshots si están
    disponibles).
  - Pasos exactos vía API (`gh api` con PAT admin).
  - Cómo verificar después de aplicar.

### 3. Verificador

- `tools/scripts/ci/verify-branch-protection.script.ts`:
  - Recibe `--owner` y `--repo` (default: los del repo actual).
  - Llama a `GET /repos/:owner/:repo/branches/:branch/protection`
    para `main` y `develop`.
  - Compara el JSON real contra el YAML declarativo.
  - `exit 0` si coincide; `exit 1` con diff legible si difiere.
  - Respeta `GITHUB_TOKEN` y rate limit (cachea respuesta).

### 4. Tests

- `tools/scripts/ci/verify-branch-protection.spec.ts`:
  - Fixtures de respuesta de GitHub API.
  - Verifica exit 0 ante policy declarada idéntica.
  - Verifica exit 1 ante divergencia (campo faltante o distinto).
  - Verifica que un rate-limit excedido se reporta claramente.

## Slices

### S1 — Policy declarativa + documento operativo + verificador

- **Status**: done
- **Files**: `.github/branch-protection.yml`, `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`, `tools/scripts/ci/verify-branch-protection.script.ts`, `tools/scripts/ci/verify-branch-protection.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revision independiente del checkout f5836e972dac25daebc8bd28613639742b571424: .github/branch-protection.yml valida via el loader de produccion; verify-branch-protection.spec.ts cubre parseo, match sin drift, drift por required checks y fallo claro por rate-limit; el comando focalizado bunx vitest run tools/scripts/ci/verify-branch-protection.spec.ts --reporter=dot paso 5/5. Hay cambios no relacionados en el working tree, pero no aparece un bloqueador externo concreto sobre este slice ni una falla del spec bajo revision.
## acceptance

- `.github/branch-protection.yml` declara la policy completa para
  `main` y `develop`.
- `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` existe y está
  enlazado desde el bootstrap (`AGENT-BOOTSTRAP.md`).
- `verify-branch-protection.script.ts` ejecutable y testeado.
- CI nightly invoca el verificador; falla si diverge.
- `bun run validate` verde.
- `resolution.evidence` del cierre referencia SHA de GitHub +
  respuesta JSON real de la API.
