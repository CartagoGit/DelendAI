import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
	ICommitAuthorResolution,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { runContinueProposal } from './continue-proposal.tool';
import type { IContinueProposalToolOptions } from './continue-proposal.tool';
import type { IAutoWorkPersistMode } from '../tools/auto-work-persist';
import { createGitRunner } from '../shared/git-runner';
import { runBranchStatusEngine } from '../shared/branch-status-engine';
import { runBranchGcEngine } from '../shared/branch-gc-engine';
import {
	runSwarmHygieneEngine,
	type IRescueCandidate,
} from '../shared/swarm-hygiene-engine';
import { runStashSnapshot, type IStashEntry } from '../shared/stash-snapshot';
import { detectAgentLoop, type IToolCall } from '../agents/agent-loop-detector';

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
	/**
	 * f00078 S1: when `true`, the auto_work front-hook refuses to
	 * return a plan unless the active branch is `agent/<name>`.
	 * Hosts that have the agentWorktree gate on (mcp-vertex.config.json
	 * has `agentWorktree: true`) MUST pass `true` here. Hosts that
	 * run solo without worktree isolation pass `false` (or omit).
	 */
	readonly agentWorktreeEnabled?: boolean;
	/**
	 * f00078 S3: sliding window of recent tool calls the host has
	 * observed (typically populated by the lock-file change listener).
	 * When present, auto_work runs the post-fix loop detector
	 * (x00074) on this window before rendering the plan, and
	 * returns `loop-blocked` if it fires. Omit the field (or pass
	 * an empty array) to skip the check.
	 */
	readonly loopDetectorWindow?: readonly IToolCall[];
	/** x00074 S2: window in ms; defaults to 30s. */
	readonly loopDetectorCooldownMs?: number;
	/** x00074 S3: opt-in; when true, the progressHash gate runs. */
	readonly loopDetectorProgressGate?: boolean;
	/** f00082: resolved commit-author policy. */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
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
		/**
		 * f00075 S4: per-call override for the hygiene front-hook.
		 * Resolved with priority `input` > false. When true, the
		 * front-hook returns the empty payload (no rescue / stash /
		 * gc / out-of-cache checks), so a session that has already
		 * handled the blockers manually can proceed straight to slice
		 * selection.
		 */
		inputForceHygieneBypass?: boolean | undefined;
	},
): Promise<IToolTextResult> => {
	// f00078 S1: needs-worktree gate. When the host gate is on AND the
	// active branch is not `agent/<name>`, refuse the plan. The
	// `agentWorktreeEnabled` flag is propagated via IAutoWorkToolOptions
	// (the host passes it from the plugin context). The check is a
	// no-op when the gate is off so solo hosts are unaffected.
	if (options.agentWorktreeEnabled === true) {
		const branchCheck = await readCurrentBranchName(
			options.workspaceRoot ?? '',
		);
		if (branchCheck.ok && !branchCheck.isAgentBranch) {
			consecutiveIdle = 0;
			return json({
				state: 'work',
				ok: false,
				reason: 'needs-worktree',
				executionMode: 'blocked',
				hygieneBlockers: [
					`active branch is "${branchCheck.branch}"; per-agent isolation is required (agentWorktree gate is on)`,
				],
				hygieneActions: [
					`proposals_agent_worktree { action: "create", agent: "<your-agent-name>" }`,
				],
				hygieneWarnings: [],
				nextAction:
					'Create a per-agent worktree before requesting a plan. The slice-selection cascade was NOT run.',
			});
		}
	}

	// f00078 S3: loop-blocked gate. Run the pure detector on the
	// last 50 calls. x00074's outcome-aware + cooldown + progress-aware
	// guards fire here. The `isAgentStuck` check above is the legacy
	// fast-path; this one is the precise post-fix detector.
	if (options.loopDetectorWindow && options.loopDetectorWindow.length > 0) {
		const verdict = detectAgentLoop(options.loopDetectorWindow, {
			cooldownMs: options.loopDetectorCooldownMs ?? 30_000,
			progressHashGate: options.loopDetectorProgressGate === true,
		});
		if (verdict.isStuck) {
			consecutiveIdle = 0;
			return json({
				state: 'work',
				ok: false,
				reason: 'loop-blocked',
				executionMode: 'blocked',
				hygieneBlockers: [
					`loop detector fired on ${verdict.offendingTool} (effectiveCount=${verdict.effectiveCount})`,
				],
				hygieneActions: [
					'Read the handoff packet at the path returned by the previous auto_work response; resolve the stuck call (different args, different tool, or backoff); then proposals_continue_proposal { mode: "auto" }.',
				],
				hygieneWarnings: [],
				offendingTool: verdict.offendingTool,
				triggeredGuards: [...verdict.triggeredGuards],
				effectiveCount: verdict.effectiveCount,
				nextAction:
					'The loop detector tripped; do not re-call auto_work until the stuck call is resolved.',
			});
		}
	}

	// Legacy fast-path detector (a00033 S3 / H1). The
	// `isAgentStuck` check is the in-tool exact-repeat brake; the
	// x00074 outcome-aware detector above is the precise post-fix
	// detector. Both can run in the same call — the legacy one only
	// fires when a host has injected a `loopDetector` instance AND
	// the auto_work tool name is NOT in the disable list.
	if (options.loopDetector) {
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

	// f00075 S4: front-hook runs BEFORE the slice-selection cascade.
	// It is idempotent and side-effect free (read-only git commands
	// only). If the snapshot reports rescue candidates OR stashes,
	// the plan is BLOCKED — the orchestrator must surface the
	// blockers and the human decides whether to pop / cherry-pick /
	// merge. `forceHygieneBypass: true` skips the check.
	const hygiene = await collectHygieneFrontHook(
		options.workspaceRoot ?? '',
		options.inputForceHygieneBypass === true,
	);
	if (hygiene.executionMode === 'blocked') {
		consecutiveIdle = 0;
		return json({
			state: 'work',
			ok: false,
			reason: 'hygiene-blocked',
			executionMode: 'blocked',
			hygieneBlockers: [...hygiene.hygieneBlockers],
			...(hygiene.hygieneActions.length > 0
				? { hygieneActions: [...hygiene.hygieneActions] }
				: {}),
			...(hygiene.hygieneWarnings.length > 0
				? { hygieneWarnings: [...hygiene.hygieneWarnings] }
				: {}),
			stashes: [...hygiene.stashes],
			rescueCandidates: [...hygiene.rescueCandidates],
			blockers: [...hygiene.hygieneBlockers],
			nextAction:
				'Resolve the hygiene blockers above (pop stashes, cherry-pick rescue branches, or pass forceHygieneBypass:true) and call auto_work again. The slice-selection cascade was NOT run.',
		});
	}

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

	const branchStatusWarnings = await collectBranchStatusWarnings(
		options.workspaceRoot ?? '',
	);
	const branchHygieneHints =
		branchStatusWarnings.length > 0
			? ((await collectBranchHygieneHints(options.workspaceRoot ?? '')) ??
				[])
			: undefined;

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
		branchStatusWarnings,
		// f00075 S1: hygiene hints ride along only when there is
		// already something to flag. Cheap (reuses the same git
		// runner, no extra round-trip to a separate tool) and bounded
		// (≤3 lines + 1 footer). undefined when nothing is eligible.
		...(branchHygieneHints !== undefined ? { branchHygieneHints } : {}),
		// f00075 S4: front-hook result rides on the work-plan too.
		// `executionMode` is `'confirm-required'` when the GC dry-run
		// has entries, `'normal'` otherwise; `'blocked'` was handled
		// at the top of the function (returns early, never reaches
		// here). The arrays are omitted when empty to keep the plan
		// cheap.
		executionMode: hygiene.executionMode,
		...(hygiene.hygieneActions.length > 0
			? { hygieneActions: [...hygiene.hygieneActions] }
			: {}),
		...(hygiene.hygieneWarnings.length > 0
			? { hygieneWarnings: [...hygiene.hygieneWarnings] }
			: {}),
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
		/**
		 * f00075 S4: when true, the auto_work front-hook skips the
		 * four-state hygiene check (rescue / stash / gc / out-of-cache)
		 * and proceeds straight to slice selection. Default false —
		 * the orchestrator is strict by default because rescue
		 * candidates and stashes represent work at risk of loss, which
		 * is exactly the failure mode the user complained about.
		 * Use this when the user has already handled the blockers
		 * manually (e.g. they just popped the stash, or they already
		 * cherry-picked the rescue branch) and want the plan to
		 * continue.
		 */
		forceHygieneBypass: z.boolean().optional(),
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
	// f00075 S4: front-hook hygiene fields. `executionMode` is
	// `'normal'` when nothing is wrong, `'confirm-required'` when the
	// GC plan has entries, `'blocked'` when rescue candidates or
	// stashes are pending. `ok: false` plus `reason: 'hygiene-blocked'`
	// is the strict-mode reply when the orchestrator cannot proceed
	// without human action.
	executionMode: z.enum(['normal', 'confirm-required', 'blocked']).optional(),
	hygieneBlockers: z.array(z.string()).optional(),
	hygieneActions: z.array(z.string()).optional(),
	hygieneWarnings: z.array(z.string()).optional(),
	stashes: z
		.array(
			z.object({
				index: z.number().int().nonnegative(),
				ref: z.string(),
				branch: z.string().nullable(),
				message: z.string(),
				date: z.string().nullable(),
			}),
		)
		.optional(),
	rescueCandidates: z
		.array(
			z.object({
				branch: z.string(),
				ahead: z.number().int().nonnegative(),
				behind: z.number().int().nonnegative(),
				lastCommitMinutesAgo: z.number().int(),
				worktreePath: z.string(),
				diffStat: z.string(),
				cherryPickHint: z.string(),
			}),
		)
		.optional(),
	// Strict-mode envelope: when the front-hook blocks, the plan also
	// sets `ok: false` and `reason: 'hygiene-blocked'`. The fields
	// below are the structured payload so the orchestrator can render
	// the exact branches/stashes that need human action.
	ok: z.boolean().optional(),
	blockers: z.array(z.string()).optional(),
});

