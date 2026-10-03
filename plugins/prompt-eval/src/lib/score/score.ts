/**
 * f00127 S2 — Pure scorer + report builder.
 *
 * Consumes a flat list of `IEvalAttempt`s (the S1 harness output) and
 * builds a ranked table:
 *   - per-provider: totalCostUsd, attempts, passes, winRate,
 *     compositeScore (cost × quality blend)
 *   - per (provider, taskType): same shape, scoped
 *   - a project-wide `IRankedReport` that the host CLI + extension render
 *     uniformly. The scorer is pure (no I/O, no spawn) so the same
 *     input always produces the same report — calibration writes use
 *     the same `{ providerId, winRate, samples }` summary that S4 reads.
 */
import type { IEvalAttempt } from '../eval/eval-harness';

/** A task-type label shared with `IOutcomeRecord` (auto-agent-selector S4). */
export type TaskType = string;

/** A `IEvalAttempt` paired with the task-type it was scored under. */
export interface IAttemptWithTask {
	readonly attempt: IEvalAttempt;
	readonly taskType?: TaskType;
}

/** Per-provider rollup, the unit a renderer consumes. */
export interface IProviderScore {
	readonly providerId: string;
	readonly costTier: number;
	readonly attempts: number;
	readonly passes: number;
	/** pass-count / attempt-count, in [0, 1]. `null` when no samples ran. */
	readonly winRate: number | null;
	/** Sum of `costUsd` across all attempts; `0` when none ran. */
	readonly totalCostUsd: number;
	/**
	 * Cost×quality blend. Higher = better.
	 * `winRate !== null` ? `winRate * 100 - costUsd` : 0. The cost
	 * subtraction is *unbounded* in the negative direction — a
	 * perfectly-passing \$100 run still beats a perfectly-passing \$1
	 * run on cost. The score is meant for ranking, not display.
	 */
	readonly compositeScore: number;
}

/** Output of {@link scoreReport}. */
export interface IRankedReport {
	readonly rows: readonly IProviderScore[];
	readonly worst: string | null;
	/**
	 * The cheapest passing provider, or `null` when nothing passed.
	 * Matches the harness's `winner` semantics so the two surfaces
	 * never disagree.
	 */
	readonly winner: string | null;
	/** Across every attempt, total cost (USD). */
	readonly totalCostUsd: number;
	/** Across every attempt, total pass count. */
	readonly totalPasses: number;
}

/** Summarize one provider's attempts. Pure. */
export const scoreProvider = (
	providerId: string,
	attempts: readonly IEvalAttempt[],
): IProviderScore => {
	let costTier = 0;
	let passes = 0;
	let totalCostUsd = 0;
	for (const a of attempts) {
		if (a.providerId !== providerId) continue;
		if (costTier === 0) costTier = a.costTier;
		passes += a.passed && a.skipped === undefined ? 1 : 0;
		totalCostUsd += a.costUsd;
	}
	const ran = attempts.filter(
		(a) => a.providerId === providerId && a.skipped === undefined,
	).length;
	const winRate = ran === 0 ? null : passes / ran;
	const compositeScore = winRate === null ? 0 : winRate * 100 - totalCostUsd;
	return {
		providerId,
		costTier,
		attempts: ran,
		passes,
		winRate,
		totalCostUsd,
		compositeScore,
	};
};

/** Inline ↔ ranked: sort by compositeScore desc, then cost asc, then tier. */
const rankBy = (rows: readonly IProviderScore[]): readonly IProviderScore[] =>
	[...rows].sort((left, right) => {
		if (left.compositeScore !== right.compositeScore) {
			return right.compositeScore - left.compositeScore;
		}
		if (left.totalCostUsd !== right.totalCostUsd) {
			return left.totalCostUsd - right.totalCostUsd;
		}
		return left.costTier - right.costTier;
	});

const uniqueProviderIds = (
	attempts: readonly IEvalAttempt[],
): readonly string[] => {
	const seen = new Set<string>();
	for (const a of attempts) seen.add(a.providerId);
	return [...seen];
};

/** Build a report over a flat attempt list. Pure. */
export const scoreReport = (
	attempts: readonly IEvalAttempt[],
): IRankedReport => {
	const ids = uniqueProviderIds(attempts);
	const rows = rankBy(ids.map((id) => scoreProvider(id, attempts)));
	const totalCostUsd = attempts.reduce((acc, a) => acc + a.costUsd, 0);
	const totalPasses = attempts.reduce(
		(acc, a) => acc + (a.passed && a.skipped === undefined ? 1 : 0),
		0,
	);
	const winners = rows.filter(
		(row) => row.winRate !== null && row.winRate > 0,
	);
	const winner = winners[0]?.providerId ?? null;
	const worst = rows[rows.length - 1]?.providerId ?? null;
	return {
		rows,
		worst,
		winner,
		totalCostUsd,
		totalPasses,
	};
};

/** Group attempts by task-type, then score each group. Pure. */
export const scorePerTaskType = (
	items: readonly IAttemptWithTask[],
): Readonly<Record<TaskType, IRankedReport>> => {
	const buckets = new Map<TaskType, IEvalAttempt[]>();
	for (const { attempt, taskType } of items) {
		const key = taskType ?? '_default';
		const list = buckets.get(key) ?? [];
		list.push(attempt);
		buckets.set(key, list);
	}
	const out: Record<TaskType, IRankedReport> = {};
	for (const [key, list] of buckets) {
		out[key] = scoreReport(list);
	}
	return out;
};
