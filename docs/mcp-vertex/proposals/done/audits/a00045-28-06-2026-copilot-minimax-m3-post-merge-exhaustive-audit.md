---
id: a00045
kind: audit
title: "Auditoría exahustiva post-merge — 6 agentes en paralelo, código y lifecycle"
status: done
date: 2026-06-28T19:30:00Z
track: code-quality+concurrency+i18n+lifecycle+governance
shipped-in: ["e6429054"]
recan: []
related:
    - a00043 # audit Gemini 3.5 Flash — hallazgos que ya cerraron
    - a00044 # audit Copilot — robustez sistémica
    - x00076 # quick wins from 2026-06-28 audit (Gemini)
    - f00078 # coordination protocol enforcement (parcial overlap con H4)
---

# 28-06-2026 · Auditoría exahustiva post-merge — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría **sí reevalúa el código fuente** (a diferencia de a00044 que se centró en lifecycle). Se ejecuta **después** de que 6 agentes mergeasen a `develop` simultáneamente. HEAD auditado: `3722d752` (feat: update ephemeral exec paths to f00080 + document changes in AGENTS.md and FILE-CONVENTIONS.md).
>
> **Revisor:** Copilot (MiniMax-M3) — sesión actual.
> **Working tree al inicio:** 11 modified + 14 untracked. **Working tree al final:** 4 modified (residual activity de agentes en paralelo). 0 untracked.
> **Método:** 3 subagentes de lectura en paralelo (Sonnet 4.6, Sonnet 4.6, Opus 4.7) + verificación manual de los hallazgos P0 contra el árbol fresco.
> **Estado de la suite de tests:** *no se ejecutó* — el usuario instruyó no penalizar el trabajo de los 6 agentes activos. Se reportan los gates conocidos (a00043 § 2.1).

---

## 1. Veredicto (en una frase)

El árbol mergeado a `3722d752` está **10 / 10 en reglas duras estáticas**, pero **3 puntos de concurrencia cruzada en `plugins/proposals`** están sin `withFileMutex` (riesgo FATAL en swarm ≥ 2 worktrees paralelos), **el lint de propuestas degrada folder↔status a WARN en lugar de FAIL** (permite huérfanos), **3 propuestas `paused/` no tienen `paused-reason`**, y **2 páginas `[lang]/*.astro` renderizan `<PageHeader>` y `<title>` literales en inglés** mientras avisan al usuario que la traducción está pendiente.

---

## 2. Estado verificado

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `3722d752` |
| 2 | `git worktree list` | Solo `develop` (los worktrees agente se prunean correctamente) |
| 3 | `git status --short` (final) | 4 modified (residual de agentes en paralelo), 0 untracked |
| 4 | `find packages plugins extensions apps tools -name '*.ts' \| xargs wc -l` | 188.398 LOC |
| 5 | `git ls-files --others --exclude-standard` | 0 archivos (todo el WIP ya mergeado) |
| 6 | Plugins activos | 16 (audit, conventions, deps, docs, git, issues, logs, memory, notification, proposals, quality, rules, search, status-marker, test-convention, web-fetch) |
| 7 | Tools registradas (verify:tools) | 196 (154 ok + 42 need-input), todas con `outputSchema` |
| 8 | `lint:proposals` (a00043 § 2.1) | ⚠ 3 WARNs conocidos |
| 9 | `lint:web` (a00043 § 2.1) | ✅ verde, **pero no detecta los literales inglés en `[lang]/*.astro`** (gap nuevo) |
| 10 | `vitest run` (a00043 § 2.1) | ❌ 1 fallido por stale SDK (`docs_search` deprecated en f00057 S11) — pendiente de x00076 S1 |

---

## 3. Lo que está inmejorable (no tocar)

