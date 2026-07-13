---
id: a00052
kind: audit
title: Auditoría exhaustiva de arquitectura, adopción, UI y seguridad
status: done
type: proposal
track: audit
date: 2026-07-12
---

# a00052 — Auditoría exhaustiva de arquitectura, adopción, UI y seguridad

## Goal

Auditar cualitativamente el monorepo completo en `506fda79`, comprobar que
mcp-vertex puede aplicarse sobre sí mismo y sobre consumidores con mecanismos
previos, medir el coste real en tokens, corregir fallos seguros y derivar trabajo
complejo a propuestas oficiales.

## Why

Las validaciones automáticas no detectan fugas de arquitectura, ampliaciones de
scope, lost updates, contratos de adopción incompletos ni coste excesivo para el
LLM. El usuario pidió además corregir directamente lo seguro y dejar trabajo
complejo ejecutable.

## Non-goals

- No reescribir subsistemas completos durante la auditoría.
- No cambiar APIs públicas complejas sin una propuesta y slices verificables.
- No hacer commits ni publicar cambios.

## Slices

- global_gate: e2e

### S1 — Audit completed
- **Files**: docs/mcp-vertex/proposals/ready/a00052-12-07-2026-codex-exhaustive-architecture-adoption-ui-security-audit.md
- **Gate**: `bun run validate`
- **Status**: done

## Acceptance

- Estado verificado y cobertura de todas las fases registrados.
- Cada finding incluye evidencia, impacto y resolution track.
- Concurrencia, hard rules, scoreboard y propuestas oficiales incluidos.

## Verified State

| Verificación | Estado pre-audit | Estado tras fixes |
|---|---:|---:|
| HEAD | `506fda79` | sin commit nuevo |
| TypeScript LOC | 267.117 | 267k aprox. |
| Tests | 499 files / 4.302 pass / 0 fail | pendiente gate final |
| Build | 24 packages | verde |
| Biome repo | 2 errors, 7 warnings, 27 infos | errores auditados corregidos |
| Cross-IDE typecheck | 2 imports SCSS no resueltos | corregido |
| i18n web | 12 idiomas × 297 keys; shared 12 × 448 | verde |
| `analyze_project` | 13.542 bytes | finding diferido |
| `plan_mcp_project` | 213.088 bytes (~53k tokens) | finding diferido |
| `overview` CLI JSON | 3.220 bytes | dentro de escala full-preset documentada |

Comandos de preflight: `bun run test`, `bun run build`, `bunx biome ci .`,
`bun run lint:cross-ide`, `bun run --cwd apps/web check:i18n` y ejecución real
del CLI contra el propio workspace.

### Cobertura cualitativa

| Fase | Cobertura | Resultado |
|---|---|---|
| Core/client | 144 + 33 ficheros inventariados; bootstrap, scaffold, contratos, servicios y transporte leídos | findings 6–9 |
| Plugins A–M | 10 plugins; 116 source, 52 specs, 3 skills, 10 manifests, 9 README | 14 findings; 3 críticos re-clasificados abajo |
| Plugins N–Z | 10 plugins; 414 source, 160 specs, 10 skills; 49k LOC | 12 findings y tabla de concurrencia |
| Shared UI | `apps/shared` + 51 ficheros de ui-extension; settings, renderers, estilos y paquetes | findings 10–11 |
| VS Code | 97 ficheros; activación, runtime handle, commands, webviews, providers y specs | findings 6–7, 11 |
| Web | 291 ficheros; páginas, configuración, i18n, componentes y SCSS | finding 11; i18n verde |
| Tools/scripts | 130 ficheros; linters, build, release, catálogo y gates | findings 1–2; 0 scripts no-TS |
| Skills/tests | owner skills contrastadas contra paths/superficie; suites focales y completas por franja | finding 18 |

