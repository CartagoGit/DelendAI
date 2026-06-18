---
id: p105
type: proposal
status: in-progress
track: web+i18n+docs
date: 2026-06-19
related:
  - p100 # web i18n and docs rewrite
  - p101 # header transitions and full capabilities surface
---

# p105 — Bugfixes de la web + overhaul visual / UX

> **Estado: EN CURSO — 2026-06-19.** Decisiones del usuario (mismo
> turno, modo chat): corregir bugs detectados durante una pasada manual
> por la web y, aprovechando, hacer un overhaul visual/UX de las
> páginas. Lista de bugs del usuario (literal):
>
> 1. El modal de configuración no se abre al pulsar el icono del engranaje.
> 2. Al cambiar de idioma en el modal, **solo** se traduce la home; las
>    demás páginas siguen saliendo en inglés.
> 3. La página de plugins no está integrada como el resto (doble
>    header).
> 4. La página de API no se crea al levantar el dev server, así que no
>    se puede navegar a `/api/` para verla.
> 5. Las herramientas (`/tools`) salen con la descripción en inglés, sin
>    traducir.
> 6. Las marquesinas deben mostrar **solo el icono** por defecto y, al
>    hacer hover, expandir el badge con el nombre del framework **hacia
>    la derecha** con un efecto; al quitar el ratón, el badge se
>    contrae de vuelta al icono.
> 7. Lo que sobra o está duplicado, eliminarlo.
> 8. Páginas más bonitas, más visuales, con mejor UX, y traducidas
>    correctamente en todos los idiomas.

## 0. Diagnóstico (bugs encontrados durante la pasada)

### B1 · Modal de configuración no abre

`apps/web/src/components/Config.astro:88` ejecuta
`modal?.classList.add('is-open')` al abrir. Pero
`apps/web/src/styles/components/_modal.scss:14` solo activa el modal
cuando tiene el atributo `[open]` o la clase `.modal--open`
(modificador BEM canónico). **`.is-open` ya no existe en el CSS** —
la clase se quedó huérfana tras un refactor de estilos anterior.
Resultado: `display: none` se mantiene y el modal nunca aparece.

**Fix**: alinear CSS y JS. Mantengo la convención BEM (`.modal--open`)
y actualizo `Config.astro` para usarla. Añado también una transición
suave (fade + scale) en lugar del cambio abrupto.

### B2 · Cambio de idioma solo afecta a la home

Causa raíz: dos páginas dinámicas faltan en su import block,
`apps/web/src/pages/[lang]/index.astro:3` y
`apps/web/src/pages/[lang]/plugins/[plugin].astro:5`. Ambas usan
`lang as Lang` (un type cast a un identificador que **no está
importado**), así que TypeScript trata `Lang` como `any` y no se
emite error. Astro genera el HTML con `lang="undefined"` y la UI
cae al fallback en inglés. El resto de páginas importan `Lang`
correctamente, por eso sí traducen.

`git grep "as Lang"` lo confirma: 31 sitios, 2 de los cuales no
importan `Lang`.

**Fix**: añadir `type Lang` al import de `i18n/ui` en esas dos
páginas y eliminar el cast (el tipo real es `string`, hacemos la
validación manual contra `languages` por seguridad).

### B3 · Página de plugins con doble header

`apps/web/src/pages/plugins/index.astro` ya está envuelta en
`<Base>`, que aporta `<SiteNav>` y `<SiteFooter>`. Pero además
**re-implementa su propio `<nav class="nav">`, `<main>` y
`<SiteFooter>`** dentro del slot. Resultado: dos `<nav>`,
dos footers, `<main>` anidado en otro `<main>` y un layout que
no encaja con el resto de la web.

**Fix**: dejar el archivo en la forma estándar — un `<Base>` + un
`<PluginsSection>`, como hacen las otras páginas.

### B4 · API no se crea al levantar `astro dev`

`apps/web/package.json:7` tiene `"dev": "PAGES_BASE='' astro dev"`.
El workflow `bun run site` (raíz) sí ejecuta `typedoc` antes de
construir, pero `bun run dev` (dentro de `apps/web`) no. La
carpeta `apps/web/public/api/` queda desactualizada o vacía, y el
link `API` del nav da 404 en dev.

