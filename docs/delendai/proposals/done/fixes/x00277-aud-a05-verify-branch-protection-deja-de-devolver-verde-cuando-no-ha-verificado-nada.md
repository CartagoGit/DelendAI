---
id: x00277
title: "AUD-A05 — verify-branch-protection deja de devolver verde cuando no ha verificado nada"
kind: fix
status: done
type: fix
track: governance
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-A05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, x00278, x00276, x00279]
---

# x00277 — `verify-branch-protection` deja de ser un falso verde permanente

## Goal

Sustituir el resultado binario actual (`exit 0` / `exit 1`) por un
modelo de tres estados — `pass` / `fail` / `unverified` — de modo que
sea **imposible** que el script reporte "verificado y correcto" sin
haber leído al menos una rama, y que el estado `unverified` sea visible
sin abrir el log del job (GitHub `::warning::` + `$GITHUB_STEP_SUMMARY`).

## Why

Cuando ninguna rama es legible con el token en uso — el caso real,
siempre, con el `GITHUB_TOKEN` del workflow, que no tiene scope
`administration` — el script imprime "nothing verified, nothing
asserted" y **devuelve 0**:

```ts
if (unverifiable.length === config.branches.length) {
    out('verify-branch-protection: no branch could be read with the token in use — nothing verified, nothing asserted.');
    return 0;   // ← verde
}
```

El job `branch-protection` de `tier3` aparece en verde en todas las
ejecuciones sin haber comprobado jamás nada — incluido el fallo real
`AUD-A01` (drift de branch protection en `develop`) que ocurría
delante de él sin que lo detectara. Es el patrón más peligroso posible
en una puerta de CI: un check verde es indistinguible, para un
revisor humano, de "verificado y correcto".

## Why this design

Un booleano `verified: boolean` no basta: `unverified` necesita un
tratamiento distinto de `pass` (exit 0, pero con aviso visible) y de
`fail` (exit != 0). Codificarlo como una unión explícita
(`'pass' | 'fail' | 'unverified'`) hace que el llamador (el propio
script y su futuro consumidor en `x00276`) no pueda colapsar
accidentalmente `unverified` en `pass` silencioso — que es exactamente
el bug de hoy.

La política de error se extrae a un cliente compartido
(`tools/scripts/ci/lib/github-protection.lib.ts`, entregado como parte
de esta propuesta y reutilizado por `x00276`) para que las dos puertas
gemelas dejen de poder divergir: hoy tratan el mismo 403 de forma
opuesta (una lanza, otra lo traga en silencio) precisamente porque
cada una reimplementa su propio fetch.

## Non-goals

- No añadir un job `branch-protection (unverified)` separado en el
  workflow — el informe lo sugiere como solución ideal a más largo
  plazo; esta propuesta se limita al contrato de exit-code + summary.
- No cambiar la política declarada en `.github/branch-protection.ts`.
- No tocar `allow_deletion`/`allow_deletions` aquí — depende de
  `x00278`, que va primero.

## Architecture

```
tools/scripts/ci/lib/github-protection.lib.ts   (NUEVO)
  fetchBranchProtection(repo, branch, token, tokenSupplied)
    → { kind: 'live', data: IGitHubBranchProtectionResponse }
    | { kind: 'unprotected' }                                  (404)
    | { kind: 'unverified', branch }                           (401/403, sin token explícito)
    | throws                                                   (401/403 con token explícito → decisión del llamador)
  parseGitHubBranchProtectionResponse(json): valida con Zod, nunca castea con `as`.

verify-branch-protection.script.ts
  consume el cliente, agrega resultados por rama, decide el veredicto
  agregado ('pass' | 'fail' | 'unverified'), escribe
  $GITHUB_STEP_SUMMARY y emite ::warning:: cuando el veredicto es
  'unverified'.
```

El script YA NO abre su propio `fetch` — toda la política de error
vive en la lib compartida, consumida también por `verify-develop-health`
(`x00276`).

## Slices

### S1 — cliente compartido `github-protection.lib.ts`

- **Status**: done
- **Files**: `tools/scripts/ci/lib/github-protection.lib.ts`, `tools/tests/ci/lib/github-protection.lib.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/lib/github-protection.lib.spec.ts`

### S2 — `verify-branch-protection.script.ts` consume el cliente y el modelo de tres estados

- **Status**: done
- **Files**: `tools/scripts/ci/verify-branch-protection.script.ts`, `tools/tests/ci/verify-branch-protection.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/tests/ci/verify-branch-protection.spec.ts`

### S3 — workflow acepta `BRANCH_PROTECTION_TOKEN` opcional

- **Status**: done
- **Files**: `.github/workflows/tier3.yml`
- **Gate**: `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run`

## Dependency graph

```
x00278 ──► x00277 ──┐
       └──► x00276 ─┴──► (comparten github-protection.lib.ts)
```

## Acceptance

1. Todas las ramas 403 sin token explícito ⇒ `exit 0` **y**
   `status: 'unverified'` en la salida estructurada, con `::warning::`
   y una línea en `$GITHUB_STEP_SUMMARY` que nombra la(s) rama(s).
2. Todas las ramas 403 **con** token explícitamente proporcionado ⇒
   `exit != 0`.
3. Una rama legible con drift real ⇒ `exit 1`, aunque otra rama sea
   ilegible — el drift no puede quedar tapado por la ilegible.
4. Fixture con la respuesta literal de la API para `main` (ver
   `x00278`) ⇒ 0 drifts.
5. Test de paridad: para el mismo fixture, `verify-branch-protection` y
   `verify-develop-health` llegan al mismo veredicto.
6. Es imposible, por construcción, invocar el flujo "verde" sin haber
   leído al menos una rama con éxito — demostrado por test.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Extraer el cliente compartido podría cambiar sutilmente el comportamiento de `verify-develop-health`, que hoy ni siquiera trata 401/403 | Se implementa junto con `x00276` en el mismo slice `S1` del plan padre, con test de paridad explícito |
| `BRANCH_PROTECTION_TOKEN` no configurado en el repo real | El fallback a `GITHUB_TOKEN` mantiene el comportamiento actual (unverified) sin exigir configuración nueva |

## Notes

- Comparte solución con `x00276` (AUD-A04) y depende de `x00278`
  (AUD-A06) por el nombre del campo `allow_deletions`.
