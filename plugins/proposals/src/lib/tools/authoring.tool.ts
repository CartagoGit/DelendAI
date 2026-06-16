import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolError, toolJson, toolOk, writeFileAtomic } from '@cartago-git/mcp-core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';

export interface IAuthoringToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** Absolute proposals dir + index + lock. */
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly lockPathAbs: string;
	/**
	 * Workspace-relative layout (proposals dir + index) the post-create
	 * sync uses, so a relocated store stays coherent. Defaults to
	 * `DEFAULT_PATH_LAYOUT` inside the engine when omitted.
	 */
	readonly layout?: Pick<IHostPathLayout, 'proposalsDir' | 'proposalIndexFile'>;
	/**
	 * Host-specific proposal subfolders (relative to proposalsDir) the
	 * post-mutation sync should also scan, e.g. `['paused/demos']`. [M5]
	 */
	readonly extraFolders?: readonly string[];
}

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const readActiveLocks = (lockPath: string): readonly ILockSnapshotEntry[] => {
	if (!existsSync(lockPath)) return [];
	try {
		const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
			in_flight?: Array<{ task_id?: string; agent?: string }>;
		};
		return (lock.in_flight ?? [])
			.filter((e) => typeof e.task_id === 'string')
			.map((e) => ({ taskId: e.task_id ?? '', agent: e.agent ?? 'unknown' }));
	} catch {
		return [];
	}
};

const SLICE_IN = z.object({
	sliceId: z.string(),
	title: z.string().optional(),
	files: z.array(z.string()),
	gate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	dependsOn: z.array(z.string()).optional(),
	acceptance: z.array(z.string()).optional(),
});

const renderSlice = (s: z.infer<typeof SLICE_IN>): string => {
	const lines = [`### ${s.sliceId} — ${s.title ?? s.sliceId}`];
	for (const f of s.files) lines.push(`- files: ${f}`);
	if (s.dependsOn && s.dependsOn.length > 0) {
		lines.push(`- depends_on: [${s.dependsOn.join(', ')}]`);
	}
	lines.push(`- gate: ${s.gate ?? 'none'}`);
	if (s.acceptance && s.acceptance.length > 0) {
		lines.push('- acceptance:');
		for (const a of s.acceptance) lines.push(`  - "${a}"`);
	}
	lines.push('- status: pending');
	return lines.join('\n');
};

/**
 * `create_proposal` — author a proposal markdown (frontmatter + Goal +
 * a parseable `## Slices` section) so multi-agent slice work is correct
 * by construction. Validates file disjointness, writes atomically and
 * re-syncs the index. No more hand-editing fragile markdown.
 */
export const buildCreateProposalRegistration = (
	options: IAuthoringToolOptions
): IToolRegistration => ({
	id: 'create_proposal',
	summary:
		'Author a proposal (.md with frontmatter + disjoint ## Slices), validate overlap, write + sync index.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_create_proposal`,
			{
						outputSchema: z.object({
					ok: z.literal(true),
					file: z.string(),
					path: z.string(),
					disjointnessIssues: z.array(
						z.object({
							first: z.string(),
							second: z.string(),
							file: z.string(),
						})
					),
					indexCount: z.number(),
				}),
				description:
					'Create a proposal document with frontmatter, a Goal and a parseable `## Slices` section (one slice per parallelisable, file-disjoint unit). Validates disjointness, writes atomically and re-syncs the index. Returns the file path and any overlap issues.',
				inputSchema: z.object({
					id: z.string(),
					title: z.string(),
					goal: z.string().optional(),
					status: z
						.enum(['pending', 'ready', 'in_progress'])
						.optional(),
					track: z.string().optional(),
					globalGate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
					slices: z.array(SLICE_IN).optional(),
				}),
			},
			async (args: {
				id: string;
				title: string;
				goal?: string | undefined;
				status?: string | undefined;
				track?: string | undefined;
				globalGate?: string | undefined;
				slices?: Array<z.infer<typeof SLICE_IN>> | undefined;
			}) => {
				const slices = args.slices ?? [];
				// Validate disjointness before writing.
				const plan = {
					proposalId: args.id,
					globalGate: (args.globalGate ?? 'none') as
						| 'lint'
						| 'type'
						| 'e2e'
						| 'none',
					slices: slices.map((s) => ({
						proposalId: args.id,
						sliceId: s.sliceId,
						title: s.title ?? s.sliceId,
						owner: null,
						files: s.files,
						dependsOn: s.dependsOn ?? [],
						gate: (s.gate ?? 'none') as 'lint' | 'type' | 'e2e' | 'none',
						status: 'pending' as const,
						acceptanceCriteria: s.acceptance ?? [],
					})),
				};
				const issues = planDisjointnessIssues(plan);
				if (issues.length > 0) {
					return toolError(
						`slices share files: ${issues.map((i) => `${i.first}/${i.second}:${i.file}`).join(', ')}`,
						'Make each slice edit a disjoint set of files.'
					);
				}
				const date = new Date().toISOString().slice(0, 10);
				const body = [
					'---',
					`id: ${args.id}`,
					`status: ${args.status ?? 'ready'}`,
					'type: proposal',
					`track: ${args.track ?? 'general'}`,
					`date: ${date}`,
					'---',
					'',
					`# ${args.id} — ${args.title}`,
					'',
					'## Goal',
					'',
					args.goal ?? 'TODO: describe the goal.',
					'',
					'## Slices',
					'',
					`- global_gate: ${args.globalGate ?? 'none'}`,
					'',
					...(slices.length > 0
						? slices.map(renderSlice).join('\n\n').split('\n')
						: ['### s1 — TODO', '- files: TODO', '- gate: none', '- status: pending']),
					'',
				].join('\n');
				const fileRel = `${args.id}-${kebab(args.title)}.md`;
				const absPath = join(options.proposalsDirAbs, fileRel);
				await writeFileAtomic(absPath, body);
				const sync = await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? []
				);
				return toolOk({
					file: fileRel,
					path: absPath,
					disjointnessIssues: issues,
					indexCount: sync.count,
				});
			}
		);
	},
});