**Fix**: prepender `bun run docs:api &&` al script dev, igual que
ya hace `bun run site`. Es ~5–10 s al arrancar; vale la pena tener
docs vivas.

### B5 · Tool descriptions no traducidas

`apps/web/scripts/gen-capabilities.ts` ensambla el server real y
serializa `tool.description` (string hardcodeado en cada plugin).
La web renderiza ese string tal cual, así que aunque la chrome está
en 12 idiomas, las ~52 descripciones de tools siempre salen en
inglés. Lo mismo aplica a `prompt.description`, `prompt.arguments[*].description`,
`resource.description`, `resource.mimeType`, `knowledge.title`.

Estrategia (mínima, sin acoplar la web al runtime):

1. Añadir un catálogo i18n por tool: `apps/web/src/i18n/tools/<tool-name>.json`
   con descripciones corta y larga + descripción por argumento.
2. En `ToolsSection.astro`, `PluginPage.astro`, `PromptsSection.astro`,
   `ResourcesSection.astro`, `KnowledgeSection.astro` y
   `PluginPage.astro`: si existe la traducción para el `lang` activo,
   se usa; si no, fallback al string original en inglés (nunca se
   renderiza vacío).
3. Gate `check-i18n` ampliado: cualquier herramienta que no tenga
   traducción en los 12 idiomas falla el build en modo strict.

Inicialmente dejamos los 12 idiomas como "fallback al inglés" (que
es lo que hoy pasa de facto). Las traducciones reales se añaden en
propuestas siguientes por idioma; la **infraestructura** ya queda
lista y verificada.

### B6 · Marquesina: nombre del framework siempre visible

`apps/web/src/styles/components/_chip.scss:32` define
`.chip__tip` con `opacity: 0` y `pointer-events: none` (correcto en
estado de reposo), pero `apps/web/src/components/Marquee.astro:18`
muestra el `<span class="chip__tip">{it.name}</span>` siempre, y el
efecto esperado por el usuario es que el chip se **expanda** hacia
la derecha en hover mostrando el nombre.

**Fix (visual)**:

- Estado de reposo: solo el icono (chip cuadrado).
- Hover/focus: el chip se expande a un **badge horizontal**
  (`width: auto`, padding lateral) con un micro-efecto de slide-in
  desde el icono hacia la derecha (transform del texto con
  `translateX(-6px)` → `translateX(0)` + fade).
- Sale del ratón: el badge se contrae de vuelta al icono.
- La marquesina **se pausa** en hover del track (ya implementado en
  `_marquee.scss:24`).

Resultado: las hileras siguen siendo compactas (solo iconos
visibles), pero cada chip es descubrible y se vuelve un badge con
nombre al señalar.

### B7 · Páginas "mínimas"

La pasada detecta que muchas páginas son esqueletos con poco
contenido, lo que las hace parecer proyectos sin terminar. Para el
overhaul visual:

- **Hero** rediseñado: gradient bg + sticky halo del logo + animación
  de aparición del título con `transition:name="page-title"`.
- **Subhero** extendido: añadir una "stat row" debajo del lead
  (métricas del surface: tools/packages/prompts/resources) en
  formato de chips.
- **ToolsSection** rediseñado: layout 2 columnas con filtro client-side
  por namespace (search box ligera) y tarjetas con efecto de borde
  gradiente al hover.
- **BenchmarksSection** rediseñado: cards con numerales grandes y
  mejor contraste; barras con animación de entrada (width desde 0).
- **PluginsSection** rediseñado: grid 2 col con tarjetas y "spark"
  visual por plugin (icono + version + descripción corta + link).
- **PromptsSection / ResourcesSection / KnowledgeSection /
  SkillsSection**: rediseño consistente con cards.
- **NotFound** rediseñado: emoji 🛰️ + un solo CTA principal.

### B8 · Lo que sobra

- `apps/web/src/pages/plugins/index.astro`: el `<nav>`, `<main>` y
  `<SiteFooter>` propios (cubierto en B3).
