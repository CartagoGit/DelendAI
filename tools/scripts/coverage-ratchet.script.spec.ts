import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	computeCoverageRatchetViolations,
	parseCoverageSummary,
	parseGlobalThresholds,
	RATCHET_MARGIN,
	type ICoverageMetrics,
} from './coverage-ratchet.script';

const measured: ICoverageMetrics = {
	statements: 83.3,
	branches: 70.34,
	functions: 84.12,
	lines: 84.98,
};

describe('computeCoverageRatchetViolations', () => {
	it('reports no violations when every threshold already equals floor(measured - margin)', () => {
		const configured: ICoverageMetrics = {
			statements: 82,
			branches: 69,
			functions: 83,
			lines: 83,
		};
		expect(computeCoverageRatchetViolations(configured, measured)).toEqual(
			[],
		);
	});

	it('reports no violations when thresholds are stricter than floor(measured - margin)', () => {
		const configured: ICoverageMetrics = {
			statements: 90,
			branches: 90,
			functions: 90,
			lines: 90,
		};
		expect(computeCoverageRatchetViolations(configured, measured)).toEqual(
			[],
		);
	});

	it('flags a stale threshold when coverage rose but the config was not tightened', () => {
		const configured: ICoverageMetrics = {
			statements: 80,
			branches: 67,
			functions: 79,
			lines: 81,
		};
		const violations = computeCoverageRatchetViolations(
			configured,
			measured,
		);
		expect(violations).toEqual([
			{
				metric: 'statements',
				configured: 80,
				measured: measured.statements,
				expected: Math.floor(measured.statements - RATCHET_MARGIN),
			},
			{
				metric: 'branches',
				configured: 67,
				measured: measured.branches,
				expected: Math.floor(measured.branches - RATCHET_MARGIN),
			},
			{
				metric: 'functions',
				configured: 79,
				measured: measured.functions,
				expected: Math.floor(measured.functions - RATCHET_MARGIN),
			},
			{
				metric: 'lines',
				configured: 81,
				measured: measured.lines,
				expected: Math.floor(measured.lines - RATCHET_MARGIN),
			},
		]);
	});

	it('flags only the metric that regressed relative to the ratchet, not the ones already tight', () => {
		const configured: ICoverageMetrics = {
			statements: 82,
			branches: 60, // stale — coverage rose well past this floor
			functions: 83,
			lines: 83,
		};
		const violations = computeCoverageRatchetViolations(
			configured,
			measured,
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.metric).toBe('branches');
	});
});

describe('parseCoverageSummary', () => {
	it('extracts the four global percentages from a v8 json-summary report', () => {
		const raw = JSON.stringify({
			total: {
				lines: { total: 100, covered: 85, skipped: 0, pct: 84.98 },
				statements: { total: 100, covered: 83, skipped: 0, pct: 83.3 },
				functions: { total: 100, covered: 84, skipped: 0, pct: 84.12 },
				branches: { total: 100, covered: 70, skipped: 0, pct: 70.34 },
			},
			'packages/core/src/lib/plugins/loader.ts': {
				lines: { total: 10, covered: 10, skipped: 0, pct: 100 },
			},
		});
		expect(parseCoverageSummary(raw)).toEqual(measured);
	});
});

describe('parseGlobalThresholds', () => {
	it('reads the four global keys and ignores the per-module glob overrides', () => {
		const source = `
			coverage: {
				thresholds: {
					statements: 82,
					branches: 69,
					functions: 83,
					lines: 83,
					'packages/core/src/lib/plugins/**': {
						branches: 80,
					},
					'packages/core/src/lib/dry-run/**': {
						branches: 80,
					},
				},
			},
		`;
		expect(parseGlobalThresholds(source)).toEqual({
			statements: 82,
			branches: 69,
			functions: 83,
			lines: 83,
		});
	});

	it('reads the real repo vitest.config.ts without throwing', () => {
		const repoRoot = process.cwd();
		const source = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8');
		const thresholds = parseGlobalThresholds(source);
		for (const value of Object.values(thresholds)) {
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThanOrEqual(100);
		}
	});

	it('throws a descriptive error when the thresholds block is missing', () => {
		expect(() => parseGlobalThresholds('coverage: {},')).toThrow(
			/could not find "thresholds: \{"/u,
		);
	});

	it('throws a descriptive error when a global key is missing', () => {
		const source = `
			thresholds: {
				statements: 82,
				functions: 83,
				lines: 83,
			},
		`;
		expect(() => parseGlobalThresholds(source)).toThrow(
			/missing global threshold for "branches"/u,
		);
	});
});