/**
 * f00078 S1: read the current branch name in 2 git calls. Returns
 * the branch (or `HEAD` for detached) and a `isAgentBranch` boolean.
 * Used by the `needs-worktree` gate. Fail-soft: any error returns
 * `{ ok: false }` and the gate is skipped.
 */
const readCurrentBranchName = async (
	workspaceRoot: string,
): Promise<
	{ ok: true; branch: string; isAgentBranch: boolean } | { ok: false }
> => {
	if (workspaceRoot.length === 0) return { ok: false };
	try {
		const run = createGitRunner(workspaceRoot);
		const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
		if (!result.ok) return { ok: false };
		const branch = result.output.trim();
		// Detached HEAD (or in a brand-new repo with no commits) reports
		// 'HEAD' — never an agent branch, always blocked.
		return {
			ok: true,
			branch: branch.length === 0 ? 'HEAD' : branch,
			isAgentBranch:
				branch.startsWith('agent/') && branch.length > 'agent/'.length,
		};
	} catch {
		return { ok: false };
	}
};

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

/**
 * f00075 S1: when the f00073 warnings are non-empty, also surface a
 * short GC dry-run summary so the orchestrator can decide whether to
 * call `branch_gc({ dryRun: false })`. Always fire-and-forget; never
 * blocks. Capped at 3 lines so the plan stays cheap.
 */
