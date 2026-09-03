import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { SAFE_REPORTER_FAILURE_CODES } from './contracts/constants/safe-reporter-failure-codes.constant';
import type {
	IReportRecord,
	IReportStore,
} from './contracts/interfaces/report-store.interface';
import { ISSUE_CLASSIFICATIONS } from './contracts/interfaces/reporter.interface';

type IStateFile = Record<string, IReportRecord>;

type ILegacyStateRecord = {
	readonly fingerprint?: unknown;
	readonly classification?: unknown;
	readonly signature?: unknown;
	readonly attemptCount?: unknown;
	readonly count?: unknown;
	readonly lastAttemptAt?: unknown;
	readonly lastDispatchAt?: unknown;
	readonly lastSuccessAt?: unknown;
	readonly lastReportedAt?: unknown;
	readonly lastFailureCode?: unknown;
	readonly consecutiveFailureCount?: unknown;
	readonly nextEligibleAt?: unknown;
	readonly dispatchClaimedUntil?: unknown;
	readonly circuitOpenUntil?: unknown;
	readonly issueNumber?: unknown;
	readonly issueUrl?: unknown;
};

const asIsoOrUndefined = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

const parseIso = (value: string | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

const asPositiveInt = (value: unknown): number | undefined => {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return undefined;
	}
	return value;
};

const isSafeReporterFailureCode = (
	value: unknown,
): value is IReportRecord['lastFailureCode'] =>
	typeof value === 'string' &&
	SAFE_REPORTER_FAILURE_CODES.includes(
		value as (typeof SAFE_REPORTER_FAILURE_CODES)[number],
	);

const isIssueClassification = (
	value: unknown,
): value is IReportRecord['classification'] =>
	typeof value === 'string' &&
	ISSUE_CLASSIFICATIONS.includes(
		value as (typeof ISSUE_CLASSIFICATIONS)[number],
	);

const normalizeRecord = (
	key: string,
	value: unknown,
): IReportRecord | undefined => {
	if (typeof value !== 'object' || value === null) return undefined;
	const record = value as ILegacyStateRecord;
	const issueNumber = asPositiveInt(record.issueNumber);
	const lastDispatchAt = asIsoOrUndefined(record.lastDispatchAt);
	const nextEligibleAt = asIsoOrUndefined(record.nextEligibleAt);
	const circuitOpenUntil = asIsoOrUndefined(record.circuitOpenUntil);
	const dispatchClaimedUntil = asIsoOrUndefined(record.dispatchClaimedUntil);
	const lastFailureCode = isSafeReporterFailureCode(record.lastFailureCode)
		? record.lastFailureCode
		: undefined;
	const classification = isIssueClassification(record.classification)
		? record.classification
		: 'UNKNOWN';
	const fingerprint =
		typeof record.fingerprint === 'string' && record.fingerprint !== ''
			? record.fingerprint
			: typeof record.signature === 'string' && record.signature !== ''
				? record.signature
				: key;
	const lastSuccessAt =
		asIsoOrUndefined(record.lastSuccessAt) ??
		(issueNumber !== undefined
			? asIsoOrUndefined(record.lastReportedAt)
			: undefined);
	const lastAttemptAt =
		asIsoOrUndefined(record.lastAttemptAt) ??
		asIsoOrUndefined(record.lastReportedAt);
	return {
		fingerprint,
		classification,
		attemptCount:
			asPositiveInt(record.attemptCount) ??
			asPositiveInt(record.count) ??
			0,
		...(lastAttemptAt !== undefined ? { lastAttemptAt } : {}),
		...(lastDispatchAt !== undefined ? { lastDispatchAt } : {}),
		...(lastSuccessAt !== undefined ? { lastSuccessAt } : {}),
		...(lastFailureCode !== undefined ? { lastFailureCode } : {}),
		consecutiveFailureCount:
			asPositiveInt(record.consecutiveFailureCount) ?? 0,
		...(nextEligibleAt !== undefined ? { nextEligibleAt } : {}),
		...(dispatchClaimedUntil !== undefined ? { dispatchClaimedUntil } : {}),
		...(circuitOpenUntil !== undefined ? { circuitOpenUntil } : {}),
		...(issueNumber !== undefined ? { issueNumber } : {}),
		...(typeof record.issueUrl === 'string' && record.issueUrl !== ''
			? { issueUrl: record.issueUrl }
			: {}),
	};
};

/**
 * The outcome of reading `reported.json`.
 *
 * `trusted: false` means we could not establish what the file contains —
 * it exists but is unreadable or unparseable. That is NOT the same as
 * "it is empty", and collapsing the two is how this store used to lose
 * its entire memory: `catch { return {} }` turned any read error into an
 * empty state, and the very next `writeState` persisted that emptiness
 * over the real file.
 *
 * The consequence is user-visible. This store is what stops a recurring
 * failure from opening a second GitHub issue for the same fingerprint,
 * and what remembers that the circuit breaker is open. Reset it and
 * mcp-vertex re-reports everything it has ever reported — into the
 * user's repository.
 *
 * A missing file is the one benign case (first run) and stays trusted.
 */
interface IReadState {
	readonly records: IStateFile;
	readonly trusted: boolean;
}

const warnedPaths = new Set<string>();

