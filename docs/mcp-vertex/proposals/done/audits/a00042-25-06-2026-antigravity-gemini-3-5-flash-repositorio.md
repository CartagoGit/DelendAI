---
id: a00042
kind: audit
title: "Auditoría Exhaustiva — Antigravity (Gemini 3.5 Flash (High)) — repositorio completo"
status: done
date: 2026-06-25T23:37:00Z
track: archive
---

# 25-06-2026 · Auditoría Exhaustiva — `@mcp-vertex/core`

> **Documento independiente.** Realizada evaluando la totalidad del monorepo en su estado actual, tras evaluar el progreso y la actividad de los 3 agentes activos trabajando simultáneamente en el repositorio. Según lo solicitado por el usuario, las fallas de tipo/compilación y tests derivadas de las colisiones del trabajo de otros agentes en curso no penalizan las notas del Scoreboard (pero se reportan como hallazgos con su Resolution Track correspondiente).
>
> **Revisor:** Antigravity (modelo `Gemini 3.5 Flash (High)`).
> **HEAD auditado:** `a46f646a` (chore(proposals): remove stale legacy docs/proposals leftover)
> **Working tree:** 5 archivos modificados + 5 archivos no rastreados (detalles abajo).
> **Estado de la suite de tests:** 335 ficheros pasados de 338, con **2.589 tests passed y 3 fallidos** en 36,60 s (fallos derivados de la desincronización de esquemas en el catálogo de habilidades).
> ~162.557 LOC TS fuente total.

---

## 1. Veredicto (en una frase)

`mcp-vertex` se encuentra en una **etapa de intensa evolución y madurez de plataforma** con una base arquitectónica asíncrona impecable (I/O asíncrono, mutexes en archivos, sanitización de secretos), aunque la integración concurrente de los 3 agentes ha dejado temporalmente **roto el typecheck en el core** (falta mapear el campo `appliesTo` en la compilación de habilidades de f00057) e **incompleta la internacionalización de la página web** (faltan las traducciones de `homeQuickInstall` y `homeAtAGlance` en los 12 idiomas).

---

## 2. Estado verificado

### 2.1 Numeración de suite y validación

| Paso | Comando | Resultado |
|---|---|---|
| 1 | `tsc --noEmit` | ❌ **5 errores TS** (en `agent-discovery-catalog.ts`, `assemble.ts` y tests) |
| 2 | `biome ci` | ✅ "Checked 67 files. No fixes applied." |
| 3 | `check:i18n` (vscode) | ✅ 12 langs × 59 keys |
| 4 | `lint:cli-imports` | ✅ 0 violations |
| 5 | `lint:cli-coverage` | ✅ 17 commands × 16 spec files |
| 6 | `lint:cli:i18n` | ✅ 12 languages × 93 commands |
| 7 | `lint:scss` | ✅ 0 errors |
| 8 | `lint:brand-hex` | ✅ |
| 9 | `lint:setup` | ✅ |
| 10 | `lint:tools` | ✅ (no shell/python files) |
| 11 | `lint:cli-shape` | ✅ |
| 12 | `lint:workflow` | ✅ |
| 13 | `lint:proposals` | ⚠ **3 advertencias de linter** (kind mismatches, missing fields en slices) |
| 14 | `lint:scaffolds` | ✅ |
| 15 | `lint:agents` | ✅ |
| 16 | `lint:audit-ids` | ✅ |
| 17 | `lint:skills` | ✅ (17 skills match manifest) |
| 18 | `lint:cache` | ✅ (only root cache) |
| 19 | `verify:tools` | ❌ **14 fallos de validación de esquema** (en `agent_catalog` por la falta de `appliesTo`) |
| 20 | `lint:web` | ❌ **12 errores de tipo i18n** (por claves ausentes en `langs/*.ts`) |
| 21 | `vitest run` | ❌ **3 tests fallidos de 2.592** (stale SDK y fallos del catálogo/budget por error de esquema) |

### 2.2 Plugins activos (16)

`git, search, memory, docs, rules, quality, deps, proposals, notification, logs, status-marker, test-convention, issues, audit, conventions, web-fetch` (196 tools registradas en total).

### 2.3 Suciedad del árbol de trabajo (`git status`)

```
Changes not staged for commit:
        modified:   apps/web/src/i18n/shared.ts
        modified:   docs/mcp-vertex/wiki/04-recommended-approach.md
        modified:   docs/mcp-vertex/wiki/05-option-E-subprocess-mcp.md
        modified:   docs/mcp-vertex/wiki/README.md
        modified:   packages/core/src/lib/skills/load-skills.ts

Untracked files:
        docs/mcp-vertex/wiki/06-bootstrap-and-quotas.md
        docs/mcp-vertex/wiki/07-plugin-orchestrator-runner.md
        docs/mcp-vertex/wiki/08-usage-tracking-plugin.md
        packages/core/src/lib/skills/skill-catalog.ts
        packages/core/src/lib/tools/skill-tool.ts
```

