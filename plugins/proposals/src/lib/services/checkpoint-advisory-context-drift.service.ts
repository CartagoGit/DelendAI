/**
 * CONTEXT_DRIFT for interactive agents (f00156 S6).
 *
 * Swarm workers keep AgentLoopDetectorService.isAgentStuck. This helper
 * is for interactive (non-swarm-slot) sessions: no-progress / repeat
 * evidence becomes a strong advisory, never a swarm handoff file.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

export const CONTEXT_DRIFT_CODE = 'CONTEXT_DRIFT';

const ORIENTATION_STEMS = [
	'overview',
	'round_context',
	'agent_catalog',
	'compact_status',
	'continue_proposal',
	'auto_work',
] as const;

export interface IInteractiveCall {
	readonly tool: string;
	readonly madeProgress: boolean;
	readonly progressHash: string;
	readonly agentId: string;
	readonly isOrientation?: boolean;
}

export interface IContextDriftOptions {
	readonly noProgressThreshold?: number;
	readonly interactive?: boolean;
}

const isOrientation = (tool: string): boolean => {
	const stem = tool.includes('_')
		? tool.split('_').slice(-2).join('_')
		: tool;
	return ORIENTATION_STEMS.some(
		(name) =>
			tool.endsWith(name) || stem === name || tool.endsWith(`_${name}`),
	);
};

export const assessContextDrift = (
	calls: readonly IInteractiveCall[],
	options: IContextDriftOptions = {},
): ICheckpointAdvisory | null => {
	if (options.interactive === false) return null;
	if (calls.length === 0) return null;
	const threshold = options.noProgressThreshold ?? 3;
	const last = calls.at(-1);
	if (last === undefined) return null;
	if (last.madeProgress) return null;

	let noProgress = 0;
	for (let index = calls.length - 1; index >= 0; index -= 1) {
		const call = calls[index]!;
		if (call.madeProgress) break;
		const orientation = call.isOrientation ?? isOrientation(call.tool);
		if (orientation) continue;
		noProgress += 1;
	}
	if (noProgress < threshold) return null;
	return {
		triggered: true,
		code: CONTEXT_DRIFT_CODE,
		severity: 'strong',
		message:
			'At this point, I recommend handing the current work to a fresh agent and resuming from a semantic checkpoint.',
		reason: 'the current agent is repeating actions without observable progress, which is a strong signal of context drift',
		nextAction: 'handoff-to-fresh-agent',
		dedupeKey: `CONTEXT_DRIFT:${last.agentId}:${last.progressHash}`,
	};
};
