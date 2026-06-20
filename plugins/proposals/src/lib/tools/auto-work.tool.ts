import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { runContinueProposal } from './continue-proposal.tool';
import type { IContinueProposalToolOptions } from './continue-proposal.tool';
import type { IAutoWorkPersistMode } from './auto-work-persist';

/**
 * Optional persistence step the orchestrator can opt into at slice
 * close time. Three modes — `'none'` (default, no git), `'commit'`,
 * `'commit-and-push'`. See p109 §2 for the rationale; the helper
 * itself lives in `auto-work-persist.ts` and is invoked by the
 * orchestrator, not by `auto_work` (which only renders the plan).
 */
export interface IAutoWorkPersistConfig {
	readonly mode: IAutoWorkPersistMode;
	/**
	 * Conventional-Commits template. Default:
	 * `<area>(<proposalId>): <sliceId>`. Forwarded to
	 * `maybePersistAfterSlice`.
	 */
	readonly messageTemplate?: string;
	/**
	 * Push target. Default: `origin HEAD`. The push to `main` is
	 * always refused (safety net); use an explicit branch like
	 * `origin agent/<name>` for worktrees.
	 */
	readonly pushTarget?: string;
}

export interface IAutoWorkToolOptions extends IContinueProposalToolOptions {
	/** Quality-gate command to run before closing a slice, if any. */
	readonly validationCommand?: string;
	/**
	 * Default persistence mode for this workspace. Configured via
	 * `mcp-vertex.config.json#plugins.proposals.persist.mode`. The
	 * orchestrator can still override per call via `args.persist`.
	 */
	readonly persist?: IAutoWorkPersistConfig;
	readonly loopDetector?: any;
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
 * slice → validate → sync → [persist] → release. Designed to be
 * low-token: it returns a tight action list, not prose. When nothing
 * is actionable it returns an explicit idle state.
 *
 * When `options.persist.mode !== 'none'` the plan includes an extra
 * step that tells the orchestrator to invoke
 * `maybePersistAfterSlice(...)` after `sync_proposals`. The persist
 * itself is NOT executed inside this tool — `auto_work` is read-only
 * with respect to the workspace filesystem and git; it only renders
 * a plan. See p109 s3.
 */
export const runAutoWork = async (
	options: IAutoWorkToolOptions & {
		inputPersist?: IAutoWorkPersistMode | undefined;
	},
): Promise<IResult> => {
	if (options.loopDetector) {
		const stuckInfo = options.loopDetector.isAgentStuck(
			`${options.namespacePrefix}_auto_work`,
			{},
		);
		if (stuckInfo) {
			return json({
				state: 'idle',
				stop: true,
				reason: 'stuck-detected',
				handoffPath: stuckInfo.handoffPath,
				nextAction: stuckInfo.suggestedAction,
			});
		}
	}

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

	// Resolve the persist mode in priority order: tool input > config >
	// hard default `'none'`. Keeping this resolver pure and inline keeps
	// the call graph small; the orchestrator can also inspect the
	// returned `persist.mode` to decide whether to actually invoke
	// `maybePersistAfterSlice` later.
	const resolvedMode: IAutoWorkPersistMode =
		options.inputPersist ?? options.persist?.mode ?? 'none';

	const prefix = options.namespacePrefix;
	const persistStep =
		resolvedMode === 'none'
			? []
			: resolvedMode === 'commit'
				? [
						'Persist the slice: call the engine helper `maybePersistAfterSlice(<claim.files>, <proposalId>, <sliceId>, { mode: "commit" })` after `sync_proposals` and before `release`.',
					]
				: [
						'Persist the slice (commit + push): call `maybePersistAfterSlice(<claim.files>, <proposalId>, <sliceId>, { mode: "commit-and-push", pushTarget: "origin agent/<branch>" })` after `sync_proposals` and before `release`. The helper refuses to push to `main` automatically.',
					];

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
		...persistStep,
		`Release: ${prefix}_agent_lock { action: "release", task_id }.`,
		`Repeat ${prefix}_auto_work for the next slice/proposal.`,
	];

	const persistOut: {
		mode: IAutoWorkPersistMode;
		messageTemplate?: string;
		pushTarget?: string;
	} = {
		mode: resolvedMode,
	};
	if (options.persist?.messageTemplate !== undefined) {
		persistOut.messageTemplate = options.persist.messageTemplate;
	}
	if (options.persist?.pushTarget !== undefined) {
		persistOut.pushTarget = options.persist.pushTarget;
	}

	return json({
		state: 'work',
		proposalId: next.proposalId,
		file: next.file,
		...(options.validationCommand
			? { validationCommand: options.validationCommand }
			: {}),
		persist: persistOut,
		steps,
	});
};

const INPUT_SCHEMA = z
	.object({
		/**
		 * Optional per-call override for the persist mode. Resolved with
		 * priority `args.persist` > `config.persist.mode` > `'none'`.
		 * See p109 §2 "Prioridad de resolución".
		 */
		persist: z.enum(['none', 'commit', 'commit-and-push']).optional(),
	})
	.strict();

/** Registration for `<prefix>_auto_work`. */
export const buildAutoWorkRegistration = (
	options: IAutoWorkToolOptions,
): IToolRegistration => ({
	id: 'auto_work',
	summary:
		'One call → next proposal + a compact ordered action plan (claim → slice → validate → sync → [persist] → release).',
	descriptionKey: 'proposals_auto_work',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_auto_work`,
			{
				outputSchema: z.object({}).catchall(z.unknown()),
				description:
					'One call → what to do now. Resolves the next proposal (serial cascade) and returns a compact ordered plan (claim → slice → validate → sync → [persist] → release), or an explicit idle state. Low-token: a tight action list, not prose.',
				inputSchema: INPUT_SCHEMA,
			},
			async (args: { persist?: IAutoWorkPersistMode | undefined }) =>
				runAutoWork({
					...options,
					inputPersist: args.persist,
				}),
		);
	},
});