Cobertura por plugin: `audit` (2, 14, 18), `cache` (sin finding),
`conventions` (5), `deps` (1), `docs` (18), `external-mcps` (12, 18),
`git` (15), `issues` (16), `logs` (17), `memory` (17), `notification` (4),
`orchestrator-runner` (sin finding local), `proposals` (13), `quality` (16),
`rules` (16, 18), `search` (3), `status-marker` (18),
`test-convention` (sin finding), `usage-tracking` (13) y `web-fetch` (14).

## Findings

### 1. P0 — inyección de shell en instalación de dependencias [RESUELTO]

**File**: `plugins/deps/src/lib/tools/write-tools.ts:42-46,97-105`

```typescript
const SAFE_RANGE = /^[a-zA-Z0-9.^~<>=|*x \-+]*$/;
const command = [INSTALL_COMMAND[ecosystem], spec, flag]
	.filter((part): part is string => part !== null)
	.join(' ');
```

**Problem**: la allow-list admitía operadores de shell. Reproducción pura:
`range: '1 | id'` generaba `npm install safe-package@1 | id`.
**Impact**: ejecución arbitraria cuando el plugin write-side estaba habilitado.
**Resolution Track**: resuelto directamente: el spec validado se cita como un
único argumento shell y el test fija `npm install 'safe-package@1 | id'`.

### 2. P0 — audit podía escribir propuestas fuera del workspace [RESUELTO]

**File**: `plugins/audit/src/lib/tools/audit-consolidate.tool.ts:243-268`

```typescript
if (proposalsDirContained.ok || path.isAbsolute(proposalsDir)) {
	const scaffoldOptions = { proposalsDir, workspaceRoot: options.workspaceRoot };
```

**Problem**: un absoluto eludía el resultado de containment.
**Impact**: escritura de Markdown en cualquier ruta accesible al proceso.
**Resolution Track**: resuelto directamente; solo se acepta `contained.ok` y se
propaga el `rel` normalizado. Tests cubren absoluto, traversal y relativo válido.

### 3. P1 — search ampliaba roots rechazadas a todo el workspace [RESUELTO]

**File**: `plugins/search/src/lib/services/search-engine.backends.ts:130-167`

```typescript
const roots = requested.map(resolveWorkspaceContained).filter((c) => c.ok);
rgArgs.push('--', trimmed, ...(roots.length > 0 ? roots : ['.']));
```

**Problem**: `['../secret']` acababa buscando en `.`; el backend alternativo
devolvía vacío, por lo que el contrato dependía del backend.
**Impact**: exposición y coste de búsqueda inesperados.
**Resolution Track**: resuelto directamente con fail-closed y tests para roots
omitidas, todas inválidas y mezcla válida/inválida.

### 4. P1 — notification aceptaba rutas de watcher externas [RESUELTO]

**File**: `plugins/notification/src/index.ts:25-29,55-75`

```typescript
watchLockFile: z.string().optional(),
watchHandoffDir: z.string().optional(),
ctx.workspace.resolve(lockRel)
```

**Problem**: absolutos y `..` llegaban al watcher sin containment.
**Impact**: lectura/observación de JSON ajeno al proyecto.
**Resolution Track**: resuelto directamente con `resolveWorkspaceContained` y
errores claros de boot; tests para ambas opciones.

### 5. P1 — conventions permitía traversal en roots [RESUELTO]

**File**: `plugins/conventions/src/lib/services/fs-dir-reader.service.ts:21-29`

```typescript
const abs = relDir === '' ? rootDir : join(rootDir, relDir);
await readdir(abs, { withFileTypes: true });
```

**Problem**: roots de caller/config se unían sin validación.
**Impact**: lectura fuera del workspace y falsos verdes al tragar errores.
**Resolution Track**: resuelto directamente en la frontera FS; sentinel externo
probado como no escaneado.

### 6. P1 — el catálogo del cliente ignoraba namespaces configurados [RESUELTO]

**File**: `packages/client/src/lib/services/agent-catalog-service.ts:13-17,217-239`

```typescript
const AGENT_CATALOG_TOOL = 'mcp-vertex_agent_catalog';
const SKILL_TOOL = 'mcp-vertex_skill';
```

