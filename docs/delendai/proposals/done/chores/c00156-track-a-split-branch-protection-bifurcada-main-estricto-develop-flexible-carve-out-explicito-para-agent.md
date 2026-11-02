---
id: c00156
title: "Track A.split — Branch protection bifurcada: `main` estricto, `develop` flexible (carve-out explícito para `agent/*`)"
kind: chore
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / c00130 (override por retractación del reviewer)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (rectificación)
related:
    - q00006
    - c00130 # policy declarativa simétrica (esta hija la bifurca)
    - c00131 # protectedBranches default (redefinido por c00145 en la misma rama conceptual)
    - x00257 # force-with-lease eliminado para protegidas (general)
    - v00125 # verifica develop verde + protegida (superseded por v00127 tras retractación)
---

# c00156 — Track A.split: branch protection bifurcada (main estricto, develop flexible)

## Goal

Reemplazar la política simétrica `"main y develop con la misma
protection"` que `c00130` propone —heredada del supuesto
previo de que el dueño único era humano y debía tratar `develop`
como segunda `main`— por una **política bifurcada** que refleja
el workflow real del repositorio:

```
main    → 🔒 protection dura: force-push never, direct-push never
           required status checks (quality-gate, tests, tokens,
           governance, security)
           enforce_admins: true
           required_linear_history: true
           allow_deletions: false

develop → 🧪 rama flexible:
           force-push with-lease permitido
           direct-push permitido para el único propietario humano
           y para los worktrees `agent/<name>`
           CI observado pero NO bloqueante

agent/<name> → completamente libre (carve-out de la protección)
                ya está excluido por convención de push, pero
                esta hija lo deja explícito en el verificador
                nocturno.
```

Esta política sale de la retractación explícita del reviewer
externo ChatGPT 5.6 Sol sobre la auditoría cuarta pasada:

> "Si eres el único desarrollador humano y tu modelo es:
> ```
> develop = laboratorio / integración / hago lo que quiera
> main    = publicación / estable
> ```
> entonces **proteger `develop` puede ser contraproducente**."

Garantizar:

1. `.github/branch-protection.yml` se reescribe con dos secciones
   (`branches[].name == 'main'`, `branches[].name == 'develop'`)
   que reflejen políticas distintas (cambia `"misma policy que
   main"` que `c00130` propuso).
2. `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` documenta
   el workflow explícitamente y deja claro cuándo aplicar /
   cuándo relajar cada rama.
3. `tools/scripts/ci/verify-branch-protection.script.ts`
   entiende la asimetría (no falla porque `develop` no tenga
   las mismas opciones que `main`).
4. Carve-out de `agent/<name>` aparece tanto en la policy
   declarativa como en el verificador (lista de ramas
   explícitamente exentas: `main`, `master`, `develop`,
   `release/*`, `agent/*` están en la matriz; `agent/*`
   no se valida).

### Comportamiento actual

`c00130` declara una sola `policy` que aplica a `main` y a
`develop` por igual. Eso contradice el workflow real.

### Comportamiento deseado

`c00130` queda como **wrapper semántico**: su `policy` YAML se
parte en dos con dos `branches[]` entries. La diferencia
operativa es que **`develop` se permite force-with-lease y
push directo del owner; `main` no**.

## Why

- Retractación textual del reviewer externo:
  > "Retiro como requisito la recomendación de proteger
  > `develop` en GitHub."
  > "Lo que sí conservaría es una protección lógica distinta:
  > evitar que una automatización haga accidentalmente algo
  > destructivo que no pretendías. Pero eso debe ser
  > configurable y no convertir `develop` en una segunda
  > `main`."
- Sin esta corrección, las propuestas Track A del plan `q00006`
  quedan defendiendo una política que el usuario ha rechazado
  explícitamente.
- Crea la precondición de `c00145` (default de protected branches
  sin develop), `x00272` (defensa contra push directo a main), y
  `v00127` (verificación real del estado de main).

## Non-goals

- No automatiza la aplicación de la policy en GitHub (sigue
  siendo OAuth admin scope; ya está como non-goal de `c00130`).
- No introduce un verificador nocturno **nuevo**; reutiliza el
  de `c00130` con la asimetría.
