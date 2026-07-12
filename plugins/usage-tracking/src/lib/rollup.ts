/**
 * rollup.ts — read `invocations.jsonl` and fold it into rollups.
 *
 * Pure, cheap groupby over the NDJSON log (well under 100ms for tens of
 * thousands of lines in Bun). The read is tolerant: a truncated or
 * partially-flushed final line is skipped, never fatal — the log is
 * observability, not a transactional store.
 *
 * The write side goes through `writeFileAtomic` under `withFileMutex`,
 * piped through `redactSecrets` first (AGENTS.md rules 4 + 6), same as
 * every other durable write in this plugin.
 */
import { readFile } from 'node:fs/promises';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { countAutoBypassed } from './auto-bypass';
import {
	computeLimitsStatus,
	emptyLimitsStatus,
	type ILimitsConfig,
} from './circuit-breaker';
import type {
	GroupByAxis,
	IDegradation,
	IInvocationRecord,
	IRollupBucket,
	IRollupTotals,
	IUsageSummary,
	SortBy,
} from './types';

/** Parse the NDJSON log, skipping blank/corrupt lines. */
export const readInvocations = async (
	absPath: string,
): Promise<IInvocationRecord[]> => {
	let raw: string;
	try {
		raw = await readFile(absPath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
	const out: IInvocationRecord[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			out.push(JSON.parse(trimmed) as IInvocationRecord);
		} catch {
			// Skip a partially-written tail line; the next flush completes it.
		}
	}
	return out;
};

/** Filter to records whose `ts` falls within the last `windowDays`. */
export const withinWindow = (
	records: readonly IInvocationRecord[],
	windowDays: number,
	now: number = Date.now(),
): IInvocationRecord[] => {
	if (!Number.isFinite(windowDays) || windowDays <= 0) return [...records];
	const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
	return records.filter((r) => {
		const ts = Date.parse(r.ts);
		return Number.isNaN(ts) || ts >= cutoff;
	});
};

const axisKey = (record: IInvocationRecord, axis: GroupByAxis): string => {
	switch (axis) {
		case 'provider':
			return record.model?.provider ?? 'unknown';
		case 'plugin':
			return record.plugin;
		case 'agent':
			return record.agent.id;
		case 'extension':
			return record.agent.extension;
		case 'model':
			// f00106 S1a: attribute spend/tokens to the LLM that handled the
			// call. Only orchestrated calls carry a model; plain plugin/core
			// calls (model: null) collect in an explicit `unattributed`
			// bucket so nothing is silently dropped.
			return record.model
				? `${record.model.provider}/${record.model.modelId}`
				: 'unattributed';
	}
};

/** Fold records into buckets keyed by `axis`, sorted by `sortBy` desc. */
export const bucketBy = (
	records: readonly IInvocationRecord[],
	axis: GroupByAxis,
	sortBy: SortBy = 'calls',
): IRollupBucket[] => {
	const map = new Map<string, IRollupBucket>();
	for (const record of records) {
		const key = axisKey(record, axis);
		const prev =
			map.get(key) ??
			({
				key,
				calls: 0,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				costUsd: 0,
				errors: 0,
				autoBypassed: 0,
			} satisfies IRollupBucket);
		map.set(key, {
			key,
			calls: prev.calls + 1,
			inputTokens: prev.inputTokens + (record.usage?.inputTokens ?? 0),
			outputTokens: prev.outputTokens + (record.usage?.outputTokens ?? 0),
			totalTokens: prev.totalTokens + (record.usage?.totalTokens ?? 0),
			costUsd: prev.costUsd + (record.costUsd ?? 0),
			errors: prev.errors + (record.outcome === 'success' ? 0 : 1),
			autoBypassed: prev.autoBypassed + (record.autoBypassed ? 1 : 0),
		});
	}
	return [...map.values()].sort((a, b) => b[sortBy] - a[sortBy]);
};

export const computeTotals = (
	records: readonly IInvocationRecord[],
): IRollupTotals => {
	let calls = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let totalTokens = 0;
	let costUsd = 0;
	let errors = 0;
	let autoBypassed = 0;
	for (const record of records) {
		calls += 1;
		inputTokens += record.usage?.inputTokens ?? 0;
		outputTokens += record.usage?.outputTokens ?? 0;
		totalTokens += record.usage?.totalTokens ?? 0;
		costUsd += record.costUsd ?? 0;
		if (record.outcome !== 'success') errors += 1;
		if (record.autoBypassed) autoBypassed += 1;
	}
	return {
		calls,
		inputTokens,
		outputTokens,
		totalTokens,
		costUsd,
		errors,
		autoBypassed,
	};
};

/** Extra inputs the summary needs beyond the raw window (S7). */
export interface IBuildSummaryOptions {
	/** When set, the circuit breaker's rolling spend status is computed. */
	readonly limits?: ILimitsConfig | undefined;
	/** Prior degradations to carry forward (the log is append-only). */
	readonly degradations?: readonly IDegradation[] | undefined;
}

/**
 * Build the full `usage-summary.json` document from the raw log. The rolling
 * limit windows (S7) are computed over ALL records — never the display window
 * — so a short `windowDays` for the report never hides a monthly-cap breach.
 */
export const buildSummary = (
	records: readonly IInvocationRecord[],
	windowDays: number,
	now: number = Date.now(),
	options: IBuildSummaryOptions = {},
): IUsageSummary => {
	const windowed = withinWindow(records, windowDays, now);
	return {
		updatedAt: new Date(now).toISOString(),
		windowDays,
		totals: computeTotals(windowed),
		byProvider: bucketBy(windowed, 'provider', 'costUsd'),
		byPlugin: bucketBy(windowed, 'plugin', 'costUsd'),
		byAgent: bucketBy(windowed, 'agent', 'costUsd'),
		byExtension: bucketBy(windowed, 'extension', 'costUsd'),
		autoBypassed: countAutoBypassed(windowed),
		limitsStatus: options.limits
			? computeLimitsStatus(records, options.limits, now)
			: emptyLimitsStatus(),
		degradations: options.degradations ?? [],
	};
};

/** Serialize + redact + atomic write. Caller must hold the file mutex. */
const writeSummaryUnlocked = async (
	absPath: string,
	summary: IUsageSummary,
): Promise<void> => {
	const { text } = redactSecrets(`${JSON.stringify(summary, null, '\t')}\n`);
	await writeFileAtomic(absPath, text);
};

/** Durably persist a rollup document (mutex + atomic + redact). */
export const writeSummary = async (
	absPath: string,
	summary: IUsageSummary,
): Promise<void> => {
	await withFileMutex(absPath, () => writeSummaryUnlocked(absPath, summary));
};

/** Best-effort read of the persisted summary (missing/corrupt → null). */
export const readSummary = async (
	summaryPath: string,
): Promise<IUsageSummary | null> => {
	try {
		const raw = await readFile(summaryPath, 'utf8');
		return JSON.parse(raw) as IUsageSummary;
	} catch {
		return null;
	}
};

/**
 * Read + rebuild + persist the summary in one shot (the 5-min tick). Carries
 * forward the append-only `degradations` log from the prior file so a
 * regeneration never drops a recorded degradation, and folds in the S7
 * circuit-breaker limits when a cap is configured.
 */
export const regenerateSummary = async (
	invocationsPath: string,
	summaryPath: string,
	windowDays: number,
	now: number = Date.now(),
	limits?: ILimitsConfig | undefined,
): Promise<IUsageSummary> => {
	const records = await readInvocations(invocationsPath);
	// x00097 S3 (audit a00052 #13): prior-read → build → write is ONE
	// transaction under the summary mutex. Reading the prior degradations
	// outside it raced `recordDegradation` (which appends under the same
	// mutex) — a degradation recorded between the read and the write was
	// overwritten with the stale list and silently lost.
	return withFileMutex(summaryPath, async () => {
		const prior = await readSummary(summaryPath);
		const summary = buildSummary(records, windowDays, now, {
			limits,
			degradations: prior?.degradations ?? [],
		});
		await writeSummaryUnlocked(summaryPath, summary);
		return summary;
	});
};