- Las páginas duplicadas en raíz (`pages/index.astro`,
  `pages/tools.astro`, etc.) **se mantienen** — son las versiones en
  inglés que viven en la URL limpia; no son "legacy", son la home
  inglesa. Lo aclara el comentario en cada archivo.
- `apps/web/src/pages/[lang]/plugins/[plugin].astro`: hereda el bug
  B2 (Lang no importado). Cubierto en B2.
- Imports duplicados dentro de `apps/web/src/pages/plugins/index.astro`
  (`PluginsSection` se importa dos veces).

### B9 · i18n incompleta en `es.ts`

`apps/web/src/i18n/langs/es.ts` no incluye los nuevos keys
(`nav.knowledge`, `nav.prompts`, `nav.resources`, `nav.skills`,
`nav.menu`) ni traduce `knowledge/prompts/resources/skills/notFound`
(siguen en inglés literal). El gate `check-i18n.ts` solo valida que
las **claves top-level** existan en cada idioma, no su contenido —
por eso pasó.

**Fix**: completar `es.ts` con todas las traducciones, y revisar los
otros 11 idiomas (especialmente los más incompletos: `ar`, `zh`,
`ja`, `hi`, `vi`, `th`).

### B10 · Listado de tools/prompts/knowledge por plugin (desplegable)

Hoy cada plugin tiene una página individual (`/plugins/<name>`) que
lista sus tools, y en la home `/plugins` hay un índice. Lo que
**falta** es una vista "qué tiene cada plugin al detalle" con
**desplegables colapsables** (uno por plugin) que muestren: tools
(nombre + descripción), prompts (nombre + descripción + args),
recursos (URI + MIME), knowledge entries. La idea es la misma que
la sección "el core tiene N tools, M prompts, ..." pero a nivel
de plugin, para que un usuario descubra capacidades sin tener que
entrar a 11 páginas.

Diseño (mínimo, sin libs nuevas):

- Reutilizar la `<details>` / `<summary>` nativa del navegador
  (accesible por defecto, sin JS, animación suave con
  `details::details-content` o `interpolate-size: allow-keywords`).
- Una sección por plugin en la página `/plugins` o como una nueva
  página `/capabilities` (a decidir en slice).
- Header del `<summary>`: icono del plugin + nombre + badge con
  número de tools/prompts/resources. Body: lista de items con la
  traducción del `apps/web/src/i18n/tools/<item>.ts` cuando exista,
  fallback al inglés.

### B11 · Transición al cambiar de idioma (no salto)

El cambio de idioma hoy es `location.href = ...` — recarga la
página entera, lo que se siente como un salto. Astro tiene
**View Transitions** (integrado, opt-in) que permite una transición
cross-page con animación de fundido. Activarlas es un cambio
mínimo:

- En `Base.astro` añadir `<ViewTransitions />` (o en
  `apps/web/src/layouts/Base.astro`).
- En `Config.astro`, el `<a class="lang-opt">` actual es un link
  normal; con View Transitions Astro lo intercepta y dispara la
  transición automáticamente. Sin código nuevo.
- Ajustar `transition:animate` en cada página si se quiere una
  dirección específica (slide por ejemplo).

Riesgo: View Transitions requiere JS habilitado y un build
moderno de Astro. La web ya está en Astro 6, así que es solo
activarlo. Caer en `prefers-reduced-motion` automáticamente.

### B12 · Banderas de los idiomas no aparecen

`apps/web/src/components/Config.astro:45` referencia
`l.country` para construir la URL de la bandera, pero
`apps/web/src/i18n/shared.ts:14-17` define el campo como `flag`
(no `country`). Las imágenes no se cargan (`<img src=".../flags/undefined.svg">`)
y el alt queda vacío.

**Fix**: cambiar `l.country` por `l.flag` en `Config.astro` (y en
cualquier otro consumidor que tenga el mismo error — buscar con
`grep "l\.country\|\\.country\.svg"`).

### B13 · Eliminar el subhero (es un bloque huérfano)

El subhero (`<section class="subhero">` + `_subhero.scss`) se
repite en **16 páginas** (home, install, tools, knowledge,
resources, skills, prompts, benchmarks, plugins — y sus 8
variantes `/[lang]/`) más el `PluginPage.astro`. Es un bloque
grande (breadcrumb + título + lead + meta + CTAs) que:

