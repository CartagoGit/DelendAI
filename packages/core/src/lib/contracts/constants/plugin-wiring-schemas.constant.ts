import z from 'zod';

const PLUGIN_WIRING_POINT_ID_SCHEMA = z.enum([
	'tsconfig-base',
	'vitest-shared',
	'plugin-defaults',
	'publish-order',
	'preset-catalog',
	'catalog-regen',
]);

const PLUGIN_WIRING_EDIT_SCHEMA = z.object({
	path: z.string(),
	previous: z.string(),
	next: z.string(),
	noop: z.boolean(),
});

export const PLUGIN_WIRING_WRITE_SCHEMA = z.object({
	pointId: PLUGIN_WIRING_POINT_ID_SCHEMA,
	edits: z.array(PLUGIN_WIRING_EDIT_SCHEMA),
	wired: z.boolean(),
});

const PLUGIN_WIRING_POINT_SCHEMA = z.object({
	id: PLUGIN_WIRING_POINT_ID_SCHEMA,
	path: z.string(),
	wired: z.boolean(),
	summary: z.string(),
	remediation: z.string().optional(),
});

export const PLUGIN_WIRING_REPORT_SCHEMA = z.object({
	pluginId: z.string(),
	points: z.array(PLUGIN_WIRING_POINT_SCHEMA),
	loadDiagnostics: z.array(
		z.object({
			pluginId: z.string(),
			reason: z.string(),
			fixHint: z.string(),
		}),
	),
	fullyWired: z.boolean(),
	missing: z.array(PLUGIN_WIRING_POINT_ID_SCHEMA),
});
