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

import {
	bunOwnedSources,
	isBunOwned,
	judgeChangedCoverage,
} from './changed-file-coverage.script';

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

describe('files whose tests this report never ran', () => {
	// The real declaration's shape: a directory, a mirrored spec, and a
	// spec that sits next to its source.
	const owned = bunOwnedSources(
		'bun test packages/proposals-sqlite/ packages/core/tests/src/lib/evidence/ ' +
			'plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts',
	);

	it('maps a mirrored spec back to the source it tests', () => {
		expect(
			owned.files.has(
				'plugins/proposals/src/lib/tools/db-reconcile.tool.ts',
			),
		).toBe(true);
		expect(owned.prefixes).toContain('packages/core/src/lib/evidence/');
		expect(owned.prefixes).toContain('packages/proposals-sqlite/');
	});

	describe('one spec, a family of sources', () => {
		// `work-event-store.spec.ts` is the only suite for the backend
		// and both implementations, and it runs under `bun test`. Read
		// through vitest's report the facade is 0% — not because it is
		// untested, but because the runner that tests it never reported.
		const family = bunOwnedSources(
			'bun test packages/state-telemetry/src/lib/events/work-event-store.spec.ts',
		);

		it('owns the source named exactly after the spec', () => {
			expect(
				isBunOwned(
					'packages/state-telemetry/src/lib/events/work-event-store.ts',
					family,
				),
			).toBe(true);
		});

		it('owns its role-suffixed siblings', () => {
			for (const role of ['facade', 'ndjson', 'sqlite']) {
				expect(
					isBunOwned(
						`packages/state-telemetry/src/lib/events/work-event-store.${role}.ts`,
						family,
					),
				).toBe(true);
			}
		});

		it('does not own a different file that merely shares a prefix', () => {
			expect(
				isBunOwned(
					'packages/state-telemetry/src/lib/events/work-event-store-registry.ts',
					family,
				),
			).toBe(false);
		});

		it('does not own the spec itself', () => {
			expect(
				isBunOwned(
					'packages/state-telemetry/src/lib/events/work-event-store.facade.spec.ts',
					family,
				),
			).toBe(false);
		});

		it('defers the facade instead of failing on a number nothing measured', () => {
			const report = judgeChangedCoverage({
				changed: [
					'packages/state-telemetry/src/lib/events/work-event-store.facade.ts',
				],
				summary: {
					'packages/state-telemetry/src/lib/events/work-event-store.facade.ts':
						entry(0),
				},
				floors: FLOORS,
				bunOwned: family,
			});

			expect(report.verdict).toBe('NOT_APPLICABLE');
			expect(report.deferred).toEqual([
				'packages/state-telemetry/src/lib/events/work-event-store.facade.ts',
			]);
		});
	});

	it('defers them instead of judging an import for a test', () => {
		// vitest's report DOES contain this file — some other spec imports
		// it — at a number that measures which modules were loaded, not
		// whether it is tested. Failing a pull request on that number
		// blocks every change to the file forever.
		const report = judgeChangedCoverage({
			changed: ['plugins/proposals/src/lib/tools/db-reconcile.tool.ts'],
			summary: {
				'plugins/proposals/src/lib/tools/db-reconcile.tool.ts':
					entry(9),
			},
			floors: FLOORS,
			bunOwned: owned,
		});

		expect(report.verdict).toBe('NOT_APPLICABLE');
		expect(report.deferred).toEqual([
			'plugins/proposals/src/lib/tools/db-reconcile.tool.ts',
		]);
		expect(report.judged).toEqual([]);
		expect(report.reason).toContain('bun suite');
	});

	it('still judges every other changed file in the same change', () => {
		const report = judgeChangedCoverage({
			changed: [
				'plugins/proposals/src/lib/tools/db-reconcile.tool.ts',
				'packages/core/src/lib/cli/assemble.ts',
			],
			summary: {
				'plugins/proposals/src/lib/tools/db-reconcile.tool.ts':
					entry(9),
				'packages/core/src/lib/cli/assemble.ts': entry(40),
			},
			floors: FLOORS,
			bunOwned: owned,
		});

		// The deferral is per file: a badly covered file that vitest DOES
		// test still fails, in the same run.
		expect(report.verdict).toBe('FAIL');
		expect(report.judged).toEqual([
			'packages/core/src/lib/cli/assemble.ts',
		]);
		expect(report.deferred).toHaveLength(1);
	});

	it('defers nothing when it is not told what the other runner owns', () => {
		const report = judgeChangedCoverage({
			changed: ['plugins/proposals/src/lib/tools/db-reconcile.tool.ts'],
			summary: {
				'plugins/proposals/src/lib/tools/db-reconcile.tool.ts':
					entry(9),
			},
			floors: FLOORS,
		});

		expect(report.verdict).toBe('FAIL');
		expect(report.deferred).toEqual([]);
	});
});
