---
id: a00043
kind: audit
title: "Auditoría Exhaustiva — Antigravity (Gemini 3.5 Flash (High)) — repositorio completo"
status: done
date: 2026-06-28T01:45:00Z
track: archive
---

# 28-06-2026 · Auditoría Exhaustiva — `@mcp-vertex/core`

> **Documento independiente.** Realizada evaluando la totalidad del monorepo en su estado actual, tras evaluar el progreso y la actividad de los 4 agentes activos trabajando simultáneamente en el repositorio. Según lo solicitado por el usuario, las fallas de tipo/compilación y tests derivadas de las colisiones del trabajo de otros agentes en curso no penalizan las notas del Scoreboard (pero se reportan como hallazgos con su Resolution Track correspondiente).
>
> **Revisor:** Antigravity (modelo `Gemini 3.5 Flash (High)`).
> **HEAD auditado:** `ff5c6264` (feat(docs): add proposal for canonical ephemeral exec paths in pluginCacheDir)
> **Working tree:** Limpio (0 archivos modificados, 0 archivos no rastreados).
> **Estado de la suite de tests:** 359 ficheros pasados de 360, con **2.985 tests passed y 1 fallido** en 28,58 s (fallo derivado de la desincronización de esquemas en el catálogo de herramientas debido a la deprecación de `docs_search`).
> ~185.198 LOC TS fuente total.

---

## 1. Veredicto (en una frase)

`mcp-vertex` mantiene un **estándar técnico y de diseño de nivel de producción**, habiendo sanado completamente los fallos de typecheck del core y la brecha de internacionalización de Astro detectados en la auditoría previa, dejando únicamente un fallo menor de SDK de salidas de herramientas desincronizado (por la deprecación de `docs_search` en f00057) y advertencias estéticas/directorio en 3 archivos de propuestas.

---

## 2. Estado verificado

### 2.1 Numeración de suite y validación

| Paso | Comando | Resultado |
|---|---|---|
| 1 | `tsc --noEmit` | ✅ Verde. 0 errores TS. |
| 2 | `biome ci` | ✅ "Checked 70 files in 49ms. No fixes applied." |
| 3 | `check:i18n` (vscode) | ✅ 12 langs × 59 keys. |
| 4 | `lint:cli-imports` | ✅ 0 violations. |
| 5 | `lint:cli-coverage` | ✅ |
| 6 | `lint:cli:i18n` | ✅ |
| 7 | `lint:scss` | ✅ |
| 8 | `lint:brand-hex` | ✅ |
| 9 | `lint:setup` | ✅ |
| 10 | `lint:tools` | ✅ (no shell/python files). |
| 11 | `lint:cli-shape` | ✅ |
| 12 | `lint:workflow` | ✅ |
| 13 | `lint:proposals` | ⚠ **3 advertencias de linter** (kind/status mismatches y slices sin campos obligatorios). |
| 14 | `lint:scaffolds` | ✅ |
| 15 | `lint:agents` | ✅ |
| 16 | `lint:audit-ids` | ✅ (docs/mcp-vertex/proposals/done/audits/ has no duplicate ids). |
| 17 | `lint:skills` | ✅ (17 skills match manifest). |
| 18 | `lint:cache` | ✅ (only root cache). |
| 19 | `verify:tools` | ✅ |
| 20 | `lint:web` | ✅ "Result (238 files): 0 errors, 0 warnings, 8 hints". |
| 21 | `vitest run` | ❌ **1 test fallido de 2.986** (stale SDK por deprecación de `docs_search`). |

### 2.2 Plugins activos (16)

`git, search, memory, docs, rules, quality, deps, proposals, notification, logs, status-marker, test-convention, issues, audit, conventions, web-fetch` (196 tools registradas en total).

### 2.3 Suciedad del árbol de trabajo (`git status`)

El working tree se encuentra completamente **limpio** (sin modificaciones locales).

---

## 3. Lo que está inmejorable (no tocar)

- **Corrección Completa de i18n en Astro (`lint:web`):** El drift de internacionalización de claves como `homeQuickInstall` y `homeAtAGlance` ha sido resuelto por completo, resultando en un build estricto sin errores de compilación ni traducción.
- **Tipo de compilación Core Sanado:** Los errores de typecheck que afectaban a `agent-discovery-catalog.ts` y `assemble.ts` han sido corregidos satisfactoriamente.
- **Sanitización de Secretos y Primitivas de Concurrencia:** La integración de `redactSecrets` antes de cualquier escritura a disco y el uso estricto de `writeFileAtomic` + `withFileMutex` se mantiene robusto en todos los componentes.
- **Hermetismo e Inyección en `packages/core`:** El desacoplamiento entre el core y los plugins es impecable; no se observan fugas de APIs del host ni de plugins dentro del runtime agnóstico.

---

## 4. Hallazgos abiertos (verificados en código)

### 🔴 P0 — Errores críticos o pérdida de estado