**Problem**: las demás services aceptaban prefix, pero catálogo/skill no.
**Impact**: extensiones fallaban en consumidores que personalizan namespace.
**Resolution Track**: resuelto con `formatToolName`, opción `namespacePrefix`,
inyección desde VS Code y test `acme_agent_catalog` / `acme_skill`.

### 7. P1 — tree providers y watcher escapaban del runtime handle [RESUELTO]

**File**: `extensions/vscode/src/extension.ts:309-355`

```typescript
if (treeRegistration !== undefined)
	context.subscriptions.push(treeRegistration);
context.subscriptions.push(toolTree.bindConfigWatcher(watcher));
```

**Problem**: `deactivate()` drena el handle, pero esos recursos solo se añadían
al array de VS Code pese al comentario de single registration seam.
**Impact**: listeners/providers supervivientes en reload host-driven.
**Resolution Track**: resuelto pasando los cuatro recursos por `track()`; test
verifica tres disposals de trees y tres listeners del watcher.

### 8. P1 — el planificador viola el objetivo de ahorro de tokens [DIFERIDO]

**File**: `packages/core/src/lib/bootstrap/build-blueprint.ts:169-182` y
`packages/core/src/lib/bootstrap/body-content/prompt-bodies.ts:34-67`

```typescript
const scriptTools = Object.keys(analysis.scripts).map((role) => ({
	name: `run_${role}`,
}));
formatScripts(analysis.scripts);
```

**Problem**: crea un tool por cada script y vuelve a insertar todos los scripts
en prompts y contenidos de cada fichero generado.
**Impact**: dogfood real = 213.088 bytes (~53k tokens) en una sola respuesta.
**Resolution Track**: propuesta `f00110`, proyección compacta por defecto,
paginación/detalle lazy y presupuesto e2e.

### 9. P1 — adopción no modela replace/augment/partial y self-host deriva mal [DIFERIDO]

**File**: `packages/core/src/lib/bootstrap/schemas.ts:161-165`,
`build-blueprint.ts:64-65,163-170,225-266`

```typescript
export const PLAN_INPUT_SCHEMA = z.object({
	tests: z.boolean().optional(),
	namespacePrefix: z.string().optional(),
	serverName: z.string().optional(),
});
path: `libs/mcp-project/tests/...`
```

**Problem**: `intent` existe internamente pero no cruza el wire; no hay modo de
adopción ni selección modular. El self-test propuso namespace `core` y rutas
`libs/mcp-project` aunque el repo declara otra convención.
**Impact**: un LLM puede duplicar/reemplazar mecanismos existentes o generar
scaffold incompatible.
**Resolution Track**: propuesta `f00110` con estrategia explícita, capability
diff, target-layout inyectado y fixtures de coexistencia.

### 10. P1 — ciclo de paquetes en la UI compartida [DIFERIDO]

**File**: `apps/shared/package.json:48`, `apps/shared/src/public/index.ts:41-51`,
`packages/ui-extension/package.json:37`

```json
"@mcp-vertex/ui-extension": "workspace:*"
```

```typescript
export { renderDropdown } from '@mcp-vertex/ui-extension/components/dropdown';
```

**Problem**: shared depende de ui-extension y ui-extension depende de shared.
**Impact**: orden de build frágil, contratos invertidos y typecheck aislado roto.
**Resolution Track**: propuesta `r00008`; extraer primitives a un nivel inferior
sin re-exports inversos.

### 11. P1 — web y extensiones no comparten un contrato real de ajustes [DIFERIDO]

**File**: `packages/client/src/lib/contracts/interfaces/settings.interface.ts:1-7`,
`apps/shared/src/components/dev/theme-picker.ts:73-80`,
`apps/web/src/components/Config.astro:109-223`

```typescript
readonly theme: 'system' | 'light' | 'dark';
export const THEME_ORDER = [
	'system', 'light', 'dark', 'midnight', 'solarized', 'nord',
];
```

