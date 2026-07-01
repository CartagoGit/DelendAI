/**
 * In-process per-tool metrics.
 *
 * A tiny, dependency-free counter store: every instrumented tool call records
 * its latency, output size and error flag. Exposed via the `metrics` meta-tool
 * so an agent (or operator) can quantify cost — e.g. "how much does the compact
 * overview actually save". Process-local and advisory; not persisted.
 */

export interface IToolMetric {
	readonly calls: number;
	readonly errors: number;
	/** Cumulative handler latency in ms. */
	readonly totalMs: number;
	/** Slowest single call in ms. */
	readonly maxMs: number;
	/** Cumulative response text bytes (low-token budgeting). */
	readonly totalBytes: number;
}

export interface IMetricsSnapshot {
	/** Per-tool metrics, keyed by the registered tool name. */
	readonly tools: Record<string, IToolMetric>;
	readonly totals: {
		readonly calls: number;
		readonly errors: number;
		readonly totalMs: number;
		readonly totalBytes: number;
	};
}

export interface IMetricRecord {
	readonly ms: number;
	readonly bytes: number;
	readonly isError: boolean;
}

export interface IMetricsRegistry {
	record(tool: string, record: IMetricRecord): void;
	snapshot(): IMetricsSnapshot;
	reset(): void;
}

interface IMutableMetric {
	calls: number;
	errors: number;
	totalMs: number;
	maxMs: number;
	totalBytes: number;
}

const round = (n: number): number => Math.round(n);

/** Create a fresh metrics registry. */
export const createMetricsRegistry = (): IMetricsRegistry => {
	const map = new Map<string, IMutableMetric>();
	return {
		record(tool, rec) {
			const m = map.get(tool) ?? {
				calls: 0,
				errors: 0,
				totalMs: 0,
				maxMs: 0,
				totalBytes: 0,
			};
			m.calls += 1;
			if (rec.isError) m.errors += 1;
			m.totalMs += rec.ms;
			m.maxMs = Math.max(m.maxMs, rec.ms);
			m.totalBytes += rec.bytes;
			map.set(tool, m);
		},
		snapshot() {
			const tools: Record<string, IToolMetric> = {};
			let calls = 0;
			let errors = 0;
			let totalMs = 0;
			let totalBytes = 0;
			for (const [name, m] of [...map.entries()].sort((a, b) =>
				a[0].localeCompare(b[0]),
			)) {
				tools[name] = {
					calls: m.calls,
					errors: m.errors,
					totalMs: round(m.totalMs),
					maxMs: round(m.maxMs),
					totalBytes: m.totalBytes,
				};
				calls += m.calls;
				errors += m.errors;
				totalMs += m.totalMs;
				totalBytes += m.totalBytes;
			}
			return {
				tools,
				totals: { calls, errors, totalMs: round(totalMs), totalBytes },
			};
		},
		reset() {
			map.clear();
		},
	};
};

/** Estimate a tool result's response size (sum of text content lengths). */
export const estimateResultBytes = (result: unknown): number => {
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return 0;
	return content.reduce<number>((sum, part) => {
		const text = (part as { text?: unknown }).text;
		return sum + (typeof text === 'string' ? text.length : 0);
	}, 0);
};
