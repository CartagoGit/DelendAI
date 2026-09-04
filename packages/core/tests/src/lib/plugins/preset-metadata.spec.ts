import { describe, expect, it } from 'vitest';

import { PRESET_KIND } from '@delendai/core/public';

import {
	buildPresetMetadataSource,
	normalizeMeasuredAt,
	orderPresetMetadataEntries,
	PRESET_METADATA_IDS,
	type IGeneratedPresetEntry,
} from '../../../../../../tools/scripts/generate/preset-metadata.script';

const makeEntry = (
	presetId: (typeof PRESET_METADATA_IDS)[number],
	index: number,
): IGeneratedPresetEntry => ({
	presetId,
	measurementSurface: 'native',
	measuredAt: '2026-08-31T00:00:00.000Z',
	toolCount: index + 1,
	schemaBytes: (index + 1) * 100,
	estimatedTokens: index + 10,
});

describe('preset metadata generation', () => {
	it('uses the canonical preset order from the preset catalog', () => {
		expect(PRESET_METADATA_IDS).toEqual(PRESET_KIND);
	});

	it('orders generated entries by canonical preset order', async () => {
		const entries = [...PRESET_METADATA_IDS]
			.reverse()
			.map((presetId, index) => makeEntry(presetId, index));

		expect(
			orderPresetMetadataEntries(entries).map((entry) => entry.presetId),
		).toEqual(PRESET_METADATA_IDS);

		const source = await buildPresetMetadataSource({ entries });
		const positions = PRESET_METADATA_IDS.map((presetId) =>
			source.indexOf(
				/^[a-z][a-zA-Z0-9]*$/.test(presetId)
					? `\n\t${presetId}: {`
					: `\n\t'${presetId}': {`,
			),
		);
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect([...positions]).toEqual(
			[...positions].sort((left, right) => left - right),
		);
	});

	it('rejects duplicate or missing preset entries', () => {
		const withoutCliTool = PRESET_METADATA_IDS.slice(0, -1).map(makeEntry);
		expect(() => orderPresetMetadataEntries(withoutCliTool)).toThrow(
			'missing generated entries for cli-tool',
		);

		const duplicateMinimal = [
			...PRESET_METADATA_IDS.map(makeEntry),
			makeEntry('minimal', PRESET_METADATA_IDS.length),
		];
		expect(() => orderPresetMetadataEntries(duplicateMinimal)).toThrow(
			'duplicate preset id "minimal"',
		);
	});

	it('normalizes measuredAt timestamps without touching measured values', () => {
		const before = "measuredAt: '2026-08-31T00:00:00.000Z'\ntoolCount: 7";
		const after = "measuredAt: '2026-09-01T12:34:56.789Z'\ntoolCount: 7";

		expect(normalizeMeasuredAt(before)).toBe(normalizeMeasuredAt(after));
	});
});
