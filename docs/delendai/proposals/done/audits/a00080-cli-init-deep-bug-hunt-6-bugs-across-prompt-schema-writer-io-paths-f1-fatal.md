---
id: a00080
status: done
type: proposal
track: audit+cli+init+bughunt+input-validation+concurrency+SOLID
date: 2026-07-27
kind: audit
title: 'CLI init deep bug hunt — 6 bugs across prompt, schema, writer, IO paths (F1 FATAL)'
related:
    - a00078 # logs plugin exhaustive audit (yesterday's deep-dive, sister doc)
    - a00077 # plugins folder audit
    - a00075 # antigravity exhaustive audit
    - f00084 # init command
    - f00088 # init answers + detection
    - f00089 # adoption plan / foreign detect
    - f00093 # host-instructions snapshot
    - f00103 # init:default non-interactive
ownership:
    - { agent: implementation_runner, task: 'S1 — fix F1 (process.cwd at module load in InitAnswers schema).' }
    - { agent: implementation_runner, task: 'S2 — fix M1 (writeWorkspaceText claims append but always overwrites).' }
    - { agent: implementation_runner, task: 'S3 — fix M2 (askConfirm silent fallback on invalid input).' }
    - { agent: implementation_runner, task: 'S4 — fix M3 (return readFile without await in readHostInstructionsFile).' }
    - { agent: implementation_runner, task: 'S5 — clean dead code: duplicate docs/proposals entry, unused _bullet helper.' }
    - { agent: implementation_runner, task: 'S6 — replace existsSync+readFile TOCTOU pattern with fs.access or readFile-then-catch.' }
---

# 🔍 Auditoría Profunda — `packages/cli/src/lib/init/`

> **Fecha**: 27 jul 2026 | **Revisor**: vscode-copilot / minimax-m3
> **Metodología**: Siguiendo `mcp-vertex-audit-playbook` (code reading
> + instrumentación real con Bun). Inspección de los 17 archivos
> `.ts` de `lib/init/` + `commands/init/`, contraste con el esquema
> documentado en cada header, y verificación experimental de los
> defectos sospechosos con scripts `bun` ejecutados contra el
> schema actual.

## 📊 Resumen Ejecutivo

