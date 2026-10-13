import { describe, expect, it } from 'vitest';

import {
	roadmapEntrySchema,
	roadmapEstimateSchema,
	roadmapGateSchema,
	roadmapSchema,
} from '../../../../src/lib/contracts/schemas/roadmap.schema';
import { readRoadmap } from '../../../../src/lib/validation/roadmap-reader.service';

const entry = {
	id: 'e1',
	title: 'Ship the thing',
	kind: 'feature',
	state: 'proposed',
	gates: [{ kind: 'proposal-done', target: 'f00001' }],
};

describe('roadmap schema', () => {
	it('accepts a complete document', () => {
		const parsed = roadmapSchema.safeParse({
			schemaVersion: 1,
			horizons: [
				{ version: '0.5.0', bumpHint: 'minor', entries: [entry] },
			],
		});
		expect(parsed.success).toBe(true);
	});

	it('rejects an unknown key on an entry', () => {
		expect(
			roadmapEntrySchema.safeParse({ ...entry, owner: 'x' }).success,
		).toBe(false);
	});

	it('rejects an unknown key on a gate', () => {
		expect(
			roadmapGateSchema.safeParse({ kind: 'attestation', extra: 1 })
				.success,
		).toBe(false);
	});

	it('rejects an unknown key on an estimate', () => {
		expect(
			roadmapEstimateSchema.safeParse({
				date: '2026-10-07',
				basis: 'velocity of the last three releases',
				confidence: 'low',
				slack: 3,
			}).success,
		).toBe(false);
	});

	it('rejects an unknown top-level key and a closed-set violation', () => {
		expect(
			roadmapSchema.safeParse({ schemaVersion: 1, horizons: [], x: 1 })
				.success,
		).toBe(false);
		expect(
			roadmapEntrySchema.safeParse({ ...entry, kind: 'epic' }).success,
		).toBe(false);
	});

	it('requires an estimate to name its basis', () => {
		expect(
			roadmapEstimateSchema.safeParse({
				date: '2026-10-07',
				confidence: 'low',
			}).success,
		).toBe(false);
	});
});

describe('readRoadmap', () => {
	it('returns the roadmap for a valid document', () => {
		const result = readRoadmap({ schemaVersion: 1, horizons: [] });
		expect(result).toEqual({
			ok: true,
			value: { schemaVersion: 1, horizons: [] },
		});
	});

	it('refuses a newer schemaVersion with an actionable reason', () => {
		const result = readRoadmap({
			schemaVersion: 2,
			horizons: [],
			future: 1,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain('schemaVersion 2');
			expect(result.reason).toContain('upgrade delendai');
		}
	});

	it('refuses a document without a schemaVersion', () => {
		const result = readRoadmap({ horizons: [] });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('schemaVersion');
	});

	it('names where a field is wrong', () => {
		const result = readRoadmap({
			schemaVersion: 1,
			horizons: [
				{ version: '1.0.0', entries: [{ ...entry, kind: 'epic' }] },
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.reason).toContain('horizons.0.entries.0.kind');
	});

	it('does not throw for input that is not an object', () => {
		expect(readRoadmap(null).ok).toBe(false);
		expect(readRoadmap('roadmap').ok).toBe(false);
	});
});
