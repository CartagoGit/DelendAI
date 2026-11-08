import { describe, expect, it } from 'vitest';

import {
	changedFiles,
	defaultChangeBase,
	INTEGRATION_REF,
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
			['new.spec.ts', 2],
			['old.spec.ts', 3],
			['fixed.spec.ts', 0],
		]);
		const verdict = judgeDeclaredBudgets(
			files,
			new Set(['old.spec.ts', 'fixed.spec.ts', 'gone.spec.ts']),
			new Set(['old.spec.ts', 'fixed.spec.ts', 'new.spec.ts']),
		);
		expect(verdict.missing).toEqual([{ path: 'new.spec.ts', tests: 2 }]);
		expect(verdict.stale).toEqual(['fixed.spec.ts', 'gone.spec.ts']);
		expect(verdict.touched).toEqual(['old.spec.ts']);
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
			['theirs.spec.ts', 2],
			['mine.spec.ts', 1],
		]);
		const paths = (changed?: ReadonlySet<string>) =>
			judgeDeclaredBudgets(files, new Set(), changed).missing.map(
				(entry) => entry.path,
			);
		expect(paths(new Set(['mine.spec.ts']))).toEqual(['mine.spec.ts']);
		expect(paths(new Set())).toEqual([]);
		expect(paths(undefined)).toEqual(['mine.spec.ts', 'theirs.spec.ts']);
	});

	it('[<50ms] reads the change as committed, edited and new files, and as unknown without a base', () => {
		const git = (args: readonly string[]): string =>
			args[0] === 'merge-base'
				? 'abc\n'
				: args[0] === 'ls-files'
					? 'new.spec.ts\n'
					: args.includes('HEAD')
						? 'edited.spec.ts\n'
						: 'committed.spec.ts\n';
		expect(changedFiles(git)).toEqual(
			new Set(['committed.spec.ts', 'edited.spec.ts', 'new.spec.ts', '']),
		);
		expect(
			changedFiles(() => {
				throw new Error('no base');
			}),
		).toBeUndefined();
	});
});
