---
id: p107
type: proposal
status: done
track: core+quality+web
date: 2026-06-19
reopened: 2026-06-20
closed: 2026-06-20
related:
  - p105 # web bugfixes & UX overhaul (where this is mentioned as B17)
  - p108 # test-convention plugin (complementary: scan-drift vs run_quality)
---

# p107 — Quality gates multi-lenguaje (DRY type, dogfood config, web docs)

> **Estado: DONE (2026-06-20).** Reescrito el 2026-06-20 después
> de inspeccionar el código actual; **todos los slices aplicados**
> (s1 DRY type, s2 dogfood config, s3 docs web). El commit final
> `0000796` cierra los 3 specs de quality que el alias
> `IScopeCommand = IValidationCommand` rompió al hacer
> `expect` obligatorio. Ver §4 abajo para el DoD completo.

## 0. Contexto verificado el 2026-06-20

Inspeccionando el repo en el commit `af32df6`:

| Pieza | Estado | Fuente |
|---|---|---|
| `IValidationCommand { command, expect }` en el core | ✅ Existe | `packages/core/src/lib/contracts/interfaces/validation-matrix.interface.ts:6` |
| `IValidationMatrix` en el core | ✅ Existe | mismo archivo, línea 12 |
| Ambos re-exportados en `@mcp-vertex/core/public` | ✅ Sí | `packages/core/src/public/index.ts:35-37` |
| `IMcpVertexHostConfig.validationMatrix?` los usa | ✅ Sí | `host-config.interface.ts:40` |
| El JSON Schema de `mcp-vertex.config.json` los valida | ✅ Sí | `packages/core/schema/mcp-vertex.config.schema.json` |
| `plugins/quality` ejecuta comandos agnósticos | ✅ Sí | `runner.ts` usa `spawn(command, { shell: true })` y mide exit code |
| `plugins/quality` tiene 3 tools | ✅ Sí | `get_quality_scopes`, `run_quality`, `quality_cancel` |
| `plugins/quality` **redefine** `IScopeCommand` localmente | ⚠️ **DRY gap** | `runner.ts:112-115` declara `{ command; expect? }` con `expect` opcional |
| `mcp-vertex.config.json` del repo carga `quality` | ❌ **Laguna** | Solo `docs, search, git, status-marker, test-convention` |
| Web documenta arquitectura agnóstica | ❌ Falta | `/guide` no menciona `run_quality` ni multi-lenguaje |

**Conclusión**: la propuesta original de 6 slices era sobredimensionada.
Este es el plan realista.

## 1. Lo que se quiere

1. **Una sola fuente de verdad para el tipo de comando** entre el
   core y el plugin `quality`. `IScopeCommand` debería ser
   `IValidationCommand` (o un alias trivial).
2. **El repo dogfoods su propio plugin `quality`** en
   `mcp-vertex.config.json`, con un scope útil que aproveche los
   scripts ya existentes en `package.json` raíz.
3. **La web documenta la arquitectura agnóstica** — `/guide` tiene
   una sección "Quality gates" con snippets por lenguaje (TS,
   Python, Rust, Go) y un anclaje en la home. 12 idiomas.

Sin instalar toolchains. Sin presets en código. Sin romper la
compatibilidad de la API pública del plugin.

## 2. Diseño (alto nivel)

### 2.1 DRY del tipo (s1)

`plugins/quality/src/lib/runner.ts:112-115` declara:

```typescript
export interface IScopeCommand {
  readonly command: string;
  readonly expect?: string;
}
```

Y `plugins/quality/src/lib/scopes.ts:4,26,48,6` lo consume. Y
`plugins/quality/src/public/index.ts:16` lo re-exporta.

El core ya tiene (en `validation-matrix.interface.ts:6`):

```typescript
export interface IValidationCommand {
  readonly command: string;
  readonly expect: string;
}
```

La diferencia es solo que `expect` es opcional en el plugin y
requerido en el core. En la práctica, todos los call sites del
plugin o bien pasan `expect: 'exit0'` o lo omiten — el `runScope`
no usa `expect` para nada (mide exit code real). Es decir, el
plugin **nunca** discrimina según `expect`.

**Refactor mínimo**: en `runner.ts`, eliminar la declaración local
y hacer:

```typescript
import type { IValidationCommand } from '@mcp-vertex/core/public';
export type IScopeCommand = IValidationCommand;
```

