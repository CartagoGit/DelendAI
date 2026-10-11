---
id: d00014
title: "Una página canónica por plugin: fusionar las tres manuales en las auto-generadas"
kind: docs
status: done
type: proposal
track: docs
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-F07
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011]
last-transition-id: 6853717e-c8a1-4089-882a-4d901316b2d2
last-correlation-id: 6853717e-c8a1-4089-882a-4d901316b2d2
last-transition-from: in-progress
---

# d00014 — Una página canónica por plugin: fusionar las tres manuales en las auto-generadas

## Goal

Eliminar la duplicación de página por plugin para `context-for-change`,
`error-reporting` e `impact-analysis`, fusionando el contenido manual
en el generador (como sección de "notas") de modo que cada plugin
tenga una única página canónica gobernada por drift check.

## why

**Verificación de la premisa.** Confirmado: `docs/mcp-vertex/plugins/`
contiene `context-for-change.md`, `error-reporting.md` e
`impact-analysis.md` como ficheros manuales, junto al directorio
`auto-generated/` que ya tiene una página por cada uno de los 51
plugins (incluidos esos tres). No hay drift check entre la versión
manual y la generada del mismo plugin — confirmado porque
`docs/mcp-vertex/DOCS-MANUAL-VS-GENERADA.md` (o el fichero equivalente
que documenta esta distinción — nombre exacto a confirmar con
`ls docs/mcp-vertex/DOCS-MANUAL*`) existe precisamente para prevenir
este patrón, y aun así ocurrió con estos tres.

**Por qué es un problema.** Dos páginas para el mismo plugin, una
gobernada por drift check (la generada, que se regenera del manifest y
del código) y otra no (la manual, que puede quedarse obsoleta sin que
nada lo detecte). Un lector que encuentre primero la manual puede
estar leyendo información que ya no coincide con el plugin real.

## why this design

Se descarta simplemente borrar las tres páginas manuales sin
preservar su contenido: cada una probablemente documenta contexto que
el generador no puede derivar del manifest/código (decisiones de
diseño, casos de uso, matices operativos) — de ahí que existieran como
manuales en primer lugar. La solución elegida es fusionar ese
contenido como una sección "Notes" / "Design notes" dentro de la
página auto-generada de cada plugin, aprovechando que el generador ya
soporta contenido inyectado (confirmar el mecanismo exacto leyendo
`tools/scripts/report/` o el generador de
`docs/mcp-vertex/plugins/auto-generated/` antes de implementar) en
vez de mover las tres páginas a `plugins/authoring/` (la alternativa
que menciona la auditoría), porque mantener la información junto al
resto de la página del plugin es más descubrible que un directorio
paralelo nuevo.

## non-goals

- Rediseñar el generador de páginas auto-generadas en general — sólo
  se extiende para aceptar una sección de notas manuales por plugin,
  si no la soporta ya.
- Auditar el resto de `docs/mcp-vertex/plugins/auto-generated/` en
  busca de otras páginas manuales no detectadas — esta propuesta cubre
  exactamente las tres que la auditoría nombra; si aparecen más, es un
  hallazgo de seguimiento.

## architecture

```
docs/mcp-vertex/plugins/{context-for-change,error-reporting,impact-analysis}.md
                    │  (contenido manual: decisiones, casos de uso)
                    ▼
docs/mcp-vertex/plugins/notes/<plugin-id>.notes.md   (nuevo: fuente
                                                       de la sección
                                                       manual, sin
                                                       drift check
                                                       posible porque
                                                       es prosa, pero
                                                       en UNA sola
                                                       ubicación por
                                                       plugin)
                    │
                    ▼ (el generador la inyecta)
docs/mcp-vertex/plugins/auto-generated/<plugin-id>.md
      [contenido generado del manifest/código]
      ## Notes
      [contenido de notes/<plugin-id>.notes.md, si existe]
```

## slices

### S1 — Extender el generador para inyectar una sección de notas manuales opcional

- **Status**: done
- **Files**:
    - `tools/scripts/generate/plugin-docs.script.ts` (generador real
      de `docs/mcp-vertex/plugins/auto-generated/`, invocado hoy por
      `bun run generate:plugin-docs`)
    - `docs/mcp-vertex/plugins/notes/` (nuevo directorio)
    - `tools/scripts/generate/from-manifests.script.ts` (el generador
      real detrás de `plugin-docs.script.ts`, que es donde vive el
      plegado de las notas)
    - `tools/scripts/generate/from-manifests.script.spec.ts` (extendido)
