// effect-boundary-authorized: access-only probe for the proposals dir; uses node:fs/promises access to decide whether the store is bootstrapped — no mutations. The SQLite probe moved to lib/sql/lifecycle-readers.ts, which carries its own marker.
import { PROPOSALS_NAME_POOL } from './lib/contracts/constants/proposals-name-pool.constant';
import type { IProposalsToolsWiring } from './lib/contracts/interfaces/proposals-wiring.interface';
import { buildProposalsTools } from './lib/wiring/proposals-tools.register';
import { buildProposalsPrompts } from './lib/wiring/proposals-work.prompt';
import { buildProposalsKnowledge } from './lib/wiring/proposals-knowledge.service';
import { describeWorkIsolation, definePlugin } from '@delendai/core/plugin';
import {
	deriveDefaultProtectedBranches,
	registerAdoptionExtensions,
	callerCheckout,
	createWorkspaceFileReader,
	mergeCheckpointAdvisories,
} from '@delendai/core/public';
import { createLogStore } from '@delendai/logs/public';
import {
	announceSlicePersistence,
	resolveSlicePersistence,
} from './lib/slice-persistence-owner';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { readTextOrNull } from './lib/proposals/index-reader';
import { declareProposalIndexFile } from './lib/proposals/index-reader-location';
import { AgentLoopDetectorService } from './lib/agents/loop-detector-service';
import { resolveScopes } from '@delendai/quality/public';
import { buildProposalsAdoptionExtension } from './lib/adoption/proposals-adoption-extension';
import { registerProposalsStableTools } from './lib/api/proposals-stable-tools';
import { buildSwarmPaths } from './lib/contracts/constants/default-path-layout.constant';
import {
	DEFAULT_PROPOSAL_FOLDER_POLICY,
	type IProposalFolderPolicy,
} from './lib/contracts/proposal-folder-policy';
import { cleanupStaleAgentLockState } from './lib/locks/agent-lock-engine';
import { buildProposalTemplatesResourceRegistration } from './lib/resources/proposal-templates.resource';
import {
	assessMicroValidationLoop,
	type IObservedToolCall,
} from './lib/services/checkpoint-advisory-micro-validation.service';
import { registerProposalsWorkflowContribution } from './lib/skills/proposals-workflow-contribution';
import { registerTaskBriefingProvider } from '@delendai/core/cli';
import { taskBriefingOf } from './lib/services/task-briefing.service';
import { buildCloseSliceValidationProvider } from './lib/swarm/validation-provider';
import type { IAgentNamesToolOptions } from './lib/tools/agent-names.tool';
import {
	runCloseSliceGateProbe,
	type IAuthoringToolOptions,
} from './lib/tools/authoring.tool';
import {
	createCertificationReader,
	systemCertificationPorts,
} from './lib/tools/close-slice-certification';
import {
	runAutoStateRepairOnBoot,
	type IStateToolOptions,
} from './lib/tools/state-tools.tool';
import { runSyncProposals } from './lib/tools/sync-proposals.tool';
import { buildSqlLifecycleReaders } from './lib/sql/lifecycle-readers';
import { PROPOSALS_OPTIONS_SCHEMA } from './lib/contracts/constants/proposals-options-schema.constant';
import {
	commitPolicyOwnsSlicePersistence,
	validateProposalConfiguration,
} from './lib/wiring/proposals-persist.service';
export {
	resolveProposalPersistMode,
	validateProposalConfiguration,
} from './lib/wiring/proposals-persist.service';

/**
 * The lifecycle readers live in their own module because they open a
 * real `bun:sqlite` handle — see `./lib/sql/lifecycle-readers.ts`. They
 * are re-exported here because that is where hosts and specs already
 * import them from.
 */
export { buildSqlLifecycleReaders } from './lib/sql/lifecycle-readers';

