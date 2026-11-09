/**
 * error-envelope-report.ts — how many tools declare a schema that does not
 * model the error envelope.
 *
 * Informative, not a gate: an error travels as text (content[0].text
 * carries the whole envelope) and the host drops a structuredContent the
 * schema rejects, so a listing client never refuses one. Modelling the
 * envelope in every schema would add its bytes to every tools/list for a
 * structure the text already holds.
 */

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