- Duplica información que el nav y la `<h1>` ya dan.
- Añade 3 reglas BEM (`.subhero__crumb`, `.subhero__meta`,
  `.subhero__meta-item`, `.subhero__ctas`, `.subhero__lead`)
  que hay que mantener en cada idioma.
- En la home, el hero ya cumple la misma función; en las páginas
  internas el `<h1>` del plugin/herramienta es suficiente.

**Fix**: borrar `_subhero.scss`, su import en `styles.scss`, y
reemplazar el `<section class="subhero">…</section>` de las 16
páginas + `PluginPage.astro` por **nada** (dejando que la página
empiece directamente con su `<h1>` y contenido). Si hace falta
información de "qué es esta página" se sube al `<title>` y a la
`<h1>`. El hero de la home se queda como está.

Migración esperada: −1 archivo scss, −16 secciones HTML, −1
componente. Sin pérdida funcional: el breadcrumb del subhero era
el único elemento con valor semántico real; si se quiere
mantener, se mueve a un componente `<Breadcrumb />` ligero
(mínimo, opcional, decisión para el slice).

## 1. Goals

1. El modal de configuración abre al pulsar el icono, con animación
   fade + scale.
2. Cambiar idioma en el modal traduce **toda la web**, no solo la
   home, y lo hace con **transición cross-page** (no salto).
3. La página `/plugins` usa el mismo layout que el resto (Base +
   una sección), sin dobles headers.
4. `bun run dev` regenera `apps/web/public/api/` antes de arrancar.
5. Las descripciones de tools/prompts/resources/knowledge salen en
   el idioma activo (con fallback al inglés si la traducción no
   existe aún).
6. La marquesina muestra solo iconos por defecto y expande un badge
   con el nombre al hacer hover, con efecto de slide.
7. Las páginas tienen un look más pulido: hero rediseñado, **sin
   subhero huérfano** (eliminado B13), secciones con cards
   consistentes.
8. Las banderas de los 12 idiomas aparecen en el modal de
   configuración.
9. Hay un **desplegable por plugin** con tools/prompts/resources/
   knowledge que muestra al detalle qué aporta cada uno.
10. `es.ts` y los demás idiomas están completos en las claves nuevas
    que introdujo p101.
11. `bun run validate` y `bun run site:strict` siguen verdes.

## 2. No-objetivos

- No traducir las descripciones reales de tools/prompts (eso va en
  propuesta p106 — gate + infraestructura en esta, contenido en la
  siguiente).
- No rehacer el sistema de build ni el deploy.
- No introducir nuevas dependencias.
- No tocar el core ni los plugins (solo web).

## 3. Diseño

### 3.1 Modal CSS + JS alineados

`apps/web/src/styles/components/_modal.scss`:

```scss
.modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
  &[open],
  &--open {
    display: block;
  }
  &--open .modal__backdrop {
    animation: modal-fade-in 0.18s ease both;
  }
  &--open .modal__panel {
    animation: modal-pop-in 0.22s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
}
@keyframes modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-pop-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
```

`apps/web/src/components/Config.astro`:

```ts
const open = () => {
  modal?.removeAttribute('hidden');
  modal?.classList.add('modal--open');  // ← antes: is-open
  ...
};
const close = () => {
  modal?.classList.remove('modal--open');
  modal?.setAttribute('hidden', '');
};
```

### 3.2 Lang import en las 2 páginas

`apps/web/src/pages/[lang]/index.astro` y
`apps/web/src/pages/[lang]/plugins/[plugin].astro`:

```ts
import { languages, type Lang } from '../../i18n/ui';

const { lang } = Astro.params;
const langCode = lang as Lang;
```

Sin el cast (TypeScript rechaza porque `Astro.params.lang` es
`string | undefined`). Validación runtime contra `languages`.

### 3.3 Página de plugins limpia

`apps/web/src/pages/plugins/index.astro`:

