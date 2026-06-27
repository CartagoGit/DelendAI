import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { runContinueProposal } from './continue-proposal.tool';
import type { IContinueProposalToolOptions } from './continue-proposal.tool';
import type { IAutoWorkPersistMode } from '../tools/auto-work-persist';
import { createGitRunner } from '../shared/git-runner';
import { runBranchStatusEngine } from '../shared/branch-status-engine';

/**
 * Optional persistence step the orchestrator can opt into at slice
 * close time. Three modes — `'none'` (default, no git), `'commit'`,
 * `'commit-and-push'`. See l109 §2 for the rationale; the helper
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

export interface IAutoWorkOrchestrationConfig {
	/**
	 * Number of main-thread tool calls after which the returned plan should
	 * push the agent toward `<prefix>_continue_proposal mode:"plan"` +
	 * `<prefix>_delegate`. The tool cannot know slice size before the
	 * proposal is inspected, so this is a compact policy hint for the
	 * orchestrator's next decision.
	 */
	readonly delegateAfterToolCalls?: number;
}

export interface IAutoWorkToolOptions extends IContinueProposalToolOptions {
	/** f00073: absolute workspace root, used by the branch-status warning pass. */
	readonly workspaceRoot?: string;
	/** Quality-gate command to run before closing a slice, if any. */
	readonly validationCommand?: string;
	/**
	 * Default persistence mode for this workspace. Configured via
	 * `mcp-vertex.config.json#plugins.proposals.persist.mode`. The
	 * orchestrator can still override per call via `args.persist`.
	 */
	readonly persist?: IAutoWorkPersistConfig;
	readonly orchestration?: IAutoWorkOrchestrationConfig;
	readonly loopDetector?: any;
	/**
	 * Tool names the loop detector MUST skip. Defaults to `[<prefix>_auto_work]`
	 * so the in-tool `consecutiveIdle` streak (3 consecutive idle returns) is
	 * the sole brake for `auto_work` no-args calls — otherwise a user calling
	 * `auto_work` three times in a row on a cascade with no actionable proposal
	 * gets a hard `stop: true` from the detector even though the cascade still
	 * has work to return on the next call. The detector is still wired and
	 * still fires on actual loops (same `agent_lock claim` retried, same
	 * `sync_proposals` retried, etc.).
	 */
	readonly loopDetectorDisableFor?: readonly string[];
	/**
	 * Default for the per-call `includePaused` arg: when true, the
	 * auto_work plan falls back to a paused-proposals cascade when
	 * the standard cascade has no actionable candidates. Default false
	 * — paused proposals never interrupt the normal pick. Configurable
	 * per workspace via `mcp-vertex.config.json#plugins.proposals.
	 * autoWork.includePaused` so a single-agent session that is happy
	 * to reopen paused work can default-on it without re-typing the
	 * arg on every call.
	 */
	readonly defaultIncludePaused?: boolean;
}

/**
 * Default tool names the loop detector skips. The orchestrator's host can
 * extend or replace this via `loopDetectorDisableFor` on the tool options.
 * `<prefix>_auto_work` is excluded by default — see the doc comment on
 * `IAutoWorkToolOptions.loopDetectorDisableFor` for the rationale.
 */
export const DEFAULT_LOOP_DETECTOR_DISABLE_FOR = [
	'proposals_auto_work',
] as const;

const json = toolJson;

// Hard anti-idle brake: the `idle` state is guidance, but a model can ignore it
// and re-call auto_work in a tight loop. After this many CONSECUTIVE idle
// responses we escalate to `stop: true` so a wrapper/agent halts deterministically.
// Any actionable ('work') response resets the streak.
const IDLE_STOP_THRESHOLD = 3;
export const DEFAULT_DELEGATE_AFTER_TOOL_CALLS = 3;
let consecutiveIdle = 0;

/** Test-only: reset the consecutive-idle streak. */
export const __resetIdleStreakForTesting = (): void => {
	consecutiveIdle = 0;
};

export interface IAutoWorkOrchestrationPolicy {
	readonly lane: 'inspect-then-delegate';
	readonly delegateAfterToolCalls: number;
	readonly next: string;
	readonly policy: string;
}

