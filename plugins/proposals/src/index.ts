import { registerAdoptionExtensions } from '@delendai/core/lib/adopt/adoption-extension-registry';
import type {
	IPluginConfigurationIssue,
	IPluginConfigurationValidationInput,
} from '@delendai/core/public';
import {
	createWorkspaceFileReader,
	definePlugin,
} from '@delendai/core/public';
import { createLogStore, logIncidents } from '@delendai/logs/public';
import {
	announceSlicePersistence,
	resolveSlicePersistence,
} from './lib/slice-persistence-owner';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';
import { AgentLoopDetectorService } from './lib/agents/loop-detector-service';

import { mergeCheckpointAdvisories } from '@delendai/core/public';
import { resolveScopes } from '@delendai/quality/public';
import { buildProposalsAdoptionExtension } from './lib/adoption/proposals-adoption-extension';
import { registerProposalsStableTools } from './lib/api/proposals-stable-tools';
import { buildSwarmPaths } from './lib/contracts/constants/default-path-layout.constant';
import {
	DEFAULT_PROPOSAL_FOLDER_POLICY,
	type IProposalFolderPolicy,
} from './lib/contracts/proposal-folder-policy';
import { cleanupStaleAgentLockState } from './lib/locks/agent-lock-engine';
import { createCallbackLockListener } from './lib/locks/lock-change-listener';
import { buildProposalTemplatesResourceRegistration } from './lib/resources/proposal-templates.resource';
import type { IObservedToolCall } from './lib/services/checkpoint-advisory-micro-validation.service';
import { assessMicroValidationLoop } from './lib/services/checkpoint-advisory-micro-validation.service';
import { registerProposalsWorkflowContribution } from './lib/skills/proposals-workflow-contribution';
import { buildCloseSliceValidationProvider } from './lib/swarm/validation-provider';
import { applyProposalsDisclosure } from './lib/surface/disclosure';
import { buildAdoptRegistration } from './lib/tools/adopt.tool';
import { buildAgentLockRegistration } from './lib/tools/agent-lock.tool';
import type { IAgentNamesToolOptions } from './lib/tools/agent-names.tool';
import { buildAgentNamesRegistration } from './lib/tools/agent-names.tool';
import { buildAgentWorktreeRegistration } from './lib/tools/agent-worktree.tool';
import { buildAgentsLockDiagnoseRegistration } from './lib/tools/agents-lock-diagnose.tool';
import type { IAuthoringToolOptions } from './lib/tools/authoring.tool';
import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildProposalBoardRegistration,
	buildReviewRegistration,
	runCloseSliceQualityGate,
} from './lib/tools/authoring.tool';
import { buildAutoFixQueueRegistration } from './lib/tools/auto-fix-queue.tool';
import { buildAutoWorkRegistration } from './lib/tools/auto-work.tool';
import type { IAutoWorkPersistMode } from './lib/tools/auto-work-persist';
import { buildBranchGcRegistration } from './lib/tools/branch-gc.tool';
import { buildBranchStatusRegistration } from './lib/tools/branch-status.tool';
import { buildClosePlanRegistration } from './lib/tools/close-plan.tool';
import { buildCompactStatusRegistration } from './lib/tools/compact-status.tool';
import { buildContinueProposalRegistration } from './lib/tools/continue-proposal.tool';
import { buildGetProposalWorkflowRegistration } from './lib/tools/get-proposal-workflow.tool';
import { buildIncidentProposalRegistration } from './lib/tools/incident-proposal.tool';
import { buildInheritHostInstructionsRegistration } from './lib/tools/inherit-host-instructions.tool';
import {
	buildDelegateRegistration,
	buildPlanRegistration,
} from './lib/tools/orchestration.tool';
import { buildProposalGetRegistration } from './lib/tools/proposal-get.tool';
import { buildProposalTransitionRegistration } from './lib/tools/proposal-transition.tool';
import { buildRecoveryToolRegistrations } from './lib/tools/recovery-tools';
import { buildRoundContextRegistration } from './lib/tools/round-context.tool';
import type { IStateToolOptions } from './lib/tools/state-tools.tool';
import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
	runAutoStateRepairOnBoot,
} from './lib/tools/state-tools.tool';
import { buildSwarmHygieneRegistration } from './lib/tools/swarm-hygiene.tool';
import { buildSyncProposalsRegistration } from './lib/tools/sync-proposals.tool';
import { buildTaskQueueRegistration } from './lib/tools/task-queue.tool';

/**
 * The proposals workflow plugin. It turns mcp-vertex into a multi-agent
 * proposal runner: a file-based proposal store, file-level write locks
 * and a persistent task queue (the "swarm" coordination layer).
 *
 * Load it with `mcp-vertex --plugins=proposals`. Paths come from the
 * core's resolved roots: cache/state under `<cacheDir>/proposals`,
 * human-edited proposals under `<docsDir>/proposals`. Override the docs
 * root with `--docsDir`, the cache root with `--cacheDir`.
 *
 * Every tool is namespaced by the plugin (`proposals_*` by default)
 * and returns structured JSON so any agent or model consumes it the
 * same way.
 */
