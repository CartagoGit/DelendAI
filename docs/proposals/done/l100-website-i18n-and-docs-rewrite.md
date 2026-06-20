---
id: p100
type: proposal
status: done
track: web+i18n+docs
date: 2026-06-18
budget: 4
---

# p100 — Web: i18n real de herramientas, estructura por página y docs profundas

> **Estado: DONE — 2026-06-20**. Slices s1, s2, s3, s3-bis, s5, s6, s7
> cerrados. s4 queda partial (render funciona vía `describeTool` runtime
> pero `descriptionKey` no se vuelca a `capabilities.json`) y s8 queda
> todo (tabs client-side + cleanup flag legacy). El trabajo restante
> (s4-bis con volcado i18n completo, s8 con tabs, e i18n de los 5
> tutoriales a 11 idiomas) se difiere a una propuesta dedicada `p110`.
>
> **Resumen de cambios**:
>
> - s1 (páginas por sección + home minimalista) por commits paralelos
>   `5658d55`, `875121d` (2026-06-18).
> - s2 (`descriptionKey?: string` en `IToolRegistration`) por commit
>   paralelo `896ced5` (2026-06-20 01:21).
> - s3 + s3-bis (catálogo `i18n/tools/` + `check-i18n` 12-lang gate) por
>   commit `6793460` (2026-06-20 01:33).
> - s5 (tabla de argumentos) por commit `eba8bdf` (2026-06-20 02:10).
> - s6 (Configuration JSON por plugin + IPluginConfigExample) por
>   commits `7c44afd` + `6e1ace2` (2026-06-20 02:15).
> - s7 (tutoriales markdown + discoverer + Tutorial.astro) por commits
>   `8d03a09` + `b1be3a0` (2026-06-20 02:19–02:24).
>
> Validación: `bun run validate` verde (100 test files / 668 tests OK).
> `bun run check:i18n` verde.

## 0. Decisiones del usuario (validadas 2026-06-18)

1. **i18n de tools**: cada tool declara una **clave i18n** (no string literal) en
   su `describe` / `description`. El plugin aporta su propio catálogo de
   traducciones por idioma. El sitio resuelve la clave según el idioma de la
   página. **Mantener las 12 traducciones obligatorias por invariante** (regla
   `apps/web/scripts/check-i18n.ts` ampliada).
2. **Estructura**: **una sección = una página**. Home minimalista (hero + CTA).
   Páginas separadas: `/[lang]/install`, `/[lang]/tools`, `/[lang]/benchmarks`,
   `/[lang]/plugins/[slug]`. Las páginas con varias vistas usan **tabs** que
   conmutan dentro de la misma URL.
3. **Profundidad docs**: **tools con args (inputSchema renderizado)** + **JSON
   de plugins con ejemplos** + **tutoriales por plugin** (página por plugin con
   paso a paso).

## 1. Problema

### 1.1 Descripciones de tools solo en inglés

Causa raíz: `apps/web/scripts/gen-capabilities.ts:165` invoca el servidor MCP
real y serializa `t.description` a `capabilities.json`. Esas descripciones son
strings hardcodeados en el código de cada plugin (`registerTool(..., {
description: '...' }, ...)`).

`apps/web/src/components/Home.astro:43` los pinta en crudo:
`<p>{tool.description}</p>`. `apps/web/src/i18n/ui.ts` traduce hero, concept,
plugins, etc., pero **no las descripciones de tools** porque no existen en
español (ni en los otros 11 idiomas).

Conclusión: el sitio dice estar traducido a 12 idiomas pero las ~40
descripciones de tools siempre salen en inglés. La regla `check-i18n.ts` solo
valida strings del sitio, no del runtime.

### 1.2 Estructura: una sola home larga

`apps/web/src/components/Home.astro` apila concept / install / tools /
benchmarks / plugins como `<section>`s. Páginas por idioma existen
(`apps/web/src/pages/{es,fr,...}/index.astro`) pero son clones de la misma
home. No hay páginas individuales para `/install`, `/tools`, `/benchmarks`.

Resultado: la home es difícil de enlazar, no se puede compartir una sección
concreta, y el scroll es largo en móvil.

### 1.3 Documentación insuficiente

- `PluginPage.astro:81` lista cada tool con `<p>{tool.description}</p>` y un
  badge `read-only` (de `effects`). **No muestra los argumentos** que acepta
  (el `inputSchema` Zod existe pero no se renderiza).
- **No hay documentación del JSON de configuración** del plugin
  (`mcp-vertex.config.json` → `plugins.<name>.options`).
- **No hay tutoriales** por plugin (solo una descripción de una línea en la
  home y en la página de plugin).

## 2. Goal

