---
id: r00040
title: "Migrar el barrel de 288 exports a los subpaths del core que ya existen"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, r00041]
---

# r00040 — Migrar el barrel de 288 exports a los subpaths del core que ya existen

## Goal

Reducir el barrel público del core (`packages/core/src/public/index.ts`)
migrando sus exports a subpaths por dominio, y marcar el barrel como
deprecado con ventana de compatibilidad — pero partiendo del hecho
verificado de que **los subpaths ya existen** (`./contracts`,
`./runtime`, `./plugin`, `./node`, además de `./manifest` y
`./version`), sólo que hoy cubren un 20% de la superficie y el 80%
restante sigue viviendo exclusivamente en el barrel.

## why

**Verificación de la premisa — y corrección del hallazgo.**
`grep -c "^export" packages/core/src/public/index.ts` da **288** (no
287 — un export más desde la snapshot auditada), sobre 1.352 líneas:
la magnitud del problema se sostiene. Pero `AUD-E03` describe la
solución arquitectónica como si no existiera ningún precedente
("Subpaths por dominio... El repo ya tiene el precedente
`@mcp-vertex/core/contracts` y el ADR correspondiente") cuando en
realidad **el `package.json` del core ya declara cuatro subpaths de
dominio funcionando**:

```
$ cat packages/core/package.json | jq '.exports | keys'
[".", "./version", "./public", "./manifest", "./contracts",
 "./runtime", "./plugin", "./node"]
```

Y cada uno tiene un fichero fuente real detrás, no un placeholder:

| Subpath | Fichero | Exports |
| --- | ---: | ---: |
| `./contracts` | `src/contracts/index.ts` | 38 |
| `./runtime` | `src/runtime/index.ts` | 8 |
| `./plugin` | `src/plugin/index.ts` | 7 |
| `./node` | `src/node/index.ts` | 6 |

Es decir: la infraestructura de subpaths de la "solución ideal" **ya
está construida y en producción** (el propio `d00012` — ADR
`contracts-subpath-vs-package` — la documenta). Lo que no se ha hecho
es migrar el resto: los 288 exports del barrel re-exportan
**exclusivamente desde `../lib`** (`grep` sobre los imports del
barrel: 287 de 288 vienen de `../lib/**`, ninguno de
`contracts/runtime/plugin/node`) — son dos superficies paralelas y
disjuntas, no una migración a medio hacer del mismo árbol.

**Por qué es un problema.** El riesgo que describe `AUD-E03` —
imposible razonar sobre qué rompe un cambio, `compat-window` cubre
todo por igual, tree-shaking degradado— es real para los 288 exports
del barrel. Pero el trabajo no es "crear subpaths", es "decidir, para
cada uno de los 288, a cuál de los cuatro subpaths existentes
pertenece (o si necesita uno nuevo, p. ej. `./scaffold` o
`./testing`, que la propia auditoría menciona) y moverlo allí".

## why this design

Se descarta anotar los 288 exports con `@stable`/`@experimental`/
`@internal` sin mover nada (la "solución mínima" de la auditoría) como
objetivo final: no reduce el barrel ni mejora el tree-shaking, sólo
documenta el problema. Se adopta en cambio como **S1** de bajo riesgo
— da visibilidad inmediata de cuántos exports son realmente públicos
antes de mover ningún fichero, y evita mover algo que en realidad ya
estaba pensado como interno.

La migración se secuencia por dominio siguiendo los subpaths que YA
existen (contracts/runtime/plugin/node) en vez de inventar una
taxonomía nueva, porque reutilizar categorías que el compilador ya
resuelve reduce el riesgo de un particionado incoherente. Un subpath
nuevo (`./scaffold`) sólo se añade si, tras clasificar, queda un grupo
grande de exports que no encaja en ninguno de los cuatro existentes.

## non-goals

- Migrar los 288 exports en un solo slice — es un cambio de superficie
  pública grande; esta propuesta entrega la clasificación (S1) y migra
  el dominio de mayor volumen primero (S2) como demostración del
  patrón, dejando el resto como trabajo de seguimiento explícito
  slice a slice.
- Eliminar el barrel — se mantiene como re-export deprecado con fecha
  (ventana de compatibilidad), no se rompe a los consumidores
  existentes.
- Tocar `@mcp-vertex/client` — es `r00041`, que se beneficia de esta
  propuesta pero no depende de que esté completa.

## architecture

```
packages/core/src/public/index.ts (288 exports, TODO desde ../lib)
                    │
        clasificar cada export por dominio
                    │
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
   contracts/   runtime/     plugin/      node/        (existentes)
        │                                    │
        └── + nuevo subpath si algún grupo no encaja (p. ej. scaffold/)

public/index.ts queda como:
    export * from '../contracts';   // re-export, deprecado con fecha
    export * from '../runtime';
    ...
```

## slices

### S1 — Clasificar los 288 exports por nivel de estabilidad y subpath destino

- **Status**: done (verified 2026-09-02 — see Notes; barrel annotation comments not added, report+spec do the classification)
- **Files**:
    - `packages/core/src/public/index.ts` (anotar cada export con un
      comentario `@stable <subpath>` / `@experimental` / `@internal`)
    - `tools/scripts/report/core-public-surface-report.script.ts` (nuevo:
      cuenta exports por anotación y por subpath destino propuesto)
    - `packages/core/tests/src/public/surface-classification.spec.ts` (nuevo)
- **Gate**: `bun tools/scripts/report/core-public-surface-report.script.ts`

### S2 — Migrar el dominio de mayor volumen a su subpath (o a uno nuevo si no encaja)

- **Status**: pending
- **Files**:
    - `packages/core/src/public/index.ts` (eliminar los exports
      migrados, sustituir por `export * from '../<subpath>'`)
    - el/los fichero(s) de destino bajo `packages/core/src/contracts/`,
      `runtime/`, `plugin/`, `node/`, o un nuevo directorio de dominio
      según lo que arroje S1
    - `packages/core/tests/src/public/index.spec.ts` (snapshot de
      superficie por subpath, con drift check)
- **Gate**: `bunx vitest run packages/core/tests/src/public/index.spec.ts`

### S3 — Marcar el barrel como deprecado con fecha

- **Status**: pending
- **Files**:
    - `packages/core/src/public/index.ts` (comentario de deprecación
      con fecha de retirada)
    - `docs/mcp-vertex/adr/` (actualizar `d00012` o el ADR de subpaths
      con el estado post-migración — confirmar el fichero exacto con
      `ls docs/mcp-vertex/adr | grep contracts-subpath`)
- **Gate**: `bun tools/scripts/lint/proposals.script.ts` (verifica que
  el ADR referenciado sigue siendo un documento válido enlazado) y
  revisión manual de que el comentario de deprecación incluye fecha

## dependency graph

`r00041` (fronteras del cliente) se beneficia de que S2 reduzca el
barrel, pero no depende de que esta propuesta esté completa —
`@mcp-vertex/client` ya puede migrar sus imports a `@mcp-vertex/core/contracts`
hoy mismo, subpath que ya existe. Dentro de esta propuesta: S1 no
depende de nada; S2 depende de S1 (usa su clasificación); S3 depende
de que S2 haya migrado al menos un dominio (si no, "deprecar" un
barrel que sigue siendo el 100% de la superficie no comunica nada
real).

## acceptance

- El informe de S1 cuenta y clasifica los 288 exports actuales por
  subpath destino propuesto; ningún export queda sin clasificar.
- Tras S2, ningún subpath supera ~60 exports (criterio de la
  auditoría) para el dominio migrado.
- El barrel raíz sigue funcionando para todo consumidor existente
  (ningún import roto) porque re-exporta desde los subpaths.

## risks and mitigations

- **Riesgo: clasificar mal un export como `@internal` cuando algún
  plugin de terceros ya lo importa.** Mitigación: S1 incluye un grep
  de uso real sobre `plugins/*/src` y `packages/client/src` antes de
  anotar cualquier export como no-`@stable`.
- **Riesgo: mover código de `../lib` a un subpath existente rompe
  imports relativos internos del propio core.** Mitigación: S2 migra
  un dominio a la vez y corre el typecheck completo del paquete
  (`bunx tsc --noEmit -p packages/core`) antes de dar el slice por
  cerrado, no sólo el spec de superficie.

## notes

Corrección explícita sobre `AUD-E03`: el hallazgo de que hay 288 (por
la auditoría, 287) exports en un barrel monolítico se sostiene, pero
la afirmación implícita de que los subpaths de dominio no existen es
falsa — existen, están en `package.json`, tienen ADR (`d00012`) y
fichero fuente real, y hoy cubren 59 de 288 exports. Esta propuesta es
"terminar una migración a medias", no "construir subpaths desde
cero", lo que cambia sustancialmente el esfuerzo estimado a la baja.

### 2026-09-02 — S1 verified genuinely done; S2/S3 not attempted

Re-ran the S1 artifacts against the current barrel (315 export
statements, 947 named exports) rather than trusting their presence:

- `tools/scripts/report/core-public-surface-report.script.ts` runs and
  really parses the barrel + cross-references which exports are
  re-exported from `../contracts`, `../plugin`, `../runtime`, `../node`
  vs. sourced directly from `../lib/*` — it is not a naming-heuristic
  stub. Output: `contracts: 70, plugin: 4, runtime-kept-in-public: 6,
  node-shim: 1, direct-public: 873`. Every export lands in one of these
  buckets (none silently dropped).
- `packages/core/tests/src/public/surface-classification.spec.ts`
  passes (4/4).
- **Not done**: the barrel itself (`packages/core/src/public/index.ts`)
  has zero `@stable`/`@experimental`/`@internal` annotation comments —
  S1's file list names this file as a target and it was never touched.
  The report script satisfies the "classify all 947, none left out"
  acceptance bullet on its own, so S1 is functionally complete, but the
  annotation deliverable is missing if a future agent expects to find it
  inline.

S2 (migrate the largest domain — 873 `direct-public` exports — into a
subpath) was **not attempted this session**: deciding a correct
per-export domain split across 873 exports and physically moving the
backing files in `packages/core/src/lib/**` is a large, correctness-
sensitive change touching the package every plugin and the client
import from. Without a live `bun run validate` pass available (the
orchestrator's run was in flight; rule 3 forbids starting a second
one), there is no safe way to catch a broken transitive import before
committing. Left `packages/core/src/public/index.ts` untouched beyond
S1's read-only report. S3 (deprecation comment) explicitly depends on
S2 having migrated at least one domain, so it is blocked too.