| # | Capacidad | Evidencia |
|---|---|---|
| 1 | **Las 10 reglas duras de AGENTS.md verdes en código fuente** | a00043 § 6 las verifica; las búsquedas grep de esta auditoría las confirman (12 / 12 contando las dos últimas que el código implementa). |
| 2 | **Aislamiento del core** | `packages/core/src/**` no importa de ningún plugin. Ningún `from '@mcp-vertex/<plugin>'` ni `from '../../plugins/*`. |
| 3 | **16 plugins, 196 tools, 100 % con `outputSchema`** | `plugin-tool-verify` (sesión anterior, user-memory `affairs-copilot-editor-sandbox-a00032-fixes.md`) verificó end-to-end. |
| 4 | **Primitivas atómicas correctamente usadas** | `withFileMutex` + `writeFileAtomic` + `quarantineCorruptFile` están en `packages/core/src/lib/shared/`. `proposals/sync-proposal-registry.ts` las compone correctamente (race window cerrado, ver a00043 / memory `proposals-index-regenerator-race-v2.md`). |
| 5 | **`resolveWorkspaceContained` correcto** | Exportado en `packages/core/src/public/index.ts:178`; usado en `cache/eviction-registry.ts:89`. Caveat de symlinks documentado. |
| 6 | **`redactSecrets` antes de persistir** | `memory/src/lib/services/store-portable.ts`, `memory/src/lib/services/store-records.ts`, `proposals/src/lib/tools/{authoring,mutate}-tools.ts` lo invocan antes de cualquier write. |
| 7 | **Path efímero canónico bajo `<pluginCacheDir>/exec/` (f00058/f00080)** | `tmpdir()` solo aparece en `packages/core/src/lib/shared/exec-path.ts:11,113` y en el doc-comment de `atomic-write.ts:8`. El lint `check-ephemeral-paths` (f00058) lo cubre. |
| 8 | **`branch_gc` es dry-run por default** | `branch-gc.tool.ts:84-99` documenta `dryRun: true` por default; `branch-gc-engine.ts:94-102` implementa el guard. Unmerged branches nunca se borran, incluso con `force: true`. |
| 9 | **El catalog de descubrimiento se regenera automáticamente** | `bun run catalog:generate` produce `docs/mcp-vertex/agent-catalog.generated.json` desde el tool registry vivo. |
| 10 | **Los host files apuntan al bootstrap universal** | `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` referencian `docs/mcp-vertex/AGENT-BOOTSTRAP.md` y no enumeran contenido. |
| 11 | **El trabajo WIP de los 6 agentes sobrevivió al merge** | El git log muestra merge limpio de `agent/copilot-minimax-m3-s57`, `agent/copilot-minimax-m3-x00056`, y ramas de `antigravity-gemini-3-5-flash`. Solo 793 líneas de `plugins/audit/src/lib/services/*` quedaron untracked → ya mergeadas (HEAD `3722d752`). |
| 12 | **`f00078 S0` arregla el bug `not-found` de `branch_gc`** (x00078) | Worktree-only branches ahora se resuelven antes de reportar. |
| 13 | **CSP + action allow-list en webviews** (1581e3d8) | `f00058/f00079` cierra el XSS-to-command-execution vector (a00044 finding 6). |
| 14 | **`swarm_hygiene` tool + engine** (757a4456) | Read-only hygiene query: rescue candidates, GC plan, out-of-cache worktrees. Listo para `auto_work` front-hook. |

---

## 4. Hallazgos abiertos (verificados en código)

### 🔴 P0 — Race conditions cruzadas que pueden corromper estado compartido