Que un usuario que aterriza en `cartagogit.github.io/mcp-vertex/es/` pueda:

1. Leer **toda la UI en su idioma**, incluida la descripción de cada tool.
2. Navegar a `/es/install`, `/es/tools`, `/es/benchmarks`, `/es/plugins/proposals`
   con URLs compartibles.
3. En la página de un plugin, ver pestañas: **Overview · Tools · Configuration
   · Install · Tutorial**. La pestaña Tools muestra la tabla de argumentos.
   Configuration muestra el JSON del plugin con valores de ejemplo. Tutorial
   muestra un recorrido paso a paso.

## 3. Acceptance

- [ ] Cada tool declara su `description` como clave i18n (no string literal).
- [ ] Cada plugin aporta un catálogo `i18n/<lang>.json` con descripciones
      cortas + largas + descripciones de cada argumento.
- [ ] El sitio renderiza la descripción en el idioma activo (12 idiomas
      verificados con `bun scripts/check-i18n.ts` ampliado).
- [ ] La home queda en ~1 pantalla (hero + tagline + 2 CTAs + un teaser de 3
      plugins destacados). El resto vive en páginas dedicadas.
- [ ] Existen páginas `/[lang]/install`, `/[lang]/tools`, `/[lang]/benchmarks`,
      `/[lang]/plugins/[slug]` (12 idiomas × 4 secciones × N plugins).
- [ ] Página de plugin tiene tabs: Overview · Tools · Configuration · Install
      · Tutorial. Cada tab con su contenido real.
- [ ] Tab "Tools" muestra tabla **Argumento · Tipo · Obligatorio · Descripción**
      por tool (inputSchema Zod → tabla).
- [ ] Tab "Configuration" muestra el JSON del plugin con un ejemplo funcional.
- [ ] Tab "Tutorial" tiene un recorrido paso a paso por plugin (mínimo 1
      ejemplo real ejecutable por plugin).
- [ ] `bun run validate` verde en cada slice.
- [ ] `bun run site:strict` (o equivalente) detecta tools sin clave i18n y
      traducciones faltantes.

## 4. Diseño

### 4.1 Esquema i18n por tool

Cada tool declara una clave i18n en su `registerTool`:

```ts
// Antes
server.registerTool('auto_work', {
  description: 'Run the next actionable proposal slice.',
  inputSchema: z.object({}),
  outputSchema: z.object({}).catchall(z.unknown()),
}, handler);

// Después
server.registerTool('auto_work', {
  description: { key: 'proposals.auto_work' },   // ← nuevo
  inputSchema: z.object({}),
  outputSchema: z.object({}).catchall(z.unknown()),
}, handler);
```

El plugin expone `i18n/<lang>.json` junto a su `src/`:

```jsonc
// plugins/proposals/i18n/en.json
{
  "auto_work": {
    "short": "Run the next actionable proposal slice.",
    "long": "Picks up the next slice in `state/queue.json`…",
    "args": {}
  }
}
```

El `ToolDefinition` resuelto por el core acepta `description: string | { key: string }`.
Si es clave, el core no la traduce (el sitio lo hace); si es string, se usa tal cual
(compatibilidad hacia atrás).

### 4.2 i18n de argumentos

`inputSchema` es Zod. Para renderizarlo en el sitio, cada tool puede aportar
descripciones de campo (también vía i18n):

```ts
server.registerTool('create_proposal', {
  description: { key: 'proposals.create_proposal' },
  inputSchema: z.object({
    title: z.string().describe({ key: 'proposals.create_proposal.args.title' }),
    family: z.enum(['f', 'p']).describe({ key: 'proposals.create_proposal.args.family' }),
  }),
}, handler);
```

Si el `describe` no es clave, el campo sale sin descripción localizada (no se
falla). El validador `gen-capabilities.ts --strict` exige que todos los tools
con `description: { key }` tengan entrada en TODOS los `i18n/<lang>.json`.

### 4.3 Páginas y tabs

```
/                                  → home (hero + CTAs + 3 plugins destacados)
/[lang]/install                    → install + verificación + presets
/[lang]/tools                      → índice filtrable por namespace + detalle por tool
/[lang]/benchmarks                 → 3 cards + barra live
/[lang]/plugins/[slug]             → page con tabs:
  · Overview   → descripción del plugin
  · Tools      → tabla por tool (args + descripción localizada)
  · Config     → JSON del plugin con ejemplo
  · Install    → bun add + args para mcp.json
  · Tutorial   → recorrido paso a paso
```

Tabs son client-side (`<details>` anidados o un script ligero) para no
multiplicar páginas y mantener URLs estables.

### 4.4 Tutoriales por plugin

