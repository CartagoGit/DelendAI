/**
 * The gate that replaces a floor it cannot measure.
 *
 * The failure mode worth pinning is not a wrong percentage — it is a
 * pass handed out for evidence that was never collected. Two of these
 * cases exist only to keep "nothing to judge" and "could not judge"
 * from collapsing into each other, because they look identical from the
 * outside and only one of them is allowed to be green.
 */

import { describe, expect, it } from 'vitest';

import { judgeChangedCoverage } from './changed-file-coverage.script';

const FLOORS = {
	statements: 82,
	branches: 69,
	functions: 83,
	lines: 83,
};

const entry = (coveredPct: number, total = 100) => {
	const counts = { total, covered: Math.round((coveredPct / 100) * total) };
	return {
		statements: counts,
		branches: counts,
		functions: counts,
		lines: counts,
	};
};

describe('judgeChangedCoverage', () => {
	it('passes a change whose files clear every floor', () => {
		const report = judgeChangedCoverage({
			changed: ['packages/core/src/lib/a.ts'],
			summary: { 'packages/core/src/lib/a.ts': entry(95) },
			floors: FLOORS,
		});
		expect(report.verdict).toBe('PASS');
		expect(report.judged).toEqual(['packages/core/src/lib/a.ts']);
	});

	it('fails a change whose files come in under a floor, and names which', () => {
		const report = judgeChangedCoverage({
			changed: ['packages/core/src/lib/a.ts'],
			summary: { 'packages/core/src/lib/a.ts': entry(10) },
			floors: FLOORS,
		});
		expect(report.verdict).toBe('FAIL');
		expect(report.shortfalls).toHaveLength(4);
		expect(report.shortfalls[0]).toContain('statements');
	});

	// The two that must not collapse into one another. `coverage.all`
	// makes the report enumerate every file coverage measures, so a
	// changed file missing from it is one coverage does not measure —
	// which is an answer. A missing REPORT is not.
	it('is NOT_APPLICABLE when nothing the change touched is measured', () => {
		const report = judgeChangedCoverage({
			changed: ['docs/a.md', '.github/workflows/ci.yml'],
			summary: { 'packages/core/src/lib/untouched.ts': entry(99) },
			floors: FLOORS,
		});
		expect(report.verdict).toBe('NOT_APPLICABLE');
		expect(report.unmeasured).toEqual([
			'docs/a.md',
			'.github/workflows/ci.yml',
		]);
	});

	it('is NOT_EXECUTABLE when there is no report to judge against', () => {
		expect(
			judgeChangedCoverage({
				changed: ['packages/core/src/lib/a.ts'],
				summary: undefined,
				floors: FLOORS,
			}).verdict,
		).toBe('NOT_EXECUTABLE');
	});

	// A spec is the measurement, not the subject, so coverage never
	// lists one — and a pull request that only adds tests must not be
	// reported as unmeasurable for it.
	it('treats a spec-only change as having no subject, not as a failure', () => {
		expect(
			judgeChangedCoverage({
				changed: ['packages/core/tests/src/lib/a.spec.ts'],
				summary: { 'packages/core/src/lib/a.ts': entry(99) },
				floors: FLOORS,
			}).verdict,
		).toBe('NOT_APPLICABLE');
	});

	it('judges what it has and names what it does not', () => {
		const report = judgeChangedCoverage({
			changed: [
				'packages/core/src/lib/a.ts',
				'packages/core/src/lib/b.ts',
			],
			summary: { 'packages/core/src/lib/a.ts': entry(95) },
			floors: FLOORS,
		});
		expect(report.verdict).toBe('PASS');
		expect(report.unmeasured).toEqual(['packages/core/src/lib/b.ts']);
	});

	// A gate that averages percentages can be passed by adding a
	// one-line file next to a thousand uncovered ones.
	it('weights by size rather than averaging percentages', () => {
		const report = judgeChangedCoverage({
			changed: ['small.ts', 'big.ts'].map(
				(name) => `packages/core/src/lib/${name}`,
			),
			summary: {
				'packages/core/src/lib/small.ts': entry(100, 1),
				'packages/core/src/lib/big.ts': entry(10, 1000),
			},
			floors: FLOORS,
		});
		expect(report.verdict).toBe('FAIL');
		expect(report.measured?.lines).toBeLessThan(11);
	});
});
