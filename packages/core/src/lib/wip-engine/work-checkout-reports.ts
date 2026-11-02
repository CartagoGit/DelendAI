/**
 * work-checkout-reports.ts — how the checkout publisher's passes reach the
 * server's log without repeating themselves.
 */

/**
 * A report writer that writes, of each pass, only the units whose outcome
 * changed since the last pass that named them. The publisher runs every
 * few minutes; comparing whole reports re-wrote an idle unit's "no
 * commits of its own yet" every time another unit came or went, so the
 * same line filled the server's log for a day.
 */
export const changedReports = (
	write: (line: string) => void,
): ((moved: unknown) => void) => {
	const last = new Map<string, string>();
	return (moved) => {
		const entries = Array.isArray(moved) ? moved : [moved];
		const changed = entries.filter((entry) => {
			const ref =
				typeof entry === 'object' && entry !== null && 'ref' in entry
					? String((entry as { ref: unknown }).ref)
					: JSON.stringify(entry);
			const said = JSON.stringify(entry);
			if (last.get(ref) === said) return false;
			last.set(ref, said);
			return true;
		});
		if (changed.length === 0) return;
		write(
			JSON.stringify({
				event: 'work-checkouts.published',
				moved: changed,
			}),
		);
	};
};