*No se detectó ningún hallazgo de severidad P0.*

---

### 🟠 P1 — Robustez e Higiene del Repositorio

#### H1 · SDK de salida de herramientas (`tool-outputs.ts`) desactualizado por deprecación de `docs_search`

**File**: [`packages/core/src/generated/tool-outputs.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/generated/tool-outputs.ts)

**Problema**: Se ha deprecado formalmente la herramienta `docs_search` en favor de `search_search` con el parámetro `roots: ['docs']` (f00057 S11), modificando su firma en el código fuente para retornar un sobre de deprecación:

```typescript
// plugins/docs/src/lib/tools/tools.ts:143-146
						outputSchema: z.object({
							ok: z.literal(false),
							error: z.object({
```

Sin embargo, el archivo generado `tool-outputs.ts` no fue regenerado antes de commitear el cambio.
**Impacto**: Falla el test `checked-in src/generated/tool-outputs.ts match a fresh generation` en `packages/core/tests/tool-types-sdk.spec.ts`.
**Resolution Track**: Diferido a propuesta `x00076` slice `S1` (requiere ejecutar `bun run types:generate`).

---

### 🟡 P2 — Advertencias del Linter y Gaps de Funcionalidad

#### H2 · Folder drift en la propuesta terminada f00058

**File**: [`docs/mcp-vertex/proposals/in-progress/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/in-progress/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md)

**Problema**: El commit `d153bb8f` cambió el estado de la propuesta `f00058` (ephemeral exec paths) a `done`:

```markdown
---
id: f00058
status: done
type: proposal
```

Sin embargo, el archivo físico permanece en la carpeta `in-progress/` en lugar de ser trasladado a `done/feats/`.
**Impacto**: El linter de propuestas `lint:proposals` emite una advertencia de mismatch de carpeta:
`frontmatter status "done" expects folder "done" but the nearest status ancestor is "in-progress"`.
**Resolution Track**: Diferido a propuesta `x00076` slice `S2` (mover el archivo a `done/feats/`).

---

#### H3 · Advertencias estéticas y formateo en propuestas `f00070` y `x00074`

**Files**:
- [`docs/mcp-vertex/proposals/ready/f00070-status-marker-bilingual-rendering.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/ready/f00070-status-marker-bilingual-rendering.md)
- [`docs/mcp-vertex/proposals/ready/x00074-loop-detector-distinguish-backoff-from-stuck.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/ready/x00074-loop-detector-distinguish-backoff-from-stuck.md)

**Problema**: Estos dos documentos listados en `ready/` contienen advertencias de formato menores detectadas por el validador:
1. `f00070`: Secciones fuera del orden canónico (non-goals, acceptance, slices) y slices sin el campo `Status` ni definición de `Command`/`Expect`.
2. `x00074`: Archivo marcado como `status: paused` pero ubicado en la carpeta `ready/`, orden de secciones incorrecto y slices incompletos.
**Impacto**: `lint:proposals` emite múltiples `WARN` en el gate de validación.
**Resolution Track**: Diferido a propuesta `x00076` slice `S3` (formatear markdown y reubicar `x00074` a `paused/fixes/`).

---

#### H4 · Soporte limitado/stub para registros no estándar en online-preset freshness check

**File**: [`plugins/rules/src/lib/frameworks/online-preset.ts#L241-L375`](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/lib/frameworks/online-preset.ts#L241-L375)

```typescript
// plugins/rules/src/lib/frameworks/online-preset.ts:375
		return { ok: true, package: pkg, version: '1.0.0' };
```

**Problema**: Aunque el mapeo `ONLINE_PACKAGE_BY_PRESET` define paquetes en múltiples registros (como `hex` para Credo, `composer` para PHPStan, `luarocks` para Luacheck, `psgallery` para PSScriptAnalyzer), la función `fetchOnlinePresetInfo` solo procesa respuestas JSON de registros como npm, pypi, crates, go, rubygems, maven, nuget, homebrew, winget, clojars, cpan, julia y r_cran. Para los demás, cae directamente al fallback que retorna `'1.0.0'` sin haber verificado la versión real.
**Impacto**: Los freshness checks para estos frameworks no devuelven información real de versión en producción. Además, el test unitario en `online-preset.spec.ts` para Credo valida que devuelva `'1.0.0'` como un falso éxito, enmascarando este gap de implementación.
**Resolution Track**: Diferido a propuesta `x00076` slice `S4` (para completar los parsers de API de Hex, Composer y LuaRocks).

---

## 5. Concurrency table (mandatory)

| Scenario | Risk | Mitigation in place | Gap |
|---|---|---|---|
| Dos agentes escriben en `index.json` simultáneamente | Torn JSON | `withFileMutex` + `writeFileAtomic` (tmp + rename) | ✅ Sin brecha. |
| Un agente muere a mitad de la escritura de lock | `agents.lock.json` corrupto | `writeFileAtomic` + cuarentena de archivo corrupto | ✅ Sin brecha. |
| El lector de logs lee mientras el escritor escribe | Lectura incompleta / rota | `withFileMutex` covers lectura y escritura de logs | ✅ Sin brecha. |
| Dos agentes intentan reclamar el mismo lock de propuesta | Colisión de lock / deadlock | TTL en archivo de lock + token de propiedad único | ✅ Sin brecha. |
| El watcher de notificaciones pierde un evento en handoff | Lectura de cola vacía | Delay de 60ms antes de re-armar | ✅ Sin brecha. |

---

## 6. AGENTS.md hard rules compliance scan

| Rule | Status | Notes |
|---|---|---|
| 1. Core agnostic (no plugin imports in `packages/core`) | ✅ | Cumplido formalmente. |
| 2. No `process.cwd()` in engines | ✅ | Cumplido. El único uso está en el scaffolding generado. |
| 3. No `*Sync` in hot paths | ✅ | Respetado. `bootstrap-tool.ts` solo ejecuta I/O sincrónico en fase boot. |
| 4. Durable writes through primitives | ✅ | Cumplido. Todas las persistencias usan `writeFileAtomic`. |
| 5. Workspace-scoped paths use `resolveWorkspaceContained` | ✅ | Cumplido en todos los plugins. |
| 6. `redactSecrets` before persisting user text | ✅ | Respetado en memory, issues y proposals. |
| 7. Token budget invariant guarded | ✅ | Invariante respetada por la estructura compacta. |
| 8. Every public tool has `outputSchema` | ✅ | Respetado. |
| 9. i18n complete for all web copy changes | ✅ | **Corregido**. Las brechas previas de internacionalización en Astro se han sanado por completo. |
| 10. No `.py`/`.sh` in `tools/`/`scripts/` | ✅ | Confirmado por `lint:tools`. |

**Cumplimiento global: 10 / 10.**

---

## 7. Scoreboard

*Nota: De acuerdo con las instrucciones del usuario, el fallo derivado del test desactualizado de tool-outputs (por el trabajo concurrente) no penaliza el scoreboard.*

| Dimensión | Score | Justificación |
|---|---:|---|
| **Integridad arquitectónica** | 10.0 | Typechecks en core completamente limpios. Modularización y inyección impecables. |
| **Concurrencia y durabilidad** | 10.0 | Excelente uso de primitivas atómicas y mutexes en todos los plugins y stores. |
| **Seguridad de datos** | 9.6 | Redacción de secretos activa. Pendiente la adición de CSP en webviews del VS Code host. |
| **Completitud de i18n** | 10.0 | Excelente cobertura del host VS Code y Astro web completamente traducida en 12 idiomas sin errores. |
| **Host-agnosticism** | 10.0 | Respetado escrupulosamente. |
| **Cobertura de pruebas** | 9.8 | 2.986 tests con alta cobertura en plugins críticos. |
| **Disciplina operativa** | 9.7 | 42 auditorías previas completadas. Ligero drift estético detectado en 3 archivos de propuestas. |
| **Type safety y escape hatches** | 10.0 | Código libre de `@ts-ignore` en producción y tipado robusto. |
| **Herramientas de i18n** | 9.8 | Correcto flujo de traducción para tutoriales e instalación. |
| **Overall (unweighted avg)** | **9.9 / 10** | **Estado excelente, con colisiones de desarrollo concurrente casi inexistentes.** |

---

## 8. Diferencias vs auditoría previa (a00042)

| Métrica | a00042 (25-06) | a00043 (28-06, esta) | Δ |
|---|---:|---:|---:|
| LOC TS fuente | ~162.557 | 185.198 | **+13.9%** |
| Spec files | 338 | 360 | **+22 test files** |
| Tests | 2.592 | 2.986 | **+394 tests** |
| P0 abiertos | 2 (H1, H2) | 0 | **-2 (Sanados)** |

---

## 9. Conclusión y Plan de Acción Recomendado

El proyecto `mcp-vertex` se encuentra en un **estado de excelencia técnica sobresaliente**. Se han sanado todas las fallas críticas de typecheck y brechas de i18n reportadas en la sesión de auditoría anterior.

**Plan de acción recomendado:**
1. Ejecutar `bun run types:generate` para actualizar el SDK de outputs de herramientas y resolver el fallo del drift en `tool-types-sdk.spec.ts`.
2. Reubicar la propuesta `f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md` de la carpeta `in-progress/` a la de `done/feats/`.
3. Alinear el formato y los estados de carpetas para las propuestas `f00070` y `x00074` para limpiar las advertencias de `lint:proposals`.
4. Agregar soporte de parsing específico en `online-preset.ts` para extraer la versión real en registros no soportados (como Hex para elixir-credo y Composer para php-phpstan) y actualizar sus tests unitarios correspondientes.

— Antigravity (modelo `Gemini 3.5 Flash (High)`), 2026-06-28
