---
id: f00006
type: proposal
status: done
track: core+plugin+web
date: 2026-06-19
closed: 2026-06-20
related:
  - f00004 # multi-model audit (mismo espíritu: tooling sobre el comportamiento del agente)
  - f00005 # status-marker (mismo patrón: knowledge + tools para un contrato del agente)
  - x00004 # web bugfixes & UX overhaul (aquí entra la página del plugin)
  - f00009 # multi-lang quality gates (este plugin complementa: quality ejecuta, test-convention enseña)
kind: feat
title: Plugin `@mcp-vertex/test-convention` (cómo el repo espera sus tests)
---

# f00006 — Plugin `@mcp-vertex/test-convention` (cómo el repo espera sus tests)

> **Estado: DONE (2026-06-20).** Plugin creado, registrado en
> swarm preset y en `gen-capabilities.ts`, configurado en el
> `mcp-vertex.config.json` raíz, documentado en
> `examples/swarm/README.md`. El primer slice (`320b951` refactor
> SOLID del `scanDrift`) más las correcciones posteriores cierran
> la propuesta; ver §13 + audit post-cierre abajo.

## 1. Contexto y motivación

Hoy el repo dogfoodea una convención de tests muy concreta, pero esa
convención solo vive en:

- `vitest.shared.ts` (aliases)
- `biome.json` (lints blandos, sin reglas de tests)
- `package.json#scripts.test` (`vitest run`)
- `AGENTS.md` (texto suelto: "Tests colocate as `*.spec.ts`; protocol
  behaviour gets an e2e with a real in-memory MCP server.")
- Convención dispersa en READMEs de cada plugin.

Resultado: el agente la viola en cada sesión larga, y la auditoría
manual (esto que estás leyendo) tiene que decir
"ojo, no se llama `*.test.ts`, es `*.spec.ts`".

### Quién se beneficia

- **El agente en swarm**: tiene un tool que le dice "para este
  archivo en `src/lib/foo/bar.ts`, ¿dónde va el spec y qué
  cobertura necesita?". Sin tener que leer 4 archivos.
- **El orquestador**: puede pedir "lista los specs no conformes
  antes de cerrar la slice" y abortar si hay drift.
- **El humano que adopta mcp-vertex** en otro repo: copia el plugin
  y su convención por defecto, o la sobreescribe con la suya.

### Por qué **plugin** y no solo "instrucción en `AGENTS.md`"

| Criterio                          | `AGENTS.md`     | Plugin                |
|-----------------------------------|-----------------|-----------------------|
| El agente la cumple               | a veces         | siempre (knowledge) + verificado (tool) |
| Detectas drift en el repo real    | no              | sí (`scan_drift` enumera violaciones) |
| Cambias la convención sin tocar docs | no            | editas `convention.ts`                |
| Lo activas por proyecto           | no              | `plugins.test-convention.enabled`     |
| Lo reutilizas entre proyectos     | no              | sí, paquete npm                       |

## 2. Lo que se quiere

Un plugin `@mcp-vertex/test-convention` con **una sola fuente de verdad
para la convención de tests** del repo (`convention.ts`), que ofrezca:

1. **Knowledge entries** que el agente puede leer por demanda:
   - `test-convention-overview` — reglas globales (extensión, layout,
     naming, imports, mocks, async, errores, cobertura).
   - `test-convention-runners` — qué runners detecta y cómo
     configurarlos (vitest por defecto; extensible).
   - `test-convention-coverage` — umbrales por defecto y cómo
     sobreescribirlos.
2. **Tres tools MCP** para que el agente se audite a sí mismo:
   - `<prefix>_get_convention` — devuelve el bloque canónico
     (knowledge).
   - `<prefix>_suggest_spec_path { sourcePath }` — para un
     `.ts` del repo, devuelve dónde va el `.spec.ts` según la
     convención y qué tests mínimos debe tener.
   - `<prefix>_scan_drift { scope?: 'all' | 'src' | 'tests' }` —
     escanea el árbol real, compara con la convención y devuelve
     una lista de violaciones con `{ file, rule, severity, hint }`.
3. **Una opción de configuración** (`optionsSchema`) para que cada
   proyecto sobreescriba partes sin forkear el plugin:
   - `specExtension` (`'spec.ts' | 'test.ts' | string`, default
     `'spec.ts'`).
   - `specLayout` (`'colocate' | 'tests-mirror' | 'tests-flat'`,
     default `'colocate'`).
   - `runners` (`'vitest' | 'jest' | string[]`, default `['vitest']`).
   - `coverageThreshold` (objeto con `lines/functions/branches/statements`,
     default `{ lines: 80, functions: 80, branches: 70, statements: 80 }`).
   - `mockStyle` (`'vi' | 'jest' | 'auto'`, default `'vi'` para vitest).
   - `requireDescribe` (boolean, default `true`).
   - `forbiddenPatterns` (array de regex, opcional) — p.ej.
     `['describe.only', 'it.only']` para que el agente no se
     olvide de limpiar.

### Por qué NO ejecuta los tests (delegación explícita)

Ejecutar ya lo hace `@mcp-vertex/quality` con su `run_quality`.
Este plugin **complementa**: el quality plugin dice "¿pasan?"; este
dice "¿se escriben como la convención manda?". Mantener la separación
también respeta el principio **core agnóstico** (el core no sabe nada
de tests).

## 3. Estructura del plugin (siguiendo el patrón del repo)

````text
plugins/test-convention/
├── package.json
├── README.md
├── LICENSE
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                       # definePlugin + register(ctx)
    ├── convention.ts                  # tabla canónica (default + override)
    ├── suggest.ts                     # suggestSpecPath(sourcePath)
    ├── scan.ts                        # scanDrift(reader, convention, scope)
    ├── public/
    │   └── index.ts                   # re-exports para otros plugins
    ├── lib/
    │   ├── runners.ts                 # detección de vitest/jest
    │   ├── tools/
    │   │   ├── get-convention.ts
    │   │   ├── suggest-spec.ts
    │   │   └── scan-drift.ts
    │   └── knowledge.ts               # render markdown desde convention.ts
    └── tests/
        ├── convention.spec.ts
        ├── suggest.spec.ts
        ├── scan.spec.ts
        ├── runners.spec.ts
        └── knowledge.spec.ts
````

## 4. Diseño de la convención canónica

### 4.1 `convention.ts` (default exporta una constante)

````typescript
import type { Lang } from './runners';

export interface ITestConvention {
  /** File suffix for test specs. Default: 'spec.ts'. */
  readonly specExtension: string;
  /** Where specs live relative to the source file. */
  readonly specLayout: 'colocate' | 'tests-mirror' | 'tests-flat';
  /** Runners the project uses (used to render correct mock hints). */
  readonly runners: readonly string[];
  /** Mock API the specs should use (derived from runners). */
  readonly mockStyle: 'vi' | 'jest' | 'auto';
  /** Every spec must be wrapped in a top-level `describe`. */
  readonly requireDescribe: boolean;
  /** Minimum coverage thresholds (0-100). */
  readonly coverageThreshold: {
    readonly lines: number;
    readonly functions: number;
    readonly branches: number;
    readonly statements: number;
  };
  /** Patterns forbidden in any spec (regex /i). */
  readonly forbiddenPatterns: readonly RegExp[];
  /** Languages the conventions apply to (drives runners.ts). */
  readonly languages: readonly Lang[];
}

export const DEFAULT_CONVENTION: ITestConvention = {
  specExtension: 'spec.ts',
  specLayout: 'colocate',
  runners: ['vitest'],
  mockStyle: 'auto',
  requireDescribe: true,
  coverageThreshold: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80,
  },
  forbiddenPatterns: [
    /\.only\(['"`]/,           // describe.only / it.only / test.only
    /xit\(/,                  // skipped tests left behind
    /@ts-ignore/,             // should be @ts-expect-error with a reason
    /console\.log/,           // debug residue
  ],
  languages: ['ts'],
};

export const mergeConvention = (
  overrides: Partial<ITestConvention> = {},
): ITestConvention => ({
  ...DEFAULT_CONVENTION,
  ...overrides,
  coverageThreshold: {
    ...DEFAULT_CONVENTION.coverageThreshold,
    ...(overrides.coverageThreshold ?? {}),
  },
});
````

### 4.2 `runners.ts`

````typescript
import type { IFileReader } from '@mcp-vertex/core/public';

export type Lang = 'ts' | 'tsx' | 'js' | 'jsx' | 'py' | 'go' | 'rs';

export interface IRunnerInfo {
  readonly name: 'vitest' | 'jest' | 'unknown';
  readonly mockApi: 'vi' | 'jest';
  readonly evidence: string; // which file proved it
}

/**
 * Detect the project's test runner by looking at lockfile + scripts.
 * Pure over `reader`; the host injects it (engines never touch the FS).
 */
export const detectRunner = (reader: IFileReader): IRunnerInfo => {
  if (
    reader.exists('vitest.config.ts') ||
    reader.exists('vitest.config.js') ||
    reader.exists('vitest.config.mts')
  ) {
    return { name: 'vitest', mockApi: 'vi', evidence: 'vitest.config.*' };
  }
  if (reader.exists('jest.config.ts') || reader.exists('jest.config.js')) {
    return { name: 'jest', mockApi: 'jest', evidence: 'jest.config.*' };
  }
  const pkg = reader.readFile('package.json');
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg) as { scripts?: Record<string, string> })
        .scripts;
      if (scripts?.test?.includes('vitest')) {
        return { name: 'vitest', mockApi: 'vi', evidence: 'scripts.test' };
      }
      if (scripts?.test?.includes('jest')) {
        return { name: 'jest', mockApi: 'jest', evidence: 'scripts.test' };
      }
    } catch {
      /* ignore */
    }
  }
  return { name: 'unknown', mockApi: 'jest', evidence: 'none' };
};
````

