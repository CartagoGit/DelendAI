---
id: l101
type: proposal
status: done
track: web+i18n+docs
date: 2026-06-18
budget: 3
closed: 2026-06-18
kind: legacy
title: Header persistente con transiciones + surface completo en la web
---

# l101 — Header persistente con transiciones + surface completo en la web

> **Estado: TODO para revisión.** Continúa l100 con tres frentes: (1)
> header persistente con View Transitions de Astro, (2) ampliar el
> `gen-capabilities.ts` para enumerar prompts/resources/knowledge (no
> solo tools), y (3) hacer que el dev server regenere la API de TypeDoc
> al arrancar. Decisiones validadas con el usuario 2026-06-18.

## 0. Contexto y motivación

Después de l100 la web ya tiene estructura de páginas (home minimalista +
`/install`, `/tools`, `/benchmarks`, `/plugins/[slug]`) y el sitio traduce
la chrome a 12 idiomas. Pero quedan **3 problemas que rompen la UX y la
documentación**:

1. **Header inconsistente entre páginas.** Cada navegación es un full
   reload. El `SiteNav.astro` se duplica y Astro lo descarta entre
   páginas, así que el header "salta" en vez de quedarse fijo.

2. **La documentación solo cubre `tools`.** El servidor MCP expone
   también `prompts` y `resources` (vía el protocolo nativo), y el core
   tiene un sistema de `knowledge` propio. `gen-capabilities.ts` solo
   llama a `client.listTools()` y la web ignora las otras dos terceras
   partes del surface. Los usuarios que leen la web no saben que existen
   prompts como `proposals_work` o resources como
   `knowledge://git-orientation`.

3. **El dev server sirve una API de TypeDoc desactualizada.** `bun run
   site` corre `typedoc` antes de `astro build`, pero `bun run dev`
   arranca `astro dev` directamente y lee `apps/web/public/api/` del
   último build — si la API es de hace 2 semanas, el desarrollador está
   trabajando contra docs muertas.

## 1. Goals

1. **Header persistente** entre páginas, con transición suave.
2. **`/prompts`, `/resources`, `/knowledge` documentados** en 12 idiomas,
   con descripciones, argumentos (prompts) y `mimeType` (resources).
3. **`astro dev` regenera la API docs** al arrancar, para que el
   desarrollador siempre vea la versión actual.
4. **Build sigue en verde**: `bun run validate` y `bun run site:strict`
   sin regresiones; ninguna i18n key queda faltante.

## 2. No-objetivos

- Cambiar el `outputSchema` ni el modelo de ejecución.
- Internacionalizar los tutoriales (eso queda en l100 slice s7).
- Reescribir el `gen-capabilities.ts` completo — solo ampliar.
- Sustituir el theme switcher ni el language switcher.
- Cambiar el sistema de release ni el versionado.

## 3. Diseño

### 3.1 View Transitions + header persistente

Astro 6 expone `astro:transitions` con un `<ClientRouter />` que
habilita la View Transitions API del navegador. Cambios:

- En `apps/web/src/layouts/Base.astro`, importar `ClientRouter` de
  `astro:transitions` y añadirlo dentro de `<head>`.
- En `apps/web/src/components/SiteNav.astro`, marcar `<nav class="nav">`
  con `transition:persist` (directiva de Astro) para que se mantenga
  entre páginas.
- En `apps/web/src/components/SiteFooter.astro`, igual con
  `transition:persist`.
- En `apps/web/src/components/Config.astro` (modal de ajustes), marcar
  el `<div class="modal" id="cfg-modal">` con `transition:persist` para
  que el estado del modal (abierto/cerrado) sobreviva a la navegación.
- CSS: añadir una regla `::view-transition-old(nav)` /
  `::view-transition-new(nav)` con `animation-duration: 0.2s` para que
  el header se mantenga visible (sin fade) y solo el contenido haga
  fade. Usar `view-transition-name: nav` para anclar el header.

El script inline del `Config.astro` y del `Base.astro` (theme/motion
pre-paint) se re-ejecutará en cada navegación gracias al evento
`astro:page-load`. Hay que escuchar ese evento además del `DOMContentLoaded`
para que el theme persista tras una transición.

### 3.2 gen-capabilities.ts ampliado

