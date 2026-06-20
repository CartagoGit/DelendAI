---
id: p102
type: proposal
status: deferred
track: core+scaffold
date: 2026-06-18
deferred: 2026-06-18
budget: 4
---

# p102 — `keepLegacy: false` por defecto en `mcp-vertex` y en el `mcp-project` que genera

> **Estado: NO SE VA A HACER AHORA — solo proposal archivada.** Decisión
> del usuario 2026-06-18. La propuesta queda escrita para cuando
> llegue una refactor / migración real en la que se necesite esta
> garantía. Mientras tanto, sirve de contrato público y de punto de
> referencia para otras decisiones.

## 0. Contexto y motivación

`@mcp-vertex/core` es un núcleo de **servidor MCP** que, además de
arrancar un servidor real, expone un *kit de scaffold* que genera
nuevos proyectos (`scaffoldHostProject`, `scaffoldPluginFiles`,
`scaffoldToolFile`, `scaffoldPromptFile`, `scaffoldSkillFile`,
`scaffoldAgentFile`, `scaffoldClientFiles`) y un *analyzer* que
recomienda qué debe tener el `mcp-project` que ese scaffold produce
(`build-blueprint.ts`, `plan_mcp_project`). Toda esa maquinaria,
hoy, **asume implícitamente que el proyecto destino es greenfield**:
si un agente pide un nuevo tool / prompt / skill y el archivo ya
existe, el scaffold **lo salta sin avisar** ("Refuse to overwrite:
scaffolds are starting points, not migrations." —
`scaffold-tool.ts:148`); si un agente le pide reescribir el
`host-config.ts`, **lo reescribe desde cero** borrando lo que el
usuario había customizado.

Eso está bien para greenfield. Pero para refactors y migraciones
completas es un problema serio y recurrente:

1. **Refactors de un proyecto existente.** El usuario quiere
   "regenerar el host porque cambié la versión de `mcp-vertex`" o
   "aplicar el nuevo estilo de scaffold a todo mi `libs/mcp-project`".
   El comportamiento por defecto actual borra customizaciones: si el
   usuario había añadido tools a `extraTools` en `host-config.ts`, se
   pierden. Si había tocado el `<prefix>_scaffold` para apuntar a un
   subdirectorio distinto, también.
2. **Migraciones completas de un stack.** El caso típico es el
   `Jest → Vitest` que hubo en el repo hermano: cambiar un test
   runner entero. El usuario necesita (a) regenerar el scaffold con
   la nueva plantilla y (b) **mantener** sus archivos legacy
   (configuraciones específicas, scripts propios, alias, setups
   custom) en `legacy/` o en su sitio original, para poder hacer
   rollback si la migración sale mal y para poder comparar
   implementación vieja vs nueva lado a lado.

Hoy ninguno de los dos casos está soportado de forma explícita. La
primera vez que se intenta, el agente (o el usuario) acaba
sobreescribiendo código a mano y perdiendo cambios. El toolkit no
ayuda.

**Decisión propuesta**: introducir un flag global `keepLegacy` que
**por defecto es `false`** (no rompe a nadie en greenfield) y que
cuando se pone en `true` cambia tres comportamientos a la vez:
(i) las regeneraciones de scaffold **mueven** lo viejo a `legacy/`
en vez de sobreescribirlo; (ii) las migraciones de stores versionados
que ya hacen backup (`migrate-file.ts`) lo exponen como opción
explícita y simétrica; (iii) el blueprint que el analyzer genera
para crear `mcp-project` lleva el flag pre-poblado en `false` y
**advierte** cuando lo activas para que el usuario sea consciente de
que está cambiando el contrato de scaffold de su proyecto.

## 1. Goals

1. **`keepLegacy: false` por defecto** en `mcp-vertex.config.json`
   (`IMcpVertexConfigFile`), en `scaffold-tool.ts`
   (`SCAFFOLD_INPUT_SCHEMA`), en `migrate-file.ts`
   (`IMigrateFileOptions`) y en el output del analyzer
   (`build-blueprint.ts`).
2. **Cuando `keepLegacy: true`**, los generadores de scaffold:
   - Detectan el archivo destino.
   - Si existe, lo mueven a `legacy/<basename>-<ts>.<ext>` (con
     timestamp en base 36, mismo formato que `migrate-file.ts:65`).
   - Escriben el archivo nuevo en el path original.
   - Devuelven en el `IScaffoldReport` los `moved: string[]` con los
     paths legacy para que el caller pueda enseñárselos al usuario.