```astro
---
import PluginsSection from '../../components/PluginsSection.astro';
import Base from '../../layouts/Base.astro';
import { useTranslations, type Lang } from '../../i18n/ui';
import capabilities from '../../data/capabilities.json';

const lang: Lang = 'en';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const homeHref = `${base}/`;
---

<Base lang={lang} title={`${t.plugins.title} — @mcp-vertex/core`}>
  <section class="subhero">...</section>
  <PluginsSection lang={lang} />
</Base>
```

(Sin `<nav>` propio, sin `<main>`, sin `<SiteFooter>` — los pone
`Base.astro`.)

### 3.4 dev regenera API docs

`apps/web/package.json`:

```diff
- "dev": "PAGES_BASE='' astro dev"
+ "dev": "bun run docs:api && PAGES_BASE='' astro dev"
```

`docs:api` (en el root `package.json`) ya existe y ejecuta `typedoc`.
Coste: ~5–10 s al arrancar; aceptable.

### 3.5 i18n de tools (infraestructura)

```
apps/web/src/i18n/
├── shared.ts         (sin cambios)
├── langs/<code>.ts   (12 idiomas, sin cambios estructurales)
├── index.ts          (sin cambios)
└── tools/
    ├── <tool-name>.ts   # 1 archivo por tool (~52)
    └── index.ts         # agrega los 12 idiomas + expone useToolI18n()
```

`apps/web/src/i18n/tools/<tool-name>.ts`:

```ts
import type { IToolI18n } from './types';
const dict: IToolI18n = {
  description: {
    en: 'List the declared dependencies from package.json …',
    es: 'Lista las dependencias declaradas en package.json …',
    fr: '…',
    // 12 idiomas
  },
  // Solo si la tool tiene argumentos:
  arguments: {
    'package.json': { en: '…', es: '…', … },
  },
};
export default dict;
```

`IToolI18n`:

```ts
export interface IToolI18n {
  readonly description: Readonly<Record<Lang, string>>;
  readonly arguments?: Readonly<Record<string, Readonly<Record<Lang, string>>>>;
}
```

Helper de uso:

```ts
// apps/web/src/i18n/tools/index.ts
export const describeTool = (name: string, lang: Lang): string => {
  const t = toolDicts[name]?.description?.[lang];
  return t ?? toolDicts[name]?.description?.en ?? '';
};
```

Componentes (`ToolsSection`, `PluginPage`, `PromptsSection`,
`ResourcesSection`, `KnowledgeSection`):

```astro
<p>{describeTool(tool.name, lang) || tool.description}</p>
```

Gate `check-i18n.ts` ampliado:

```ts
// Por cada tool en capabilities.tools:
//   - existe apps/web/src/i18n/tools/<tool>.ts
//   - tiene descripción en los 12 idiomas
//   - cada argumento descrito en cada idioma
```

Inicialmente dejamos el catálogo vacío y los componentes caen al
fallback en inglés (que es lo que pasa hoy). Lo que se gana es la
**infraestructura** lista. Las traducciones reales se añaden en
propuesta siguiente por idioma.

### 3.6 Marquee dinámico (icono solo / badge expandido)

`apps/web/src/styles/components/_chip.scss`:

```scss
.chip {
  // estado de reposo: solo icono
  width: clamp(46px, 11vw, 56px);
  height: clamp(46px, 11vw, 56px);
  border-radius: 13px;
  // …
}
.chip__label {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  font-weight: 600;
  font-size: 0.85rem;
  transition: max-width 0.25s cubic-bezier(0.2, 0.7, 0.2, 1),
              opacity 0.2s ease,
              margin-left 0.25s ease;
}
.chip:hover,
.chip:focus-visible {
  width: auto;
  padding-right: 0.95rem;
  border-radius: 999px;
}
.chip:hover .chip__label,
.chip:focus-visible .chip__label {
  max-width: 12rem;
  opacity: 1;
  margin-left: 0.55rem;
}
```

`apps/web/src/components/Marquee.astro`: cambiar `<span class="chip__tip">`
por `<span class="chip__label">` y moverlo dentro de `.chip` para
que el flujo del badge sea horizontal.

Para que la **marquesina se pause** al hacer hover sobre cualquier
chip (no solo en el viewport), `_marquee.scss` ya tiene
`&:hover .mq__track` que pausa la animación — eso sigue valiendo.

