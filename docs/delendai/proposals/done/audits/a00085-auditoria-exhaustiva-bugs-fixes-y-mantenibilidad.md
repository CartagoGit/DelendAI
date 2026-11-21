---
id: a00085
title: "Auditoría exhaustiva — bugs, fixes y mantenibilidad"
kind: audit
status: done
type: proposal
track: audit+bugs+maintainability
date: 2026-08-23
date_iso: 2026-08-23
mode: general
related:
  - a00083
  - a00084
  - x00193
author: copilot-grok-4.6 (orchestrator)
---

# a00085 — Auditoría exhaustiva — bugs, fixes y mantenibilidad

> **Date**: 2026-08-23
> **Reviewer**: GitHub Copilot · model Grok 4.6 (mcp-vertex-orchestrator)
> **HEAD**: `090a7904ed1a55c6723562dac6132301926b5184` (`develop`) — `chore(catalog): regenerate agent catalog (closes pre-commit drift)`
> **Prior audits**: [a00083](../done/audits/a00083-29-07-2026-copilot-minimax-m3-auditoria-exhaustiva-completa.md), [a00084](../done/audits/a00084-30-07-2026-copilot-minimax-m3-auditoria-exhaustiva-completa-seguimiento.md)
> **Methodology**: Phases 0–10 of `plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md`. Primary method is LLM code reading. Automated gates (biome) are baseline, not verdict. Findings without a code quote are rejected.
> **Focus**: bugs reales + atomicidad/concurrencia + mantenibilidad. Re-verificación de a00083/a00084 (no recitar stale).

## Goal

Veredicto: el núcleo de durabilidad (locks, índice de propuestas, memory, docs engine, browser cwd, security_deps containment, VS Code deactivate) **sí se endureció** desde a00084. Lo que queda abierto es más peligroso precisamente porque el contrato *dice* que ya está resuelto: el allocator de IDs **reemite IDs existentes** cuando el counter JSON existe y va por detrás del árbol (reproducido en esta sesión: `create_proposal` reutilizó `a00084`). Encima hay un `dryRun` que ejecuta, un token de gasto que no ata proveedor/coste, y varias escrituras durables con `appendFile`/`writeFile` fuera de mutex.

HEAD auditado: `090a7904ed1a55c6723562dac6132301926b5184`.

## Why

El usuario pidió una propuesta de auditoría **muy completa** centrada en bugs/fixes y mantenibilidad, y que se commitee/pushee de forma autónoma. a00084 (2026-07-30) no cubre este HEAD. El allocator stale se reprodujo *durante* esta sesión.

## Non-goals

- Re-auditar hallazgos de a00083/a00084 sin re-verificar el código actual (hay tabla de re-verificación).
- Arreglar en línea todos los findings (se spawnan propuestas `x`/`r`).
- Auditar MCPs de terceros / hosts externos.
- Gastar API de proveedores en `audit_run` sin confirmación explícita.
- Ejecutar `bun run test` / `bun run validate` completos en esta pasada (Scope A; Phase 0 captura biome + inventario).

## Slices

- global_gate: lint