- No protege `release/*` ni `hotfix/*` automáticamente; solo
  asegura que el verificador no falle al verlas.

## Architecture

### 1. `.github/branch-protection.yml` (asymmetric)

```yaml
version: 2 # bumped desde c00130 que dejó version: 1
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
    protection:
      required_status_checks:
        strict: false # observado pero no bloqueante
        contexts:
          - quality-gate
      enforce_admins: false # el owner puede pushear incluso si CI está rojo
      required_linear_history: false # rebase / squash histórico permitido
      allow_force_pushes: true
      allow_deletions: true
      restrictions: null

# Carve-out explícito
exempt_branches:
  - 'agent/*'         # worktrees efímeros de agentes
  - 'release/*'       # tags inmutables (otros mecanismos)
  - 'hotfix/*'        # fijado por proceso, no por protection
```

### 2. `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` (nuevo redactado)

Añadir sección "Flujo de ramas" antes del primer paso de
"aplicar en UI de GitHub":

```
main    = 🔒 rama de publicación. Toda promesa release-candidate
          va por PR desde release/* o desde develop.
develop = 🧪 rama de integración. Force-with-lease permitido,
          push directo permitido para el owner y para los
          worktrees agent/<name>. Los CI son observacionales.
agent/* = 🤖 worktrees efímeros de agentes MCP. Libres.
```

### 3. `tools/scripts/ci/verify-branch-protection.script.ts` (bifurcado)

El script distingue dos modos:

```ts
if (branch === 'main' && !matchesStrictPolicy(actual)) exit 1;
if (branch === 'develop' && !isSubsetOf(actual, strictPolicy)) exit 1; // lax check
if (branch.startsWith('agent/')) return; // carve-out explícito
```

Comparación no falla por **opciones ausentes en `develop`**;
falla solo si `develop` tiene algo más estricto de lo que su
lax policy permite.

## Slices

### S1 — Reescritura de `.github/branch-protection.yml`

- **Status**: done
- **Files**: `.github/branch-protection.ts` (the policy shipped as TypeScript, not YAML).
- **Gate**: type + lint (yaml syntax)
- **Depends on**: `c00130`.

### S2 — Redacción del flujo de ramas en el documento operativo

- **Status**: done
- **Files**: `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`.
- **Gate**: docs lint
- **Depends on**: S1.

### S3 — Bifurcación del verificador + carve-out `agent/*`

- **Status**: done
- **Files**: `tools/scripts/ci/verify-branch-protection.script.ts`,
  `tools/scripts/ci/verify-branch-protection.script.ts`.
- **Gate**: type + test passing
- **Depends on**: S1 + S2.

## acceptance

- `bun tools/scripts/lint/check-yaml.script.ts .github/branch-protection.yml`
  verde.
- Diff contra `c00130` es claramente legible: dos bloques
  distintos por rama.
- `verify-branch-protection.script.ts` sale 0 incluso si
  `develop` solo tiene `quality-gate` y `allow_force_pushes:
  true`.
- En la UI de GitHub, el owner aplica el nuevo YAML a `main` y
  deja `develop` con la protection actual (o sin ella) — y el
  verificador nocturno lo confirma.
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` referencia el carve-out
  `agent/*` (link al documento operativo).

## Evidence

Implementado el 2026-08-27, después de que el owner reafirmara la misma
política que esta propuesta ya recogía:

- `.github/branch-protection.ts` — `IBranchPolicy` gana un campo
  `protected`, de modo que la política deja de ser un único bloque
  simétrico. `develop` queda `protected: false` sin checks requeridos;
  `main` queda `protected: true` exigiendo el agregado `ci-complete`.
- `tools/scripts/ci/verify-branch-protection.script.ts` — una rama
  declarada no protegida deja de reportarse como `MISSING`; lo que ahora
  se reporta es la deriva contraria, que alguien la haya protegido sin
  actualizar la política.
- `tools/scripts/lint/push-to-develop-discipline.script.ts` — el rechazo
  pasa a mirar la rama origen: se bloquea `wip/*` y `agent/*` empujando a
  `develop`, y el operador empuja directo.
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` y `docs/mcp-vertex/REPO-RULES.md`
  — el invariante de ramas dice ahora que `develop` es la rama de trabajo
  y `main` la protegida.
