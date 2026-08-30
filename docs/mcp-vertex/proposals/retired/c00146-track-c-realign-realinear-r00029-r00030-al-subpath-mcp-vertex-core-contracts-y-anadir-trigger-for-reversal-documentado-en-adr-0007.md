---
id: c00146
title: "Track C.realign — Realinear `r00029`/`r00030` al subpath `@mcp-vertex/core/contracts` y añadir `Trigger for reversal` documentado en ADR 0007"
kind: chore
status: retired
type: proposal
track: architecture
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
shipped-in:
    - 74d8ddaf
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00029 (decisión arquitectónica)"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    external-reviewer: ChatGPT-5.6-Sol (rectificación)
related:
    - q00006
    - r00027 # inventario core/public (predecesor)
    - r00028 # subpath exports (predecesor de implementación)
    - r00029 # extraer @mcp-vertex/contracts (esta hija lo REDEFINE al subpath)
    - r00030 # cliente importa de contracts (esta hija corrige su import path)
    - b00237 # deprecar nodeDynamicImport (predecesor)
    - d00012 # ADR 0007 (predecesor duro — el ADR documenta la decisión)
---

# c00146 — Track C.realign: realinear `r00029` y `r00030` al subpath con trigger de reversión explícito

## Goal

Corregir el drift documental y de dependencias entre las hijas
existentes de Track C:

- `r00029` propone **"Crear un paquete @mcp-vertex/contracts en
  packages/contracts/"** — pero el agente ejecutó `r00028` con
  un subpath, no un paquete. `r00029` queda **superseded** por
  el ADR 0007 (`d00012`).
- `r00030` dice **"Imports de tipos puros → @mcp-vertex/contracts"** —
  el path correcto en el modelo subpath es
  `@mcp-vertex/core/contracts`. Si se importa del path viejo,
  falla `tsc --noEmit`.
- `b00237` sigue siendo válido (depreca `nodeDynamicImport` desde
  `core/public`), pero su non-goal debería citar el ADR.

Esta hija **no toca el código** (eso ya está hecho en `r00028`/
`b00237`); cierra el drift documental y de frontmatter para que
el plan `q00006` cierre Track C con dependencias internas
coherentes.

Garantizar:

