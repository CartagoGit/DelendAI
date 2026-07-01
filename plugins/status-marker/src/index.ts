import { definePlugin } from '@mcp-vertex/core/public';

import { z } from 'zod';

import {
	BUILTIN_MARKER_TABLE,
	mergeMarkerTable,
	type IEffectiveMarkerTable,
	type IMergeError,
} from './lib/markers';
import { UserMarkerConfigSchema } from './lib/markers-config';
import { buildCloseTools } from './lib/tools/close-tools';

/**
 * `@mcp-vertex/status-marker` — plugin that enforces the canonical
 * coloured close marker for every agent response.
 *
 * The plugin ships with three tools (`<prefix>_close`,
 * `<prefix>_validate`, `<prefix>_ping`) and a knowledge entry that
 * exposes the full 8-state table. Activation is opt-in via the loader:
 *
 *   `mcp-vertex --plugins=status-marker`
 *
 * See `docs/mcp-vertex/proposals/l104-feat-status-marker-plugin-de-cierre-obligatorio-coloreado.md`
 * for the design rationale and the §4 gap analysis (the core currently
 * exposes no `onBeforePrompt` / `onAfterRespond` hook, so enforcement
 * today is **agent-driven**: the table + helper are exposed, but the
 * model must opt in. l105 will add the hooks.)
 */
const KNOWLEDGE_BODY = [
	'# Cierre obligatorio coloreado',
	'',
	'Tu último mensaje visible DEBE terminar literalmente con UNA sola',
	'línea de marcador, sin prosa adicional después.',
	'',
	'## Tabla canónica (8 estados)',
	'',
	'- 🟩 [HECHO] — proposal cerrada y revisada.',
	'- 🟨 [CAP] — turno agotado; queda checkpoint + relanzador (razón obligatoria).',
	'- 🟧 [RE-PIVOT] — la cascada cambió de dirección (razón obligatoria).',
	'- 🟦 [CHECKPOINT-REQUIRED] — handoff al orquestador (razón obligatoria).',
	'- 🟫 [REPAIR-NEEDED] — el verifier pidió reparación (razón obligatoria).',
	'- 🟥 [BLOQUEADO] — hard blocker; intervención humana (razón obligatoria).',
	'- 🟪 [SIN PROPUESTAS LIBRES] — catálogo con in_progress todas ocupadas.',
	'- ⬜ [SIN PROPUESTA DE NINGUN TIPO] — catálogo vacío de ejecutables.',
	'',
	'## Formato',
	'',
	'- Línea final: `<marcador>` solo, o `<marcador> — <razon-corta>`.',
	'- Separador: ` — ` (U+2014 con espacios).',
	'- La línea completa ≤ 120 caracteres (el helper trunca con `…`).',
	'- 5 estados requieren razón obligatoria: CAP, BLOQUEADO, RE-PIVOT,',
	'  REPAIR-NEEDED, CHECKPOINT-REQUIRED.',
	'- Si falta la razón donde es obligatoria, el helper inserta literal',
	'  `<reason-missing>` — grep-able, indica violación.',
	'',
	'## Cómo producir la línea',
	'',
	'Llama a `<prefix>_close { state, reason? }` y pega el `line` devuelto',
	'como última línea visible. Alternativamente, importa',
	'`formatCloseMarker(state, reason?)` desde `@mcp-vertex/status-marker/public`.',
	'',
	'## Cómo auditar tu borrador antes de enviar',
	'',
	'Llama a `<prefix>_validate { text: <borrador completo> }`. Devuelve',
	'`{ ok: true, state }` o `{ ok: false, violations: [...] }`.',
].join('\n');

/**
 * `markers` block under `plugins.status-marker.options` (proposal f00071).
 * Optional — a host that declares nothing gets the built-in 8-state table.
 */
const OptionsSchema = z.object({
	markers: UserMarkerConfigSchema.optional(),
});

/** Type-guard for the structured merge-error envelope. */
const isMergeError = (
	value: IEffectiveMarkerTable | IMergeError,
): value is IMergeError => 'ok' in value && value.ok === false;

export default definePlugin({
	name: 'status-marker',
	version: '0.1.0',
	describe:
		'Cierre obligatorio coloreado: tabla canónica de 8 estados (extensible por config), herramientas close/validate/ping, knowledge entry.',
	optionsSchema: OptionsSchema,
	configExample: {
		summary:
			'Extiende la tabla de marcadores sin forkear el plugin: añade, desactiva o sobrescribe estados de cierre.',
		options: {
			markers: {
				add: [
					{
						id: 'REVIEW',
						emoji: '🟪',
						requiresReason: true,
						locales: { es: 'REVISIÓN', en: 'REVIEW' },
						instruction:
							'Close after a successful code review pass.',
					},
				],
			},
		},
	},
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options);
		const userMarkers = parsed.success ? parsed.data.markers : undefined;
		const merged = mergeMarkerTable(userMarkers);
		if (isMergeError(merged)) {
			// A misconfigured `markers` block is a hard boot error: the host
			// must fix its config rather than silently fall back to the
			// built-in table (which would hide the typo).
			throw new Error(
				`status-marker: invalid markers config — ${merged.error}${
					merged.detail !== undefined ? ` (${merged.detail})` : ''
				}`,
			);
		}
		const markerTable: IEffectiveMarkerTable =
			userMarkers === undefined ? BUILTIN_MARKER_TABLE : merged;

		const tools = buildCloseTools({
			namespacePrefix: ctx.namespacePrefix,
			cacheDir: ctx.pluginCacheDir,
			docsDir: ctx.pluginDocsDir,
			markerTable,
		});
		return {
			tools,
			knowledge: [
				{
					id: 'status-marker-table',
					title: 'Cierre obligatorio coloreado — tabla canónica',
					body: KNOWLEDGE_BODY,
				},
				{
					id: 'status-marker-states',
					title: 'Lista de estados (machine-readable)',
					body: JSON.stringify(markerTable.states, null, '\t'),
				},
			],
		};
	},
});
