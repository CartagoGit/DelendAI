import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { runAgentWorktreeEngine } from '../agents/agent-worktree-engine';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import {
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import type {
	IProposalSliceContract,
	IProposalSlicePlan,
	ISliceGate,
} from '../swarm/proposal-slice-plan';
import { runAgentNames } from './agent-names.tool';
import type { IAgentNamesToolOptions } from './agent-names.tool';

const GATES: readonly ISliceGate[] = ['lint', 'type', 'e2e', 'none'];
const asGate = (value: string | undefined): ISliceGate =>
	GATES.includes((value ?? '') as ISliceGate)
		? ((value ?? 'none') as ISliceGate)
		: 'none';

const SLICE_INPUT = z.object({
	sliceId: z.string(),
	files: z.array(z.string()),
	title: z.string().optional(),
	gate: z.string().optional(),
	dependsOn: z.array(z.string()).optional(),
	acceptanceCriteria: z.array(z.string()).optional(),
});

/**
 * `plan` — turn a proposed set of slices into a validated parallel plan:
 * checks file disjointness and which slices are claimable now. Pure over
 * the (tested) slice-plan engine; the orchestration primitive for
 * splitting work across agents without them stepping on each other.
 */
export const buildPlanRegistration = (
	namespacePrefix: string,
): IToolRegistration => ({
	id: 'plan',
	summary:
		'Validate a set of work slices: file disjointness + which are claimable now (parallel plan).',
	tags: ['orchestration'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_plan`,
			{
				outputSchema: z.object({
					plan: z.unknown(),
					disjointnessIssues: z.array(z.unknown()),
					claimableSliceIds: z.array(z.string()),
				}),
				description:
					'Turn proposed slices into a validated parallel plan: reports file-overlap (disjointness) issues and which slices are claimable now. Read-only. Use before delegating work to multiple agents.',
				inputSchema: z.object({
					proposalId: z.string().optional(),
					globalGate: z.string().optional(),
					slices: z.array(SLICE_INPUT),
				}),
			},
			async (args: {
				proposalId?: string | undefined;
				globalGate?: string | undefined;
				slices: Array<z.infer<typeof SLICE_INPUT>>;
			}) => {
				const slices: IProposalSliceContract[] = args.slices.map(
					(slice) => ({
						proposalId: args.proposalId ?? 'adhoc',
						sliceId: slice.sliceId,
						title: slice.title ?? slice.sliceId,
						owner: null,
						files: slice.files,
						dependsOn: slice.dependsOn ?? [],
						gate: asGate(slice.gate),
						status: 'pending',
						acceptanceCriteria: slice.acceptanceCriteria ?? [],
					}),
				);
				const plan: IProposalSlicePlan = {
					proposalId: args.proposalId ?? 'adhoc',
					slices,
					globalGate: asGate(args.globalGate),
				};
				return toolJson({
					plan,
					disjointnessIssues: planDisjointnessIssues(plan),
					claimableSliceIds: slices
						.filter(
							(slice) => validateClaim(plan, slice.sliceId).ok,
						)
						.map((slice) => slice.sliceId),
				});
			},
		);
	},
});

export interface IDelegateToolOptions {
	readonly namespacePrefix: string;
	readonly agentNames: IAgentNamesToolOptions;
	readonly lockPathAbs: string;
	/**
	 * x00051: when present and `enabled`, `delegate` creates a per-agent
	 * `git worktree` + branch (`agent/<assigned-name>`) before claiming
	 * the file lock — so a subagent spawned through delegation never
	 * inherits the orchestrator's branch. Back-compat: omitted or
	 * `enabled: false` ⇒ behaviour unchanged (no worktree step).
	 *
	 * The host gate (`agentWorktreeEnabled`) lives in `ctx`; the
	 * registrations in `plugins/proposals/src/index.ts` only forward
	 * this option when the gate is on, so the tool itself does not
	 * double-check the gate.
	 */
	readonly worktree?: {
		readonly enabled: boolean;
		readonly workspaceRoot: string;
		/** Override the git runner (tests); defaults to the real `git` binary. */
		readonly run?: IGitRunner;
	};
}

const DELEGATE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	stage: z.enum(['assign', 'worktree', 'lock']).optional(),
	detail: z.record(z.string(), z.unknown()).optional(),
	agent: z.string().optional(),
	reason: z.string().optional(),
	taskId: z.string().optional(),
	slot: z.string().optional(),
	files: z.array(z.string()).optional(),
	locked: z.boolean().optional(),
	worktree: z
		.object({
			path: z.string(),
			branch: z.string(),
			created: z.boolean(),
		})
		.optional(),
	instruction: z.string().optional(),
});

/**
 * `delegate` — hand a slice to a subagent organically: assign it a
 * symbolic name (agent registry) and claim its files (agent lock) in one
 * call, returning a compact handoff packet. Composes the tested
 * registry + lock engines.
 */
export const buildDelegateRegistration = (
	options: IDelegateToolOptions,
): IToolRegistration => ({
	id: 'delegate',
	effects: ['write'],
	summary:
		'Hand a slice to a subagent: assign a name + claim its files, returning a handoff packet.',
	tags: ['orchestration', 'coordination'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_delegate`,
			{
				outputSchema: DELEGATE_OUTPUT_SCHEMA,
				description:
					'Delegate a slice to a subagent: assigns it a symbolic name (agent registry) and claims its files (agent lock) atomically, returning the handoff packet {agent, taskId, files, locked, instruction}. If the files are already locked it reports the conflict instead of claiming.',
				inputSchema: z.object({
					taskId: z.string(),
					slot: z.string(),
					files: z.array(z.string()),
					topic: z.string().optional(),
					agentName: z.string().optional(),
					parentTaskId: z.string().optional(),
				}),
			},
			async (args: {
				taskId: string;
				slot: string;
				files: string[];
				topic?: string | undefined;
				agentName?: string | undefined;
				parentTaskId?: string | undefined;
			}) => {
				const assignResult = await runAgentNames(
					{
						action: 'assign',
						task_id: args.taskId,
						agent_slot: args.slot,
						...(args.agentName ? { agent: args.agentName } : {}),
						...(args.topic ? { topic: args.topic } : {}),
						...(args.parentTaskId
							? { parent_task_id: args.parentTaskId }
							: {}),
					},
					options.agentNames,
				);
				const assigned = JSON.parse(
					assignResult.content[0]?.text ?? '{}',
				) as { agent_name?: string; blocked?: boolean; error?: string };
				if (assigned.agent_name === undefined) {
					return toolJson({
						ok: false,
						stage: 'assign',
						detail: assigned,
					});
				}
				// x00051 S1: when the host has enabled the worktree gate,
				// create the per-agent worktree + branch BEFORE claiming
				// the file lock. Failure here is a hard prerequisite —
				// the lock must not be claimed against a branch that
				// does not exist yet.
				let worktreeInfo:
					| { path: string; branch: string; created: boolean }
					| undefined;
				if (options.worktree?.enabled === true) {
					const run =
						options.worktree.run ??
						createGitRunner(options.worktree.workspaceRoot);
					const wt = await runAgentWorktreeEngine(
						{
							action: 'create',
							agent: assigned.agent_name,
						},
						{
							run,
							workspaceRoot: options.worktree.workspaceRoot,
						},
					);
					if (!wt.ok) {
						return toolJson({
							ok: false,
							stage: 'worktree',
							agent: assigned.agent_name,
							reason:
								wt.reason ??
								'agent_worktree create failed; lock not claimed',
							detail: wt,
						});
					}
					if (wt.action === 'create') {
						worktreeInfo = {
							path: wt.path,
							branch: wt.branch,
							created: wt.created,
						};
					}
				}
				const lockResult = await runAgentLockEngine(
					{
						action: 'claim',
						task_id: args.taskId,
						agent: assigned.agent_name,
						files: args.files,
					},
					{
						lockPath: options.lockPathAbs,
						toolName: `${options.namespacePrefix}_agent_lock`,
					},
				);
				const lock = JSON.parse(
					lockResult.content[0]?.text ?? '{}',
				) as {
					blocked?: boolean;
				};
				if (lock.blocked === true) {
					return toolJson({
						ok: false,
						stage: 'lock',
						agent: assigned.agent_name,
						reason: 'files already locked by a live task',
						detail: lock,
					});
				}
				const whereClause = worktreeInfo
					? `Edit files in \`${worktreeInfo.path}\` (branch \`${worktreeInfo.branch}\`); commit there. `
					: '';
				return toolJson({
					ok: true,
					agent: assigned.agent_name,
					taskId: args.taskId,
					slot: args.slot,
					files: args.files,
					locked: true,
					...(worktreeInfo ? { worktree: worktreeInfo } : {}),
					instruction: `You are "${assigned.agent_name}". ${whereClause}Edit ONLY ${args.files.join(', ')}; release the lock (agent_lock release, task_id "${args.taskId}") when done.`,
				});
			},
		);
	},
});