export default definePlugin({
	name: 'proposals',
	version: '0.2.4',
	describe:
		'Proposal store + file-level agent locks + persistent task queue (multi-agent swarm coordination).',
	optionsSchema: PROPOSALS_OPTIONS_SCHEMA,
	validateConfiguration: validateProposalConfiguration,
	configExample: {
		summary:
			'Default swarm setup: bun as the validation command, and an explicit agent-name pool so multi-agent runs get reproducible names.',
		options: {
			validationCommand: 'bun run validate',
			namePool: [...PROPOSALS_NAME_POOL],
			orchestration: { delegateAfterToolCalls: 3 },
		},
	},
	async register(ctx) {
		// How this project's development policy isolates agents. Every piece
		// of guidance about worktrees reads it, so none can contradict it.
		const workIsolation = describeWorkIsolation(ctx.developmentPolicy);
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
		registerTaskBriefingProvider((request) =>
			taskBriefingOf(request, layout.proposalsDir),
		);
		const abs = (relativePath: string): string =>
			ctx.workspace.resolve(relativePath);
		// The database stays at its canonical place when the cache moves;
		// readers find this workspace from the index path only if the
		// layout that placed it is known, and rebuild from the folder the
		// project keeps its proposals in only if they are told which.
		declareProposalIndexFile(
			layout.proposalIndexFile,
			ctx.workspace.root,
			layout.proposalsDir,
		);

		// Host-specific proposal subfolders (relative to proposalsDir),
		// e.g. `['paused/demos']`. delendai bakes none — the host injects
		// its folder policy via ctx.options (now schema-validated, S9).
		const extraProposalFolders = parsedOptions.data.proposalFolders ?? [];
		const folderPolicy: IProposalFolderPolicy = {
			...DEFAULT_PROPOSAL_FOLDER_POLICY,
			...parsedOptions.data.folderPolicy,
		};
		// One set of sync options: `sync_proposals`, and `auto_work` when
		// it finds its index behind the files (x00716).
		const syncOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			layout: {
				proposalsDir: layout.proposalsDir,
				proposalIndexFile: layout.proposalIndexFile,
			},
			extraFolders: extraProposalFolders,
			folderPolicy,
		};
		const refreshIndex = async (): Promise<void> => {
			await runSyncProposals({ ...syncOptions, indexOnly: true });
		};
		// Whether proposals are reviewed and what makes a reviewer
		// independent: the project's decision, stated once and handed to
		// every tool that judges it (x00718).
		// Whether a move to review or done needs fresh validate evidence:
		// on unless the project turns it off. Every tool that moves a
		// proposal reads this one value.
		const requireValidateEvidence =
			typeof ctx.options.requireValidateEvidence === 'boolean'
				? (ctx.options.requireValidateEvidence as boolean)
				: true;
		const reviewPolicy = {
			requirePeerReview: parsedOptions.data.requirePeerReview ?? true,
			reviewIndependence:
				parsedOptions.data.reviewIndependence ?? 'instance',
			forceTransitions: parsedOptions.data.forceTransitions ?? 'agents',
			...(parsedOptions.data.documentationLanguage === undefined
				? {}
				: {
						documentationLanguage:
							parsedOptions.data.documentationLanguage,
					}),
		} as const;
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
				: [...deriveDefaultProtectedBranches(ctx.developmentPolicy)];
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
			// the boot-resolved host identity becomes the default
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
			// route the auto-repair boot event through the
			// structured incident stream instead of console.info.
			logs: ctx.logs,
		};

		// purge stale orphans at boot unless the host opts out.
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
		const sqlLifecycleReaders = buildSqlLifecycleReaders(
			ctx.workspace.root,
		);
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
			...(typeof ctx.options.publishCommand === 'string'
				? { publishCommand: ctx.options.publishCommand }
				: {}),
			...(ctx.developmentPolicy !== undefined
				? { developmentPolicy: ctx.developmentPolicy }
				: {}),
			// host validation command for close_slice gate.
			...(typeof ctx.options.validationCommand === 'string'
				? {
						validationCommand: ctx.options
							.validationCommand as string,
					}
				: { validationCommand: 'bun run validate' }),
			...reviewPolicy,
			requireValidateEvidence,
			validationScope:
				ctx.options.validationScope === 'global' ? 'global' : 'scoped',
			...(qualityPeerConfigured
				? {
						resolveValidationDecision:
							buildCloseSliceValidationProvider({
								workspaceRoot: ctx.workspace.root,
								registryPathAbs: abs(layout.agentRegistryFile),
								lockPathAbs: abs(layout.lockFile),
								worktreesDirAbs: abs(layout.worktreesDir),
								branches: ctx.developmentPolicy?.branches,
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
							runCloseSliceGateProbe(
								{
									storeRoot: ctx.workspace.resolve(
										join(
											ctx.cacheDir,
											'proposals',
											'close-gate',
										),
									),
									stateRoots: [
										ctx.workspace.resolve(ctx.cacheDir),
									],
									cwd: callerCheckout.executionRootOr(
										ctx.workspace.root,
									),
									readDeclaration: (relativePath) =>
										readTextOrNull(
											ctx.workspace.resolve(relativePath),
										),
									certification: createCertificationReader({
										policy: ctx.developmentPolicy,
										ports: systemCertificationPorts(
											callerCheckout.executionRootOr(
												ctx.workspace.root,
											),
										),
									}),
									...(parsedOptions.data.closeGateWaitMs !==
									undefined
										? {
												waitMs: parsedOptions.data
													.closeGateWaitMs,
											}
										: {}),
									...(parsedOptions.data
										.closeGateTimeoutMs !== undefined
										? {
												timeoutMs:
													parsedOptions.data
														.closeGateTimeoutMs,
											}
										: {}),
								},
								input?.scopes ?? [],
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
			sliceLifecycleStateReader: {
				getSliceState: sqlLifecycleReaders.getSliceState,
			},
		};

		const wiring: IProposalsToolsWiring = {
			ctx,
			workIsolation,
			parsedOptions,
			loopDetector,
			layout,
			abs,
			extraProposalFolders,
			folderPolicy,
			syncOptions,
			refreshIndex,
			requireValidateEvidence,
			reviewPolicy,
			effectivePersist,
			incidentLogStore,
			agentNamesOptions,
			stateOptions,
			sqlLifecycleReaders,
			authoringOptions,
		};
		return {
			// Progressive disclosure. Every one of the 34 tool
			// builders below is untouched — `applyProposalsDisclosure`
			// tags each returned registration with its static
			// essential/contextual/administrative level from
			// `./lib/surface/disclosure.ts` (the one file that owns the
			// policy) and throws if a registration id has no assigned
			// level, so a new tool can never silently ship unlabelled.
			tools: buildProposalsTools(wiring),
			resources: [
				buildProposalTemplatesResourceRegistration({
					proposalsDir: layout.proposalsDir,
					indexFile: layout.proposalIndexFile,
					isolation: workIsolation,
				}),
			],
			prompts: buildProposalsPrompts(ctx),
			knowledge: buildProposalsKnowledge({
				ctx,
				layout,
				hasProposalsStore,
			}),
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