`apps/web/scripts/gen-capabilities.ts:165` llama a
`client.listTools()`. Ampliarlo:

```ts
const { tools, prompts, resources } = await Promise.all({
  tools: client.listTools(),
  prompts: client.listPrompts(),
  resources: client.listResources(),
});
// Y el overview tool ya devuelve `knowledge`; reusar.
```

Salida del JSON: añadir
`prompts: [{ name, description, arguments? }]`,
`resources: [{ uri, name, description, mimeType? }]`,
`knowledge: [{ id, title, plugin }]` (leído del `overview` tool).
Counts: `prompts`, `resources`, `knowledge` añadidos al `counts`.

`SKILL_PLUGINS` no se enumera desde el MCP server porque las skills son
**artefactos de scaffold** (ver §3.5). El site los lista estáticamente
leyendo `plugins/<name>/SKILL.md` o `plugins/<name>/skills/*.md` cuando
existan.

### 3.3 Páginas nuevas: `/prompts`, `/resources`, `/knowledge`

Mismo patrón que `/tools` y `/plugins`:

- `apps/web/src/pages/prompts.astro` (en) + `apps/web/src/pages/{lang}/prompts.astro` × 11.
- Idem para `resources` y `knowledge`.
- Componentes: `PromptsSection.astro`, `ResourcesSection.astro`,
  `KnowledgeSection.astro`. Cada uno itera `capabilities.prompts` /
  `capabilities.resources` / `capabilities.knowledge` agrupados por
  plugin.
- `gen-section-pages.sh` (existente, creado en l100) se amplía con 3
  secciones más.
- i18n: añadir `prompts.title`, `prompts.lead`, `prompts.count`,
  `resources.title`, `resources.lead`, `resources.count`,
  `knowledge.title`, `knowledge.lead`, `knowledge.count` al `ui.ts`
  en los 12 idiomas.

### 3.4 dev server regenera API docs

`apps/web/package.json`:

```diff
- "dev": "PAGES_BASE='' astro dev"
+ "dev": "bun run docs:api && PAGES_BASE='' astro dev"
```

`docs:api` ya existe en el root `package.json` (`typedoc`). El coste es
~5–10 s al arrancar el dev server, pero garantiza que `apps/web/public/api/`
está sincronizado.

Si en el futuro se quiere watch-mode (regenerar en cada cambio de TS),
eso es un plugin de Astro que se puede añadir después sin tocar este
script. La regla "regenerar al arrancar" es suficiente para el 90% del
flujo: el dev server se reinicia cuando cambias config o instalas deps,
y en ese momento regenerará la API.

### 3.5 Página de skills (artefactos de scaffold)

`ISkillEntry` no se materializa en runtime MCP (es solo contracto de
plugin), pero el core tiene un `build-blueprint.ts:117` que **genera
skills como artefactos de scaffold** cuando creas un nuevo proyecto.

La web debe documentar eso. La página `/skills` se construye leyendo:

- `apps/web/src/data/skills.json` (estático, versionado).
- Cada skill: `{ name, plugin, description, body }` (resumen del body).
- Generado por un script `gen-skills.ts` que escanea
  `plugins/*/SKILL.md` y `plugins/*/skills/*.md` y extrae frontmatter
  + primer párrafo. Si no encuentra nada, fallback a la lista del
  `IBlueprintArtifact[]` del `build-blueprint.ts`.

Página `apps/web/src/pages/skills.astro` (en) + 11 idiomas, componente
`SkillsSection.astro` y entrada en `gen-section-pages.sh`.

## 4. Slices (orden de ejecución, disjuntas)

- **id: s1** — View Transitions + header persistente.
  - files: [apps/web/src/layouts/Base.astro, apps/web/src/components/SiteNav.astro,
    apps/web/src/components/SiteFooter.astro, apps/web/src/components/Config.astro,
    apps/web/src/styles/global.scss]
  - Cero cambio de comportamiento visible si Astro 6 ya tiene la feature
    estable (verificar primero). Si hay issue, fallback: sin transiciones
    pero header y footer marcados `transition:persist` igual (no-op
    sin ClientRouter pero no rompe).
  - status: todo

