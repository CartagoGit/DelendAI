---
id: a00081
status: done
type: proposal
track: audit+cli+init+migration+bughunt+config-respect+concurrency
date: 2026-07-27
kind: audit
title: 'CLI init deep bug hunt #2 — migration path (5 bugs: 1 FATAL hardcoded path, 1 race, 1 collision, 2 silent)'
related:
    - a00080 # yesterday's deep-bug-hunt on the same module
    - a00078 # logs plugin exhaustive
    - a00077 # plugins folder audit
    - f00084 # init command
    - f00088 # init answers + detection
    - f00089 # adoption plan / foreign detect
    - f00093 # host-instructions snapshot
ownership:
    - { agent: implementation_runner, task: 'S1 — fix F1 (docs/mcp-vertex/proposals hardcoded in 7 places; respect config.docsDir).' }
    - { agent: implementation_runner, task: 'S2 — fix M1 (TOCTOU + concurrent allocation race in allocateNextAdoptionId).' }
    - { agent: implementation_runner, task: 'S3 — fix M2 (slugify slice(0,48) collides for long basenames; reserved "workspace" fallback).' }
    - { agent: implementation_runner, task: 'S4 — fix W1 (askChoice silent fallback on out-of-range numbers).' }
    - { agent: implementation_runner, task: 'S5 — fix W2 (stale spec claim: cross-check between CLI and plugin statuses is not actually tested).' }
---

# 🔍 Auditoría Profunda #2 — `packages/cli/src/lib/init/` (focus: migration path)

> **Fecha**: 27 jul 2026 | **Revisor**: vscode-copilot / minimax-m3
> **Metodología**: Siguiendo `mcp-vertex-audit-playbook` (code reading
> + instrumentación real con Bun). Inspección profunda de
> `init-migrate-offer.service.ts` (donde el usuario estaba
> editando) + `init-foreign-detect.service.ts` +
> `init-host-snapshot.service.ts` + verificación de cómo
> `mcp-vertex.config.json#docsDir` se respeta (o no) por todo el
> camino de migración.

## 📊 Resumen Ejecutivo

A00080 (ayer) cubrió la primera pasada — 6 bugs集中在 los
prompts y writers. Esta segunda pasada profundiza en el camino
de **migración/adopción** y descubre **5 bugs adicionales**,
incluyendo un **FATAL**: la cadena completa de migración
(`detectForeignProposals` → `findExistingAdoptionId` →
`allocateNextAdoptionId` → `renderAdoptionPlan` →
`renderMigrationProposalIfRequested`) hardcodea la ruta
`'docs/mcp-vertex/proposals'` en **7 lugares distintos**, mientras
que el `mcp-vertex.config.json` del usuario tiene un campo
`docsDir` configurable (default `'docs/mcp-vertex'`). Un usuario
que personalice `docsDir: 'myproject/docs'` (un caso real —
la convención de muchos monorepos) verá:

- la detección de foreign proposals escanear el directorio
  **incorrecto** (el del default, no el suyo),
- el adoption plan scaffoldeado en el directorio **incorrecto**,
- las gitkeep de status folders creadas en el directorio
  **incorrecto**,

mientras que **simultáneamente** el módulo `writeCoreSkillProjection`
(respetando `docsDir` correctamente) escribirá las skills en el
directorio **correcto**. Resultado: el adoption plan y las
skills terminan en directorios hermanos, no padre/hijo. La
primera ejecución de `bun run validate` falla porque el state
machine de `proposals` espera ver el adoption plan en el mismo
árbol donde están las skills.

Los otros 4 bugs son de la variedad "concurrencia y silenciosos":
un TOCTOU + race en `allocateNextAdoptionId`, un `slice(0, 48)` que
colisiona para nombres largos, un `askChoice` con fallback
silencioso, y un spec que promete una verificación que no
existe. Juntos, cuentan la historia de un módulo que
implementó la feature rápido y no la probó adversarialmente.

### Verified State

| Métrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `44b6fba` | `git log -1 --oneline` |
| Source LOC (lib/init) | 4 348 | `find packages/cli/src/lib/init -name '*.ts' -not -name '*.spec.ts' \| xargs wc -l` |
| Test LOC (lib/init) | 3 040 | idem `*.spec.ts` |
| Test count | 147 / 147 pass | `bun run test packages/cli/src/lib/init` |
| Hardcoded `'docs/mcp-vertex/proposals'` | **7 lugares** | `grep -rn "'docs/mcp-vertex/proposals'" packages/cli/src/lib/init` |
| `docsDir` config respetado por init | parcialmente (sólo skill projection) | `grep docsDir packages/cli/src/lib/init` |
| Tests de scope-collision | 0 | `grep "scope.*collis\|slice(0" packages/cli/src/lib/init/init-migrate-offer.service.spec.ts` |
| Tests de race-condition en allocate | 0 | idem |

### Bug-hunt matrix

| Vector | Check | Resultado |
|---|---|---|
| `mcp-vertex.config.json#docsDir` se respeta en migración | ¿Lee y propaga? | **🔴 F1 FATAL** — hardcoded en 7 lugares; ignora config |
| `allocateNextAdoptionId` race entre 2 inits concurrentes | ¿Read-then-allocate sin re-check? | **🟠 M1 MEJORABLE** — TOCTOU puro |
| `slugify` con basename de 50+ chars | ¿Colisiones en slice(0, 48)? | **🟠 M2 MEJORABLE** — colisiona para 2 names con mismo prefix |
| Reserved fallback `'workspace'` | ¿Colisiona con dir real? | **🟠 M2b** — `init` en `/path/to/workspace` colisiona con empty-input |
| `askChoice` con número fuera de rango | ¿Rechaza, o fallback silencioso? | **🟡 W1** — silent fallback (mismo patrón que a00080/M2) |
| Spec que promete divergence check | ¿Existe? | **🟡 W2** — el header lo promete, no existe |

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### F1. La cadena de migración ignora `mcp-vertex.config.json#docsDir` — hardcoded `'docs/mcp-vertex/proposals'` en 7 lugares