const readAll = async (statePath: string): Promise<IReadState> => {
	let raw: string;
	try {
		raw = await readFile(statePath, 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT') return { records: {}, trusted: true };
		// EACCES, EMFILE, EISDIR… — the file may well hold real state we
		// simply cannot see right now. Refuse to speak for it.
		if (!warnedPaths.has(statePath)) {
			warnedPaths.add(statePath);
			console.warn(
				`error-reporting: cannot read ${statePath} (${String(code ?? 'unknown')}); de-duplication state is unavailable and will NOT be overwritten.`,
			);
		}
		return { records: {}, trusted: false };
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) {
			return { records: {}, trusted: false };
		}
		const normalized: IStateFile = {};
		for (const [key, value] of Object.entries(parsed)) {
			const record = normalizeRecord(key, value);
			if (record !== undefined) normalized[record.fingerprint] = record;
		}
		return { records: normalized, trusted: true };
	} catch {
		// Corrupt JSON — most likely a torn write. Preserve it: it is
		// evidence, and overwriting it destroys the de-duplication
		// history along with any chance of diagnosing the tear.
		if (!warnedPaths.has(statePath)) {
			warnedPaths.add(statePath);
			console.warn(
				`error-reporting: ${statePath} is not valid JSON; de-duplication state is unavailable and will NOT be overwritten.`,
			);
		}
		return { records: {}, trusted: false };
	}
};

export const createReportStore = (dirAbs: string): IReportStore => {
	const statePath = join(dirAbs, 'reported.json');
	const writeState = async (state: IStateFile): Promise<void> => {
		await writeFileAtomic(statePath, JSON.stringify(state, null, '\t'));
	};
	const nextRecord = (
		fingerprint: string,
		previous: IReportRecord | undefined,
	): IReportRecord => ({
		fingerprint,
		classification: previous?.classification ?? 'UNKNOWN',
		attemptCount: previous?.attemptCount ?? 0,
		...(previous?.lastAttemptAt !== undefined
			? { lastAttemptAt: previous.lastAttemptAt }
			: {}),
		...(previous?.lastDispatchAt !== undefined
			? { lastDispatchAt: previous.lastDispatchAt }
			: {}),
		...(previous?.lastSuccessAt !== undefined
			? { lastSuccessAt: previous.lastSuccessAt }
			: {}),
		...(previous?.lastFailureCode !== undefined
			? { lastFailureCode: previous.lastFailureCode }
			: {}),
		consecutiveFailureCount: previous?.consecutiveFailureCount ?? 0,
		...(previous?.nextEligibleAt !== undefined
			? { nextEligibleAt: previous.nextEligibleAt }
			: {}),
		...(previous?.dispatchClaimedUntil !== undefined
			? { dispatchClaimedUntil: previous.dispatchClaimedUntil }
			: {}),
		...(previous?.circuitOpenUntil !== undefined
			? { circuitOpenUntil: previous.circuitOpenUntil }
			: {}),
		...(previous?.issueNumber !== undefined
			? { issueNumber: previous.issueNumber }
			: {}),
		...(previous?.issueUrl !== undefined
			? { issueUrl: previous.issueUrl }
			: {}),
	});
	return {
		statePath,
		async get(fingerprint) {
			return (await readAll(statePath)).records[fingerprint];
		},
		async all() {
			return Object.values((await readAll(statePath)).records);
		},
		async claimDispatch(fingerprint, claimedUntil, now) {
			let claimed = false;
			await withFileMutex(statePath, async () => {
				const { records: state, trusted } = await readAll(statePath);
				if (!trusted) return;
				const previous = state[fingerprint];
				const activeClaim = parseIso(previous?.dispatchClaimedUntil);
				if (
					activeClaim !== undefined &&
					activeClaim > Date.parse(now)
				) {
					return;
				}
				const next = nextRecord(fingerprint, previous);
				state[fingerprint] = {
					...next,
					dispatchClaimedUntil: claimedUntil,
				};
				await writeState(state);
				claimed = true;
			});
			return claimed;
		},
		async recordAttempt(fingerprint, input) {
			await withFileMutex(statePath, async () => {
				const { records: state, trusted } = await readAll(statePath);
				if (!trusted) return;
				const previous = state[fingerprint];
				const next = nextRecord(fingerprint, previous);
				state[fingerprint] = {
					...next,
					classification: input.classification,
					attemptCount: next.attemptCount + 1,
					lastAttemptAt: input.at,
				};
				await writeState(state);
			});
		},
		async recordFailure(fingerprint, input) {
			await withFileMutex(statePath, async () => {
				const { records: state, trusted } = await readAll(statePath);
				if (!trusted) return;
				const previous = state[fingerprint];
				const next = nextRecord(fingerprint, previous);
				const {
					dispatchClaimedUntil: _dispatchClaimedUntil,
					...withoutClaim
				} = next;
				state[fingerprint] = {
					...withoutClaim,
					lastDispatchAt: input.at,
					lastFailureCode: input.failureCode,
					consecutiveFailureCount: next.consecutiveFailureCount + 1,
					nextEligibleAt: input.nextEligibleAt,
					...(input.circuitOpenUntil !== undefined
						? { circuitOpenUntil: input.circuitOpenUntil }
						: {}),
				};
				await writeState(state);
			});
		},
		async recordSuccess(fingerprint, input) {
			await withFileMutex(statePath, async () => {
				const { records: state, trusted } = await readAll(statePath);
				if (!trusted) return;
				const previous = state[fingerprint];
				const next = nextRecord(fingerprint, previous);
				const {
					dispatchClaimedUntil: _dispatchClaimedUntil,
					...withoutClaim
				} = next;
				state[fingerprint] = {
					fingerprint,
					classification: withoutClaim.classification,
					attemptCount: withoutClaim.attemptCount,
					...(withoutClaim.lastAttemptAt !== undefined
						? { lastAttemptAt: withoutClaim.lastAttemptAt }
						: {}),
					lastDispatchAt: input.at,
					lastSuccessAt: input.at,
					consecutiveFailureCount: 0,
					issueNumber: input.issueNumber,
					...(input.issueUrl !== undefined
						? { issueUrl: input.issueUrl }
						: {}),
				};
				await writeState(state);
			});
		},
	};
};
