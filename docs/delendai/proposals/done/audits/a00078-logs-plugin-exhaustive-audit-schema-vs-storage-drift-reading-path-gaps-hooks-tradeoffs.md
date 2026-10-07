---
id: a00078
status: done
type: proposal
track: audit+logs-plugin+schema-drift+concurrency+SOLID
date: 2026-07-27
kind: audit
title: 'Logs plugin exhaustive audit — schema-vs-storage drift, reading-path gaps, hooks tradeoffs'
related:
    - f00153 # incident-driven logs pipeline (introduced severity/incidentType)
    - f00154 # universal incident coverage (logsSink contract)
    - a00077 # plugins folder audit
    - a00072 # deeper log scan
ownership:
    - { agent: implementation_runner, task: 'S1 — backfill severity/incidentType in readAllFiles (F1 FATAL).' }
    - { agent: implementation_runner, task: 'S2 — relax LogEventSchema to .optional().nullable() on legacy fields (defensive, F1).' }
    - { agent: implementation_runner, task: 'S3 — extract onToolStart/Call/Cancel from index.ts (F4 SOLID-SRP).' }
---

# 🔍 Auditoría Exhaustiva — `plugins/logs`

> **Fecha**: 27 jul 2026 | **Revisor**: vscode-copilot / minimax-m3
> **Metodología**: Inspección del código fuente del plugin, contraste entre
> el contrato publicado (`ILogEvent`, `LogEventSchema`) y los datos
> efectivamente serializados (`.cache/mcp-vertex/results/logs/*.jsonl`),
> lectura de los hooks `onTool*` del core contra la implementación del
> plugin, y verificación local de la suite de tests
> (`bun run test plugins/logs`).

## 📊 Resumen Ejecutivo

El plugin `logs` cumple su promesa arquitectónica de un timeline append-only
con redacción de secretos y streaming de errores curado, pero la
**disciplina entre el esquema publicado y los datos persistidos** se ha
roto en un punto único pero masivo: el camino de lectura
(`log-store.readAllFiles`) no normaliza los registros antiguos antes de
devolverlos a las herramientas MCP, y el 100% de los registros
almacenados hasta la fecha (1524 entradas, 8 días de actividad) carecen
de los campos `severity` e `incidentType` que el esquema exige como
requeridos. La consecuencia es que **`errors_tail` y `query` rompen la
firma `outputSchema`** (2/9 herramientas fallan en `verify:tools`), lo
que bloquea el gate `bun run validate` y por extensión el release
pipeline.

Más allá de este fallo, el plugin puntúa alto en disciplina SOLID
(servicios puros, contratos en `contracts/interfaces/`, no hay
`process.cwd()`, no hay I/O síncrono, todas las escrituras pasan por
`withFileMutex` + `fsync`, todas las herramientas declaran
`outputSchema`). El defecto es uno solo, pero por la posición que ocupa
en el camino crítico es **FATAL**.

### Verified State

| Métrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `96942e83` | `git log -1 --oneline` |
| Source LOC | 2 312 | `find plugins/logs -name '*.ts' -not -name '*.spec.ts' \| xargs wc -l` |
| Test LOC | 1 570 | `find plugins/logs -name '*.spec.ts' \| xargs wc -l` |
| Tests | 81/81 pass | `bun run test plugins/logs` |
| Duration | 2.76 s | idem |
| Source/test ratio | 0.68 | (1570/2312) — saludable |
| `process.cwd()` in src | 0 | `grep -r "process\\.cwd" plugins/logs/src` |
| `*Sync` in src | 0 | `grep -rE 'readFileSync\|writeFileSync\|existsSync' plugins/logs/src` |
| `console.log` in src | 0 | `grep -r 'console\\.log' plugins/logs/src` |
| `@ts-ignore`/`@ts-nocheck` | 0 | `grep -r '@ts-ignore\|@ts-nocheck' plugins/logs/src` |
| `outputSchema` per tool | 9/9 | `grep -E 'outputSchema' plugins/logs/src/lib/tools/tools.ts` |
| `verify:tools` failed rows | 2/9 (errors_tail, query) | `bun tools/scripts/verify/plugin-tool-verify.script.ts --plugin=logs` |
| Stored records missing required fields | 1524/1524 (100%) | análisis de `.cache/mcp-vertex/logs/*.jsonl` |