1. `r00029` lleva `superseded-by: d00012` en frontmatter y un
   breve resumen en su cuerpo ("la decisión arquitectónica se
   desplazó a un subpath; ver ADR 0007").
2. `r00030` actualiza su **Goal** y **Architecture** para usar
   `@mcp-vertex/core/contracts` (subpath) en lugar de
   `@mcp-vertex/contracts` (paquete).
3. `r00030` referencia `d00012` en `related:`.
4. `b00237` añade línea en non-goals que cita el ADR ("no
   refactoriza la separación contracts/paquete; ver ADR 0007").
5. La lista de `related:` de `q00006` para Track C pasa a
   referenciar `d00012` y `c00146` explícitamente.
6. El plan `q00006` no introduce contradicción: si las hijas
   tienen un supersede, el plan lo refleja al cerrar Track C.

### Comportamiento actual (DRIFT)

```
r00029 — "Crear un paquete @mcp-vertex/contracts en packages/contracts/"
r00030 — "Imports de tipos puros → @mcp-vertex/contracts"
b00237 — non-goals no mencionan la decisión arquitectónica

vs

r00028 — implementado: subpath `@mcp-vertex/core/contracts`
```

El plan y las hijas quedan con dos verdades: una dice paquete,
otra dice subpath. Eso es exactamente la queja del reviewer.

### Comportamiento deseado

```
r00029 — superseded-by: d00012
          body añade: "Decisión arquitectónica en ADR 0007."

r00030 — Goal reescrito:
          "El cliente importa tipos puros desde
          `@mcp-vertex/core/contracts` (subpath),
          nunca desde `@mcp-vertex/core/public`."

b00237 — non-goals añade bullet:
          "No refactoriza la separación contracts/paquete.
          Esa decisión queda en ADR 0007."

q00006 — Track C lista referencia:
          "ADR 0007 — d00012"
```

## Why

- Cita textual del reviewer:
  > "But it shouldn't be declared as literally the same
  > proposal without updating its architectural decision."
- El plan `q00006` debe cerrar **sin contradicciones**; si dos
  hijas dicen cosas distintas, el closure del plan es
  ambiguo.
- Precondición para que, en un futuro ciclo de auditoría, la
  siguiente pasada pueda responder "¿por qué subpath?" sin
  revisar commits.

## Non-goals

- No cambia código de runtime; solo frontmatter y cuerpo
  narrativo.
- No crea un nuevo paquete; el ADR 0007 mantiene el subpath.
- No reabre el debate arquitectónico; el debate está cerrado.
- No modifica `r00027` (que precede ambas direcciones y sigue
  válido como inventario).

## Architecture

### 1. `r00029` supersede

Añadir al frontmatter:

```yaml
superseded-by: d00012
superseded-reason: |
  Decisión arquitectónica: tipos puros viven en
  @mcp-vertex/core/contracts (subpath), no como paquete
  separado. Ver ADR 0007 (d00012). Esta propuesta queda
  archivada como superseded para conservar la trazabilidad
  del debate original.
```

En el cuerpo, añadir al inicio (después del Goal):

```md
## Estado

Esta propuesta está **superseded-by** [`d00012`](
./d00012-adr-contracts-subpath-vs-package.md). La decisión
arquitectónica —tipos puros como subpath
`@mcp-vertex/core/contracts`, no como paquete separado— está
registrada en el ADR 0007. El cuerpo de esta propuesta se
conserva para trazabilidad.
```

### 2. `r00030` reescritura de Goal + Architecture

Reemplazar el Goal actual:

```md
## Goal

Migrar los imports de tipos puros del cliente desde
`@mcp-vertex/core/public` (conveniencia histórica) a
`@mcp-vertex/core/contracts` (subpath) ...
```

Y en Architecture, sustituir todas las menciones a
`@mcp-vertex/contracts` por `@mcp-vertex/core/contracts`.

### 3. `b00237` non-goals (bullet adicional)

```md
- No refactoriza la decisión arquitectónica "contracts como
  paquete vs subpath". Esa decisión es estable: ver
  [`d00012`](../d00012-adr-contracts-subpath-vs-package.md).
```

### 4. `q00006` (plan) — Track C reference

Editar Track C en el plan para añadir al inicio:

```md
### Track C — Arquitectura y boundaries (P1)

> **Nota arquitectónica**: las decisiones de boundary de este
> track están consolidadas en [`d00012`](
> ./d00012-adr-contracts-subpath-vs-package.md) (ADR 0007).
> `r00029` queda **superseded-by: d00012**.
```

## Slices

### S1 — Supersede `r00029`

- **Status**: done
- **Files**:
  `docs/mcp-vertex/proposals/ready/refactors/r00029-extraer-contracts-tipos-puros-sin-node.md`.
- **Gate**: docs lint
- **Depends on**: `d00012`.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado S1: r00029 tiene superseded-by: d00012 en frontmatter y bloque SUPERSEDED; lint propuestas 0 fatal. Aprobado.
### S2 — Reescribir Goal y Architecture de `r00030`

- **Status**: done
- **Files**:
  `docs/mcp-vertex/proposals/ready/refactors/r00030-client-importar-contracts-no-core-public.md`.
- **Gate**: docs lint
- **Depends on**: S1 + `r00028`.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado S2: Goal + Architecture de r00030 apuntan a @mcp-vertex/core/contracts (subpath); sin menciones residuales de @mcp-vertex/contracts fuera del frontmatter related. Aprobado.
### S3 — bullet en `b00237` non-goals

- **Status**: done
- **Files**:
  `docs/mcp-vertex/proposals/done/breakings/b00237-deprecar-nodedynamicimport-core-public.md`.
- **Gate**: docs lint
- **Depends on**: S1.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado S3: bullet non-goals en b00237 presente con referencia a d00012. Aprobado.
### S4 — Anotar Track C en `q00006`

- **Status**: done
- **Files**:
  `docs/mcp-vertex/proposals/in-progress/plans/q00006-plan-hardening-post-auditoria-chatgpt-sol-cuarta-pasada.md`.
- **Gate**: docs lint
- **Depends on**: S1, S2, S3.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado S4: nota arquitectónica Track C en q00006 con referencia a d00012 (ruta correcta). Aprobado.
## acceptance

- `bun run validate` verde.
- Buscar en el repositorio devuelve:
  - `grep -r '@mcp-vertex/contracts\b' docs/mcp-vertex/proposals/ready docs/mcp-vertex/proposals/in-progress`
    solo encuentra menciones dentro de `r00029`, `r00030`
    citadas como superseded, o el ADR (`d00012`).
  - `grep -r '@mcp-vertex/core/contracts' docs/mcp-vertex/proposals` devuelve
    `r00028`, `r00030`, `d00012`, `c00146`, `q00006`.
- `r00029` lleva `superseded-by: d00012` y nota en su cuerpo.
- `q00006` Track C abre con la nota arquitectónica.
- `bun tools/scripts/proposals/sync-proposal-counters.script.ts`
  actualiza el counter de `d` y `c` (no es necesario para este
  PR, pero el drift lint debe quedar limpio).
