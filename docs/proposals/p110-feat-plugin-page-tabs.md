---
id: p110
type: proposal
status: in-progress
track: web+i18n+docs
date: 2026-06-20
related:
  - p100 # web+i18n+docs (s4 + s8 deferred to this proposal in commit dd07089)
---

# p110 — Plugin page tabs client-side + dump `descriptionKey` en `capabilities.json`

> **Estado: EN CURSO.** Esta propuesta cierra los dos slices que el
> cierre de p100 (`dd07089`, 2026-06-20) difirió explícitamente a un
> seguimiento: **s4** (volcar `descriptionKey` en
> `capabilities.json` desde `gen-capabilities.ts`) y **s8** (tabs
> client-side en `PluginPage.astro`). El orden de ejecución es s8
> primero (la UI ya está lista) y s4 después (es un script, no toca
> la web).

## 1. Contexto y motivación

El commit `dd07089` cierra p100 con s4 y s8 diferidos:

> - s4 — `descriptionKey` is not yet dumped into `capabilities.json`;
>   the render works via runtime `describeTool()` lookup, so users
>   see the translated description when the catalogue has an entry,
>   but SSR precomputes only the English copy. Cheap to close when a
>   follow-up wants it.
> - s8 — Client-side tabs on `PluginPage` (Overview · Tools ·
>   Configuration · Tutorial).

El slice s8 ya tiene implementación prototipo:
- `apps/web/src/components/PluginTabs.astro` (nuevo): wrapper
  ARIA-correct con roles `tab`/`tabpanel`, navegación por flechas,
  Roving tabindex, script client-side inline.
- `apps/web/src/components/PluginPage.astro`: refactor para usar
  `<PluginTabs>` con cada panel envuelto en
  `<section data-tab-panel="X" hidden>`; el array `tabs` se calcula
  en el padre, omitiendo `configuration` cuando no hay `configExample`
  y `tutorial` cuando el plugin no tiene tutoriales.
- `apps/web/src/i18n/langs/<lang>.ts` (12 idiomas) + `shared.ts`: 4
  nuevas claves (`tabInstall`, `tabTools`, `tabConfiguration`,
  `tabTutorial`). El gate `bun scripts/check-i18n.ts` exige
  paridad 12-lang, así que las nuevas claves se añadieron
  simultáneamente en todos los idiomas.

El slice s4 aún está pendiente: `gen-capabilities.ts` no vuelca las
descripciones localizadas en `capabilities.json`. Hoy, la descripción
se resuelve en runtime con `describeTool()` (idioma activo + fallback
a `en`), pero el SSR precomputa solo la copia inglesa, lo que
significa que `capabilities.json` (consumido por home + páginas de
plugins) muestra siempre la descripción en inglés para tools que aún
no están en el catálogo.

## 2. Lo que se quiere

### 2.1 s8 — Tabs client-side (cierre)

1. **`<PluginTabs>` con roles ARIA correctos**: `role="tablist"` en el
   `<nav>`, `role="tab"` en cada botón, `role="tabpanel"` en cada
   panel; `aria-selected`, `aria-controls`, `tabindex` (roving).
2. **Script client-side inline** (~50 LOC): click activa, ArrowLeft /
   ArrowRight / Home / End navegan. Solo CSS, sin framework JS.
3. **Tabs condicionales**: el padre decide qué tabs existen; el
   componente renderiza solo las que recibe.
4. **No rompe SEO**: todos los paneles se renderizan al SSR; el
   script solo añade `hidden` excepto al activo.

### 2.2 s4 — Dump `descriptionKey` en `capabilities.json`

1. `gen-capabilities.ts` resuelve `descriptionKey` por tool (vía
   `describeTool(name, 'en') ?? tool.description`) y la inyecta en
   el objeto serializado.
2. `PluginPage.astro` consume `descriptionKey` para mostrar la
   descripción localizada **en SSR** sin esperar al script
   client-side.
3. Spec de regresión: `apps/web/scripts/__tests__/gen-capabilities.spec.ts`
   (o el spec que ya exista) verifica que `descriptionKey` aparece en
   al menos un tool del JSON emitido.

### 2.3 Limpieza

- Quitar el flag `?legacy=1` (introducido en p100 s1 como puente
  para no romper URLs). El componente Home minimalista está activo
  en todas las URLs sin flag; el flag ya no tiene efecto.
- Actualizar el frontmatter de p110 a `status: done` cuando ambos
  slices cierren.

## 3. Diseño técnico

### 3.1 `PluginTabs.astro` (s8 — ya implementado)

