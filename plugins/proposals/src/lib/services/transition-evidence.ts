/**
 * transition-evidence.ts
 *
 * Strict validation for the explicit `validateEvidence` payload used by
 * retroactive `proposal_transition` shortcuts.
 *
 * The existing transition tool still supports its broader "recent validate"
 * lookup for ordinary lifecycle moves. This service is narrower on purpose:
 * it validates only the caller-supplied evidence object required by a00074 S1.
 */

import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface IValidateEvidence {
	readonly timestamp: string;
	readonly exitCode: number;
	readonly logPath?: string | undefined;
}

export type IEvidenceCheckResult =
	| { ok: true }
	| {
			ok: false;
			code: 'missing-evidence' | 'stale-evidence' | 'invalid-evidence';
			reason: string;
	  };

const VALIDATE_EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const isEvidenceFresh = (
	evidence: Pick<IValidateEvidence, 'timestamp'>,
	nowMs = Date.now(),
): boolean => {
	const tsMs = Date.parse(evidence.timestamp);
	if (Number.isNaN(tsMs)) return false;
	return tsMs >= nowMs - VALIDATE_EVIDENCE_WINDOW_MS;
};

export const evidenceFileExists = async (logPath: string): Promise<boolean> => {
	try {
		const info = await stat(logPath);
		return info.isFile();
	} catch {
		return false;
	}
};

export const checkTransitionEvidence = (
	evidence: IValidateEvidence | undefined,
	nowMs = Date.now(),
): IEvidenceCheckResult => {
	if (evidence === undefined) {
		return {
			ok: false,
			code: 'missing-evidence',
			reason: 'validateEvidence is required to move pending/ready proposals directly to done',
		};
	}

	if (
		typeof evidence.timestamp !== 'string' ||
		evidence.timestamp.trim() === ''
	) {
		return {
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.timestamp must be a non-empty ISO string',
		};
	}

	const tsMs = Date.parse(evidence.timestamp);
	if (Number.isNaN(tsMs)) {
		return {
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.timestamp must be a valid ISO string',
		};
	}

	if (evidence.exitCode !== 0) {
		return {
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.exitCode must be 0',
		};
	}

	if (
		typeof evidence.logPath !== 'string' ||
		evidence.logPath.trim() === ''
	) {
		return {
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.logPath must be a non-empty file path',
		};
	}

	if (!isEvidenceFresh({ timestamp: evidence.timestamp }, nowMs)) {
		return {
			ok: false,
			code: 'stale-evidence',
			reason: 'validateEvidence.timestamp must be no older than 24 hours',
		};
	}

	if (!existsSync(evidence.logPath)) {
		return {
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.logPath must point to an existing file',
		};
	}

	return { ok: true };
};