**Problem**: extension admite tres temas; web seis, motion e idioma, con stores y
keys diferentes. Renderers shared conservan copy inglesa hardcoded.
**Impact**: ajustes y aspecto divergen entre superficies; textos desagradables o
incorrectos no quedan protegidos por una única API.
**Resolution Track**: propuesta `r00008` con modelo, i18n, accesibilidad y adapters
de persistencia por host.

### 12. P1 — ack durable de external-mcps no está compuesto [DIFERIDO]

**File**: `plugins/external-mcps/src/index.ts:88-103` y
`src/lib/tools/invoke-proxy.ts:69-110`

```typescript
buildAckToolRegistration({ pendingAcksPath }),
buildCallToolRegistration({ requireHumanAckWhenLlmDecides }),
const hasRecordedAck = options.hasRecordedAck ?? noAcksRecorded;
```

**Problem**: ack y call no comparten store; el knob de autonomía tampoco se
consume completamente.
**Impact**: aceptar no habilita la llamada con defaults; disponibilidad/contrato,
no ejecución arbitraria, por eso se clasifica P1 y no P0.
**Resolution Track**: propuesta `x00097`, slice de composición y e2e real.

### 13. P1 — tres RMW concurrentes pueden perder estado [DIFERIDO]

**File**: `plugins/usage-tracking/src/lib/rollup.ts:231-237`,
`plugins/proposals/src/lib/tools/state-tools.tool.ts:238-248`,
`plugins/proposals/src/lib/tools/agent-names.tool.ts:265-285`

```typescript
const prior = await readSummary(summaryPath);
degradations: prior?.degradations ?? [];
await writeSummary(summaryPath, summary);
```

**Problem**: read-modify-write no comparte mutex con el escritor concurrente.
**Impact**: pérdida de degradations o entradas de queue sin JSON corrupto visible.
**Resolution Track**: propuesta `x00097`, mutex alrededor de la transacción y
tests con barreras.

### 14. P1 — web-fetch aplica el cap después de bufferizar [DIFERIDO]

**File**: `plugins/web-fetch/src/lib/services/engine.ts:169-172`

```typescript
const raw = await res.text();
const truncated = raw.length > maxBytes;
const body = truncated ? raw.slice(0, maxBytes) : raw;
```

**Problem**: lee todo, mide unidades UTF-16 y luego trunca.
**Impact**: memoria no acotada y contrato `maxBytes` incorrecto para Unicode.
**Resolution Track**: propuesta `x00097`, reader streaming + cancel + decoder
incremental.

### 15. P1 — push protegido es eludible [DIFERIDO]

**File**: `plugins/git/src/lib/tools/write-tools.ts:206-223`

```typescript
const targetBranch = branchOf(args.branch);
if (args.force === 'true') argv.push('--force');
```

**Problem**: branch omitida y `HEAD:main` evitan el guard; plain force existe.
**Impact**: push destructivo a rama protegida.
**Resolution Track**: propuesta `x00097`; destino efectivo/refspec y solo
force-with-lease.

### 16. P1 — portabilidad y hot-path sync en runners [DIFERIDO]

**File**: `plugins/quality/src/lib/services/runner.ts:76-80`,
`plugins/issues/src/lib/github-client.ts:78-85`,
`plugins/rules/src/lib/tools/rules-tools.ts:192-206`

```typescript
spawn(command, { cwd, shell: true, detached: true });
Bun.spawnSync(...);
const dirs = pathEnv.split(':');
```

**Problem**: shell implícito, bloqueo del event loop y PATH no portable.
**Impact**: hangs y semántica distinta por host/SO.
**Resolution Track**: propuesta `x00097`, runner argv-first async y seams testeables.

### 17. P2 — gaps de durabilidad adicionales [DIFERIDO]

**File**: `plugins/memory/src/lib/tools/tools.ts:180-196`,
`plugins/logs/src/lib/services/subscribe.ts:35-38`,
`plugins/usage-tracking/src/lib/record-buffer.ts:53-68,116-120`

```typescript
if (records.length >= maxNotes) return quotaError;
void store.appendEvent(event);
close(): Promise<void>;
```

