import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { runSwarmHygieneEngine } from '../shared/swarm-hygiene-engine';
import { createPendingIntegrationStore } from '../shared/pending-integration-store';
import {
	resolveBaseBranchAndStaleMinutes,
	toolJsonWithErrorFlag,
} from '../shared/branch-tool-helpers';
import {
	optionalBoolean,
	optionalString,
	optionalUnknown,
} from '../shared/tool-schema-shortcuts';

export interface ISwarmHygieneToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly run?: IGitRunner;
	readonly defaultBaseBranch?: string;
	readonly defaultStaleMinutes?: number;
	/**
	 * f00091 S2: absolute path of the pending-integration store. When
	 * set, `swarm_hygiene` surfaces the branches `close_slice` recorded
	 * as finished-but-unintegrated and prunes any that have since merged.
	 * Omitted → the list is always empty (byte-compatible for hosts that
	 * do not opt into the integration step).
	 */
	readonly pendingIntegrationPathAbs?: string;
	/**
	 * f00091 S4a: prefix that identifies a *conforming* agent branch.
	 * Default `agent/`. Worktree branches outside this prefix (and not a
	 * protected base) are surfaced as `nonConformingBranches`.
	 */
	readonly agentPrefix?: string;
	/** f00091 S4b: behind-base threshold above which an unmerged worktree
	 *  is flagged `staleUnmerged`. Default 50. */
	readonly staleBehindThreshold?: number;
}

const SWARM_HYGIENE_OUTPUT_SCHEMA = z
	.object({
		ok: z.boolean(),
		reason: optionalString(),
		baseBranch: optionalString(),
		generatedAt: optionalString(),
		rescueCandidates: optionalUnknown(),
		gcEligible: optionalUnknown(),
		outOfCache: optionalUnknown(),
		mainCheckoutBranch: optionalString(),
		mainCheckoutDrift: optionalBoolean(),
		pendingIntegration: optionalUnknown(),
		nonConformingBranches: optionalUnknown(),
		staleUnmerged: optionalUnknown(),
		summary: optionalUnknown(),
	})
	.passthrough();

/**
 * Read-only swarm hygiene snapshot. Composes three queries the
 * orchestrator needs in one structured payload:
 *
 *   1. rescueCandidates — branches with `ahead > 0 && !mergedIntoBase`
 *      whose commits are at risk of being lost. Each carries a
 *      cherry-pick hint and a diff stat.
 *   2. gcEligible — the dry-run plan from `branch_gc` (after the f00075
 *      S0 fix). Lets the orchestrator preview exactly what would be
 *      removed in `branch_gc({ dryRun: false })`.
 *   3. outOfCache — worktrees outside the canonical cache dir.
 *
 * Never mutates the workspace. Never executes cherry-pick. The
 * orchestrator or human reviews `diffStat` + `cherryPickHint` and
 * decides.
 */
export const buildSwarmHygieneRegistration = (
	options: ISwarmHygieneToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_swarm_hygiene`;
	return {
		id: 'swarm_hygiene',
		summary:
			'Read-only snapshot: rescue candidates (ahead + not merged), GC-eligible orphans, and out-of-cache worktrees.',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: SWARM_HYGIENE_OUTPUT_SCHEMA,
					description:
						"Read-only swarm hygiene snapshot. Returns six lists: rescueCandidates (agent/* branches with ahead>0 and not merged into develop — carries cherryPickHint + diffStat), gcEligible (the branch_gc dry-run plan), outOfCache (worktrees outside <cacheDir>/mcp-vertex/.worktrees), pendingIntegration (branches close_slice recorded as finished-but-unintegrated; merged ones self-prune), nonConformingBranches (worktree branches that break the agent/ naming convention — e.g. feat/*, claude/* — and so escape agent-prefixed tooling), staleUnmerged (worktrees whose branch is unmerged AND has fallen far behind base, so pruning would lose work). Use this before merging, before closing a session, or whenever the orchestrator wants to surface the swarm's rescue/cleanup opportunities without firing destructive tools. Never mutates git.",
					inputSchema: z.object({
						baseBranch: z.string().optional(),
						staleMinutes: z.number().int().positive().optional(),
						force: z.boolean().optional(),
					}),
				},
				async (args: {
					baseBranch?: string | undefined;
					staleMinutes?: number | undefined;
					force?: boolean | undefined;
				}) => {
					const pendingStore =
						options.pendingIntegrationPathAbs !== undefined
							? createPendingIntegrationStore(
									options.pendingIntegrationPathAbs,
								)
							: undefined;
					const engineOptions = {
						run:
							options.run ??
							createGitRunner(options.workspaceRoot),
						workspaceRoot: options.workspaceRoot,
						...resolveBaseBranchAndStaleMinutes(args, {
							baseBranch: options.defaultBaseBranch,
							staleMinutes: options.defaultStaleMinutes,
						}),
						...(args.force !== undefined
							? { force: args.force }
							: {}),
						...(options.agentPrefix !== undefined
							? { agentPrefix: options.agentPrefix }
							: {}),
						...(options.staleBehindThreshold !== undefined
							? {
									staleBehindThreshold:
										options.staleBehindThreshold,
								}
							: {}),
						// f00091 S2: surface + self-heal the pending-integration
						// list. Reading + pruning the store is the ONLY write
						// this tool performs — it is registry bookkeeping, never
						// a git mutation.
						...(pendingStore !== undefined
							? {
									readPendingIntegration: () =>
										pendingStore
											.read()
											.then((s) => s.entries),
									pruneIntegrated: (
										branches: ReadonlySet<string>,
									) =>
										pendingStore
											.prune(branches)
											.then(() => {}),
								}
							: {}),
					};
					const result = await runSwarmHygieneEngine(engineOptions);
					return toolJsonWithErrorFlag(result);
				},
			);
		},
	};
};
