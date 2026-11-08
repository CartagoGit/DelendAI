import { describe, expect, it } from 'vitest';

import { judgeDeclaredBudgets, unbudgetedTests } from './declared-test-budget';

describe('declared test budgets', () => {
	it('counts a test with no options and passes one that declares a budget', {
		meta: { budgetMs: 50 },
	}, () => {
		const text = [
			"it('a', () => {});",
			"it('b', { meta: { budgetMs: 5 } }, () => {});",
			'test.only(`c`, { meta: { budgetMs: 5 } }, () => {});',
			"it('d', { timeout: 10 }, () => {});",
		].join('\n');
		expect(unbudgetedTests(text)).toBe(2);
	});

	it('ignores skipped tests and reads an each table leniently', {
		meta: { budgetMs: 50 },
	}, () => {
		expect(unbudgetedTests("it.skip('a', () => {});")).toBe(0);
		expect(
			unbudgetedTests(
				"it.each([1])('x %i', { meta: { budgetMs: 4 } }, () => {});",
			),
		).toBe(0);
		expect(unbudgetedTests("it.each([1])('x %i', () => {});")).toBe(1);
	});

	it('asks for budgets off the list and for the list to shrink', {
		meta: { budgetMs: 100 },
	}, () => {
		const files = new Map([
			['new.spec.ts', 2],
			['old.spec.ts', 3],
			['fixed.spec.ts', 0],
		]);
		const verdict = judgeDeclaredBudgets(
			files,
			new Set(['old.spec.ts', 'fixed.spec.ts', 'gone.spec.ts']),
		);
		expect(verdict.missing).toEqual([{ path: 'new.spec.ts', tests: 2 }]);
		expect(verdict.stale).toEqual(['fixed.spec.ts', 'gone.spec.ts']);
	});
});