/**
 * r00003 S9 (F9, O + L + I): the proposals plugin's options schema, named
 * so `register()` can `safeParse(ctx.options)` against the SAME contract
 * the loader validates — the configured and validated plugin are one
 * (LSP), and `proposalFolders` / `proposalNarrativePatterns` are typed
 * fields, not `ctx.options.X as Y` casts.
 */
const PROPOSALS_OPTIONS_SCHEMA = z.object({
	/** Workspace-relative proposal content root. Defaults to <docsDir>/proposals. */
	proposalsDir: z.string().min(1).optional(),
	/** Custom symbolic agent-name pool. */
	namePool: z.array(z.string()).optional(),
	/** Quality-gate command surfaced by auto_work. */
	validationCommand: z.string().optional(),
	persist: z
		.object({
			mode: z.enum(['none', 'commit', 'commit-and-push']).default('none'),
			messageTemplate: z.string().optional(),
			pushTarget: z.string().optional(),
			allowForeignChanges: z.boolean().optional(),
			protectedBranches: z.array(z.string()).default(['main', 'master']),
		})
		.optional(),
	orchestration: z
		.object({
			delegateAfterToolCalls: z.number().int().positive().optional(),
		})
		.optional(),
	/**
	 * r00003 S9 (F9): host-specific proposal subfolders (relative to the
	 * proposals dir), e.g. `['paused/demos']`. mcp-vertex bakes none.
	 */
	proposalFolders: z.array(z.string()).optional(),
	/** Per-status folder layout. Unspecified statuses stay flat. */
	folderPolicy: z
		.record(
			z.enum([
				'ready',
				'in-progress',
				'review',
				'done',
				'paused',
				'blocked',
				'retired',
			]),
			z.union([
				z.enum(['flat', 'by-kind']),
				z.array(
					z.enum([
						'feat',
						'breaking',
						'fix',
						'refactor',
						'perf',
						'audit',
						'chore',
						'docs',
						'test',
						'infra',
						'spike',
						'legacy',
						'resume',
						'plan',
					]),
				),
			]),
		)
		.optional(),
	/**
	 * r00003 S7 + S9: host narrative-heading aliases for the proposal
	 * scaffold linter, as `[heading, canonicalSection]` tuples.
	 */
	proposalNarrativePatterns: z
		.array(z.tuple([z.string(), z.string()]))
		.optional(),
	/**
	 * a00069 S7: require independent peer approve before review→done.
	 * Default true when omitted (wired at register time).
	 */
	requirePeerReview: z.boolean().optional(),
	/**
	 * Require a passing `bun run validate` (journalled to
	 * `.cache/mcp-vertex/results/logs/validate.jsonl`) before
	 * `close_slice` marks a slice done or `proposal_transition` moves a
	 * proposal to review/done. Default true when omitted. Adopters
	 * without a validate chain worth blocking on set this to false
	 * instead of teaching every agent to pass `force: true`.
	 */
	requireValidateEvidence: z.boolean().optional(),
	/**
	 * a00069 S10: auto-purge orphan registry/queue/lock drift on plugin boot.
	 * Default true. Set false to keep diagnose-only (manual state_repair).
	 */
	autoRepairOrphans: z.boolean().optional(),
	/**
	 * f00156: checkpoint-advisory thresholds. Augments existing plugin
	 * options rather than a parallel source of truth. Session age lives
	 * on usage-tracking.sessionHygiene.
	 */
	checkpointAdvisories: z
		.object({
			enabled: z.boolean().optional(),
			microValidation: z
				.object({
					equivalentRunsBeforeWarning: z
						.number()
						.int()
						.positive()
						.optional(),
				})
				.strict()
				.optional(),
			contextDrift: z
				.object({
					interactiveSeverity: z
						.enum(['recommend', 'strong'])
						.optional(),
				})
				.strict()
				.optional(),
			pushGuard: z
				.object({
					enabled: z.boolean().optional(),
				})
				.strict()
				.optional(),
		})
		.strict()
		.optional(),
});

const hasSliceTrigger = (
	options: Readonly<Record<string, unknown>>,
): boolean => {
	const cadence = options.cadence;
	if (typeof cadence !== 'object' || cadence === null) return false;
	const triggers = (cadence as { readonly triggers?: unknown }).triggers;
	return (
		Array.isArray(triggers) &&
		triggers.some(
			(trigger) =>
				typeof trigger === 'object' &&
				trigger !== null &&
				(trigger as { readonly kind?: unknown }).kind === 'slice',
		)
	);
};