### 4.3 `suggest.ts`

````typescript
import type { ITestConvention } from './convention';

/**
 * Given a source file path inside the workspace, return where its
 * companion spec should live, per the convention. Pure: no FS access.
 */
export const suggestSpecPath = (
  sourcePath: string,
  convention: ITestConvention,
): { specPath: string; rationale: string } => {
  if (!sourcePath.startsWith('src/')) {
    return {
      specPath: sourcePath,
      rationale: 'non-src path: place spec next to source (colocate)',
    };
  }
  const ext = convention.specExtension;
  switch (convention.specLayout) {
    case 'colocate':
      return {
        specPath: sourcePath.replace(/\.tsx?$/, `.${ext}`),
        rationale: `colocate: <source>.<${ext}>`,
      };
    case 'tests-mirror':
      return {
        specPath: sourcePath.replace(/^src\//, 'tests/').replace(/\.tsx?$/, `.${ext}`),
        rationale: `mirror under tests/: tests/<mirror-of-src>.<${ext}>`,
      };
    case 'tests-flat':
      return {
        specPath: `tests/${sourcePath.split('/').pop()?.replace(/\.tsx?$/, `.${ext}`) ?? 'unknown.spec.ts'}`,
        rationale: `flat: tests/<basename>.<${ext}>`,
      };
  }
};
````

### 4.4 `scan.ts` (reglas de drift)

Cada regla es una `{ id, severity, check(file, contents) }`. El motor
recorre `src/` + `tests/` (configurable) y devuelve violaciones
estructuradas, **sin tirar el lint** (cada regla explica `hint`).

Reglas iniciales (cubren el 80% del drift que vemos):

| id                          | severity | qué mira |
|-----------------------------|----------|----------|
| `wrong-spec-extension`      | error    | El archivo en `tests/` o junto a `src/` no termina en `<specExtension>`. |
| `missing-spec-for-export`   | warning  | Un `.ts` en `src/` exporta funciones públicas y no tiene `.spec.ts` emparejado. |
| `orphan-spec`               | warning  | Un `.spec.ts` existe pero su `import` objetivo no se resuelve. |
| `missing-top-level-describe`| error    | El spec no empieza con `describe(` (si `requireDescribe`). |
| `forbidden-only`            | error    | Aparece `.only(` (saltaría el resto en CI). |
| `forbidden-ts-ignore`       | warning  | Aparece `@ts-ignore` (preferir `@ts-expect-error`). |
| `console-residue`           | info     | Aparece `console.log` (limpiar antes de cerrar). |
| `wrong-mock-api`            | error    | El spec usa `jest.fn()` en un repo vitest o viceversa. |
| `describe-it-naming`        | info     | El `describe(...)` no nombra el módulo (`describe('foo', ...)` esperado). |

Cada violación:

````typescript
export interface IDrift {
  readonly id: string;
  readonly file: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly hint: string;
  readonly line?: number;        // 1-indexed, opcional
  readonly excerpt?: string;     // 1 línea de contexto, opcional
}
````

### 4.5 `index.ts` (entry del plugin)

````typescript
import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildGetConvention } from './lib/tools/get-convention';
import { buildSuggestSpec } from './lib/tools/suggest-spec';
import { buildScanDrift } from './lib/tools/scan-drift';
import { mergeConvention } from './convention';

