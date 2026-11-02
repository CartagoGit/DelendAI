import type { IReviewIndependence } from '../../contracts/interfaces/review-independence.interface';
import { basename, dirname, join } from 'node:path';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import {
	diagnoseValidateBlocker,
	latestValidateRow,
} from '../../services/validate-blocker';
import type { IValidateBlockerDiagnosis } from '../../contracts/interfaces/validate-blocker.interface';
import type { IValidateEvidence } from '../../services/transition-evidence';
import { VALIDATE_LOG_RELATIVE_PATH } from '../../contracts/constants/proposal-paths.constant';
import { unapprovedSlices } from '../../shared/independent-approval';
import type {
	IValidateLogEntry,
	IValidateEvidenceDeps,
} from '../../contracts/interfaces/proposal-transition-tool.interface';

const VALIDATE_EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

const readValidateLogEntries = async (
	logPathAbs: string,
): Promise<readonly IValidateLogEntry[]> => {
	const raw = await new SafeWorkspaceReader(dirname(logPathAbs))
		.readText(basename(logPathAbs))
		.then((value) => value.content)
		.catch((error: unknown) => {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return '';
			}
			throw error;
		});
	if (raw.trim() === '') return [];
	const entries: IValidateLogEntry[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === 'object') {
				entries.push(parsed as IValidateLogEntry);
			}
		} catch (error: unknown) {
			if (error instanceof SyntaxError) continue;
			throw error;
		}
	}
	return entries;
};

/**
 * Legacy helper kept for compatibility with existing recovery/tests.
 * The new gate reads peer-review.jsonl first, but markdown approvals still
 * matter for older diagnostics and for transitional specs.
 */
export const hasIndependentPeerApproval = (
	markdown: string,
	independence: IReviewIndependence = 'model',
): boolean => unapprovedSlices(markdown, independence).length === 0;

const isFreshValidateEvidence = (
	evidence: IValidateEvidence,
	nowMs = Date.now(),
): boolean => {
	if (evidence.exitCode !== 0) return false;
	const tsMs = Date.parse(evidence.timestamp);
	if (Number.isNaN(tsMs)) return false;
	return tsMs >= nowMs - VALIDATE_EVIDENCE_WINDOW_MS;
};

const toValidateEvidence = (
	entry: IValidateLogEntry,
	logPathAbs: string,
): IValidateEvidence | null => {
	if (entry.result !== 'pass') return null;
	const timestamp =
		typeof entry.timestamp === 'string'
			? entry.timestamp
			: typeof entry.ts === 'string'
				? entry.ts
				: null;
	if (timestamp === null) return null;
	const exitCode = typeof entry.exitCode === 'number' ? entry.exitCode : 0;
	return {
		timestamp,
		exitCode,
		...(typeof entry.logPath === 'string'
			? { logPath: entry.logPath }
			: { logPath: logPathAbs }),
	};
};

export const resolveRecentValidateEvidence = async (input: {
	readonly workspaceRoot: string;
	readonly validateEvidence?: IValidateEvidence | undefined;
	readonly deps?: IValidateEvidenceDeps | undefined;
}): Promise<IValidateEvidence | null> => {
	if (input.validateEvidence !== undefined) {
		return isFreshValidateEvidence(input.validateEvidence)
			? input.validateEvidence
			: null;
	}
	const logPathAbs = join(input.workspaceRoot, VALIDATE_LOG_RELATIVE_PATH);
	const deps = input.deps ?? { readValidateLog: readValidateLogEntries };
	const entries = await deps.readValidateLog(logPathAbs);
	// The MOST RECENT run has to be the passing one. Scanning for the
	// newest *pass* let an older green run vouch for a tree that had
	// since gone red: validate passes at 10:00, fails at 11:00, and at
	// 11:30 the gate still waves the close through on the 10:00 entry.
	// That is how known-broken work shipped on a shared branch, and it
	// is the one reading of "fresh evidence" that cannot be defended.
	const newest = latestValidateRow(entries);
	if (newest === undefined) return null;
	const evidence = toValidateEvidence(newest, logPathAbs);
	if (evidence === null || !isFreshValidateEvidence(evidence)) return null;
	return evidence;
};

/**
 * Why the gate refused, for the envelope. Costs one extra read of a
 * small journal, and only on the path that was about to block an agent.
 */
export const diagnoseValidateEvidence = async (input: {
	readonly workspaceRoot: string;
	readonly deps?: IValidateEvidenceDeps | undefined;
}): Promise<IValidateBlockerDiagnosis> => {
	const logPathAbs = join(input.workspaceRoot, VALIDATE_LOG_RELATIVE_PATH);
	const deps = input.deps ?? { readValidateLog: readValidateLogEntries };
	try {
		return diagnoseValidateBlocker(await deps.readValidateLog(logPathAbs));
	} catch {
		return diagnoseValidateBlocker([]);
	}
};

export const buildValidateRequiredEnvelope = (
	diagnosis: IValidateBlockerDiagnosis,
) => ({
	ok: false as const,
	error: 'validate required' as const,
	// `state` and `nextAction` are what stop the loop: an agent that has
	// already run validate is told what failed, not told to run it again.
	validateState: diagnosis.state,
	reason: diagnosis.reason,
	failedSteps: diagnosis.failedSteps,
	...(diagnosis.lastRunAt !== undefined
		? { lastValidateAt: diagnosis.lastRunAt }
		: {}),
	nextAction: diagnosis.nextAction,
});
