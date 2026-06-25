---
id: a00036
status: done
type: proposal
track: audit+core+plugins+extensions+web+tools+skills+concurrency
date: 2026-06-23
kind: audit
title: Auditoría canónica del repositorio mcp-vertex — HEAD 6e1015e
related:
  - a00032
  - a00034
  - a00035
  - f00050
  - u00002
ownership: []
globalGate: validate
acceptance:
  - Goal incluye el HEAD auditado 6e1015e
  - Verified State resume los números reales de Phase 0
  - Cada finding incluye snippet real de código o documento y referencia file:line
  - Scoreboard cubre 9 dimensiones con justificación y promedio final a 1 decimal
  - No se abren slices internos; toda la remediación queda diferida a propuestas separadas
---

# a00036 — Auditoría canónica del repositorio mcp-vertex

## Goal

Auditoría exhaustiva del monorepo completo en el HEAD `6e1015e`, siguiendo el
playbook de `skills/audit-playbook/SKILL.md`. Este documento consolida la línea
base verificada de Phase 0, los hallazgos cualitativos de Phases 1-8, el
scoreboard de 9 dimensiones y la priorización de acciones. No contiene slices
internos: todas las correcciones se difieren a propuestas separadas.

## Verified State

| Métrica | Valor verificado |
|---|---|
| HEAD commit | `6e1015e` |
| Tests | 251 files / 1795 tests / 100% pass / 15.58s |
| Build | 20 packages ✓ |
| Biome | 27 errors + 18 warnings + 11 infos, todos fixable |
| LOC TypeScript | 126,772 en 1,171 archivos `.ts` |
| e2e specs | 10 en el repo; 5 bajo `plugins/proposals/tests/src/lib/e2e/` |

## Findings Summary

| ID | Banda | Área | Resumen | Resolución Track |
|---|---|---|---|---|
| EXT-01 | FATAL | extensions/vscode | `deactivate()` vacío no limpia recursos | `f00050` |
| TS-01 | FATAL | tools/scripts | import relativo roto en `plugin-tool-verify` | `f00050` |
| F-002 | FATAL | core | TOCTOU en `bootstrap-blueprint` | `f00050` |
| F-001 | MUY MAL | cli | `mcpv` no reenvía la mayoría de flags al server | `f00050` |
| F-003 | MUY MAL | core | `fs_write` expone `atomic: false` en tool público | `f00050` |
| F1 | MUY MAL | proposals | sync I/O en hot path del loop detector | `f00050` |
| F2 | MUY MAL | proposals | `PROHIBITED_NOTES_PATTERNS` con vocabulario host-específico | `f00050` |
| F3 | MUY MAL | proposals | recordatorio de rename hardcodea VS Code/Copilot/versiones | `f00050` |
| F-004 | MEJORABLE | docs | `TOKEN-BUDGETS.md` y gate ejecutable pueden divergir | `f00050` |
| F-005 | MEJORABLE | ui-extension | tabs del dashboard sin i18n | `f00050` |
| F4 | MEJORABLE | search plugin | `ctx.options as ...` sin `OptionsSchema` | `f00050` |
| F5 | MEJORABLE | docs plugin | `ctx.options as ...` sin `OptionsSchema` | `f00050` |
| F6 | MEJORABLE | deps plugin | `ctx.options as ...` sin `OptionsSchema` | `f00050` |
| F7 | MEJORABLE | git plugin | `ctx.options as ...` sin `OptionsSchema` | `f00050` |
| F8 | MEJORABLE | web-fetch plugin | `ctx.options as ...` sin `OptionsSchema` | `f00050` |
| F9 | MEJORABLE | proposals plugin | `proposalFolders` usado sin declararse en schema | `f00050` |
| WEB-01 | MEJORABLE | apps/web | páginas con strings visibles hardcodeadas fuera de i18n | `f00050` |
| WEB-02 | MEJORABLE | apps/web | `check-i18n` no escanea `.astro` ni componentes | `f00050` |
| SK-01 | MEJORABLE | skills | skills referencian nombres de tool sin namespace real | `f00050` |
| SK-02 | MEJORABLE | skills | skill de auditoría apunta a ruta vieja de `brief.ts` | `f00050` |
| SK-03 | MEJORABLE | skills | dos skills duplican el mismo flujo proposals | `f00050` |
| TEST-1 | MEJORABLE | proposals tests | motores >300 LOC con muy pocos specs | `f00050` |
| TEST-2 | MEJORABLE | proposals tests | `loop-detector-service` sigue infracubierto para su criticidad | `f00050` |
| CONC-1 | MEJORABLE | proposals concurrency | `git worktree add` no coordina con `syncProposalRegistry` | `u00002` |
| CONC-2 | MEJORABLE | core concurrency | scaffold sin mutex de conjunto | `f00050` |