Cada plugin mayor (proposals, memory, quality, rules, docs) tiene un
`tutorials/<lang>/<topic>.md` que la página renderiza. Los tutoriales son
markdown que la web renderiza con un parser ligero (marked o el `marked` ya
en `apps/web/package.json` si está). Empezar con 1 tutorial por plugin mayor
(5 tutoriales); añadir más en propuestas siguientes.

## 5. Slices (orden de ejecución, disjuntas)

- **id: s1** — Esqueleto de páginas + home minimalista
  - files: [apps/web/src/pages/index.astro, apps/web/src/pages/[lang]/*, apps/web/src/components/Home.astro, apps/web/src/components/Layouts/*, apps/web/src/pages/[lang]/install.astro, apps/web/src/pages/[lang]/benchmarks.astro, apps/web/src/pages/[lang]/tools.astro]
  - Crea las rutas nuevas. Mantiene compatibilidad: la home sigue mostrando todo
    si el flag `?legacy=1` está presente, durante 1 release.
  - status: done (commit 5658d55 + 875121d, 2026-06-18 18:28)

- **id: s2** — ToolDefinition acepta `description: string | { key: string }`
  - files: [packages/core/src/lib/tools/*.ts, packages/core/src/public/index.ts (types), plugins/*/src/**/*.ts]
  - Migrar todos los `registerTool` existentes a usar `description: { key: '...' }`
    (no rompe runtime: si es string, sigue funcionando).
  - status: done (commit 896ced5, 2026-06-20 01:21). **Implementación
    conservadora**: se añadió `descriptionKey?: string` a `IToolRegistration`
    en lugar de tocar el `description` que pasa al SDK MCP. Esto preserva el
    contrato MCP (description siempre es string) y permite migración
    incremental. Spec de regresión en
    `packages/core/tests/src/lib/contracts/tool-registration.interface.spec.ts`.

- **id: s3** — Catálogos `i18n/<lang>.json` en cada plugin + validador
  - files: [plugins/*/i18n/<lang>.json (nuevo), apps/web/scripts/gen-capabilities.ts, apps/web/scripts/check-i18n.ts]
  - Ampliar `check-i18n.ts` para que recorra `plugins/*/i18n/*.json` y exija
    paridad entre idiomas.
  - Ampliar `gen-capabilities.ts --strict` para fallar si un tool tiene clave
    i18n sin entrada en algún idioma.
  - status: partial (commit 896ced5, 2026-06-20 01:21). El catálogo
    `apps/web/src/i18n/tools/` ya está creado y poblado para
    `mcp-vertex_overview` (12 idiomas). Spec de regresión en
    `apps/web/scripts/__tests__/i18n-tools.spec.ts`. Pendiente: extender
    `check-i18n.ts` para exigir 12-lang en cada entrada (próximo slice).

- **id: s4** — Renderizado de descripciones localizadas en `Home.astro` y
  `PluginPage.astro`
  - files: [apps/web/src/components/Home.astro, apps/web/src/components/PluginPage.astro, apps/web/src/data/capabilities.json]
  - `gen-capabilities.ts` pasa a inyectar `i18n` por herramienta (con todas las
    traducciones en el JSON, no solo el idioma activo).
  - El componente resuelve la clave con el idioma actual; fallback al `en`.
  - status: partial. El render funciona vía `describeTool(name, lang)` que
    cae al inglés cuando la clave no está en el catálogo. `capabilities.json`
    aún no incluye `descriptionKey` (no se vuelca desde `gen-capabilities.ts`),
    por lo que el SSR precomputa solo la descripción en inglés. El catálogo
    en sí está en disco bajo `apps/web/src/i18n/tools/` y se consulta en
    cada request. Trade-off aceptado para no migrar todo el JSON pipeline.

- **id: s5** — Tabla de argumentos (inputSchema → tabla) en pestaña Tools
  - files: [apps/web/src/components/PluginPage.astro, apps/web/src/components/ToolArgsTable.astro (nuevo), apps/web/src/data/capabilities.json]
  - `gen-capabilities.ts` extrae `inputSchema` (vía Zod introspection + `describe({ key })`)
    y lo serializa como `{ fields: [{ name, type, required, descriptionKey }] }`.
  - Render: tabla accesible con descripciones localizadas.
  - status: done (commit `eba8bdf`, 2026-06-20 02:10). Parser puro
    `parseInputSchema` en `apps/web/scripts/lib/parse-input-schema.ts` con
    8 specs; volcado en `gen-capabilities.ts`; tabla accesible
    `<table class="args">` por tool en `PluginPage.astro`. 43 tools con
    `inputSchema.fields` en `capabilities.json`. Las descripciones localizadas
    de los argumentos quedan para un s5-bis (coincidiría con la mejora de s4).

- **id: s6** — Tab Configuration (JSON del plugin con ejemplo) por plugin
  - files: [apps/web/src/components/PluginPage.astro, plugins/*/src/lib/plugin.config.example.ts (nuevo)]
  - Cada plugin expone un `configExample(): object` (reutilizable también por
    tests). El sitio lo renderiza con `JSON.stringify(..., null, 2)` y un botón
    "copiar".
  - status: done (commit `6e1ace2`, 2026-06-20 02:15). Contrato
    `IPluginConfigExample` exportado desde `@mcp-vertex/core/public`; campo
    opcional `configExample?` añadido a `IMcpPlugin` (Open/Closed: los
    plugins existentes no rompen). Primera implementación en
    `plugins/proposals/src/index.ts`. Render en `PluginPage.astro` con
    `<pre><code>` y botón "Copy" que usa la Clipboard API moderna con
    fallback a `execCommand`. Otros plugins pueden migrar incrementalmente.