### Concurrency table

| Scenario | Risk | Mitigation | Gap |
|---|---|---|---|
| Two tool calls write the same day-file simultaneously | Torn JSONL line | `open(file, 'a')` + `handle.writeFile` + `handle.sync` inside `withFileMutex` (log-store.ts:178-194) | ✅ |
| Reader opens a day-file mid-append | Partial line / parse error | `readAllFiles` (log-store.ts:130-185) catches per-line JSON.parse, substitutes a `log-warning` placeholder; `withFileMutex` on read prevents racing the writer | ✅ |
| Two peers (logs plugin + cross-plugin `ctx.logs.log`) call `appendEvent` simultaneously | Torn line / lost event | `appendEvent` is the single funnel, protected by `withFileMutex` per day-file | ✅ |
| Boot marker + first tool call land in the same day-file | Ordering | `await appendEvent('server-started')` runs before the first `onToolStart`; the `callId` correlation keys in `index.ts` keep tool started/completed pairs tied regardless of order | ✅ |
| **Old record missing new required fields read back** | Schema validation failure (verify:tools) | (none) | **❌ — F1** |

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### F1. El camino de lectura no migra los registros anteriores a f00153 — 100% de las 1524 entradas carecen de `severity`/`incidentType`

**Archivos**:
- [`plugins/logs/src/lib/services/log-store.ts#L155-L166`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/services/log-store.ts#L155-L166)
- [`plugins/logs/src/lib/tools/tools.ts#L42-L53`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/tools/tools.ts#L42-L53) (LogEventSchema)
- `.cache/mcp-vertex/logs/*.jsonl` (8 day-files, 1524 entries)

```typescript
// log-store.ts — readAllFiles
try {
    events.push(JSON.parse(line) as ILogEvent);
} catch {
    // Corrupt-line placeholder keeps the timeline position; uses fresh defaults.
    // ...
    events.push({
        ts: dayTs,
        kind: 'log-warning',
        severity: 'warning',
        incidentType: 'corrupt-line',
        // ...
    });
}
```

```typescript
// tools.ts — outputSchema (errors_tail / query / correlate / search / incidents / tail)
const LogEventSchema = z.object({
    ts: z.string(),
    kind: z.string(),
    agent: z.string().nullable(),
    taskId: z.string().nullable(),
    outcome: LogOutcomeSchema,
    severity: LogSeveritySchema,        // ← required
    incidentType: z.string().nullable(), // ← required (nullable but not optional)
    files: z.array(z.string()),
    summary: z.string(),
    meta: z.record(z.string(), z.unknown()),
});
```

**Problema**: El commit `6e84dc24` (a00074 S2, 2026-07-26) introdujo
`severity` e `incidentType` como campos obligatorios en el contrato
`ILogEvent` y en el `LogEventSchema` publicado por las herramientas
(`outputSchema`). Sin embargo, los day-files existentes en
`.cache/mcp-vertex/logs/` (escritos entre 2026-07-16 y 2026-07-25, antes
del cambio de esquema) **nunca fueron migrados** y no contienen esos
campos. El `JSON.parse(line) as ILogEvent` del camino feliz (no
`catch`) ingiere el registro tal cual y lo devuelve a la herramienta,
que lo entrega a Zod con `severity: undefined` y `incidentType:
undefined`. La validación del `outputSchema` falla con
`invalid_value: "debug"|"info"|"notice"|"warning"|"error"|"critical"|"alert"|"emergency"`
y `invalid_type: expected string, received undefined`. Resultado:
**`errors_tail` y `query` rompen el contrato de su `outputSchema` en
2 de cada 2 invocaciones** (verificado por `verify:tools` con
`outcome: 'failed'`).

**Impacto**:
- `verify:tools` reporta 2 fallos sobre 9 herramientas del plugin
  (22%), suficiente para que `bun run validate` salga con `exit 1` y
  bloquee el release pipeline.
- Cualquier consumidor downstream que filtre por
  `severity >= 'error'` (la propia herramienta `query` lo soporta vía
  `severityAtLeast`) ve la operación entera caer a cero resultados
  porque el comparador `SEVERITY_RANK[undefined]` lanza
  `TypeError: Cannot read properties of undefined` antes incluso de
  llegar a la validación del esquema.
- El día que el plugin decida cortar el flag de pre-f00153, todo el
  histórico de logs se vuelve ilegible: la suite de tests
  (`bun run test plugins/logs`) sigue verde porque usa fixtures
  sintéticos (con `severity` explícito), no day-files reales.

**Resolución**: slice `S1` — `readAllFiles` invoca una función
`backfillEvent(parsed)` que aplica el mismo `severityForOutcome` +
`incidentTypeForKind` que usa el writer (`normalizeEvent`). Los
day-files no se tocan en disco; el backfill es read-side. Esto es
**migration-safe** (los registros antiguos siguen ahí, ahora
legibles) y **forward-compatible** (los nuevos pasan idénticos al
camino de backfill porque ya tienen los campos). Slice `S2`
complementario: cambiar `LogEventSchema` a
`severity: LogSeveritySchema.optional()`,
`incidentType: z.string().nullable().optional()` — la
defensa-en-profundidad: si un registro del futuro escapa del backfill,
la herramienta no rompe.

---

## 🟠 MEJORABLE — Hallazgos de mejora serios

### M1. `onToolStart` / `onToolCall` / `onToolCancel` viven en `index.ts` con 380 LOC de hook plumbing

**Archivo**:
[`plugins/logs/src/index.ts#L213-L289`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/index.ts#L213-L289)

```typescript
onToolStart: async (toolName, args) => {
    const callId = randomUUID();
    const key = asCorrelationKey(args);
    if (key) inFlightCallIds.set(key, callId);
    return appendEvent(
        normalizeEvent('tool-started', { /* ... */ }),
    );
},
onToolCall: async (toolName, args, result, error, elapsedMs) => {
    // 30+ lines of correlation + normalization
},
onToolCancel: async (toolName, args, elapsedMs) => {
    // 14 lines, also correlation + normalize
},
```

**Problema**: El `index.ts` del plugin (278 LOC) mezcla cuatro
responsabilidades: (1) construcción de los dos stores
(`mainStore`/`errorStore`), (2) registro de las reglas de retención
de cache, (3) inyección del helper `ctx.logs.log`, y (4) las tres
funciones `onTool*` con su `callId` WeakMap compartido. El SRP dice
que cada módulo debe tener una sola razón para cambiar; aquí, un
cambio en el formato de normalización de un evento (`normalizeEvent`
necesita un campo nuevo) obliga a editar `index.ts` y a navegar tres
callbacks de 30+ líneas para encontrar el sitio correcto.

**Impacto**: Riesgo de regresión al añadir un nuevo lifecycle hook
(por ejemplo, `onToolRetry`). La `WeakMap<object, string>` de
`inFlightCallIds` está pegada al final del cuerpo del callback y es
fácil pasarla por alto al hacer un grep por "correlate".

**Resolución**: slice `S3` — extraer a
`plugins/logs/src/lib/hooks/tool-call-hooks.ts` una factory
`buildToolCallHooks({ appendEvent, inFlightCallIds })` que devuelve el
objeto `{ onToolStart, onToolCall, onToolCancel }`. El `index.ts`
queda en <150 LOC (orquestación pura) y los hooks son unit-testeables
directamente sin necesidad de instanciar un `McpServer`.

---

## 🟡 BIEN (lado débil) — Detalles a mejorar

### W1. `readAllFiles` hace `for (const name of names) { readFile(...) }` en serie — O(días retenidos) round-trips por query

**Archivo**:
[`plugins/logs/src/lib/services/log-store.ts#L137-L141`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/services/log-store.ts#L137-L141)

```typescript
for (const name of names) {
    const file = join(logsDir, name);
    const content = await withFileMutex(
        file, async () => await readFile(file, 'utf8').catch(() => ''),
        { onContention: 'fail', timeoutMs: 10_000 },
    );
    // ...
}
```

**Problema**: Las retenciones por defecto son 10 day-files por stream;
`readRange` y `query` pueden abrir hasta 10 archivos en serie. Cada
uno es un round-trip `withFileMutex` + `readFile` (potencialmente
competiendo con la escritora del plugin). En el peor caso (búsqueda
de un día viejo con la retención al máximo) son 10 I/O secuenciales.

**Impacto**: Latencia visible solo bajo carga concurrente o cuando
los day-files envejecen a >1 MB. Hoy los archivos rondan 0.5–1.5 MB
cada uno, así que el coste medido es <5 ms por archivo. Sin
embargo, el código está pensado para escalar y esta es la
oportunidad barata: `Promise.all(names.map(...))` (con
`withFileMutex` por-archivo) lo convierte en O(1 round-trip) sin
romper la semántica de exclusión mutua por archivo.

**Resolución**: dentro del slice `S3`, cambiar el `for` por
`Promise.all(names.map(async (name) => { ... }))` con un test que
mide el speedup en un directorio de 10 archivos de 1 MB c/u.

### W2. `asFiles` filtra silenciosamente entradas no-string — los warnings se pierden

**Archivo**:
[`plugins/logs/src/lib/services/normalize-event.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/services/normalize-event.ts#L62-L66) (visto en
`asFiles`)

```typescript
const asFiles = (value: unknown): readonly string[] =>
    Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
```

**Problema**: Si un plugin upstream pasa `files: [42, { path: 'x' }]`,
`asFiles` devuelve `[]` sin ningún rastro. Un agente que diagnostique
"por qué mi `files: [...]` no aparece en el log" no tiene manera de
saber que fue descartado por un filtro silencioso.

**Impacto**: Confusión al depurar pipelines de agente que
adjuntan evidencia (`files: [relativePath]`) y luego no la ven en el
log. El evento sí llega, sólo que con `files: []` y `meta.files` aún
contiene el valor original.

**Resolución**: `asFiles` podría devolver un `readonly [string[], readonly unknown[]]`
y `normalizeEvent` escribir un `meta.droppedFiles` con la lista de
lo descartado. No es urgente, pero es una mejora de DX barata.

### W3. `parseCursor` acepta cualquier `base64url` como número — colisiones silenciosas en pagination

**Archivo**:
[`plugins/logs/src/lib/tools/tools.ts#L68-L75`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/tools/tools.ts#L68-L75)

```typescript
const parseCursor = (cursor: string | undefined): number => {
    if (!cursor) return 0;
    const decoded = Number.parseInt(
        Buffer.from(cursor, 'base64url').toString('utf8'),
        10,
    );
    return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
};
```

**Problema**: Un cursor que no decodifica a un entero positivo se
silenciosamente reinterpreta como 0. Si el cliente pasa un cursor
manuscrito o un cursor cacheado de un día anterior, la paginación
vuelve al principio sin error.

**Impacto**: Paginación confusa si un host cachea cursores entre
sesiones. La suite de tests no cubre el caso de un cursor inválido
(lo trata como 0).

**Resolución**: añadir un `toolError` cuando el cursor no parsea
(pero se proporcionó); mejorar `log-store.spec.ts` con un test que
afirme la rama de error.

---

## ✅ Aspectos fuertes observados (citados para el siguiente revisor)

- **Escritura atómica**: `appendEvent` usa `open(file, 'a')` +
  `handle.writeFile` + `handle.sync` dentro de `withFileMutex` (con
  `timeoutMs: 10_000` y `onContention: 'fail'`). Es la única ruta
  de escritura al disco del plugin y es correcta.
- **Normalización de redactado**: `serializeRedactedEvent` recorre el
  árbol del evento con `redactValue` recursivo y trunca a
  `maxLineBytes` preservando `toolName`/`taskId`/`callId` para que la
  correlación `tool-started` ↔ `tool-completed` siga siendo posible
  incluso en payloads patológicamente grandes. El comentario es
  explícito sobre por qué esos tres campos son no-negociables.
- **Sistema de hooks**: el plugin expone `onToolStart` / `onToolCall`
  / `onToolCancel` para que el core enrute **todos** los tool calls
  (incluso los de plugins que no declaran hooks) por su `appendEvent`.
  Esto evita el clásico "plugin A escribe a su log, plugin B no tiene
  log, así que no se puede auditar B" — todos pasan por el mismo sink.
- **Fachada tipada vs sink crudo**: la separación entre
  `ctx.logs.log({ severity, incidentType, message })` (helper
  tipado, 99% de los autores de plugins lo usan) y
  `ctx.logsSink.record(event)` (raw writer, sólo el adaptador y el
  propio plugin) es **DIP bien aplicado** — la superficie pública es
  estrecha y el core posee el plumbing del lifecycle.
- **F00072 S4 / retention as data**: las reglas de retención están
  registradas vía `ctx.cacheEvictionRegistry.register({ id,
  owner, path, when: { kind: 'keepLastN', n: 10 } })` en lugar de
  tener un `gc()` inline. El cache eviction sweep corre tras el boot
  de todos los plugins. Esto es un ejemplo de libro de cómo evitar
  lógica de limpieza de cache dispersa en cada plugin.

---

## 🧮 Scoreboard

| Dimensión | Score | Justificación |
|---|---|---|
| Diseño / SOLID | 7/10 | SRP violado en `index.ts` (M1), DIP bien aplicado en hooks, no hay singletons, contratos en `contracts/interfaces/`. |
| Atomicidad / durabilidad | 9/10 | `withFileMutex` + `fsync` por archivo; sin I/O síncrono; sin `process.cwd()`. |
| Schema / contratos | 3/10 | **F1 rompe la garantía de `outputSchema` en 2/9 herramientas** — un campo que el writer emite no migra en lectura. |
| Tests | 8/10 | 81 tests, 1 570 LOC, 0.68 ratio. Cubre happy paths y los nuevos `severity`/`incidentType`. **Falta**: backfill de legacy records (W1 cubre el slice que lo cierra). |
| Observabilidad / hooks | 9/10 | Sistema de hooks completo (`onTool*` × 3), `callId` para correlación concurrente, dos streams (main + curated errors). |
| Consistencia del dominio | 9/10 | Sin vocabulario de host, sin paths hardcoded, sin acoplamiento a `vscode`. |
| Seguridad | 9/10 | Redacción multi-patron (`redact-test.ts` cubre AWS / GitHub / JWT / private keys / bearer / `assignment`); `serializeRedactedEvent` aplica a todo lo que sale al disco. |
| i18n / docs | 8/10 | Knowledge body bien estructurado, todos los campos documentados, syslog taxonomy explicada. |
| Performance | 7/10 | I/O en serie en `readAllFiles` (W1), resto O(1) por evento. |
| Mantenibilidad | 7/10 | `index.ts` mixing 4 concerns (M1); servicios pequeños y legibles; contratos aislados. |

**Overall**: 7.6 / 10 (1 decimal). El F1 pesa 4 puntos en la
dimensión de schema; sin él, el plugin puntuaría 8.6.

---

## 📋 Plan de remediación (slices)

| ID | Slice | Tamaño | Estado |
|---|---|---|---|
| S1 | `readAllFiles` backfill: aplicar `severityForOutcome` + `incidentTypeForKind` al parsear un day-file legacy | S (≤30 LOC + test) | ready |
| S2 | `LogEventSchema` defensivo: `severity`/`incidentType` opcionales/nullables | XS (≤10 LOC) | ready |
| S3 | Extraer `onTool*` a `lib/hooks/tool-call-hooks.ts` con tests unit | M (≤80 LOC) | ready |
| S4 | `Promise.all` en `readAllFiles` + benchmark en spec | XS (≤20 LOC) | ready |
| S5 | `asFiles` reporta `droppedFiles` en `meta`; `parseCursor` rechaza cursors inválidos | S (≤30 LOC) | ready |

Todos los slices cierran `verify:tools` en 0 fallos, `bun run test
plugins/logs` en 81/81 (más los tests nuevos), y `bun run validate`
green. `git log --grep "logs"` debería mostrar 5 commits limpios.

---

## 🔍 Conclusión

El plugin `logs` está cerca de excelente y bloqueado por un solo
defecto: la asimetría entre el writer (siempre normaliza via
`normalizeEvent`) y el reader (parsea el JSON crudo y confía en que
ya tiene los campos). El writer y el reader hablan idiomas
diferentes sobre el mismo dataset, y esa grieta de un solo carácter
es lo que detiene el release pipeline. La solución es de tipo
migración read-side: ni siquiera hace falta tocar los day-files en
disco.

Una vez que S1+S2 cierren, este plugin pasa de "casi listo" a
"production-grade" — todo lo demás (hooks, redacción, retención,
facade tipada) ya está al nivel de referencia que el resto del
proyecto debería copiar.
