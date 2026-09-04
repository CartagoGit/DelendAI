/**
 * STALE_ACCEPTANCE (f00156 S7).
 *
 * Commit with incomplete acceptance → recommend at most.
 * Push with objectively stale required evidence → block.
 * No declared validation requirement → no advisory.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

import {
	isAcceptanceStale,
	type ISliceAcceptanceEvidence,
} from './slice-acceptance-evidence.service';

export const STALE_ACCEPTANCE_CODE = 'STALE_ACCEPTANCE';

export type PersistIntent = 'commit' | 'push';

export const assessStaleAcceptance = (
	evidence: ISliceAcceptanceEvidence,
	intent: PersistIntent,
): ICheckpointAdvisory | null => {
	if (evidence.requiresValidation !== true) return null;
	if (!isAcceptanceStale(evidence)) return null;
	const isPush = intent === 'push';
	return {
		triggered: true,
		code: STALE_ACCEPTANCE_CODE,
		severity: isPush ? 'block' : 'recommend',
		message: isPush
			? 'At this point, I recommend not pushing yet.'
			: 'At this point, I recommend treating this commit as a local checkpoint only; validate before pushing.',
		reason: 'the active slice changed after its latest successful validation',
		nextAction: 'validate-before-push',
		dedupeKey: `STALE_ACCEPTANCE:${evidence.sliceId}:${evidence.gitTreeHash}`,
	};
};
