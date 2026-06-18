/**
 * round-context-resume.ts
 *
 * Pure derivation of the round identity (`buildRoundId`) and the
 * resume/next hint (`buildResumeHint`) from an already-collected
 * snapshot (N20 split of the former monolithic `round-context.ts`).
 *
 * No filesystem access: these functions only fold already-read state
 * into a stable id and a single resume recommendation.
 */

import { CLOSED_CHECKPOINT_STATUSES } from './runtime-recovery';
import { computeFingerprint } from './round-context-hash';
import type {
	IRoundContextAgent,
	IRoundContextChatContext,
	IRoundContextCheckpoint,
	IRoundContextLock,
	IRoundContextResumeHint,
	IRoundContextSources,
} from './round-context-types';

export const buildRoundId = (input: {
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
}): string => {
	const raw = JSON.stringify({
		proposal: input.activeProposalId,
		task: input.currentTaskId,
		core: input.coreDocHashes,
		sources: input.sources,
		locks: input.activeLocks.map((lock) => lock.taskId),
		agents: input.activeAgents.map((agent) => agent.taskId),
	});
	return `round-${computeFingerprint(raw)}`;
};

export const buildResumeHint = (input: {
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
}): IRoundContextResumeHint => {
	const inferredTaskId =
		input.currentTaskId !== 'unknown'
			? input.currentTaskId
			: (input.activeLocks[0]?.taskId ?? input.activeAgents[0]?.taskId);
	const inferredProposalIdFromTask =
		inferredTaskId?.match(/^([pga]\d+[a-z]?)/)?.[1];
	const proposalId =
		input.checkpoint.proposalId ??
		input.chatContext.proposalIds[0] ??
		inferredProposalIdFromTask ??
		input.activeProposalId;
	const checkpointStatus = input.checkpoint.status?.trim().toLowerCase();
	if (
		checkpointStatus !== undefined &&
		checkpointStatus.length > 0 &&
		!CLOSED_CHECKPOINT_STATUSES.has(checkpointStatus)
	) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Checkpoint abierto: continuar el slice actual.',
			...(input.checkpoint.selectedTask !== undefined
				? { taskId: input.checkpoint.selectedTask }
				: inferredTaskId !== undefined
					? { taskId: inferredTaskId }
					: {}),
		};
	}
	if (
		checkpointStatus !== undefined &&
		CLOSED_CHECKPOINT_STATUSES.has(checkpointStatus)
	) {
		return {
			mode: 'next',
			proposalId,
			reason: 'Checkpoint cerrado: avanzar al siguiente slice compatible.',
			...(input.checkpoint.selectedTask !== undefined
				? { taskId: input.checkpoint.selectedTask }
				: input.currentTaskId !== 'unknown'
					? { taskId: input.currentTaskId }
					: {}),
		};
	}
	if (input.chatContext.proposalIds.length > 0) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Chat context activo: retomar la proposal prioritaria.',
			...(inferredTaskId !== undefined ? { taskId: inferredTaskId } : {}),
		};
	}
	if (inferredTaskId !== undefined) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Lock o subagente activo: retomar el slice en vuelo.',
			taskId: inferredTaskId,
		};
	}
	return {
		mode: 'unknown',
		proposalId,
		reason: 'Sin señal suficiente para decidir resume o next.',
		...(inferredTaskId !== undefined ? { taskId: inferredTaskId } : {}),
	};
};
