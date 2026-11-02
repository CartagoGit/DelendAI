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
import { percentile } from './statistics.helper';
import type { IInvocationRecord } from './types';

const MEDIAN = 0.5;
const P95 = 0.95;
const P99 = 0.99;

export const rankToolResultSizes = (
	records: readonly IInvocationRecord[],
	limit: number,
): IResultSizeRanking => {
	const byTool = new Map<
		string,
		{
			readonly plugin: string;
			readonly tool: string;
			readonly bytes: number[];
		}
	>();
	for (const record of records) {
		if (typeof record.responseBytes !== 'number') continue;
		const key = `${record.plugin}\u0000${record.tool}`;
		const current = byTool.get(key) ?? {
			plugin: record.plugin,
			tool: record.tool,
			bytes: [],
		};
		current.bytes.push(record.responseBytes);
		byTool.set(key, current);
	}
	// The typical and the tail, not only the worst: one huge answer and
	// a tool whose every answer is big call for different fixes.
	const sizes: IToolResultSize[] = [...byTool.values()].map((entry) => ({
		plugin: entry.plugin,
		tool: entry.tool,
		calls: entry.bytes.length,
		totalBytes: entry.bytes.reduce((sum, bytes) => sum + bytes, 0),
		largestBytes: Math.max(...entry.bytes),
		p50Bytes: percentile(entry.bytes, MEDIAN) ?? 0,
		p95Bytes: percentile(entry.bytes, P95) ?? 0,
		p99Bytes: percentile(entry.bytes, P99) ?? 0,
	}));
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
