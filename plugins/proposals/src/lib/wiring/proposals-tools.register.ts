import {
	ProposalsSqliteDriver,
	SummaryRepo,
	CompileRunsRepo,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	callerCheckout,
	createWorkspaceFileReader,
} from '@delendai/core/public';
import { logIncidents } from '@delendai/logs/public';
import { createCallbackLockListener } from '../locks/lock-change-listener';
import { applyProposalsDisclosure } from '../surface/disclosure';
import { buildAdoptRegistration } from '../tools/adopt.tool';
import { buildAgentLockRegistration } from '../tools/agent-lock.tool';
import { buildAgentNamesRegistration } from '../tools/agent-names.tool';
import { buildAgentWorktreeRegistration } from '../tools/agent-worktree.tool';
import { buildAgentsLockDiagnoseRegistration } from '../tools/agents-lock-diagnose.tool';
import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildReviewRegistration,
} from '../tools/authoring.tool';
import { buildProposalBoardRegistration } from '../tools/proposal-board.tool';
import { buildAutoFixQueueRegistration } from '../tools/auto-fix-queue.tool';
import { buildAutoWorkRegistration } from '../tools/auto-work.tool';
import { createDurationJournalRecorder } from '../tools/proposal-transition-duration';
import { DURATION_JOURNAL_CACHE_FILE } from '../contracts/constants/transition-duration.constant';
import { buildBranchGcRegistration } from '../tools/branch-gc.tool';
import { buildBranchStatusRegistration } from '../tools/branch-status.tool';
import { buildClosePlanRegistration } from '../tools/close-plan.tool';
import { buildCompactStatusRegistration } from '../tools/compact-status.tool';
import { buildContinueProposalRegistration } from '../tools/continue-proposal.tool';
import { buildDbStatusToolRegistration } from '../tools/db-status.tool';
import { buildDbDoctorToolRegistration } from '../tools/db-doctor.tool';
import { buildDbReconcileToolRegistration } from '../tools/db-reconcile.tool';
import { buildDbRebuildToolRegistration } from '../tools/db-rebuild.tool';
import { buildDbVerifyToolRegistration } from '../tools/db-verify.tool';
import { buildDbDiffToolRegistration } from '../tools/db-diff.tool';
import { buildConflictsToolRegistration } from '../tools/conflicts.tool';
import { buildQuarantineListToolRegistration } from '../tools/quarantine-list.tool';
import { buildQuarantineRepairToolRegistration } from '../tools/quarantine-repair.tool';
import { buildResurrectToolRegistration } from '../tools/resurrect.tool';
import { buildTombstonesToolRegistration } from '../tools/tombstones.tool';
import { buildSearchToolRegistration } from '../tools/search.tool';
import { buildSummaryBackfillToolRegistration } from '../tools/summary-backfill.tool';
import { buildCompileContextToolRegistration } from '../tools/compile-context.tool';
import { createProposalSearchService } from '../services/search';
import { buildGetProposalWorkflowRegistration } from '../tools/get-proposal-workflow.tool';
import { buildIncidentProposalRegistration } from '../tools/incident-proposal.tool';
import { buildInheritHostInstructionsRegistration } from '../tools/inherit-host-instructions.tool';
import {
	buildDelegateRegistration,
	buildPlanRegistration,
} from '../tools/orchestration.tool';
import { buildProposalGetRegistration } from '../tools/proposal-get.tool';
import { buildProposalTransitionRegistration } from '../tools/proposal-transition.tool';
import { buildRecoveryToolRegistrations } from '../tools/recovery-tools';
import { movesStayOutOfTheIndex } from '../shared/index-free-git-runner';
import { buildReviewClaimRegistration } from '../tools/review-claim.tool';
import { buildReviewQueueRegistration } from '../tools/review-queue.tool';
import { buildRoundContextRegistration } from '../tools/round-context.tool';
import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
} from '../tools/state-tools.tool';
import { buildSwarmHygieneRegistration } from '../tools/swarm-hygiene.tool';
import { buildSyncProposalsRegistration } from '../tools/sync-proposals.tool';
import { buildTaskQueueRegistration } from '../tools/task-queue.tool';

