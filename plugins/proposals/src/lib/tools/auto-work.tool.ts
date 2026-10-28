import { toolJson } from '@delendai/core/public';
import type { IToolTextResult } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
import { workModelSummary } from '@delendai/core/plugin';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import { runContinueProposal } from './continue-proposal.tool';
import type { IAutoWorkPersistMode } from './auto-work-persist';
import { detectAgentLoop } from '../agents/agent-loop-detector';
import { hasPeerApprovedReview } from '../swarm/proposal-review';
import type {
	IAutoWorkToolOptions,
	IIdleStreak,
} from '../contracts/interfaces/auto-work-tool.interface';
import {
	DEFAULT_LOOP_DETECTOR_DISABLE_FOR,
	IDLE_STOP_THRESHOLD,
	AUTO_WORK_INPUT_SCHEMA,
	AUTO_WORK_OUTPUT_SCHEMA,
} from '../contracts/constants/auto-work-tool.constant';
import {
	persistTargetHitsProtectedBranch,
	createIdleStreak,
	findReviewPendingPeerApproval,
	resolveClaimReady,
	buildPeerReviewPlan,
	buildAutoWorkOrchestrationPolicy,
} from './auto-work/planning.tool';
import {
	readCurrentBranchForWorktreeGate,
	collectBranchStatusWarnings,
	collectBranchHygieneHints,
	collectHygieneFrontHook,
} from './auto-work/hygiene-rendering.tool';

const json = toolJson;
export {
	DEFAULT_LOOP_DETECTOR_DISABLE_FOR,
	DEFAULT_DELEGATE_AFTER_TOOL_CALLS,
	AUTO_WORK_INPUT_SCHEMA,
	AUTO_WORK_OUTPUT_SCHEMA,
} from '../contracts/constants/auto-work-tool.constant';
export { buildAutoWorkOrchestrationPolicy } from './auto-work/planning.tool';
export {
	branchStatusWarningsFor,
	branchHygieneHintsFor,
	rescueBlockersFor,
	smokeResidualWarningsFor,
	gcActionsFor,
	outOfCacheWarningsFor,
	collectHygieneFrontHook,
} from './auto-work/hygiene-rendering.tool';
export type {
	IAutoWorkPersistConfig,
	IAutoWorkOrchestrationConfig,
	IAutoWorkToolOptions,
	IIdleStreak,
	IAutoWorkOrchestrationPolicy,
	IAutoWorkClaimReady,
	IHygieneFrontHook,
} from '../contracts/interfaces/auto-work-tool.interface';

