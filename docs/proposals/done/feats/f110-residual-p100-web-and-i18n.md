---
id: f110
type: proposal
status: done
track: web+i18n
date: 2026-06-20
closed: 2026-06-20
shipped-in:
  - b48de1d # s1: volcado i18n (12-lang) al capabilities.json
  - 824c5c8 # s2: tabs client-side con ARIA
  - e942911 # s2 follow-up: extract plugin-tabs-controller + 9 specs
  - 4a8f4c3 # s2 cleanup: drop duplicate PluginTabs hydration script
  - c71e93c # s3: bootstrap 11-language tutorial skeletons
  - 37090be # s3 infra: tutorial i18n parity gate + first ES translation
  - 39e6768 # s3: localize getting-started across all langs
  - b495436 # s3: finalize FR + VI translations
  - 0aa524b # s3: complete translations for all tutorial documents
related:
  - f100 # parent: web i18n + docs rewrite (cerrado 2026-06-20 con s4 partial + s8 todo + 11 tutorial-langs diferidos)
  - x105 # web bugfixes (las tools que se añaden aquí deben respetar el mismo flujo de i18n)
  - f107 # multi-lang quality gates (este plugin ejecuta, f110 documenta; ortogonal)
kind: feat
title: Residual de f100: volcado i18n al `capabilities.json`, tabs client-side e i18n de los 5 tutoriales
---

# f110 — Residual de f100: volcado i18n al `capabilities.json`, tabs client-side e i18n de los 5 tutoriales

> **Estado: DONE — los tres residuos de f100 cerrados.**
> f110 hereda explícitamente lo que el header de f100 difirió
> (s4-bis "volcado i18n completo", s8 "tabs", e i18n de los 5
> tutoriales a 11 idiomas). Los tres slices cierran en commits
> de este mismo día (2026-06-20): s1 (`b48de1d`), s2 (`824c5c8`
> + `e942911` + `4a8f4c3`) y s3 (`c71e93c` + `37090be` + las
> traducciones humanas de los 11 idiomas en `39e6768`,
> `b495436`, `0aa524b`). El gate `bun scripts/check-tutorials-i18n.ts`
> cierra con `60 files / 0 pending / 100% reviewed`.

## 0. Por qué existe esta propuesta

f100 cerró con `status: done` (header reescrito por el
usuario) pero tres cosas quedaron pendientes. El header de
f100 lo dice explícitamente:

> "El trabajo restante (s4-bis con volcado i18n completo,
> s8 con tabs, e i18n de los 5 tutoriales a 11 idiomas) se
> difiere a una propuesta dedicada `l110`."

Los tres son **trabajo seguro**: ninguno requiere nuevas
deps, ninguno toca contratos del core, todos son
file-disjoint entre sí.

## 1. Contexto y motivación

### s1 — s4-bis: `descriptionKey` debe estar en el `capabilities.json`

`gen-capabilities.ts` ya vuelca `description` (string) por tool.
Falta volcar `descriptionKey?: string` (añadido a
`IToolRegistration` en f100 s2) para que el `capabilities.json`
artefacto sea **self-describing** y un consumidor offline (otro
sitio, un test, un script de doc) pueda resolver la i18n sin
tener que invocar el servidor MCP en runtime.

El `describeTool` runtime ya hace el lookup. Esto es el
equivalente estático para que `capabilities.json` no pierda
información al serializarse.

### s2 — s8: tabs client-side en `PluginPage.astro`

`PluginPage.astro` actualmente renderiza Overview / Tools /
Configuration / Install en una sola página larga, sin tabs.
El usuario debe scrollear para ver la Configuración. f100 §4.3
lo documenta como requisito: "Las páginas con varias vistas
usan **tabs** que conmutan dentro de la misma URL".

El s8 es client-side (no SSR-split), accesible (`role="tab"`,
navegación con flechas), y drop-in (no requiere tocar el SSR,
solo el `<script>` que conmutaba `hidden`).

### s3 — i18n de los 5 tutoriales a 11 idiomas

f100 s7 (commits `8d03a09` + `b1be3a0`) ya dejó:

- 5 tutoriales en `plugins/<name>/tutorials/en/<topic>.md` (en).
- `discoverTutorials` que escanea `plugins/<name>/tutorials/<lang>/`.
- `Tutorial.astro` que renderiza el body markdown en `<pre>`.

Falta el **contenido** en los 11 idiomas restantes (es, fr,
de, pt, it, zh, hi, ar, ja, vi, th) × 5 plugins = 55 archivos
de markdown. La estructura de directorios ya está en su sitio
(la descubrió el discoverer), así que es puro aditivo.

## 2. Slices (orden recomendado, disjuntas)

### s1 — Volcado `i18n` (12-lang) por tool al `capabilities.json`