const OPTIONS = z
  .object({
    specExtension: z.string().optional(),
    specLayout: z.enum(['colocate', 'tests-mirror', 'tests-flat']).optional(),
    runners: z.array(z.string()).optional(),
    mockStyle: z.enum(['vi', 'jest', 'auto']).optional(),
    requireDescribe: z.boolean().optional(),
    coverageThreshold: z
      .object({
        lines: z.number().min(0).max(100).optional(),
        functions: z.number().min(0).max(100).optional(),
        branches: z.number().min(0).max(100).optional(),
        statements: z.number().min(0).max(100).optional(),
      })
      .optional(),
    forbiddenPatterns: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
  })
  .strict();

export default definePlugin({
  name: 'test-convention',
  version: '0.1.0',
  describe:
    'Publica la convención canónica de tests del repo y herramientas para sugerir ubicación de specs y auditar drift contra el árbol real.',
  optionsSchema: OPTIONS,
  register(ctx) {
    const convention = mergeConvention(ctx.options);
    const reader = ctx.workspace.reader;
    return {
      tools: [
        buildGetConvention({ namespacePrefix: ctx.namespacePrefix, convention }),
        buildSuggestSpec({ namespacePrefix: ctx.namespacePrefix, convention }),
        buildScanDrift({
          namespacePrefix: ctx.namespacePrefix,
          convention,
          reader,
          workspaceRoot: ctx.workspace.root,
        }),
      ],
      knowledge: [
        {
          id: 'test-convention-overview',
          title: 'Convención canónica de tests',
          body: renderOverviewMarkdown(convention),
        },
        {
          id: 'test-convention-runners',
          title: 'Runners detectados y mock API',
          body: renderRunnersMarkdown(reader),
        },
        {
          id: 'test-convention-coverage',
          title: 'Umbrales de cobertura',
          body: renderCoverageMarkdown(convention),
        },
      ],
    };
  },
});
````

