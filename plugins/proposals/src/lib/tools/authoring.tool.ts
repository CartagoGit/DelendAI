import { dirname, join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	redactSecrets,
	toolError,
	toolJson,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { createPendingIntegrationStore } from '../shared/pending-integration-store';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import {
	allocateNextProposalId,
	prefixForKind,
} from '../proposals/proposal-id-allocator';
import { PROPOSAL_KIND_BY_PREFIX } from '../contracts/constants/proposal-glossary.constant';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import { escapeRegExp, kebab } from '../shared/string-helpers';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import {
	parseReviewState,
	renderReviewLines,
	reviewTransition,
} from '../swarm/proposal-review';
import { readActiveLocks } from './authoring-options';
import type { IAuthoringToolOptions } from './authoring-options';

export type { IAuthoringToolOptions } from './authoring-options';
export { readActiveLocks } from './authoring-options';

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
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'create_proposal',
	effects: ['write'],
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
						}),
					),
					indexCount: z.number(),
				}),
				description:
					'Create a proposal document with frontmatter, a Goal and a parseable `## Slices` section (one slice per parallelisable, file-disjoint unit). Validates disjointness, writes atomically and re-syncs the index. Returns the file path and any overlap issues.',
				inputSchema: z.object({
					id: z.string().optional(),
					// f00016 S13: when `id` is omitted, `kind` resolves the
					// prefix and the race-safe allocator picks the next
					// number. One of the two is required (checked at runtime
					// — modelling that as an exclusive-or in Zod is more
					// machinery than the one resulting error message saves).
					kind: z
						.enum([
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
						])
						.optional(),
					title: z.string(),
					goal: z.string().optional(),
					status: z
						.enum(['pending', 'ready', 'in_progress'])
						.optional(),
					track: z.string().optional(),
					globalGate: z
						.enum(['lint', 'type', 'e2e', 'none'])
						.optional(),
					slices: z.array(SLICE_IN).optional(),
				}),
			},
			async (args: {
				id?: string | undefined;
				kind?: string | undefined;
				title: string;
				goal?: string | undefined;
				status?: string | undefined;
				track?: string | undefined;
				globalGate?: string | undefined;
				slices?: Array<z.infer<typeof SLICE_IN>> | undefined;
			}) => {
				let id: string;
				if (args.id !== undefined) {
					id = args.id;
					const prefix = id[0] ?? '';
					const inferredKind = PROPOSAL_KIND_BY_PREFIX[prefix];
					if (inferredKind === undefined) {
						return toolError(
							`invalid id prefix "${prefix}"`,
							'ID prefix must correspond to a known proposal kind.',
						);
					}
					if (args.kind !== undefined && args.kind !== inferredKind) {
						return toolError(
							`id prefix "${prefix}" (kind=${inferredKind}) does not match specified kind "${args.kind}"`,
							'Ensure the ID prefix matches the specified kind.',
						);
					}
				} else if (args.kind !== undefined) {
					const prefix = prefixForKind(args.kind);
					if (prefix === null) {
						return toolError(
							`unknown kind "${args.kind}"`,
							'Pass a recognised kind, or pass id explicitly.',
						);
					}
					id = await allocateNextProposalId(prefix, {
						proposalsDirAbs: options.proposalsDirAbs,
						counterPathAbs: options.counterPathAbs,
					});
				} else {
					return toolError(
						'either id or kind is required',
						'Pass an explicit id, or pass kind to auto-allocate the next one (f00016 S13).',
					);
				}
				const slices = args.slices ?? [];
				// Validate disjointness before writing.
				const plan = {
					proposalId: id,
					globalGate: (args.globalGate ?? 'none') as
						| 'lint'
						| 'type'
						| 'e2e'
						| 'none',
					slices: slices.map((s) => ({
						proposalId: id,
						sliceId: s.sliceId,
						title: s.title ?? s.sliceId,
						owner: null,
						files: s.files,
						dependsOn: s.dependsOn ?? [],
						gate: (s.gate ?? 'none') as
							| 'lint'
							| 'type'
							| 'e2e'
							| 'none',
						status: 'pending' as const,
						acceptanceCriteria: s.acceptance ?? [],
					})),
				};
				const issues = planDisjointnessIssues(plan);
				if (issues.length > 0) {
					return toolError(
						`slices share files: ${issues.map((i) => `${i.first}/${i.second}:${i.file}`).join(', ')}`,
						'Make each slice edit a disjoint set of files.',
					);
				}
				const inferredKind =
					args.kind ??
					(PROPOSAL_KIND_BY_PREFIX[id[0] ?? ''] || 'feat');
				const date = new Date().toISOString().slice(0, 10);
				const body = [
					'---',
					`id: ${id}`,
					`kind: ${inferredKind}`,
					`status: ${args.status ?? 'ready'}`,
					'type: proposal',
					`track: ${args.track ?? 'general'}`,
					`date: ${date}`,
					'---',
					'',
					`# ${id} — ${args.title}`,
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
						: [
								'### s1 — TODO',
								'- files: TODO',
								'- gate: none',
								'- status: pending',
							]),
					'',
				].join('\n');
				const fileRel = `${id}-${kebab(args.title)}.md`;
				const absPath = join(options.proposalsDirAbs, fileRel);
				const { text: safeBody, redactions } = redactSecrets(body);
				await writeFileAtomic(absPath, safeBody);
				const sync = await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);
				return toolOk({
					file: fileRel,
					path: absPath,
					disjointnessIssues: issues,
					indexCount: sync.count,
					redactedSecrets: redactions,
				});
			},
		);
	},
});

