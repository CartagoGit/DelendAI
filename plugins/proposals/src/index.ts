import { definePlugin } from '@mcp-vertex/core/public';
import { AgentLoopDetectorService } from './lib/agents/loop-detector-service';
import { z } from 'zod';

import { buildSwarmPaths } from './lib/contracts/constants/default-path-layout.constant';
import { buildAgentLockRegistration } from './lib/tools/agent-lock.tool';
import { buildAgentNamesRegistration } from './lib/tools/agent-names.tool';
import { buildAgentWorktreeRegistration } from './lib/tools/agent-worktree.tool';
import { buildAutoWorkRegistration } from './lib/tools/auto-work.tool';
import { buildContinueProposalRegistration } from './lib/tools/continue-proposal.tool';
import { buildProposalTransitionRegistration } from './lib/tools/proposal-transition.tool';
import {
	buildDelegateRegistration,
	buildPlanRegistration,
} from './lib/tools/orchestration.tool';
import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildProposalBoardRegistration,
	buildReviewRegistration,
} from './lib/tools/authoring.tool';
import type { IAuthoringToolOptions } from './lib/tools/authoring.tool';
import { buildAdoptRegistration } from './lib/tools/adopt.tool';
import type { IAgentNamesToolOptions } from './lib/tools/agent-names.tool';
import { buildGetProposalWorkflowRegistration } from './lib/tools/get-proposal-workflow.tool';
import { buildRoundContextRegistration } from './lib/tools/round-context.tool';
import { buildSyncProposalsRegistration } from './lib/tools/sync-proposals.tool';
import { buildTaskQueueRegistration } from './lib/tools/task-queue.tool';
import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
} from './lib/tools/state-tools.tool';
import type { IStateToolOptions } from './lib/tools/state-tools.tool';
import { buildCompactStatusRegistration } from './lib/tools/compact-status.tool';
import { buildRecoveryToolRegistrations } from './lib/tools/recovery-tools';

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
export default definePlugin({
	name: 'proposals',
	version: '0.1.0',
	describe:
		'Proposal store + file-level agent locks + persistent task queue (multi-agent swarm coordination).',
	optionsSchema: z.object({
		/** Custom symbolic agent-name pool. */
		namePool: z.array(z.string()).optional(),
		/** Family prefixes in cascade order, e.g. ["f","p"]. */
		familyCascade: z.array(z.string()).optional(),
		/** Quality-gate command surfaced by auto_work. */
		validationCommand: z.string().optional(),
		/**
		 * Default persistence mode for `<prefix>_auto_work` (l109).
		 *   - `none`             — no git interaction (legacy behaviour).
		 *   - `commit`           — stage claimed files + Conventional Commits
		 *                          commit locally after `sync_proposals`.
		 *   - `commit-and-push`  — the above plus `git push <pushTarget>`.
		 *                          Push to `main` is always refused.
		 *
		 * Per-call overrides via `auto_work { persist: '...' }` win over
		 * this default.
		 */
		persist: z
			.object({
				mode: z
					.enum(['none', 'commit', 'commit-and-push'])
					.default('none'),
				/** Conventional-Commits template. Default: `<area>(<proposalId>): <sliceId>`. */
				messageTemplate: z.string().optional(),
				/** Push target for `commit-and-push`. Default: `origin HEAD`. */
				pushTarget: z.string().optional(),
			})
			.optional(),
	}),
	configExample: {
		summary:
			'Default swarm setup: serial cascade (f before p), bun as the validation command, and an explicit agent-name pool so multi-agent runs get reproducible names.',
		options: {
			familyCascade: ['f', 'p'],
			validationCommand: 'bun run validate',
			namePool: ['falcon', 'owl', 'crow', 'sparrow', 'finch'],
		},
	},
	register(ctx) {
		const loopDetector = new AgentLoopDetectorService(ctx);
		// All path-bearing tools share ONE layout so locks, queue,
		// round-context and the proposal store always agree. The layout
		// is derived from the core's resolved roots (`--cacheDir` /
		// `--docsDir`), so the whole store relocates as one when the host
		// reconfigures them: cache/state under `<cacheDir>`, human-edited
		// proposals under `<docsDir>`. Engines that bake DEFAULT_PATH_LAYOUT
		// receive this layout explicitly (sync/round-context), so a
		// relocated store stays coherent end to end.
		const layout = buildSwarmPaths(ctx.cacheDir, ctx.docsDir);
		const abs = (relativePath: string): string =>
			ctx.workspace.resolve(relativePath);

		// Host-specific proposal subfolders (relative to proposalsDir),
		// e.g. `['paused/demos']`. mcp-vertex bakes none — the host injects
		// its folder policy via ctx.options. [M5]
		const extraProposalFolders = Array.isArray(ctx.options.proposalFolders)
			? (ctx.options.proposalFolders as string[])
			: [];

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
		};

		const stateOptions: IStateToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			lockPathAbs: abs(layout.lockFile),
			queuePathAbs: abs(layout.taskQueueFile),
			closedTasksPathAbs: abs(layout.closedTasksFile),
			registryPathAbs: abs(layout.agentRegistryFile),
			workspaceRoot: ctx.workspace.root,
		};

		const authoringOptions: IAuthoringToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			proposalsDirAbs: abs(layout.proposalsDir),
			indexPathAbs: abs(layout.proposalIndexFile),
			lockPathAbs: abs(layout.lockFile),
			counterPathAbs: abs(layout.proposalIdCountersFile),
			layout: {
				proposalsDir: layout.proposalsDir,
				proposalIndexFile: layout.proposalIndexFile,
			},
			extraFolders: extraProposalFolders,
		};

		return {
			tools: [
				buildAgentLockRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockPathAbs: abs(layout.lockFile),
					lockFileLabel: layout.lockFile,
				}),
				buildAgentWorktreeRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRoot: ctx.workspace.root,
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
				}),
				buildGetProposalWorkflowRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDir: layout.proposalsDir,
					indexFile: layout.proposalIndexFile,
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
					lockPathAbs: abs(layout.lockFile),
					...(Array.isArray(ctx.options.familyCascade)
						? {
								familyCascade: ctx.options
									.familyCascade as string[],
							}
						: {}),
				}),
				buildAutoWorkRegistration({
					namespacePrefix: ctx.namespacePrefix,
					indexPathAbs: abs(layout.proposalIndexFile),
					lockPathAbs: abs(layout.lockFile),
					loopDetector,
					...(Array.isArray(ctx.options.familyCascade)
						? {
								familyCascade: ctx.options
									.familyCascade as string[],
							}
						: {}),
					...(typeof ctx.options.validationCommand === 'string'
						? {
								validationCommand: ctx.options
									.validationCommand as string,
							}
						: {}),
					...(ctx.options.persist !== undefined
						? {
								persist: ctx.options.persist as {
									mode: 'none' | 'commit' | 'commit-and-push';
									messageTemplate?: string;
									pushTarget?: string;
								},
							}
						: {}),
				}),
				buildPlanRegistration(ctx.namespacePrefix),
				buildDelegateRegistration({
					namespacePrefix: ctx.namespacePrefix,
					agentNames: agentNamesOptions,
					lockPathAbs: abs(layout.lockFile),
				}),
				buildProposalTransitionRegistration({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDirAbs: abs(layout.proposalsDir),
					workspaceRoot: ctx.workspace.root,
				}),
				buildCreateProposalRegistration(authoringOptions),
				buildCloseSliceRegistration(authoringOptions),
				buildReviewRegistration(authoringOptions),
				buildProposalBoardRegistration(authoringOptions),
				buildAdoptRegistration(authoringOptions),
				buildStateHealthRegistration(stateOptions),
				buildStateRepairRegistration(stateOptions),
				buildCompactStatusRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockPathAbs: abs(layout.lockFile),
					queuePathAbs: abs(layout.taskQueueFile),
					closedTasksPathAbs: abs(layout.closedTasksFile),
					indexPathAbs: abs(layout.proposalIndexFile),
				}),
				...buildRecoveryToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					proposalsDirAbs: abs(layout.proposalsDir),
					lockPathAbs: abs(layout.lockFile),
					agentRegistryPathAbs: abs(layout.agentRegistryFile),
					workspaceRoot: ctx.workspace.root,
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
						'- `continue_proposal` — next proposal (mode "auto"), or a parallel slice plan/claim (modes "plan"/"claim").',
						'- `agent_lock` — claim files before editing, release after (claim/release/status/gc).',
						'- `get_proposal_workflow` — families, locations, naming, template.',
						'- `sync_proposals` — rebuild the index after creating/renaming proposal files.',
						'- `agent_names` — name the whole agent tree, orchestrator included.',
						'- `task_queue` / `round_context` — multi-agent coordination & resumed rounds.',
						'',
						'Loop: claim → one atomic slice → validate → sync → release. Report `lock-conflict` instead of retrying a blocked claim.',
						`State under \`${layout.scratchDir}\`; proposals under \`${layout.proposalsDir}\`.`,
					].join('\n'),
				},
			],
			onToolCall: (name, args, result, error) =>
				loopDetector.onToolCall(name, args, result, error),
			isAgentStuck: (name, args) => loopDetector.isAgentStuck(name, args),
		};
	},
});