const collectBranchHygieneHints = async (
	workspaceRoot: string,
): Promise<string[] | undefined> => {
	if (workspaceRoot.length === 0) return undefined;
	try {
		const result = await runBranchGcEngine({
			run: createGitRunner(workspaceRoot),
			workspaceRoot,
			dryRun: true,
		});
		if (!result.ok) return undefined;
		const eligible = result.removed.slice(0, 3);
		if (eligible.length === 0) return undefined;
		const lines: string[] = [
			`branch_gc dry-run: ${result.summary.dryRunRemovedCount} worktree(s) eligible`,
		];
		for (const entry of eligible) {
			lines.push(
				`  · ${entry.path} (${entry.branch}) — ${entry.reason}, ${entry.dirtyFiles} dirty / ${entry.untrackedFiles} untracked, age ${entry.ageLabel}`,
			);
		}
		lines.push(
			'  run proposals_branch_gc { dryRun: false, force: false } to actually remove (unmerged branches are always safe).',
		);
		return lines;
	} catch {
		return undefined;
	}
};

/**
 * f00075 S4: front-hook decision payload. Combines the swarm-hygiene
 * engine (`rescueCandidates` / `gcEligible` / `outOfCache`) with the
 * stash snapshot (`stashes`) and computes the four-state
 * `executionMode` plus the human-readable `hygieneBlockers` /
 * `hygieneActions` / `hygieneWarnings` arrays.
 *
 * Pure over (workspaceRoot, run, forceBypass). Never throws: any
 * internal failure collapses to `executionMode: 'normal'` with empty
 * arrays so the plan proceeds (fail-soft — same contract as
 * `collectBranchStatusWarnings`).
 */
