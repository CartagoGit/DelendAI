/**
 * fresh-budget.helper.ts — the budgets a change declares or changes.
 *
 * A budget is calibrated from what CI measured, and a number the change
 * itself writes has never been measured there: it can only come from the
 * author's machine. Such a budget does not fail the shard when CI runs over
 * it; the merge step names the calibrated number and fails the change until
 * the spec carries it. Every other budget fails as it always did.
 */

/** A quoted test name that starts with its budget, on one source line. */
const BUDGETED_NAME = /(['"`])(\[<\d+(?:\.\d+)?ms\] (?:\\.|(?!\1)[^\\])*)\1/gu;

/** `+++ b/<path>`: the file the following hunks change. */
const NEW_FILE = /^\+\+\+ (?:b\/)?(.+)$/u;

/**
 * The `file<TAB>name` of every budgeted test name on an added line of a
 * unified diff (`git diff -U0`), the name unescaped as the runner sees it.
 */
export const freshBudgetsOfDiff = (diff: string): readonly string[] => {
	const fresh = new Set<string>();
	let file: string | undefined;
	for (const line of diff.split('\n')) {
		const header = NEW_FILE.exec(line);
		if (header !== null) {
			file = header[1] === '/dev/null' ? undefined : header[1];
			continue;
		}
		if (file === undefined || !line.startsWith('+')) continue;
		for (const match of line.matchAll(BUDGETED_NAME)) {
			fresh.add(`${file}\t${(match[2] ?? '').replace(/\\(.)/gu, '$1')}`);
		}
	}
	return [...fresh];
};