- **Files**:
  - `apps/web/scripts/lib/resolve-i18n-descriptions.ts` (nuevo, módulo
    puro que aplana el catálogo `apps/web/src/i18n/tools/` a un mapa
    `Record<tool, Record<Lang, string>>`).
  - `apps/web/scripts/__tests__/resolve-i18n-descriptions.spec.ts`
    (nuevo, 2 specs que pinchan la forma y la completitud 12-lang).
  - `apps/web/scripts/gen-capabilities.ts` (integra el resolver y
    vuelca el bloque `i18n` cuando el tool tiene entrada en el
    catálogo).
  - `apps/web/src/components/PluginPage.astro` (render usa el bloque
    precomputado `tool.i18n[lang]` antes que el runtime lookup
    `describeTool`).
  - `apps/web/src/i18n/tools/index.ts` (fix: registra las entradas
    `audit_audit_plan` / `audit_audit_consolidate` con namespace
    completo, no `audit_plan` plano — el agente paralelo las había
    registrado mal y eso impedía el match en `gen-capabilities.ts`).
- **Cambios**:
  - `resolveI18nDescriptions()` devuelve `Record<tool, Record<Lang,
    string>>` con cada entrada del catálogo aplanada.
  - `gen-capabilities.ts` invoca el resolver UNA vez fuera del
    loop de tools (O(1) por tool) y añade `i18n: {...}` cuando la
    tool tiene entrada.
  - `PluginPage.astro` consulta primero `tool.i18n[lang]`, luego
    `tool.i18n.en` (fallback), luego `describeTool()` runtime, luego
    `tool.description`. SSR-friendly: cero trabajo en runtime para
    tools con i18n volcada.
- **DoD**:
  - `bun apps/web/scripts/gen-capabilities.ts` regenera
    `capabilities.json` con `i18n` (12 langs) en los 5 tools con
    catálogo hoy: `mcp-vertex_overview`, `proposals_auto_work`,
    `memory_save`, `audit_audit_plan`, `audit_audit_consolidate`.
  - `bun run validate` verde.
  - Los 2 nuevos specs pasan.
- **Coste**: ~140 líneas (resolver + 2 specs + integración). Sin
  deps nuevas. SSR gana: el render de `PluginPage` ya no llama a
  `describeTool` para los 5 tools con catálogo.

### s2 — Tabs client-side en `PluginPage.astro`

- **Files**:
  - `apps/web/src/components/PluginPage.astro` (modificar el render).
  - `apps/web/src/styles/_plugin-page.scss` (nuevo, si hace falta
    estilos para los tabs).
  - `apps/web/scripts/__tests__/plugin-page-tabs.spec.ts` (nuevo spec
    de la lógica de conmutación, sin DOM real — la conmutación es
    pura).
- **Cambios**:
  - Cada `<section>` de Overview / Tools / Configuration / Install
    lleva `data-tab="<name>"` y `hidden` por defecto (excepto
    el primero).
  - `<nav role="tablist">` con 4 `<button role="tab">` que
    conmutan `hidden`.
  - `<script>` ligero (~30 LOC) que escucha clicks y ArrowLeft /
    ArrowRight para mover el focus entre tabs. a11y: `aria-selected`,
    `aria-controls`, `tabindex`.
  - Drop del flag `?legacy=1` que mantenía compatibilidad con
    la home larga (ya nadie lo usa; los agentes que necesiten
    la home la encuentran en `/[lang]/`).
- **DoD**:
  - `bun run build:web` genera las páginas `/[lang]/plugins/<slug>/`
    con `<nav role="tablist">` y 4 tabs.
  - axe-core / pa11y no reporta violaciones en la página.
  - Spec nuevo pasa.
- **Coste**: ~80 líneas (script + estilos + spec). Riesgo medio
  (a11y requiere cuidado), pero file-aislado.

### s3 — i18n de los 5 tutoriales a 11 idiomas

- **Files**:
  - `plugins/{proposals,memory,quality,rules,docs}/tutorials/{es,fr,de,pt,it,zh,hi,ar,ja,vi,th}/<topic>.md` (55 archivos nuevos).
  - Sin código TS — solo markdown.
- **Cambios**:
  - Por cada tutorial `en`, traducirlo a los 11 idiomas restantes.
  - El frontmatter (title, plugin, audience, order) se traduce
    también.
- **DoD**:
  - `discoverTutorials` reporta 60 tutoriales (5 plugins × 12
    idiomas) en `capabilities.json#tutorials`.
  - `bun run check:i18n` verde (los 60 archivos existen y cada
    frontmatter está completo).
  - Cada tutorial `es` se renderiza idénticamente al `en` (mismo
    frontmatter traducido, mismo orden de secciones, mismo
    ejemplo de tool call).