export interface IHygieneFrontHook {
	readonly executionMode: 'normal' | 'confirm-required' | 'blocked';
	readonly hygieneBlockers: readonly string[];
	readonly hygieneActions: readonly string[];
	readonly hygieneWarnings: readonly string[];
	readonly rescueCandidates: readonly IRescueCandidate[];
	readonly gcEligibleCount: number;
	readonly outOfCacheCount: number;
	readonly stashes: readonly IStashEntry[];
}

const emptyHygieneFrontHook: IHygieneFrontHook = {
	executionMode: 'normal',
	hygieneBlockers: [],
	hygieneActions: [],
	hygieneWarnings: [],
	rescueCandidates: [],
	gcEligibleCount: 0,
	outOfCacheCount: 0,
	stashes: [],
};

/**
 * Build the strict-mode `blockers` lines from rescue candidates. One
 * line per candidate — short enough to stay cheap, structured enough
 * to point the operator at the right `cherryPickHint` (rendered via
 * `rescueCandidates[]` on the response payload, not duplicated here).
 */
const rescueBlockersFor = (
	rescueCandidates: readonly IRescueCandidate[],
): string[] => {
	if (rescueCandidates.length === 0) return [];
	const blockers: string[] = [
		`${rescueCandidates.length} rescue candidate(s) ahead of develop and not merged — cherry-pick to develop or merge before starting new work`,
	];
	for (const r of rescueCandidates) {
		blockers.push(
			`  · ${r.branch} is ahead by ${r.ahead} commit(s) on ${r.worktreePath.length > 0 ? r.worktreePath : '(no worktree)'}`,
		);
	}
	return blockers;
};

/**
 * Build the strict-mode `blockers` lines from the stash list. One
 * line per stash, capped at 5 to keep the plan cheap. The full
 * `stashes[]` array rides on the response so the operator can render
 * the dates and refs from the structured payload.
 */
const stashBlockersFor = (stashes: readonly IStashEntry[]): string[] => {
	if (stashes.length === 0) return [];
	const lines: string[] = [
		`${stashes.length} stash(es) present — pop + commit, apply, or drop before starting new work`,
	];
	for (const stash of stashes.slice(0, 5)) {
		const branchLabel = stash.branch ?? '(detached HEAD)';
		lines.push(`  · ${stash.ref} on ${branchLabel}: ${stash.message}`);
	}
	if (stashes.length > 5) {
		lines.push(
			`  · ...and ${stashes.length - 5} more (see stashes[] on the response)`,
		);
	}
	return lines;
};

/**
 * Build the GC dry-run summary lines. One-line summary plus the top 3
 * paths so the orchestrator can decide whether to escalate to
 * `proposals_branch_gc { dryRun: false }`. The full list of entries
 * already rides on `swarm_hygiene.gcEligible` — we don't duplicate
 * it here, just summarise.
 */
const gcActionsFor = (
	gcEligible: readonly { readonly path: string; readonly branch: string }[],
): string[] => {
	if (gcEligible.length === 0) return [];
	const top = gcEligible.slice(0, 3);
	const lines: string[] = [
		`branch_gc dry-run would remove ${gcEligible.length} worktree(s) (review and run proposals_branch_gc { dryRun: false } or pass forceHygieneBypass:true)`,
	];
	for (const entry of top) {
		lines.push(`  · ${entry.path} (${entry.branch})`);
	}
	if (gcEligible.length > 3) {
		lines.push(
			`  · ...and ${gcEligible.length - 3} more (see swarm_hygiene.gcEligible)`,
		);
	}
	return lines;
};