- **Gate**: `bun run generate:plugin-docs` ejecutado y verificado a
  mano contra un plugin fixture con y sin nota manual, seguido de
  `bunx vitest run tools/scripts/generate/plugin-docs.script.spec.ts`.
  Corrección: `plugin-docs.script.ts` es un wrapper de una línea; el
  generador real (y el fichero realmente editado) es
  `tools/scripts/generate/from-manifests.script.ts`, con su spec
  `from-manifests.script.spec.ts` (el `.spec.ts` que la propuesta
  nombraba no existe con ese nombre). Ambos gates ejecutados y verdes:
  `bun run generate:plugin-docs` escribió las 3 páginas con "## Notes",
  y `bunx vitest run tools/scripts/generate/from-manifests.script.spec.ts`
  pasó 4/4 (incluye el nuevo caso "folds an optional plugin notes file
  into the generated page").
- review-state: done
- review-implementer: claude-code-worker
- review-reviewer: sonnet-worker-docs-2
- review-log: approved by sonnet-worker-docs-2 — Verified S1: from-manifests.script.ts folds notes/<id>.notes.md into a Notes section; ran generate:plugin-docs for real (3 pages regenerated with Notes) and the spec suite.
### S2 — Migrar `context-for-change.md`, `error-reporting.md`, `impact-analysis.md`

- **Status**: done
- **Files**:
    - `docs/mcp-vertex/plugins/context-for-change.md` → contenido
      movido a `docs/mcp-vertex/plugins/notes/context-for-change.notes.md`,
      fichero original eliminado
    - `docs/mcp-vertex/plugins/error-reporting.md` → ídem
    - `docs/mcp-vertex/plugins/impact-analysis.md` → ídem
    - `docs/mcp-vertex/plugins/auto-generated/context-for-change.md`,
      `error-reporting.md`, `impact-analysis.md` (regenerados vía
      `bun run generate:plugin-docs`, ahora con la sección "Notes")
- **Gate**: `grep -rn --include="*.md" "plugins/context-for-change\.md\|plugins/error-reporting\.md\|plugins/impact-analysis\.md" docs/`
  debe devolver cero coincidencias (ningún enlace del repo sigue
  apuntando a las tres rutas eliminadas). Ejecutado: cero coincidencias
  fuera de `docs/mcp-vertex/proposals/done/**` (registro histórico ya
  enviado, no se reescribe) y de esta propia propuesta. Las tres rutas
  manuales NO se eliminaron por completo: quedan como un stub corto de
  redirección ("> **Merged (d00014).**...") en vez de un 404, mitigación
  que la propia sección de riesgos de esta propuesta ya preveía.
  `tools/scripts/lint/privacy-internal-only.script.ts` referenciaba
  `docs/mcp-vertex/plugins/error-reporting.md` como fuente autorizada
  para mencionar `internalOnly`; se corrigió a
  `docs/mcp-vertex/plugins/notes/error-reporting.notes.md` (su spec
  actualizado igual) para que el lint no rompiera al desaparecer el
  contenido real de la página manual.
- review-state: done
- review-implementer: claude-code-worker
- review-reviewer: sonnet-worker-docs-2
- review-log: approved by sonnet-worker-docs-2 — Verified S2: notes/*.notes.md created with migrated content, auto-generated pages regenerated with Notes sections, manual pages replaced with redirect stubs, privacy-internal-only.script.ts DOC_PATHS fixed and its spec passing.
### S3 — Lint que impide una página manual duplicando una auto-generada

- **Status**: done
- **Files**:
    - `tools/scripts/lint/no-manual-plugin-page-duplicate.script.ts` (nuevo)
    - `tools/scripts/lint/no-manual-plugin-page-duplicate.script.spec.ts` (nuevo)
- **Gate**: `bunx vitest run tools/scripts/lint/no-manual-plugin-page-duplicate.script.spec.ts`
- review-state: done
- review-implementer: claude-code-worker
- review-reviewer: sonnet-worker-docs-2
- review-log: approved by sonnet-worker-docs-2 — Verified S3: no-manual-plugin-page-duplicate.script.ts + spec (5/5) passing, wired into package.json and validate:run.
## dependency graph

Ninguna. Independiente del resto de `q00011`. Dentro de esta
propuesta: S1 debe ir antes de S2 (el generador necesita soportar la
sección de notas antes de migrar contenido a ella); S3 depende de S2
(el lint necesita que ya no queden las tres páginas manuales para
poder verificar contra ese estado, y sirve como regresión hacia
adelante).

## acceptance

- Cada uno de los tres plugins tiene una única página bajo
  `auto-generated/`, con su contenido manual preservado como sección
  "Notes".
- Ningún enlace del repo apunta a las rutas manuales eliminadas
  (verificado por el link-check).
- El lint de S3 falla si en el futuro aparece de nuevo una página
  manual en `docs/mcp-vertex/plugins/*.md` para un plugin que ya tiene
  página auto-generada.

## risks and mitigations

- **Riesgo: el contenido manual usa una estructura de encabezados que
  choca con la de la página generada al fusionarse.** Mitigación: S1
  inyecta el contenido de notas como una sección `## Notes` al final,
  sin reescribir su estructura interna — un choque de encabezados
  internos (`###`+) no es un problema de nivel de documento.
- **Riesgo: algún enlace externo (README raíz, otro proyecto) apunta a
  la ruta manual antigua.** Mitigación: S2 deja un stub en la ruta
  antigua con una redirección de una línea ("Esta página se fusionó en
  `auto-generated/<id>.md`") en vez de un 404 silencioso, durante una
  ventana de una release.

## notes

Alcance deliberadamente pequeño: tres páginas, un generador extendido,
un lint de regresión. Si tras S3 aparecen más páginas manuales no
detectadas por este triage, entran como un hallazgo nuevo, no como
ampliación silenciosa de esta propuesta.