const commitPolicyOwnsSlicePersistence = (
	options: Readonly<Record<string, unknown>> | undefined,
): boolean => {
	if (options === undefined) return false;
	const commit = options.commit;
	const commitEnabled =
		typeof commit === 'object' &&
		commit !== null &&
		(commit as { readonly enabled?: unknown }).enabled === true;
	return commitEnabled && hasSliceTrigger(options);
};

export const resolveProposalPersistMode = (
	configuredMode: IAutoWorkPersistMode | undefined,
	commitPolicyOptions: Readonly<Record<string, unknown>> | undefined,
): IAutoWorkPersistMode =>
	commitPolicyOwnsSlicePersistence(commitPolicyOptions)
		? 'none'
		: (configuredMode ?? 'none');

/**
 * `commit-policy` owns slice persistence when it is enabled with a slice
 * trigger. Proposals keeps its configured mode as the fallback for hosts that
 * do not load that plugin or do not enable its slice cadence.
 */
export const validateProposalConfiguration = (
	input: IPluginConfigurationValidationInput,
): readonly IPluginConfigurationIssue[] => {
	void input;
	return [];
};

export default definePlugin({
	name: 'proposals',
	version: '0.1.1',
	describe:
		'Proposal store + file-level agent locks + persistent task queue (multi-agent swarm coordination).',
	optionsSchema: PROPOSALS_OPTIONS_SCHEMA,
	validateConfiguration: validateProposalConfiguration,
	configExample: {
		summary:
			'Default swarm setup: bun as the validation command, and an explicit agent-name pool so multi-agent runs get reproducible names.',
		options: {
			validationCommand: 'bun run validate',
			namePool: ['falcon', 'owl', 'crow', 'sparrow', 'finch'],
			orchestration: { delegateAfterToolCalls: 3 },
		},
	},
	async register(ctx) {
		registerAdoptionExtensions('proposals', [
			buildProposalsAdoptionExtension(),
		]);
		registerProposalsStableTools();
		registerProposalsWorkflowContribution();

		// r00003 S9 (F9): validate ctx.options through the SAME schema the
		// loader declares, so a host misconfig is a structured error here
		// rather than a silent cast downstream. The narrow per-field casts
		// below remain for the engines whose option contracts are not yet
		// migrated; `proposalFolders` is read from the parsed, typed value.
		const parsedOptions = PROPOSALS_OPTIONS_SCHEMA.safeParse(
			ctx.options ?? {},
		);
		if (!parsedOptions.success) {
			throw new Error(
				`proposals plugin rejected its options: ${parsedOptions.error.message}`,
			);
		}
		const loopDetector = new AgentLoopDetectorService(ctx);
		// All path-bearing tools share ONE layout so locks, queue,
		// round-context and the proposal store always agree. The layout
		// is derived from the core's resolved roots (`--cacheDir` /
		// `--docsDir`), so the whole store relocates as one when the host
		// reconfigures them: cache/state under `<cacheDir>`, human-edited
		// proposals under `<docsDir>`. Engines that bake DEFAULT_PATH_LAYOUT
		// receive this layout explicitly (sync/round-context), so a
		// relocated store stays coherent end to end.
		const layout = buildSwarmPaths(
			ctx.cacheDir,
			ctx.docsDir,
			parsedOptions.data.proposalsDir,
		);
		const abs = (relativePath: string): string =>
			ctx.workspace.resolve(relativePath);

		// Host-specific proposal subfolders (relative to proposalsDir),
		// e.g. `['paused/demos']`. mcp-vertex bakes none — the host injects
		// its folder policy via ctx.options (now schema-validated, S9).
		const extraProposalFolders = parsedOptions.data.proposalFolders ?? [];
		const folderPolicy: IProposalFolderPolicy = {
			...DEFAULT_PROPOSAL_FOLDER_POLICY,
			...parsedOptions.data.folderPolicy,
		};
		const commitPolicyOptions = ctx.pluginOptions?.get('commit-policy');
		const commitPolicyPush = commitPolicyOptions?.push;
		const protectedBranches =
			commitPolicyPush !== null &&
			typeof commitPolicyPush === 'object' &&
			Array.isArray(
				(commitPolicyPush as { protectedBranches?: unknown })
					.protectedBranches,
			)
				? (commitPolicyPush as { protectedBranches: string[] })
						.protectedBranches
				: ['main', 'master'];
		const configuredPersist = parsedOptions.data.persist;
		// Same resolution as before — `resolveProposalPersistMode` is
		// still the authority on the MODE — plus who ends up owning it, so
		// a host where NOBODY commits finished slices is told at boot
		// instead of discovering it as proposals that can never close.
		const slicePersistence = resolveSlicePersistence({
			configuredMode: configuredPersist?.mode,
			commitPolicyOwnsSlices: commitPolicyOwnsSlicePersistence(
				commitPolicyOptions as
					| Readonly<Record<string, unknown>>
					| undefined,
			),
		});
		announceSlicePersistence(slicePersistence);
		const effectivePersistMode = slicePersistence.mode;
		const effectivePersist =
			configuredPersist !== undefined
				? {
						...configuredPersist,
						mode: effectivePersistMode,
						protectedBranches,
					}
				: undefined;
		const microValidationCalls: IObservedToolCall[] = [];
		const incidentLogStore = createLogStore(
			ctx.workspace.resolve(join(ctx.cacheDir, 'results', 'logs-errors')),
		);
		const hasProposalsStore = await access(abs(layout.proposalsDir)).then(
			() => true,
			() => false,
		);

		const agentNamesOptions: IAgentNamesToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			registryPathAbs: abs(layout.agentRegistryFile),
			lockPathAbs: abs(layout.lockFile),
			queuePathAbs: abs(layout.taskQueueFile),
			closedTasksPathAbs: abs(layout.closedTasksFile),
			workspaceRoot: ctx.workspace.root,
			...(Array.isArray(ctx.options.namePool)
				? { pool: ctx.options.namePool as string[] }
				: {}),
			// f00082 S3: the boot-resolved host identity becomes the default
			// host/model on `assign` (and, via `options.agentNames`, on
			// `delegate`), so an orchestrator that declared itself once at boot
			// no longer repeats it on every call. Absent → `null` fallback.
			...(ctx.hostIdentity !== undefined
				? { defaultIdentity: ctx.hostIdentity }
				: {}),
			// Solid-ISP adapter: when a name is released back to the pool, tell
			// the loop detector to forget that name's window + stuck verdict so
			// the next lease of the reusable name starts clean.
			onAgentReleased: (name: string) => loopDetector.resetAgent(name),
		};

		const stateOptions: IStateToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			lockPathAbs: abs(layout.lockFile),
			queuePathAbs: abs(layout.taskQueueFile),
			closedTasksPathAbs: abs(layout.closedTasksFile),
			registryPathAbs: abs(layout.agentRegistryFile),
			workspaceRoot: ctx.workspace.root,
			// x00156 S2: route the auto-repair boot event through the
			// structured incident stream instead of console.info.
			logs: ctx.logs,
		};

		// a00069 S10: purge stale orphans at boot unless the host opts out.
		// Fire-and-forget so register() stays sync-fast; errors never block tools.
		void cleanupStaleAgentLockState({
			lockPath: abs(layout.lockFile),
		}).catch(() => undefined);
		if (parsedOptions.data.autoRepairOrphans !== false) {
			runAutoStateRepairOnBoot(stateOptions);
		}

		const qualityOptions = ctx.pluginOptions?.has('quality')
			? (ctx.pluginOptions.get('quality') as {
					scopes?: Record<string, readonly string[]>;
				})
			: undefined;
		const qualityPeerConfigured = qualityOptions?.scopes !== undefined;
		const authoringOptions: IAuthoringToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			agentWorktreeEnabled: ctx.agentWorktreeEnabled === true,
			proposalsDirAbs: abs(layout.proposalsDir),
			indexPathAbs: abs(layout.proposalIndexFile),
			lockPathAbs: abs(layout.lockFile),
			agentNames: agentNamesOptions,
			peerReviewLogPathAbs: abs(layout.peerReviewLogFile),
			counterPathAbs: abs(layout.proposalIdCountersFile),
			layout: {
				proposalsDir: layout.proposalsDir,
				proposalIndexFile: layout.proposalIndexFile,
			},
			extraFolders: extraProposalFolders,
			folderPolicy,
			// a00069 S5: host validation command for close_slice gate.
			...(typeof ctx.options.validationCommand === 'string'
				? {
						validationCommand: ctx.options
							.validationCommand as string,
					}
				: { validationCommand: 'bun run validate' }),
			...(typeof ctx.options.requirePeerReview === 'boolean'
				? {
						requirePeerReview: ctx.options
							.requirePeerReview as boolean,
					}
				: { requirePeerReview: true }),
			...(typeof ctx.options.requireValidateEvidence === 'boolean'
				? {
						requireValidateEvidence: ctx.options
							.requireValidateEvidence as boolean,
					}
				: { requireValidateEvidence: true }),
			...(qualityPeerConfigured
				? {
						resolveValidationDecision:
							buildCloseSliceValidationProvider({
								workspaceRoot: ctx.workspace.root,
								registryPathAbs: abs(layout.agentRegistryFile),
								lockPathAbs: abs(layout.lockFile),
								worktreesDirAbs: abs(layout.worktreesDir),
								scopes: await resolveScopes(
									createWorkspaceFileReader(ctx.workspace),
									ctx.pluginOptions?.has('quality') === true
										? {
												scopes:
													(
														ctx.pluginOptions.get(
															'quality',
														) as {
															scopes?: Record<
																string,
																readonly string[]
															>;
														}
													).scopes ?? {},
											}
										: {},
								),
								...(ctx.hostIdentity?.host !== undefined
									? { host: ctx.hostIdentity.host }
									: {}),
								...(ctx.hostIdentity?.model !== undefined
									? { model: ctx.hostIdentity.model }
									: {}),
							}),
						runQuality: (input) =>
							runCloseSliceQualityGate(
								ctx.workspace.root,
								undefined,
								{
									...(input?.scopes !== undefined
										? { scopes: input.scopes }
										: {}),
								},
							),
					}
				: {}),
			...(effectivePersist !== undefined
				? {
						persist: {
							mode: effectivePersist.mode,
							protectedBranches,
							...(effectivePersist.messageTemplate !== undefined
								? {
										messageTemplate:
											effectivePersist.messageTemplate,
									}
								: {}),
							...(effectivePersist.pushTarget !== undefined
								? {
										pushTarget: effectivePersist.pushTarget,
									}
								: {}),
						},
					}
				: {}),
			commitAuthor: ctx.commitAuthor,
			persistGit: ctx.effects?.git,
		};

		return {
			// Progressive disclosure. Every one of the 34 tool
			// builders below is untouched — `applyProposalsDisclosure`
			// tags each returned registration with its static
			// essential/contextual/administrative level from
			// `./lib/surface/disclosure.ts` (the one file that owns the
			// policy) and throws if a registration id has no assigned
			// level, so a new tool can never silently ship unlabelled.
			tools: applyProposalsDisclosure([
				buildAgentLockRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockPathAbs: abs(layout.lockFile),
					lockFileLabel: layout.lockFile,
					// f00078 S4: hard gate. When the host has the
					// `agentWorktree` gate on, the engine refuses `claim`
					// unless the active branch is `agent/<name>`. Solo
					// hosts (the default) pass `false` and are unaffected.
					agentWorktreeEnabled: ctx.agentWorktreeEnabled === true,
					// Solid-ISP: keep the loop detector's lock cache coherent
					// with every successful claim/release/gc. The tool knows
					// nothing about the loop detector; the adapter bridges
					// the typed `ILockChangeListener` event to the cache
					// invalidation. Future consumers (drift counter, audit
					// hooks, etc.) compose into the same multiplexer.
					lockChangeListener: createCallbackLockListener(() =>
						loopDetector.invalidateLockCache(),
					),
					// f00082 S3: default the echoed identity block from the
					// boot-resolved host identity when a caller omits host/model.
					...(ctx.hostIdentity !== undefined
						? { defaultIdentity: ctx.hostIdentity }
						: {}),
				}),
				buildAgentsLockDiagnoseRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockPathAbs: abs(layout.lockFile),
					lockFileLabel: layout.lockFile,
				}),
				buildAgentWorktreeRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					worktreesDirRel: layout.worktreesDir,
					enabled: ctx.agentWorktreeEnabled === true,
				}),
				// f00073: read-only branch + worktree snapshot. Lets every
				// agent answer "what is everyone else doing right now?"
				// without grep.
				buildBranchStatusRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					defaultBaseBranch: 'develop',
					defaultAgentPrefix: 'agent/',
					// `layout.worktreesDir` is ALREADY the cache-rooted
					// workspace-relative path (default
					// `.cache/mcp-vertex/.worktrees`). The previous
					// `.cache/mcp-vertex/${layout.worktreesDir}` double-prefixed
					// it to `.cache/mcp-vertex/.cache/mcp-vertex/.worktrees`,
					// which can never match a real worktree path — so
					// branch-status / swarm-hygiene flagged EVERY
					// correctly-placed worktree as `outOfCache: true`. The
					// agent_worktree engine resolves the same
					// `layout.worktreesDir`, so both must agree byte-for-byte.
					canonicalWorktreesDirRel:
						layout.worktreesDir || '.cache/mcp-vertex/.worktrees',
				}),
				// f00073: idempotent cleanup of orphan worktrees. dryRun by
				// default; unmerged branches are sacred.
				buildBranchGcRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					defaultBaseBranch: 'develop',
					defaultStaleMinutes: 60,
				}),
				// f00075: read-only swarm hygiene snapshot — rescue
				// candidates + GC-eligible + out-of-cache. Never mutates.
				buildSwarmHygieneRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					defaultBaseBranch: 'develop',
					defaultStaleMinutes: 60,
				}),
				buildTaskQueueRegistration({
					namespacePrefix: ctx.namespacePrefix,
					paths: {
						queuePath: abs(layout.taskQueueFile),
						closedTasksPath: abs(layout.closedTasksFile),
						lockPath: abs(layout.lockFile),
						workspaceRoot: ctx.workspace.root,
					},
				}),
				buildSyncProposalsRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					layout: {
						proposalsDir: layout.proposalsDir,
						proposalIndexFile: layout.proposalIndexFile,
					},
					extraFolders: extraProposalFolders,
					folderPolicy,
				}),
				buildGetProposalWorkflowRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDir: layout.proposalsDir,
					indexFile: layout.proposalIndexFile,
				}),
				// r00031: `proposal_get` — compact | normal | full.
				buildProposalGetRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDirAbs: abs(layout.proposalsDir),
					indexPathAbs: abs(layout.proposalIndexFile),
				}),
				buildRoundContextRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					digestPathAbs: abs(layout.roundContextDigestFile),
					coreDocs: ['README.md', layout.proposalIndexFile],
					layout,
					extraFolders: extraProposalFolders,
				}),
				buildAgentNamesRegistration(agentNamesOptions),
				buildContinueProposalRegistration({
					namespacePrefix: ctx.namespacePrefix,
					indexPathAbs: abs(layout.proposalIndexFile),
					proposalsDirAbs: abs(layout.proposalsDir),
					lockPathAbs: abs(layout.lockFile),
				}),
				buildAutoWorkRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					indexPathAbs: abs(layout.proposalIndexFile),
					proposalsDirAbs: abs(layout.proposalsDir),
					lockPathAbs: abs(layout.lockFile),
					loopDetector,
					// f00078 S1 + S3: pass the gate flag and the
					// loop-detector window so the front-hook can run the
					// `needs-worktree` and `loop-blocked` gates before
					// returning a plan. Hosts with the gate off (the
					// default) pass `false` and the front-hook is a no-op.
					agentWorktreeEnabled: ctx.agentWorktreeEnabled === true,
					// f00082: thread the host-resolved commit-author
					// policy through to the `auto_work` plan so an
					// orchestrator can pass it to `maybePersistAfterSlice`
					// when it actually runs the persist step. Absent →
					// the engine falls back to git config.
					commitAuthor: ctx.commitAuthor,
					// The loop-detector service stores per-agent windows
					// privately. We snapshot the current agent's window
					// when one is registered; otherwise we leave the field
					// undefined and the front-hook skips the S3 check.
					loopDetectorCooldownMs: 30_000,
					loopDetectorProgressGate: false,
					...(typeof ctx.options.validationCommand === 'string'
						? {
								validationCommand: ctx.options
									.validationCommand as string,
							}
						: {}),
					// a00069 S7: short-circuit review/ without peer approve.
					...(typeof ctx.options.requireValidateEvidence === 'boolean'
						? {
								requireValidateEvidence: ctx.options
									.requireValidateEvidence as boolean,
							}
						: { requireValidateEvidence: true }),
					...(typeof ctx.options.requirePeerReview === 'boolean'
						? {
								requirePeerReview: ctx.options
									.requirePeerReview as boolean,
							}
						: { requirePeerReview: true }),
					...(effectivePersist !== undefined
						? {
								persist: effectivePersist as {
									mode: 'none' | 'commit' | 'commit-and-push';
									messageTemplate?: string;
									pushTarget?: string;
									protectedBranches?: readonly string[];
								},
							}
						: {}),
					...(ctx.options.orchestration !== undefined
						? {
								orchestration: ctx.options.orchestration as {
									delegateAfterToolCalls?: number;
								},
							}
						: {}),
				}),
				buildPlanRegistration(ctx.namespacePrefix),
				buildDelegateRegistration({
					namespacePrefix: ctx.namespacePrefix,
					agentNames: agentNamesOptions,
					lockPathAbs: abs(layout.lockFile),
					// x00051 S2: when the host gate is on, forward the
					// worktree option so `delegate` creates a per-agent
					// branch before claiming the lock. The gate is the
					// same `enabled` flag the `agent_worktree` tool
					// reads — single source of truth.
					...(ctx.agentWorktreeEnabled === true
						? {
								worktree: {
									enabled: true,
									workspaceRoot: ctx.workspace.root,
								},
							}
						: {}),
				}),
				buildProposalTransitionRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDirAbs: abs(layout.proposalsDir),
					workspaceRoot: ctx.workspace.root,
					// a00069 S3: indexPathAbs triggers post-move index sync
					// + self-**Files** rewrite inside applyTransition.
					indexPathAbs: abs(layout.proposalIndexFile),
					peerReviewLogPathAbs: abs(layout.peerReviewLogFile),
					folderPolicy,
					// a00069 S7: peer-review gate on review→done (default on).
					...(typeof ctx.options.requirePeerReview === 'boolean'
						? {
								requirePeerReview: ctx.options
									.requirePeerReview as boolean,
							}
						: { requirePeerReview: true }),
				}),
				buildClosePlanRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDirAbs: abs(layout.proposalsDir),
					workspaceRoot: ctx.workspace.root,
					indexPathAbs: abs(layout.proposalIndexFile),
				}),
				buildCreateProposalRegistration(authoringOptions),
				buildCloseSliceRegistration(authoringOptions),
				buildReviewRegistration(authoringOptions),
				buildProposalBoardRegistration(authoringOptions),
				buildAdoptRegistration(authoringOptions),
				// f00094: on-demand audit of the host-instruction files
				// (in-repo always; opt-in user-home via `scope: 'all'`).
				// Shares the authoring layout/allocator so an emitted audit
				// proposal never collides with `create_proposal` or f00093.
				buildInheritHostInstructionsRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					reader: createWorkspaceFileReader(ctx.workspace),
					proposalsDirAbs: abs(layout.proposalsDir),
					counterPathAbs: abs(layout.proposalIdCountersFile),
					layout: {
						proposalsDir: layout.proposalsDir,
						proposalIndexFile: layout.proposalIndexFile,
					},
					extraFolders: extraProposalFolders,
				}),
				buildIncidentProposalRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					proposalsDirAbs: abs(layout.proposalsDir),
					indexPathAbs: abs(layout.proposalIndexFile),
					counterPathAbs: abs(layout.proposalIdCountersFile),
					layout: {
						proposalsDir: layout.proposalsDir,
						proposalIndexFile: layout.proposalIndexFile,
					},
					extraFolders: extraProposalFolders,
					readIncidents: async (options) =>
						logIncidents(await incidentLogStore, options),
				}),
				buildAutoFixQueueRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
					proposalsDirAbs: abs(layout.proposalsDir),
					indexPathAbs: abs(layout.proposalIndexFile),
					counterPathAbs: abs(layout.proposalIdCountersFile),
					layout: {
						proposalsDir: layout.proposalsDir,
						proposalIndexFile: layout.proposalIndexFile,
					},
					extraFolders: extraProposalFolders,
					readIncidents: async (options) =>
						logIncidents(await incidentLogStore, options),
				}),
				buildStateHealthRegistration(stateOptions),
				buildStateRepairRegistration(stateOptions),
				buildCompactStatusRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockPathAbs: abs(layout.lockFile),
					queuePathAbs: abs(layout.taskQueueFile),
					closedTasksPathAbs: abs(layout.closedTasksFile),
					indexPathAbs: abs(layout.proposalIndexFile),
					proposalsDirAbs: abs(layout.proposalsDir),
				}),
				...buildRecoveryToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					indexPathAbs: abs(layout.proposalIndexFile),
					proposalsDirAbs: abs(layout.proposalsDir),
					lockPathAbs: abs(layout.lockFile),
					agentRegistryPathAbs: abs(layout.agentRegistryFile),
					workspaceRoot: ctx.workspace.root,
					// a00069 S7: same peer-review default as proposal_transition.
					...(typeof ctx.options.requirePeerReview === 'boolean'
						? {
								requirePeerReview: ctx.options
									.requirePeerReview as boolean,
							}
						: { requirePeerReview: true }),
				}),
			]),
			resources: [
				buildProposalTemplatesResourceRegistration({
					proposalsDir: layout.proposalsDir,
					indexFile: layout.proposalIndexFile,
				}),
			],
			prompts: [
				{
					id: 'work',
					register: async (server) => {
						server.registerPrompt(
							`${ctx.namespacePrefix}_work`,
							{
								description:
									'Start (or continue) proposal work efficiently in this project.',
							},
							async () => ({
								messages: [
									{
										role: 'user' as const,
										content: {
											type: 'text' as const,
											text: [
												`Call \`${ctx.namespacePrefix}_auto_work\` to get the next proposal and a step plan.`,
												'If the returned orchestration policy says the slice is non-trivial, call `continue_proposal mode:"plan"` and `delegate` before doing the heavy inspection in the main thread.',
												'Then: claim files with `agent_lock`, do one atomic slice, validate, `sync_proposals`, release the lock.',
												'Report `lock-conflict` instead of retrying a blocked claim. Keep it small and low-token.',
											].join('\n'),
										},
									},
								],
							}),
						);
					},
				},
				{
					id: 'orchestrate',
					register: async (server) => {
						server.registerPrompt(
							`${ctx.namespacePrefix}_orchestrate`,
							{
								description:
									'Coordinate multiple subagents over a proposal split into disjoint slices.',
							},
							async () => ({
								messages: [
									{
										role: 'user' as const,
										content: {
											type: 'text' as const,
											text: [
												`Call \`${ctx.namespacePrefix}_proposal_board\` to see proposals, slices and claims.`,
												`Use \`${ctx.namespacePrefix}_plan\` to validate disjoint slices, then \`${ctx.namespacePrefix}_delegate\` one claimable slice per subagent (assigns name + lock).`,
												`Each subagent does its slice then \`${ctx.namespacePrefix}_close_slice\` (marks done + releases lock). When all close, run the global gate once.`,
												'Keep slices file-disjoint; never give two agents overlapping files.',
											].join('\n'),
										},
									},
								],
							}),
						);
					},
				},
			],
			knowledge: [
				// f00116 S3: when the workspace has NO proposals store yet,
				// orientation names the one call that bootstraps it.
				...(hasProposalsStore
					? []
					: [
							{
								id: 'proposals-store-missing',
								title: 'Proposals store not bootstrapped yet',
								body: [
									'# Proposals store missing',
									'',
									`This workspace has no proposals store at \`${layout.proposalsDir}\`.`,
									'Bootstrap it in one call:',
									'',
									'- `proposal_adopt { apply: true }` — creates the status folders,',
									'  a README and the registry index (idempotent, atomic).',
									'- Add `migrate: { roots: ["docs/rfcs", "TODO.md"] }` to convert an',
									'  existing foreign scheme (rfc docs, TODO checklists, ad-hoc',
									'  frontmatter) into canonical proposals with provenance.',
								].join('\n'),
							},
						]),
				{
					id: 'multi-agent-loop',
					title: 'Multi-agent slice loop',
					body: [
						'# Multi-agent slice loop',
						'',
						'Several agents work a proposal in parallel without stepping on each other:',
						'1. create_proposal with file-disjoint ## Slices (validated on create).',
						'2. Orchestrator: proposal_board to see slices + claimable; plan to re-check disjointness.',
						'3. delegate one claimable slice per subagent (assigns a name + claims its files).',
						'4. Each subagent edits ONLY its files, validates, then close_slice (done + release lock).',
						'5. When all slices are done, run the global gate once; archive the proposal.',
						'Disjointness is the contract; report lock-conflict instead of retrying.',
					].join('\n'),
				},
				{
					id: 'proposals-workflow',
					title: 'Proposals workflow',
					body: [
						'# Proposals workflow',
						'',
						`Tools are namespaced \`${ctx.namespacePrefix}_*\`. Start with \`auto_work\`.`,
						'',
						'- `auto_work` — one call: the next proposal + an ordered action plan.',
						'- `auto_work.orchestration` — context policy: keep the main thread compact; inspect plan/delegate for non-trivial slices.',
						'- `continue_proposal` — next proposal (mode "auto"), or a parallel slice plan/claim (modes "plan"/"claim").',
						'- `agent_lock` — claim files before editing, heartbeat while working, release after (claim/heartbeat/release/status/gc).',
						'- `get_proposal_workflow` — families, locations, naming, template.',
						'- `sync_proposals` — rebuild the index after creating/renaming proposal files.',
						'- `agent_names` — name the whole agent tree, orchestrator included.',
						'- `task_queue` / `round_context` — multi-agent coordination & resumed rounds.',
						'',
						'Loop: claim → one atomic slice → validate → close_slice. If that was the last open slice, sync once; otherwise do not sync mid-flight. On blocked claims, await_lock or lock-released — never poll.',
						`State under \`${layout.scratchDir}\`; proposals under \`${layout.proposalsDir}\`.`,
					].join('\n'),
				},
			],
			onToolCall: (name, args, result, error) => {
				void loopDetector.onToolCall(name, args, result, error);
				const advisories = parsedOptions.data.checkpointAdvisories;
				if (advisories?.enabled === false) return;
				const stem = name.split('_').at(-1) ?? name;
				const kind: IObservedToolCall['kind'] =
					/quality|validate|typecheck|lint|test/u.test(stem) ||
					/quality|validate|typecheck|lint|test/u.test(name)
						? 'validation'
						: /write|edit|commit/u.test(stem)
							? 'edit'
							: 'other';
				microValidationCalls.push({
					tool: name,
					kind,
					progressHash: 'live',
					sliceId: 'unknown',
				});
				if (microValidationCalls.length > 32) {
					microValidationCalls.splice(
						0,
						microValidationCalls.length - 32,
					);
				}
			},
			isAgentStuck: (name, args) => loopDetector.isAgentStuck(name, args),
			getCheckpointAdvisory: () => {
				const advisories = parsedOptions.data.checkpointAdvisories;
				if (advisories?.enabled === false) return null;
				return mergeCheckpointAdvisories([
					loopDetector.getInteractiveCheckpointAdvisory(),
					assessMicroValidationLoop(microValidationCalls, {
						equivalentRunsBeforeWarning:
							advisories?.microValidation
								?.equivalentRunsBeforeWarning ?? 2,
					}),
				]);
			},
			beforeToolCall: (context) => {
				const advisories = parsedOptions.data.checkpointAdvisories;
				if (advisories?.pushGuard?.enabled === false) return null;
				const tool = context.toolName;
				if (!/_push$/u.test(tool) && !tool.includes('git_push')) {
					return null;
				}
				// Push-guard block only when evidence was supplied on the
				// persist helper; without it we must not invent a blocker.
				return null;
			},
		};
	},
});
