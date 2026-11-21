/**
 * declared-test-budget.ts — the static half of the time budgets: a budget a
 * unit-tier spec declares may not promise more than the unit limit. A test's
 * time is judged by its estimate from history; no spec is asked to name a
 * budget on every test, so editing one line forces nothing on the others.
 */

import { freshBudgetsOfDiff } from '../../../packages/test-kit/src/lib/time-budget/fresh-budget.helper.ts';
import { isE2eSpec } from '../../../packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts';
import {
	BUDGET_PREFIX,
	UNIT_LIMIT_MS,
} from '../../../packages/test-kit/src/contracts/constants/time-budget.constant.ts';

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

/** The content of the string literal that starts at `from`, if one does. */
const stringAt = (text: string, from: number): string | undefined => {
	const end = endOfString(text, from);
	return end === undefined ? undefined : text.slice(from + 1, end - 1);
};

/**
 * The budgets a spec's test names declare above the unit limit, in the
 * order written. In a unit-tier file a budget is documentation the judge
 * ignores, and none may promise more than the unit tier allows.
 */
export const budgetsOverUnitLimit = (text: string): readonly number[] => {
	const over: number[] = [];
	for (const call of text.matchAll(PLAIN_CALL)) {
		if (
			(call[1] ?? '').includes('.skip') ||
			inString(text, call.index ?? 0)
		) {
			continue;
		}
		const name = stringAt(
			text,
			skipSpaces(text, (call.index ?? 0) + call[0].length),
		);
		const budget = /^\[<(\d+(?:\.\d+)?)ms\] /u.exec(name ?? '')?.[1];
		if (budget !== undefined && Number(budget) > UNIT_LIMIT_MS) {
			over.push(Number(budget));
		}
	}
	return over;
};

/** A unit-tier spec the change touches that declares a budget over the limit. */
export interface IUnitLimitBreach {
	readonly path: string;
	readonly budgets: readonly number[];
}

/**
 * The unit-tier files that declare a budget over the unit limit, asked of
 * the files a change writes (with no change known, every file): an e2e file
 * is not asked.
 */
export const judgeUnitLimit = (
	over: ReadonlyMap<string, readonly number[]>,
	changed?: ReadonlySet<string>,
): readonly IUnitLimitBreach[] =>
	[...over]
		.filter(
			([path, budgets]) =>
				budgets.length > 0 &&
				!isE2eSpec(path) &&
				(changed === undefined || changed.has(path)),
		)
		.map(([path, budgets]) => ({ path, budgets }))
		.sort((a, b) => a.path.localeCompare(b.path));

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

/**
 * Whether a test is on its first run: the change declares or changes its
 * budget (`fresh`, `file<TAB>name` lines), or no estimate holds its id yet.
 * Such a run has nothing to be judged against, so it never blocks.
 */
export const isFirstRun = (
	file: string,
	name: string,
	fresh: readonly string[] | undefined,
	estimates: Readonly<Record<string, number>>,
): boolean =>
	fresh?.includes(`${file}\t${name}`) === true ||
	!(`${file} > ${name.replace(BUDGET_PREFIX, '')}` in estimates);