El módulo `init` del CLI es la única superficie de bootstrap que ve
un operador humano — `mcpv init` y `mcpv init:default` son la cara
del producto. El módulo puntúa ALTO en disciplina arquitectónica
(17 archivos `.ts`, 16 specs, 146 tests, 0 `process.cwd` *en
servicios*, contratos aislados, I/O atómica vía `withFileMutex` +
`writeFileAtomic`). Pero tiene **6 bugs concretos**, uno de ellos
FATAL: el schema `IInitAnswers` llama a `process.cwd()` como default
de un campo de Zod, evaluándolo en **module-load time** y no en
parse time — exactamente el patrón que el header del archivo
prohíbe explícitamente ("No `process.cwd()` — workspace paths come
from the CLI context"). El bundle compilado (`packages/cli/dist/
index.js:...`) preserva el bug, así que cualquier binario distribuido
lo hereda.

Los otros 5 bugs son de severidad MEDIA/BAJA pero son del tipo
"señal honesta de que el código necesita más atención": un `mode:
'append'` que sobreescribe silenciosamente, un `askConfirm` que
ignora entradas inválidas, un `return readFile(...)` sin `await`
(anti-patrón), un duplicado literal en una tabla, un helper
`_bullet` sin uso. Nada catastrófico, pero juntos cuentan la
historia de un módulo que se probó feliz y nunca se atacó
adversarialmente.

### Verified State

| Métrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `0d8ae62` | `git log -1 --oneline` |
| Source LOC (lib/init) | 4 348 | `find packages/cli/src/lib/init -name '*.ts' -not -name '*.spec.ts' \| xargs wc -l` |
| Test LOC (lib/init) | 3 040 | idem `*.spec.ts` |
| Test count | 146 / 146 pass | `bun run test packages/cli/src/lib/init` |
| Test ratio | 0.70 | saludable |
| `process.cwd()` en servicios | 1 violación (`init-answers.schema.ts:87`) | `grep -rn 'process\.cwd' packages/cli/src/lib/init` |
| `existsSync` en servicios | 2 violaciones (`init-detection.service.ts:202`, `init-host-instructions.service.ts:95`) | `grep -rn existsSync` |
| Spec coverage | 14/17 (82%) | `for f in *.ts; do test -f ${f%.ts}.spec.ts; done` |
| Archivos sin spec | `init-default-help.service`, `init-migrate-offer.service`, `init-prompts.service` | idem |
| `outputSchema` per CLI command | 2/2 | `init`, `init:default` declaran summary + usage |

### Bug-hunt matrix

| Vector | Check | Resultado |
|---|---|---|
| `process.cwd()` en schema default | Verificar que se evalúe lazily, no en module-load | **🔴 F1 FATAL** — eager evaluation confirmada con test `bun /tmp/cwd-bug2.ts` |
| `mode: 'append'` real | ¿Realmente append, o fallback a overwrite? | **🟠 M1** — overwrites always |
| `askConfirm` ante entrada inválida | ¿Rechaza, o fallback silencioso? | **🟠 M2** — silent fallback |
| `return readFile(...)` sin `await` | ¿Cuál es la inferencia del tipo? | **🟡 M3** — funciona por `async` wrap, pero confunde al lector |
| Dead code en `init-foreign-detect` | `CANDIDATE_DIRS` con duplicado | **🟡 M4** — `docs/proposals` listado dos veces |
| Dead code en `init-prompts` | `_bullet` helper sin uso | **🟡 M5** — 1 LOC de basura |
| `existsSync` + `readFile` | ¿TOCTOU? | **🟡 M6** — sí, en 2 lugares; el readFile subsiguiente se traga el error |

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### F1. `InitAnswers.workspaceRoot` default captura `process.cwd()` en module-load, no en parse time

**Archivo**:
[`packages/cli/src/lib/init/init-answers.schema.ts#L87`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-answers.schema.ts#L87)

```typescript
// El header del archivo (líneas 11-13) PROHÍBE explícitamente esto:
/**
 *   - No `process.cwd()` — workspace paths come from the CLI context.
 *   - Pure Zod — no IO, no `Bun.spawn`, no `withFileMutex`. This file is
 *     safe to import from any layer (CLI, MCP, test) without side
 *     effects.
 */

export const InitAnswers = z.object({
        // ...
        /** Workspace root resolved by the CLI context. */
        workspaceRoot: z.string().default(process.cwd()),
        // ...
});
```

```javascript
// packages/cli/dist/index.js (BUILT, line ~4320):
workspaceRoot: z23.string().default(process.cwd()),
```

**Problema**: `z.string().default(process.cwd())` evalúa `process.cwd()`
en el momento de **definir el schema** (module load), no cuando se
llama a `.parse()`. Verificación experimental:

```typescript
// Reproducción (bun /tmp/cwd-bug2.ts):
// cwd at module load: /home/cartago/_projects/mcp-vertex
// cwd now: /tmp
// Eager default (BUG): /home/cartago/_projects/mcp-vertex   ← el de antes
// Lazy default (correct): /tmp                              ← el actual
```

El header del archivo promete "safe to import from any layer
(CLI, MCP, test) without side effects" — la promesa está rota.
El bundle compilado también tiene el bug (`packages/cli/dist/
index.js` line ~4320 con `z23.string().default(process.cwd())`),
así que cualquier binario distribuido lo lleva consigo.

**Impacto**:
- **Tests**: el spec de `init-host-snapshot` carga el schema, lo
  parsea con `workspaceRoot: '/home/user/projects/example-app'`
  (explícito, así que sortea el bug), pero un test que importase
  el schema, NO le pasase `workspaceRoot`, y luego cambiase
  `process.chdir` ANTES del `.parse()`, leería el cwd viejo.
- **CLI real**: `mcpv init` siempre pasa `workspaceRoot`
  explícitamente (vía `detectAndDecorateAnswers`), así que el
  usuario no nota el bug en el flujo feliz. PERO el schema se
  re-exporta como `InitAnswers` y se usa también en
  `init-default.command.ts` (vía `detectAndDecorateAnswers`),
  donde si por alguna razón el caller olvidase pasar
  `workspaceRoot` (e.g. un test nuevo, una herramienta
  third-party que consuma el schema como librería, una llamada
  futura al schema desde un lugar que aún no se ha escrito), el
  default apuntaría a la raíz del proceso del HOST que cargó
  el módulo, no a la raíz del workspace.
- **MCP server embebido**: si algún día se carga este schema
  desde un proceso que corre en un cwd distinto del workspace
  del operador (e.g. un MCP host que spawna un sub-proceso con
  `cwd: '/'`), el default capturaría `/` y el resto del flujo
  fallaría con paths absolutos mal construidos — un bug que
  aparecería sólo en condiciones de spawn específicas y
  confundiría a cualquiera que intentase reproducirlo.

**Resolución**: slice `S1` — cambiar a
`z.string().default(() => process.cwd())` (lazy). AÚN MEJOR:
quitar el default y requerirlo siempre desde el caller, ya que
`detectAndDecorateAnswers` siempre lo pasa. El default es
defensivo y la defensa está mal implementada. Si se quiere
mantener por compatibilidad con consumidores del schema que
vengan en el futuro, `(() => process.cwd())` es la respuesta
mínima. Un test que verifique que `workspaceRoot` cambia cuando
cambia `process.cwd()` entre módulo-load y parse-time cierra
la regresión.

---

## 🟠 MEJORABLE — Problemas serios que degradan calidad

### M1. `writeWorkspaceText` miente sobre `mode: 'append'` — siempre sobreescribe

**Archivo**:
[`packages/cli/src/lib/init/init-writers.factory.ts#L274-L280`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-writers.factory.ts#L274-L280)

```typescript
/** Append-or-overwrite semantics for a generic file inside the workspace. */
export const writeWorkspaceText = async (
        workspace: string,
        relPath: string,
        content: string,
        mode: 'append' | 'overwrite' | 'skip',
): Promise<{ kind: 'written' | 'exists' | 'skipped'; path: string }> => {
        if (mode === 'skip')
                return { kind: 'skipped', path: `${workspace}/${relPath}` };
        const path = await writeWorkspaceFileSafely(workspace, relPath, content);
        return { kind: 'written', path };
};
```

**Problema**: La firma promete tres modos (`'append' | 'overwrite' |
'skip'`), pero la implementación solo distingue `'skip'` del resto.
Tanto `'append'` como `'overwrite'` llaman a
`writeWorkspaceFileSafely` que, vía `writeFileAtomic`, **siempre
sobreescribe el archivo completo** (write tmp + rename). El
docstring dice "Append-or-overwrite semantics" — la primera parte
es falsa.

El tipo de retorno `{ kind: 'written' | 'exists' | 'skipped' }` no
incluye `'appended'`, lo que delata que la intención original
probablemente era distinguir los tres modos en el resultado
también.

**Impacto**: Cualquier llamada que hoy use `mode: 'append'`
(asumiendo que concatena al archivo existente) está
silenciosamente borrando el contenido previo. No hay un caller
actual que pase `'append'` en este codebase (grep confirma que
el único caller pasa el `mode` que viene de
`answers.hostInstructions`, que se mapea a 'overwrite'/'append'
en `init-render.service.ts` — pero los `bundle.files` se
escriben por `writeWorkspaceText` con el `mode` que se recibe),
así que el riesgo es LATENTE: si mañana alguien añade un
`bundle.file` con `mode: 'append'` (e.g. para acumular
configuraciones), destruirá lo previo sin avisar.

**Resolución**: slice `S2` — o (a) eliminar `'append'` del tipo de
entrada, o (b) implementar append real (concatenar `existing +
content` antes de `writeFileAtomic`). (a) es la opción segura: si
alguien necesita append real, lo pide explícitamente con un
escritor dedicado. (b) es la opción funcional: implementar
`fs.readFile(path, 'utf8').then(existing => writeFileAtomic(path,
existing + separator + content))`. Mientras tanto, el test suite
debería negar cualquier uso de `mode: 'append'` (afirmar que
cualquiera que lo pase ve un `'written'` con TODO el contenido
anterior perdido — para que un test que asuma append correcto
falle ruidosamente).

### M2. `askConfirm` ignora silenciosamente entradas no-y/n

**Archivo**:
[`packages/cli/src/lib/init/init-prompts.service.ts#L73-L87`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-prompts.service.ts#L73-L87)

```typescript
const askConfirm = (
        rl: RLInterface,
        question: string,
        fallback: boolean,
): Promise<boolean> =>
        new Promise((resolve) => {
                rl.question(
                        `${question} (y/n) [${fallback ? 'y' : 'n'}]: `,
                        (answer) => {
                                const trimmed = answer.trim().toLowerCase();
                                if (trimmed.length === 0) return resolve(fallback);
                                if (trimmed === 'y' || trimmed === 'yes') return resolve(true);
                                if (trimmed === 'n' || trimmed === 'no') return resolve(false);
                                resolve(fallback);   // ← silent fallback
                        },
                );
});
```

**Problema**: Si el usuario teclea "claro que sí" o "por favor" o
un emoji, el sistema trata la entrada como si nunca la hubiera
hecho y devuelve el `fallback`. La distinción entre "no sé qué
teclease" y "el operador cambió de opinión" se pierde
silenciosamente. Una persona mayor que vea un prompt con `[y]`
por defecto y quiera cancelar (`n`) pero tipee con un typo
(`m` por ejemplo) va a aceptar sin saberlo.

**Impacto**: Decisiones destructivas en un prompt interactivo
sin que el operador sepa que su input fue malinterpretado.
Particularmente grave en `init:default --force`-style flows
donde el fallback es `true` (asumir sí).

**Resolución**: slice `S3` — o (a) re-preguntar con un hint
claro, o (b) si la entrada es no-reconocible, NEGAR explícitamente
`return resolve(!fallback)` (la opción conservadora — si el
default es "yes" pero no se entiende, tratar como "no"). (a) es
más amigable; (b) es más seguro. Mi recomendación: (a) para
decisiones reversibles, (b) para destructivas. Y un test que
afirme ambos caminos.

### M3. `return readFile(...)` sin `await` en función `async`

**Archivo**:
[`packages/cli/src/lib/init/init-host-instructions.service.ts#L90-L97`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-host-instructions.service.ts#L90-L97)

```typescript
export const readHostInstructionsFile = async (
        workspace: string,
        relPath: string,
): Promise<string | undefined> => {
        const path = `${workspace}/${relPath}`;
        if (!existsSync(path)) return undefined;
        return readFile(path, 'utf8');   // ← sin await
};
```

**Problema**: En una función `async`, `return readFile(path, 'utf8')`
sin `await` retorna `Promise<Promise<string>>` — TypeScript lo
acepta y el `async` outer lo "aplaNa" a `Promise<string>`, así
que el resultado funcional es correcto. PERO:

1. **Anti-patrón obvio**: cualquier linter (incluido
   Biome con la regla `no-floating-promises`) debería
   quejarse. Si esa regla no se aplica, es porque está
   deshabilitada o porque el código esquiva el linter.
2. **Engaña al lector**: alguien leyendo la función puede creer
   que retorna inmediatamente tras el `existsSync`, no que
   está iniciando una lectura async.
3. **Inconsistencia con `readHostInstructionsFile` mismo**: en
   el mismo archivo, todas las demás funciones async usan
   `await` consistentemente. Es un outlier, probablemente un
   copy-paste mal editado.

**Impacto**: Ninguno observable hoy (el `async` outer lo absorbe).
Pero es un campo minado para refactorings futuros: si alguien
añade lógica entre el `existsSync` y el `return`, o cambia la
firma a `string | undefined` (no-Promise), el bug se activaría
silenciosamente y el test suite no lo cazaría porque no hay
spec para `readHostInstructionsFile`.

**Resolución**: slice `S4` — añadir `await` (`return await
readFile(...)`). AÑADIR un spec que cubra el caso "archivo no
existe" (devuelve `undefined`) y "archivo existe con
contenido" (devuelve el contenido). El bug es invisible hasta
que alguien refactorice y se active; el spec es la red de
seguridad.

---

## 🟡 BIEN (lado débil) — Detalles a mejorar

### W1. `existsSync` + `readFile` es un TOCTOU pattern

**Archivos**:
- [`init-detection.service.ts#L200-L210`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-detection.service.ts#L200-L210) (loadExistingConfig)
- [`init-host-instructions.service.ts#L90-L97`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-host-instructions.service.ts#L90-L97) (readHostInstructionsFile)

```typescript
// Patrón repetido:
if (!existsSync(path)) return undefined;
try {
        const raw = await readFile(path, 'utf8');
        // ...
} catch {
        return undefined;
}
```

**Problema**: TOCTOU (time-of-check / time-of-use) clásico. Entre
el `existsSync` y el `readFile`, el archivo puede ser borrado por
otro proceso y el `try/catch` se activará — eso es CORRECTO para
el caso "race natural", pero el `existsSync` inicial es I/O
síncrono en un hot path y de todas formas el `readFile` ya
tiene su propio `try/catch` que lo captura. El `existsSync`
precheck es código muerto disfrazado de "early return".

**Impacto**: En el flujo real, la race no se ha observado. Pero
el `existsSync` contradice la regla de AGENTS.md #3 ("no `*Sync`
in hot paths"). El `try/catch` ya cubre todos los casos. La
mejora es `delete existsSync, return (await readFile(path,
'utf8').catch(() => undefined))` — 1 línea, misma semántica, sin
sync I/O.

**Resolución**: slice `S6` — sustituir ambos `existsSync` +
`readFile` por `readFile().catch(() => undefined)`. Mismo
comportamiento, 50% menos código, sin I/O síncrono.

### W2. `CANDIDATE_DIRS` en `init-foreign-detect` tiene duplicado literal

**Archivo**:
[`packages/cli/src/lib/init/init-foreign-detect.service.ts#L93-L107`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-foreign-detect.service.ts#L93-L107)

```typescript
const CANDIDATE_DIRS: readonly {
        readonly location: string;
        readonly kind: IForeignConventionKind;
}[] = [
        { location: 'docs/proposals', kind: 'proposals' },

        { location: 'docs/proposals', kind: 'proposals' },   // ← duplicate
        { location: 'proposals', kind: 'proposals' },
        { location: 'docs/rfcs', kind: 'rfcs' },
        // ...
```

**Problema**: La segunda entrada es un duplicado literal de la
primera (separada sólo por una línea en blanco). El comentario
anterior dice "Order matters: the first non-empty match becomes
the `primary` convention", así que el duplicado es un
no-op funcional, pero la duplicación oculta el hecho de que el
autor original probablemente añadió la segunda pensando en una
convención distinta y luego se olvidó de quitarla.

**Resolución**: slice `S5a` — borrar la línea duplicada. Si
realmente se necesitaba una segunda entrada con kind distinto,
el kind debe cambiar; si no, fuera.

### W3. `_bullet` helper sin uso en `init-prompts.service.ts`

**Archivo**:
[`packages/cli/src/lib/init/init-prompts.service.ts#L35`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/lib/init/init-prompts.service.ts#L35)

```typescript
const _bullet = (text: string): string => `${c.gray('›')} ${text}`;
```

**Problema**: Helper definido, nunca invocado (el `_` prefix es
una convención TypeScript para "unused intentionally", pero aquí
no se invoca en ninguna parte del archivo). Muerte por
re-factoring incompleto.

**Resolución**: slice `S5b` — borrar la línea.

---

## ✅ Aspectos fuertes observados (citados para el siguiente revisor)

- **Atomicidad**: `writeWorkspaceFileSafely` envuelve
  `withFileMutex` + `writeFileAtomic` (que es
  `open(tmp) → writeFile → fsync → close → rename → fsyncDir`).
  Las operaciones de I/O en disco son correctas.
- **Redacción**: el redactado pasa por `redactSecrets` antes de
  cualquier `writeFile` — las API keys, tokens y passwords no
  llegan al disco aunque un caller se olvide de redactar.
- **Schemas como fronteras**: `InitAnswers` valida cada
  respuesta del operador antes de cualquier escritura. Los
  errores de parseo tienen mensajes accionables ("Unknown
  plugin \"<id>\". Valid ids: …").
- **Readline cerrado en finally**: `collectInitAnswers` cierra
  el `rl` interface siempre, incluso en paths de error (incluido
  Ctrl+C). Sin fd leaks.
- **Detección de foreign proposals sin IO directo**: el
  detector opera sobre un `IFileReader` inyectado, así que es
  puro y testable con fixtures en memoria.
- **Migration snapshot defensivo** (`init-host-snapshot`):
  captura el contenido previo de los host-instruction files
  ANTES de sobrescribirlos, en un proposal en `ready/`, así que
  un `init:default` con `hostInstructions: 'overwrite'` es
  reversible.
- **Razonable cobertura de tests**: 146 tests, 16 specs, 0.70
  ratio. La suite actual atrapa los happy paths; este audit
  muestra qué falta en los unhappy paths.

---

## 🧮 Scoreboard

| Dimensión | Score | Justificación |
|---|---|---|
| Diseño / SOLID | 7/10 | Interfaces bien aisladas; `writeMcpJson` con 3-way outcome es elegante. M1 (mode mentiroso) y M3 (return sin await) arrastran. |
| Atomicidad / durabilidad | 9/10 | `withFileMutex` + `fsync` + `writeFileAtomic`. Nada de sync I/O en hot paths reales. |
| Validación de input | 4/10 | **F1 (process.cwd eager)** es el golpe principal; **M2 (askConfirm silent)** es el segundo. |
| Concurrencia | 6/10 | W1 (TOCTOU en 2 lugares) — menor, pero el patrón indica que la disciplina mutex+atomic no se extendió a "validar antes de leer". |
| Tests | 7/10 | 146 tests, 0.70 ratio, 3 archivos sin spec. **W2 (no spec para readHostInstructionsFile) significa que M3 pasa inadvertido**. |
| Consistencia del dominio | 8/10 | Ningún path hardcoded al host. El bug `process.cwd` es por omisión, no por host-coupling. |
| UX / operator-facing | 6/10 | M2 (askConfirm silent) degrada la confianza del operador. El resto del prompt flow es decente (numbered choices, hints). |
| Performance | 8/10 | `existsSync` son ~µs cada uno. `readFile` es O(bytes). El bundle sigue siendo pequeño. |
| Mantenibilidad | 7/10 | 17 archivos pequeños y enfocados; el problema es que la disciplina (header policies) se relajó en algunos bordes (F1, W2, W3). |

**Overall: 6.7 / 10** (1 decimal, promedio ponderado). Sin F1, el módulo
puntuaría ~7.5; con F1, baja a 6.7. La validación de input es el
campo más débil y refleja un patrón: los bordes (schema defaults,
prompt fallbacks, IO pre-checks) son donde el rigor se relajó.

---

## 📋 Plan de remediación (slices)

| ID | Slice | Tamaño | Bloquea |
|---|---|---|---|
| S1 | F1: `InitAnswers.workspaceRoot` → `z.string().default(() => process.cwd())` (o quitar el default y requerirlo) | XS (≤5 LOC) | release |
| S2 | M1: `writeWorkspaceText` — o eliminar `'append'` del tipo, o implementarlo. (a) es la opción segura. | S (≤30 LOC + test) | dx |
| S3 | M2: `askConfirm` — re-preguntar con hint, o fallback al opuesto si default es true | S (≤30 LOC + test) | ux |
| S4 | M3: añadir `await` a `readHostInstructionsFile` + spec que cubra el caso "no existe" / "existe" | XS (≤20 LOC) | — |
| S5a | W2: borrar la entrada duplicada en `CANDIDATE_DIRS` | XS (1 LOC) | — |
| S5b | W3: borrar `_bullet` de `init-prompts.service.ts` | XS (1 LOC) | — |
| S6 | W1: sustituir `existsSync + readFile` por `readFile().catch(() => undefined)` en 2 lugares | XS (≤10 LOC) | — |

Todos los slices caben en una sola PR. El cierre de S1 + tests
debería ir primero (es el único FATAL); S2–S6 son batchables en
un commit aparte.

---

## 🔍 Conclusión

El módulo `init` es globalmente competente pero tiene un agujero
FATAL en su contrato de schema (`process.cwd()` evaluado eagerly
en un default de Zod) y cinco detalles medianos que delatan que
los bordes del módulo no se probaron adversarialmente. La buena
noticia: el resto del módulo es un buen ejemplo de disciplina
(TypeScript estricto, contratos aislados, I/O atómica,
readline cleanup correcto, redacción sistemática) — los bugs son
todos de la variedad "se rompió una invariante local", no "el
diseño entero está podrido". Una PR con los 6 slices cierra todo
en menos de 200 LOC y deja el módulo en estado "production-grade".

Si tuviera que elegir UN bug para arreglar primero, sería F1:
es el único que se propaga al binario distribuido, contradice el
header del propio archivo, y la corrección es de una línea
(`() =>`).