3. **Cuando `keepLegacy: true`**, `migrateJsonFile` también acepta el
   flag (aunque hoy ya hace backup automático si hay cambio), para
   que el llamador pueda **forzar backup incluso sin cambio** (caso
   de uso: "estoy a punto de tocar este store a mano, déjame un
   snapshot"). Cuando es `false` (defecto), se omite el backup si no
   hay cambio — comportamiento actual, sin regresión.
4. El analyzer `build-blueprint.ts` (que es el que arma el
   `mcp-project` que el core ayuda a crear) **recomienda** en su
   output JSON un valor por defecto para `keepLegacy` y, si en el
   proyecto destino ya detecta un `mcp-vertex.config.json` con
   archivos custom (heurística: el `host-config.ts` tiene
   `extraTools` no vacíos o comentarios de customización), sugiere
   `keepLegacy: true` con un `warning` explicativo.
5. Documentación: el campo se documenta en `packages/core/README.md`
   (sección de "scaffold + migrations") y en
   `docs/PLUGINS-MCP-VERTEX.md` si toca algún plugin. La propuesta
   misma queda como referencia pública en `docs/proposals/`.

## 2. No-objetivos

- **No** se introduce un sistema completo de "merge" entre el archivo
  viejo y el nuevo (eso sería un siguiente paso y un slice aparte).
  `keepLegacy` solo preserva el viejo **íntegro** en `legacy/`; si
  el usuario quiere un merge, lo hace a mano después.
- **No** se cambia el comportamiento por defecto (siempre `false`).
  Greenfield sigue funcionando exactamente igual que hoy.
- **No** se modifica el formato de los archivos scaffold (los
  templates no cambian; solo cambia *qué pasa con lo viejo*).
- **No** se introduce VCS-awareness: `keepLegacy` no llama a
  `git mv`, no crea commits automáticos, no hace stash. Solo mueve
  bytes en el filesystem y deja que el usuario decida el commit.
- **No** se modifica el comportamiento de los stores que **no**
  usan `migrate-file.ts` (p.ej. los stores de `proposals/` que
  tienen su propio writer). Eso se aborda en cada plugin
  individualmente si surge la necesidad.

## 3. Diseño

### 3.1 El campo en `IMcpVertexConfigFile`

`packages/core/src/lib/plugins/load-config-file.ts`:

```ts
export interface IMcpVertexConfigFile {
  readonly $schema?: string;
  readonly cacheDir?: string;
  readonly docsDir?: string;
  readonly validationMatrix?: { ... };
  readonly plugins?: Readonly<Record<string, IMcpVertexPluginConfig>>;
  /** Default false. When true, regenerating a scaffold moves the
   *  existing file to legacy/<basename>-<ts>.<ext> instead of
   *  overwriting or skipping it. */
  readonly keepLegacy?: boolean;
}
```

Y `CONFIG_FILE_SCHEMA` se amplía con `keepLegacy: z.boolean().optional()`.
`assembleCliConfig` propaga el valor al contexto para que cualquier
generador / migrador lo consulte sin tener que releer el JSON.

### 3.2 `SCAFFOLD_INPUT_SCHEMA`

`scaffold-tool.ts:39`:

```ts
export const SCAFFOLD_INPUT_SCHEMA = z.object({
  kind: z.enum([...]),
  name: z.string().optional(),
  description: z.string().optional(),
  slot: z.enum([...]).optional(),
  dryRun: z.boolean().optional(),
  keepLegacy: z.boolean().optional()
    .describe('Override the config-level keepLegacy for this call.'),
});
```

Resolución: `keepLegacy = args.keepLegacy ?? ctx.config.keepLegacy ?? false`.
El `IScaffoldReport` añade:

```ts
readonly moved: readonly string[];   // legacy/<basename>-<ts>.<ext>
readonly kept: readonly string[];    // original skipped (dryRun + !keepLegacy)
```

### 3.3 Movimiento atómico a `legacy/`

`scaffold-tool.ts:buildScaffoldReport` sustituye el bloque actual
(`stat` + `mkdir` + `writeFile`) por:

```ts
const target = options.workspace.resolve(file.path);
let existing: string | null = null;
try {
  await stat(target);
  existing = target;
} catch { /* missing — proceed to write */ }

if (existing && (effectiveKeepLegacy)) {
  const legacyDir = options.workspace.resolve('legacy');
  const ts = Date.now().toString(36);
  const ext = extname(file.path);
  const base = basename(file.path, ext);
  const dest = options.workspace.resolve(`legacy/${base}-${ts}${ext}`);
  await mkdir(legacyDir, { recursive: true });
  await rename(existing, dest);             // atómico en same-fs
  moved.push(relative(dest));
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, file.content, 'utf8');
```

`writeFileAtomic` (ya en `shared/atomic-write.ts`) se sigue usando
para la escritura del nuevo archivo. `rename` dentro del mismo
filesystem es atómico; si `legacy/` cruza device boundary (poco
probable en monorepos pero posible), fallback a copy + unlink, y
se loguea en `errors[]`.

### 3.4 `migrate-file.ts`: backup forzado

`packages/core/src/lib/migrations/migrate-file.ts`:

```ts
export interface IMigrateFileOptions {
  readonly migrators: Readonly<Record<number, IMigrator>>;
  readonly targetVersion: number;
  readonly dryRun?: boolean;
  /** Default false. When true, force a backup even if no migrator
   *  ran. Honoured regardless of the global keepLegacy flag — this
   *  option is the per-call escape hatch. */
  readonly forceBackup?: boolean;
}
```

Lógica: si `changed || options.forceBackup`, escribir
`${path}.bak-<ts>` antes del `writeFileAtomic`. Esto da simetría
con `keepLegacy` y cubre el caso "estoy a punto de editar este store
a mano".

### 3.5 El analyzer: `build-blueprint.ts`

`packages/core/src/lib/tools/build-blueprint.ts` (o donde esté la
función que `plan_mcp_project` consume) genera un objeto
`IProjectBlueprint` con la lista de tools, prompts, skills, agents
y archivos de scaffold recomendados para el `mcp-project` del
usuario. La salida añade:

```ts
export interface IProjectBlueprint {
  ... // campos existentes
  readonly defaults: {
    readonly keepLegacy: boolean;
    readonly reasons: readonly string[];
  };
}
```

Heurística para sugerir `keepLegacy: true`:

- El `host-config.ts` candidato tiene `extraTools` con length > 0.
- El `mcp-vertex.config.json` del usuario (si existe) tiene plugins
  custom o `validationMatrix.scopes` no vacío.
- El usuario pidió explícitamente una migración (palabras clave
  detectadas en el input del analyzer: "migrate", "refactor",
  "rewrite", "replace <X> with <Y>").

En cualquier caso, `defaults.keepLegacy` queda en `false` salvo que
la heurística dispare, y `defaults.reasons` siempre incluye la
cadena `"greenfield-safe default"` o la razón concreta por la que se
recomienda cambiar.

### 3.6 Discovery del flag por parte de los plugins

`IMcpPluginContext` (en `packages/core/src/lib/plugins/plugin-contract.ts`)
añade `readonly keepLegacy: boolean` resuelto por `assemble`. Los
plugins que escriben estado versionado (proposals, memory,
notification) **deben** consultar `ctx.keepLegacy` para decidir
si preservan el archivo viejo. Esto se documenta en
`docs/PLUGINS-MCP-VERTEX.md` como parte del contrato de autor
de plugin.

## 4. Slices (orden de ejecución, disjuntas)

> **Recordatorio: estos slices NO se van a ejecutar ahora.** Se
> dejan escritos para que, cuando el usuario decida abordar la
> propuesta, el agent que la abra tenga el plan ya validado. Cada
> slice es file-disjoint y se puede ejecutar en paralelo (verificar
> con `mcp-vertex_proposals_plan` antes de delegar).

- **id: s1** — `keepLegacy` en config + assemble.
  - files: [packages/core/src/lib/plugins/load-config-file.ts,
    packages/core/src/lib/plugins/load-plugins.ts,
    packages/core/src/lib/plugins/plugin-contract.ts,
    packages/core/src/lib/cli/assemble.ts,
    packages/core/schema/mcp-vertex.config.schema.json,
    packages/core/tests/plugins/load-config-file.spec.ts]
  - Acepta el flag en el JSON Schema, propaga por assemble, expone
    en `IMcpPluginContext`. Tests: missing → `false`; explicit
    `true` → propaga; `assemble` lo pasa a plugins cargados.
  - status: todo

- **id: s2** — `scaffold-tool.ts`: move-to-legacy + report.
  - files: [packages/core/src/lib/scaffold/scaffold-tool.ts,
    packages/core/src/lib/scaffold/scaffold-host.ts,
    packages/core/tests/scaffold/scaffold-tool.spec.ts]
  - `IScaffoldReport` añade `moved`/`kept`. Implementa el bloque de
    `rename` descrito en §3.3 con fallback copy+unlink cross-device.
    Tests: greenfield (no legacy), keepLegacy=true con archivo
    existente (se mueve a `legacy/`, se escribe el nuevo), dryRun
    (no toca FS), overwrite-existing con keepLegacy=false (skip,
    comportamiento actual).
  - status: todo

- **id: s3** — `migrate-file.ts`: `forceBackup`.
  - files: [packages/core/src/lib/migrations/migrate-file.ts,
    packages/core/tests/migrations/migrate-file.spec.ts]
  - Tests: changed=true → backup igual que hoy; changed=false +
    forceBackup=true → backup aunque no haya cambio;
    changed=false + forceBackup=false → no backup (default, sin
    regresión).
  - status: todo

- **id: s4** — Analyzer `build-blueprint.ts`: `defaults.keepLegacy`.
  - files: [packages/core/src/lib/tools/build-blueprint.ts,
    packages/core/tests/tools/build-blueprint.spec.ts,
    docs/PLUGINS-MCP-VERTEX.md]
  - Implementa la heurística de §3.5 y la documenta en el doc de
    plugins. Tests: greenfield → `false` con reason
    `"greenfield-safe default"`; host-config con extraTools →
    `true` con reason `"host-config has custom extraTools"`; input
    con keyword "migrate" → `true` con reason explícita.
  - status: todo

- **id: s5** — README + ejemplos.
  - files: [packages/core/README.md,
    examples/minimal/mcp-vertex.config.json,
    examples/custom-plugin/mcp-vertex.config.json]
  - Documenta el flag con un párrafo en el README y un ejemplo
    "before / after" de un workflow de migración real. NO incluye
    los ejemplos de los otros workspaces (swarm, etc.) salvo que
    el usuario lo pida — son privados.
  - status: todo

## 5. Acceptance / Definition of Done

- `bun run validate` en verde (typecheck + lint + tests).
- `bun run test` añade al menos 6 specs nuevos:
  3 para `scaffold-tool` (greenfield, keepLegacy, dryRun cross-device),
  2 para `migrate-file` (forceBackup on/off),
  1 para `build-blueprint` defaults.
- `mcp-vertex.config.schema.json` regenerado y commiteado (no es
  manual; `bun run config:schema` lo emite).
- Un e2e manual: en `examples/minimal/`, poner `keepLegacy: true`,
  correr `<prefix>_scaffold kind=host`, verificar que el
  `host-config.ts` original se movió a `legacy/host-config-<ts>.ts`
  y que el nuevo se escribió. Limpiar después con `git clean -fd
  legacy/`.
- Conventional Commits con prefijo `feat!:` (cambia la forma del
  `outputSchema` de `<prefix>_scaffold`, que es un cambio
  compatible hacia atrás — el `IScaffoldReport` solo añade campos
  nuevos — pero la release automática lo trata como minor por la
  nueva superficie en el config file).

## 6. Riesgos y mitigaciones

- **Riesgo**: un usuario activa `keepLegacy: true` por error y
  acaba con un árbol lleno de `legacy/` que no sabe cómo limpiar.
  **Mitigación**: `defaults.reasons` siempre explica por qué se
  recomienda `true`; el analyzer incluye un warning visible en su
  output; el README documenta `git clean -fd legacy/` como vía de
  rollback. No se añade `keepLegacy: true` al `scaffold` por
  defecto en ningún caso.
- **Riesgo**: `rename` falla entre filesystems distintos (p.ej.
  `legacy/` en `/tmp` y destino en `/home`). **Mitigación**: el
  bloque tiene fallback `copyFile` + `unlink` y lo registra en
  `errors[]` si pasa. El spec cubre este caso con un mock de fs.
- **Riesgo**: los plugins existentes (proposals, memory,
  notification) ignoran `ctx.keepLegacy` y siguen sobreescribiendo.
  **Mitigación**: slice s1 expone el campo; los plugins lo
  consumen en su PR siguiente (out of scope de p102). El doc
  `PLUGINS-MCP-VERTEX.md` deja claro que es contrato de autor.
- **Riesgo**: la heurística del analyzer dispara falsos positivos
  en greenfield. **Mitigación**: solo dispara con evidencia
  concreta (host-config custom, plugins custom, keyword de
  migración en input). El default sigue siendo `false`.

## 7. Por qué NO se hace ahora

El usuario explícitamente pidió "una propuesta que no vamos a hacer
ahora". Razones para archivarla:

1. **No hay un refactor o migración activa** en `mcp-vertex` /
   `mcp-project` que justifique el coste. La última migración real
   fue `Jest → Vitest` en el repo hermano, ya cerrada.
2. **La heurística del analyzer es opinable** y queremos validar
   con datos reales antes de codificarla. Hacerla ahora es
   pre-optimización.
3. **`keepLegacy: true` con overwrite es destructivo**: mover
   bytes a `legacy/` requiere que el usuario confíe en que el
   sistema no va a romper sus archivos. Esa confianza se gana con
   releases que ya estén en uso, no con un primer lanzamiento.

Cuando llegue el próximo refactor / migración real (y va a llegar),
se reabre p102, se ejecuta s1–s5 en orden y se cierra.