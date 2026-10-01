import { definePlugin } from '@delendai/core/public';

import z from 'zod';

import {
	BUILTIN_MARKER_TABLE,
	mergeMarkerTable,
	type IEffectiveMarkerTable,
	type IMergeError,
} from './lib/markers';
import { UserMarkerConfigSchema } from './lib/markers-config';
import { buildCloseTools } from './lib/tools/close-tools';

/**
 * `@delendai/status-marker` — plugin that enforces the canonical
 * coloured close marker for every agent response.
 *
 * The plugin ships with three tools (`<prefix>_close`,
 * `<prefix>_validate`, `<prefix>_ping`) and a knowledge entry that
 * exposes the full 8-state table. Activation is opt-in via the loader:
 *
 *   `delendai --plugins=status-marker`
 *
 * See the status-marker proposal in `docs/delendai/proposals/done/feats/`
 * for the design rationale and the §4 gap analysis (the core currently
 * exposes no `onBeforePrompt` / `onAfterRespond` hook, so enforcement
 * today is **agent-driven**: the table + helper are exposed, but the
 * model must opt in. l105 will add the hooks.)
 */
const KNOWLEDGE_BODY = [
	'# Mandatory colored close',
	'',
	'Your last visible message MUST end literally with ONE single',
	'marker line, no further prose afterwards.',
	'',
	'## Canonical table (8 states)',
	'',
	'- 🟩 [HECHO] — proposal closed and reviewed.',
	'- 🟨 [CAP] — turn exhausted; checkpoint + relauncher remain (reason mandatory).',
	'- 🟧 [RE-PIVOT] — the cascade changed direction (reason mandatory).',
	'- 🟦 [CHECKPOINT-REQUIRED] — handoff to the orchestrator (reason mandatory).',
	'- 🟫 [REPAIR-NEEDED] — the verifier asked for repair (reason mandatory).',
	'- 🟥 [BLOQUEADO] — hard blocker; human intervention (reason mandatory).',
	'- 🟪 [SIN PROPUESTAS LIBRES] — catalog with all in_progress slots occupied.',
	'- ⬜ [SIN PROPUESTA DE NINGUN TIPO] — catalog empty of executables.',
	'',
	'## Format',
	'',
	'- Final line: `<marker>` alone, or `<marker> — <short-reason>`.',
	'- Separator: ` — ` (U+2014 with spaces).',
	'- The full line must be ≤ 120 characters (the helper truncates with `…`).',
	'- 5 states require a mandatory reason: CAP, BLOQUEADO, RE-PIVOT,',
	'  REPAIR-NEEDED, CHECKPOINT-REQUIRED.',
	'- If the reason is missing where it is mandatory, the helper inserts',
	'  the literal `<reason-missing>` — grep-able, indicates a violation.',
	'',
	'## How to produce the line',
	'',
	'Call `<prefix>_close { state, reason? }` and paste the returned',
	'`line` as the last visible line. Alternatively, import',
	'`formatCloseMarker(state, reason?)` from `@delendai/status-marker/public`.',
	'',
	'## How to audit your draft before sending',
	'',
	'Call `<prefix>_validate { text: <full draft> }`. It returns',
	'`{ ok: true, state }` or `{ ok: false, violations: [...] }`.',
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
	version: '0.1.1',
	describe:
		'Mandatory colored close: canonical 8-state table (extendable via config), close/validate/ping tools, knowledge entry.',
	optionsSchema: OptionsSchema,
	configExample: {
		summary:
			'Extend the marker table without forking the plugin: add, disable or override close states.',
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
					title: 'Mandatory colored close — canonical table',
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
