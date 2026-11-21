import { describe, expect, it } from 'vitest';

import { buildPerSurfaceColumns } from './token-budget-dashboard.script';

describe('token-budget dashboard publication', () => {
	it('builds the per-surface summary without inventing missing measurements', () => {
		const rows = buildPerSurfaceColumns([
			{
				presetId: 'demo',
				title: 'demo',
				surfaceMode: 'adaptive',
				runtimeSurface: 'managed',
				source: 'dynamic-client',
				pluginCount: 1,
				toolCount: 1,
				toolsListBytes: 800,
				schemaBytes: 600,
				descriptionBytes: 80,
				inputSchemaBytes: 200,
				outputSchemaBytes: 400,
				maxPluginBytes: 600,
				overviewCompactBytes: 200,
				roundContextBytes: null,
				loadErrors: [],
				ownerRows: [],
				toolBreakdowns: [],
				tokenizerEstimates: [],
			},
			{
				presetId: 'demo',
				title: 'demo',
				surfaceMode: 'native',
				runtimeSurface: 'managed',
				source: 'tokens-gate',
				pluginCount: 1,
				toolCount: 1,
				toolsListBytes: 1200,
				schemaBytes: 900,
				descriptionBytes: 120,
				inputSchemaBytes: 300,
				outputSchemaBytes: 600,
				maxPluginBytes: 700,
				overviewCompactBytes: 220,
				roundContextBytes: 180,
				loadErrors: [],
				ownerRows: [],
				toolBreakdowns: [],
				tokenizerEstimates: [],
			},
		]);

		expect(rows).toEqual([
			{
				presetId: 'demo',
				adaptiveBytes: 800,
				adaptiveStatus: 'n/a',
				nativeBytes: 1200,
				nativeStatus: 'n/a',
				adaptiveDeficit: null,
				nativeDeficit: null,
			},
		]);
	});
});