/**
 * Build the out-of-cache warning lines. One summary line — the full
 * list rides on `swarm_hygiene.outOfCache`.
 */
const outOfCacheWarningsFor = (
	outOfCache: readonly { readonly path: string }[],
): string[] => {
	if (outOfCache.length === 0) return [];
	return [
		`${outOfCache.length} worktree(s) outside the canonical cache dir (AGENTS.md violation) — review and remove manually (see swarm_hygiene.outOfCache)`,
	];
};

/**
 * f00075 S4: front-hook that runs BEFORE slice selection. Returns the
 * computed `executionMode` plus the arrays that the plan surfaces.
 *
 * Decision matrix (per the proposal):
 *
 * | Snapshot state                | executionMode      | Effect on auto_work |
 * |-------------------------------|--------------------|---------------------|
 * | rescueCandidates.length > 0   | `'blocked'`        | Returns `{ ok: false, reason: 'hygiene-blocked', ... }` |
 * | stashes.length > 0            | `'blocked'`        | Same envelope.      |
 * | gcEligible.length > 0 (only)  | `'confirm-required'` | Plan proceeds with hygieneActions. |
 * | outOfCache.length > 0 (only)  | `'warning'`        | Plan proceeds with hygieneWarnings. |
 * | otherwise                     | `'normal'`         | Plan proceeds unchanged. |
 *
 * `forceBypass` skips the entire check and returns the empty
 * `IHygieneFrontHook`. The caller can still surface the bypass
 * decision via `executionMode: 'normal'` (no special "bypassed"
 * sentinel — the input echo already proves the intent).
 *
 * Idempotent and side-effect free: only runs read-only git commands
 * (`branch_status`, `branch_gc --dry-run`, `stash list`).
 */
export const collectHygieneFrontHook = async (
	workspaceRoot: string,
	forceBypass: boolean,
): Promise<IHygieneFrontHook> => {
	if (forceBypass) return emptyHygieneFrontHook;
	if (workspaceRoot.length === 0) return emptyHygieneFrontHook;
	try {
		const run = createGitRunner(workspaceRoot);
		const [hygiene, stashes] = await Promise.all([
			runSwarmHygieneEngine({ run, workspaceRoot }),
			runStashSnapshot({ run, workspaceRoot }),
		]);
		const rescueCandidates = hygiene.ok ? hygiene.rescueCandidates : [];
		const gcEligible = hygiene.ok ? hygiene.gcEligible : [];
		const outOfCache = hygiene.ok ? hygiene.outOfCache : [];

		const rescueBlocked = rescueCandidates.length > 0;
		const stashBlocked = stashes.length > 0;
		const executionMode: IHygieneFrontHook['executionMode'] =
			rescueBlocked || stashBlocked
				? 'blocked'
				: gcEligible.length > 0
					? 'confirm-required'
					: 'normal';

		const hygieneBlockers = [
			...rescueBlockersFor(rescueCandidates),
			...stashBlockersFor(stashes),
		];
		const hygieneActions = gcActionsFor(gcEligible);
		const hygieneWarnings = outOfCacheWarningsFor(outOfCache);

		return {
			executionMode,
			hygieneBlockers,
			hygieneActions,
			hygieneWarnings,
			rescueCandidates,
			gcEligibleCount: gcEligible.length,
			outOfCacheCount: outOfCache.length,
			stashes,
		};
	} catch {
		// Fail-soft: never let the front-hook kill the plan. If git
		// misbehaves, surface it as a warning and let the orchestrator
		// decide whether to retry or bypass.
		return emptyHygieneFrontHook;
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
				forceHygieneBypass?: boolean | undefined;
			}) =>
				runAutoWork({
					...options,
					inputPersist: args.persist,
					inputIncludePaused: args.includePaused,
					inputForceHygieneBypass: args.forceHygieneBypass,
				}),
		);
	},
});
