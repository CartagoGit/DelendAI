---
id: a00049
kind: audit
title: "Auditoría completa del proyecto — `@mcp-vertex/core` (modo general, 6 bandas)"
status: done
date: 2026-07-02T19:00:00Z
track: code-quality+concurrency+security+proposals+alignment
related:
    - a00048 # previous complete audit
    - f00094 # inherit-host-instructions tool proposal
date_iso: 2026-07-02
mode: general
projects: []
shipped-in: []
---

# 02-07-2026 · Auditoría completa del proyecto (modo general) — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría reevalúa el estado completo del monorepo tras la sesión de trabajo del 02-07-2026.
>
> HEAD auditado: `18c0913d` (Merge branch 'feat/f00094-inherit-host-instructions' into develop).
> Revisor: Antigravity (Gemini 3.5 Flash (High) — sesión actual).
> Estado de la suite de tests: ❌ Falla — 2 fallas / 3716 tests pasando (426 spec files).
> Biome linter (monorepo): 94 errores, 19 advertencias.
> Biome linter (vscode): 75 ficheros chequeados, 0 fixes necesarios.
> i18n gate (CLI/vscode): 12 idiomas × 94 comandos (CLI) y 12 idiomas × 150 keys (vscode), completo.

---

## 1. Veredicto (en una frase)

La suite de validación del proyecto se encuentra parcialmente rota debido a un problema de desincronización de rutas de archivos en los tests del nuevo comando `inherit_host_instructions` (f00094), el linter monorepo muestra 94 errores de estilo/calidad, mientras que la arquitectura, el aislamiento del host (`vscode` y core agnóstico) y las primitivas de concurrencia y atomicidad permanecen excelentes y robustas.

---

## 2. Estado verificado (Phase 0)

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `18c0913d` |
| 2 | `git status --short` | Working tree limpio |
| 3 | TS LOC total | **223,026 LOC** |
| 4 | Plugins activos | **13 plugins cargados, 0 plugin errors** |
| 5 | `bun run typecheck` | ✅ verde |
| 6 | `bun run test` | ❌ **2 fallas / 3718 tests** (en `inherit-host-instructions.tool.spec.ts`) |
| 7 | `bun run lint` (vscode + i18n) | ✅ 75 files, 0 fixes (vscode completo) |
| 8 | `bun tools/scripts/lint/cli-i18n.script.ts` | ✅ 12 idiomas cubren 94 comandos |
| 9 | `bun x biome ci .` | ❌ 94 errores, 19 warnings, 27 infos |
| 10 | `bun run build` | ✅ Éxito (0 errores) |

---

## 3. Hallazgos (Phase 9)