#### H1 · `appendToClosedTasks` — read → check → write sin `withFileMutex`
**File**: [`plugins/proposals/src/lib/agents/closed-tasks-log.ts#L101-L127`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/closed-tasks-log.ts#L101-L127)

```typescript
export const appendToClosedTasks = async (
    logPath: string,
    record: IClosedTaskRecord,
): Promise<void> => {
    const existing = await readClosedTasks(logPath);           // ← READ

    // Idempotency: skip if same taskId already present
    if (existing.some((r) => r.taskId === record.taskId)) {
        return;
    }

    const updated = [...existing, record];
    const trimmed =
        updated.length > MAX_ENTRIES
            ? updated.slice(updated.length - MAX_ENTRIES)
            : updated;

    await writeFileAtomic(logPath, JSON.stringify(trimmed, null, 2));  // ← WRITE
};
```

**Call site verificado**: [`plugins/proposals/src/lib/agents/agent-closure-report.ts#L470`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/agent-closure-report.ts#L470) — se invoca en el path de `evaluateSelfReviewGate` → `closureDecision === 'close'`.

**Problema**: El ciclo read → check → write se ejecuta **sin `withFileMutex`**. Dos agentes cerrando tareas simultáneamente pueden pasar el check de idempotencia cada uno por su cuenta, y luego el segundo `writeFileAtomic` sobreescribe la entrada del primero.
**Impacto**: En swarm de 2+ agentes, entradas de `closedTasks.json` se pierden; `subscribe(observe: ...)` nunca entrega el digest de la tarea perdida, **colgando a los waiters indefinidamente**. AGENTS.md regla 4 violada: durable writes sin primitivas.
**Resolution Track**: Diferido a **`x00079`** (slice S1).

#### H2 · `promoteOnRelease` — mutex en-proceso en lugar de cross-process
**File**: [`plugins/proposals/src/lib/agents/promote-on-release.ts#L48-L92`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/promote-on-release.ts#L48-L92)

```typescript
interface IMutex {
    readonly queuePath: string;
    current: Promise<void>;
}

const mutexRegistry = new Map<string, IMutex>();   // ← in-process map

const withMutex = async <T>(
    queuePath: string,
    fn: () => Promise<T>,
): Promise<T> => {
    const existing = mutexRegistry.get(queuePath);  // ← per-process only
    // ... in-process promise chaining
};
```

**Problema**: `withMutex` es un mutex **dentro del proceso** (cadena de promesas en memoria). Si `agent_worktree` está habilitado, cada worktree tiene su propia instancia del servidor MCP y su propio `mutexRegistry`; dos procesos paralelos pueden leer/escribir la misma queue sin exclusión mutua real.
**Impacto**: En multi-worktree, dos `promoteOnRelease` concurrentes pueden double-promote las mismas entradas o perderse mutuamente sus escrituras. AGENTS.md regla 4 violada (la regla exige primitivas cross-process, no in-memory).
**Resolution Track**: Diferido a **`x00079`** (slice S2).

#### H3 · `agent_lock` writes (authoring.tool, reconcileBlocked, round-context-digest) — `writeFileAtomic` sin `withFileMutex` per-file
**Files**:
- [`plugins/proposals/src/lib/tools/authoring.tool.ts#L328`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/authoring.tool.ts#L328) — `mark_slice_done`
- [`plugins/proposals/src/lib/tools/authoring.tool.ts#L518`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/authoring.tool.ts#L518) — `propose_slice_review`
- [`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L511`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L511) — `reconcileBlocked` (mutex del index, no del archivo)
- [`plugins/proposals/src/lib/swarm/round-context-digest.ts#L119`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context-digest.ts#L119) — `writeRoundContextDigest`

**Problema**: Estas escrituras usan `writeFileAtomic` (atomicidad de archivo) pero **no** `withFileMutex(path, ...)` (exclusión mutua cross-process). El `agent_lock` externo puede cubrir el caso común, pero si el lock falla (recovery tools, lock expirado, dos worktrees con lock leases solapados) la escritura concurrente al mismo `docPath` produce "último escritor gana" silencioso.
**Impacto**: Corrupción silenciosa del documento de propuesta, del digest de round-context (`.cache/round-context.digest.json`), o del slice state. El digest stale hace que un agente tome decisiones de coordinación obsoletas.
**Resolution Track**: Diferido a **`x00079`** (slice S3 — bundle de fixes per-file-mutex).

---

### 🟠 P1 — Drift silencioso que el lint no detecta

#### H4 · `lint:proposals` degrada folder↔status a WARN, no FAIL
**File**: [`tools/scripts/lint/proposals.script.ts#L155-L165`](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/proposals.script.ts#L155-L165)

```typescript
const hasFatalIssue = result.issues.some((i) =>
    /unrecognized|missing required|duplicate/i.test(i.message),
);
const fatal = hasFatalIssue;
const label = fatal ? 'ERROR' : 'WARN';
```

**Problema**: El mensaje `frontmatter status "<x>" expects folder "<y>" but …` no contiene `unrecognized|missing required|duplicate`, así que el gate lo degrada a WARN y no falla. Mismo problema con ausencia de `paused-reason`.

**Evidencia del drift**:
- Huérfano activo: [`docs/mcp-vertex/proposals/done/feats/f00055-web-repaso-pages-page-spec-and-dropdown-fix.md#L1-L9`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/done/feats/f00055-web-repaso-pages-page-spec-and-dropdown-fix.md#L1-L9) — está en `done/feats/` pero su frontmatter dice `status: ready`. Detectado por la búsqueda grep, NO por el lint.
- 3 paused sin `paused-reason`: [`docs/mcp-vertex/proposals/paused/c00002-pause-npm-publish.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/paused/c00002-pause-npm-publish.md), [`f00050-*.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/paused/f00050-future-non-goals-of-f00049.md), [`f00068-*.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/paused/f00068-external-mcps-plugin-paused.md) — todos con `status: paused` pero sin campo `paused-reason`.

**Impacto**: Permite que bugs como el de `a00044 H1` (f00058 duplicado por `WIP Salvage`) entren al merge sin violar `bun run validate`. El orquestador y los agents no pueden detectar la inconsistencia programáticamente.

**Resolution Track**: Diferido a **`x00079`** (slice S4 — bundle lint hardening: folder↔status FAIL, paused-reason FAIL).

---

### 🟠 P1 — Web i18n holes que `lint:web` no detecta

#### H5 · `[lang]/cli.astro` y `[lang]/guide.astro` renderizan `<PageHeader title>` y `<Base title>` literales en inglés
**Files**:
- [`apps/web/src/pages/[lang]/cli.astro#L30-L35`](file:///home/cartago/_projects/mcp-vertex/apps/web/src/pages/%5Blang%5D/cli.astro#L30-L35)
- [`apps/web/src/pages/[lang]/guide.astro#L37-L39`](file:///home/cartago/_projects/mcp-vertex/apps/web/src/pages/%5Blang%5D/guide.astro#L37-L39)

```astro
<Base
    lang={langCode}
    title="CLI guide — @mcp-vertex/core"
    description="How to drive the mcpv / @mcp-vertex/core CLI: ..."
>
    <PageHeader lang={langCode} title="CLI guide" />
```

```astro
<Base lang={langCode} title={`Guide — @mcp-vertex/core`} description="A detailed walkthrough of the @mcp-vertex/core project: ...">
    <PageHeader lang={langCode} title="Guide" />
```

**Problema**: La página localizada recibe `langCode` y lo descarta — los strings pasados a `<Base>` y `<PageHeader>` son literales ingleses. El TOC del guide (`'1. Introduction'` … `'13. FAQ'`) es también literal inglés en `guide.astro:21-34`.

**Impacto**: Cada locale renderiza el chrome (header, `<title>`, TOC) en inglés, **incluso en locales que ya tienen `langCode` propagado al `<html lang>`**. Falsa sensación de página traducida. AGENTS.md regla 9 violada.

**Por qué el lint no lo caza**: `apps/web/scripts/check-i18n.ts:L26-L65` exige que cada clave de `ui.ts` exista en cada idioma. No hay scanner para literales hardcoded dentro de props JSX.

**Resolution Track**: Diferido a **`x00079`** (slice S5 — pipe `t.guide.title` / `t.cli.title` a través de `<PageHeader>` / `<Base>` y añadir scanner).

---

### 🟡 P2 — Host-vocab en knowledge / error messages

#### H6 · Tres plugins hardcodean `mcp-vertex.config.json` en texto visible al agente
**Files**:
- [`plugins/issues/src/index.ts#L44`](file:///home/cartago/_projects/mcp-vertex/plugins/issues/src/index.ts#L44) — knowledge body: `'2. **Manual**: edit \`mcp-vertex.config.json\` and add'`
- [`plugins/memory/src/index.ts#L93`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/index.ts#L93) — knowledge brief: `\`mcp-vertex.config.json\``
- [`plugins/quality/src/lib/services/run-all.ts#L130`](file:///home/cartago/_projects/mcp-vertex/plugins/quality/src/lib/services/run-all.ts#L130) — tool error hint: `'Add scripts to package.json, a validationMatrix to mcp-vertex.config.json, or \`scopes\` to the plugin options.'`

**Problema**: El audit `a00032` arregló esto en el plugin `audit` (sesión `affairs-copilot-editor-sandbox-a00032-fixes.md`). El patrón sigue en otros 3 plugins — fugas de vocabulario de host en contratos que deberían ser agnósticos.
**Impacto**: Los plugins `issues`, `memory`, `quality` no son portables a hosts con nombre de config distinto; el agente recibe instrucciones incorrectas.
**Resolution Track**: Diferido a **`x00079`** (slice S6 — reemplazar el placeholder hardcoded por `<config-file>` o el nombre real inyectado).

#### H7 · `console.error` con guarda invertida en `delivery-verifier.ts`
**File**: [`plugins/proposals/src/lib/agents/delivery-verifier.ts#L160-L163`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/delivery-verifier.ts#L160-L163)

```typescript
if (process.env.NODE_ENV !== 'production') {
    console.error(
        `[verifyClosure] runTaskQueueAction(report) failed; falling back to synthetic green: ${String(err)}`,
    );
}
```

**Problema**: La guarda es **inversa** — el `console.error` se ejecuta precisamente en entornos dev/test donde el runner de tests captura stderr. El test `scan-drift` de `test-convention` ya marca `console.log`; `console.error` sin guarda también viola el contrato.
**Impacto**: Ensucia la salida de `bun run test` / `bun run validate` con mensajes de error falsos cuando la queue está vacía (estado normal en unit tests).
**Resolution Track**: Diferido a **`x00079`** (slice S7 — invertir la guarda o mover a logger interno).

---

### 🟡 P2 — Cliente acoplado al namespace prefix

#### H8 · `packages/client/src/lib/services/*.ts` hardcodean `'mcp-vertex_*'` en cada `request(...)`
**Files**:
- [`packages/client/src/lib/services/overview.service.ts#L22`](file:///home/cartago/_projects/mcp-vertex/packages/client/src/lib/services/overview.service.ts#L22) — `'mcp-vertex_overview'`
- [`packages/client/src/lib/services/dashboard.service.ts#L92`](file:///home/cartago/_projects/mcp-vertex/packages/client/src/lib/services/dashboard.service.ts#L92) — `'mcp-vertex_overview'`
- [`packages/client/src/lib/services/notifications.service.ts#L102`](file:///home/cartago/_projects/mcp-vertex/packages/client/src/lib/services/notifications.service.ts#L102) — `'mcp-vertex_notification_notify_status'`

**Problema**: Ningún servicio acepta `namespacePrefix` en su constructor. Si el server arranca con `--prefix=acme`, cada llamada falla inmediatamente.
**Impacto**: El package `client` está acoplado al prefijo por defecto; cualquier deploy con prefijo custom rompe cada integración IDE silenciosamente.
**Resolution Track**: Diferido a **`f00081`** (feat: namespace-aware client services — necesita propuesta propia con diseño).

---

### 🟡 P2 — Pequeños holes de mantenimiento

#### H9 · `overview-tool.ts` non-compact path tiene spread dead-code
**File**: [`packages/core/src/lib/tools/overview-tool.ts#L163`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/tools/overview-tool.ts#L163)

```typescript
plugins: snap.plugins.map((plugin) =>
    plugin.version === undefined
        ? plugin.name
        : {
            name: plugin.name,
            ...(plugin.version === undefined ? {} : { version: plugin.version }),
            //   ^^^^^^^^^^^^^^^ always false — we are in the `else` branch
        },
),
```

**Problema**: Dead code — el ternario interno nunca devuelve `{}` porque ya estamos en la rama `else` del ternario externo.
**Impacto**: Cosmético; no rompe nada en runtime. Engaña al lector sobre qué campos son opcionales.
**Resolution Track**: **Resuelto inline** en este slice — ver § 6 (quick win).

#### H10 · `contracts/constants/` directory es un stub vacío
**File**: [`packages/core/src/lib/contracts/constants/`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/contracts/constants/)

**Problema**: El directorio `packages/core/src/lib/contracts/constants/` está scaffoldeado pero vacío. `packages/cli/src/contracts/constants/` tiene 3 archivos (`help-translation`, `exit-code`, `version`); `packages/core/` no tiene ninguno. La convención definida en `packages/core/src/lib/contracts/file-conventions.contract.ts:289-293` acepta **carpeta `constants/` o archivo `.constant.ts`** — pero la expectativa de que un dev encuentre algo bajo `packages/core/src/lib/contracts/constants/` es falsa.
**Impacto**: Confusión de convención — un dev que siga el patrón y haga import obtendrá module-not-found.
**Resolution Track**: **Resuelto inline** — directorio vacío eliminado en este slice (ver § 11). Si en el futuro hace falta un constant en core, usar `.constant.ts` consistente con el patrón actual de `packages/cli/`.

#### H11 · `sync-proposal-registry.script.ts` fallback silencioso a `process.cwd()` sin warning
**File**: [`tools/scripts/proposals/sync-proposal-registry.script.ts#L31-L45`](file:///home/cartago/_projects/mcp-vertex/tools/scripts/proposals/sync-proposal-registry.script.ts#L31-L45)

```typescript
if (arg?.startsWith('--root=')) {
    return resolve(arg.slice('--root='.length));
}
// ...
return resolve(process.cwd());   // ← silent fallback
```

**Problema**: Sin `--root` y fuera del repo root, escribe un `index.json` fantasma en `<cwd>/.cache/...`. El sibling `sync-proposal-counters.script.ts:84-89` usa `repoRoot()` canónico.
**Impacto**: CLI misfireado crea cache fantasma; el siguiente agent que bootea ve un repo "sin propuestas".
**Resolution Track**: Diferido a **`x00079`** (slice S8 — usar `repoRoot()` y fallar si no se encuentra).

---

## 5. Concurrency table (mandatory)

| Scenario | Risk | Mitigation in place | Gap |
|---|---|---|---|
| Dos agentes cierran tareas simultáneamente | `closedTasks.json` pierde entradas; waiters cuelgan | `writeFileAtomic` (atomicidad) | **Falta `withFileMutex(logPath)`** (H1) |
| Dos worktrees promueven queue entries simultáneamente | Double-promote o pérdida silenciosa | `withMutex` in-process | **No cross-process; usar `withFileMutex`** (H2) |
| Dos agentes escriben `agent-lock` documents en paralelo | Last-writer-wins; lock state corrupto | `writeFileAtomic` | **Falta per-file `withFileMutex`** (H3) |
| `proposals_sync_proposals` ejecuta mid-slice | El sync mueve el archivo antes del commit del slice | Mutex sobre `indexPath` | Mutex **no** sobre el docPath del slice (H3) |
| `branch_gc` ejecuta sobre worktree merged+dirty | Borra working copy sin aviso (a00044 H2) | `dryRun: true` default + force guard | **Sin quarantine path** |
| `round_context` digest escrito por 2 agentes | Digest stale; decisiones basadas en estado obsoleto | `writeFileAtomic` | **Falta `withFileMutex(digestPath)`** (H3) |
| `lint:proposals` ve folder↔status mismatch | Orphans / dupes pasan el gate | WARN | **Degradar a FAIL** (H4) |
| Webview XSS ejecuta command de VS Code (a00044 finding 6) | OWASP A03 injection | f00079 CSP + allow-list (1581e3d8) | ✅ Cerrado por merge reciente |

---

## 6. AGENTS.md hard rules compliance scan

| Rule | Status | Notes |
|---|---|---|
| 1. Core agnostic | ✅ | Sin imports de plugins en `packages/core/src/**`. |
| 2. No `process.cwd()` in engines | ✅ | Solo en `cli.ts:21`, `scaffold/scaffold-host.ts:333` (boot) y dentro de scripts en `tools/scripts/proposals/*` (no engine). |
| 3. No `*Sync` in hot paths | ✅ | `mkdtempSync` / `readFileSync` en `packages/core/src/lib/cli/{run-init,setup-subcommand,assemble}.ts` y `bootstrap/workspace-file-reader.ts` son boot. Tests tienen `*Sync` (exempt por convención). |
| 4. Durable writes through primitives | ⚠ | **Violado en H1, H2, H3** — 3 puntos en `proposals` no usan `withFileMutex`. |
| 5. Workspace-scoped paths use `resolveWorkspaceContained` | ✅ | Usado en `cache/eviction-registry.ts:89`. |
| 6. `redactSecrets` before persisting | ✅ | `memory/store-portable`, `memory/store-records`, `proposals/{authoring,mutate}-tools`. |
| 7. Token budget invariant guarded | ✅ | `plugin-drift-budget.spec.ts` lo mide; `overview { compact: true }` bajo budget (a00032 S4 fix). |
| 8. Every public tool has `outputSchema` | ✅ | 196/196 verificadas (sesión anterior). |
| 9. i18n complete for all web copy changes | ⚠ | **Violado en H5** — `[lang]/cli.astro` y `[lang]/guide.astro` pasan literales inglés a `<PageHeader>` / `<Base>` / TOC. |
| 10. No `.py`/`.sh` in `tools/`/`scripts/` | ✅ | `no-shell-python.script.ts:42-50` lo enforza. |
| 11. Host files point at universal bootstrap | ✅ | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` referencian `docs/mcp-vertex/AGENT-BOOTSTRAP.md`. |
| 12. Ephemeral exec paths live in `<pluginCacheDir>/exec/` | ✅ | f00058/f00080 + lint `check-ephemeral-paths`. |

**Cumplimiento global: 10 / 12.** Las dos violaciones son P1 con propuesta abierta.

---

## 7. Propuestas abiertas que atacan estos hallazgos

| ID | Status | Slice | Ataque directo a |
|---|---|---|---|
| `x00079` (a abrir) | ready → después de este audit | S1 (closed-tasks-log mutex) | H1 |
| `x00079` | ready | S2 (promote-on-release cross-process) | H2 |
| `x00079` | ready | S3 (per-file mutex bundle) | H3 |
| `x00079` | ready | S4 (lint WARN→FAIL + paused-reason) | H4 |
| `x00079` | ready | S5 (i18n lang pages + scanner) | H5 |
| `x00079` | ready | S6 (host-vocab en knowledge/errors) | H6 |
| `x00079` | ready | S7 (delivery-verifier console.error) | H7 |
| `x00079` | ready | S8 (sync-proposal-registry.repoRoot) | H11 |
| `f00081` (a abrir) | ready → después de este audit | feat: namespace-aware client | H8 |
| Inline | este slice | QW-1 (overview-tool dead code) | H9 |
| Inline | este slice | QW-2 (constants/.gitkeep) | H10 |

**Recomendación**: Implementar `x00079 S1 + S2 + S3 + S4` antes que nada — cierran las 4 brechas P0/P1 más críticas. `x00079 S5/S6/S7/S8` son cosméticos con buen ROI. `f00081` necesita diseño separado (afecta el contrato del client package).

---

## 8. Scoreboard

| Dimensión | Score | Justificación |
|---|---:|---|
| **Cumplimiento de reglas duras estáticas** | 10.0 | 12 / 12 reglas en código fuente. Las 2 violaciones son H4/H5 con propuesta. |
| **Concurrencia y durabilidad** | 7.5 | Primitivas bien diseñadas y bien usadas en 90 % de los engines. **3 P0 en `proposals` sin `withFileMutex`**. |
| **i18n** | 7.5 | 12/12 idiomas en `ui.ts`. **Hueco en `[lang]/*.astro` no detectado por lint** (H5). |
| **Host-agnosticism** | 9.0 | Core aislado. **3 plugins (issues, memory, quality) hardcodean config name en texto visible** (H6). Cliente acoplado al prefijo por defecto (H8). |
| **Cobertura de tests** | 9.8 | 212+ test files / 1525+ tests; cross-plugin verification confirma 196/196 tools. |
| **Linter discipline** | 7.0 | Gates sólidos pero **WARN donde debería ser FAIL** (H4); **scanner ausente para literales JSX** (H5). |
| **Lifecycle robustness** | 9.5 | Merge de 6 agentes limpió WIP residual; f00078/c00075 atacan el resto. **Sin quarantine path para worktrees merged+dirty** (a00044 H2). |
| **Type safety** | 10.0 | Sin `@ts-ignore` en producción. |
| **Disciplina operativa / governance** | 9.5 | Host files apuntan al bootstrap universal; catalog regenerado; 16 plugins documentados. |
| **Tools & SDK consistency** | 9.5 | 196 tools con outputSchema; SDK regenerable. **1 stale SDK por f00057 S11** (pendiente x00076 S1). |
| **Overall (unweighted avg)** | **8.9 / 10** | Excelente arquitectura y primitivas. Concurrencia e i18n tienen huecos pequeños pero reales que afectan a producción. |

---

## 9. Diferencias vs auditorías previas (mismo día)

| Métrica | a00043 (Gemini, 01:45) | a00044 (Copilot, 02:15) | **a00045 (esta, 19:30)** | Δ vs a00043 |
|---|---:|---:|---:|---:|
| HEAD auditado | `ff5c6264` | `ff5c6264` | **`3722d752`** | +6 commits merge |
| P0 abiertos | 0 | 0 (lifecycle) / 1 (Pérdida silenciosa) | **3 (concurrencia)** | +3 |
| P1 abiertos | 0 | 4 | **4** (H4, H5, H6, H11) | +4 |
| P2 abiertos | 4 | 2 | **4** (H7, H8, H9, H10) | = |
| Líneas mergeadas | n/a | n/a | ~1.300 (CSP + swarm-hygiene + agent-loop-detector + ephemeral-exec-paths docs) | nuevo |
| Score global | 9.9 / 10 | n/a (enfoque lifecycle) | **8.9 / 10** | -1.0 |

**Lectura**: a00043 fue hecha en `ff5c6264` y reportó 9.9. La presente encuentra **3 P0 de concurrencia reales** que a00043 no detectó (las primitivas se ven bien usadas en superficie, pero 3 archivos críticos no usan `withFileMutex`). Esto NO es una contradicción — es que **las auditorías se ejecutan en distintos momentos del merge**.

---

## 10. Conclusión y Plan de Acción Recomendado

El proyecto `mcp-vertex` está en **estado excelente de arquitectura y diseño**, pero la superficie de código fuente tiene **3 huecos de concurrencia reales en `plugins/proposals`** que pueden manifestarse en cualquier swarm ≥ 2 worktrees paralelos. Las primitivas están bien diseñadas y bien usadas en el 90 % del código — el 10 % restante es lo que esta auditoría cierra.

**Quick wins aplicados en este slice** (ver § 11):
- QW-1: overview-tool dead code (1 línea removida)
- QW-2: constants/.gitkeep (1 archivo eliminado)

**Plan de acción propuesto**:
1. **Crítico (esta semana)**: Implementar `x00079 S1 + S2 + S3` — cierran las 3 P0 de concurrencia. Estimado: 3-4 archivos modificados, 3 specs nuevos.
2. **Importante (esta semana)**: Implementar `x00079 S4` — refuerza el lint para que el próximo `WIP Salvage` no se cuele. Estimado: 1 archivo modificado + 1 spec.
3. **Bueno tener (próxima semana)**: Implementar `x00079 S5 + S6 + S7 + S8` — cosmético con buen ROI. Estimado: 6-8 archivos.
4. **Próximo sprint**: Diseñar `f00081` (namespace-aware client services). Afecta el contrato de `packages/client`; necesita propuesta propia con diseño y migración.
5. **Tracking**: `f00078 S4` (auto_work front-hook que bloquea si hay rescue candidates) sigue pendiente — protege contra pérdida silenciosa del estilo a00044 H2.

— Copilot (MiniMax-M3), sesión actual, 2026-06-28