import { describe, expect, it, vi } from 'vitest';

import { checkBudgets } from './test-budget-check';

const spec = 'packages/core/tests/src/x.e2e.spec.ts';
const over = { [spec]: { '[<50ms] does x': 140 } };

describe('test budget check', () => {
	it('[<20ms] reports an overrun in an untouched spec and exits 0', () => {
		const verdict = checkBudgets({
			durations: () => over,
			base: 'abc',
			changedFiles: () => new Set(['other.ts']),
		});
		expect(verdict.code).toBe(0);
		expect(verdict.errors).toEqual([]);
		expect(verdict.warnings).toHaveLength(1);
		expect(verdict.warnings[0]).toContain('declare [<210ms]');
		expect(verdict.warnings[0]).toContain('does not touch the spec');
	});

	it('[<20ms] fails an overrun in a spec the change touches, naming the number', () => {
		const verdict = checkBudgets({
			durations: () => over,
			base: 'abc',
			changedFiles: () => new Set([spec]),
		});
		expect(verdict.code).toBe(1);
		expect(verdict.errors[0]).toContain('declare [<210ms]');
		expect(verdict.warnings).toEqual([]);
	});

	it('[<20ms] reads an empty base as no change set, never as everything touched', () => {
		const changedFiles = vi.fn(() => new Set([spec]));
		const verdict = checkBudgets({
			durations: () => over,
			base: '',
			changedFiles,
		});
		expect(verdict.code).toBe(0);
		expect(verdict.warnings).toHaveLength(1);
		expect(changedFiles).not.toHaveBeenCalled();
	});

	it('[<20ms] fails when the reports cannot be read, or the change cannot be listed', () => {
		const unreadable = checkBudgets({
			durations: () => {
				throw new Error('no report under .vitest-reports');
			},
			base: '',
			changedFiles: () => new Set(),
		});
		expect(unreadable.code).toBe(1);
		expect(unreadable.errors[0]).toContain('no readable reports');
		const unlisted = checkBudgets({
			durations: () => over,
			base: 'abc',
			changedFiles: () => {
				throw new Error('bad revision');
			},
		});
		expect(unlisted.code).toBe(1);
		expect(unlisted.errors[0]).toContain('cannot list the files abc');
	});

	it('[<20ms] passes when nothing is over its budget', () => {
		const verdict = checkBudgets({
			durations: () => ({ [spec]: { '[<50ms] does x': 10 } }),
			base: 'abc',
			changedFiles: () => new Set([spec]),
		});
		expect(verdict).toEqual({ code: 0, errors: [], warnings: [] });
	});
});