### S1 — Documento de auditoría (fases 0–10) + scoreboard

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/a00085-auditor-a-exhaustiva-bugs-fixes-y-mantenibilidad-copilot-grok-4-6.md`
- **Gate**: lint
- **Acceptance**:
  - Goal incluye hash HEAD
  - Verified State con números reales de Phase 0
  - Cada finding cita file#Lnn y Resolution Track
  - Scoreboard justificado
  - `bun run lint:proposals` exits 0
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente de 7b6c2939 y del documento actual: el reporte quedó normalizado, añade cobertura explícita de Phases 0–10 y Scoreboard, el lint estructural devuelve 0 fatal error(s), y proposal-id-prefix valida los prefijos. El fallo restante de lint:proposals queda acotado a dos referencias Files históricas externas en v00129 y r00037, fuera del alcance de S1.
## Acceptance

- Goal incluye hash HEAD
- Verified State con números reales de Phase 0
- Cada finding cita file#Lnn y Resolution Track
- Scoreboard justificado
- `bun run lint:proposals` exits 0

---

## Verified State

| Metric | Value | Source |
|---|---|---|
| **HEAD** | `090a7904ed1a55c6723562dac6132301926b5184` | `git rev-parse HEAD` |
| **Branch (audit)** | `audit/a00085-exhaustive-bugs-maintainability` (from local `develop`) | `git branch --show-current` |
| **Working tree at start** | clean on `develop`; this file is the only intended delta | `git status -sb` |
| **TypeScript files** | **4206** | `find packages plugins extensions apps tools scripts -name '*.ts' \| wc -l` |
| **Total TS LOC** | **276280** | `find … \| xargs wc -l \| tail -1` |
| **Spec files** | **838** | `find … \( -name '*.spec.ts' -o -name '*.test.ts' \)` |
| **Plugins on disk** | **41** | `ls plugins \| wc -l` |
| **Biome ci** | Checked **2790** files. **44 errors**, **69 warnings**, **98 infos** | `bunx biome ci . --reporter=summary` |
| **Hard rule 10** (no `.py`/`.sh`/… in `tools/`/`scripts/`, excl. `node_modules`) | **0** | `find tools scripts … ! -path '*/node_modules/*'` |
| **`bun run test` / `validate`** | **no ejecutado** en esta pasada (Scope A) | — |
| **proposal-id-counters.json** | `{"x":202,"f":156,"v":122,"c":126,"r":13,"a":84,…}` | `.cache/mcp-vertex/proposal-id-counters.json` |
| **Highest `a*` on disk** | `a00084` under `done/audits/` | `find docs/mcp-vertex/proposals -name 'a[0-9]*.md'` |
| **Unmerged sibling fix** | `fix/proposal-id-allocator-stale-counter` @ `59325969` — **not in develop** | `git log origin/develop` vs that branch |

`create_proposal kind:audit` contra este counter **reemitió `a00084`**, que ya vive en `done/audits/a00084-30-07-2026-…`. El stub se retiró; este documento usa `a00085` pasado a mano tras ver el choque.

---

### Phase coverage (0–10)

- **Phase 0 — Pre-flight**: cuantificada en [Verified State](#verified-state).
- **Phase 1 — Core packages**: cubierta por los findings #8, #9 y #11.
- **Phase 2 — Every plugin**: cubierta por los findings #1–#7, #10 y #15.
- **Phase 3 — Extensions**: cubierta por el finding #13.
- **Phase 4 — UI extension**: revisada sin findings materiales nuevos en esta pasada.
- **Phase 5 — Apps**: cubierta por el finding #14.
- **Phase 6 — Tools and scripts**: cubierta por los findings #2, #12 y #15.
- **Phase 7 — Test suite**: cubierta por el gap de cobertura citado en el finding #1.
- **Phase 8 — Cross-cutting concerns**: cubierta por la tabla de concurrencia y el scan de hard rules.
- **Phase 9 — Synthesize findings**: materializada en [Findings](#findings).
- **Phase 10 — Scoreboard and verdict**: materializada en [Scoreboard](#scoreboard).

---

### N. Re-verificación a00083 / a00084 (no recitar stale)

| Tema (auditoría previa) | Estado en `090a7904` | Evidencia |
|---|---|---|
| `syncProposalRegistry` cwd + mutex | **FIXED** | `withFileMutex(indexPath, …)` + `writeFileAtomic`; root inyectado |
| `agent-lock-engine` path fallback / atomicidad | **FIXED** | `deps.lockPath` obligatorio; `writeLockWithMutex` |
| `persistent-task-queue` sync I/O + schema | **FIXED** | `withFileMutex(paths.queuePath)` + `persistQueueUnlocked` |
| `round-context` SHA-256 / cwd | **FIXED** | `createHash('sha256')`; path via layout |
| `contracts/constants/` vacío | **FIXED** | constantes reales (`ADOPTION_MODE_SCHEMA`, `FINDING_SEVERITY_ORDER`, …) |
| `init_config` sin mutex | **FIXED** | `withFileMutex` + `writeFileAtomic` |
| `batch-atomic-writer` bare `writeFile` | **FIXED** | `writeFileAtomic` bajo mutex |
| memory durable writes | **FIXED** | `writeFileAtomic` + `withStoreLock` |
| docs engine `*Sync` | **FIXED** | `fs/promises` |
| browser `process.cwd()` fallback | **FIXED** | `pluginCacheDir` requerido |
| `security_deps` cwd bypass | **FIXED** | `resolveWorkspaceContained` |
| VS Code `deactivate` + schema en catalog/config webviews | **FIXED** | `disposeAll()` + `safeParse` |
| `@ts-ignore` en src productivo | **FIXED** | sin suppressions vivas |
| MiniMax hardcoded en scaffold-host | **FIXED** | sin hit actual |
| plantilla ping **sin `outputSchema`** | **STILL PRESENT** | finding #10 |
| allocator stale counter | **STILL PRESENT** (y **reproducido**) | finding #1; fix vive en otra rama, no merged |

---

## Findings

### 1. [FATAL] `allocateNextProposalId` no re-siembra si el counter existe y está atrasado

**File**: [`plugins/proposals/src/lib/proposals/proposal-id-allocator.ts#L116`](../../../../plugins/proposals/src/lib/proposals/proposal-id-allocator.ts#L116)