/**
 * f00091 S2: resolve the current branch and, if it is an `agent/*`
 * branch, return it (else `null`). Read-only (`git rev-parse`); never a
 * git mutation. Any failure degrades to `null` so `close_slice` never
 * throws over a branch-integration detail.
 */
const resolveAgentBranch = async (
	run: IGitRunner,
): Promise<string | null> => {
	const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return null;
	const branch = result.output.trim();
	if (branch.length === 0 || branch === 'HEAD') return null;
	return branch.startsWith(AGENT_BRANCH_PREFIX) ? branch : null;
};

/** f00091 S2: resolve the worktree top-level dir (read-only). */
const resolveWorktreeTopLevel = async (run: IGitRunner): Promise<string> => {
	const result = await run(['rev-parse', '--show-toplevel']);
	return result.ok ? result.output.trim() : '';
};

/**
 * `close_slice` — mark a slice `done` in the proposal doc AND release its
 * agent lock, atomically. Closes the loop crisply so the next agent sees
 * accurate state.
 */
export const buildCloseSliceRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'close_slice',
	effects: ['write'],
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
					// f00091 S2: the branch (if any) recorded for deliberate
					// integration by the non-destructive branch-integration
					// step. `null` when agentWorktree is off, the active
					// branch is not an `agent/*` branch, or the branch could
					// not be resolved — in all those cases nothing is
					// recorded and behaviour is byte-identical to pre-f00091.
					pendingIntegrationBranch: z.string().nullable(),
				}),
				description:
					'Mark a slice as done in its proposal document and release its agent lock atomically, then re-sync. When per-agent worktrees are on and the slice was closed on an agent/* branch, records that branch for deliberate integration (non-destructive: runs no git write). Use it the moment a slice passes its acceptance.',
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
				const index = await readJsonOrNull<{
					proposals: Array<{ id: string; file: string }>;
				}>(options.indexPathAbs);
				if (index === null) {
					return toolError(
						'proposal index not found',
						'Run sync_proposals first.',
					);
				}
				const entry = index.proposals.find(
					(p) =>
						p.id === args.proposalId ||
						p.id.startsWith(`${args.proposalId}-`),
				);
				if (entry === undefined) {
					return toolError(
						`proposal "${args.proposalId}" not in index`,
						'Pass an existing proposalId.',
					);
				}
				const docPath = join(
					options.proposalsDirAbs ?? dirname(options.indexPathAbs),
					entry.file,
				);
				try {
					await withFileMutex(docPath, async () => {
						const md = await readTextOrNull(docPath);
						if (md === null) {
							throw new Error(
								`proposal file missing: ${docPath}`,
							);
						}
						// Flip the slice block's status to done (add or replace).
						const blockRe = new RegExp(
							`(^### ${escapeRegExp(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
							'm',
						);
						const m = md.match(blockRe);
						if (m === null) {
							throw new Error(
								`slice "${args.sliceId}" not found in ${entry.file}`,
							);
						}
						let block = m[2] ?? '';
						block = /^[-*]\s*status:/m.test(block)
							? block.replace(
									/^[-*]\s*status:.*$/m,
									'- status: done',
								)
							: `${block.replace(/\s*$/, '')}\n- status: done\n`;
						const nextContent = md.replace(
							blockRe,
							`${m[1]}${block}`,
						);
						await writeFileAtomic(docPath, nextContent);
					});
				} catch (err: any) {
					return toolError(
						err.message,
						'Call proposal_board to list slices.',
					);
				}

				// f00091 S2: non-destructive branch-integration step. When
				// per-agent worktrees are on and the slice was closed on an
				// `agent/*` branch, record that branch for deliberate
				// integration. This runs BEFORE releasing the lock so the
				// finished-branch fact is captured while the agent is still
				// the owner. It performs NO git write — it only *reads* the
				// current branch (via `git rev-parse`) and writes a registry
				// entry. When the gate is off it is a no-op (byte-identical).
				let pendingIntegrationBranch: string | null = null;
				if (
					options.agentWorktreeEnabled === true &&
					options.pendingIntegrationPathAbs !== undefined &&
					options.run !== undefined
				) {
					const branch = await resolveAgentBranch(options.run);
					if (branch !== null) {
						const worktreePath = await resolveWorktreeTopLevel(
							options.run,
						);
						await createPendingIntegrationStore(
							options.pendingIntegrationPathAbs,
						).record({
							branch,
							worktreePath,
							sliceId: args.sliceId,
							proposalId: entry.id,
							recordedAt: new Date().toISOString(),
						});
						pendingIntegrationBranch = branch;
					}
				}

				let lockReleased = false;
				if (args.releaseLock !== false) {
					await runAgentLockEngine(
						{ action: 'release', task_id: args.sliceId },
						{
							lockPath: options.lockPathAbs,
							toolName: `${options.namespacePrefix}_agent_lock`,
						},
					);
					lockReleased = true;
				}
				await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					closed: true,
					lockReleased,
					pendingIntegrationBranch,
				});
			},
		);
	},
});

/**
 * `proposal_review` — peer-review loop for a slice. An implementer
 * `submit`s a finished slice for review (it is NOT done yet); a DIFFERENT
 * agent `approve`s it (→ done + lock released) or `request_changes` with an
 * objection (→ reworkable, lock released). The fixer re-`submit`s and another
 * agent reviews the fix — the loop repeats until a reviewer has no objection.
 * `status` reads the current review state without changing it.
 */
export const buildReviewRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'proposal_review',
	effects: ['write'],
	summary:
		'Peer-review a slice: submit for review, approve, or request changes — until a reviewer has no objection.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_review`,
			{
				description:
					'Peer-review loop for a slice. action=submit: an implementer marks a finished slice ready for review (not done yet). action=approve: a DIFFERENT agent verifies and approves it → slice is set done + lock released. action=request_changes (note required): a different agent records an objection → slice becomes reworkable + lock released; the fixer re-submits and another agent reviews the fix. action=status: read current state. Enforces reviewer ≠ implementer (independent verification).',
				inputSchema: z.object({
					proposalId: z.string(),
					sliceId: z.string(),
					action: z.enum([
						'submit',
						'approve',
						'request_changes',
						'status',
					]),
					agent: z.string().min(1),
					note: z.string().optional(),
				}),
				outputSchema: z.object({
					ok: z.literal(true),
					proposalId: z.string(),
					sliceId: z.string(),
					action: z.string(),
					status: z.enum([
						'none',
						'in_review',
						'changes_requested',
						'done',
					]),
					implementer: z.string().nullable(),
					reviewer: z.string().nullable(),
					rounds: z.array(
						z.object({
							verdict: z.enum(['requested_changes', 'approved']),
							agent: z.string(),
							note: z.string(),
						}),
					),
					lockReleased: z.boolean(),
					redactedSecrets: z.number().int().nonnegative(),
				}),
			},
			async (args: {
				proposalId: string;
				sliceId: string;
				action: 'submit' | 'approve' | 'request_changes' | 'status';
				agent: string;
				note?: string | undefined;
			}) => {
				const index = await readJsonOrNull<{
					proposals: Array<{ id: string; file: string }>;
				}>(options.indexPathAbs);
				if (index === null) {
					return toolError(
						'proposal index not found',
						'Run sync_proposals first.',
					);
				}
				const entry = index.proposals.find(
					(p) =>
						p.id === args.proposalId ||
						p.id.startsWith(`${args.proposalId}-`),
				);
				if (entry === undefined) {
					return toolError(
						`proposal "${args.proposalId}" not in index`,
						'Pass an existing proposalId.',
					);
				}
				const docPath = join(
					options.proposalsDirAbs ?? dirname(options.indexPathAbs),
					entry.file,
				);
				// x00055 S2: redact the reviewer note...
				const redactedNote = args.note
					? redactSecrets(args.note)
					: { text: '', redactions: 0 };

				if (args.action === 'status') {
					const md = await readTextOrNull(docPath);
					if (md === null)
						return toolError(`proposal file missing: ${docPath}`);
					const blockRe = new RegExp(
						`(^### ${escapeRegExp(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
						'm',
					);
					const m = md.match(blockRe);
					if (m === null) {
						return toolError(
							`slice "${args.sliceId}" not found in ${entry.file}`,
							'Call proposal_board to list slices.',
						);
					}
					const body = m[2] ?? '';
					const state = parseReviewState(body);
					return toolOk({
						proposalId: entry.id,
						sliceId: args.sliceId,
						action: 'status',
						status: state.status,
						implementer: state.implementer,
						reviewer: state.reviewer,
						rounds: state.rounds,
						lockReleased: false,
						redactedSecrets: 0,
					});
				}

				let nextStatus!:
					| 'none'
					| 'in_review'
					| 'changes_requested'
					| 'done';
				let nextImplementer!: string | null;
				let nextReviewer!: string | null;
				let nextRounds!: readonly any[];

				try {
					await withFileMutex(docPath, async () => {
						const md = await readTextOrNull(docPath);
						if (md === null)
							throw new Error(
								`proposal file missing: ${docPath}`,
							);

						const blockRe = new RegExp(
							`(^### ${escapeRegExp(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
							'm',
						);
						const m = md.match(blockRe);
						if (m === null) {
							throw new Error(
								`slice "${args.sliceId}" not found in ${entry.file}`,
							);
						}
						const body = m[2] ?? '';
						const state = parseReviewState(body);

						const result = reviewTransition(
							state,
							args.action as any,
							args.agent,
							redactedNote.text,
						);
						if (!result.ok || result.next === undefined) {
							throw new Error(
								result.reason ?? 'invalid review transition',
							);
						}
						const next = result.next;
						nextStatus = next.status;
						nextImplementer = next.implementer;
						nextReviewer = next.reviewer;
						nextRounds = next.rounds;

						// Rewrite the slice block: replace the review lines, and on approval
						// also flip `- status: done`.
						let block = body.replace(
							/^[-*]\s*review-(?:state|implementer|reviewer|log):.*$\n?/gm,
							'',
						);
						block = `${block.replace(/\s*$/, '')}\n${renderReviewLines(next).join('\n')}\n`;
						if (next.status === 'done') {
							block = /^[-*]\s*status:/m.test(block)
								? block.replace(
										/^[-*]\s*status:.*$/m,
										'- status: done',
									)
								: `${block.replace(/\s*$/, '')}\n- status: done\n`;
						}
						const updated = md.replace(blockRe, `${m[1]}${block}`);
						await writeFileAtomic(docPath, updated);
					});
				} catch (err: any) {
					return toolError(
						err.message,
						'Call proposal_board to list slices.',
					);
				}

				// approve/request_changes free the slice (done, or reworkable).
				let lockReleased = false;
				if (
					nextStatus === 'done' ||
					nextStatus === 'changes_requested'
				) {
					await runAgentLockEngine(
						{ action: 'release', task_id: args.sliceId },
						{
							lockPath: options.lockPathAbs,
							toolName: `${options.namespacePrefix}_agent_lock`,
						},
					);
					lockReleased = true;
				}
				await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					action: args.action,
					status: nextStatus,
					implementer: nextImplementer,
					reviewer: nextReviewer,
					rounds: nextRounds as any,
					lockReleased,
					redactedSecrets: redactedNote.redactions,
				});
			},
		);
	},
});

