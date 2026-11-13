/**
 * declared-test-budget.ts — the static half of "every test has a maximum
 * time" (the run itself is the other half: the test-kit runner fails a
 * test with no budget, or over it).
 *
 * A spec file that is not on the migration list must start the name of
 * every `it`/`test` with its budget, `[<7ms] does X`. A file on the list may still hold tests with none,
 * and the list only ever shrinks: a file that no longer needs its entry
 * must drop it, so it cannot slide back.
 */

import { freshBudgetsOfDiff } from '../../../packages/test-kit/src/lib/time-budget/fresh-budget.helper.ts';
import { mayGoUnbudgeted } from '../../../packages/test-kit/src/lib/time-budget/may-go-unbudgeted.helper.ts';

/** A call to `it`/`test` (not `.each`), up to and including its `(`. */
const PLAIN_CALL =
	/\b(?:it|test)((?:\.(?:only|skip|fails|concurrent|sequential))*)\s*\(/gu;

/** `it.each(table)(` and its kin, whose name sits after a second `(`. */
const EACH_CALL = /\b(?:it|test)(?:\.[a-z]+)*\.each\b/gu;

/** A call written inside a string (a fixture) is not a test. */
const inString = (text: string, at: number): boolean =>
	/["'`]/u.test(text.charAt(at - 1));

const skipSpaces = (text: string, from: number): number => {
	let index = from;
	while (index < text.length && /\s/u.test(text.charAt(index))) index += 1;
	return index;
};

/** The index just past the string literal that starts at `from`, if one does. */
const endOfString = (text: string, from: number): number | undefined => {
	const quote = text.charAt(from);
	if (quote !== "'" && quote !== '"' && quote !== '`') return undefined;
	let index = from + 1;
	while (index < text.length) {
		const char = text.charAt(index);
		if (char === '\\') index += 2;
		else if (char === quote) return index + 1;
		else index += 1;
	}
	return undefined;
};

/** What a budget looks like at the front of a test name's content. */
const BUDGET_NAME = /^\[<\d+(?:\.\d+)?ms\] /u;

/** The content of the string literal that starts at `from`, if one does. */
const stringAt = (text: string, from: number): string | undefined => {
	const end = endOfString(text, from);
	return end === undefined ? undefined : text.slice(from + 1, end - 1);
};

/** Whether the call whose `(` ends at `afterParen` names itself with a budget. */
const declares = (text: string, afterParen: number): boolean => {
	const start = skipSpaces(text, afterParen);
	const name = stringAt(text, start);
	// A name that is not a literal (a variable, a call) cannot be read.
	return name === undefined || BUDGET_NAME.test(name);
};

/** How many tests in this text declare no budget. */
export const unbudgetedTests = (text: string): number => {
	let missing = 0;
	for (const call of text.matchAll(PLAIN_CALL)) {
		const modifiers = call[1] ?? '';
		if (modifiers.includes('.skip') || inString(text, call.index ?? 0)) {
			continue;
		}
		if (!declares(text, (call.index ?? 0) + call[0].length)) missing += 1;
	}
	for (const call of text.matchAll(EACH_CALL)) {
		if (inString(text, call.index ?? 0)) continue;
		const from = (call.index ?? 0) + call[0].length;
		// Lenient on purpose: the name sits after a second call's `(`. The run
		// still fails the test that has no budget.
		if (!text.slice(from, from + 400).includes('[<')) missing += 1;
	}
	return missing;
};

/** The verdict on one repository against its migration list. */
export interface IDeclaredBudgetVerdict {
	/** Spec files off the list that hold tests with no budget. */
	readonly missing: readonly {
		readonly path: string;
		readonly tests: number;
	}[];
	/** List entries that no longer need to be there (kept or fixed). */
	readonly stale: readonly string[];
	/**
	 * Spec files the change touches that are still on the list: an edited
	 * spec complies in full and leaves it.
	 */
	readonly touched: readonly string[];
}

export const judgeDeclaredBudgets = (
	files: ReadonlyMap<string, number>,
	listed: ReadonlySet<string>,
	changed?: ReadonlySet<string>,
): IDeclaredBudgetVerdict => ({
	// A budget is asked of the files a change writes (the run holds the same
	// rule): with no change known, every file off the list is asked.
	missing: [...files]
		.filter(
			([path, tests]) =>
				tests > 0 && !mayGoUnbudgeted(path, listed, changed),
		)
		.map(([path, tests]) => ({ path, tests }))
		.sort((a, b) => a.path.localeCompare(b.path)),
	stale: [...listed]
		.filter((path) => (files.get(path) ?? 0) === 0)
		.sort((a, b) => a.localeCompare(b)),
	touched: [...listed]
		.filter(
			(path) => changed?.has(path) === true && (files.get(path) ?? 0) > 0,
		)
		.sort((a, b) => a.localeCompare(b)),
});

/** The integration branch the prove plan measures a change against. */
export const INTEGRATION_REF = 'origin/develop';

/**
 * The base a change is measured against when none is given: the merge-base
 * of HEAD with the integration branch, or nothing when that ref is absent
 * (a shallow clone, a fresh repository). `git` answers one command's stdout
 * and throws when it fails.
 */
export const defaultChangeBase = (
	git: (args: readonly string[]) => string,
): string | undefined => {
	try {
		const base = git(['merge-base', INTEGRATION_REF, 'HEAD']).trim();
		return base === '' ? undefined : base;
	} catch {
		return undefined;
	}
};

/**
 * The files a change touches: committed since the merge-base with the
 * integration branch, edited, staged or new in the working tree. `undefined`
 * when the base is unknown, so nothing is let off for want of a diff.
 */
export const changedFiles = (
	git: (args: readonly string[]) => string,
): ReadonlySet<string> | undefined => {
	const base = defaultChangeBase(git);
	if (base === undefined) return undefined;
	try {
		return new Set(
			[
				['diff', '--name-only', `${base}...HEAD`],
				['diff', '--name-only', 'HEAD'],
				['ls-files', '--others', '--exclude-standard'],
			].flatMap((args) => git(args).split('\n')),
		);
	} catch {
		return undefined;
	}
};

/**
 * The budgets the change declares or changes (`file<TAB>name`): budgeted
 * names on lines it adds since the merge-base, in the working tree, or in a
 * new untracked file. `undefined` when the base is unknown, so no budget is
 * let off for want of a diff.
 */
export const freshBudgets = (
	git: (args: readonly string[]) => string,
	read: (path: string) => string,
): readonly string[] | undefined => {
	const base = defaultChangeBase(git);
	if (base === undefined) return undefined;
	try {
		const untracked = git(['ls-files', '--others', '--exclude-standard'])
			.split('\n')
			.filter((path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path))
			.map(
				(path) =>
					`+++ b/${path}\n${read(path)
						.split('\n')
						.map((line) => `+${line}`)
						.join('\n')}`,
			);
		return freshBudgetsOfDiff(
			[
				git(['diff', '-U0', `${base}...HEAD`]),
				git(['diff', '-U0', 'HEAD']),
				...untracked,
			].join('\n'),
		);
	} catch {
		return undefined;
	}
};