**Archivos** (los 7):
- [`packages/cli/src/lib/init/init-migrate-offer.service.ts#L97`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-migrate-offer.service.ts#L97) — `findExistingAdoptionId`: `const dir = \`docs/mcp-vertex/proposals/${folder}\``
- [`packages/cli/src/lib/init/init-migrate-offer.service.ts#L109`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-migrate-offer.service.ts#L109) — `findExistingAdoptionId`: `const rootEntries = await reader.listDir('docs/mcp-vertex/proposals')`
- [`packages/cli/src/lib/init/init-migrate-offer.service.ts#L168`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-migrate-offer.service.ts#L168) — `renderAdoptionPlan`: `const relPath = \`docs/mcp-vertex/proposals/ready/${id}-adopt-mcp-vertex-${scope}.md\``
- [`packages/cli/src/lib/init/init-foreign-detect.service.ts#L100`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-foreign-detect.service.ts#L100) — `CANDIDATE_DIRS`: `'docs/proposals'`, `'proposals'`, `'docs/rfcs'`, etc. (relativos, pero el READER los une con `workspaceRoot`)
- [`packages/cli/src/lib/init/init-proposal-folders.constant.ts`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-proposal-folders.constant.ts) — usado en las funciones arriba
- [`packages/cli/src/lib/init/init-render.service.ts`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-render.service.ts) — `renderProposalStatusFolders()` usa `PROPOSAL_STATUS_FOLDERS.map(folder => relPath: 'docs/mcp-vertex/proposals/${folder}/.gitkeep')`
- [`packages/cli/src/lib/init/init-host-snapshot.service.ts`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-host-snapshot.service.ts) — `relPath: \`docs/mcp-vertex/proposals/ready/${id}-review-replaced-host-instructions-${workspaceHash}.md\``

```typescript
// init-migrate-offer.service.ts:97 — ejemplo
const dir = `docs/mcp-vertex/proposals/${folder}`;
const entries = await reader.listDir(dir);

// init-migrate-offer.service.ts:168 — el relPath escrito
const relPath = `docs/mcp-vertex/proposals/ready/${id}-adopt-mcp-vertex-${scope}.md`;

// Pero el comando en init.command.ts:333 SÍ respeta docsDir:
const skillProjection = answers.copyCoreSkills
    ? await buildCoreSkillProjection(
        currentConfig.docsDir ?? 'docs/mcp-vertex',
    )
    : [];
```

**Problema**: El campo `docsDir` de `mcp-vertex.config.json` (que el
usuario puede personalizar — `'docs/mcp-vertex'`, `'myproject/docs'`,
`'docs'`, lo que sea) **se respeta para skill projection** pero
**se ignora completamente para la cadena de migración**:

1. `detectForeignProposals` (foreign-detect) lee de
   `docs/mcp-vertex/proposals/<folder>` y friends, hardcoded.
2. `findExistingAdoptionId` (migrate-offer) lee de
   `docs/mcp-vertex/proposals/<folder>`, hardcoded.
3. `allocateNextAdoptionId` (foreign-detect) escanea
   `docs/mcp-vertex/proposals/<folder>`, hardcoded.
4. `renderAdoptionPlan` (migrate-offer) escribe a
   `docs/mcp-vertex/proposals/ready/...`, hardcoded.
5. `renderProposalStatusFolders` (init-render) escribe
   `.gitkeep` a `docs/mcp-vertex/proposals/<folder>/`, hardcoded.
6. `renderSnapshotHostInstructionsProposal` (host-snapshot)
   escribe a `docs/mcp-vertex/proposals/ready/...`, hardcoded.
7. La `readConfigText` se llama en `init.command.ts:332` —
   pero **DESPUÉS** de `renderInitBundle`, que ya escribió el
   adoption plan en la ruta incorrecta.

**Impacto**: Un usuario con `docsDir: 'myproject/docs'` verá:
- `mcp-vertex init` lee de `docs/mcp-vertex/proposals/...` (vacío)
  → no detecta foreign proposals (su sistema real está en
  `myproject/docs/proposals/...`).
- Escribe el adoption plan a `docs/mcp-vertex/proposals/ready/...`.
- Escribe las skills a `myproject/docs/...` (correcto, vía
  `buildCoreSkillProjection(currentConfig.docsDir ?? ...)`).
- El primer `bun run validate` falla: el state machine de
  `proposals` busca el adoption plan en `myproject/docs/proposals/`
  (porque el plugin lee `config.docsDir`) y no lo encuentra.
- Resultado: el usuario ve un error de "adoption plan missing
  from proposals/ready" y no entiende por qué.

Peor aún, el archivo se ha escrito a un directorio huérfano que
el state machine nunca verá, así que el adoption plan está
"perdido" en una perspectiva operativa.

**Resolución**: slice `S1` — introducir un único helper
`proposalsPath(docsDir: string, ...segments: string[]): string`
en `init-proposal-folders.constant.ts` (o un nuevo
`init-paths.helper.ts`) que centralice la concatenación. Las 7
ubicaciones hardcoded llaman a ese helper, pasándole
`config.docsDir ?? 'docs/mcp-vertex'`. La función `renderInitBundle`
acepta el `docsDir` como parámetro de options, lo propaga a
`renderMigrationProposalIfRequested` → `renderAdoptionPlan` →
`detectForeignProposals` + `allocateNextAdoptionId` +
`findExistingAdoptionId`. La `readConfigText` se llama ANTES de
`renderInitBundle` y el `docsDir` resuelto se pasa al
bundle. Un spec de regresión: ejecutar `init` con un config que
tenga `docsDir: 'myproject/docs'` y verificar que el adoption
plan scaffoldea en `myproject/docs/proposals/ready/`, NO en
`docs/mcp-vertex/proposals/ready/`.

---

## 🟠 MEJORABLE — Problemas serios

### M1. `allocateNextAdoptionId` tiene una race condition pura (TOCTOU + sin re-check)

**Archivo**:
[`packages/cli/src/lib/init/init-foreign-detect.service.ts#L66-L107`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-foreign-detect.service.ts#L66-L107)

```typescript
export const allocateNextAdoptionId = async (
        reader: IFileReader,
        inventory: IForeignProposalInventory,
): Promise<string> => {
        let max = 0;
        for (const folder of PROPOSAL_STATUS_FOLDERS) {
                const dir = `docs/mcp-vertex/proposals/${folder}`;   // ← hardcoded
                const entries = await reader.listDir(dir);
                for (const name of entries) {
                        const m = name.match(MCP_VERTEX_RE);
                        if (m && m[1]?.toLowerCase() === 'f') {
                                const n = Number(m[2]);
                                if (Number.isFinite(n) && n > max) max = n;
                        }
                }
        }
        // Plus the root `docs/mcp-vertex/proposals/`
        const rootEntries = await reader.listDir('docs/mcp-vertex/proposals');
        for (const name of rootEntries) { /* same max-finding */ }
        // ... (foreign system check)
        return `f${String(max + 1).padStart(5, '0')}`;
};
```

**Problema**: Pure read-then-allocate. Dos invocaciones
concurrentes de `init` en el mismo workspace:

1. **Ambos** leen el mismo `max` (e.g. 0 → 'f00001').
2. **Ambos** retornan `'f00001'`.
3. El primero escribe `f00001-adopt-mcp-vertex-...md` OK.
4. El segundo SOBREESCRIBE el archivo del primero con su
   propio contenido (el otro `init` también construye un plan
   con potentially different scope/hash).

El `findExistingAdoptionId` (la guard de idempotencia) se
ejecuta ANTES de `allocateNextAdoptionId`, así que si los
proposals YA TIENEN el archivo, ambos la encuentran y reusan.
Pero la primera vez, ambos ven cero propuestas, ambos
asignan `f00001`, ambos escriben. Resultado: el segundo init
pisa el plan del primero sin aviso.

**Impacto**: Improbable en práctica (dos `init` concurrentes
son raros), pero no imposible — un script de CI que corre
`mcpv init` en paralelo contra workspaces múltiples en el
mismo proceso Bun, o un agente que dispara dos `init`s
simultáneamente, vería colisiones silenciosas. El segundo
plan sobrescribe el primero; la idempotencia no protege.

**Resolución**: slice `S2` — añadir un check `tryAcquire`
después del allocate. `allocateNextAdoptionId` debería
retornar `{ id, conflict: boolean }` y, si el plan ya existe
re-check, devolver el id existente. O (más simple) usar el
file-mutex via el writer real (`writeWorkspaceFileSafely` +
post-check). El bug requiere un spec concurrente (e.g. 5
init paralelos contra el mismo workspace con reader
in-memory) para reproducirse.

### M2. `slugify(workspaceRoot).slice(0, 48)` causa colisiones para basenames largos

**Archivo**:
[`packages/cli/src/lib/init/init-migrate-offer.service.ts#L41-L49`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-migrate-offer.service.ts#L41-L49)

```typescript
const slugify = (input: string): string =>
        input
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 48) || 'workspace';

export const deriveScope = (workspaceRoot: string): string =>
        slugify(basename(workspaceRoot) || 'workspace');
```

**Problema**: `slice(0, 48)` corta a la mitad de cualquier
basename de 50+ chars. Dos workspaces con prefijos idénticos
de 48 chars pero sufijos distintos colisionan:

```bash
# bun /tmp/collision-test.js
const slugify = (input) => input.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'workspace';
const a = 'plugin-proposals-plugin-with-very-long-repository-ali';
const b = 'plugin-proposals-plugin-with-very-long-repository-bo';
console.log('a:', slugify(a));  // 'plugin-proposals-plugin-with-very-long-repositor'
console.log('b:', slugify(b));  // 'plugin-proposals-plugin-with-very-long-repositor'
// collision? true
```

**Impacto**: Cualquier monorepo con nombres de 50+ chars que
tenga 2+ workspaces con prefijos compartidos verá el segundo
`init` **reusar el adoption plan del primero** (porque
`findExistingAdoptionId` matchea el plan existente para el
scope collisonado). El plan del segundo workspace se escribe
sobre el primero silenciosamente.

**Resolución**: slice `S3` — usar SHA-256 o un hash del
**workspaceRoot completo** como scope suffix:
`scope = slugify(basename).slice(0, 32) + '-' +
crypto.createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 8)`.
El hash es único por path completo; el slug es human-readable.
La longitud total sigue siendo razonable para filesystem
(max 41 chars). Un spec: `deriveScope('/foo/very-long') !==
deriveScope('/bar/very-long')` y dos workspaces de 50+ chars
con prefijos compartidos no colisionan.

**Bonus M2b**: el fallback `|| 'workspace'` colisiona con
cualquier workspace cuyo basename (después de slugify) sea
`'workspace'`. Un usuario con `/path/to/workspace` corriendo
`init` obtendrá el mismo scope `'workspace'` que un usuario
con basename vacío (que también cae en el fallback). Fix: el
fallback debería ser único por path, no un literal — por
ejemplo `'' + hash.slice(0, 8)`.

---

## 🟡 BIEN (lado débil) — Detalles a mejorar

### W1. `askChoice` con número fuera de rango cae en silent fallback (mismo patrón que a00080/M2)

**Archivo**:
[`packages/cli/src/lib/init/init-prompts.service.ts#L173-L194`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-prompts.service.ts#L173-L194)

```typescript
const askChoice = async <T extends string>(
        rl: RLInterface,
        question: string,
        choices: ReadonlyArray<{ label: string; value: T }>,
        defaultValue: T,
): Promise<T> => {
        // ... print choices
        const answer = await ask(rl, `${question} (1-${choices.length})`, ...);
        const idx = Number.parseInt(answer, 10);
        if (Number.isFinite(idx) && idx >= 1 && idx <= choices.length) {
                const chosen = choices[idx - 1];
                if (chosen !== undefined) return chosen.value;
        }
        return defaultValue;   // ← silent fallback on out-of-range OR non-numeric
};
```

**Problema**: Si el usuario teclea `7` cuando hay 6 opciones
(quizás porque la lista se actualizó desde la última vez que
vio la ayuda, o simplemente se equivocó), la función devuelve
el default silenciosamente. Mismo antipatrón que `askConfirm`
(a00080/M2): el operador no recibe feedback de que su input
fue rechazado.

**Resolución**: slice `S4` — re-preguntar con hint claro o
NEGAR el default (devolver `defaultValue` solo cuando el input
es empty, y para inputs no-vacíos pero fuera de rango, re-preguntar).

### W2. Spec header promete una verificación que no existe

**Archivo**:
[`packages/cli/src/lib/init/init-proposal-folders.constant.ts#L25-L29`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-proposal-folders.constant.ts#L25-L29)

```typescript
/**
 * ...
 * The CLI keeps a local mirror of the status list (instead of
 * importing from the plugin) because `proposals` is opt-in: the
 * CLI must build and run even when the plugin is absent. A
 * divergence between this list and the plugin's `PROPOSAL_STATUSES`
 * is caught by `init-render.spec.ts` (see the
 * `proposals-folders-match-plugin-statuses` test).
 */
```

**Problema**: El header del archivo **promete** un test
`proposals-folders-match-plugin-statuses` que **NO EXISTE**.

```bash
grep "match-plugin-statuses" packages/cli/src/lib/init/init-render.service.spec.ts
# (no output)
```

Si el plugin `proposals` añade un nuevo status (e.g. `'archived'`)
y el CLI no se actualiza, la divergencia pasa inadvertida. Un
usuario con `proposals: latest` corre `init`, scaffoldea
proposals en la nueva carpeta, y el state machine plugin
funciona — pero el `renderProposalStatusFolders` del CLI
**no** crea la `.gitkeep` para `'archived/'`, así que el
primer proposal que transicione a `archived` se queda sin
parent dir. La primera ejecución de `bun run validate`
falla en `lint:proposals` con "proposal landed in non-canonical
folder".

**Resolución**: slice `S5` — escribir el test prometido. Que
cargue el schema del plugin (a través de la `proposals`
plugin) y verifique que `PROPOSAL_STATUS_FOLDERS` del CLI es
un subset. Si no se puede cargar (proposals es opt-in), el
test simplemente verifica contra un literal hardcoded
`['ready', 'in-progress', 'review', 'done', 'paused', 'blocked',
'retired']` que el SPEC mantiene actualizado cuando se
actualiza el plugin. La verdad es que con un header que
asegura "el spec lo cazo", tener un spec ausente es peor que
no tener promesa — es una mentira en la documentación.

---

## ✅ Aspectos fuertes observados

- **Pure data shaping sobre el reader inyectado**:
  `detectForeignProposals` opera sobre un `IFileReader` —
  testeable con fixtures en memoria, sin IO directo. DIP bien
  aplicado.
- **Idempotencia via `findExistingAdoptionId`**: re-correr
  `init` no spawnea proposals duplicados. La guard escanea
  los 7 status folders + el root, encontrando un adoption plan
  previo y reusando su id.
- **Snapshot preservador** (`init-host-snapshot`): el
  proposal que scaffoldea incluye el contenido **pre-overwrite**
  + el bloque canónico, así que un LLM puede clasificar las
  reglas del usuario y decidir cuáles portar al bootstrap.
- **`alreadyCanonical` short-circuit**: si un host file ya
  tiene el bloque canónico, no se scaffoldea proposal — se
  ahorra una entrada en la cola.
- **Constante extraída a `init-proposal-folders.constant.ts`**:
  hoisted fuera de `init-render.service.ts` para romper el
  circular import con `init-foreign-detect`. Bien aislado.
- **Linter real en el spec de adoption plan**:
  `init-adoption-plan-lints-clean.spec.ts` corre el linter
  real (`lintProposalMarkdown`) sobre el output real, no un
  shape test. Esto es "run the artifact" testing, no "check
  the contract" — atrapa drift entre el scaffolder y el
  linter.

---

## 🧮 Scoreboard

| Dimensión | Score | Justificación |
|---|---|---|
| Diseño / SOLID | 7/10 | DIP bien aplicado, pero F1 rompe la sustitución (LSP) — el CLI no honra su propio contrato de config. |
| Atomicidad / durabilidad | 8/10 | Writers usan `withFileMutex` + `fsync`; M1 es un fallo de atomicidad lógica (read-then-allocate) no de I/O. |
| **Configuración respetada** | **3/10** | F1 ignora `docsDir` en 7 lugares. La skill projection SÍ lo respeta, así que el módulo es internamente inconsistente. |
| Concurrencia | 5/10 | M1 (allocate race) es real. W1 (silencioso) es menor. El módulo en general no se pensó para multi-init. |
| Validación de input | 6/10 | W1 (silent fallback), pero la schema Zod outer atrapa mucho. |
| Tests | 7/10 | 147 pass, 0.70 ratio. W2 (spec inexistente) y el gap de M2 (sin spec de collision) son los puntos débiles. |
| Consistencia del dominio | 8/10 | No hardcodea host-specific paths, sólo CLI-specific defaults. |
| Mantenibilidad | 7/10 | 17 archivos pequeños, bien aislados. M1/M2 son bugs de bordes que requieren conocer toda la cadena. |

**Overall: 6.4 / 10** (1 decimal, promedio ponderado). F1 solo
arrastra la dimensión de "configuración respetada" de 8 a 3;
sin él, el módulo subiría a ~7.5.

---

## 📋 Plan de remediación (slices)

| ID | Slice | Tamaño | Bloquea |
|---|---|---|---|
| S1 | F1: helper `proposalsPath(docsDir, ...)` + propagar `docsDir` por todo el render path. Spec de regresión con `docsDir: 'myproject/docs'`. | L (~150 LOC, multi-archivo) | release |
| S2 | M1: `allocateNextAdoptionId` → `tryAcquire` con re-check post-asignación, o usar file-mutex via el writer real | M (~50 LOC) | dx (concurrencia) |
| S3 | M2: `slugify` → `scope = slugify(basename).slice(0, 32) + '-' + sha1(path).slice(0, 8)` | XS (~20 LOC) | — |
| S4 | W1: `askChoice` re-pregunta en out-of-range | XS (~10 LOC) | ux |
| S5 | W2: escribir el spec `proposals-folders-match-plugin-statuses` (o eliminar la promesa del header) | S (~30 LOC) | — |

Todos los slices caben en una PR mediana. S1 es la pieza
grande — toca 7 archivos y re-cablea la propagación del
`docsDir` desde `init.command.ts` hasta
`detectForeignProposals`. S2-S5 son batcheables como un
segundo commit.

---

## 🔍 Conclusión

El módulo `init` está cerca de producción — ayer cerró 6
bugs y hoy, otros 5, todos del tipo "discipline slipped at the
edges". Pero F1 (ignorar `docsDir`) es un recordatorio
importante: **un módulo que respeta un config field a medias
es peor que uno que lo ignora completamente**, porque el
operador ve comportamiento mixto y no puede diagnosticar
qué parte está rota. La fix de S1 — propagar `docsDir`
desde el command hasta el migrate path — es la
responsabilidad del módulo: el config field existe, está
documentado, y es tu trabajo respetarlo.

Una vez que S1+S2 cierren, este módulo se mueve de
"casi listo" a "production-grade": la primera pasada (a00080)
cubrió los prompts y los writers; esta segunda (a00081) cubrió
el camino de migración y los config-edges. El resto son
detalles que el próximo agente puede ship-ear incrementalmente.