**Problem**: quota fuera de lock, rechazo fire-and-forget sin observar y close del
buffer no conectado al lifecycle.
**Impact**: sobrepaso de quota, unhandled rejection o pérdida al cerrar.
**Resolution Track**: propuesta `x00097`.

### 18. P2 — README/skills describen superficies obsoletas [DIFERIDO]

**File**: `plugins/audit/skills/audit-runner/SKILL.md:43-52`,
`plugins/rules/skills/rules-solid-architecture/SKILL.md:10,66-68`

```markdown
description: Thin pointer to mcp-vertex-audit-playbook...
# mcp-vertex audit runner
```

**Problem**: pointer malformado/duplicado, paths inexistentes y READMEs que
afirman read-only/no network frente a tools write/network actuales.
**Impact**: LLM configura mal, recupera con más llamadas y confía en efectos falsos.
**Resolution Track**: propuesta `x00097`; docs generadas/ratchet catálogo-schema.

### Concurrency table

| Escenario | Riesgo | Mitigación actual | Gap |
|---|---|---|---|
| Dos sync escriben proposal index | torn/lost JSON | mutex + atomic | ✅ |
| Dos claims escriben lock registry | ownership doble | mutex + atomic + tests | ✅ |
| Agent muere durante lock write | corrupción | atomic + heartbeat/stale | ✅ |
| state_repair expire vs enqueue | lost queue item | atomic sin RMW mutex común | ❌ `x00097` |
| watchdog enqueue vs tool enqueue | lost queue item | atomic sin RMW mutex común | ❌ `x00097` |
| usage rollup vs degradation | lost audit event | mutexes en fases separadas | ❌ `x00097` |
| usage buffer vs shutdown/clear | registros reaparecen o se pierden | timer unref; close desconectado | ❌ `x00097` |
| memory saves en max-1 | quota excedida | lock solo después del check | ❌ `x00097` |
| config watcher al desactivar | listener leak | runtime handle | ✅ resuelto |

### Bootstrap hard-rules compliance

| Regla | Estado |
|---|---|
| Core agnóstico | ✅ sin imports a paquetes plugin |
| No cwd en engines | ✅; usos de tooling/boot separados |
| Async hot paths | ❌ issues usa spawn sync; diferido |
| Persistencia mutex + atomic | ❌ tres RMW parciales; diferido |
| Containment | ✅ fixes directos en audit/search/notification/conventions; proposalFolders pendiente en hardening |
| Secret redaction | ⚠ resolver issue requiere hardening |
| Token budget | ❌ plan medido en ~53k tokens; `f00110` |
| outputSchema | ✅ 50/50 A–M y 61/61 N–Z; core cubierto por verify |
| i18n | ✅ gates verdes; copy shared hardcoded se difiere |
| tools/scripts TypeScript-only | ✅ 0 extensiones prohibidas |

## Scoreboard

| Dimensión | Score | Justificación |
|---|---:|---|
| Arquitectura / SOLID | 7.0 | buen plugin boundary; ciclo UI y lifecycle faltante |
| Contratos / modularidad | 6.5 | schemas completos; adopción/ack/settings divergen |
| Seguridad | 6.0 | dos P0 hallados y resueltos; guards pendientes |
| Concurrencia / durabilidad | 6.0 | primitives buenas, tres RMW y shutdown pendientes |
| Eficiencia de tokens | 5.0 | overview acotado, plan real de ~53k tokens |
| Portabilidad | 6.0 | shell/PATH/spawn sync pendientes |
| UI / accesibilidad / i18n | 6.5 | shared renderers útiles; ciclo y settings divergentes |
| Tests | 8.5 | 4.302 tests y buenas suites; faltan races/composition e2e |
| Documentación / skills | 6.0 | bootstrap fuerte; drift material en owners |

**Overall: 6.4/10.** El proyecto tiene buenas primitives y cobertura amplia,
pero el claim principal — adopción modular con máximo ahorro de tokens — todavía
no se sostiene en el dogfood del planificador. Los P0 confirmados quedaron
corregidos en esta auditoría; lo restante está cortado en propuestas ejecutables.