## Findings

### EXT-01 — `deactivate()` vacío en la extensión VS Code

**File**: [/home/cartago/_projects/mcp-vertex/extensions/vscode/src/extension.ts#L226](#/home/cartago/_projects/mcp-vertex/extensions/vscode/src/extension.ts#L226)

```ts
export const deactivate = async (): Promise<void> => {};
```

**Problema**: `activate()` registra comandos, listeners y `Disposable`s, pero
el ciclo de cierre no limpia explícitamente el cliente stdio ni otros recursos
propios del proceso. En recargas de ventana, esto deja un leak acumulativo.

**Impacto**: pérdida de recursos en cada reload/desactivación de la extensión.

**Resolución Track**: `f00050`.

### TS-01 — import relativo roto en `plugin-tool-verify`

**File**: [/home/cartago/_projects/mcp-vertex/tools/scripts/verify/plugin-tool-verify.script.ts#L58](#/home/cartago/_projects/mcp-vertex/tools/scripts/verify/plugin-tool-verify.script.ts#L58)

```ts
const importPlugin = (name: string) => async () => {
	const mod = await import(`../../plugins/${name}/src/index.ts`);
	return { default: mod.default };
};
```

**Problema**: desde `tools/scripts/verify/`, `../../plugins/...` resuelve a
`tools/plugins/...`, no a la raíz del workspace. El script no puede importar
plugins reales en su forma actual.

**Impacto**: la harness de verificación puede romperse o dar falsos negativos.

**Resolución Track**: `f00050`.

### F-002 — TOCTOU en `prepareServerBlueprintOnStart`

**File**: [/home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L485](#/home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L485)

```ts
const absPath = join(args.workspace, relPath);
if (existsSync(absPath)) return { written: false, path: relPath };
...
await mkdir(dirname(absPath), { recursive: true });
await writeFile(
	absPath,
	`${JSON.stringify({ generatedAt: new Date().toISOString(), blueprint }, null, '\t')}\n`,
	'utf8',
);
```

**Problema**: hay check-then-write sin exclusión mutua ni escritura atómica.
Dos scaffolds simultáneos pueden decidir que el archivo no existe y escribirlo
en carrera.

**Impacto**: blueprint inconsistente o overwritten en arranques concurrentes.

**Resolución Track**: `f00050`.

### F-001 — el CLI humano no reenvía la mayoría de flags al server

**File**: [/home/cartago/_projects/mcp-vertex/packages/cli/src/lib/server-args.ts#L1](#/home/cartago/_projects/mcp-vertex/packages/cli/src/lib/server-args.ts#L1)

```ts
export const buildServerArgs = (
	globals: ICliGlobalOptions,
	extraPlugins: readonly string[] = [],
): string[] => {
	const args = ['__serve', '--workspace', globals.workspace];
	if (globals.config !== undefined) args.push('--config', globals.config);
	if (globals.preset !== undefined) args.push('--preset', globals.preset);
	const plugins = [...new Set([...globals.plugins, ...extraPlugins])];
	if (plugins.length > 0) args.push('--plugins', plugins.join(','));
	return args;
};
```

**Problema**: solo se reenvían `workspace`, `config`, `preset` y `plugins`.
Flags como `--name`, `--serverVersion`, `--prefix`, `--verbose`, `--check`,
`--doctor`, `--mcp-project-create`, `--mcp-project-tests`, `--cacheDir`,
`--docsDir`, `--exclude-plugins` y el namespace prefix se pierden.

**Impacto**: el binario humano `mcpv` no expone el contrato completo del server.

**Resolución Track**: `f00050`.

### F-003 — `fs_write` permite desactivar atomicidad

**File**: [/home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/fs-tools.ts#L124](#/home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/fs-tools.ts#L124)

```ts
if (atomic) {
	await withFileMutex(contained.abs, () =>
		writeFileAtomic(contained.abs, content),
	);
} else {
	await writeFile(contained.abs, content, 'utf8');
}
```

**Problema**: el tool público ofrece un escape hatch `atomic: false` que
anula la garantía de durable writes del propio repo.

**Impacto**: un LLM o host puede saltarse la invariancia de atomicidad.

**Resolución Track**: `f00050`.

### F1 — sync I/O en el hot path del loop detector

**Files**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L513](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L513) y [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L122](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L122)

```ts
if (existsSync(this.lockPath)) {
	const raw = readFileSync(this.lockPath, 'utf8');
```

```ts
interactiveAgentPatterns: [
	'*-default',
	'default-*',
	'host',
	'interactive',
],
```

**Problema**: el detector usa `existsSync` y `readFileSync` en una ruta que
se ejecuta inline tras tool calls. AGENTS.md prohíbe sync I/O en hot paths.

**Impacto**: bloqueo del event loop y drift respecto al contrato de arquitectura.

**Resolución Track**: `f00050`.

### F2 — `proposal-scaffold-linter` contiene texto host-específico

**File**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts#L124](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts#L124)

```ts
[
	'🌐 w3 — sitio web profesional (pending — spec completo, esto es el punto de continuación)',
	'notes',
],
[
	'🔍 auditoría independiente 17-06 (copilot · minimax-m3) — integrada',
	'notes',
],
```

**Problema**: el runtime de un plugin project-agnostic codifica frases y
referencias específicas del repo/host/modelo.

**Impacto**: fuga de vocabulario local y peor portabilidad del plugin.

**Resolución Track**: `f00050`.

### F3 — recordatorio de rename hardcodea host y versiones

**File**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/chat-titling-reminder.ts#L149](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/chat-titling-reminder.ts#L149)

```ts
'The chat title in the VS Code sidebar is auto-derived from the first',
'prompt. This conversation is not in a state where the orchestrator can',
'rename it programmatically (no `workbench.action.chat.rename` in',
'VS Code 1.123 / Copilot Chat 0.43). To give this chat a meaningful',
```

**Problema**: el plugin asume host, UI y versiones concretas en un mensaje de
runtime, lo que se volverá stale con upgrades.

**Impacto**: drift silencioso y menor agnosticismo del plugin.

**Resolución Track**: `f00050`.

### F-004 — `TOKEN-BUDGETS.md` puede divergir del gate real

**File**: [/home/cartago/_projects/mcp-vertex/docs/TOKEN-BUDGETS.md#L24](#/home/cartago/_projects/mcp-vertex/docs/TOKEN-BUDGETS.md#L24)

```md
| Payload | Budget (bytes) |
|---|---:|
| `overview` full | 7 000 |
| `overview` compact | 1 600 |
| `auto_work` | 1 600 |
```

**Problema**: el presupuesto está duplicado en doc y test/gate. Si cambia uno
sin el otro, la documentación queda stale.

**Impacto**: operadores y agentes pueden trabajar con límites incorrectos.

**Resolución Track**: `f00050`.

### F-005 — dashboard sin i18n en tabs y copy visible

**File**: [/home/cartago/_projects/mcp-vertex/packages/ui-extension/src/dashboard/render-dashboard.ts#L30](#/home/cartago/_projects/mcp-vertex/packages/ui-extension/src/dashboard/render-dashboard.ts#L30)

```ts
const TABS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'metrics', label: 'Metrics' },
	{ id: 'tokens', label: 'Tokens' },
	{ id: 'tools', label: 'Tools' },
	{ id: 'plugins', label: 'Plugins' },
```

**Problema**: el dashboard host-agnostic renderiza labels visibles en inglés
hardcodeado fuera de un sistema de traducción.

**Impacto**: drift con la política de i18n completa del proyecto.

**Resolución Track**: `f00050`.

### F4-F8 — plugins con `ctx.options as ...` y sin `OptionsSchema`

**Files**: [/home/cartago/_projects/mcp-vertex/plugins/search/src/index.ts#L17](#/home/cartago/_projects/mcp-vertex/plugins/search/src/index.ts#L17), [/home/cartago/_projects/mcp-vertex/plugins/docs/src/index.ts#L17](#/home/cartago/_projects/mcp-vertex/plugins/docs/src/index.ts#L17), [/home/cartago/_projects/mcp-vertex/plugins/deps/src/index.ts#L21](#/home/cartago/_projects/mcp-vertex/plugins/deps/src/index.ts#L21), [/home/cartago/_projects/mcp-vertex/plugins/git/src/index.ts#L25](#/home/cartago/_projects/mcp-vertex/plugins/git/src/index.ts#L25), [/home/cartago/_projects/mcp-vertex/plugins/web-fetch/src/index.ts#L28](#/home/cartago/_projects/mcp-vertex/plugins/web-fetch/src/index.ts#L28)

```ts
const opts = ctx.options as {
	roots?: string[];
	extensions?: string[];
	ignoreDirs?: string[];
	maxResults?: number;
};
```

```ts
const o = ctx.options as { allowList?: unknown };
```

**Problema**: cinco plugins consumen configuración por cast en runtime sin un
schema declarativo validable desde config file.

**Impacto**: errores tardíos, sin validación temprana ni mensajes estructurados.

**Resolución Track**: `f00050`.

### F9 — `proposalFolders` se consume sin declararse en schema

**File**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/index.ts#L124](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/index.ts#L124)

```ts
const extraProposalFolders = Array.isArray(ctx.options.proposalFolders)
	? (ctx.options.proposalFolders as string[])
	: [];
```

**Problema**: el plugin lee `proposalFolders` pero no lo declara en su
`OptionsSchema`, de modo que la config no se valida de extremo a extremo.

**Impacto**: configuración aceptada de facto pero no contractual.

**Resolución Track**: `f00050`.

### WEB-01 — páginas `.astro` con strings visibles fuera del sistema i18n

**Files**: [/home/cartago/_projects/mcp-vertex/apps/web/src/pages/guide.astro#L42](#/home/cartago/_projects/mcp-vertex/apps/web/src/pages/guide.astro#L42), [/home/cartago/_projects/mcp-vertex/apps/web/src/pages/capabilities.astro#L9](#/home/cartago/_projects/mcp-vertex/apps/web/src/pages/capabilities.astro#L9), [/home/cartago/_projects/mcp-vertex/apps/web/src/pages/[lang]/capabilities.astro#L24](#/home/cartago/_projects/mcp-vertex/apps/web/src/pages/[lang]/capabilities.astro#L24)

```astro
<Base
	lang={lang}
	title={`Guide — @mcp-vertex/core`}
	description="A detailed walkthrough of the @mcp-vertex/core project: concepts, install, config, plugins, quality gates, extending, FAQ."
>
```

```astro
<Base
	lang={lang}
	title={`${t.plugins.title} · ${t.tools.title} — @mcp-vertex/core`}
	description="A per-plugin breakdown of every tool, prompt, resource and knowledge entry exposed by the mcp-vertex core + plugins."
>
```

**Problema**: hay títulos y descripciones visibles que no salen del catálogo de
i18n, tanto en la página inglesa como en la localizada.

**Impacto**: la web no cumple i18n real aunque el diccionario esté completo.

**Resolución Track**: `f00050`.

### WEB-02 — `check-i18n` no escanea páginas/componentes

**File**: [/home/cartago/_projects/mcp-vertex/apps/web/scripts/check-i18n.ts#L1](#/home/cartago/_projects/mcp-vertex/apps/web/scripts/check-i18n.ts#L1)

```ts
/**
 * i18n completeness gate.
 *
 * Enforces the maintenance rule: every UI string must be translated into EVERY
 * supported language.
 * ...
 * Additionally, every catalogue entry that opted in via
 * `apps/web/src/i18n/tools/index.ts` (per-tool i18n) must carry 12-lang
 * `description`.
 */
```

**Problema**: el script valida diccionarios y catálogo de tools, pero no escanea
strings hardcodeadas en `.astro`, componentes ni tutoriales.

**Impacto**: falsas sensaciones de cobertura del gate de i18n.

**Resolución Track**: `f00050`.

### SK-01 — skills con nombres de tool sin namespace real

**Files**: [/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-failure-modes/SKILL.md#L13](#/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-failure-modes/SKILL.md#L13), [/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-operator/SKILL.md#L78](#/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-operator/SKILL.md#L78), [/home/cartago/_projects/mcp-vertex/skills/state-repair-playbook/SKILL.md#L70](#/home/cartago/_projects/mcp-vertex/skills/state-repair-playbook/SKILL.md#L70)

```md
or pick a different file-disjoint slice from `proposal_board`.
```

```md
specific tool (`proposal_board`, `state_health`) only when you actually
need the verbose detail it omits.
```

```md
`state_health` immediately after a clean `proposals_close_slice` call
should report `healthy: true`
```

**Problema**: las skills mezclan formas namespaced y no namespaced. En el repo,
los nombres reales expuestos por proposals llevan prefijo.

**Impacto**: instrucciones operativas incorrectas o ambiguas para agentes.

**Resolución Track**: `f00050`.

### SK-02 — skill de auditoría apunta a una ruta vieja

**File**: [/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-audit-runner/SKILL.md#L57](#/home/cartago/_projects/mcp-vertex/skills/mcp-vertex-audit-runner/SKILL.md#L57)

```md
`plugins/audit/src/lib/brief.ts`):
```

**Problema**: la skill referencia una ruta histórica. Tras el refactor de
a00032, el servicio canónico vive en `plugins/audit/src/lib/services/audit-brief.service.ts`.

**Impacto**: drift documental en una skill central del workflow de auditoría.

**Resolución Track**: `f00050`.

### SK-03 — dos skills duplican el mismo flujo proposals

**Files**: [/home/cartago/_projects/mcp-vertex/skills/proposal-swarm-runner/SKILL.md#L1](#/home/cartago/_projects/mcp-vertex/skills/proposal-swarm-runner/SKILL.md#L1), [/home/cartago/_projects/mcp-vertex/skills/proposals-workflow-playbook/SKILL.md#L1](#/home/cartago/_projects/mcp-vertex/skills/proposals-workflow-playbook/SKILL.md#L1)

```md
# proposal swarm runner
```

```md
# proposals workflow playbook
```

**Problema**: ambos documentos describen el mismo circuito canónico
`overview -> auto_work -> continue_proposal -> agent_lock -> close_slice -> sync`.

**Impacto**: mantenimiento duplicado y riesgo de drift entre playbooks.

**Resolución Track**: `f00050`.

### TEST-1 — varios motores grandes siguen infracubiertos

**Files**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L1](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L1), [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts#L1](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts#L1), [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L1](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L1)

```ts
export interface IPersistentTaskQueue {
	readonly version: 1;
	entries: IPersistentTaskEntry[];
}
```

**Problema**: los conteos verificados son `persistent-task-queue` 843 LOC con 1
spec, `proposal-scaffold-linter` 881 LOC con 1 spec y `proposal-parallelism`
328 LOC con 2 specs. Según el playbook, >300 LOC debería tener al menos 3 specs.

**Impacto**: baja confianza en zonas críticas del orquestador.

**Resolución Track**: `f00050`.

### TEST-2 — `loop-detector-service` sigue corto para su criticidad

**File**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L300](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/loop-detector-service.ts#L300)

```ts
// `isAgentStuck` (called inline from core on every tool
// call) can serve from memory within the TTL window.
this.lockCache = { agent, mtimeMs: Date.now() };
return agent;
```

**Problema**: el servicio mide 704 LOC en el árbol actual y solo tiene 1 spec
dedicado. Es una pieza de control crítico del swarm y merece batería más amplia.

**Impacto**: riesgo desproporcionado en una ruta de coordinación central.

**Resolución Track**: `f00050`.

### CONC-1 — `agent-worktree-engine` no coordina con `syncProposalRegistry`

**File**: [/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/agent-worktree-engine.ts#L172](#/home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/agent-worktree-engine.ts#L172)

```ts
const result = await run(addArgs);
if (!result.ok) {
	return {
		ok: false,
		action: 'create',
		reason: result.reason ?? 'git worktree add failed',
	};
}
```

**Problema**: la creación del worktree opera directa contra git sin coordinarse
con el sync del registry; eso abre una ventana a estado stale alrededor de `.git/index`.

**Impacto**: incoherencia transitoria en escenarios multiagente.

**Resolución Track**: `u00002`.

### CONC-2 — scaffold sin mutex de conjunto

**File**: [/home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-tool.ts#L276](#/home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-tool.ts#L276)

```ts
try {
	await writeFileAtomic(absolute, file.content);
	written.push(file.path);
} catch (error) {
	errors.push(
		`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
	);
}
```

**Problema**: cada archivo se escribe de forma atómica, pero no existe un lock
que abarque toda la operación de scaffold como unidad.

**Impacto**: dos scaffolds concurrentes pueden dejar un árbol mixto/inconsistente.

**Resolución Track**: `f00050`.

## Positives

- Regla 1: `packages/core/src/` no importa de `plugins/*`.
- Regla 4: memory, proposals y logs usan `withFileMutex` + `writeFileAtomic`.
- Regla 6: stores persistentes aplican `redactSecrets`.
- Regla 8: todos los tools públicos declaran `outputSchema`.
- Regla 10: no hay `.py/.sh/.bash/.zsh` en `tools/` ni `scripts/`.
- `packages/ui-extension` no importa de `vscode`.
- `load-plugins.ts` degrada gracefully y solo aborta por `dependsOn` roto.
- `notification-logs-bridge` acota memoria a 200 entradas FIFO.
- `ConnectionHealthService` emite eventos, no respawnea en silencio.
- `create-mcp-project` no es placeholder.
- `index.json`, `agents.lock.json` y `log-store.ts` usan disciplina durable.
- `auto_work` y `continue_proposal` no hacen double-claim.

## Scoreboard

> Bandas: FATAL / MUY MAL / MEJORABLE / OK / MUY BIEN / PERFECTO.
> Regla aplicada: una dimensión con un finding FATAL no puede superar 6/10.

| Dimensión | Score | Justificación |
|---|---:|---|
| Seguridad de concurrencia y escrituras | 5.8 | Tiene un FATAL (`F-002`) y dos gaps de concurrencia (`CONC-1`, `CONC-2`). La base durable es buena, pero la coordinación multi-operación no está cerrada. |
| Experiencia de extensión/host | 5.7 | `EXT-01` impone techo por FATAL; además hay hardcodes de host en proposals (`F3`). |
| Tooling y scripts | 5.9 | `TS-01` bloquea confiar en la harness de verificación; además hay drift entre doc y gate (`F-004`). |
| CLI y ergonomía operativa | 4.8 | `F-001` recorta de forma seria la superficie del CLI humano frente al server real. |
| Agnosticismo de plugins | 4.9 | `F2`, `F3`, `F4-F9` muestran que varios plugins siguen filtrando detalles host-específicos o aceptando config sin contrato fuerte. |
| i18n y UX web/ui | 6.0 | `F-005`, `WEB-01` y `WEB-02` degradan cobertura, pero no rompen la app. Hay buena base de 12 idiomas. |
| Calidad documental y skills | 6.4 | `SK-01`, `SK-02`, `SK-03` son drift real, aunque de remediación directa. |
| Cobertura de tests | 5.6 | 1795 tests y 251 files pasan, pero `TEST-1` y `TEST-2` dejan zonas grandes y críticas infracubiertas; no hay e2e del lifecycle completo. |
| Arquitectura base e invariantes | 7.8 | La base del repo sigue fuerte: core agnóstico, durable writes en stores, redacción de secretos y `outputSchema` universales. Penaliza el escape hatch `F-003` y el sync I/O `F1`. |

**Veredicto global**: `(5.8 + 5.7 + 5.9 + 4.8 + 4.9 + 6.0 + 6.4 + 5.6 + 7.8) / 9 = 5.9 / 10`.

Banda global: **MEJORABLE**.

## Top 5 Actions

1. Cerrar los tres FATALs primero: implementar `deactivate()`, corregir la ruta de import en `plugin-tool-verify` y envolver `bootstrap-blueprint` en exclusión mutua + write atómico. Track principal: `f00050`.
2. Eliminar los escapes a garantías del core: retirar `atomic: false` del tool público y mover el loop detector fuera de sync I/O de hot path. Track principal: `f00050`.
3. Formalizar schemas de opciones en `search`, `docs`, `deps`, `git`, `web-fetch` y declarar `proposalFolders` en proposals. Track principal: `f00050`.
4. Cerrar el gap de i18n real: mover strings de dashboard/web al sistema de traducción y extender `check-i18n` para escanear `.astro` y componentes. Track principal: `f00050`.
5. Subir la cobertura del orquestador y coordinar operaciones multiagente: añadir specs a `persistent-task-queue`, `proposal-scaffold-linter`, `proposal-parallelism`, `loop-detector-service`, y gatear `agent-worktree` frente a sync de registry. Tracks: `f00050` y `u00002`.

## No Internal Slices

Este reporte no abre slices internos. Toda remediación queda diferida a
propuestas separadas, en especial `f00050` para quick wins transversales y
`u00002` para el gate/coordinación de `agent-worktree`.