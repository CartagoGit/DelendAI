/**
 * spec-timings.ts — how long each spec file takes, and a split of a zone's
 * specs into shards of about equal time.
 *
 * `vitest --shard` splits a zone's files by count, and their cost is very
 * uneven: on one full run the shards took between 75 s and 244 s, so most
 * runners idled while the two heaviest finished. Assigning the longest
 * spec first to the least loaded shard brings every shard close to the
 * mean with the same number of runners.
 */

/** The part of vitest's JSON report the timings are read from. */
export interface IVitestJsonReport {
	readonly testResults?: readonly {
		readonly name?: string;
		readonly startTime?: number;
		readonly endTime?: number;
	}[];
}

/** Each spec file's duration in milliseconds, by its path from `root`. */
export const timingsFromJsonReport = (
	report: IVitestJsonReport,
	root: string,
): Readonly<Record<string, number>> => {
	const prefix = `${root.replace(/\/+$/u, '')}/`;
	const timings: Record<string, number> = {};
	for (const result of report.testResults ?? []) {
		if (
			typeof result.name !== 'string' ||
			typeof result.startTime !== 'number' ||
			typeof result.endTime !== 'number'
		) {
			continue;
		}
		const path = result.name.startsWith(prefix)
			? result.name.slice(prefix.length)
			: result.name;
		timings[path] = Math.max(
			0,
			Math.round(result.endTime - result.startTime),
		);
	}
	return Object.fromEntries(
		Object.entries(timings).sort(([a], [b]) => a.localeCompare(b)),
	);
};

const median = (values: readonly number[]): number => {
	if (values.length === 0) return 1;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 1;
};

/**
 * `specs` split into `shards` lists of about equal expected time: longest
 * first, each to the least loaded shard. A spec with no recorded time
 * counts as the median of those that have one. Every spec lands in exactly
 * one list; ties go to the lower shard, so the split is deterministic.
 */
export const balanceByTime = (
	specs: readonly string[],
	shards: number,
	timings: Readonly<Record<string, number>>,
): readonly (readonly string[])[] => {
	const count = Math.max(1, shards);
	const fallback = median(
		specs.flatMap((spec) => {
			const known = timings[spec];
			return known === undefined ? [] : [known];
		}),
	);
	const weighted = [...new Set(specs)]
		.map((spec) => ({ spec, cost: timings[spec] ?? fallback }))
		.sort((a, b) => b.cost - a.cost || a.spec.localeCompare(b.spec));
	const loads = Array.from({ length: count }, () => 0);
	const lists: string[][] = Array.from({ length: count }, () => []);
	for (const { spec, cost } of weighted) {
		let lightest = 0;
		for (let shard = 1; shard < count; shard += 1) {
			if ((loads[shard] ?? 0) < (loads[lightest] ?? 0)) lightest = shard;
		}
		loads[lightest] = (loads[lightest] ?? 0) + cost;
		lists[lightest]?.push(spec);
	}
	return lists.map((list) => list.sort());
};