- **id: s2** — `gen-capabilities.ts` enumera prompts/resources/knowledge.
  - files: [apps/web/scripts/gen-capabilities.ts, apps/web/src/data/capabilities.json]
  - Mantener compat: si `listPrompts`/`listResources` no existen en el
    SDK (versión vieja), fallback a omitir el campo. No romper
    el --strict mode.
  - status: todo

- **id: s3** — Páginas `/prompts`, `/resources`, `/knowledge` + componentes.
  - files: [apps/web/src/components/PromptsSection.astro, apps/web/src/components/ResourcesSection.astro,
    apps/web/src/components/KnowledgeSection.astro, apps/web/src/pages/prompts.astro,
    apps/web/src/pages/resources.astro, apps/web/src/pages/knowledge.astro, scripts/gen-section-pages.sh,
    apps/web/src/i18n/ui.ts]
  - Reusar `gen-section-pages.sh` de l100. Añadir las 3 secciones al loop.
  - Añadir 9 i18n keys × 12 idiomas = 108 entradas nuevas.
  - status: todo

- **id: s4** — `astro dev` regenera API docs al arrancar.
  - files: [apps/web/package.json]
  - Una línea. Validar que `bun run dev` arranca sin error.
  - status: todo

- **id: s5** — Página `/skills` con artefactos de scaffold.
  - files: [apps/web/scripts/gen-skills.ts (nuevo), apps/web/src/components/SkillsSection.astro,
    apps/web/src/pages/skills.astro, scripts/gen-section-pages.sh, apps/web/src/i18n/ui.ts,
    apps/web/src/data/skills.json (generado)]
  - El gen-skills.ts es nuevo: escanea `plugins/*/SKILL.md` y
    `plugins/*/skills/*.md`, extrae frontmatter YAML + body. Si el plugin
    no tiene SKILL.md, fallback al `IBlueprintArtifact[]` del core.
  - status: todo

## 5. Acceptance

- [ ] El header no "salta" al navegar entre páginas; el contenido hace
      fade suave.
- [ ] `/prompts`, `/resources`, `/knowledge` renderizan datos reales en
      12 idiomas, con descripciones localizadas (post l100 s4, en este
      slice se renderiza en inglés con fallback).
- [ ] `apps/web/src/data/capabilities.json` contiene los campos
      `prompts`, `resources`, `knowledge` con `count` y lista.
- [ ] `bun run dev` ejecuta `typedoc` antes de `astro dev`. El log lo
      muestra.
- [ ] `bun run validate` verde.
- [ ] `bun run site:strict` verde.
- [ ] `check-i18n.ts` verde: 12 idiomas × todas las keys nuevas.

## 6. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| View Transitions rompe en algún navegador | Astro hace fallback automático a full reload. Mantener el sitio funcional sin JS también (el modal/header sin persist funcionan con full reload). |
| `listPrompts`/`listResources` no existe en SDK viejo | Slice s2 detecta y omite. Build no falla. |
| 12 × 9 keys i18n nuevas = 108 traducciones a mano | Slice s3 arranca con `en` completo y deja los otros 11 idiomas con `en` como fallback en el dict. Las traducciones se añaden en una propuesta posterior (l102) usando un script de bootstrap (DeepL opcional). |
| `gen-skills.ts` no encuentra nada | Fallback al `IBlueprintArtifact[]` del `build-blueprint.ts` que tiene al menos las skills de scaffold del core. La página nunca queda vacía. |
| `typedoc` tarda >10s en dev | El dev server sigue siendo rápido al recargar; solo el primer arranque paga el coste. Se puede mover a un `predev` separado si molesta. |

## 7. Definition of done

- `bun run validate` verde en cada slice.
- `bun run site:strict` verde al final.
- Conventional Commits por slice (`feat(web):`, `feat(scripts):`).
- Sin regresión en i18n (las 9 keys nuevas en 12 idiomas).
- Documentación en [docs/PLUGINS-MCP-VERTEX.md](docs/PLUGINS-MCP-VERTEX.md) si
  cambia el contrato de un plugin.

## 8. Auditoría post-cierre

Cuando todos los slices estén `done`, abrir
`docs/proposals/audits/<fecha>-l101-web-transitions-surface.md` con la
auditoría del plugin `proposals_plugin_review` o manual siguiendo el
formato del repo.
