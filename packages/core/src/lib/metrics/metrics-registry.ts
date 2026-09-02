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
	/** Canonical response cost breakdown (aggregate, no raw payloads). */
	readonly cost: {
		readonly contentTextBytes: number;
		readonly structuredJsonBytes: number;
		readonly wireEstimateBytes: number;
		readonly estimatedTokens: {
			readonly estimatedTokens4B: number;
			readonly actualModelTokens?: number;
		};
	};
}

export interface IMetricsSnapshot {
	/** Per-tool metrics, keyed by the registered tool name. */
	readonly tools: Record<string, IToolMetric>;
	readonly totals: {
		readonly calls: number;
		readonly errors: number;
		readonly totalMs: number;
		readonly totalBytes: number;
		readonly cost: {
			readonly contentTextBytes: number;
			readonly structuredJsonBytes: number;
			readonly wireEstimateBytes: number;
			readonly estimatedTokens: {
				readonly estimatedTokens4B: number;
				readonly actualModelTokens?: number;
			};
		};
	};
}

export interface IMetricRecord {
	readonly ms: number;
	readonly bytes: number;
	readonly cost?: {
		readonly contentTextBytes: number;
		readonly structuredJsonBytes: number;
		readonly wireEstimateBytes: number;
		readonly estimatedTokens: {
			readonly estimatedTokens4B: number;
			readonly actualModelTokens?: number;
		};
	};
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
	cost: {
		contentTextBytes: number;
		structuredJsonBytes: number;
		wireEstimateBytes: number;
		estimatedTokens4B: number;
		actualModelTokens: number | null;
	};
}

const round = (n: number): number => Math.round(n);
const MINIMUM_SAFE_ERROR_TEXT = 'error';

type MetricCost = NonNullable<IMetricRecord['cost']>;

const bytesOfText = (text: string): number => Buffer.byteLength(text, 'utf8');

const bytesOfJson = (value: unknown): number => {
	try {
		return bytesOfText(JSON.stringify(value));
	} catch {
		return 0;
	}
};

const estimateTokens4B = (wireEstimateBytes: number): number =>
	Math.ceil(wireEstimateBytes / 4);

const buildMetricCost = (
	contentTextBytes: number,
	structuredJsonBytes: number,
	actualModelTokens?: number,
): MetricCost => {
	const wireEstimateBytes = contentTextBytes + structuredJsonBytes;
	return {
		contentTextBytes,
		structuredJsonBytes,
		wireEstimateBytes,
		estimatedTokens: {
			estimatedTokens4B: estimateTokens4B(wireEstimateBytes),
			...(actualModelTokens !== undefined ? { actualModelTokens } : {}),
		},
	};
};

const fallbackMetricCost = (wireEstimateBytes: number): MetricCost =>
	buildMetricCost(wireEstimateBytes, 0);

const responseContentOf = (result: unknown): unknown[] => {
	const content =
		result !== null && typeof result === 'object'
			? (result as { content?: unknown }).content
			: undefined;
	return Array.isArray(content) ? content : [];
};

const structuredContentOf = (result: unknown): unknown =>
	result !== null && typeof result === 'object'
		? (result as { structuredContent?: unknown }).structuredContent
		: undefined;

const mutableCostToSnapshot = (
	cost: IMutableMetric['cost'],
): IToolMetric['cost'] => ({
	contentTextBytes: cost.contentTextBytes,
	structuredJsonBytes: cost.structuredJsonBytes,
	wireEstimateBytes: cost.wireEstimateBytes,
	estimatedTokens: {
		estimatedTokens4B: cost.estimatedTokens4B,
		...(cost.actualModelTokens !== null
			? { actualModelTokens: cost.actualModelTokens }
			: {}),
	},
});

const recordCostOrFallback = (record: IMetricRecord): MetricCost =>
	record.cost ?? fallbackMetricCost(record.bytes);

const isSafeTypedErrorText = (value: string): boolean =>
	value.length > 0 &&
	value.length <= 256 &&
	!/[\r\n\t\\/]/.test(value) &&
	!/(?:^|[^A-Za-z])[A-Za-z]:/.test(value) &&
	!/[?&=]/.test(value);

const extractSafeTypedErrorText = (error: unknown): string | null => {
	if (typeof error === 'string') {
		return isSafeTypedErrorText(error) ? error : null;
	}
	if (error === null || typeof error !== 'object') return null;
	for (const key of ['reason', 'message'] as const) {
		const candidate = (error as Record<string, unknown>)[key];
		if (typeof candidate === 'string' && isSafeTypedErrorText(candidate)) {
			return candidate;
		}
	}
	return null;
};

