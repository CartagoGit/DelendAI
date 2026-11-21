import { describe, expect, it } from 'vitest';

import {
	CLEAR_MS,
	FAIL_MS,
	failuresOfChange,
	isE2eSpec,
	judgedDuration,
	judgeSpecDurations,
	REPORT_MS,
} from './spec-duration-budget';

describe('isE2eSpec', () => {
	it('declares the tier by file name or e2e directory', () => {
		expect(isE2eSpec('a/b/first-boot.e2e.spec.ts')).toBe(true);
		expect(isE2eSpec('tests/e2e/real-tree.spec.ts')).toBe(true);
		expect(isE2eSpec('a/b/first-boot.spec.ts')).toBe(false);
	});
});

describe('judgeSpecDurations', () => {
	const timings = {
		'a/fast.spec.ts': 80,
		'a/slow.spec.ts': REPORT_MS + 1,
		'a/old.spec.ts': FAIL_MS + 1,
		'a/new.spec.ts': CLEAR_MS + 2,
		'a/noisy.spec.ts': FAIL_MS + 500,
		'a/heavy.e2e.spec.ts': FAIL_MS * 10,
		'a/not-a-spec.ts': FAIL_MS * 10,
	};

	it('reports files over 1 s, slowest first', () => {
		const { slow } = judgeSpecDurations(timings, new Set());
		expect(slow.map((entry) => entry.path)).toEqual([
			'a/heavy.e2e.spec.ts',
			'a/new.spec.ts',
			'a/noisy.spec.ts',
			'a/old.spec.ts',
			'a/slow.spec.ts',
		]);
	});

	it('fails only a file over the limit by the margin, neither e2e nor baselined', () => {
		const { failures } = judgeSpecDurations(
			timings,
			new Set(['a/old.spec.ts']),
		);
		expect(failures.map((entry) => entry.path)).toEqual(['a/new.spec.ts']);
	});

	it('reports a file between the limit and the margin without failing it', () => {
		const { offenders, failures } = judgeSpecDurations(
			timings,
			new Set(['a/old.spec.ts']),
		);
		expect(offenders.map((entry) => entry.path)).toEqual([
			'a/new.spec.ts',
			'a/noisy.spec.ts',
		]);
		expect(failures.map((entry) => entry.path)).not.toContain(
			'a/noisy.spec.ts',
		);
	});

	it('judges a file on the median of recent runs, so one noisy run does not count', () => {
		const spike = { 'a/x.spec.ts': CLEAR_MS * 2 };
		const quiet = [{ 'a/x.spec.ts': 900 }, { 'a/x.spec.ts': 1_100 }];
		expect(judgedDuration('a/x.spec.ts', spike, quiet)).toBe(1_100);
		expect(judgeSpecDurations(spike, new Set(), quiet).failures).toEqual(
			[],
		);
		expect(judgeSpecDurations(spike, new Set()).failures).toHaveLength(1);
		expect(judgedDuration('a/gone.spec.ts', spike, quiet)).toBeUndefined();
	});

	it('marks baseline entries that got fast, moved to e2e or vanished', () => {
		const { stale } = judgeSpecDurations(
			timings,
			new Set([
				'a/old.spec.ts',
				'a/fast.spec.ts',
				'a/heavy.e2e.spec.ts',
				'a/gone.spec.ts',
			]),
		);
		expect(stale).toEqual([
			'a/fast.spec.ts',
			'a/gone.spec.ts',
			'a/heavy.e2e.spec.ts',
		]);
	});
});

describe('failuresOfChange', () => {
	const failures = [
		{ path: 'a/touched.spec.ts', ms: CLEAR_MS + 1 },
		{ path: 'a/neighbour.spec.ts', ms: CLEAR_MS + 1 },
	];

	it('keeps only the specs the change adds or edits', () => {
		expect(
			failuresOfChange(failures, new Set(['a/touched.spec.ts'])),
		).toEqual([failures[0]]);
	});

	it('keeps all of them when no change list is given', () => {
		expect(failuresOfChange(failures, undefined)).toEqual(failures);
	});
});