Esto representa el trabajo en progreso del agente `copilot` en la rama `agent/copilot-f00057-slices`.

---

## 3. Lo que está muy bien (no tocar)

- **Sanitización automática de secretos (`redactSecrets`)** en la persistencia de memorias y propuestas.
- **Doble protección asíncrona de archivos (`writeFileAtomic` + `withFileMutex`)** con heartbeat de renovación de mtime.
- **Independencia absoluta del núcleo (`packages/core`)** respecto a los plugins, recibiendo la inyección de dependencias limpiamente a través de `IMcpPluginContext`.
- **Ausencia total de `process.cwd()`** en los motores de negocio y plugins (salvo en los entry-points permitidos o plantillas de scaffold).
- **Refactorización exitosa de `round-context.ts`** en 5 sub-módulos cohesivos (`-types`, `-hash`, `-sources`, `-resume`, `-digest`) con su barrel correspondiente.
- **Higiene de la caché (`lint:cache`)**, que mantiene limpia la raíz y consolida todo en `.cache/`.

---

## 4. Hallazgos abiertos (verificados en código)

### 🔴 P0 — Tipo de compilación roto, seguridad o pérdida de estado

#### H1 · Typecheck roto en `packages/core` por la adición de `appliesTo` a `ISkillSummary`

**Files**:
- [`packages/core/src/lib/catalog/agent-discovery-catalog.ts#L34-L41`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/catalog/agent-discovery-catalog.ts#L34-L41)
- [`packages/core/src/lib/cli/assemble.ts#L327-L336`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L327-L336)
- [`packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts#L34-L51`](file:///home/cartago/_projects/mcp-vertex/packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts#L34-L51)
- [`packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts#L236-L243`](file:///home/cartago/_projects/mcp-vertex/packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts#L236-L243)

```typescript
// packages/core/src/lib/catalog/agent-discovery-catalog.ts:34-41
const cloneSkill = (skill: ISkillSummary): ISkillSummary => ({
	id: skill.id,
	version: skill.version,
	minCoreVersion: skill.minCoreVersion,
	summary: skill.summary,
	tags: [...skill.tags],
	bodyPath: skill.bodyPath,
});
```

**Problema:** Se ha añadido el campo obligatorio `appliesTo: readonly string[]` al tipo `ISkillSummary` en `agent-discovery-types.ts`, pero los mapeos y clonadores de habilidades en el catálogo, en el ensamblador y en los tests de catálogo no han sido actualizados para manejar este campo.
**Impacto:** Fallo completo de compilación en `tsc --noEmit`. Además, el tool handler de `agent_catalog` falla en runtime al validar su salida frente a su `outputSchema` (que ahora exige `appliesTo: z.array(z.string())`), rompiendo la validación de herramientas en los 14 plugins del proyecto.
**Resolution Track:** En desarrollo bajo propuesta `f00057` slice `S5`.

---

#### H2 · Brecha de internacionalización en `apps/web/src/i18n/langs/*.ts`

**Files**:
- `apps/web/src/i18n/langs/ar.ts`
- `apps/web/src/i18n/langs/de.ts`
- `apps/web/src/i18n/langs/en.ts`
- `apps/web/src/i18n/langs/es.ts`
- `apps/web/src/i18n/langs/fr.ts`
- `apps/web/src/i18n/langs/hi.ts`
- `apps/web/src/i18n/langs/it.ts`
- `apps/web/src/i18n/langs/ja.ts`
- `apps/web/src/i18n/langs/pt.ts`
- `apps/web/src/i18n/langs/th.ts`
- `apps/web/src/i18n/langs/vi.ts`
- `apps/web/src/i18n/langs/zh.ts`

```typescript
// apps/web/src/i18n/langs/en.ts:5-6
const dict: LangDict = {
	nav: { ... }
```

**Problema:** Se agregaron las propiedades `homeQuickInstall` y `homeAtAGlance` a la interfaz `ITranslations` en `apps/web/src/i18n/shared.ts`, pero estas propiedades no fueron añadidas a los diccionarios de idiomas en los 12 archivos de localización bajo `langs/`.
**Impacto:** El chequeo de Astro falla con 12 errores de tipo: `Type '{...}' is missing the following properties from type 'ITranslations': homeQuickInstall, homeAtAGlance`, bloqueando el build del sitio web Astro (`lint:web` en rojo). Viola la regla estricta #9 de `AGENTS.md`.
**Resolution Track:** Diferido a la propuesta `f00059`.

---

### 🟠 P1 — Robustez e Higiene del Repositorio

#### H3 · SDK de salida de herramientas (`tool-outputs.ts`) desactualizado

**File**: [`packages/core/src/generated/tool-outputs.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/generated/tool-outputs.ts)

**Problema:** El archivo auto-generado que tipa las salidas de herramientas del SDK está desincronizado con respecto al estado actual de las firmas/schemas en el proyecto.
**Impacto:** Provoca el fallo del test `checked-in src/generated/tool-outputs.ts match a fresh generation` en `packages/core/tests/tool-types-sdk.spec.ts`.
**Resolution Track:** Diferido a la propuesta `f00057` slice `S10` (requiere ejecutar `bun run types:generate`).

---

### 🟡 P2 — Calidad de producto y Linter warnings

#### H4 · Advertencias del Linter de Propuestas (`lint:proposals`) en archivos activos

**Files**:
- [`docs/mcp-vertex/proposals/ready/f00062-settings-types-unification-and-globalstate-migration.md#L82`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/ready/f00062-settings-types-unification-and-globalstate-migration.md#L82)
- [`docs/mcp-vertex/proposals/ready/f00058-webview-hardening-csp-allow-list-and-state-persistence.md#L108`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/ready/f00058-webview-hardening-csp-allow-list-and-state-persistence.md#L108)
- [`docs/mcp-vertex/proposals/in-progress/f00057-skill-unification-plugin-coverage-script-wiring-and-doc-drift-repair.md#L0`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/in-progress/f00057-skill-unification-plugin-coverage-script-wiring-and-doc-drift-repair.md#L0)

**Problema:** Varios archivos de propuestas en `ready/` e `in-progress/` contienen discrepancias detectadas por el linter `proposals.script.ts`. Por ejemplo, `f00062` y `f00058` tienen slices declarados sin los campos requeridos (`Status`, `Files`, `Command`/`Gate`), y `f00057` tiene una inconsistencia de nombre/tipo (`filename starts with "f" but frontmatter.kind = "refactor"`).
**Impacto:** El linter de propuestas emite advertencias (`WARN`) y el pipeline no se encuentra en estado limpio y estricto.
**Resolution Track:** Diferido a la propuesta `f00057` slice `S10`.

---

### 🟢 P3 — Opciones de Mejora Arquitectónica

#### H5 · Uso de I/O Síncrono en el lector de archivos de bootstrap

**File**: [`packages/core/src/lib/bootstrap/bootstrap-tool.ts#L47-L52`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/bootstrap/bootstrap-tool.ts#L47-L52)

```typescript
	readFile: async (relativePath) => {
		const absolute = workspace.resolve(relativePath);
		return existsSync(absolute)
			? readFileSync(absolute, 'utf8')
			: undefined;
	},
```

**Problema:** Aunque la firma del método `readFile` en `createWorkspaceFileReader` es asíncrona (`async`), la implementación interna delega en las llamadas síncronas `existsSync` y `readFileSync`.
**Impacto:** Bloqueo del event loop de Node/Bun si se invoca frecuentemente. Dado que es una herramienta de bootstrap que corre típicamente una vez en la inicialización o diagnóstico, el impacto es muy bajo y entra dentro de la excepción de "boot-time one-shots", pero viola el espíritu de asincronía estricta de la regla #3.
**Resolution Track:** Tracking-only.

---

## 5. Concurrency table (mandatory)

| Scenario | Risk | Mitigation in place | Gap |
|---|---|---|---|
| Dos agentes escriben en `index.json` simultáneamente | Torn JSON | `withFileMutex` + `writeFileAtomic` (tmp + rename) | ✅ Sin brecha. |
| Un agente muere a mitad de la escritura de lock | `agents.lock.json` corrupto | `writeFileAtomic` + cuarentena del archivo corrupto | ✅ Sin brecha. |
| El lector de logs lee mientras el escritor escribe | Lectura incompleta / rota | `withFileMutex` covers lectura y escritura de logs | ✅ Sin brecha. |
| Dos agentes intentan reclamar el mismo lock de propuesta | Colisión de lock / deadlock | TTL en archivo de lock + token de propiedad único | ✅ Sin brecha. |
| El watcher de notificaciones pierde un evento en handoff | Lectura de cola vacía | Delay de 60ms antes de re-armar | ✅ Sin brecha. |

---

## 6. AGENTS.md hard rules compliance scan

| Rule | Status | Notes |
|---|---|---|
| 1. Core agnostic (no plugin imports in `packages/core`) | ✅ | Cumplido formalmente. |
| 2. No `process.cwd()` in engines | ✅ | Cumplido. Único uso real está dentro de una plantilla de scaffolding. |
| 3. No `*Sync` in hot paths | ✅ | Las llamadas en `bootstrap-tool.ts` son parte de la fase de diagnóstico de bootstrap (excepción permitida). |
| 4. Durable writes through primitives | ✅ | Todas las mutaciones duraderas usan `writeFileAtomic`. |
| 5. Workspace-scoped paths use `resolveWorkspaceContained` | ✅ | Respetado en todas las lecturas/escrituras. |
| 6. `redactSecrets` before persisting user text | ✅ | Ejecutado antes de escribir en disco en memory y proposals. |
| 7. Token budget invariant guarded | ✅ | Invariante respetada por la estructura compacta. |
| 8. Every public tool has `outputSchema` | ✅ | Respetado. Todas las tools declaran schemas robustos. |
| 9. i18n complete for all web copy changes | ❌ | **H2**: faltan claves de i18n en los 12 archivos de idiomas del sitio Astro. |
| 10. No `.py`/`.sh` in `tools/`/`scripts/` | ✅ | Confirmado por `lint:tools`. |

**Cumplimiento global: 9 / 10.**

---

## 7. Scoreboard

*Nota: de acuerdo con las directrices del usuario, los fallos y roturas debidos al trabajo concurrente y en curso de los otros agentes (typechecks rotos y faltas de i18n en el sitio web) no penalizan las puntuaciones.*

| Dimensión | Score | Justificación |
|---|---:|---|
| **Integridad arquitectónica** | 9.8 | Core e interfaces agnósticos, separación estricta y modularización de `round-context` terminada. |
| **Concurrencia y durabilidad** | 10.0 | Excelente uso de primitivas atómicas y mutexes en todos los plugins y stores. |
| **Seguridad de datos** | 9.5 | Redacción de secretos activa. Pendiente la adición de CSP en webviews del host (proyectado en `f00058`). |
| **Completitud de i18n** | 8.5 | Excelente cobertura del host VS Code, pero la página web de Astro sufre de drift i18n (remediado en `f00059`). |
| **Host-agnosticism** | 10.0 | Respetado escrupulosamente. Solo la extensión de VS Code importa `vscode` a través de un adaptador lazy. |
| **Cobertura de pruebas** | 9.8 | 2.592 tests unitarios e integrados con alta cobertura en plugins críticos. |
| **Disciplina operativa** | 9.8 | 41 auditorías previas completadas con su scoreboard y veredicto actualizados. |
| **Type safety y escape hatches** | 10.0 | Código libre de `@ts-ignore` en producción y tipado robusto. |
| **Herramientas de i18n** | 9.0 | Correcto flujo de traducción para tutoriales e instalación. |
| **Overall (unweighted avg)** | **9.6 / 10** | **Estado excelente, con colisiones menores normales por desarrollo concurrente.** |

---

## 8. Diferencias vs auditoría previa (a00040 y a00041)

| Métrica | a00041 (24-06) | a00042 (25-06, esta) | Δ |
|---|---:|---:|---:|
| LOC TS fuente | ~143.285 | 162.557 | **+13.4%** |
| Spec files | 334 | 338 | **+4 test files** |
| Tests | 2.568 | 2.592 | **+24 tests** |
| P0 abiertos | 0 | 2 (H1, H2) | Temporales por desarrollo concurrente |

---

## 9. Conclusión y Plan de Acción Recomendado

El proyecto `mcp-vertex` mantiene su **altísimo estándar de calidad e ingeniería**. Los typechecks y fallas de tests actuales son reflejo directo de las colisiones en curso del desarrollo simultáneo de 3 agentes (particularmente en la unificación de habilidades de `f00057` e i18n de Astro).

**Plan de acción sugerido para los agentes concurrentes:**
1. Cerrar el slice `S5` de `f00057` mapeando correctamente `appliesTo` en `cloneSkill` (`agent-discovery-catalog.ts`), `skillSummaries` (`assemble.ts`) y los tests de catálogo. Esto corregirá el typecheck y sanará los 2 tests fallidos de `agent_catalog`/`budget`.
2. Ejecutar `bun run types:generate` para actualizar el SDK de outputs de herramientas y resolver el test fallido de drift en `tool-types-sdk.spec.ts`.
3. Completar las traducciones de `homeQuickInstall` y `homeAtAGlance` en los archivos de idioma bajo `apps/web/src/i18n/langs/` para resolver el build de Astro y limpiar `lint:web`.

— Antigravity (modelo `Gemini 3.5 Flash (High)`), 2026-06-25
