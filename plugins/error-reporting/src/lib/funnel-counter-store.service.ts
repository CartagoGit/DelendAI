import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { FUNNEL_STAGES } from './contracts/constants/funnel-stages.constant';
import { SAFE_REPORTER_FAILURE_CODES } from './contracts/constants/safe-reporter-failure-codes.constant';
import type {
	IFunnelCounterEvent,
	IFunnelCounters,
	IFunnelCounterStore,
} from './contracts/interfaces/funnel-counters.interface';
import type { SafeReporterFailureCode } from './contracts/constants/safe-reporter-failure-codes.constant';

const EMPTY_COUNTERS: IFunnelCounters = {
	observedFailures: 0,
	ignoredNonFailures: 0,
	notVertexInternal: 0,
	privacyBlocked: 0,
	deduplicated: 0,
	rateLimited: 0,
	submissionAttempted: 0,
	submissionSucceeded: 0,
	submissionFailed: 0,
};

const asNonNegativeInt = (value: unknown): number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0
		? value
		: 0;

const asIsoOrUndefined = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

const isSafeReporterFailureCode = (
	value: unknown,
): value is SafeReporterFailureCode =>
	typeof value === 'string' &&
	SAFE_REPORTER_FAILURE_CODES.includes(
		value as (typeof SAFE_REPORTER_FAILURE_CODES)[number],
	);

/** Coerce arbitrary JSON into a well-typed counters record, never throwing. */
const normalize = (raw: unknown): IFunnelCounters => {
	if (typeof raw !== 'object' || raw === null) return EMPTY_COUNTERS;
	const record = raw as Record<string, unknown>;
	const counters: Record<string, number> = {};
	for (const stage of FUNNEL_STAGES) {
		counters[stage] = asNonNegativeInt(record[stage]);
	}
	const lastObservedAt = asIsoOrUndefined(record.lastObservedAt);
	const lastClassifiedAt = asIsoOrUndefined(record.lastClassifiedAt);
	const lastSubmittedAt = asIsoOrUndefined(record.lastSubmittedAt);
	const circuitOpenUntil = asIsoOrUndefined(record.circuitOpenUntil);
	const lastFailureCode = isSafeReporterFailureCode(record.lastFailureCode)
		? record.lastFailureCode
		: undefined;
	return {
		...(counters as unknown as IFunnelCounters),
		...(lastObservedAt !== undefined ? { lastObservedAt } : {}),
		...(lastClassifiedAt !== undefined ? { lastClassifiedAt } : {}),
		...(lastSubmittedAt !== undefined ? { lastSubmittedAt } : {}),
		...(lastFailureCode !== undefined ? { lastFailureCode } : {}),
		...(circuitOpenUntil !== undefined ? { circuitOpenUntil } : {}),
	};
};

const readAll = async (statePath: string): Promise<IFunnelCounters> => {
	try {
		const raw = await readFile(statePath, 'utf8');
		return normalize(JSON.parse(raw));
	} catch {
		return EMPTY_COUNTERS;
	}
};

/**
 * Durable, privacy-safe funnel counters for `error-reporting`
 * (AUD-G01). Lives as `funnel-counters.json` next to `reported.json`
 * in the same `pluginCacheDir` — same durability class (accumulated
 * result, not derivable cache), same mutex+atomic write idiom as
 * `report-store.service.ts` and `usage-tracking`'s summary file.
 */
export const createFunnelCounterStore = (
	dirAbs: string,
): IFunnelCounterStore => {
	const statePath = join(dirAbs, 'funnel-counters.json');
	return {
		statePath,
		async read() {
			return readAll(statePath);
		},
		async increment(event: IFunnelCounterEvent): Promise<void> {
			await mkdir(dirname(statePath), { recursive: true });
			await withFileMutex(statePath, async () => {
				const current = await readAll(statePath);
				// A successful dispatch closes any open circuit and clears
				// the stale failure code — mirrors
				// `report-store.service.ts#recordSuccess`. Built via
				// destructure (never an explicit `undefined` assignment)
				// because `exactOptionalPropertyTypes` forbids the latter.
				const {
					lastFailureCode: _staleFailureCode,
					circuitOpenUntil: _staleCircuitOpenUntil,
					...clearedBase
				} = current;
				const base =
					event.stage === 'submissionSucceeded'
						? clearedBase
						: current;
				const next: IFunnelCounters = {
					...base,
					[event.stage]: current[event.stage] + 1,
					...(event.stage === 'observedFailures'
						? { lastObservedAt: event.at }
						: {}),
					...(event.stage === 'submissionAttempted'
						? { lastSubmittedAt: event.at }
						: {}),
					...(event.stage === 'submissionFailed'
						? {
								...(event.failureCode !== undefined
									? { lastFailureCode: event.failureCode }
									: {}),
								...(event.circuitOpenUntil !== undefined
									? {
											circuitOpenUntil:
												event.circuitOpenUntil,
										}
									: {}),
							}
						: {}),
				};
				await writeFileAtomic(
					statePath,
					JSON.stringify(next, null, '\t'),
				);
			});
		},
		async markClassified(at: string): Promise<void> {
			await withFileMutex(statePath, async () => {
				const current = await readAll(statePath);
				const next: IFunnelCounters = {
					...current,
					lastClassifiedAt: at,
				};
				await writeFileAtomic(
					statePath,
					JSON.stringify(next, null, '\t'),
				);
			});
		},
	};
};