/**
 * `proposal_board` — orchestrator overview: each actionable proposal with
 * its slices (status + owner) and which are claimable now. One low-token
 * call to plan multi-agent work.
 */
export const buildProposalBoardRegistration = (
	options: IAuthoringToolOptions,
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
								}),
							),
							claimableSliceIds: z.array(z.string()).optional(),
						}),
					),
				}),
				description:
					'Returns each actionable proposal with its slices (status, owner) and the slices claimable right now. Read-only; the orchestrator board for planning multi-agent work.',
			},
			async () => {
				const index = await readJsonOrNull<{
					proposals: Array<{
						id: string;
						file: string;
						status: string;
					}>;
				}>(options.indexPathAbs);
				if (index === null) {
					return toolJson({ proposals: [] });
				}
				const locks = await readActiveLocks(options.lockPathAbs);
				const actionable = index.proposals.filter((p) =>
					['pending', 'ready', 'in_progress'].includes(p.status),
				);
				const board = await Promise.all(
					actionable.map(async (p) => {
						const docPath = join(
							options.proposalsDirAbs ??
								dirname(options.indexPathAbs),
							p.file,
						);
						const md = (await readTextOrNull(docPath)) ?? '';
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
								.filter(
									(s) => validateClaim(plan, s.sliceId).ok,
								)
								.map((s) => s.sliceId),
						};
					}),
				);
				return toolJson({ proposals: board });
			},
		);
	},
});
