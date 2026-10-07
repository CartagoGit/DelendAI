/**
 * baseline-growth.helper.ts — the one guard that makes a ratchet a
 * ratchet.
 *
 * A per-file baseline only holds the line if `--update` cannot quietly
 * raise it. Without this check the escape from any of these gates is a
 * single command: run `--update`, commit the bigger baseline, and the
 * gate reports green forever after on debt it just absorbed.
 *
 * c00529's acceptance asks for exactly this on every ratchet script.
 * Only `types-in-contracts` and `biome-baseline` had it; `type-naming`,
 * `test-unsafe-casts` and `file-conventions` would each have written a
 * larger baseline without a word. This is that check, in one place, so
 * the next ratchet inherits it instead of re-deriving it.
 *
 * Shrinking is always allowed and never needs a reason: a baseline that
 * only goes down is the whole point.
 */

/** Files whose count would RISE if `current` were written as the baseline. */
export const countBaselineGrowth = (
	current: Readonly<Record<string, number>>,
	baseline: Readonly<Record<string, number>>,
): readonly string[] =>
	Object.entries(current)
		.filter(([rel, count]) => count > (baseline[rel] ?? 0))
		.map(
			([rel, count]) =>
				`${rel}: ${String(baseline[rel] ?? 0)} -> ${String(count)}`,
		)
		.sort((a, b) => a.localeCompare(b));

/** Entries that would be ADDED to a set-shaped baseline. */
export const setBaselineGrowth = (
	current: readonly string[],
	baseline: ReadonlySet<string>,
): readonly string[] =>
	[...new Set(current)].filter((rel) => !baseline.has(rel)).sort();

/** `--reason=x` or `--reason x`. */
export const readReasonFlag = (argv: readonly string[]): string | undefined => {
	const inline = argv.find((arg) => arg.startsWith('--reason='));
	if (inline !== undefined) return inline.slice('--reason='.length);
	const index = argv.indexOf('--reason');
	return index >= 0 ? argv[index + 1] : undefined;
};

/**
 * Decide whether an `--update` may write a larger baseline.
 *
 * Returns the message to print and refuse with, or `undefined` when the
 * write is allowed. Growth needs BOTH `--allow-baseline-growth` and a
 * non-empty `--reason`, so accepting debt stays a deliberate, traceable
 * act rather than a keystroke.
 */
export const refuseBaselineGrowth = (input: {
	readonly gate: string;
	readonly growth: readonly string[];
	readonly argv: readonly string[];
	/** The flag the caller used, so the message names the real one. */
	readonly updateFlag?: string;
}): string | undefined => {
	if (input.growth.length === 0) return undefined;
	const args = new Set(input.argv);
	const reason = readReasonFlag(input.argv);
	if (args.has('--allow-baseline-growth') && (reason?.trim() ?? '') !== '') {
		return undefined;
	}
	return (
		`✖ ${input.gate}: ${input.updateFlag ?? '--update'} would grow the baseline for ${String(input.growth.length)} entr${input.growth.length === 1 ? 'y' : 'ies'}. ` +
		'Use --allow-baseline-growth --reason="..." for an explicit exception.\n' +
		`${input.growth.join('\n')}\n`
	);
};
