import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { runContinueProposal } from './continue-proposal.tool';
import type { IContinueProposalToolOptions } from './continue-proposal.tool';

export interface IAutoWorkToolOptions extends IContinueProposalToolOptions {
	/** Quality-gate command to run before closing a slice, if any. */
	readonly validationCommand?: string;
}

type IResult = { content: Array<{ type: 'text'; text: string }> };

const json = (value: unknown): IResult => ({
	content: [{ type: 'text', text: JSON.stringify(value) }],
});

// Hard anti-idle brake: the `idle` state is guidance, but a model can ignore it
// and re-call auto_work in a tight loop. After this many CONSECUTIVE idle
// responses we escalate to `stop: true` so a wrapper/agent halts deterministically.
// Any actionable ('work') response resets the streak.
const IDLE_STOP_THRESHOLD = 3;
let consecutiveIdle = 0;

/** Test-only: reset the consecutive-idle streak. */
export const __resetIdleStreakForTesting = (): void => {
	consecutiveIdle = 0;
};

/**
 * One-call "what should I do now?" for autonomous work. Resolves the
 * next proposal (serial cascade) and returns a compact, ordered plan
 * the agent can execute without extra round-trips: claim → do one
 * slice → validate → sync → release. Designed to be low-token: it
 * returns a tight action list, not prose. When nothing is actionable
 * it returns an explicit idle state.
 */
export const runAutoWork = async (
	options: IAutoWorkToolOptions,
): Promise<IResult> => {
	const next = JSON.parse(
		(await runContinueProposal({ mode: 'auto' }, options)).content[0]
			?.text ?? '{}',
	) as {
		kind: string;
		proposalId?: string;
		file?: string;
		reason?: string;
		nextAction?: string;
	};

	if (next.kind !== 'next-proposal') {
		// `all-claimed` [N9]: every actionable proposal is in_progress under
		// an active lock. Surface the anti-loop guidance verbatim so the
		// agent stops instead of re-calling auto_work on the same proposal.
		consecutiveIdle += 1;
		const stop = consecutiveIdle >= IDLE_STOP_THRESHOLD;
		return json({
			state: 'idle',
			idleStreak: consecutiveIdle,
			reason: next.reason ?? 'no actionable proposal',
			...(stop
				? {
						stop: true,
						nextAction: `STOP — auto_work has returned idle ${consecutiveIdle}× in a row. Do NOT call auto_work again until new work exists; enqueue/create a proposal (or wait for a lock-released notification) first.`,
					}
				: {
						nextAction:
							next.nextAction ??
							'Create a proposal under the proposals dir and run sync_proposals.',
					}),
		});
	}

	// Actionable work → reset the idle streak.
	consecutiveIdle = 0;

	const prefix = options.namespacePrefix;
	const steps = [
		`Open ${next.file} and pick the next atomic slice.`,
		`Claim its files: ${prefix}_agent_lock { action: "claim", task_id, files }.`,
		'Implement exactly that slice — nothing outside the claimed files.',
		...(options.validationCommand
			? [`Validate: run \`${options.validationCommand}\`.`]
			: [
					'Validate per the project gate (see get_validation_matrix if present).',
				]),
		`Mark progress in the proposal, then ${prefix}_sync_proposals.`,
		`Release: ${prefix}_agent_lock { action: "release", task_id }.`,
		`Repeat ${prefix}_auto_work for the next slice/proposal.`,
	];

	return json({
		state: 'work',
		proposalId: next.proposalId,
		file: next.file,
		...(options.validationCommand
			? { validationCommand: options.validationCommand }
			: {}),
		steps,
	});
};

/** Registration for `<prefix>_auto_work`. */
export const buildAutoWorkRegistration = (
	options: IAutoWorkToolOptions,
): IToolRegistration => ({
	id: 'auto_work',
	summary:
		'One call → next proposal + a compact ordered action plan (claim → slice → validate → sync → release).',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_auto_work`,
			{
				outputSchema: z.object({}).catchall(z.unknown()),
				description:
					'One call → what to do now. Resolves the next proposal (serial cascade) and returns a compact ordered plan (claim → slice → validate → sync → release), or an explicit idle state. Low-token: a tight action list, not prose.',
				inputSchema: z.object({}),
			},
			async () => runAutoWork(options),
		);
	},
});