/**
 * The proposals workflow plugin. It turns delendai into a multi-agent
 * proposal runner: a file-based proposal store, file-level write locks
 * and a persistent task queue (the "swarm" coordination layer).
 *
 * Load it with `delendai --plugins=proposals`. Paths come from the
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

import type { IProposalsToolsWiring } from '../contracts/interfaces/proposals-wiring.interface';

/** Every tool the proposals plugin registers, wrapped in its disclosure level. */
export const buildProposalsTools = (wiring: IProposalsToolsWiring) => {
	const {
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
	} = wiring;
	return [
		...applyProposalsDisclosure([
			buildAgentLockRegistration({
				namespacePrefix: ctx.namespacePrefix,
				lockPathAbs: abs(layout.lockFile),
				lockFileLabel: layout.lockFile,
				// hard gate. When the host has the
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
				// default the echoed identity block from the
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
				...(parsedOptions.data.redactIdentity === true
					? { redactIdentity: true }
					: {}),
				enabled: ctx.agentWorktreeEnabled === true,
				isolation: workIsolation,
			}),
			// read-only branch + worktree snapshot. Lets every
			// agent answer "what is everyone else doing right now?"
			// without grep.
			buildBranchStatusRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				// `layout.worktreesDir` is ALREADY the cache-rooted
				// workspace-relative path (default
				// `.cache/delendai/.worktrees`). The previous
				// `.cache/delendai/${layout.worktreesDir}` double-prefixed
				// it to `.cache/delendai/.cache/delendai/.worktrees`,
				// which can never match a real worktree path — so
				// branch-status / swarm-hygiene flagged EVERY
				// correctly-placed worktree as `outOfCache: true`. The
				// agent_worktree engine resolves the same
				// `layout.worktreesDir`, so both must agree byte-for-byte.
				canonicalWorktreesDirRel:
					layout.worktreesDir || '.cache/delendai/.worktrees',
			}),
			// idempotent cleanup of orphan worktrees. dryRun by
			// default; unmerged branches are sacred.
			buildBranchGcRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				defaultStaleMinutes: 60,
			}),
			// read-only swarm hygiene snapshot — rescue
			// candidates + GC-eligible + out-of-cache. Never mutates.
			buildSwarmHygieneRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
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
			buildSyncProposalsRegistration(syncOptions),
			buildGetProposalWorkflowRegistration({
				namespacePrefix: ctx.namespacePrefix,
				proposalsDir: layout.proposalsDir,
				indexFile: layout.proposalIndexFile,
				isolation: workIsolation,
			}),
			// `proposal_get` — compact | normal | full.
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
				refreshIndex,
			}),
			buildAutoWorkRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				indexPathAbs: abs(layout.proposalIndexFile),
				proposalsDirAbs: abs(layout.proposalsDir),
				lockPathAbs: abs(layout.lockFile),
				refreshIndex,
				loopDetector,
				// Pass the gate flag and the
				// loop-detector window so the front-hook can run the
				// `needs-worktree` and `loop-blocked` gates before
				// returning a plan. Hosts with the gate off (the
				// default) pass `false` and the front-hook is a no-op.
				agentWorktreeEnabled: ctx.agentWorktreeEnabled === true,
				...(ctx.developmentPolicy === undefined
					? {}
					: { developmentPolicy: ctx.developmentPolicy }),
				...(ctx.toolNameOf === undefined
					? {}
					: { toolNameOf: ctx.toolNameOf }),
				...(ctx.peerPlugins === undefined
					? {}
					: {
							isPluginLoaded: (name: string) =>
								ctx.peerPlugins?.has(name) === true,
						}),
				// thread the host-resolved commit-author
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
				// short-circuit review/ without peer approve.
				...{ requireValidateEvidence },
				...reviewPolicy,
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
				// when the host gate is on, forward the
				// worktree option so `delegate` creates a per-agent
				// branch before claiming the lock. The gate is the
				// same `enabled` flag the `agent_worktree` tool
				// reads — single source of truth.
				// forward `layout.worktreesDir` so
				// `delegate` lands worktrees under the SAME canonical
				// path as `agent_worktree`. Without this the engine
				// defaults to `<workspaceRoot>/.worktrees`, which is
				// not the cache-rooted canonical path, and
				// `swarm_hygiene` would flag every delegated
				// worktree as `outOfCache: true`.
				...(ctx.agentWorktreeEnabled === true
					? {
							worktree: {
								enabled: true,
								workspaceRoot: ctx.workspace.root,
								worktreesDirRel: layout.worktreesDir,
							},
						}
					: {}),
			}),
			buildProposalTransitionRegistration({
				namespacePrefix: ctx.namespacePrefix,
				proposalsDirAbs: abs(layout.proposalsDir),
				workspaceRoot: ctx.workspace.root,
				// indexPathAbs triggers post-move index sync
				// + self-**Files** rewrite inside applyTransition.
				indexPathAbs: abs(layout.proposalIndexFile),
				peerReviewLogPathAbs: abs(layout.peerReviewLogFile),
				folderPolicy,
				indexFreeMoves: movesStayOutOfTheIndex(ctx.developmentPolicy),
				// peer-review gate on review→done (default on).
				...reviewPolicy,
				// The evidence gate the authoring and auto_work tools
				// apply; the transition handler did not receive it,
				// so `requireValidateEvidence: false` never reached it.
				requireValidateEvidence,
				proposalLifecycleStateReader: {
					getProposalState: sqlLifecycleReaders.getProposalState,
				},
				durationRecorder: createDurationJournalRecorder(
					abs(`${ctx.cacheDir}/${DURATION_JOURNAL_CACHE_FILE}`),
				),
			}),
			buildClosePlanRegistration({
				namespacePrefix: ctx.namespacePrefix,
				proposalsDirAbs: abs(layout.proposalsDir),
				workspaceRoot: ctx.workspace.root,
				indexPathAbs: abs(layout.proposalIndexFile),
				planLifecycleStateReader: {
					getPlanState: sqlLifecycleReaders.getPlanState,
				},
			}),
			buildCreateProposalRegistration(authoringOptions),
			buildCloseSliceRegistration(authoringOptions),
			buildReviewRegistration(authoringOptions),
			buildReviewQueueRegistration(authoringOptions),
			buildReviewClaimRegistration(authoringOptions),
			buildProposalBoardRegistration(authoringOptions),
			buildAdoptRegistration(authoringOptions),
			// on-demand audit of the host-instruction files
			// (in-repo always; opt-in user-home via `scope: 'all'`).
			// Shares the authoring layout/allocator so an emitted audit
			// proposal never collides with `create_proposal` or f00093.
			buildInheritHostInstructionsRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				reader: createWorkspaceFileReader(
					callerCheckout.workspaceForCall(ctx.workspace),
				),
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
				workspaceRoot: ctx.workspace.root,
				developmentPolicy: ctx.developmentPolicy,
			}),
			...buildRecoveryToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				indexPathAbs: abs(layout.proposalIndexFile),
				proposalsDirAbs: abs(layout.proposalsDir),
				lockPathAbs: abs(layout.lockFile),
				agentRegistryPathAbs: abs(layout.agentRegistryFile),
				workspaceRoot: ctx.workspace.root,
				// same peer-review default as proposal_transition.
				...reviewPolicy,
			}),
			// `proposals_db_status`, the first diagnostic an
			// operator runs against a suspect database (x00510 S3), was
			// built and tested but never registered: its only reference
			// in `src` was its own definition. It is on the surface now,
			// classified `administrative` in PROPOSALS_TOOL_DISCLOSURE
			// like every sibling, so the closed union keeps being the
			// single place a tool's disclosure level is decided.
			buildDbStatusToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
				runtimeIndexPathAbs: abs(layout.proposalIndexFile),
				reader: {
					count: sqlLifecycleReaders.count,
					lastSync: sqlLifecycleReaders.lastSync,
				},
			}),
			buildDbDoctorToolRegistration({
				workspaceRoot: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
			}),
			// `proposals_db_reconcile`, the first
			// production writer of `.cache/delendai/state/proposals.sqlite`.
			// Building the registration is pure: it stores two paths
			// and returns a closure. NOTHING here opens or creates a
			// database — the cost is paid only when the tool is
			// actually invoked, which is what
			// `db-reconcile-registration.spec.ts` pins.
			buildDbReconcileToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
			}),
			buildDbRebuildToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
			}),
			buildDbVerifyToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
			}),
			buildDbDiffToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				proposalsDirAbs: abs(layout.proposalsDir),
			}),
			buildConflictsToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
			}),
			buildQuarantineListToolRegistration({
				workspaceRoot: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
			}),
			buildQuarantineRepairToolRegistration({
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
				namespacePrefix: ctx.namespacePrefix,
			}),
			buildTombstonesToolRegistration({
				workspaceRoot: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
			}),
			buildResurrectToolRegistration({
				workspaceRoot: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
			}),
			buildSearchToolRegistration({
				workspaceRoot: ctx.workspace.root,
				proposalsDirAbs: abs(layout.proposalsDir),
				indexPathAbs: abs(layout.proposalIndexFile),
				namespacePrefix: ctx.namespacePrefix,
			}),
			buildCompileContextToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				dependencies: {
					search: async (task) => {
						const sqlitePath = resolveProposalsDbPaths(
							ctx.workspace.root,
						).databasePath;
						const driver = new ProposalsSqliteDriver({
							path: sqlitePath,
							readonly: true,
						});
						try {
							return await createProposalSearchService(
								driver,
							).search({
								query: task,
								limit: 100,
								offset: 0,
							});
						} finally {
							driver.close();
						}
					},
					getDocument: async (uid) => {
						const sqlitePath = resolveProposalsDbPaths(
							ctx.workspace.root,
						).databasePath;
						const driver = new ProposalsSqliteDriver({
							path: sqlitePath,
							readonly: true,
						});
						try {
							const row = driver.handle
								.query<
									{
										uid: string;
										kind: string;
										status: string;
										title: string;
										content_hash: string | null;
										updated_at: number;
									},
									[string]
								>(
									`SELECT uid, kind, status, title, content_hash, updated_at
											 FROM proposals WHERE uid = ?`,
								)
								.get(uid);
							if (row === null) return null;
							return {
								uid: row.uid,
								kind: row.kind,
								status: row.status,
								title: row.title,
								...(row.content_hash === null
									? {}
									: {
											contentHash: row.content_hash,
										}),
								updatedAt: row.updated_at,
							};
						} finally {
							driver.close();
						}
					},
					getSummary: async (contentHash) => {
						const sqlitePath = resolveProposalsDbPaths(
							ctx.workspace.root,
						).databasePath;
						const driver = new ProposalsSqliteDriver({
							path: sqlitePath,
							readonly: true,
						});
						try {
							return (
								new SummaryRepo(driver.handle).getByContentHash(
									contentHash,
								)?.summary ?? null
							);
						} finally {
							driver.close();
						}
					},
					recordCompileRun: async (record) => {
						const sqlitePath = resolveProposalsDbPaths(
							ctx.workspace.root,
						).databasePath;
						const driver = new ProposalsSqliteDriver({
							path: sqlitePath,
						});
						try {
							new CompileRunsRepo(driver.handle).append({
								...record,
								createdAt: Date.now(),
							});
						} finally {
							driver.close();
						}
					},
				},
			}),
			buildSummaryBackfillToolRegistration({
				workspaceRoot: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
			}),
		]),
	];
};