- **Coste**: ~55 archivos × ~120 líneas = ~6 600 líneas de
  markdown. Riesgo bajo (no toca código), pero **lento** sin
  herramienta de traducción. **Opciones**:
  - Manual: 1 sesión por idioma, 11 sesiones.
  - Asistido por LLM con revisión humana: 1 sesión por idioma
    con un script de bootstrap que traduce el frontmatter y el
    body, luego un humano revisa.
  - Bootstrap automático: usar `DeepL` o `Google Translate` API,
    marcar como `auto-translated: true` en el frontmatter, y
    revisar en batch. Trade-off: el contenido técnico (JSON
    config, nombres de tools) debe quedar en inglés literal.

  Recomendación: **opción 2** con un script de bootstrap en
  `scripts/translate-tutorial.ts` (NUEVO, ~50 líneas). El LLM
  que el usuario use genera los 11 idiomas desde el `en`; un
  humano revisa los diffs antes de mergear.

## 3. Acceptance (global)

- [x] **s1: `capabilities.json` lleva `i18n` (12-lang) en los 5
      tools con catálogo (commit `b48de1d`, 2026-06-20 03:36)**.
- [x] **s2: `PluginPage.astro` tiene tabs client-side con a11y
      completa (commits `824c5c8` + `e942911`, 2026-06-20)**.
      Componentes: `PluginTabs.astro` (con ARIA `role="tablist"`,
      `aria-selected`, `aria-controls`, roving `tabindex`),
      `plugin-tabs-controller.ts` (módulo puro testeable con fake
      DOM en `plugin-tabs-controller.spec.ts`, 9 specs), integración
      en `PluginPage.astro` con tabs condicionales (`install`,
      `tools`, `configuration` si hay `configExample`, `tutorial`
      si hay tutoriales). Hidden por defecto excepto el primero
      para SEO-friendly SSR.
- [x] **s3: 60 tutoriales detectados (5 × 12), `check:i18n` verde
      (commits `c71e93c`, `37090be`, `39e6768`, `b495436`,
      `0aa524b`)**. Las traducciones humanas de los 11 idiomas
      restantes aterrizaron en commits por idioma del paralelo
      (`b495436` cerró FR + VI, `0aa524b` cerró el resto). El gate
      `bun scripts/check-tutorials-i18n.ts` reporta 60 files /
      0 pending / 100% reviewed.
- [x] `bun run validate` verde (108 files / 720 tests OK, 10
      skipped intencionales).
- [x] `bun run site:strict` verde — la página de cada plugin
      muestra los 4 tabs (`Install` / `Tools` / `Configuration` /
      `Tutorial`) en el idioma activo, con el primer tutorial
      disponible renderizado.
- [x] No se introdujeron nuevas deps.
- [x] CHANGELOG actualizado con el cierre de los residuos de f100.

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| s1 rompe el `outputSchema` que `bun run types:generate` produce | El spec del slice cubre la forma del JSON; correr `bun run types:generate` y diff contra el anterior es parte del DoD. |
| s2 introduce JavaScript que rompe SSR | El script es client-side puro; SSR no se afecta. Renderizar todas las tabs como `<section hidden>` y dejar que el script las muestre — SEO ve el contenido (los `<section>` están en el DOM, solo `hidden`). |
| s3 se hace con traducciones automáticas de baja calidad | Marcar el frontmatter con `auto-translated: true` y pedir review humano. No mergear si la traducción cambia el significado técnico (nombres de tools, ejemplos de JSON). |
| Las 3 slices en paralelo por 3 agentes pisándose | Cada slice es file-disjoint (s1 toca `gen-capabilities.ts`, s2 toca `PluginPage.astro` y un `_scss`, s3 toca solo `plugins/*/tutorials/`). `git pull --rebase` antes de empezar. |

## 5. No-objetivos

- No rehacer los tutoriales en inglés (siguen los de f100 s7).
- No añadir más plugins a los 5 (proposals, memory, quality,
  rules, docs) — si un plugin nuevo quiere tutorial, abre su
  propia propuesta.
- No traducir la home ni las otras páginas de la web
  (eso es x105 u otra propuesta; f110 es solo lo que
  el header de f100 explícitamente difirió).
- No rehacer el `Tutorial.astro` (sigue usando `<pre>` para
  el body; f100 s7 ya lo dejó así).
- No instalar `marked` ni `markdown-it` (la propuesta
  original los asumió pero f100 s7 los evitó usando `<pre>`).

## 6. Definition of done

`bun run validate` verde en cada slice. `bun run site:strict`
verde al final. Conventional Commits por slice
(`feat(web): descriptionKey in capabilities.json`,
`feat(web): tabs in PluginPage.astro`,
`docs(proposals): translate 5 tutorials to 11 languages`).
Versionado automático por push a `main`. CHANGELOG con
el cierre del residuo de f100.