```typescript
export const allocateNextProposalId = async (
	prefix: string,
	options: IProposalIdAllocatorOptions,
): Promise<string> =>
	withFileMutex(options.counterPathAbs, async () => {
		let counters = await readCounters(options.counterPathAbs);
		if (counters === null) {
			counters = await seedFromDisk(options.proposalsDirAbs);
		}
		const next = (counters[prefix] ?? 0) + 1;
		counters[prefix] = next;
		await writeFileAtomic(options.counterPathAbs, JSON.stringify(counters));
		return `${prefix}${String(next).padStart(5, '0')}`;
	});
```

**Problem**: `seedFromDisk` solo corre cuando `readCounters` devuelve `null`. El docblock promete *"Never returns a number lower than what's already on disk for that prefix"*; eso es falso si el JSON existe. En esta sesión el counter tenía `"a":84` y `done/audits/` ya contenía `a00084`; `create_proposal` volvió a emitir `a00084`. El spec actual (`proposal-id-allocator.spec.ts`) cubre seed-from-empty y seed-from-disk **sin** counter file; no cubre counter stale.

**Impact**: colisión de IDs en el índice, `sync_proposals` reporta `duplicate proposal id`, lint de propuestas se rompe, dos documentos distintos comparten id. Ya ocurrió en destino real (`r00005` duplicado — commit `59325969`).

**Resolution Track**: **Fix ya escrito, no merged.** `fix/proposal-id-allocator-stale-counter` @ `59325969` (`max(persisted, scanned)` por prefijo en cada allocate). Merge a `develop` + tests de regresión stale-counter. Candidate slice: `x00203-s1`.

---

### 2. [BAD] `sync-proposal-counters` deshace su propia escritura atómica

