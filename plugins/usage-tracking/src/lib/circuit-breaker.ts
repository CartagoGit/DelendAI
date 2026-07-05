/**
 * circuit-breaker.ts — session/monthly spend limits (f00067 S7).
 *
 * Lives in `usage-tracking` (NOT in `orchestrator-runner`) because it is a
 * pure OBSERVER of the append-only log: it folds `invocations.jsonl` into two
 * INDEPENDENT rolling spend numbers and compares each against its own cap.
 *
 * CRITICAL S7 invariant ("mandatory windows never averaged"): the session
 * window (since session start) and the calendar-month window are computed and
 * breached SEPARATELY. There is no blended "spend rate" — each scope has its
 * own `observedUsd`, `limitUsd`, `pct` and independent breach test, exactly
 * like the quota-merge rule that refuses to combine hourly + monthly (S5).
 *
 * The computed {@link ILimitsStatus} is written into `usage-summary.json` by
 * the rollup; the durable `degradations` log is appended here through the same
 * mutex + atomic + redact pipeline every other write in this plugin uses.
 */
import { readFile } from 'node:fs/promises';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type {
	IDegradation,
	IInvocationRecord,
	ILimitsStatus,
	IUsageSummary,
	SpendBreachScope,
} from './types';

/** Round money to the micro-dollar to avoid float dust in the summary. */
const money = (usd: number): number => Math.round(usd * 1e6) / 1e6;

/** Round a percentage to one decimal place. */
const pct = (fraction: number): number => Math.round(fraction * 1000) / 10;

/** Configuration + session anchor the breaker needs to evaluate a window. */
export interface ILimitsConfig {
	/** Epoch ms the current session started (boot time). */
	readonly sessionStartMs: number;
	/** Session cap in USD; `undefined` = unlimited (scope cannot breach). */
	readonly maxSessionSpendUsd?: number | undefined;
	/** Monthly cap in USD; `undefined` = unlimited (scope cannot breach). */
	readonly maxMonthlySpendUsd?: number | undefined;
}

/** Whether either cap is set — the breaker is inert until one is. */
export const isBreakerActive = (config: ILimitsConfig): boolean =>
	config.maxSessionSpendUsd !== undefined ||
	config.maxMonthlySpendUsd !== undefined;

/** Epoch ms of 00:00 UTC on the first day of `now`'s calendar month. */
export const startOfCalendarMonth = (now: number): number => {
	const d = new Date(now);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
};

/** Sum `costUsd` over records whose `ts` falls within `[sinceMs, now]`. */
const sumCostSince = (
	records: readonly IInvocationRecord[],
	sinceMs: number,
	now: number,
): number => {
	let total = 0;
	for (const record of records) {
		const ts = Date.parse(record.ts);
		if (Number.isNaN(ts) || ts < sinceMs || ts > now) continue;
		total += record.costUsd ?? 0;
	}
	return total;
};

/** A neutral status (no caps configured, nothing breached). */
export const emptyLimitsStatus = (): ILimitsStatus => ({
	sessionSpendUsd: 0,
	sessionLimitUsd: null,
	sessionLimitPct: null,
	monthlySpendUsd: 0,
	monthlyLimitUsd: null,
	monthlyLimitPct: null,
	breached: null,
});

/**
 * Fold the log into the two-scope {@link ILimitsStatus}. Session precedes
 * monthly for the single `breached` flag (a session breach is the sharper,
 * more immediate wall), but BOTH `pct`s are always reported so an analyst can
 * warn before either wall — never a blended number.
 */
export const computeLimitsStatus = (
	records: readonly IInvocationRecord[],
	config: ILimitsConfig,
	now: number = Date.now(),
): ILimitsStatus => {
	const sessionSpendUsd = money(
		sumCostSince(records, config.sessionStartMs, now),
	);
	const monthlySpendUsd = money(
		sumCostSince(records, startOfCalendarMonth(now), now),
	);

	const sessionLimitUsd = config.maxSessionSpendUsd ?? null;
	const monthlyLimitUsd = config.maxMonthlySpendUsd ?? null;

	const sessionLimitPct =
		sessionLimitUsd !== null && sessionLimitUsd > 0
			? pct(sessionSpendUsd / sessionLimitUsd)
			: null;
	const monthlyLimitPct =
		monthlyLimitUsd !== null && monthlyLimitUsd > 0
			? pct(monthlySpendUsd / monthlyLimitUsd)
			: null;

	let breached: SpendBreachScope | null = null;
	if (sessionLimitUsd !== null && sessionSpendUsd >= sessionLimitUsd) {
		breached = 'session';
	} else if (monthlyLimitUsd !== null && monthlySpendUsd >= monthlyLimitUsd) {
		breached = 'monthly';
	}

	return {
		sessionSpendUsd,
		sessionLimitUsd,
		sessionLimitPct,
		monthlySpendUsd,
		monthlyLimitUsd,
		monthlyLimitPct,
		breached,
	};
};

/** Best-effort read of the current summary (missing/corrupt → null). */
const readSummaryFile = async (
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
 * Durably append a degradation event to `usage-summary.json#degradations`
 * (mutex + atomic + redact). Preserves the rest of the document; a missing
 * file yields a minimal stub so the event is never lost.
 */
export const recordDegradation = async (
	summaryPath: string,
	event: IDegradation,
): Promise<void> => {
	await withFileMutex(summaryPath, async () => {
		const current = await readSummaryFile(summaryPath);
		const degradations = [...(current?.degradations ?? []), event];
		const next: IUsageSummary =
			current !== null
				? { ...current, degradations }
				: {
						updatedAt: new Date().toISOString(),
						windowDays: 0,
						totals: {
							calls: 0,
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
							costUsd: 0,
							errors: 0,
							autoBypassed: 0,
						},
						byProvider: [],
						byPlugin: [],
						byAgent: [],
						byExtension: [],
						autoBypassed: 0,
						limitsStatus: emptyLimitsStatus(),
						degradations,
					};
		const { text } = redactSecrets(`${JSON.stringify(next, null, '\t')}\n`);
		await writeFileAtomic(summaryPath, text);
	});
};