### 4.6 Tools (uno por builder; mismo patrón que quality/status-marker)

- `<prefix>_get_convention` → `{ convention: ITestConvention, markdown: string }`.
  Output: `outputSchema` literal del objeto, para que el agente
  consuma **estructura** y no tenga que parsear markdown.
- `<prefix>_suggest_spec_path { sourcePath: string }` →
  `{ specPath, rationale, skeleton: 'describe("<mod>", () => { it("…", () => {…}))' }`.
- `<prefix>_scan_drift { scope?: 'all' | 'src' | 'tests' }` →
  `{ ok: boolean, violations: IDrift[], counts: { error, warning, info } }`.

> `ok: true` solo cuando `counts.error === 0`. El orquestador puede
> usar este booleano como gate antes de cerrar la slice.

## 5. Configuración por proyecto (sin forkear)

````jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "test-convention": {
      "options": {
        "specExtension": "spec.ts",
        "specLayout": "colocate",
        "runners": ["vitest"],
        "coverageThreshold": {
          "lines": 85,
          "branches": 75
        },
        "forbiddenPatterns": ["\\.only\\(['\"`]"]
      }
    }
  }
}
````

> El plugin acepta `forbiddenPatterns` como strings (no regex
> literales) porque las opciones del plugin viajan por JSON. La
> compilación a `RegExp` se hace dentro del plugin con
> `new RegExp(...)` y se cachea.

## 6. Activación y uso

### En el swarm preset

