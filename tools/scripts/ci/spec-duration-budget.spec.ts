import { describe, expect, it } from 'vitest';

import {
	FAIL_MS,
	isE2eSpec,
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
		'a/new.spec.ts': FAIL_MS + 2,
		'a/heavy.e2e.spec.ts': FAIL_MS * 10,
		'a/not-a-spec.ts': FAIL_MS * 10,
	};

	it('reports files over 1 s, slowest first', () => {
		const { slow } = judgeSpecDurations(timings, new Set());
		expect(slow.map((entry) => entry.path)).toEqual([
			'a/heavy.e2e.spec.ts',
			'a/new.spec.ts',
			'a/old.spec.ts',
			'a/slow.spec.ts',
		]);
	});

	it('fails a file over 5 s that is neither e2e nor baselined', () => {
		const { failures } = judgeSpecDurations(
			timings,
			new Set(['a/old.spec.ts']),
		);
		expect(failures.map((entry) => entry.path)).toEqual(['a/new.spec.ts']);
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
