/**
 * error-envelope-ratchet.ts — the tools whose outputSchema does not model
 * the error envelope may only become fewer.
 *
 * The baseline lists them by id. A tool missing from it that does not model
 * the envelope is new debt and fails; a listed tool that now models it, or
 * no longer exists, fails too, so the list shrinks with the fix instead of
 * keeping room for the next regression.
 */

export interface IErrorEnvelopeRatchet {
	/** Tools that do not model the envelope and are not in the baseline. */
	readonly added: readonly string[];
	/** Baseline entries that model it now, or are no longer registered. */
	readonly stale: readonly string[];
}

export const compareErrorEnvelopeBaseline = (
	unmodelled: readonly string[],
	baseline: readonly string[],
	registered: readonly string[],
): IErrorEnvelopeRatchet => {
	const known = new Set(baseline);
	const now = new Set(unmodelled);
	const present = new Set(registered);
	return {
		added: [...now].filter((id) => !known.has(id)).sort(),
		stale: [...known]
			.filter((id) => !now.has(id) || !present.has(id))
			.sort(),
	};
};

/** Unmodelled tools per plugin, most first: the denominator of the debt. */
export const unmodelledByPlugin = (
	rows: readonly { readonly plugin: string; readonly tool: string }[],
): readonly { readonly plugin: string; readonly count: number }[] => {
	const counts = new Map<string, number>();
	for (const row of rows)
		counts.set(row.plugin, (counts.get(row.plugin) ?? 0) + 1);
	return [...counts]
		.map(([plugin, count]) => ({ plugin, count }))
		.sort((a, b) => b.count - a.count || a.plugin.localeCompare(b.plugin));
};