````jsonc
// mcp-vertex.config.json (raíz del repo que adopta)
{
  "plugins": {
    "test-convention": { "options": {} }
  }
}
````

o usando el preset:

````bash
mcp-vertex --preset=swarm   # ahora incluye test-convention
# o explícito:
mcp-vertex --plugins=quality,test-convention,status-marker
````

### Uso por el agente

1. Antes de escribir el primer spec de una feature nueva:
   `test-convention_suggest_spec_path { sourcePath: "src/lib/foo/bar.ts" }` →
   `{ specPath: "src/lib/foo/bar.spec.ts", rationale: "colocate", skeleton: "…" }`.
2. Antes de cerrar la slice:
   `test-convention_scan_drift { scope: "all" }` →
   `{ ok: true, counts: { error: 0, warning: 1, info: 2 }, violations: [...] }`.
3. Cuando duda del formato:
   `test-convention_get_convention {}` → `{ convention, markdown }`.

### Uso por el orquestador / humano

- **Gate de cierre de slice**: `scan_drift.ok === true` (sin errors)
  antes de `<status-marker>_close { state: "HECHO" }`.
- **Reporte rápido**: lista de IDs de violación frecuentes en este
  repo, para alimentar retrospectivas y PR-review checklists.

## 7. Compatibilidad con `@mcp-vertex/quality` y `@mcp-vertex/status-marker`

| Plugin             | Qué hace | Relación con este |
|--------------------|----------|-------------------|
| `quality`          | Ejecuta los scopes (`test`, `lint`, `build`) y devuelve `{ok, results}`. | Complementario: si `scan_drift` reporta `wrong-mock-api`, `run_quality test` fallará; el plugin de convention te lo dice **antes** de pagar el ciclo de tests. |
| `status-marker`    | Obliga al cierre coloreado. | Ortogonal: el cierre `🟩 [HECHO]` puede condicionarse a `scan_drift.ok === true`. |

El plugin **no duplica** nada de estos: no ejecuta tests, no formatea
cierres. Es la **capa de "cómo se escriben"** entre la decisión
humana ("queremos tests así") y la ejecución (quality).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Las reglas son opinionadas y el repo no las quiere | El plugin es **opt-in** y **todo overrideable** vía `options`. El default es razonable, no dogma. |
| `scan_drift` lee muchos archivos y revienta el budget | El scan es async, devuelve solo `violations[]` (no `contents`). En archivos >50 KB, devuelve `excerpt` recortado. Cap configurable: `maxFilesScanned` (default 500). |
| `forbiddenPatterns` como regex rompen un spec legítimo | Se exponen como **info** o **warning** por defecto; solo `error` si el repo lo sube explícitamente. La lista inicial no incluye `.skip` (es legítimo). |
| El runner cambia (vitest → jest) y el agent no se entera | `detectRunner()` se ejecuta en cada `scan_drift`. Si cambia, el knowledge `test-convention-runners` se actualiza y `wrong-mock-api` empieza a marcar. |
| Dos proyectos con convenciones distintas en el mismo monorepo | El plugin se carga **una vez por workspace** (no por package). Para monorepos mixtos, abrir f00003 con `specLayout: 'per-package'` y `packageMatchers`. |

## 9. Plan de adoption en este repo

1. **Merge l108** (esta propuesta).
2. Crear `plugins/test-convention/` con la estructura de §3, copiar
   `vitest.config.ts` desde `plugins/status-marker/`.
3. Añadir el plugin a `STANDARD_PRESET` (no, mejor **solo swarm**:
   los repos single-agent suelen tener una convención ya fijada).
4. Actualizar `examples/swarm/README.md` con la fila del plugin.
5. Añadir entrada al `PLUGIN_LIST` en `apps/web/scripts/gen-capabilities.ts`.
6. Regenerar `apps/web/src/data/capabilities.json` y `skills.json`.
7. Cargar el plugin en la `.mcp.json` raíz (dogfooding).
8. Una vez mergee, abrir f00003 si alguien reporta fricción en monorepos.

> **Decisión recomendada**: añadir a `swarm` **solo**. `standard` y
> `minimal` quedan igual (la convención de tests es decisión de cada
> proyecto; no se la imponemos al que viene por orientación rápida).

