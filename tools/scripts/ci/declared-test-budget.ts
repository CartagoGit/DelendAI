/**
 * declared-test-budget.ts — the static half of "every test has a maximum
 * time" (the run itself is the other half: the test-kit runner fails a
 * test with no budget, or over it).
 *
 * A spec file that is not on the migration list must declare a budget on
 * every `it`/`test`. A file on the list may still hold tests with none,
 * and the list only ever shrinks: a file that no longer needs its entry
 * must drop it, so it cannot slide back.
 */

/** A call to `it`/`test` (not `.each`), up to and including its `(`. */
const PLAIN_CALL =
	/\b(?:it|test)((?:\.(?:only|skip|fails|concurrent|sequential))*)\s*\(/gu;

/** `it.each(table)(` and its kin, whose name sits after a second `(`. */
const EACH_CALL = /\b(?:it|test)(?:\.[a-z]+)*\.each\b/gu;

/** How far past a name its options object is looked for. */
const OPTIONS_WINDOW = 200;

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

/** Whether the call whose `(` ends at `afterParen` declares `budgetMs`. */
const declares = (text: string, afterParen: number): boolean => {
	const nameEnd = endOfString(text, skipSpaces(text, afterParen));
	if (nameEnd === undefined) return true;
	const comma = skipSpaces(text, nameEnd);
	if (text.charAt(comma) !== ',') return false;
	const options = text.slice(
		skipSpaces(text, comma + 1),
		skipSpaces(text, comma + 1) + OPTIONS_WINDOW,
	);
	return options.startsWith('{') && options.includes('budgetMs');
};

/** How many tests in this text declare no budget. */
export const unbudgetedTests = (text: string): number => {
	let missing = 0;
	for (const call of text.matchAll(PLAIN_CALL)) {
		const modifiers = call[1] ?? '';
		if (modifiers.includes('.skip')) continue;
		if (!declares(text, (call.index ?? 0) + call[0].length)) missing += 1;
	}
	for (const call of text.matchAll(EACH_CALL)) {
		const from = (call.index ?? 0) + call[0].length;
		// Lenient on purpose: the budget sits after a second call's name.
		// The run still fails the test that has none.
		if (!text.slice(from, from + 400).includes('budgetMs')) missing += 1;
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
}

export const judgeDeclaredBudgets = (
	files: ReadonlyMap<string, number>,
	listed: ReadonlySet<string>,
): IDeclaredBudgetVerdict => ({
	missing: [...files]
		.filter(([path, tests]) => tests > 0 && !listed.has(path))
		.map(([path, tests]) => ({ path, tests }))
		.sort((a, b) => a.path.localeCompare(b.path)),
	stale: [...listed]
		.filter((path) => (files.get(path) ?? 0) === 0)
		.sort((a, b) => a.localeCompare(b)),
});
