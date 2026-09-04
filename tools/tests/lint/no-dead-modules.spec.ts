/**
 * Unit cover for `findDeadModules` — the classification the gate rests
 * on. The gate's end-to-end behaviour is exercised by running it against
 * the real coverage summary; this pins the three judgements that decide
 * whether a module is reported, so a future edit cannot quietly widen or
 * narrow them.
 */
import { describe, expect, it } from 'vitest';

import {
	MIN_FUNCTIONS,
	findDeadModules,
	type ICoverageEntry,
} from '../../scripts/lint/no-dead-modules.script';

const entry = (
	functionsTotal: number,
	functionsCovered: number,
	branchesTotal = 0,
): ICoverageEntry => ({
	functions: { total: functionsTotal, covered: functionsCovered },
	branches: { total: branchesTotal, covered: 0 },
});

describe('findDeadModules', () => {
	it('reports a module with functions where none has executed', () => {
		const dead = findDeadModules(
			{ 'plugins/x/src/a.ts': entry(30, 0, 254) },
			'/repo',
		);
		expect(dead).toEqual([
			{ file: 'plugins/x/src/a.ts', functions: 30, branches: 254 },
		]);
	});

	it('ignores a module where even one function ran', () => {
		// One executed function means something reaches it; partial
		// coverage is a coverage-percentage problem, not this gate's.
		expect(
			findDeadModules({ 'plugins/x/src/a.ts': entry(30, 1) }, '/repo'),
		).toEqual([]);
	});

	it('ignores modules below the function floor', () => {
		expect(
			findDeadModules(
				{ 'plugins/x/src/real-deps.ts': entry(MIN_FUNCTIONS - 1, 0) },
				'/repo',
			),
		).toEqual([]);
	});

	it('never judges a module by its statements', () => {
		// The two diagnostics adapters showed 13-16% STATEMENT coverage
		// purely because a barrel import evaluates their top-level
		// constants. That is exactly how 1,197 dead lines stayed hidden,
		// so statements must not enter the decision at all.
		const withLiveStatements = {
			'plugins/github/src/lib/diagnostics.ts': {
				...entry(30, 0, 254),
				statements: { total: 163, covered: 22 },
			} as ICoverageEntry,
		};
		expect(findDeadModules(withLiveStatements, '/repo')).toHaveLength(1);
	});

	it('skips the aggregate row and relativises absolute paths', () => {
		const dead = findDeadModules(
			{
				total: entry(999, 0),
				'/repo/plugins/x/src/a.ts': entry(5, 0),
			},
			'/repo',
		);
		expect(dead.map((d) => d.file)).toEqual(['plugins/x/src/a.ts']);
	});

	it('orders by function count so the biggest hole reads first', () => {
		const dead = findDeadModules(
			{
				'b.ts': entry(4, 0),
				'a.ts': entry(31, 0),
				'c.ts': entry(31, 0),
			},
			'/repo',
		);
		expect(dead.map((d) => d.file)).toEqual(['a.ts', 'c.ts', 'b.ts']);
	});
});