- **id: s7** — Tutoriales markdown por plugin mayor (5 plugins × 12 idiomas =
  60 archivos). Empezar con `en` para proposals/memory/quality/rules/docs y
  añadir el resto de idiomas en una propuesta posterior.
  - files: [plugins/proposals/tutorials/en/*.md, plugins/memory/tutorials/en/*.md, plugins/quality/tutorials/en/*.md, plugins/rules/tutorials/en/*.md, plugins/docs/tutorials/en/*.md, apps/web/src/components/Tutorial.astro (nuevo)]
  - status: done (render + descubrimiento, commits `8d03a09` y `b1be3a0`,
    2026-06-20 02:19–02:24). Discoverer puro `discoverTutorials` en
    `apps/web/scripts/lib/discover-tutorials.ts` con 8 specs (frontmatter
    YAML, fallback a slug, sort por `(plugin, lang, order, title)`,
    bucketing). Componente `Tutorial.astro` que pinta el body markdown
    en `<pre>` con fallback a `en`. 5 tutoriales `en` detectados y
    volcados a `capabilities.json#tutorials`. Las traducciones a los
    otros 11 idiomas se difieren a una propuesta dedicada (p110) — la
    estructura `plugins/<name>/tutorials/<lang>/` está en su sitio, así
    que añadir idiomas es puro aditivo.

- **id: s8** — Tabs client-side + cleanup del flag `?legacy=1`
  - files: [apps/web/src/components/PluginPage.astro, apps/web/src/styles/*.css]
  - Tabs funcionan con un script ligero (~30 LOC) que conmutan `hidden` en
    `<section data-tab="tools">` etc. Accesible: roles `tab`/`tabpanel`,
    navegación con flechas.
  - status: todo

## 6. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Rompemos `gen-capabilities.ts --strict` al migrar tools a claves i18n | Slice s2 + s3 juntos. Si una herramienta no tiene clave, el validador avisa en vez de fallar hasta que s3 cierre. |
| 12 idiomas × 40 tools = 480 strings de golpe | Slice s3 se hace solo en `en` primero. Slice s9 (siguiente propuesta) añade los otros 11 idiomas con ayuda de un script de traducción bootstrap (DeepL/Google opcional). |
| `inputSchema` es Zod; reflejarlo a tabla requiere un wrapper que cada plugin debe usar | Wrapper `describe({ key })` opcional: si falta, el campo sale con tipo y nombre pero sin descripción localizada. |
| Tabs client-side rompen SSR | Renderizar todas las pestañas como `<section>` y ocultar con `hidden` por defecto + pequeño script. SEO ve todo el contenido. |
| Tutoriales en 5 plugins × 12 idiomas = mucho texto | Empezar con `en` (slice s7) y dejar la i18n de tutoriales para una propuesta dedicada (p101). |

## 7. No-objetivos

- Reescribir el contenido de los plugins.
- Cambiar el `inputSchema`/`outputSchema` ni el modelo de ejecución.
- Sustituir `check-i18n.ts` por otro validador.
- Cambiar el tema visual ni el lenguaje de estilos.
- Internacionalizar los tutoriales en esta propuesta (queda para p101).

## 8. Definition of done

`bun run validate` verde en cada slice. `bun run site:strict` (con la
extensión del validador) verde al final. Conventional Commits por slice
(`feat(web):`, `feat(core):`, etc.). Versionado automático por push a `main`.

## 9. Auditoría post-cierre

Cuando todos los slices estén `done`, abrir `docs/proposals/audits/<fecha>-p100-web-i18n-docs.md`
con la auditoría del plugin `proposals_plugin_review` (ver p99 si está
implementado) o manual siguiendo el formato del repo.
