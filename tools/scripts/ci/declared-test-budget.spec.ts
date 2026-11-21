import { describe, expect, it } from 'vitest';

import {
	changedFiles,
	defaultChangeBase,
	freshBudgets,
	INTEGRATION_REF,
	isFirstRun,
	budgetsOverUnitLimit,
	judgeUnitLimit,
} from './declared-test-budget';

describe('declared test budgets', () => {
	it('[<50ms] measures an unspecified change against the merge-base with the integration branch', () => {
		const asked: string[][] = [];
		const base = defaultChangeBase((args) => {
			asked.push([...args]);
			return 'abc123\n';
		});
		expect(base).toBe('abc123');
		expect(asked).toEqual([['merge-base', INTEGRATION_REF, 'HEAD']]);
	});

	it('[<50ms] falls back to no base only when the integration ref is missing', () => {
		expect(
			defaultChangeBase(() => {
				throw new Error(
					'fatal: Not a valid object name origin/develop',
				);
			}),
		).toBeUndefined();
		expect(defaultChangeBase(() => '\n')).toBeUndefined();
	});

	it('[<50ms] reads the change as committed, edited and new files, and as unknown without a base', () => {
		const git = (args: readonly string[]): string =>
			args[0] === 'merge-base'
				? 'abc\n'
				: args[0] === 'ls-files'
					? 'new.e2e.spec.ts\n'
					: args.includes('HEAD')
						? 'edited.e2e.spec.ts\n'
						: 'committed.e2e.spec.ts\n';
		expect(changedFiles(git)).toEqual(
			new Set([
				'committed.e2e.spec.ts',
				'edited.e2e.spec.ts',
				'new.e2e.spec.ts',
				'',
			]),
		);
		expect(
			changedFiles(() => {
				throw new Error('no base');
			}),
		).toBeUndefined();
	});

	it('[<50ms] reads fresh budgets from committed, edited and new spec files, and none without a base', () => {
		const git = (args: readonly string[]): string =>
			args[0] === 'merge-base'
				? 'abc\n'
				: args[0] === 'ls-files'
					? 'new.e2e.spec.ts\nnotes.md\n'
					: args.includes('abc...HEAD')
						? "+++ b/c.e2e.spec.ts\n+it('[<8ms] committed', f);\n"
						: "+++ b/e.e2e.spec.ts\n+it('[<6ms] edited', f);\n";
		const read = (path: string): string =>
			path === 'new.e2e.spec.ts' ? "it('[<4ms] new', f);\n" : 'unread';
		expect(freshBudgets(git, read)).toEqual([
			'c.e2e.spec.ts\t[<8ms] committed',
			'e.e2e.spec.ts\t[<6ms] edited',
			'new.e2e.spec.ts\t[<4ms] new',
		]);
		expect(
			freshBudgets(() => {
				throw new Error('no base');
			}, read),
		).toBeUndefined();
	});

	it('[<20ms] refuses one over 200 ms in a unit spec the change touches', () => {
		const text = "it('[<200ms] a', f);\nit('[<450ms] b', f);\nit('c', f);";
		expect(budgetsOverUnitLimit(text)).toEqual([450]);
		const over = new Map([
			['u.spec.ts', [450]],
			['e.e2e.spec.ts', [450]],
			['listed.spec.ts', [450]],
			['other.spec.ts', [450]],
		]);
		expect(
			judgeUnitLimit(over, new Set(['u.spec.ts', 'e.e2e.spec.ts'])).map(
				(b) => b.path,
			),
		).toEqual(['u.spec.ts']);
		expect(judgeUnitLimit(over).length).toBe(3);
	});

	it('[<20ms] counts a changed or new test as on its first run, which never blocks', () => {
		const estimates = { 'a.e2e.spec.ts > old': 10 };
		const fresh = ['a.e2e.spec.ts\t[<20ms] old'];
		expect(
			isFirstRun('a.e2e.spec.ts', '[<20ms] old', fresh, estimates),
		).toBe(true);
		expect(isFirstRun('a.e2e.spec.ts', '[<20ms] old', [], estimates)).toBe(
			false,
		);
		expect(isFirstRun('a.e2e.spec.ts', '[<20ms] new', [], estimates)).toBe(
			true,
		);
	});
});