/**
 * `close_slice` — mark a slice `done` in the proposal doc AND release its
 * agent lock, atomically. Closes the loop crisply so the next agent sees
 * accurate state.
 */
export const buildCloseSliceRegistration = (
	options: IAuthoringToolOptions
): IToolRegistration => ({
	id: 'close_slice',
	summary:
		'Mark a slice done in its proposal + release its agent lock, then re-sync.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_close_slice`,
			{
						outputSchema: z.object({
					ok: z.literal(true),
					proposalId: z.string(),
					sliceId: z.string(),
					closed: z.boolean(),
					lockReleased: z.boolean(),
				}),
				description:
					'Mark a slice as done in its proposal document and release its agent lock atomically, then re-sync. Use it the moment a slice passes its acceptance.',
				inputSchema: z.object({
					proposalId: z.string(),
					sliceId: z.string(),
					releaseLock: z.boolean().optional(),
				}),
			},
			async (args: {
				proposalId: string;
				sliceId: string;
				releaseLock?: boolean | undefined;
			}) => {
				if (!existsSync(options.indexPathAbs)) {
					return toolError(
						'proposal index not found',
						'Run sync_proposals first.'
					);
				}
				const index = JSON.parse(
					readFileSync(options.indexPathAbs, 'utf8')
				) as { proposals: Array<{ id: string; file: string }> };
				const entry = index.proposals.find(
					(p) =>
						p.id === args.proposalId ||
						p.id.startsWith(`${args.proposalId}-`)
				);
				if (entry === undefined) {
					return toolError(
						`proposal "${args.proposalId}" not in index`,
						'Pass an existing proposalId.'
					);
				}
				const docPath = join(dirname(options.indexPathAbs), entry.file);
				if (!existsSync(docPath)) {
					return toolError(`proposal file missing: ${docPath}`);
				}
				const md = readFileSync(docPath, 'utf8');
				// Flip the slice block's status to done (add or replace).
				const blockRe = new RegExp(
					`(^### ${args.sliceId}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |\\n*$(?![\\s\\S]))`,
					'm'
				);
				const m = md.match(blockRe);
				if (m === null) {
					return toolError(
						`slice "${args.sliceId}" not found in ${entry.file}`,
						'Call proposal_board to list slices.'
					);
				}
				let block = m[2] ?? '';
				block = /^[-*]\s*status:/m.test(block)
					? block.replace(/^[-*]\s*status:.*$/m, '- status: done')
					: `${block.replace(/\s*$/, '')}\n- status: done\n`;
				const next = md.replace(blockRe, `${m[1]}${block}`);
				await writeFileAtomic(docPath, next);

				let lockReleased = false;
				if (args.releaseLock !== false) {
					await runAgentLockEngine(
						{ action: 'release', task_id: args.sliceId },
						{
							lockPath: options.lockPathAbs,
							toolName: `${options.namespacePrefix}_agent_lock`,
						}
					);
					lockReleased = true;
				}
				await syncProposalRegistry(
						options.workspaceRoot,
						options.layout,
						options.extraFolders ?? []
					);
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					closed: true,
					lockReleased,
				});
			}
		);
	},
});

/**
 * `proposal_board` — orchestrator overview: each actionable proposal with
 * its slices (status + owner) and which are claimable now. One low-token
 * call to plan multi-agent work.
 */
export const buildProposalBoardRegistration = (
	options: IAuthoringToolOptions
): IToolRegistration => ({
	id: 'proposal_board',
	summary:
		'Orchestrator view: actionable proposals × slices (status/owner) + claimable now.',
	tags: ['proposals', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_board`,
			{
						outputSchema: z.object({
					proposals: z.array(
						z.object({
							id: z.string(),
							status: z.string(),
							slices: z.array(
								z.object({
									sliceId: z.string(),
									status: z.string(),
									owner: z.string().nullable(),
								})
							),
							claimableSliceIds: z.array(z.string()).optional(),
						})
					),
				}),
				description:
					'Returns each actionable proposal with its slices (status, owner) and the slices claimable right now. Read-only; the orchestrator board for planning multi-agent work.',
			},
			async () => {
				if (!existsSync(options.indexPathAbs)) {
					return toolJson({ proposals: [] });
				}
				const index = JSON.parse(
					readFileSync(options.indexPathAbs, 'utf8')
				) as {
					proposals: Array<{ id: string; file: string; status: string }>;
				};
				const locks = readActiveLocks(options.lockPathAbs);
				const actionable = index.proposals.filter((p) =>
					['pending', 'ready', 'in_progress'].includes(p.status)
				);
				const board = actionable.map((p) => {
					const docPath = join(
						dirname(options.indexPathAbs),
						p.file
					);
					const md = existsSync(docPath)
						? readFileSync(docPath, 'utf8')
						: '';
					const parsed = parseProposalSlicePlan(p.id, md);
					if (parsed === null) {
						return { id: p.id, status: p.status, slices: [] };
					}
					const plan = deriveSliceStatuses(parsed, locks);
					return {
						id: p.id,
						status: p.status,
						slices: plan.slices.map((s) => ({
							sliceId: s.sliceId,
							status: s.status,
							owner: s.owner,
						})),
						claimableSliceIds: plan.slices
							.filter((s) => validateClaim(plan, s.sliceId).ok)
							.map((s) => s.sliceId),
					};
				});
				return toolJson({ proposals: board });
			}
		);
	},
});
