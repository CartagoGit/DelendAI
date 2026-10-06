/**
 * result-size-ranking.helper.ts — which tools cost the most context.
 *
 * Every invocation record carries the serialized size of its result
 * (`responseBytes`). The per-plugin percentiles say how big a plugin's
 * answers usually are; they do not say which tool to make compact first.
 * This ranks tools two ways: by the total they returned in the window
 * (what they cost overall) and by the largest single result (what one
 * call can cost).
 */
import type {
	IResultSizeRanking,
	IToolResultSize,
} from './contracts/result-size-ranking.interface';
import type { IInvocationRecord } from './types';

export const rankToolResultSizes = (
	records: readonly IInvocationRecord[],
	limit: number,
): IResultSizeRanking => {
	const byTool = new Map<string, IToolResultSize>();
	for (const record of records) {
		if (typeof record.responseBytes !== 'number') continue;
		const key = `${record.plugin}\u0000${record.tool}`;
		const current = byTool.get(key);
		byTool.set(key, {
			plugin: record.plugin,
			tool: record.tool,
			calls: (current?.calls ?? 0) + 1,
			totalBytes: (current?.totalBytes ?? 0) + record.responseBytes,
			largestBytes: Math.max(
				current?.largestBytes ?? 0,
				record.responseBytes,
			),
		});
	}
	const sizes = [...byTool.values()];
	const rank = (field: 'totalBytes' | 'largestBytes') =>
		[...sizes]
			.sort(
				(left, right) =>
					right[field] - left[field] ||
					left.tool.localeCompare(right.tool),
			)
			.slice(0, limit);
	return { byTotal: rank('totalBytes'), byLargest: rank('largestBytes') };
};