### 3.7 Overhaul visual

#### Hero

`apps/web/src/styles/components/_hero.scss`: añadir

- `& h1` con animación `hero-fade-up` (fade + 8px translateY).
- Logo con un **halo** (drop-shadow extendido + glow animado al
  pasar 6 s en bucle muy lento).
- Dos CTAs con un separador visual (`·`) cuando hay más de uno.

#### Subhero

`apps/web/src/styles/components/_subhero.scss`: añadir un
**stat-row** de chips con íconos inline (✦ · ⏱ · 📦) y los KPIs
del surface. Esto ya está parcialmente en `subhero__meta`; lo
subimos a una fila con borde superior y mejor espaciado.

#### Cards consistentes

Añadir `apps/web/src/styles/components/_card.scss` (nuevo) con un
componente `.card` reutilizable:

```scss
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.1rem 1.2rem;
  transition: border-color 0.18s ease, transform 0.18s ease,
              box-shadow 0.18s ease;
  &:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 18%, transparent);
  }
}
```

Y reemplazar `.feature`/`.tool`/`.pkg`/`.skill`/`.prompt` para que
usen `.card` (manteniendo sus modificadores propios). Reduce
duplicación y unifica el look.

#### Stats

`apps/web/src/styles/components/_stat.scss`: subir el tamaño del
número (`clamp(1.6rem, 4vw, 2.2rem)`) y añadir gradiente al texto.

#### Benchmarks

`apps/web/src/styles/components/_bench.scss`: rediseñar las barras
con animación de entrada (`width: 0` → `width: var(--w)` con
`animation: bar-in 0.6s ease both`) y separadores entre filas.

#### NotFound

`apps/web/src/components/NotFound.astro`: añadir un emoji central
(🛰️ o el logo SVG del proyecto más grande), un mensaje más cálido
y un solo CTA principal grande.

### 3.8 i18n completar `es.ts` (y los otros 11)

Completar las claves que faltan:

- `nav.knowledge`, `nav.prompts`, `nav.resources`, `nav.skills`,
  `nav.menu`
- `knowledge.title/lead/count`
- `prompts.title/lead/count/arg`
- `resources.title/lead/count/uri/mime`
- `skills.title/lead/count/body`
- `notFound.code/title/lead/homeCta/toolsCta/homeAria`

Idem para los 11 idiomas restantes, usando como referencia la
estructura de `en.ts` (fuente de verdad).

## 4. Slices (orden de ejecución, disjuntas)

- **id: s1** — Fix modal (CSS + Config.astro).
  - files: [_modal.scss, Config.astro]
  - status: todo

- **id: s2** — Fix idioma solo afecta index (Lang import en 2 pages).
  - files: [pages/[lang]/index.astro, pages/[lang]/plugins/[plugin].astro]
  - status: todo

- **id: s3** — Fix doble header /plugins/index.astro.
  - files: [pages/plugins/index.astro]
  - status: todo

- **id: s4** — `bun run dev` regenera API docs.
  - files: [apps/web/package.json]
  - status: todo