Y eliminar el `?` de `expect` **en los call sites que lo
asumían opcional** (`scopes.ts:48` cuando viene de
`optionScopes`, `runner.ts:115`). El JSON Schema del core
**requiere** `expect`, así que el cast `matrix as IScopeMap` en
`scopes.ts:54` ya asume forma canónica.

**No hace falta tocar** el `public/index.ts` (sigue exportando
`IScopeCommand` desde `./runner`).

Test nuevo `plugins/quality/tests/src/lib/scope-type.spec.ts`
que verifique equivalencia estructural (Assignable<>) entre
`IScopeCommand` y `IValidationCommand`.

### 2.2 Dogfood en la config (s2)

`mcp-vertex.config.json` raíz no carga `quality`. Cambiar:

```jsonc
{
  "plugins": {
    "docs": { "options": { "roots": ["docs", "README.md"] } },
    "search": { "options": {} },
    "git": { "options": {} },
    "status-marker": { "options": {} },
    "test-convention": { "options": {} },
    "quality": { "options": {} }
  }
}
```

**Sin scope explícito** — `resolveScopes` ya detecta los scripts
de `package.json` y arma el scope `all` con `lint, typecheck, test,
build`. Esto es lo que la doc del plugin recomienda.

**No rompe nada**: el plugin es opcional (no se carga si no está
en config). Añadirlo solo expone 3 tools adicionales al overview.
Y `bun run validate` no se ve afectado porque `validate` ejecuta
`bun run typecheck && bun run lint && bun run lint:scss && bun run
test` directamente, no via `run_quality`.

**Verificación**: tras el cambio, `mcp-vertex_overview` debe listar
`quality_get_quality_scopes`, `quality_run_quality`,
`quality_quality_cancel` como tools disponibles.

### 2.3 Documentación web (s3)

**Verificado el 2026-06-20**: la web ya tiene un `/guide`
completo, en `apps/web/src/pages/guide.astro` (raíz) y clonado
en `apps/web/src/pages/[lang]/guide.astro` para los 12 locales.
La sección §9 "Quality gates & multi-language" **ya existe** y
menciona explícitamente "proposal p107 — work in progress". El
s3 consiste en **reemplazar ese WIP** con la realidad actual:

1. La arquitectura YA es agnóstica del lenguaje desde hace
   tiempo: `IValidationCommand` está en el core, el `quality`
   plugin ejecuta cualquier comando vía `spawn(shell: true)`, y
   el JSON Schema valida la forma.
2. Los 3 tools del plugin (`get_quality_scopes`, `run_quality`,
   `quality_cancel`) se pueden invocar desde cualquier MCP
   client que cargue el plugin.

**Archivos a modificar** (exactamente 2, ambos `.astro`):

- `apps/web/src/pages/guide.astro` — reescribir §9 con la verdad
  + snippets de config por lenguaje.
- `apps/web/src/pages/[lang]/guide.astro` — mismo cambio
  (mantener paridad con la raíz; el resto del guide también está
  duplicado).

**NO** se crea componente nuevo, NO se añade i18n de 12 langs
(la página del guide no se traduce — usa contenido hardcoded
EN), NO se crea data JSON separada (los snippets viven inline en
el `.astro`), NO se añade home anchor (la nav ya tiene "Guide"
en `INavTranslations.guide`).

**Cuidado del usuario sobre CSS/migración**: el slice s3 no
toca CSS (mantiene los estilos existentes del guide), no añade
componentes nuevos (no necesita data ni estilos), y no requiere
i18n de 12 langs (el guide es monolingüe EN por diseño). Es el
slice más barato de los tres y el más seguro.

## 3. Slices (orden, disjuntos, costo realista)

### s1-dry-type ✅ aplicado (2026-06-20)

- **Archivos**:
  - `plugins/quality/src/lib/runner.ts` (alias `IScopeCommand` →
    `IValidationCommand`)
  - `plugins/quality/src/lib/scopes.ts` (call site de
    `optionScopes` ahora pasa `expect: 'exit0'`)
  - `plugins/quality/tests/src/lib/scope-type.spec.ts` (nuevo)
