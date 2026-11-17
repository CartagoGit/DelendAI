/**
 * rehearsal-pool.helper.ts — plays the items of a list with at most `limit`
 * in flight and returns the results in the list's own order, whatever order
 * they finish in.
 */

/** Maps `items` through `play` with at most `limit` running at once; results keep the order of `items`. */
export const playPooled = async <T, R>(
	items: readonly T[],
	limit: number,
	play: (item: T, index: number) => Promise<R>,
): Promise<readonly R[]> => {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = next;
			next += 1;
			const item = items[index];
			if (index >= items.length || item === undefined) return;
			results[index] = await play(item, index);
		}
	};
	const width = Math.max(1, Math.min(Math.floor(limit), items.length));
	await Promise.all(Array.from({ length: width }, worker));
	return results;
};