- **id: s5** — Infraestructura i18n tools (catálogo vacío + helper).
  - files: [src/i18n/tools/*, src/i18n/tools/index.ts,
    scripts/check-i18n.ts (gate ampliado),
    ToolsSection.astro, PluginPage.astro, PromptsSection.astro,
    ResourcesSection.astro, KnowledgeSection.astro]
  - status: todo (catálogo vacío → fallback al inglés, como hoy)

- **id: s6** — Marquee dinámico (icono solo / badge expandido).
  - files: [_chip.scss, Marquee.astro, _marquee.scss]
  - status: todo

- **id: s7** — Overhaul visual (hero, subhero, cards, stats, bench,
  notfound).
  - files: [_hero.scss, _subhero.scss, _card.scss (nuevo),
    _stat.scss, _bench.scss, _notfound.scss, NotFound.astro,
    styles.scss]
  - status: todo

- **id: s8** — i18n completar `es.ts` y los otros 11 idiomas.
  - files: [src/i18n/langs/*.ts (12 archivos)]
  - status: todo

- **id: s9** — Validar: `bun run validate` + `bun run site:strict`.
  - status: todo

- **id: s10** — Fix banderas de idiomas (B12).
  - files: [Config.astro]
  - status: todo
  - note: Cambio de `l.country` → `l.flag` (campo que ya existe en
    `shared.ts`). Trivial, < 5 líneas.

- **id: s11** — View Transitions en `Base.astro` (B11).
  - files: [layouts/Base.astro, Config.astro (mark active link)]
  - status: todo
  - note: 1 línea en Base; el `<a class="lang-opt">` se intercepta
    automáticamente. Opcional: añadir `transition:animate="slide"`
    en las páginas para dirección.

- **id: s12** — Eliminar subhero (B13).
  - files: [_subhero.scss, styles.scss (import), 16 pages/*.astro +
    PluginPage.astro, _notfound.scss, _nav-media.scss]
  - status: todo
  - note: Refactor grande pero mecánico (borrar y dejar que la
    `<h1>` y el contenido de la página cobren el protagonismo).

- **id: s13** — Desplegables por plugin con detalle de capabilities
  (B10).
  - files: [components/PluginCapabilities.astro (nuevo),
    pages/plugins/index.astro, opcional pages/capabilities.astro,
    i18n/tools/index.ts (si se reusa el helper de s5)]
  - status: todo
  - note: Usa `<details>` nativa con `interpolate-size: allow-keywords`
    o `details::details-content` para animación suave. Una sección
    por plugin, body = tools + prompts + resources + knowledge.

- **id: s14** — Re-validar: `bun run validate` + `bun run site:strict`.
  - status: todo

## 5. Acceptance

- [ ] El icono del engranaje abre el modal con animación.
- [ ] Cambiar idioma en el modal traduce toda la web (probado en
      `/es/install`, `/es/tools`, `/es/plugins/proposals`) y lo
      hace con **transición cross-page** (fade o slide), no salto.
- [ ] Las **banderas de los 12 idiomas** aparecen en el modal.
- [ ] `/plugins` no tiene doble header; se ve igual que el resto.
- [ ] `bun run dev` crea `apps/web/public/api/` antes de levantar
      Astro.
- [ ] Las tools/prompts/resources salen con su descripción en el
      idioma activo (fallback al inglés si la traducción no existe).
- [ ] La marquesina muestra solo iconos y expande un badge con el
      nombre al hacer hover.
- [ ] El subhero está **eliminado**: 0 referencias, 0 estilos.
- [ ] Hay una vista de **capabilities por plugin** con
      `<details>` colapsables (tools, prompts, resources, knowledge).
- [ ] `es.ts` tiene todas las claves con texto en español (no
      inglés).
- [ ] `bun run validate` verde.
- [ ] `bun run site:strict` verde.

## 6. Riesgos

- **Marquee cambio de tamaño**: el cambio de `width: clamp(46px, 11vw, 56px)`
  a `width: auto` en hover puede hacer que la **posición** de los
  chips cambie. Hay que probar que la animación de scroll no salte.
- **i18n tools**: el catálogo vacío + fallback en inglés mantiene
  el comportamiento actual, así que **no rompe** la web. Es solo
  infraestructura.
- **CSS unificado `.card`**: el refactor de `.feature`/`.tool`/
  `.pkg`/`.skill`/`.prompt` puede romper algo. Testear con el
  dev server.
- **i18n completo en 12 idiomas**: mucho contenido repetitivo
  (12 × ~30 strings). Si bloquea, se cierra solo con `en.ts` +
  `es.ts` completos + el resto con fallback al inglés (que es lo
  que pasa hoy de facto).
- **View Transitions**: requiere JS. Caer a navegación normal
  con `<noscript>` y respetar `prefers-reduced-motion` (Astro ya
  lo hace por defecto).
- **Eliminar subhero en 16 páginas**: el refactor es mecánico
  (borrar bloque) pero el `<h1>` actual de algunas páginas es
  débil (texto plano sin contexto). Habrá que mirar página a
  página si hace falta mejorar el copy.
- **Desplegables por plugin**: si la lista de tools crece mucho
  (>200), el `<details>` nativo puede ser lento. Para los ~52
  tools actuales,没有问题.
