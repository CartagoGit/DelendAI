import type { IErrorReportingOptions } from './contracts/interfaces/options.interface';
import type {
	IReportFailureState,
	IReportScheduleDecision,
	IReportSchedulerClock,
} from './contracts/interfaces/report-scheduler.interface';
import type { IReportRecord } from './contracts/interfaces/report-store.interface';
import { shouldReport } from './reporter.service';

const ISO_DATE_PREFIX_LENGTH = 10;
export const REPORT_DISPATCH_CLAIM_MS = 5 * 60_000;

const utcDayOf = (iso: string | undefined): string | undefined =>
	iso?.slice(0, ISO_DATE_PREFIX_LENGTH);

const nextUtcDayIsoOf = (nowMs: number): string => {
	const now = new Date(nowMs);
	const nextDay = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate() + 1,
		0,
		0,
		0,
		0,
	);
	return new Date(nextDay).toISOString();
};

const parseIso = (value: string | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

const successesOnUtcDay = (
	records: readonly IReportRecord[],
	day: string,
): number =>
	records.filter(
		(record) =>
			record.issueNumber !== undefined &&
			utcDayOf(record.lastSuccessAt) === day,
	).length;

const backoffDelayMsOf = (input: {
	readonly failureCount: number;
	readonly baseMs: number;
	readonly maxMs: number;
	readonly jitterRatio: number;
	readonly random: number;
}): number => {
	const exponent = Math.max(0, input.failureCount - 1);
	const raw = Math.min(input.baseMs * 2 ** exponent, input.maxMs);
	const jittered = raw * (1 + input.jitterRatio * input.random);
	return Math.min(Math.round(jittered), input.maxMs);
};

export const createReportScheduler = (input: {
	readonly options: Pick<
		IErrorReportingOptions,
		| 'dedupeWindowHours'
		| 'maxIssuesPerDay'
		| 'circuitBreakerThreshold'
		| 'backoffBaseMs'
		| 'backoffMaxMs'
		| 'backoffJitterRatio'
	>;
	readonly clock: IReportSchedulerClock;
}) => ({
	decide: (args: {
		readonly record: IReportRecord | undefined;
		readonly records: readonly IReportRecord[];
		readonly nowMs?: number | undefined;
	}): IReportScheduleDecision => {
		const nowMs = args.nowMs ?? input.clock.nowMs();
		const record = args.record;
		if (record?.issueNumber !== undefined) {
			return { action: 'skip', reason: 'existing-issue' };
		}
		if (
			!shouldReport({
				lastSuccessAt: record?.lastSuccessAt,
				dedupeWindowHours: input.options.dedupeWindowHours,
				nowMs,
			})
		) {
			return { action: 'skip', reason: 'dedupe-window' };
		}
		const circuitOpenUntilMs = parseIso(record?.circuitOpenUntil);
		if (circuitOpenUntilMs !== undefined && nowMs < circuitOpenUntilMs) {
			return {
				action: 'skip',
				reason: 'circuit-open',
				failureCode: 'CIRCUIT_OPEN',
				retryAt: record?.circuitOpenUntil,
			};
		}
		const nextEligibleAtMs = parseIso(record?.nextEligibleAt);
		if (nextEligibleAtMs !== undefined && nowMs < nextEligibleAtMs) {
			return {
				action: 'skip',
				reason: 'backoff',
				failureCode: 'BACKOFF_ACTIVE',
				retryAt: record?.nextEligibleAt,
			};
		}
		const day = utcDayOf(new Date(nowMs).toISOString()) ?? '';
		if (
			successesOnUtcDay(args.records, day) >=
			input.options.maxIssuesPerDay
		) {
			return {
				action: 'skip',
				reason: 'rate-limit',
				failureCode: 'RATE_LIMITED',
				retryAt: nextUtcDayIsoOf(nowMs),
			};
		}
		return { action: 'submit', reason: 'dedupe-window' };
	},
	buildFailureState: (
		record: IReportRecord | undefined,
		failureCode:
			| 'NETWORK_UNAVAILABLE'
			| 'GH_NOT_INSTALLED'
			| 'GH_EXEC_FAILED'
			| 'ISSUE_NUMBER_PARSE_FAILED',
		nowMs: number = input.clock.nowMs(),
	): IReportFailureState => {
		const consecutiveFailureCount =
			(record?.consecutiveFailureCount ?? 0) + 1;
		const delayMs = backoffDelayMsOf({
			failureCount: consecutiveFailureCount,
			baseMs: input.options.backoffBaseMs,
			maxMs: input.options.backoffMaxMs,
			jitterRatio: input.options.backoffJitterRatio,
			random: input.clock.random(),
		});
		const nextEligibleAt = new Date(nowMs + delayMs).toISOString();
		return {
			failureCode,
			consecutiveFailureCount,
			nextEligibleAt,
			...(consecutiveFailureCount >= input.options.circuitBreakerThreshold
				? { circuitOpenUntil: nextEligibleAt }
				: {}),
		};
	},
});