/** Create a fresh metrics registry. */
export const createMetricsRegistry = (): IMetricsRegistry => {
	const map = new Map<string, IMutableMetric>();
	return {
		record(tool, rec) {
			const cost = recordCostOrFallback(rec);
			const m = map.get(tool) ?? {
				calls: 0,
				errors: 0,
				totalMs: 0,
				maxMs: 0,
				totalBytes: 0,
				cost: {
					contentTextBytes: 0,
					structuredJsonBytes: 0,
					wireEstimateBytes: 0,
					estimatedTokens4B: 0,
					actualModelTokens: null,
				},
			};
			m.calls += 1;
			if (rec.isError) m.errors += 1;
			m.totalMs += rec.ms;
			m.maxMs = Math.max(m.maxMs, rec.ms);
			m.totalBytes += cost.wireEstimateBytes;
			m.cost.contentTextBytes += cost.contentTextBytes;
			m.cost.structuredJsonBytes += cost.structuredJsonBytes;
			m.cost.wireEstimateBytes += cost.wireEstimateBytes;
			m.cost.estimatedTokens4B += cost.estimatedTokens.estimatedTokens4B;
			if (cost.estimatedTokens.actualModelTokens !== undefined) {
				m.cost.actualModelTokens =
					(m.cost.actualModelTokens ?? 0) +
					cost.estimatedTokens.actualModelTokens;
			}
			map.set(tool, m);
		},
		snapshot() {
			const tools: Record<string, IToolMetric> = {};
			let calls = 0;
			let errors = 0;
			let totalMs = 0;
			let totalBytes = 0;
			const totalCost: IMutableMetric['cost'] = {
				contentTextBytes: 0,
				structuredJsonBytes: 0,
				wireEstimateBytes: 0,
				estimatedTokens4B: 0,
				actualModelTokens: null,
			};
			for (const [name, m] of [...map.entries()].sort((a, b) =>
				a[0].localeCompare(b[0]),
			)) {
				tools[name] = {
					calls: m.calls,
					errors: m.errors,
					totalMs: round(m.totalMs),
					maxMs: round(m.maxMs),
					totalBytes: m.totalBytes,
					cost: mutableCostToSnapshot(m.cost),
				};
				calls += m.calls;
				errors += m.errors;
				totalMs += m.totalMs;
				totalBytes += m.totalBytes;
				totalCost.contentTextBytes += m.cost.contentTextBytes;
				totalCost.structuredJsonBytes += m.cost.structuredJsonBytes;
				totalCost.wireEstimateBytes += m.cost.wireEstimateBytes;
				totalCost.estimatedTokens4B += m.cost.estimatedTokens4B;
				if (m.cost.actualModelTokens !== null) {
					totalCost.actualModelTokens =
						(totalCost.actualModelTokens ?? 0) +
						m.cost.actualModelTokens;
				}
			}
			return {
				tools,
				totals: {
					calls,
					errors,
					totalMs: round(totalMs),
					totalBytes,
					cost: mutableCostToSnapshot(totalCost),
				},
			};
		},
		reset() {
			map.clear();
		},
	};
};

/** Estimate the public responseBytes contract from text content only. */
export const estimateResponseBytes = (result: unknown): number =>
	responseContentOf(result).reduce<number>((sum, part) => {
		const text = (part as { text?: unknown }).text;
		return sum + (typeof text === 'string' ? bytesOfText(text) : 0);
	}, 0);

/** Back-compat alias: response text bytes, not the full wire estimate. */
export const estimateResultBytes = (result: unknown): number =>
	estimateResponseBytes(result);

/** Estimate the public response cost from text + structured JSON only. */
export const estimateResultCost = (result: unknown): MetricCost => {
	const contentTextBytes = estimateResponseBytes(result);
	const structured = structuredContentOf(result);
	const structuredJsonBytes =
		structured !== undefined ? bytesOfJson(structured) : 0;
	return buildMetricCost(contentTextBytes, structuredJsonBytes);
};

/**
 * Error responses are measured from the safe tool envelope when present.
 * For thrown exceptions with no public envelope yet, record only a small,
 * path-free fallback or a conservative typed message if it passes privacy checks.
 */
export const estimateErrorCost = (
	result: unknown,
	error: unknown,
): MetricCost => {
	const resultCost = estimateResultCost(result);
	if (resultCost.wireEstimateBytes > 0) return resultCost;
	const typedText =
		extractSafeTypedErrorText(error) ?? MINIMUM_SAFE_ERROR_TEXT;
	return buildMetricCost(bytesOfText(typedText), 0);
};
