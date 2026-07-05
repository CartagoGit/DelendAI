/**
 * limits-store.ts — in-memory mirror of the circuit breaker's verdict (S7).
 *
 * The spend numbers are OWNED by `usage-tracking` (it writes
 * `usage-summary.json#limitsStatus`). The runner must consult the breach state
 * before every spend, but AGENTS.md rule 3 forbids a per-decision fs read on
 * the hot path — so, exactly like {@link HealthStore}, we hydrate an in-memory
 * snapshot best-effort at boot and refresh it on an unref'd timer. The
 * `snapshot()` the spend guard reads is always synchronous and never touches
 * the disk.
 */
import { readFile } from 'node:fs/promises';

import {
	emptySpendLimitsView,
	type ISpendLimitsView,
	type SpendBreachScope,
} from './spend-guard';

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;

const asFiniteOrNull = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

const asFinite = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asBreach = (value: unknown): SpendBreachScope | null =>
	value === 'session' || value === 'monthly' ? value : null;

/** Project a raw `limitsStatus` object onto the guard's view (tolerant). */
export const normalizeLimitsView = (raw: unknown): ISpendLimitsView => {
	const rec = asRecord(raw);
	if (!rec) return emptySpendLimitsView();
	return {
		sessionSpendUsd: asFinite(rec.sessionSpendUsd),
		sessionLimitUsd: asFiniteOrNull(rec.sessionLimitUsd),
		monthlySpendUsd: asFinite(rec.monthlySpendUsd),
		monthlyLimitUsd: asFiniteOrNull(rec.monthlyLimitUsd),
		breached: asBreach(rec.breached),
	};
};

/**
 * A refreshable, read-cheap mirror of `usage-summary.json#limitsStatus`.
 * A missing/corrupt summary leaves the neutral view (nothing breached), so
 * the runner degrades gracefully to "no cap" rather than blocking spuriously.
 */
export class SpendLimitsStore {
	private view: ISpendLimitsView = emptySpendLimitsView();

	/** The current mirrored view (synchronous; the guard's hot-path read). */
	snapshot(): ISpendLimitsView {
		return this.view;
	}

	/** Replace the mirror directly (tests / host injection). */
	set(view: ISpendLimitsView): void {
		this.view = view;
	}

	/** Best-effort hydrate from the summary file; failures keep the prior view. */
	async loadFrom(summaryPath: string): Promise<void> {
		try {
			const raw = await readFile(summaryPath, 'utf8');
			const doc = asRecord(JSON.parse(raw));
			this.view = normalizeLimitsView(doc?.limitsStatus);
		} catch {
			// Keep the last-known (or neutral) view.
		}
	}

	/** Refresh from disk on an unref'd interval so it never pins the process. */
	startRefreshTimer(summaryPath: string, intervalMs: number): void {
		const timer = setInterval(() => {
			void this.loadFrom(summaryPath);
		}, intervalMs);
		timer.unref?.();
	}
}
