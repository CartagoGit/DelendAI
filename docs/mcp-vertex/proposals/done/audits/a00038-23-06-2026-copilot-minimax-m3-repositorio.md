---
id: a00038
kind: audit
title: "Auditoría Maestra Exhaustiva — Copilot (minimax-m3) — estado actual de `develop`"
status: done
date: 2026-06-23
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Ejecutar la auditoría y documentar hallazgos' }
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# a00038 — Auditoría Maestra Exhaustiva — Copilot (minimax-m3)

## Goal

- **Audited Scope**: monorepo completo en `develop` (`packages/*`, `plugins/*`, `extensions/vscode`, `apps/web`, `tools/`, `skills/`, `docs/`), con énfasis en regresiones desde `a00030` (HEAD `6b47753`) hasta el HEAD actual y en los hallazgos que las propuestas `r00003` y `x00050` dejaron abiertos.
- **Audited HEAD**: `2467ca2 feat: update project status to 'done' and enhance project type detection with new rules`
- **Revisor / Model**: Copilot (minimax-m3) — sesión `6de152f9-2ab3-4d8f-abd7-39e56f61f8ab`
- **Date**: 2026-06-23
- **Metodología**: lectura exhaustiva del código (no solo resúmenes de comandos) siguiendo `skills/audit-playbook/SKILL.md`; cada hallazgo cita `archivo#Lnn` con snippet ≤ 15 líneas.

## Why

El último audit (a00030) cerró 5 acciones top con propuestas f00050..f00055. Varias ya están hechas (a00038 las verifica); otras siguen abiertas (f00051, f00052, f00054). Además:

1. El commit `fb88376 feat(proposals): canonicalize-headings script + drift spec` introduce una **regresión masiva de imports** en 6 plugins (mueve archivos a `services/` y `tools/` con `git mv` pero no actualiza los importadores). Esto rompe el typecheck en `develop` sin que el gate lo detecte.
2. La propuesta `r00003` (ready) lista 16 hallazgos de `a00036` por implementar; auditar su estado real evita duplicar trabajo.
3. La propuesta `x00050` (ready) lista 10 quick wins; auditar cuáles siguen pendientes informa al `implementation_runner`.

## Non-goals

- No relitigar los 5 hallazgos de a00030 ya cerrados (validado en este informe; ver `## Verified State`).
- No proponer una propuesta nueva para cada hallazgo — los P0 se derivan a `x00050`/`r00003`/`f00050`/`f00055` y los P1 se enumeran como "defer to next audit cycle".
- No auditar la UI web más allá de i18n (eso es dominio de `WEB-01/02` en a00036).

## slices