/**
 * One-call "what should I do now?" for autonomous work. Resolves the
 * next proposal (serial cascade) and returns a compact, ordered plan
 * the agent can execute without extra round-trips: claim → do one
 * slice → validate → sync → [persist] → release. Designed to be
 * low-token: it returns a tight action list, not prose. When nothing
 * is actionable it returns an explicit idle state.
 *
 * When `options.persist.mode !== 'none'` the plan includes an extra
 * step that tells the orchestrator to complete the slice via
 * `close_slice`, which performs the configured persistence after
 * validation and before release. The persist itself is NOT executed
 * inside this tool — `auto_work` is read-only
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
	// x00509 / B2: the idle-streak counter is now a per-registration
	// instance. `buildAutoWorkRegistration` always provides one, so
	// the `?? createIdleStreak()` fallback is only used when this
	// function is called directly from a test or a future caller.
	const idleStreak = options.idleStreak ?? createIdleStreak();

	// f00078 S1: needs-worktree gate. When the host gate is on AND the
	// active branch is not one an agent works on (the project's work-ref
	// namespace, or the `agent_worktree` one), refuse the plan. The
	// `agentWorktreeEnabled` flag is propagated via IAutoWorkToolOptions
	// (the host passes it from the plugin context). The check is a
	// no-op when the gate is off so solo hosts are unaffected.
	if (options.agentWorktreeEnabled === true) {
		const branchCheck = await readCurrentBranchForWorktreeGate(
			options.workspaceRoot ?? '',
		);
		if (branchCheck.ok && !branchCheck.isAgentBranch) {
			idleStreak.reset();
			return json({
				state: 'work',
				ok: false,
				reason: 'needs-worktree',
				executionMode: 'blocked',
				hygieneBlockers: [
					`active branch is "${branchCheck.branch}"; per-agent isolation is required (agentWorktree gate is on)`,
				],
				hygieneActions: [
					`${options.namespacePrefix}_agent_worktree { action: "create", agent: "<your-agent-name>" }`,
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
			idleStreak.reset();
			return json({
				state: 'work',
				ok: false,
				reason: 'loop-blocked',
				executionMode: 'blocked',
				hygieneBlockers: [
					`loop detector fired on ${verdict.offendingTool} (effectiveCount=${verdict.effectiveCount})`,
				],
				hygieneActions: [
					`Read the handoff packet at the path returned by the previous auto_work response; resolve the stuck call (different args, different tool, or backoff); then ${options.namespacePrefix}_continue_proposal { mode: "auto" }.`,
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
		options.namespacePrefix,
	);
	if (hygiene.executionMode === 'blocked') {
		idleStreak.reset();
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
			smokeResiduals: [...hygiene.smokeResiduals],
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
		status?: string;
		reason?: string;
		nextAction?: string;
		action?: 'close';
		pickedFromPaused?: boolean;
	};
	const requirePeer = options.requirePeerReview !== false;
	const nextIsExecutable =
		next.kind === 'next-proposal' &&
		typeof next.file === 'string' &&
		!next.file.startsWith('review/') &&
		!next.file.includes('/review/');
	if (requirePeer && !nextIsExecutable) {
		const pendingReview = await findReviewPendingPeerApproval(options);
		if (pendingReview !== null) {
			idleStreak.reset();
			const peerReviewPersistMode =
				options.inputPersist ?? options.persist?.mode;
			return json(
				buildPeerReviewPlan({
					namespacePrefix: options.namespacePrefix,
					proposalId: pendingReview.proposalId,
					file: pendingReview.file,
					...(peerReviewPersistMode !== undefined
						? { persistMode: peerReviewPersistMode }
						: {}),
				}),
			);
		}
	}

	if (next.kind !== 'next-proposal') {
		// `all-claimed`: every actionable proposal is in_progress under
		// an active lock. Surface the anti-loop guidance verbatim so the
		// agent stops instead of re-calling auto_work on the same proposal.
		const idleCount = idleStreak.increment();
		const stop = idleCount >= IDLE_STOP_THRESHOLD;
		return json({
			state: 'idle',
			idleStreak: idleCount,
			reason: next.reason ?? 'no actionable proposal',
			...(stop
				? {
						stop: true,
						nextAction: `STOP — auto_work has returned idle ${idleCount}× in a row. Do NOT call auto_work again until new work exists; enqueue/create a proposal (or wait for a lock-released notification) first.`,
					}
				: {
						nextAction:
							next.nextAction ??
							'Create a proposal under the proposals dir; only run sync_proposals after creating/renaming proposal files or after the last open slice of a proposal is closed.',
					}),
		});
	}
	if (next.action === 'close') {
		idleStreak.reset();
		return json({
			state: 'work',
			proposalId: next.proposalId,
			file: next.file,
			action: 'close',
			persist: {
				mode: options.inputPersist ?? options.persist?.mode ?? 'none',
			},
			nextAction: next.nextAction,
			steps: [
				'All declared slices are already done; do not claim another slice.',
				next.nextAction ??
					'Complete the proposal closure transition with its required evidence and peer-review gates.',
				`Re-run ${options.namespacePrefix}_auto_work after the proposal reaches done.`,
			],
		});
	}

	// Actionable work → reset the idle streak.
	idleStreak.reset();

	// a00069 S7 short-circuit: proposal sitting in review/ without an
	// independent peer approve must not get an implement/claim plan.
	const inReviewFolder =
		typeof next.file === 'string' &&
		(next.file.startsWith('review/') || next.file.includes('/review/'));
	if (
		requirePeer &&
		inReviewFolder &&
		next.proposalId &&
		next.file &&
		options.proposalsDirAbs
	) {
		let approved = false;
		try {
			const raw = (
				await new SafeWorkspaceReader(options.proposalsDirAbs).readText(
					next.file,
				)
			).content;
			approved = hasPeerApprovedReview(raw);
		} catch {
			approved = false;
		}
		if (!approved) {
			const peerReviewPersistMode =
				options.inputPersist ?? options.persist?.mode;
			return json(
				buildPeerReviewPlan({
					namespacePrefix: options.namespacePrefix,
					proposalId: next.proposalId,
					file: next.file,
					...(peerReviewPersistMode !== undefined
						? { persistMode: peerReviewPersistMode }
						: {}),
				}),
			);
		}
	}

	// Resolve the persist mode in priority order: tool input > config >
	// hard default `'none'`. Keeping this resolver pure and inline keeps
	// the call graph small; the orchestrator can also inspect the
	// returned `persist.mode` to decide whether the eventual
	// `close_slice` call must commit or commit-and-push.
	const resolvedMode: IAutoWorkPersistMode =
		options.inputPersist ?? options.persist?.mode ?? 'none';
	if (
		resolvedMode === 'commit-and-push' &&
		options.persist?.pushTarget !== undefined &&
		persistTargetHitsProtectedBranch(
			options.persist.pushTarget,
			options.persist.protectedBranches,
		)
	) {
		return json({
			state: 'work',
			ok: false,
			reason: 'invalid-persist-config',
			executionMode: 'blocked',
			proposalId: next.proposalId,
			file: next.file,
			hygieneBlockers: [
				`persist.mode "commit-and-push" cannot target a protected branch: "${options.persist.pushTarget}"`,
			],
			nextAction:
				'Change persist.pushTarget to an explicit non-protected branch target, then call auto_work again. No commit-and-push plan was produced.',
		});
	}

	const prefix = options.namespacePrefix;
	const orchestration = buildAutoWorkOrchestrationPolicy({
		namespacePrefix: prefix,
		proposalId: next.proposalId ?? 'unknown',
		delegateAfterToolCalls: options.orchestration?.delegateAfterToolCalls,
	});
	const claimReadyResolution =
		next.proposalId === undefined
			? { missingDoneArtifacts: [], pendingTrackedArtifacts: [] }
			: await resolveClaimReady(next.proposalId, options);
	if (claimReadyResolution.missingDoneArtifacts.length > 0) {
		return json({
			state: 'work',
			ok: false,
			reason: 'done-slice-artifact-drift',
			executionMode: 'blocked',
			proposalId: next.proposalId,
			file: next.file,
			hygieneBlockers: claimReadyResolution.missingDoneArtifacts.map(
				(artifact) =>
					`completed slice artifact is missing: ${artifact}`,
			),
			nextAction:
				'Repair the proposal state or restore the missing completed-slice artifacts before claiming new work. auto_work refuses to plan on top of unverifiable done slices.',
		});
	}
	if (claimReadyResolution.pendingTrackedArtifacts.length > 0) {
		return json({
			state: 'work',
			ok: false,
			reason: 'pending-slice-verification-required',
			executionMode: 'blocked',
			proposalId: next.proposalId,
			file: next.file,
			hygieneBlockers: claimReadyResolution.pendingTrackedArtifacts.map(
				(artifact) =>
					`pending slice already has tracked artifacts: ${artifact}`,
			),
			nextAction:
				'Run the declared validation gate and close the already-implemented slice. auto_work refuses to re-claim tracked pending artifacts because that would repeat completed work.',
		});
	}
	const claimReady = claimReadyResolution.claimReady;
	// x00231 + x00299: persist planning mirrors the effective push policy.
	// `main`/`master` stay protected by config, but an explicit
	// `persist.pushTarget` like `origin develop` is valid when the policy
	// allows it. The plan must not invent an undeclared `wip/*` detour;
	// it surfaces the configured target verbatim and only falls back to a
	// mode-appropriate default when no target is configured.
	const worktreeEnabled = options.agentWorktreeEnabled === true;
	const pushTargetHint =
		options.persist?.pushTarget ??
		(worktreeEnabled ? 'origin agent/<branch>' : 'origin HEAD');
	const persistStep =
		resolvedMode === 'none'
			? []
			: resolvedMode === 'commit'
				? [
						`Run the scoped validation gate for the slice's declared files, then persist via ${prefix}_close_slice { proposalId, sliceId } before release; close_slice stages only the declared slice files, applies persist mode "commit", and exposes the typed persist result in its response. Hosts must not call maybePersistAfterSlice directly. Do not stage unrelated files.`,
					]
				: [
						`Run the scoped validation gate for the slice's declared files, then persist via ${prefix}_close_slice { proposalId, sliceId } before release; close_slice stages only the declared slice files, applies persist mode "commit-and-push", and must verify push target "${pushTargetHint}" before reporting closed=true. Hosts must not call maybePersistAfterSlice directly. Do not stage unrelated files. Treat committed=true/pushed=false as incomplete and never report closed=true. The persist block in the response carries mode, committed, pushed, and hash/reason when present.`,
					];

	// x00051 S3 + x00299: when persist is enabled, the plan must surface
	// where the persist commit/push goes. With the worktree gate on,
	// `agent_worktree create` stays explicit so solo hosts can satisfy
	// the isolation requirement before persisting. With the gate off,
	// the plan stays on the shared branch and, for commit-and-push,
	// points at the configured target rather than inventing a side branch.
	const worktreeStep =
		resolvedMode === 'none'
			? []
			: worktreeEnabled
				? [
						`Ensure per-agent worktree exists before persisting: ${prefix}_agent_worktree { action: "create", agent: "<pending>" } (idempotent — returns the existing worktree if one is present; required when persist mode is "${resolvedMode}"). When the slice is delegated via ${prefix}_delegate this is handled for you; keep the step as a safety net for solo runs.`,
					]
				: [
						resolvedMode === 'commit-and-push'
							? `This repo forbids per-agent worktrees (\`agentWorktree: false\`): persist on the shared checkout and push to the configured target (here: \`${pushTargetHint}\`) when the effective protected-branch policy allows it. Do NOT create an agent worktree or invent an intermediate branch.`
							: 'This repo forbids per-agent worktrees (`agentWorktree: false`): commit directly on the shared checkout target selected by the operator. Do NOT create an agent worktree or branch.',
					];

	// A step about a plugin the server does not have is paid for in every
	// plan and acted on by nobody.
	const loaded = (name: string): boolean =>
		options.isPluginLoaded?.(name) ?? true;
	const notifies = loaded('notification');
	const peerTool = (plugin: string, toolId: string): string =>
		options.toolNameOf?.(plugin, toolId) ?? `${plugin}_${toolId}`;
	const ifUnknown = (name: string): string =>
		options.isPluginLoaded === undefined
			? `if the ${name} plugin is loaded, `
			: '';
	const steps = [
		...(options.developmentPolicy === undefined
			? []
			: [`Work model — ${workModelSummary(options.developmentPolicy)}`]),
		...worktreeStep,
		`Open ${next.file} and pick the next atomic slice.`,
		`If you do not already have an agent slot, call ${prefix}_agent_names before claiming files.`,
		`If non-trivial: ${orchestration.next}; then ${prefix}_delegate one claimable slice to a subagent.`,
		notifies
			? `Claim its files: ${prefix}_agent_lock { action: "claim", task_id, files }. On lock-conflict or all-claimed work, use ${peerTool('notification', 'await_lock')} once (or wait for a lock-released notification) — do NOT poll status in a loop.`
			: `Claim its files: ${prefix}_agent_lock { action: "claim", task_id, files }. On lock-conflict or all-claimed work, take another slice — do NOT poll status in a loop.`,
		`Cycle boundary: re-check your agent slot with ${prefix}_agent_names before starting the claimed slice so the host wiring cannot skip identity resolution.`,
		...(loaded('logs')
			? [
					`Cycle boundary: ${ifUnknown('logs')}run ${peerTool('logs', 'query')} before editing and again after validation/close.`,
				]
			: []),
		...(notifies
			? [
					`Cycle boundary: ${ifUnknown('notification')}keep ${peerTool('notification', 'notify_status')} { kind: 'lock-released' } active through the work loop and before each next claim.`,
				]
			: []),
		'Implement exactly that slice — nothing outside the claimed files.',
		...(options.validationCommand
			? [
					`Validate the slice with the scoped gate; reserve \`${options.validationCommand}\` as the global integration gate after all slices are complete.`,
				]
			: [
					'Validate per the project gate (see get_validation_matrix if present).',
				]),
		`Submit the finished slice for peer review (do NOT close it yourself): ${prefix}_proposal_review { action: "submit", proposalId, sliceId, agent: "<implementer>" }. A DIFFERENT agent must then ${prefix}_proposal_review { action: "approve" | "request_changes", proposalId, sliceId, agent: "<reviewer≠implementer>" }. close_slice is reserved for hosts that set requirePeerReview:false.`,
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
			? ((await collectBranchHygieneHints(
					options.workspaceRoot ?? '',
					prefix,
				)) ?? [])
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
		...(claimReady !== undefined ? { claimReady } : {}),
		...(next.pickedFromPaused === true
			? { pickedFromPaused: true as const }
			: {}),
		steps,
		// f00073: branch + worktree warnings, fire-and-forget. Never
		// blocks the plan. Lets the orchestrator surface "agent X has
		// 8 dirty files" / "Y is 5 commits behind" without a second
		// tool call. Failures are swallowed — the status snapshot is
		// advisory, not gating. Omitted when empty (like the hygiene
		// arrays below) to keep the cold-start plan cheap.
		...(branchStatusWarnings.length > 0 ? { branchStatusWarnings } : {}),
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

/** Registration for `<prefix>_auto_work`. */
export const buildAutoWorkRegistration = (
	options: IAutoWorkToolOptions,
): IToolRegistration & { readonly __idleStreak?: IIdleStreak } => {
	// / B2: each registration owns its own counter. Tests that
	// need to reset it between assertions can grab the closure-scoped
	// holder via `registration.__idleStreak.reset()` instead of relying
	// on the (now removed) module-scope variable.
	const idleStreak = createIdleStreak();
	return {
		id: 'auto_work',
		summary:
			'One call → next proposal + a compact ordered action plan (claim → slice → validate → sync → [persist] → release).',
		descriptionKey: 'proposals_auto_work',
		tags: ['work'],
		__idleStreak: idleStreak,
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_auto_work`,
				{
					outputSchema: AUTO_WORK_OUTPUT_SCHEMA,
					description:
						'One call → what to do now. Resolves the next proposal (serial cascade) and returns a compact ordered plan (claim → slice → validate → sync → [persist] → release), or an explicit idle state. Low-token: a tight action list, not prose.',
					inputSchema: AUTO_WORK_INPUT_SCHEMA,
				},
				async (args: {
					persist?: IAutoWorkPersistMode | undefined;
					includePaused?: boolean | undefined;
					forceHygieneBypass?: boolean | undefined;
				}) =>
					runAutoWork({
						...options,
						idleStreak,
						inputPersist: args.persist,
						inputIncludePaused: args.includePaused,
						inputForceHygieneBypass: args.forceHygieneBypass,
					}),
			);
		},
	};
};
