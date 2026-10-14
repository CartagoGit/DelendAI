import { describe, expect, it } from 'vitest';

import { normalizeMeasuredAt } from './preset-metadata.script';

describe('preset metadata generation', () => {
	it('treats measurement timestamps as provenance, not generated drift', () => {
		const before = [
			"measuredAt: '2026-08-26T10:00:00.000Z'",
			'toolCount: 10',
		].join('\n');
		const after = [
			"measuredAt: '2026-08-26T11:00:00.000Z'",
			'toolCount: 10',
		].join('\n');

		expect(normalizeMeasuredAt(before)).toBe(normalizeMeasuredAt(after));
	});

	it('keeps real metric changes visible after timestamp normalization', () => {
		const before = [
			"measuredAt: '2026-08-26T10:00:00.000Z'",
			'toolCount: 10',
		].join('\n');
		const after = [
			"measuredAt: '2026-08-26T11:00:00.000Z'",
			'toolCount: 11',
		].join('\n');

		expect(normalizeMeasuredAt(before)).not.toBe(
			normalizeMeasuredAt(after),
		);
	});
});