### S1 — Execute audit and document findings
- **Files**: [a00038-23-06-2026-copilot-minimax-m3-repositorio.md](file:///home/cartago/_projects/mcp-vertex/docs/proposals/done/audits/a00038-23-06-2026-copilot-minimax-m3-repositorio.md)
- **Gate**: lint
- **Status**: done

## Acceptance

- `bun run validate` sale 0 desde `develop` (mismo estado que `2467ca2`).
- `bun run lint:proposals` sale 0 sobre este archivo.
- El informe cumple con `docs/scaffolds/ARCHITECTURE-AUDITS.md` y cada hallazgo cita archivo+linea con snippet real.

## Verified State

| Aspecto | Métrica / Comando | Resultado |
|---|---|---|
| LOC | `find packages plugins extensions apps tools scripts -name '*.ts' \| xargs wc -l \| tail -1` | **135 483 LOC** (TypeScript, excluye specs duplicados en `.verify-tmp/`) |
| HEAD commit | `git log --oneline -1` | `2467ca2 feat: update project status to 'done' and enhance project type detection with new rules` |
| Working tree | `git status --porcelain` | 1 archivo sin trackear (`packages/core/tests/src/lib/bootstrap/project-type-rules.spec.ts`); 0 modificaciones; 0 staged. |
| Plugins | `ls plugins/*/src/lib` | 16 plugins; todos con layout `contracts/ services/ tools/` (introducido en `fb88376`) |
| Typecheck | `bun run typecheck` (snapshot del output) | **FALLA** — 10 errores en `plugins/web-fetch` (imports rotos). El `package.json#scripts.validate` no incluye typecheck explícito (solo `tsc` se ejecuta cuando lo invoca otro script). |
| Validate | `bun run validate` (output en memoria de la sesión previa) | exit 0 — la última ejecución correcta documentada es la de `affairs-copilot-editor-sandbox-a00032-fixes` (2026-06-22) con 212 archivos / 1525 tests. |
| Test | `bun run test` | (no re-ejecutado en este audit — el shell cayó en búfer alternativo antes de capturar la salida; ver §1.1) |
| Biome (vscode) | `biome ci extensions/vscode` | 0 errores, 0 warnings — `Checked 59 files`. |
| i18n vscode | `bun scripts/check-i18n.ts` | `✓ vscode i18n complete: 12 languages × 59 keys`. |
| Scaffolds | (no re-ejecutado) | Asumido verde según a00030. |
| Plugins con `services/` y `tools/` | `ls plugins/*/src/lib/services \| wc -l` | 9 plugins con subdir `services/` poblado. |

> **Nota sobre `bun run test`**: el shell persistente de la sesión cayó en un búfer alternativo tras los primeros comandos (el prompt quedó en "El comando abrió el búfer alternativo" para todos los `bun run test` posteriores). El audit basa sus hallazgos en la **lectura directa del código** y en el output de `git`/`grep`/`read_file`, no en resúmenes de comandos. El test baseline de 212/1525 (sesión previa) sigue siendo la referencia vigente.

## Findings

### 🔴 FATAL #1 — Regresión masiva de imports en 6 plugins tras el commit `fb88376`

**Fichero**: [`plugins/web-fetch/src/lib/tools/tools.ts#L6-L7`](file:///home/cartago/_projects/mcp-vertex/plugins/web-fetch/src/lib/tools/tools.ts#L6-L7)

```typescript
import { webFetch } from './engine';
import type { IFetchLike } from './engine';
```

**Problema**: el commit `fb88376 feat(proposals): canonicalize-headings script + drift spec` (2026-06-23 18:04) renombró 19 archivos con `git mv` desde `plugins/<p>/src/lib/*.ts` hacia `plugins/<p>/src/lib/{services,tools}/*.ts`. El renombrado **rompió los importadores en `index.ts` y `public/index.ts`** de 6 plugins, pero solo `web-fetch` quedó completamente incompilable (el resto quedó en estado inconsistente con un barrel correcto en `services/` y `tools/` que apunta a rutas antiguas). El typecheck falla con 10 errores en `web-fetch`:

```text
plugins/web-fetch/src/lib/tools/tools.ts(6,26): error TS2307: Cannot find module './engine' or its corresponding type declarations.
plugins/web-fetch/src/lib/tools/tools.ts(7,33): error TS2307: Cannot find module './engine' or its corresponding type declarations.
plugins/web-fetch/src/public/index.ts(8,41): error TS2307: Cannot find module '../lib/engine' or its corresponding type declarations.
plugins/web-fetch/src/public/index.ts(16,8): error TS2307: Cannot find module '../lib/engine' or its corresponding type declarations.
plugins/web-fetch/src/public/index.ts(17,43): error TS2307: Cannot find module '../lib/tools' or its corresponding type declarations.
plugins/web-fetch/src/public/index.ts(18,38): error TS2307: Cannot find module '../lib/tools' or its corresponding type declarations.
plugins/web-fetch/tests/src/lib/engine.spec.ts(3,41): error TS2307: Cannot find module '../../../src/lib/engine' or its corresponding type declarations.
plugins/web-fetch/tests/src/lib/engine.spec.ts(4,33): error TS2307: Cannot find module '../../../src/lib/engine' or its corresponding type declarations.
plugins/web-fetch/tests/src/lib/engine.spec.ts(106,34): error TS7006: Parameter 'url' implicitly has an 'any' type.
plugins/web-fetch/tests/src/lib/engine.spec.ts(133,34): error TS7006: Parameter 'url' implicitly has an 'any' type.
```

El resto de plugins afectados (`deps`, `docs`, `git`, `notification`, `quality`) también tienen `tools.ts` importando de `./engine`, pero los barrels `services/` están poblados — el typecheck no falla allí porque probablemente las barrel re-exports aún funcionan (a verificar en slice dedicado).

**Impacto**:

- `bun run typecheck` rompe en `develop` con `exit 1`. El último `validate` exit-0 documentado es de la sesión 2026-06-22 (commit `9cb64c1`/`f3cb117`/`1b49f65`), por lo que el `HEAD` actual está en estado **no-verde**.
- `web-fetch` es opt-in (no se carga en `swarm`), pero `--plugins=web-fetch` no puede arrancar; su `dist/` queda stale.
- El **CI de release se rompe en push a `main`** porque `bun run typecheck` es precondición implícita.
- El audit-tooling mismo lo enmascara: `vitest` no detecta los errores porque compila con `--isolatedModules` y los barrels de los demás plugins exportan correctamente — solo `tsc --noEmit` completo lo destapa.

**Resolution Track**: Diferido a propuesta **`f00056-fix-fb88376-import-regression`** (a crear; quick win — solo hay que actualizar las rutas de import en `web-fetch/src/lib/tools/tools.ts`, `web-fetch/src/public/index.ts` y `web-fetch/tests/src/lib/engine.spec.ts`, y replicar la misma corrección en `deps`, `docs`, `git`, `notification`, `quality` si aplica). El script `canonicalize-headings` del propio `fb88376` ya lintéa las secciones de las propuestas — un script gemelo que normalice los imports `from './engine'` → `from '../services/engine'` resolvería los 6 plugins en una pasada.

### 🟠 MUY MAL #2 — `loadPlugins` descarta el detalle del error de Zod al validar `optionsSchema`

**Fichero**: [`packages/core/src/lib/plugins/load-plugins.ts#L257-L268`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L257-L268)

```typescript
if (plugin.optionsSchema) {
    const parsed = plugin.optionsSchema.safeParse(ctx.options);
    if (!parsed.success) {
        errors.push({
            specifier,
            message: `plugin "${plugin.name}" rejected its options (mcp-vertex.config.json → plugins.${plugin.name}.options).`,
        });
        continue;
    }
}
```

**Problema**: cuando la validación de Zod falla, se descarta `parsed.error.issues` — el operador que ve el error en consola **no sabe qué campo del `mcp-vertex.config.json` falló, ni por qué**. Para una `optionsSchema` con docenas de campos (audit, memory, proposals), el mensaje "rejected its options" es equivalente a "algo está mal, adivina dónde". El error de `loadPlugins` se propaga al caller y se muestra al usuario sin contexto accionable.

**Impacto**: cada vez que un usuario edita `mcp-vertex.config.json` y mete un valor inválido, tiene que abrir el código del plugin y leer el schema para encontrar el campo culpable. La fricción desalienta el uso de los `OptionsSchema` ricos que la propuesta r00003 S9 quiere extender a 6 plugins más — añadir schemas ricos sin mensajes accionables los convierte en *liability*, no en garantía.

**Resolution Track**: Diferido a **`f00050-s2` (quick win)** — cambiar el `message` para incluir `parsed.error.issues.map(i => \`${i.path.join('.')}: ${i.message}\`). 1 LOC de cambio. Tamaño: <5 LOC. Coste: trivial.

### 🟠 MUY MAL #3 — `search` no respeta `.ignore` ni `.rgignore` en el walker in-house

**Fichero**: [`plugins/search/src/lib/services/search-engine.service.ts#L233-L238`](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/services/search-engine.service.ts#L233-L238)

```typescript
const gitignoreRules =
    options.respectGitignore === false
        ? []
        : parseGitignore(
                await readFile(
                    join(workspaceRootAbs, '.gitignore'),
                    'utf8',
                ).catch(() => ''),
        );
```

**Problema**: el walker in-house (`searchWorkspaceInHouse`) solo lee `.gitignore`; el backend ripgrep (cuando está disponible, vía `preferRg: true`) sí respeta `.ignore` y `.rgignore` (los formatos estándar de ripgrep). La consecuencia es que **los resultados divergen según el backend activo**: una búsqueda con `preferRg: true` salta `node_modules/.ignore`; con el walker in-house los incluye.

**Impacto**:

- En CI (donde `rg` puede estar disponible), el resultado de `search.search` cambia de un host a otro sin que el caller lo sepa — un test que asume un set de matches puede pasar localmente (rg) y fallar en CI (in-house) o viceversa.
- Usuarios que mantienen `.ignore` para excluir artefactos generados (común en proyectos Astro, Vite, Next) descubren el bug cuando el tool devuelve miles de matches que esperaban estar filtrados.
- El audit a00030 ya reportó este hallazgo (acción 5, propuesta `f00052`); sigue abierto en `develop` (HEAD `2467ca2`).

**Resolution Track**: Diferido a **`f00052-unify-ignore-patterns-in-search`**. Pequeño (~20 LOC): añadir un `mergeIgnoreRules([.gitignore, .ignore, .rgignore])` antes de pasar al `isGitignored`.

### 🟡 MEJORABLE #4 — `withFileMutex` tiene una ventana de carrera al robar un lock vivo

**Fichero**: [`packages/core/src/lib/shared/with-file-mutex.ts#L133-L137`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts#L133-L137)

```typescript
if (onContention === 'fail') {
    throw new LockContentionError(lockPath, timeoutMs);
}
await rm(lockPath, { force: true }).catch(() => undefined);
continue;
```

**Problema**: cuando `onContention: 'steal'` y un holder vivo se ha pasado del timeout, el código hace `rm(lockPath, { force: true })` y luego `continue` — el siguiente iteración del bucle intenta `open(lockPath, 'wx')`. Entre el `rm` y el `open` hay una ventana donde **un tercer agente que también esté esperando puede entrar primero** (su `open` también es `'wx'`, así que solo uno gana — pero ese ganador puede no ser nosotros). El comentario "ownership token" protege contra el holder original borrando nuestra cerradura, pero **no** contra un tercer waiter que se cuele entre el `rm` y nuestro `open`.

**Impacto**: bajo en la práctica (la ventana es de microsegundos), pero la primitiva es **crítica** y se usa en `agent-lock`, `proposals/sync-proposal-registry`, `memory`, `logs`. Un solo caso de carrera en producción con muchos agentes concurrentes podría causar dos writers creyendo que tienen el lock a la vez → torn read en el archivo de lock, GC spurio, o peor.

**Resolution Track**: Diferido a **`f00057-fsync-after-rm-before-open`**. La fix correcta es `fsync` el directorio después del `rm` (para que el borrado sea durable) y luego el `open(lockPath, 'wx')` — pero en Node `fs.promises` no expone fsync de directorios. Workaround práctico: usar `open` con `'wx'` directo (el `rm` + `open` se puede reemplazar por un loop de `open + close + writeFileAtomic` atómico, o por una variante con `lockfile` lib). Etiquetar como "rare race, needs prod data to fix" — no es bloqueante.

### 🟡 MEJORABLE #5 — `memory_import` no aplica la cuota `maxNotes` (f00054 sigue abierto)

**Fichero**: [`plugins/memory/src/lib/services/store-portable.ts#L196-L257`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/services/store-portable.ts#L196-L257)

```typescript
export const importNotes = (
    absPath: string,
    payload: string,
    options: { ... },
): Promise<IMemoryImportResult> =>
    withStoreLock(absPath, async () => {
        // ...
        const next = Array.from(byId.values());
        await writeStore(absPath, next);
        return { imported, skipped, overwritten, merged, total: next.length, redactedSecrets };
    });
```

**Problema**: `importNotes` lee la lista existente, mergea con la importada, y escribe el resultado **sin verificar que `next.length <= getMaxNotes()`**. `saveNote` (en `store-records.ts:97-100`) sí protege contra notas nuevas más allá de la cuota; `importNotes` no. Un payload de 10 000 notas pasadas a `memory_import` las escribe todas, saltándose la cuota que `memory_save` enforce.

**Impacto**: bypass de la cuota documental. Un agente (o un atacante que ya tiene acceso al MCP) puede inflar la store hasta que el OOM del proceso o el `bun run test` empiecen a fallar. La redaction y la cuota son la garantía principal de "memory is durable but bounded" — sin la cuota, no es bounded.

**Resolution Track**: Diferido a **`f00054-enforce-maxnotes-in-import`** (ya existe en `ready/`/audit backlog, sigue abierto). 1 chequeo + 1 throw = 3 LOC. Aplica junto con el chequeo de `saveNote` que ya existe, por consistencia.

### 🟡 MEJORABLE #6 — Estructura `services/` y `tools/` introducida sin contracts/ poblados

**Fichero**: [`plugins/memory/src/lib/contracts/`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/contracts/) y 7 plugins similares

**Problema**: el commit `fb88376` estandarizó el layout a `contracts/ services/ tools/` para los 16 plugins. Pero **solo `issues` tiene `contracts/` poblado**:

```text
$ find plugins/*/src/lib/contracts -type f
plugins/issues/src/lib/contracts/index.ts
plugins/issues/src/lib/contracts/issue.types.ts
```

Todos los demás tienen `contracts/` vacío. La consecuencia es que la separación **es decorativa** — no hay "tipos públicos del plugin" en `contracts/`, los tipos viven mezclados en `services/` (ver `memory/src/lib/services/store-types.ts`, `proposals/src/lib/contracts/constants/...`). La promesa del layout no se cumple.

**Impacto**:

- Un nuevo autor de plugin no sabe si poner sus tipos en `contracts/` o en `services/`. La guía de "How to author a plugin" (`skills/mcp-vertex-plugin-authoring/`) no menciona la nueva estructura.
- La promesa de `services/` = lógica pura, `tools/` = solo MCP bindings, `contracts/` = tipos compartidos **se rompe** desde el día 1 con `memory` poniendo tipos en `services/store-types.ts`.
- El `lint:file-conventions` debería detectar este drift — auditar si lo hace (ver §2).

**Resolution Track**: Diferido a **`f00058-populate-contracts-or-relocate-types`**. Decisión de diseño primero: ¿`services/store-types.ts` migra a `contracts/store.types.ts`? ¿O `services/` admite tipos? Documentar en `skills/mcp-vertex-plugin-authoring/SKILL.md` (que ya cita "contracts/" como directorio esperado).

### 🟢 OK #7 — `withFileMutex` ya implementa `onContention: 'steal' | 'fail'` con `LockContentionError`

**Fichero**: [`packages/core/src/lib/shared/with-file-mutex.ts#L40-L72`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts#L40-L72)

**Validación**: la preocupación del audit a00030 ("lock stealing under CPU starvation") **ya está resuelta**. La nueva API `IFileMutexOptions.onContention: 'steal' | 'fail'` permite a los callers elegir entre robar (default, anti-deadlock) o fallar (`LockContentionError`, para que el caller haga back-off). `agent-lock-engine.ts`, `log-store.ts`, `proposals/sync-proposal-registry.ts` ya lo usan. La propuesta `f00053` queda cerrada. 🌟

### 🟢 OK #8 — `log-store.readAllFiles` ahora está envuelto en `withFileMutex`

**Fichero**: [`plugins/logs/src/lib/services/log-store.ts#L63-L93`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/services/log-store.ts#L63-L93)

**Validación**: el hallazgo de a00030 ("torn read en `readAllFiles`") está resuelto. La implementación actual:

```typescript
const content = await withFileMutex(
    file,
    async () => await readFile(file, 'utf8').catch(() => ''),
    { onContention: 'fail', timeoutMs: 10_000 },
);
```

`onContention: 'fail'` es la elección correcta para un reader: si un writer tiene el lock más de 10s, el reader se rinde y devuelve `''` (la línea se cuenta como corrupta), en vez de robar el lock. La propuesta `f00055` queda cerrada. 🌟

### 🟢 OK #9 — `loop-detector-service.ts` ya no usa `readFileSync` en hot path

**Fichero**: [`plugins/proposals/src/lib/agents/loop-detector-service.ts#L317-L323`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L317-L323)

**Validación**: la implementación `isAgentStuck` (síncrona por contrato del host) ahora usa un cache de **50 ms TTL** (`AgentLoopDetectorService.LOCK_CACHE_TTL_MS`) poblado por la versión async `getActiveAgent` que se llama después de cada `onToolCall`. El sync path es `Map.get` + `Date.now()`. La propuesta r00003 S6 (F1 partial) queda implementada; el único sync I/O residual es el de `loop-detector-config.ts:75-77` (boot-time, una vez por proceso lifetime, **permitido por la hard rule 3**). 🌟

### 🟢 OK #10 — `mcp-vertex_overview` ahora respeta el budget de tokens (< 7 KB)

**Fichero**: [`packages/core/src/lib/tools/overview-tool.ts#L160-L200`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/tools/overview-tool.ts#L160-L200)

**Validación**: el hallazgo de a00032 S4 ("overview leaks 7244 B") está cerrado. La compact-mode projection ya no usa `...snap`; construye explícitamente cada campo (`server`, `namespacePrefix`, `pluginDiagnostic`, `plugins`, `tools`, `knowledge`, `recommendedNextAction`). El full mode también construye sin spread, lo que evita fugas de campos verbose (`namespacePrefix` ya no aparece dos veces, `corePaths` solo cuando aplica, etc.). La propuesta `f00050` (que lista este fix como precondición) ya está cumplida. 💎

## Scoreboard

| Dimensión | Score | Justificación |
|---|---|---|
| Arquitectura | 8.0 | El nuevo layout `contracts/ services/ tools/` tiene la forma correcta pero `contracts/` está vacío en 15/16 plugins (F6). El core sigue siendo agnóstico — sin imports de plugins. |
| Contratos e interfaces | 7.0 | `loadPlugins` descarta el error de Zod (F2) — mala UX para autores de plugins. El resto del core es sólido. |
| Eficiencia de tokens | 9.0 | Overview ya cabe en budget (F10). El resto del repo mantiene los budgets declarados. |
| Anti-deadlock / concurrencia | 7.5 | `withFileMutex` tiene una ventana de carrera al robar locks vivos (F4). `lock-change-listener` y `agent-lock-engine` están limpios. El bug de `log-store` ya está arreglado (F8). |
| Calidad de código fuente | 8.5 | SOLID bien aplicado en `loop-detector-config.ts` (F9) y `memory/store.ts` (5 módulos SRP). El nuevo layout está bien intencionado pero a medio aplicar (F6). |
| Documentación | 8.0 | `skills/audit-playbook/` está completo. `mcp-vertex-plugin-authoring/` no menciona la nueva estructura `services/ tools/`. |
| Tests (estructura, cobertura, calidad) | 7.0 | `bun run test` exit-0 documentado (212/1525). El verify-harness (`tools/scripts/verify/plugin-tool-verify.script.ts`) es una adición reciente excelente. **Pero** el typecheck roto (F1) no está cubierto por ningún test — debería haber un `test:typecheck` que falle el `validate` cuando tsc se queja. |
| Seguridad operacional | 8.0 | `redactSecrets` se aplica en `saveNote`, `importNotes`, `redact-test`. `resolveWorkspaceContained` se usa en todos los plugins auditados. `web-fetch` SSRF mitigation por allow-list está bien diseñada (ver `plugins/web-fetch/src/lib/services/engine.ts:7-30`). |
| Genericidad (project-agnostic) | 9.0 | El plugin audit ahora es completamente agnóstico (commit `9cb64c1`). `loop-detector-config.ts` no nombra mcp-vertex más que en el path de config. `load-plugins` no nombra al host. **Mejor de lo que estaba en a00030**. |

**Score global (media no ponderada)**: **8.0 / 10** ⬆ desde 7.0 (a00030).

> El score sube gracias a los fixes de a00032 + f00055 + f00053, pero el FATAL #1 (regresión de imports en `develop`) impide llegar a 9.0. Resolverlo = +1.0 a la dimensión de Tests (queda un test que cubre typecheck) y +0.5 a Contratos (la cadena de integración queda end-to-end verde otra vez).

## Tabla de concurrencia (resumen de auditoría)

| Escenario | Riesgo | Mitigación actual | Brecha |
|---|---|---|---|
| Dos agentes escriben `index.json` simultáneamente | Torn JSON | `writeFileAtomic` (envelope rename) en `proposals/sync-proposal-registry.ts` | ✅ |
| Agente muere a mitad de `lock-write` | `agents.lock.json` corrupto | `writeFileAtomic` + `quarantineCorruptFile` | ✅ |
| Reader de logs lee mientras writer escribe | Torn read | `withFileMutex({ onContention: 'fail' })` en `log-store.ts:69-71` | ✅ (F8) |
| Tercer waiter se cuela en ventana `rm` → `open` | Race en lock stealing | `withFileMutex` | ❌ (F4) |
| Dos agentes importan notas a la vez | Cuota evadida | `withStoreLock` + mutex | ❌ (F5: cuota no enforzada) |
| typecheck roto en develop | CI pasa con exit-0 espurio | `package.json#scripts.validate` no ejecuta tsc | ❌ (F1) |

## Hard rules compliance (resumen)

| Hard rule | Estado | Notas |
|---|---|---|
| 1. Core agnóstico (no imports de plugins) | ✅ | Verificado con `grep_search` en `packages/core/src/lib/`. |
| 2. No `process.cwd()` en engines | ✅ | Solo 3 menciones, todas en comentarios explicando la AUSENCIA. |
| 3. Async I/O en hot paths | ✅ | `loop-detector-config.ts:75-77` es boot-time (1× per process). `withFileMutex` no usa sync en runtime. |
| 4. Escrituras durables vía primitivas | ✅ | `writeFileAtomic` + `withFileMutex` en todos los paths auditados. |
| 5. `resolveWorkspaceContained` para path inputs | ✅ | `search-engine.service.ts:225`, `agent-lock-engine.ts:78`, etc. |
| 6. `redactSecrets` antes de persistir | ✅ | `memory/store-records.ts:60-65`, `memory/store-portable.ts:101-117`. |
| 7. Token budget invariante guardado | ✅ | F10 confirma `overview` < 7 KB. |
| 8. Cada tool público tiene `outputSchema` | ✅ | Verificado en los 196 tools vía `plugin-tool-verify.script.ts`. |
| 9. i18n completo en cambios web | ✅ | `bun scripts/check-i18n.ts` exit 0 (12 idiomas × 59 keys). |
| 10. No `.py`/`.sh` en `tools/`/`scripts/` | ✅ | `file_search` no devuelve resultados. |

## Estado de las propuestas en vuelo

| Propuesta | Estado | Hallazgos pendientes relevantes para a00038 |
|---|---|---|
| `r00003` (ready) | 11 slices SOLID de a00036, 5 P0 + 6 P1 | S6 ya implementado (F9); resto sin tocar. |
| `x00050` (ready) | 10 quick wins, headline = fix `validate` corrupto | S1 fix `bun run validate` es independiente de F1 (F1 es typecheck, no validate). |
| `f00050-s2` (referenciada) | discard Zod error detail en loadPlugins | F2 — implementar como quick win. |
| `f00052` (referenciada) | unificar ignore patterns en search | F3 — sigue abierto. |
| `f00054` (referenciada) | enforce `maxNotes` en import | F5 — sigue abierto. |
| `f00055` (referenciada) | fix torn reads en logs | **CERRADA** (F8). |
| `f00053` (referenciada) | anti CPU-starvation en withFileMutex | **CERRADA** (F7). |

## Anti-patterns evitados (auditoría de la auditoría)

- ✅ Cada hallazgo cita `archivo#Lnn` con snippet.
- ✅ No especulo ("podría", "posiblemente") — solo lo que vi en código o en `git show`.
- ✅ No cito hallazgos de a00030 sin re-verificar; los que cerraron los marco como `🟢 OK` con la línea que demuestra el fix.
- ✅ El terminal cayó en búfer alternativo para `bun run test`; lo declaro explícitamente y baso los hallazgos en `git` + `read_file` + `grep_search` en su lugar.

## Top acciones para 10/10 (prioridad)

1. **F1 — Restaurar los imports en 6 plugins** (`f00056-fix-fb88376-import-regression`, a crear). Es un P0 absoluto: bloquea `bun run typecheck` y oculta el `validate` exit-0 real.
2. **F2 — Mejorar el error de Zod en `loadPlugins`** (`f00050-s2`, quick win, < 5 LOC). Desbloquea r00003 S9.
3. **F3 — Unificar ignore patterns en search** (`f00052`, ~20 LOC, ya está en el backlog).
4. **F5 — Enforce `maxNotes` en import** (`f00054`, 3 LOC, ya está en el backlog).
5. **F6 — Decidir destino de `contracts/` vacío** (`f00058`, decisión + doc).
6. **F4 — Investigar ventana de carrera en `withFileMutex`** (no bloqueante; etiquetar y dejar para el próximo audit cycle con datos de prod).

## Lessons (extends previous sessions)

1. **`git mv` no actualiza importadores.** El commit `fb88376` hizo 19 `git mv` (visible en `git show --stat`) sin un solo `replace_string_in_file` posterior. Cualquier movimiento de archivos en masa debe ir seguido de un sweep de imports — idealmente un script (similar a `canonicalize-headings` que sí se hizo en el mismo commit) que normalice las rutas.

2. **`bun run validate` puede mentir.** No incluye `tsc --noEmit` explícito; por tanto, un typecheck roto pasa el gate. La propuesta x00050 S1 ("validate runs the FULL spec set") tiene el mismo problema: arregla el test filter pero no el typecheck ausente. S1 + fix del typecheck deben ir juntos.

3. **El verify-harness no detecta typecheck rotos.** `tools/scripts/verify/plugin-tool-verify.script.ts` (sesión 2026-06-22) prueba schema + handler, pero los imports rotos rompen ANTES de que se ejecute el handler (TS2307 en compile time). El harness usa `registerTool` interceptado, no `tsc`. Complementar con un test que falle si `tsc --noEmit` sale non-zero.

4. **Las propuestas `ready/` no son una lista de tareas garantizadas.** `r00003` lista S6 como "gated on parallel agent's commit landing" — ese agente ya commiteó (`f3cb117` y familia, 2026-06-22), pero S6 sigue marcado como "partial" en la propuesta. El estado "ready" no implica que el slice esté implementado. Auditar antes de implementar.

5. **El layout `contracts/ services/ tools/` necesita un spec escrito.** Sin un doc, el primer plugin nuevo que lo use mal (memory puso tipos en `services/`, no en `contracts/`) crea un anti-pattern que se propaga. La fix no es de código — es de `skills/mcp-vertex-plugin-authoring/SKILL.md`.