export const buildAutoWorkOrchestrationPolicy = (options: {
	readonly namespacePrefix: string;
	readonly proposalId: string;
	readonly delegateAfterToolCalls?: number | undefined;
}): IAutoWorkOrchestrationPolicy => {
	const delegateAfterToolCalls =
		options.delegateAfterToolCalls ?? DEFAULT_DELEGATE_AFTER_TOOL_CALLS;
	return {
		lane: 'inspect-then-delegate',
		delegateAfterToolCalls,
		next: `${options.namespacePrefix}_continue_proposal { proposalId: "${options.proposalId}", mode: "plan" }`,
		policy: `Keep the main thread to auto_work/plan/delegate. If the slice needs >${delegateAfterToolCalls} tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the research here.`,
	};
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
 * a plan. See l109 s3.
 */
export const runAutoWork = async (
	options: IAutoWorkToolOptions & {
		inputPersist?: IAutoWorkPersistMode | undefined;
		/**
		 * Per-call override for the paused-fallback behaviour. Resolved
		 * with priority `input` > `options.defaultIncludePaused` > false.
		 * When true, the engine's `runContinueProposal` runs a second
		 * cascade over `paused/` if the primary cascade has nothing
		 * actionable. The flag is engine-internal — it never reaches
		 * the public `continue_proposal` tool surface.
		 */
		inputIncludePaused?: boolean | undefined;
	},
): Promise<IToolTextResult> => {
	if (options.loopDetector) {
		// The detector is a safety net for actual loops (same
		// `agent_lock claim` retried, same `sync_proposals` retried).
		// For the `auto_work` no-args case the in-tool `consecutiveIdle`
		// streak is the right brake — the detector would otherwise trap
		// the orchestrator in a stop state when the cascade has work to
		// return on the next call (see a00033 S3 / H1).
		const autoWorkToolName = `${options.namespacePrefix}_auto_work`;
		const disabled = options.loopDetectorDisableFor ?? [
			...DEFAULT_LOOP_DETECTOR_DISABLE_FOR,
		];
		if (!disabled.includes(autoWorkToolName)) {
			const stuckInfo = options.loopDetector.isAgentStuck(
				autoWorkToolName,
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
	}

	const includePausedFallback =
		options.inputIncludePaused ?? options.defaultIncludePaused ?? false;

	const next = JSON.parse(
		(
			await runContinueProposal(
				{ mode: 'auto' },
				{ ...options, includePausedFallback },
			)
		).content[0]?.text ?? '{}',
	) as {
		kind: string;
		proposalId?: string;
		file?: string;
		reason?: string;
		nextAction?: string;
		pickedFromPaused?: boolean;
	};

	if (next.kind !== 'next-proposal') {
		// `all-claimed`: every actionable proposal is in_progress under
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
							'Create a proposal under the proposals dir; only run sync_proposals after creating/renaming proposal files or after the last open slice of a proposal is closed.',
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
	const orchestration = buildAutoWorkOrchestrationPolicy({
		namespacePrefix: prefix,
		proposalId: next.proposalId ?? 'unknown',
		delegateAfterToolCalls: options.orchestration?.delegateAfterToolCalls,
	});
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

	// x00051 S3: when persist is enabled, the plan must surface the
	// `agent_worktree create` step explicitly so a host that runs
	// `auto_work` solo (without going through `delegate`) still
	// produces the per-agent branch before the persist push. When
	// persist is `none`, no worktree step is needed — the orchestrator
	// is not pushing.
	const worktreeStep =
		resolvedMode === 'none'
			? []
			: [
					`Ensure per-agent worktree exists before persisting: ${prefix}_agent_worktree { action: "create", agent: "<pending>" } (idempotent — returns the existing worktree if one is present; required when persist mode is "${resolvedMode}"). When the slice is delegated via ${prefix}_delegate this is handled for you; keep the step as a safety net for solo runs.`,
				];

	const steps = [
		...worktreeStep,
		`Open ${next.file} and pick the next atomic slice.`,
		`If non-trivial: ${orchestration.next}; then ${prefix}_delegate one claimable slice to a subagent.`,
		`Claim its files: ${prefix}_agent_lock { action: "claim", task_id, files }. On lock-conflict or all-claimed work, use ${prefix}_await_lock once (or wait for a lock-released notification) — do NOT poll status in a loop.`,
		'Implement exactly that slice — nothing outside the claimed files.',
		...(options.validationCommand
			? [`Validate: run \`${options.validationCommand}\`.`]
			: [
					'Validate per the project gate (see get_validation_matrix if present).',
				]),
		`Mark progress in the proposal, then ${prefix}_close_slice { id, sliceId } to flip the slice status and release the lock atomically.`,
		`If that was the last open slice for the proposal, run ${prefix}_sync_proposals once; otherwise do not sync mid-flight.`,
		...persistStep,
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
		orchestration,
		...(options.validationCommand
			? { validationCommand: options.validationCommand }
			: {}),
		persist: persistOut,
		...(next.pickedFromPaused === true
			? { pickedFromPaused: true as const }
			: {}),
		steps,
		// f00073: branch + worktree warnings, fire-and-forget. Never
		// blocks the plan. Lets the orchestrator surface "agent X has
		// 8 dirty files" / "Y is 5 commits behind" without a second
		// tool call. Failures are swallowed — the status snapshot is
		// advisory, not gating.
		branchStatusWarnings: await collectBranchStatusWarnings(
			options.workspaceRoot ?? '',
		),
	});
};

const INPUT_SCHEMA = z
	.object({
		/**
		 * Optional per-call override for the persist mode. Resolved with
		 * priority `args.persist` > `config.persist.mode` > `'none'`.
		 * See l109 §2 "Prioridad de resolución".
		 */
		persist: z.enum(['none', 'commit', 'commit-and-push']).optional(),
		/**
		 * When true, fall back to a paused-proposals cascade if the
		 * standard cascade has no actionable candidates. Default false.
		 * Resolved with priority `args.includePaused` >
		 * `config.autoWork.defaultIncludePaused` > false. Paused
		 * proposals are NEVER interleaved with the primary cascade —
		 * they only enter when nothing else is actionable.
		 */
		includePaused: z.boolean().optional(),
	})
	.strict();

const AUTO_WORK_ORCHESTRATION_OUTPUT_SCHEMA = z.object({
	lane: z.literal('inspect-then-delegate'),
	delegateAfterToolCalls: z.number().int().positive(),
	next: z.string(),
	policy: z.string(),
});

const AUTO_WORK_PERSIST_OUTPUT_SCHEMA = z.object({
	mode: z.enum(['none', 'commit', 'commit-and-push']),
	messageTemplate: z.string().optional(),
	pushTarget: z.string().optional(),
});

const AUTO_WORK_OUTPUT_SCHEMA = z.object({
	state: z.enum(['idle', 'work']),
	idleStreak: z.number().int().positive().optional(),
	reason: z.string().optional(),
	stop: z.literal(true).optional(),
	handoffPath: z.string().optional(),
	nextAction: z.string().optional(),
	proposalId: z.string().optional(),
	file: z.string().optional(),
	pickedFromPaused: z.literal(true).optional(),
	orchestration: AUTO_WORK_ORCHESTRATION_OUTPUT_SCHEMA.optional(),
	validationCommand: z.string().optional(),
	persist: AUTO_WORK_PERSIST_OUTPUT_SCHEMA.optional(),
	steps: z.array(z.string()).optional(),
	// f00073: optional array of warnings about other agents' branch /
	// worktree state. Empty when the swarm is clean.
	branchStatusWarnings: z.array(z.string()).optional(),
});

/**
 * f00073: build a list of warnings from the branch + worktree snapshot.
 * Empty array on failure or when nothing is wrong — never blocks the
 * plan. Mirrors the "fail soft" contract used elsewhere in
 * `auto-work.tool.ts` (the loop detector, etc.).
 */
const collectBranchStatusWarnings = async (
	workspaceRoot: string,
): Promise<string[]> => {
	try {
		const snapshot = await runBranchStatusEngine({
			run: createGitRunner(workspaceRoot),
			workspaceRoot,
		});
		if (!snapshot.ok) return [];
		const warnings: string[] = [];
		for (const wt of snapshot.worktrees) {
			if (wt.dirtyFiles > 0 || wt.untrackedFiles > 0) {
				warnings.push(
					`worktree ${wt.path} (${wt.branch}): ${wt.dirtyFiles} dirty + ${wt.untrackedFiles} untracked (${wt.ageLabel})`,
				);
			}
			if (wt.outOfCache) {
				warnings.push(
					`worktree ${wt.path} lives outside the canonical cache dir (AGENTS.md violation)`,
				);
			}
		}
		for (const branch of snapshot.branches) {
			if (branch.behind > 0) {
				warnings.push(
					`branch ${branch.name} is ${branch.behind} commit(s) behind develop`,
				);
			}
			if (branch.ahead > 0 && !branch.mergedIntoBase) {
				warnings.push(
					`branch ${branch.name} has ${branch.ahead} unmerged commit(s) ahead of develop`,
				);
			}
		}
		return warnings;
	} catch {
		return [];
	}
};

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
				outputSchema: AUTO_WORK_OUTPUT_SCHEMA,
				description:
					'One call → what to do now. Resolves the next proposal (serial cascade) and returns a compact ordered plan (claim → slice → validate → sync → [persist] → release), or an explicit idle state. Low-token: a tight action list, not prose.',
				inputSchema: INPUT_SCHEMA,
			},
			async (args: {
				persist?: IAutoWorkPersistMode | undefined;
				includePaused?: boolean | undefined;
			}) =>
				runAutoWork({
					...options,
					inputPersist: args.persist,
					inputIncludePaused: args.includePaused,
				}),
		);
	},
});