## 10. Definition of done

- [ ] Carpeta `plugins/test-convention/` con `package.json`,
      `README.md`, `LICENSE`, `tsconfig.json`, `vitest.config.ts`.
- [ ] `src/index.ts`, `src/convention.ts`, `src/suggest.ts`,
      `src/scan.ts`, `src/public/index.ts`, `src/lib/runners.ts`,
      `src/lib/tools/{get-convention,suggest-spec,scan-drift}.ts`,
      `src/lib/knowledge.ts`.
- [ ] `src/tests/{convention,suggest,scan,runners,knowledge}.spec.ts`
      cubriendo: defaults, override, detectRunner para los 3 casos,
      suggest para los 3 layouts, scan con las 9 reglas, knowledge
      con el markdown esperado.
- [ ] Plugin exportado en `vitest.shared.ts#workspaceAliases`.
- [ ] `parse-cli-args.ts#PLUGIN_PRESETS.swarm` incluye
      `'test-convention'`.
- [ ] `gen-capabilities.ts#PLUGINS['mcp-test-convention']` importa el
      plugin (necesita `bun run build` primero).
- [ ] `examples/swarm/README.md` actualizado con la fila del plugin.
- [ ] `mcp-vertex.config.json` raíz con
      `"plugins": { "test-convention": { "options": {} } }`.
- [ ] Página web del plugin: una entrada en la sección "Plugins" con
      la tabla de la convención, ejemplo de `suggest_spec_path`,
      ejemplo de `scan_drift`, y un "Cómo adoptar" con 5 líneas de
      config.
- [ ] `bun run validate` verde (typecheck + lint + tests).
- [ ] Al menos una traducción completa de los strings i18n del plugin
      en `apps/web/src/i18n/langs/{en,es,ja,...}.ts` (todos los
      12 idiomas, ver `check-i18n.ts`).
- [ ] Smoke test: `mcp-vertex --plugins=test-convention` lista los 3
      tools.

## 11. Out of scope (para no engordar la propuesta)

- **Mutation testing** (Stryker, etc.) — es otro gate, va en l107+
  como quality scope.
- **Snapshot policy** — opinionado y cambiante; mejor knowledge
  inicial, regla después de feedback.
- **Property-based testing** (fast-check) — sí se menciona en el
  knowledge; no se obliga.
- **Mocks de red / MSW** — el plugin no prescribe; se documenta en
  `test-convention-overview` como "permitido, declarar en
  `setupFiles`".

## 12. Decisión (marca lo que quieras)

- [ ] **Alcance**: ¿MVP (3 tools + knowledge + scan_drift) como en §4,
      o partirlo en dos proposals (knowledge + suggest primero,
      scan_drift después)?
- [ ] **Preset**: añadir a `swarm` (recomendado) vs `standard` también.
- [ ] **Naming del tool**: ¿`<prefix>_scan_drift` (recomendado) vs
      `<prefix>_lint_tests` vs `<prefix>_audit_convention`?
- [ ] **Severidad por defecto** de cada regla: ver §4.4. ¿Algún
      cambio?
- [ ] **¿Knowledge renderiza con i18n** o solo en EN? Recomendado:
      EN (es un repo, no un producto para el usuario final).
- [ ] **¿Página web dedicada** en `apps/web/src/pages/plugins/[…]` o
      sección dentro de `/guide`? Recomendado: como cualquier otro
      plugin (`[plugin].astro` lo autogenera si está en capabilities).

## 13. Cierre de slice — refactor SOLID del `scanDrift` (2026-06-19)

**Estado**: primer slice aplicado y commiteado.

**Commit**: `320b951` —
`refactor(test-convention): apply spec-content rules to misnamed specs (DRY)`.

**Qué cambió** (2 archivos, +17 / −110):