```astro
---
interface Props {
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly defaultTab?: string;
}
const { tabs, defaultTab } = Astro.props as Props;
const initial = defaultTab ?? tabs[0]?.id ?? '';
---

<section class="plugin-tabs" data-plugin-tabs data-default-tab={initial}>
  <nav class="plugin-tabs__bar" aria-label="Plugin sections">
    <ul role="tablist" class="plugin-tabs__list">
      {tabs.map((t) => (
        <li role="presentation">
          <button
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            class="plugin-tabs__tab"
            data-tab-trigger={t.id}
            aria-selected={t.id === initial ? 'true' : 'false'}
            aria-controls={`panel-${t.id}`}
            tabindex={t.id === initial ? 0 : -1}
          >
            {t.label}
          </button>
        </li>
      ))}
    </ul>
  </nav>
  <div class="plugin-tabs__panels">
    <slot />
  </div>
</section>

<script is:inline>
  // Minimal ARIA tabs controller — see file for full impl.
</script>

<style>/* tabs.css */</style>
```

### 3.2 `gen-capabilities.ts` cambio (s4)

```typescript
// Resolve localized description at build time via the catalogue.
// Today: description: tool.description (always English)
// After: description: tool.description, descriptionKey: resolveKey(name)
const enrichDescription = (tool: ITool) => {
  const localizedEn = describeTool(tool.name, 'en');
  return {
    ...tool,
    description: localizedEn ?? tool.description,
    descriptionKey: localizedEn ? tool.name : undefined,
  };
};
```

### 3.3 Limpieza del flag legacy

- Quitar `?legacy=1` de `apps/web/src/pages/index.astro` y de
  cualquier rama condicional que aún exista en `Home.astro`.
- Verificar con `bun run site` que la home renderiza idéntica con y
  sin el flag.

## 4. Slices (orden de ejecución, disjuntas)

| # | Slice | Archivos | Tests | DoD |
|---|---|---|---|---|
| s8 | Tabs client-side | `PluginTabs.astro` (nuevo), `PluginPage.astro` (refactor), `i18n/langs/*.ts` + `shared.ts` (4 claves), `apps/web/scripts/check-i18n.ts` (gate verde) | 26 existentes verde; manual en navegador | `bun run validate` verde, page renderiza tabs, click cambia panel, ArrowLeft/Right navega |
| s4 | Dump `descriptionKey` | `apps/web/scripts/gen-capabilities.ts`, `apps/web/src/data/capabilities.json` (regenerated), `PluginPage.astro` (consume `descriptionKey`) | nuevo spec `gen-capabilities.spec.ts` con 2 tests | JSON contiene `descriptionKey` para tools en el catálogo; SSR muestra la copia localizada |
| s-cleanup | Quitar `?legacy=1` | `apps/web/src/pages/index.astro`, `Home.astro` | verificar render idéntico | grep no encuentra `?legacy=` en producción |

## 5. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Script client-side rompe SSR si el navegador no soporta `data-*` | Fallback: si JS no corre, todos los paneles son visibles (acceptable; el SEO ve todo). |
| `descriptionKey` apunta a un catálogo vacío (tool no migrada) | Fallback al `description` runtime (idioma actual → `en`). El spec cubre el caso "key sin entry". |
| Tabs condicionales cambian el orden de los headings | `<h2>` queda dentro de cada `<section data-tab-panel>`, así que el heading order es estable independientemente de qué tab esté activa. |
| Limpieza del flag `?legacy=1` rompe algún link externo | `?legacy=1` se ignora silenciosamente si no existe la rama; el grep previo debe encontrar 0 referencias en docs. |

## 6. Definición de done

- `bun run validate` verde en cada slice.
- `bun scripts/check-i18n.ts` verde (12-lang × 17+ keys).
- `bun run site` renderiza la página de plugin con tabs
  funcionales.
- Conventional Commits: 1 commit por slice (`feat(web):`,
  `feat(scripts):`).
- CHANGELOG actualizado.
- Frontmatter de p110 → `status: done` con `closed: <fecha>` y
  `shipped-in: [<hashes>]` al cerrar.

## 7. Estado

- s8: ⏳ implementación prototipo lista (PluginTabs.astro +
  PluginPage.astro refactor + 4 claves i18n). Pendiente: commit y
  verificación manual en navegador.
- s4: ⏳ idea (script + spec + JSON regen).
- s-cleanup: ⏳ idea.

## 8. Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Tabs como componente separado (`PluginTabs.astro`) | sí | SOLID: el componente encapsula ARIA + script; `PluginPage.astro` solo decide qué tabs existen. |
| Tabs condicionales (omitir `configuration` cuando no hay configExample) | sí | Mejor UX que mostrar tabs vacías. El padre calcula el array. |
| `descriptionKey` resuelto en SSR (gen-capabilities) vs runtime | SSR | SEO ve el contenido correcto; el render del sitio no depende del catálogo i18n cargado en runtime. |
| Limpiar `?legacy=1` en esta propuesta | sí | El flag fue introducido como puente en p100 s1 (commits 5658d55, 875121d); ya no tiene efecto y solo añade código muerto. |