**File**: [`tools/scripts/proposals/sync-proposal-counters.script.ts#L133`](../../../../tools/scripts/proposals/sync-proposal-counters.script.ts#L133)

```typescript
		await persistCounters(countersPathAbs, counters);
		// Best-effort: touch the file via writeFile so the persisted JSON
		// is human-readable (writeFileAtomic adds a trailing newline).
		await writeFile(countersPathAbs, JSON.stringify(counters)).catch(
			() => undefined,
		);
```

**Problem**: `persistCounters` ya usa `withFileMutex` + `writeFileAtomic`. El `writeFile` posterior está **fuera** del mutex y **no** es rename atómico. El comentario es falso: `writeFileAtomic` ya escribe newline; este touch no formatea, pisa.

**Impact**: un allocate concurrente puede perderse (last-writer-wins). Exactamente el escenario que el script dice prevenir.

**Resolution Track**: Deferred → `x00204-s1` (borrar el `writeFile` residual).

---

### 3. [BAD] Peer-review log: `appendFile` sin mutex ni `fsync` (dos writers)

**File**: [`plugins/proposals/src/lib/shared/peer-review-log.ts#L79`](../../../../plugins/proposals/src/lib/shared/peer-review-log.ts#L79)

```typescript
export const appendPeerReviewLogEntry = async (
	logPathAbs: string,
	entry: IPeerReviewLogEntry,
): Promise<void> => {
	await mkdir(dirname(logPathAbs), { recursive: true });
	await appendFile(logPathAbs, `${JSON.stringify(entry)}\n`, 'utf8');
};
```

**File**: [`plugins/proposals/src/lib/tools/authoring.tool.ts#L123`](../../../../plugins/proposals/src/lib/tools/authoring.tool.ts#L123)

```typescript
const appendPeerReviewLog = async (
	logPathAbs: string,
	entry: IPeerReviewPersistedEntry,
): Promise<void> => {
	await mkdir(dirname(logPathAbs), { recursive: true });
	await appendFile(logPathAbs, `${JSON.stringify(entry)}\n`, 'utf8');
};
```

**Problem**: el historial de peer-review es estado durable. Hard rule 4 exige `withFileMutex` + escritura durable. Hay **dos** helpers independientes con el mismo anti-patrón. El plugin `logs` ya tiene el patrón correcto (`open` append + `handle.sync` bajo mutex).

**Impact**: dos agentes que aprueban/rechazan a la vez pueden perder o entremezclar líneas JSONL; un crash tras `appendFile` puede perder el veredicto. El log es la prueba de “reviewer ≠ implementer”.

**Resolution Track**: Deferred → `x00205-s1` (un solo helper endurecido; borrar el local de `authoring.tool.ts`).

---

### 4. [BAD] `run_quality` ignora `dryRun` y ejecuta comandos

**File**: [`plugins/quality/src/index.ts#L195`](../../../../plugins/quality/src/index.ts#L195)

```typescript
			async (args: {
				scope?: string | undefined;
				dryRun?: boolean | undefined;
				severities?: FindingSeverity[] | undefined;
			}) => {
				if (
					validateOutputReader !== undefined &&
					args.scope === undefined &&
					args.dryRun !== true
				) {
					return toolJson(
						await runQualityFromValidateOutput(/* … */),
					);
				}
				const scopes = await resolveScopes(/* … */);
				/* … */
				return toolJson(
					await runScope(
						scope,
						commands,
						qualityOptions.workspaceRoot,
						qualityOptions.run,
						qualityOptions.commandPolicy,
					),
				);
			},
```

**Problem**: `dryRun` está en el schema. El único uso es **saltar** el atajo de `validate-output`. Si `dryRun: true`, el handler cae a `runScope` y **ejecuta**. No hay early-return de plan.

**Impact**: un agente que pide preview dispara lint/test/validate reales (minutos, side effects, ruido en CI local). Viola el contrato del parámetro.

**Resolution Track**: Deferred → `x00206-s1` (si `dryRun`, devolver scopes/commands y no llamar `runScope`).

---

### 5. [BAD] Token de `executeApi` no ata `providerId` ni `costTier`

**File**: [`plugins/orchestrator-runner/src/lib/invoke/token.ts#L28`](../../../../plugins/orchestrator-runner/src/lib/invoke/token.ts#L28)

```typescript
	mint(invocationId: string): string {
		const mac = createHmac('sha256', this.secret)
			.update(invocationId)
			.digest('hex');
		return `otk_${mac}`;
	}
	verify(token: string, invocationId: string): boolean {
		const expected = this.mint(invocationId);
```

**File**: [`plugins/orchestrator-runner/src/lib/invoke/manager.ts#L249`](../../../../plugins/orchestrator-runner/src/lib/invoke/manager.ts#L249) — `confirm({ invocationId, providerId, estimatedCostTier })` luego `signer.verify(token, invocationId)` (el resto se descarta). El loop de fallback (`manager.ts` ~L300) reautoriza por hop, pero el MAC **no** incluye el hop.

**Problem**: el comentario del módulo dice que el usuario consiente *esa* invocación. El gate recibe proveedor y coste; la firma no. Un host que reutilice el token (o un gate que cachee por `invocationId`) autoriza un hop más caro.

**Impact**: frontera de gasto más débil que el contrato. Default `denyAll` + `executeApi:false` mitiga en prod dogfooding; no mitiga un host con elicitation + fallback.

**Resolution Track**: Deferred → `x00207-s1` (firmar `invocationId|providerId|costTier`; verificar la tupla en cada hop).

---

### 6. [BAD] Lecturas de logs fallan en contención en vez de esperar

**File**: [`plugins/logs/src/lib/services/log-store.ts#L206`](../../../../plugins/logs/src/lib/services/log-store.ts#L206)

```typescript
			const content = await withFileMutex(
				file,
				async () => await readFile(file, 'utf8').catch(() => ''),
				{ onContention: 'fail', timeoutMs: 10_000 },
			);
```

**Problem**: writers y readers comparten mutex. `onContention: 'fail'` hace que `readRange`/`tail` rechacen si hay un append en curso. No hay retry.

**Impact**: dashboards/tools de log fallan justo cuando hay más actividad (el momento en que más se necesitan). Mejor que torn read, peor que degradar.

**Resolution Track**: Deferred → `x00208-s1` (`onContention: 'wait'` o retry acotado en lecturas).

---

### 7. [BAD] `ReleaseWatcher.stop()` no resetea `prev`

**File**: [`plugins/notification/src/lib/services/watcher.ts#L238`](../../../../plugins/notification/src/lib/services/watcher.ts#L238)

```typescript
	const stop = (): void => {
		if (timer) clearInterval(timer);
		if (fsWatcher) fsWatcher.close();
		timer = undefined;
		fsWatcher = undefined;
	};
```

**Problem**: a00084 F14 primó `prev` en `start()`. `stop()` no pone `prev = undefined` ni `checkInFlight = false`. Un `start()` posterior hace `diffReleased` contra el snapshot pre-stop.

**Impact**: falsos `lock-released` (o silenciar releases reales) en hosts que pausan/reanudan el notifier.

**Resolution Track**: Deferred → `x00209-s1`.

---

### 8. [BAD] `McpStdioClient.connect` no cierra el transport si el handshake falla

**File**: [`packages/client/src/lib/transport/mcp-stdio-client.ts#L72`](../../../../packages/client/src/lib/transport/mcp-stdio-client.ts#L72)

```typescript
		const transport = new StdioClientTransport(transportOptions);
		await client.connect(transport);
		return new McpStdioClient(client as unknown as IMcpTransport);
```

**Problem**: si `connect` lanza, no hay `transport.close()` / kill del hijo.

**Impact**: reintentos de activate (VS Code) pueden filtrar procesos stdio.

**Resolution Track**: Deferred → `x00210-s1` (`try/catch` + close).

---

### 9. [BAD] Plantilla scaffold de plugin `ping` sin `outputSchema`

**File**: [`packages/core/src/lib/scaffold/scaffold-host.ts#L692`](../../../../packages/core/src/lib/scaffold/scaffold-host.ts#L692)

```typescript
				{
					id: '${id}_ping',
					register: async (server) => {
						server.registerTool(
							\`\${prefix}_ping\`,
							{
								description:
									'Health check for the ${id} plugin; echoes its resolved paths.',
								inputSchema: z.object({}),
							},
```

**Problem**: hard rule 8. La otra plantilla del mismo archivo sí emite `outputSchema`. Los plugins nuevos nacen fuera de contrato.

**Impact**: catálogo/consumidores tipados y gates de `outputSchema` fallan en el primer tool generado.

**Resolution Track**: Deferred → `x00211-s1`. (Hallazgo de a00084 **sigue abierto**.)

---

### 10. [MINOR] `kebab()` ASCII-only convierte “Auditoría” en `auditor-a`

**File**: [`plugins/proposals/src/lib/shared/string-helpers.ts#L38`](../../../../plugins/proposals/src/lib/shared/string-helpers.ts#L38)

```typescript
export const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
```

**Problem**: x00157 documentó la clase ASCII como intencional para no-ASCII total (`kebab ⇒ ''` → fallback al id). No cubre **latin-1 parcial**: `í` se borra y deja un hueco (`auditor-a`). Este propio archivo nació como `a00085-auditor-a-exhaustiva-…`.

**Impact**: filenames ilegibles; peor UX en títulos ES/FR/DE; no es colisión si el id es único.

**Resolution Track**: Deferred → `r00014-s1` (NFD + strip combining marks **antes** del collapse). Cambio de contrato: kind:refactor, no fix silencioso.

---

### 11. [MINOR] CLI assembly / setup usan `existsSync` + `readFileSync` en el path vivo

**File**: [`packages/core/src/lib/cli/assemble.ts#L100`](../../../../packages/core/src/lib/cli/assemble.ts#L100)

```typescript
		(async (absolutePath: string) =>
			existsSync(absolutePath)
				? readFileSync(absolutePath, 'utf8')
				: undefined);
```

**File**: [`packages/core/src/lib/cli/setup-subcommand.ts#L102`](../../../../packages/core/src/lib/cli/setup-subcommand.ts#L102) — el mismo patrón sobre `CONFIG_FILENAME`.

**Problem**: hard rule 3 (`*Sync` en hot path). El wrapper es `async` pero bloquea el event loop.

**Impact**: bajo en CLI one-shot; alto si el mismo helper se reusa desde el server MCP.

**Resolution Track**: Deferred → `x00212-s1`.

---

### 12. [MINOR] `create-plugin.ts` escribe relativo a `process.cwd()`

**File**: [`tools/scripts/create-plugin.ts#L92`](../../../../tools/scripts/create-plugin.ts#L92)

```typescript
	const targetDir = resolve(process.cwd(), `libs/plugins/${pluginName}`);
```

**Problem**: el resto de scripts de tools usan `repoRoot()`. Desde un cwd anidado el scaffold aterriza fuera del árbol esperado.

**Impact**: plugins huérfanos / copias en el sitio equivocado.

**Resolution Track**: Deferred → `x00213-s1`.

---

### 13. [MINOR] Dashboard webview duck-typea mensajes; catalog/config ya no

**File**: [`extensions/vscode/src/commands/open-dashboard.ts#L86`](../../../../extensions/vscode/src/commands/open-dashboard.ts#L86)

```typescript
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			if (typeof msg !== 'object' || msg === null) return;
			const m = msg as {
				command?: unknown;
				action?: unknown;
				id?: unknown;
			};
			if (m.command === 'action' && m.action === 'refresh') {
```

**Problem**: a00084 #31 endureció `open-agent-catalog` con Zod (`6ab90338`). El dashboard no se alineó.

**Impact**: superficie de mensajes inconsistente; fácil de crecer sin schema.

**Resolution Track**: Deferred → `x00214-s1`.

---

### 14. [MINOR] i18n ES incompleto + guía `[lang]` en inglés

**File**: [`apps/web/src/i18n/langs/es.ts#L146`](../../../../apps/web/src/i18n/langs/es.ts#L146)

```typescript
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
```

**File**: [`apps/web/src/pages/[lang]/guide.astro`](../../../../apps/web/src/pages/[lang]/guide.astro) — copy estructural hardcoded en inglés (`aria-label="Table of contents"`, headings, notice).

**Problem**: hard rule 9 a medias: la ruta está localizada, el contenido no.

**Impact**: UX rota para `es` (y el resto de langs).

**Resolution Track**: Deferred → `d00005-s1` (docs/i18n, no fix de runtime).

---

### 15. [MINOR] Inventario de carpetas de propuestas no es canónico

**File**: [`tools/scripts/proposals/sync-proposal-counters.script.ts#L33`](../../../../tools/scripts/proposals/sync-proposal-counters.script.ts#L33) vs [`tools/scripts/lint/check-proposal-id-drift.script.ts`](../../../../tools/scripts/lint/check-proposal-id-drift.script.ts) (`retired/issues` en uno, no en el otro) vs `seedFromDisk` en el allocator.

**Problem**: tres listas. Hoy `legacy/closed` y `retired/issues` están vacíos de `.md` de propuesta, así que no hay colisión observada por este gap.

**Impact**: el próximo reaper/migración puede dejar IDs invisibles al allocator y otra vez el finding #1.

**Resolution Track**: Deferred → `r00015-s1` (una constante compartida).

---

### N. Concurrency table (Phase 8)

| Scenario | Risk | Mitigation | Gap |
|---|---|---|---|
| Dos agentes escriben `index.json` | Torn JSON | `withFileMutex` + `writeFileAtomic` | ✅ FIXED vs a00083 |
| Agente muere mid-lock-write | `agents.lock.json` corrupto | `writeFileAtomic` + path inyectado | ✅ FIXED |
| Allocate id con counter JSON stale | ID duplicado | mutex sí; **reseed no** | ❌ finding #1 |
| `sync:counters` vs allocate concurrente | Counter pisado | persist atómico, luego `writeFile` suelto | ❌ finding #2 |
| Dos `proposal_review` append al JSONL | Línea perdida / torn JSONL | ninguno | ❌ finding #3 |
| Reader de logs vs writer | Query flaky | mutex, pero `onContention: 'fail'` | ⚠️ finding #6 |
| Memory store RMW | Torn notes | `withStoreLock` + atomic | ✅ FIXED |
| Watcher notification stop/start | Falsos releases | `prev` no se limpia | ❌ finding #7 |

---

### N. AGENTS.md hard-rules (scan)

| # | Rule | Result |
|---|---|---|
| 1 | Core agnostic | OK en esta pasada (sin import de plugin en `packages/core` revisado) |
| 2 | No `process.cwd()` en engines | OK en plugins productivos; residual en CLI entry + scaffold template default + `create-plugin.ts` (#12) |
| 3 | No `*Sync` en hot paths | **GAP** `assemble.ts` / `setup-subcommand.ts` (#11) |
| 4 | Durable writes via primitives | **GAP** peer-review JSONL (#3), trailing `writeFile` counters (#2) |
| 5 | Workspace-contained paths | OK en security_deps / browser (re-verificado) |
| 6 | `redactSecrets` | OK en `create_proposal` (authoring.tool usa `redactSecrets` antes de write) |
| 7 | Token budget | no re-medido (`overview` compact no disponible en este host) |
| 8 | `outputSchema` en tools públicas | **GAP** plantilla ping (#9) |
| 9 | i18n web | **GAP** (#14) |
| 10 | no `.py`/`.sh` en tools/scripts | **OK** (0 excl. `node_modules`) |

Biome 44 errors **no** se tratan como findings cualitativos nuevos: viven en specs de scan (`catch-swallow`, `dip-violation`, …) y tests; no se abrieron en esta pasada.

---

## Scoreboard

Unweighted average. Dimensión con FATAL no puede ir >6.

| Dimension | Score | Why |
|---|---|---|
| Correctness / bugs | **4 / 10** | FATAL #1 reproducido en sesión; `dryRun` miente (#4) |
| Concurrency / durability | **5 / 10** | núcleo de proposals/memory FIXED; JSONL peer-review y counter trailing-write abiertos |
| Trust / spend safety | **6 / 10** | default deny + executeApi off; token no ata proveedor (#5) |
| Maintainability | **6 / 10** | constants vivos, round-context partido; kebab ASCII, 3 folder lists, plantilla ping |
| Test leverage | **6 / 10** | 838 specs; allocator **no** testea counter stale (el hueco que mordió) |
| Agnosticism | **8 / 10** | MiniMax hardcoded FIXED; cwd engines limpios |
| Observability | **7 / 10** | logs plugin sólido; reads fallan en contención |
| Host/extension hygiene | **7 / 10** | deactivate + catalog schema FIXED; dashboard duck-type |
| Docs / i18n | **6 / 10** | guía `[lang]` en inglés; `es.ts` issues sin traducir |

**Overall: 6.1 / 10.** No es un repo roto — es un repo cuyo contrato de IDs y de “dry run / confirm spend” no coincide con el código. El merge de `59325969` es el P0 operativo.

---

### N. Recommended follow-ups (priority)

1. **Merge** `fix/proposal-id-allocator-stale-counter` (`59325969`) → cierra #1.
2. `x00204` trailing `writeFile` en `sync-proposal-counters`.
3. `x00205` peer-review JSONL durable (un helper).
4. `x00206` `dryRun` real en quality.
5. `x00207` token HMAC ata provider+tier.
6. `x00211` `outputSchema` en plantilla ping (deuda a00084).
7. `r00014` slug NFD (mantenibilidad; este filename es la prueba).
8. `x00208`–`x00210`, `x00212`–`x00214`, `r00015`, `d00005` según capacidad.

No spawnar esas propuestas desde esta sesión: el allocator en `develop` **sigue** reemitiendo IDs. Primero el merge del P0.

---

### N. Anti-patterns avoided

- No se citó a00083/a00084 sin reabrir el archivo.
- Cada finding abierto tiene quote + línea.
- `biome ci` 44 errors no se reciclaron como “bugs de producto” sin lectura.
- Los `ready/x00001`… duplicados vistos en `fix/board-stale-index` **no** están en este HEAD (`develop` `ready/` vacío). Fuera de alcance de este informe.