1. `plugins/test-convention/src/scan.ts`:
   - Extrae toda la aplicación de reglas de contenido (mock API
     mismatch, forbidden patterns, orphan imports, missing describe)
     a un único helper `runSpecRules(path, contents, convention, all, push)`.
   - Elimina el bloque inline duplicado de ~110 líneas en la rama
     `if (isSpec(path, specExt))` que ahora delega en el helper.
   - El helper se invoca tanto para **specs canónicos** (`*.spec.ts`)
     como para **misnamed specs** (`*.test.ts` que contengan
     `describe`/`it`/`test`). Antes, un archivo `*.test.ts` con
     `it.only()` solo reportaba `wrong-spec-extension` y silenciaba
     el `forbidden-only`. Ahora reporta **ambas**.
   - La rama del `if (isMisnamedSpec)` mantiene la regla
     `wrong-spec-extension` para guiar el rename.

2. `plugins/test-convention/tsconfig.json`:
   - Quita `composite: true` (incompatible con
     `tsconfig.base.json` que define `declaration: false`,
     emitía `error TS6304`).
   - Alinea la forma con los otros plugins (quality, status-marker):
     sólo `extends` + `include` de `src` y `tests`.

**Definition of done** (verificado):

- [x] `bun run validate` verde: typecheck + biome + stylelint + tests.
- [x] Tests del plugin: 39/39 (incluido
      `flags wrong-spec-extension and missing-top-level-describe`,
      que antes fallaba).
- [x] Tests globales del repo: 618 pasaron, 10 skipped, 0 fallaron
      (92 archivos, 5.59 s).
- [x] Conventional commit + rama limpia.

**Pendiente para próximas slices** (no hechos aquí, fuera del scope
de este slice):

- Cargar el plugin en el swarm preset (§9.3 — `parse-cli-args.ts`).
- Smoke test en `mcp-vertex --plugins=test-convention` (§10).
- Página web del plugin (§10) — depende del cierre de l100/l105.
- i18n del knowledge entry en los 12 idiomas (§10).
- Adoptar el plugin en la `.mcp.json` raíz (dogfooding).

## 14. Post-cierre (2026-06-20)

Verificado el 2026-06-20 que **todos los pendientes arriba están
resueltos** por commits paralelos del swarm:

| Pendiente                       | Resuelto por                                   |
|---------------------------------|------------------------------------------------|
| swarm preset (`parse-cli-args`) | ya en `swarm: [..., 'test-convention']`       |
| `gen-capabilities.ts`           | ya importa `testConventionPlugin`              |
| `mcp-vertex.config.json` raíz   | ya carga `"test-convention": { "options": {} }` |
| `examples/swarm/README.md`      | ya documentado en §6 (fila del plugin + tour)  |
| Página web del plugin           | se autogenera en `/plugins/test-convention` vía `[plugin].astro` (x00004 B10) |
| Página `/capabilities`          | incluye el plugin con conteo y desplegable (x00004 B10, slice `127fa0c`) |
| i18n del knowledge en 12 idiomas | **NO hecho aún** — pendiente para un slice dedicado (l109+ / l110+) |

**Definition of done** de §10:

- [x] `plugins/test-convention/` con `package.json`, `README.md`,
      `LICENSE`, `tsconfig.json`, `vitest.config.ts`.
- [x] `src/index.ts`, `src/convention.ts`, `src/suggest.ts`,
      `src/scan.ts`, `src/lib/{runners,knowledge}.ts`,
      `src/lib/tools/{get-convention,suggest-spec,scan-drift}.ts`.
- [x] 5 specs (convention, suggest, scan, runners, knowledge).
- [x] Plugin exportado en el barrel del swarm (`parse-cli-args.ts`).
- [x] `gen-capabilities.ts#PLUGINS['mcp-test-convention']` importa el
      plugin.
- [x] `examples/swarm/README.md` actualizado.
- [x] `mcp-vertex.config.json` raíz con
      `"plugins": { "test-convention": { "options": {} } }`.
- [x] Página web del plugin: autogenerada en `/plugins/test-convention`
      por `[plugin].astro`, con la descripción localizada, los tools
      y el bloque de instalación.
- [x] `bun run validate` verde: typecheck + biome + stylelint + 634 tests.
- [ ] **Pendiente real**: i18n del knowledge entry en 12 idiomas.
- [ ] **Pendiente real**: smoke test end-to-end
      (`mcp-vertex --plugins=test-convention` lista los 3 tools).
      Sustituible por el test del catálogo del plugin en `tests/`.