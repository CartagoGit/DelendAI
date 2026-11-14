import { describe, expect, it } from 'vitest';

import {
	changedFiles,
	defaultChangeBase,
	freshBudgets,
	INTEGRATION_REF,
	budgetsOverUnitLimit,
	judgeUnitLimit,
	judgeDeclaredBudgets,
	unbudgetedTests,
} from './declared-test-budget';

describe('declared test budgets', () => {
	it('[<50ms] counts a test whose name has no budget at the front, or a malformed one', () => {
		const text = [
			"it('a', () => {});",
			"it('[<5ms] b', () => {});",
			'test.only(`[<5ms] c`, () => {});',
			"it('d [<5ms] late', { timeout: 10 }, () => {});",
			"it('[<ms] malformed', () => {});",
		].join('\n');
		expect(unbudgetedTests(text)).toBe(3);
	});

	it('[<50ms] ignores skipped tests and a fixture inside a string, and reads an each table leniently', () => {
		expect(unbudgetedTests("it.skip('a', () => {});")).toBe(0);
		expect(unbudgetedTests('const f = "it(\'a\', () => {})";')).toBe(0);
		expect(unbudgetedTests("it.each([1])('[<4ms] x %i', () => {});")).toBe(
			0,
		);
		expect(unbudgetedTests("it.each([1])('x %i', () => {});")).toBe(1);
	});

	it('[<100ms] asks for budgets off the list, for the list to shrink and for an edited spec to leave it', () => {
		const files = new Map([
			['new.e2e.spec.ts', 2],
			['old.e2e.spec.ts', 3],
			['fixed.e2e.spec.ts', 0],
		]);
		const verdict = judgeDeclaredBudgets(
			files,
			new Set([
				'old.e2e.spec.ts',
				'fixed.e2e.spec.ts',
				'gone.e2e.spec.ts',
			]),
			new Set([
				'old.e2e.spec.ts',
				'fixed.e2e.spec.ts',
				'new.e2e.spec.ts',
			]),
		);
		expect(verdict.missing).toEqual([
			{ path: 'new.e2e.spec.ts', tests: 2 },
		]);
		expect(verdict.stale).toEqual([
			'fixed.e2e.spec.ts',
			'gone.e2e.spec.ts',
		]);
		expect(verdict.touched).toEqual(['old.e2e.spec.ts']);
	});

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

	it('[<50ms] asks a budget only of a spec the change touches, and of every spec when the change is unknown', () => {
		const files = new Map([
			['theirs.e2e.spec.ts', 2],
			['mine.e2e.spec.ts', 1],
		]);
		const paths = (changed?: ReadonlySet<string>) =>
			judgeDeclaredBudgets(files, new Set(), changed).missing.map(
				(entry) => entry.path,
			);
		expect(paths(new Set(['mine.e2e.spec.ts']))).toEqual([
			'mine.e2e.spec.ts',
		]);
		expect(paths(new Set())).toEqual([]);
		expect(paths(undefined)).toEqual([
			'mine.e2e.spec.ts',
			'theirs.e2e.spec.ts',
		]);
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

	it('[<20ms] asks no budget of a unit spec, and refuses one over 200 ms in a unit spec the change touches', () => {
		const files = new Map([
			['u.spec.ts', 2],
			['e.e2e.spec.ts', 2],
		]);
		expect(
			judgeDeclaredBudgets(files, new Set()).missing.map((m) => m.path),
		).toEqual(['e.e2e.spec.ts']);
		const text = "it('[<200ms] a', f);\nit('[<450ms] b', f);\nit('c', f);";
		expect(budgetsOverUnitLimit(text)).toEqual([450]);
		const over = new Map([
			['u.spec.ts', [450]],
			['e.e2e.spec.ts', [450]],
			['listed.spec.ts', [450]],
			['other.spec.ts', [450]],
		]);
		expect(
			judgeUnitLimit(
				over,
				new Set(['listed.spec.ts']),
				new Set(['u.spec.ts', 'e.e2e.spec.ts', 'listed.spec.ts']),
			).map((b) => b.path),
		).toEqual(['u.spec.ts']);
		expect(judgeUnitLimit(over, new Set()).length).toBe(3);
	});
});