- **Cambios**: ~10 líneas.
- **Gate**: `lint` (typecheck + biome + vitest del plugin).
- **Aceptación**:
  - `IScopeCommand` ya no se declara en `runner.ts` (es alias).
  - El test `scope-type.spec.ts` confirma equivalencia estructural.
  - `bun run typecheck` y `bun run test` siguen verdes.
  - `bun run site:strict` queda verde (no se toca nada de la web).

### s2-enable-in-repo ✅ aplicado (2026-06-20)

- **Archivos**:
  - `mcp-vertex.config.json` (añadido `"quality": { "options": {} }`)
- **Cambios**: 1 línea.
- **Gate**: `lint`.
- **Aceptación**:
  - `mcp-vertex.config.json` carga `quality`.
  - `mcp-vertex_overview` lista 3 tools nuevos con prefijo `quality_`.
  - `bun run validate` y `bun run site:strict` verdes.

### s3-docs-web ✅ aplicado (2026-06-20)

- **Archivos**:
  - `apps/web/src/pages/guide.astro` (reescribir §9)
  - `apps/web/src/pages/[lang]/guide.astro` (mismo cambio en la
    copia)
- **Cambios**: ~30 líneas por archivo.
- **Gate**: `lint` (que incluye `bun run site:strict`).
- **Aceptación**:
  - §9 del guide explica que la arquitectura es agnóstica YA,
    con snippets de config para TypeScript, Python, Rust y Go.
  - Menciona los 3 tools: `get_quality_scopes`, `run_quality`,
    `quality_cancel`.
  - NO menciona "work in progress" / "proposal p107" — el
    "WIP" se cierra con este slice.
  - `bun run site:strict` queda verde.

## 4. Acceptance (global)

- [x] `IScopeCommand` ya no se declara localmente en el plugin
      (s1, hecho 2026-06-20).
- [x] `mcp-vertex.config.json` raíz carga `quality` (s2, hecho
      2026-06-20).
- [x] §9 del guide reescrita con la verdad y snippets por
      lenguaje (s3, hecho 2026-06-20).
- [x] `bun run validate` verde (verificado tras el fix de los
      3 specs de quality que necesitaban `expect: 'exit0'` para
      satisfacer el alias `IScopeCommand = IValidationCommand`).
- [x] `bun run site:strict` verde (no se rompe nada de la web
      con los slices; el cambio es solo texto en 2 `.astro`).
- [x] No se introduce ninguna dependencia nueva.
- [x] No se rompe la API pública de `@mcp-vertex/quality` (el
      alias `IScopeCommand` se mantiene como re-export; los call
      sites externos siguen funcionando sin cambios).

## 5. No-objetivos

- No instalar toolchains (mypy, cargo, go).
- No crear `presets/<lang>.ts` en el plugin (la doc muestra los
  snippets, no se distribuyen como código).
- No rehacer `validate` para usar `run_quality` (sería un
  refactor mayor fuera de scope; el plugin ya existe para que
  los agentes lo invoquen, no para reemplazar `package.json`).
- No añadir `language` al `IMcpVertexProjectMetadata`
  (sobre-ingeniería: el campo `validationMatrix.scopes` ya es
  agnóstico).

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El alias `IScopeCommand = IValidationCommand` rompe un consumer externo que esperaba `expect?` opcional | El core schema requiere `expect` (string), así que ningún consumer válido lo omite. El único lugar que lo omitía era `resolveScopes` cuando viene de `optionScopes` o config, y el JSON Schema ya lo requiere. |
| Habilitar `quality` en la config aumenta tokens del `overview` | El budget ya está medido y cubierto; los nombres de tools son cortos. Si se acerca al límite, se documenta aquí y se decide en slice posterior. |
| 12-lang i18n introduce typos en algunos idiomas | Usar la convención de los otros componentes: delegar la copia a `apps/web/scripts/check-i18n.ts` que falla el build si falta; revisar 2 langs críticos (en, es) manualmente. |
| El componente `QualitySection.astro` introduce CSS ad-hoc | Reusar selectores existentes; crear `_quality.scss` solo si los estilos no encajan. |

- No traducir la página `/guide` a 12 idiomas (mínimo: EN + ES;
  el resto pueden tener fallback a EN con un badge "pendiente
  de traducir").
- No rehacer el sistema de quality-gates de los plugins existentes
  (solo ampliar).
- No cubrir Go-style `go vet` con reglas de lint arbitrarias.
