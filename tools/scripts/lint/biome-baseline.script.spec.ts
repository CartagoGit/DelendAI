import { describe, expect, it } from 'vitest';

import {
	aggregateBaseline,
	compareToBaseline,
	parseBiomeJsonOutput,
	stripAnsi,
	type IBiomeDiagnostic,
} from './biome-baseline.script';

describe('biome-baseline — stripAnsi', () => {
	it('removes ANSI reset/color escape sequences', () => {
		expect(stripAnsi('[0m{"a":1}[0m')).toBe('{"a":1}');
		expect(stripAnsi('[33mwarn[0m plain')).toBe('warn plain');
	});

	it('is a no-op on plain text', () => {
		expect(stripAnsi('{"a":1}')).toBe('{"a":1}');
	});
});

describe('biome-baseline — parseBiomeJsonOutput', () => {
	it('parses biome ci --reporter=json output wrapped in ANSI resets', () => {
		const raw =
			'[0m{"summary":{"changed":0,"unchanged":2,"errors":1,"warnings":1,"infos":0},' +
			'"diagnostics":[' +
			'{"severity":"error","category":"format","message":"bad"},' +
			'{"severity":"warning","category":"lint/style/useTemplate","message":"tpl"}' +
			']}[0m';
		const result = parseBiomeJsonOutput(raw);
		expect(result.summary.errors).toBe(1);
		expect(result.summary.warnings).toBe(1);
		expect(result.diagnostics).toHaveLength(2);
		expect(result.diagnostics[0]?.category).toBe('format');
	});
});

describe('biome-baseline — aggregateBaseline', () => {
	it('groups warnings and infos by category', () => {
		const diagnostics: IBiomeDiagnostic[] = [
			{ severity: 'warning', category: 'lint/style/useTemplate' },
			{ severity: 'warning', category: 'lint/style/useTemplate' },
			{ severity: 'info', category: 'lint/complexity/noUselessTernary' },
		];
		expect(aggregateBaseline(diagnostics)).toEqual({
			'lint/style/useTemplate': 2,
			'lint/complexity/noUselessTernary': 1,
		});
	});

	it('collapses every error-severity diagnostic into a single __errors__ total, regardless of category', () => {
		const diagnostics: IBiomeDiagnostic[] = [
			{ severity: 'error', category: 'format' },
			{
				severity: 'error',
				category: 'lint/suspicious/noAssignInExpressions',
			},
			{ severity: 'warning', category: 'lint/style/useTemplate' },
		];
		expect(aggregateBaseline(diagnostics)).toEqual({
			__errors__: 2,
			'lint/style/useTemplate': 1,
		});
	});

	it('falls back to "unknown" for a category-less diagnostic', () => {
		const diagnostics: IBiomeDiagnostic[] = [{ severity: 'warning' }];
		expect(aggregateBaseline(diagnostics)).toEqual({ unknown: 1 });
	});

	it('returns an empty object for a clean run', () => {
		expect(aggregateBaseline([])).toEqual({});
	});
});

describe('biome-baseline — compareToBaseline', () => {
	it('reports no regressions when current matches baseline exactly', () => {
		const baseline = { 'lint/style/useTemplate': 3 };
		const { regressions, shrankKeys } = compareToBaseline(
			baseline,
			baseline,
		);
		expect(regressions).toEqual([]);
		expect(shrankKeys).toEqual([]);
	});

	it('flags a category whose count increased past the baseline', () => {
		const current = { 'lint/style/useTemplate': 4 };
		const baseline = { 'lint/style/useTemplate': 3 };
		const { regressions } = compareToBaseline(current, baseline);
		expect(regressions).toHaveLength(1);
		expect(regressions[0]).toContain('lint/style/useTemplate');
		expect(regressions[0]).toContain('baseline 3');
	});

	it('flags a brand-new category not present in the baseline at all', () => {
		const current = { 'lint/new/rule': 1 };
		const baseline = {};
		const { regressions } = compareToBaseline(current, baseline);
		expect(regressions).toHaveLength(1);
		expect(regressions[0]).toContain('lint/new/rule');
		expect(regressions[0]).toContain('baseline 0');
	});

	it('flags __errors__ growth past its baselined total the same as any other key', () => {
		const current = { __errors__: 46 };
		const baseline = { __errors__: 45 };
		const { regressions } = compareToBaseline(current, baseline);
		expect(regressions).toHaveLength(1);
		expect(regressions[0]).toContain('__errors__');
	});

	it('reports a shrunk key without failing when a count decreases', () => {
		const current = { 'lint/style/useTemplate': 2 };
		const baseline = { 'lint/style/useTemplate': 3 };
		const { regressions, shrankKeys } = compareToBaseline(
			current,
			baseline,
		);
		expect(regressions).toEqual([]);
		expect(shrankKeys).toEqual(['lint/style/useTemplate']);
	});

	it('does not flag a category that disappeared entirely from current (never regresses on absence)', () => {
		const current = {};
		const baseline = { 'lint/style/useTemplate': 3 };
		const { regressions, shrankKeys } = compareToBaseline(
			current,
			baseline,
		);
		expect(regressions).toEqual([]);
		expect(shrankKeys).toEqual([]);
	});
});
