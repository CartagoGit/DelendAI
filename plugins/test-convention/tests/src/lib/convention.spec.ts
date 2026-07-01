import { describe, expect, it } from 'vitest';

import {
	DEFAULT_CONVENTION,
	effectiveMockStyle,
	mergeConvention,
} from '@mcp-vertex/test-convention/public';

describe('DEFAULT_CONVENTION', async () => {
	it('uses spec.ts + colocate + vitest', async () => {
		expect(DEFAULT_CONVENTION.specExtension).toBe('spec.ts');
		expect(DEFAULT_CONVENTION.specLayout).toBe('colocate');
		expect(DEFAULT_CONVENTION.runners).toEqual(['vitest']);
		expect(DEFAULT_CONVENTION.requireDescribe).toBe(true);
	});

	it('has 4 default forbidden patterns', async () => {
		expect(DEFAULT_CONVENTION.forbiddenPatterns.length).toBe(4);
	});

	it('defaults coverage thresholds match the repo (80/80/70/80)', async () => {
		expect(DEFAULT_CONVENTION.coverageThreshold).toEqual({
			lines: 80,
			functions: 80,
			branches: 70,
			statements: 80,
		});
	});
});

describe('mergeConvention', async () => {
	it('returns defaults when called with no overrides', async () => {
		expect(mergeConvention()).toEqual(DEFAULT_CONVENTION);
	});

	it('replaces forbiddenPatterns wholesale', async () => {
		const merged = mergeConvention({ forbiddenPatterns: ['CUSTOM'] });
		expect(merged.forbiddenPatterns.map((r) => r.source)).toEqual([
			'CUSTOM',
		]);
	});

	it('compiles forbiddenPattern strings as case-insensitive RegExp', async () => {
		const merged = mergeConvention({ forbiddenPatterns: ['SNEAK'] });
		expect(merged.forbiddenPatterns[0]?.flags).toContain('i');
		expect(merged.forbiddenPatterns[0]?.source).toBe('SNEAK');
	});

	it('merges coverage thresholds per field', async () => {
		const merged = mergeConvention({
			coverageThreshold: { lines: 90 },
		});
		expect(merged.coverageThreshold).toEqual({
			lines: 90,
			functions: 80,
			branches: 70,
			statements: 80,
		});
	});

	it('accepts layout and extension overrides', async () => {
		const merged = mergeConvention({
			specExtension: 'test.ts',
			specLayout: 'tests-mirror',
		});
		expect(merged.specExtension).toBe('test.ts');
		expect(merged.specLayout).toBe('tests-mirror');
	});
});

describe('effectiveMockStyle', async () => {
	it('returns the literal mockStyle when set to vi or jest', async () => {
		const c = { ...DEFAULT_CONVENTION, mockStyle: 'jest' as const };
		expect(effectiveMockStyle(c)).toBe('jest');
	});

	it('derives vi when runners include vitest and mockStyle is auto', async () => {
		expect(effectiveMockStyle(DEFAULT_CONVENTION)).toBe('vi');
	});

	it('derives jest when runners do not include vitest', async () => {
		const c = { ...DEFAULT_CONVENTION, runners: ['jest'] };
		expect(effectiveMockStyle(c)).toBe('jest');
	});
});