### 1. Test suite rota en `inherit_host_instructions` por reubicación del archivo de propuesta
**Fichero**: [`plugins/proposals/tests/src/lib/tools/inherit-host-instructions.tool.spec.ts#L121`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/tests/src/lib/tools/inherit-host-instructions.tool.spec.ts#L121) y [`L167`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/tests/src/lib/tools/inherit-host-instructions.tool.spec.ts#L167)

```typescript
	it('emits a ready proposal capturing a foreign in-repo file (scope tag in-repo)', async () => {
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(
					fakeRepoReader({ 'CLAUDE.md': 'ALWAYS run the linter first' }),
				),
			),
		);
		const res = parse(await handler({ workspaceRoot: '/ws/my-repo' }));

		expect(res.ok).toBe(true);
		expect(res.id).toMatch(/^f\d{5}$/);
		expect(res.files).toHaveLength(1);
		expect(res.file).toMatch(/^f\d{5}-inherit-host-instructions-.+\.md$/);

		const body = readFileSync(join(root, proposalsRel, res.file), 'utf8');
```

**Problemas**: 
1. Los tests asumen que el archivo markdown de la propuesta estará ubicado directamente en la raíz de la carpeta de propuestas (`join(root, proposalsRel, res.file)`). Sin embargo, `syncProposalRegistry` (que corre internamente en el tool handler) mueve automáticamente las propuestas en estado `ready` a la subcarpeta `ready/` (ej. `ready/f00001-...`).
2. El archivo de prueba de la sección "all" [`L167`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/tests/src/lib/tools/inherit-host-instructions.tool.spec.ts#L167) falla exactamente por el mismo motivo de `ENOENT`.

**Impacto**: El gate `bun run validate` y la suite `bun run test` fallan en la rama `develop`, impidiendo el cumplimiento de la Definición de Terminado (Definition of Done) en el monorepo.
**Resolución**: Modificar los tests para leer desde la subcarpeta correspondiente (ej. `join(root, proposalsRel, 'ready', res.file)`) o actualizar el tool para retornar la ruta final reubicada.
**Resolución Track**: Diferido a propuesta/fix en slice `x00092`.

---

### 2. Retorno de rutas stale (desactualizadas) en creadores de propuestas
**Fichero**: [`plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts#L313-L314`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts#L313-L314) y [`plugins/proposals/src/lib/tools/authoring.tool.ts#L258-L259`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/authoring.tool.ts#L258-L259)

```typescript
				const fileRel = `${id}-inherit-host-instructions-${workspaceHash}.md`;
				const absPath = join(options.proposalsDirAbs, fileRel);
				const { text: safeBody, redactions } = redactSecrets(body);
				await writeFileAtomic(absPath, safeBody);
				const sync = await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);

				return toolOk({
					scope,
					files: [fileRel],
					file: fileRel,
					path: absPath,
```

**Problema**: Los handlers de `inherit_host_instructions` y `create_proposal` escriben el archivo inicialmente en la carpeta raíz de propuestas, ejecutan `syncProposalRegistry` (que mueve el archivo a su subcarpeta correspondiente según su estado), y luego retornan los campos `file` y `path` apuntando a la ruta raíz original donde el archivo ya no existe.
**Impacto**: Los clientes MCP que consumen las respuestas de estas herramientas reciben rutas de archivos obsoletas e inexistentes, provocando que cualquier intento posterior del agente de leer el archivo mediante `fs_read` usando la ruta devuelta falle con `ENOENT`.
**Resolución**: Ajustar el retorno del handler para que apunte a la ruta reubicada real generada por el proceso de sincronización.
**Resolución Track**: Diferido a propuesta/fix en slice `x00092`.

---

### 3. Uso del método heredado `buildRulesManifest` en el arranque del plugin de reglas
**Fichero**: [`plugins/rules/src/index.ts#L124`](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/index.ts#L124)

```typescript
		// On boot: materialise the default presets and generate the
		// manifest if it does not exist yet. Never fail boot over this.
		try {
			const manifest = await buildRulesManifest({
				reader,
				projectName,
				cacheRelDir,
				mode,
				...(Object.keys(overrides).length > 0 ? { overrides } : {}),
			});
```

**Problema**: Durante el registro en boot del plugin de reglas (`plugins/rules/src/index.ts`), el manifiesto se construye usando el método legacy `buildRulesManifest` de `manifest.ts` en lugar del nuevo punto de composición SOLID `buildManifestViaComposition` que sí consumen los comandos en `rules-tools.ts`.
**Impacto**: Riesgo de inconsistencias o de regeneración redundante entre lo inicializado en boot y lo que posteriormente resuelven herramientas como `get_rules`, `check_rules` o `apply_rules` en tiempo de ejecución.
**Resolución**: Migrar el arranque del plugin para inicializar su manifiesto mediante la factoría de composición canónica.
**Resolución Track**: Diferido a propuesta/refactor en `r00008`.

---

### 4. Sobrecarga de tamaño de la respuesta compacta de `overview`
**Fichero**: [`packages/core/src/lib/tools/overview-tool.ts#L81`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/tools/overview-tool.ts#L81)

```typescript
export const buildOverviewToolRegistration = (
	corePrefix: string,
	buildSnapshot: () => IOverviewSnapshot,
): IToolRegistration => ({
	id: 'overview',
	summary: 'Get a comprehensive snapshot of the active MCP server config and tools.',
	tags: ['core', 'meta'],
```

**Problema**: El tamaño medido de la respuesta compacta de `overview` en nuestro entorno con 13 plugins cargados y 86 herramientas es de **4,102 bytes**, superando significativamente el límite de regresión de **1,600 bytes** establecido en el benchmark e2e de presupuestos. Aunque el e2e pasa en entornos aislados con menos herramientas, en producción el volumen es muy alto.
**Impacto**: Mayor consumo de tokens al inicio de la sesión del agente para su orientación básica.
**Resolución**: Optimizar `overview { compact: true }` para devolver una estructura de nombres de herramientas condensada (ej. omitir prefijos repetitivos o agrupar por plugin) o aumentar formalmente el presupuesto en `TOKEN-BUDGETS.md` reflejando el escalado real del preset general.
**Resolución Track**: Diferido a revisión arquitectónica general en `c00003`.

---

### 5. Nombres de herramientas desactualizados en el workflow playbook de propuestas
**Fichero**: [`plugins/proposals/skills/proposals-workflow-playbook/SKILL.md#L16-L27`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/skills/proposals-workflow-playbook/SKILL.md#L16-L27)

```markdown
mcp-vertex_overview { compact: true }
  -> proposals_auto_work {}
  -> proposals_continue_proposal { id, mode: "plan" }
```

**Problema**: El diagrama de flujo documentado en esta skill instruye a los agentes a invocar los comandos como `proposals_auto_work` en lugar de su identificador calificado en el registro real (`mcp-vertex_proposals_auto_work`).
**Impacto**: Los agentes que sigan la guía al pie de la letra intentarán invocar herramientas con nombres incorrectos, resultando en excepciones de herramienta no encontrada en el host.
**Resolución**: Actualizar la skill para incluir de forma clara el prefijo del espacio de nombres core (`mcp-vertex_`) en todos los comandos del flujo.
**Resolución Track**: Diferido a actualización documental en `d00004`.

---

## 4. Rúbrica de Concurrencia (Phase 8)

| Escenario | Riesgo | Mitigación | Brecha |
|---|---|---|---|
| Dos agentes escriben en `index.json` simultáneamente | JSON Corrupto | `withFileMutex` + `writeFileAtomic` | ✅ Mitigado |
| Agente muere a mitad de la escritura de un lock | Lock corrupto | `writeFileAtomic` de archivos JSON completos | ✅ Mitigado |
| El lector lee el log mientras se está escribiendo | Lectura parcial/rota | Mutex tanto para lecturas como para escrituras | ✅ Mitigado |

---

## 5. Tabla de puntuación final (Scoreboard - Phase 10)

| Dimensión | Puntuación | Justificación / Comentarios |
|---|---|---|
| **Arquitectura** | 9/10 | Excelente desacoplamiento de plugins, inicialización limpia en CLI, inyección hermética. |
| **Contratos e interfaces** | 9/10 | 100% de las herramientas declaran un `outputSchema` de Zod validable. |
| **Eficiencia de tokens** | 8/10 | Enfoque de catálogo regenerativo excelente, pero penalizado por el aumento de tamaño en `overview compact` (4.1KB). |
| **Anti-deadlock / concurrencia** | 9/10 | El uso de primitivas atómicas de escritura y mutex compartidos está totalmente generalizado y cubierto por tests de caos. |
| **Calidad de código fuente** | 6/10 | Penalizada por las dos fallas en la suite de tests en la rama principal (`develop`) de f00094. |
| **Documentación** | 9/10 | Mantenimiento de Skills muy detallado, aunque con discrepancias menores en los prefijos de herramientas. |
| **Tests (estructura, cobertura, calidad)** | 8/10 | Suite muy grande (>3700 tests en <45s), aunque la cobertura del test de `inherit_host_instructions` es deficiente al no simular la lectura post-sincronización. |
| **Seguridad operacional** | 9/10 | Gran uso de `resolveWorkspaceContained` y exclusión de secretos durables via `redactSecrets`. |
| **Genericidad (project-agnostic)** | 9/10 | Configuración limpia de carpetas custom (`extraFolders`) que evita fugas de vocabulario del host. |

**Nota final: 8.4/10 — Muy buen estado operativo, pero ensombrecido por una suite de tests rota tras la última fusión de f00094.**

---

## 6. Recomendaciones prioritarias (top 5)

| Prioridad | Acción | Archivo | Esfuerzo |
|---|---|---|---|
| 🔴 P0 | Corregir las rutas de assertions en `inherit-host-instructions.tool.spec.ts` y re-alinear el retorno de las herramientas de propuestas para apuntar a la ruta final en `ready/`. | `plugins/proposals/tests/src/lib/tools/inherit-host-instructions.tool.spec.ts` y `plugins/proposals/src/lib/tools/...` | S (3 h) |
| 🟠 P1 | Corregir los 94 fallos de formato del linter `biome` en el monorepo ejecutando `bun run lint:fix` para alinear el estilo de código. | Varios archivos del monorepo | S (1 h) |
| 🟡 P2 | Migrar la carga inicial del plugin de reglas a la composición SOLID (`buildManifestViaComposition`). | `plugins/rules/src/index.ts` | S (4 h) |
| 🟡 P2 | Corregir los identificadores de herramientas en la guía visual de `proposals-workflow-playbook`. | `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md` | XS (30 min) |
| 🟢 P3 | Modificar la estrategia de serialización o los presupuestos en `TOKEN-BUDGETS.md` para ajustar el tamaño de `overview compact` al monorepo real. | `docs/mcp-vertex/TOKEN-BUDGETS.md` | S (2 h) |
