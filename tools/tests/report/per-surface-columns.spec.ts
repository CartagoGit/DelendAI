import { describe, expect, it } from 'vitest';

import {
	buildPerSurfaceColumns,
	type IPerSurfaceColumn,
} from '../../scripts/report/token-budget-dashboard.script';

const row = (overrides: Record<string, unknown>) =>
	({
		presetId: 'minimal',
		title: 'Minimal',
		surfaceMode: 'native' as const,
		source: 'tokens-gate' as const,
		pluginCount: 0,
		toolCount: 0,
		toolsListBytes: 100,
		schemaBytes: 0,
		descriptionBytes: 0,
		inputSchemaBytes: 0,
		outputSchemaBytes: 0,
		maxPluginBytes: 0,
		overviewCompactBytes: null,
		roundContextBytes: null,
		loadErrors: [],
		ownerRows: [],
		...overrides,
	}) as unknown as Parameters<typeof buildPerSurfaceColumns>[0][number];

describe('buildPerSurfaceColumns (c00135)', () => {
	it('pairs adaptive and native rows of the same preset side-by-side', () => {
		const result = buildPerSurfaceColumns([
			row({
				presetId: 'minimal',
				surfaceMode: 'native',
				source: 'tokens-gate',
				toolsListBytes: 12_000,
			}),
			row({
				presetId: 'minimal',
				surfaceMode: 'adaptive',
				source: 'dynamic-client',
				toolsListBytes: 800,
			}),
		]);
		expect(result).toHaveLength(1);
		const col = result[0] as IPerSurfaceColumn;
		expect(col.presetId).toBe('minimal');
		expect(col.adaptiveBytes).toBe(800);
		expect(col.nativeBytes).toBe(12_000);
	});

	it('marks native status as breach when over hard ceiling', () => {
		// minimal.toolsList.hard is 64_000 by default; pick a value above.
		const result = buildPerSurfaceColumns([
			row({
				presetId: 'minimal',
				surfaceMode: 'native',
				toolsListBytes: 70_000,
			}),
		]);
		const col = result[0] as IPerSurfaceColumn;
		expect(col.nativeStatus).toBe('breach');
		expect(col.nativeDeficit).toMatch(/breach:/);
	});

	it('marks adaptive as n/a when only native rows are present', () => {
		const result = buildPerSurfaceColumns([
			row({
				presetId: 'minimal',
				surfaceMode: 'native',
				toolsListBytes: 1000,
			}),
		]);
		const col = result[0] as IPerSurfaceColumn;
		expect(col.adaptiveBytes).toBeNull();
		expect(col.adaptiveStatus).toBe('n/a');
		expect(col.nativeBytes).toBe(1000);
	});

	it('marks native as n/a when only adaptive rows are present', () => {
		const result = buildPerSurfaceColumns([
			row({
				presetId: 'minimal',
				surfaceMode: 'adaptive',
				source: 'dynamic-client',
				toolsListBytes: 500,
			}),
		]);
		const col = result[0] as IPerSurfaceColumn;
		expect(col.adaptiveBytes).toBe(500);
		expect(col.nativeBytes).toBeNull();
		expect(col.nativeStatus).toBe('n/a');
	});

	it('does not collapse deficits across surfaces', () => {
		const result = buildPerSurfaceColumns([
			row({
				presetId: 'minimal',
				surfaceMode: 'native',
				toolsListBytes: 70_000, // over hard
			}),
			row({
				presetId: 'minimal',
				surfaceMode: 'adaptive',
				source: 'dynamic-client',
				toolsListBytes: 500, // well under
			}),
		]);
		const col = result[0] as IPerSurfaceColumn;
		expect(col.nativeDeficit).not.toBeNull();
		expect(col.adaptiveDeficit).toBeNull();
	});
});