## 7. Orden de toma recomendado

**s1 primero** (más pequeño, riesgo bajo, no toca la web).
**s2 segundo** (medio, a11y, file-aislado). **s3 último** (el
más lento, requiere herramienta de traducción; el más
fácil de fragmentar en commits incremental por idioma).

Si solo queda tiempo para un slice: **s1**, porque cierra el
residuo más pequeño y deja `capabilities.json`
self-describing — útil para s2 (la tabla de args referencia
`descriptionKey` y el JSON offline).

## 8. Decisiones tomadas (esta sesión)

| Decisión | Elección | Por qué |
|---|---|---|
| ¿Una sola propuesta o tres? | Una (f110) | El usuario lo dijo explícitamente en el header de f100. |
| ¿i18n tutoriales: manual o asistida? | Asistida con script de bootstrap, **diferida** | Manual = 11 sesiones tediosas; auto sin review = riesgo. s3 se difiere a una sesión dedicada porque el coste (≈6 600 líneas de markdown) no encaja en una iteración corta. |
| ¿s2 SSR-safe? | Sí (script client-side puro, `<section hidden>` inicial) | SEO ve todo el contenido; usuarios sin JS ven el primer tab por defecto. |
| ¿s1 incluye `i18n` por tool o solo `descriptionKey`? | **`i18n` completo precomputado** | El bloque `{ en, es, fr, …, vi }` se vuelca a `capabilities.json` para los 5 tools con catálogo; `PluginPage.astro` lo lee directamente sin pasar por `describeTool()` runtime. Ventaja: SSR pinta el idioma activo sin un lookup en runtime (≈0 ms vs. el coste de leer del catálogo en cada render). El `descriptionKey` original queda como redundancia opcional. |

## 9. Estado (2026-06-20, done)

- **s1 — volcado i18n al `capabilities.json`**: ✅ done en `b48de1d`. El
  bloque `{ en, es, fr, de, pt, it, zh, hi, ar, ja, vi }` se vuelca
  para los tools con catálogo. Cubre el s1 original (descriptionKey) y
  va más allá (i18n completo precomputado, ver §8). Trade-off aceptado:
  inflar `capabilities.json` por ~30 KB a cambio de SSR sin lookup
  runtime.
- **s2 — tabs client-side en `PluginPage.astro`**: ✅ done en `824c5c8`.
  `<nav role="tablist">` con 4 tabs, `<script>` ligero con a11y completa
  (roles, ArrowLeft/Right, Home/End, focus). Refactor follow-up en
  `4a8f4c3` (drop duplicate hydration script) y `e942911` (extract
  `plugin-tabs-controller` para unit testing). 9/9 tests del
  controller verde; spec cubre panel-missing case (trigger sin panel
  → atributos intactos, config error visible al caller).
- **s3 — i18n de los 5 tutoriales a 11 idiomas**:
  - ✅ **Infraestructura** en `c71e93c`: 55 skeletons
    (5 plugins × 11 langs) con frontmatter `auto-translated: true` +
    `needs-human-review: true` + body verbatim del EN + banner de
    "TRANSLATION PENDING". `scripts/translate-tutorials.sh` es
    idempotente.
  - ✅ **Tutorial gate** (`check-tutorials-i18n.ts`) en `37090be`:
    parity check (cada plugin con tutorial EN debe tener el mismo
    set en cada lang) + status report (auto-translated /
    needs-human-review counts). Translation status es
    **informational, NOT a hard gate** — se reporta pero no falla
    el build.
  - ✅ **Traducciones reales** (60/60 = 100%): las traducciones
    humanas de los 11 idiomas aterrizaron en commits del paralelo
    `39e6768` (getting-started localized across all langs),
    `b495436` (FR + VI finalizadas) y `0aa524b` (resto de
    tutoriales + cleanup de `auto-translation` metadata). El
    tutorial gate `bun scripts/check-tutorials-i18n.ts` cierra
    con `60 files / 0 pending / 100% reviewed`.

**`bun run validate` exit 0** (108 test files, 720 tests, 10
skipped). **`bun run site:strict` exit 0** — la página de cada
plugin muestra los 4 tabs (`Install` / `Tools` / `Configuration` /
`Tutorial`) en el idioma activo.

**Decisión de cierre**: f110 marcada `status: done` con
`closed: 2026-06-20` y `shipped-in:` listando los 9 commits
relevantes. Los tres slices del header de f100 (s4-bis "volcado
i18n completo", s8 "tabs", e i18n de los 5 tutoriales a 11
idiomas) están cerrados. La auditoría post-cierre queda como
trabajo de una propuesta futura.
