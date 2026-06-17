import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';

export interface IContinueProposalToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the proposal index (index.json). */
	readonly indexPathAbs: string;
	/** Absolute path of the agent lock file. */
	readonly lockPathAbs: string;
	/** Family prefixes in cascade order (default `['f', 'p']`). */
	readonly familyCascade?: readonly string[];
}

export interface IContinueProposalArgs {
	readonly proposalId?: string | undefined;
	/** `auto` (serial next) | `plan` (slice plan) | `claim` (claim a slice). */
	readonly mode?: 'auto' | 'plan' | 'claim' | undefined;
	readonly sliceId?: string | undefined;
	readonly agentName?: string | undefined;
}

type IResult = { content: Array<{ type: 'text'; text: string }> };

const json = (value: unknown): IResult => ({
	content: [{ type: 'text', text: JSON.stringify(value) }],
});

const ACTIONABLE = new Set(['pending', 'ready', 'in_progress']);

interface IIndexEntry {
	readonly id: string;
	readonly file: string;
	readonly status: string;
}

// Async file helpers (H2): a missing/corrupt file resolves to null, matching
// the old existsSync-guarded sync reads — never blocks the event loop.
const readJsonOrNull = async <T>(path: string): Promise<T | null> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch {
		return null;
	}
};
const readTextOrNull = async (path: string): Promise<string | null> => {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
};

const readIndex = async (indexPath: string): Promise<readonly IIndexEntry[]> => {
	const parsed = await readJsonOrNull<{ proposals?: IIndexEntry[] }>(indexPath);
	return parsed?.proposals ?? [];
};

const familyOf = (id: string): string => id.match(/^[a-z]+/i)?.[0] ?? '';

const readActiveLocks = async (
	lockPath: string
): Promise<readonly ILockSnapshotEntry[]> => {
	const lock = await readJsonOrNull<{
		in_flight?: Array<{ task_id?: string; agent?: string }>;
	}>(lockPath);
	if (lock === null) return [];
	return (lock.in_flight ?? [])
		.filter((entry) => typeof entry.task_id === 'string')
		.map((entry) => ({
			taskId: entry.task_id ?? '',
			agent: entry.agent ?? 'unknown',
		}));
};

const resolveDoc = async (
	indexPath: string,
	proposalId: string
): Promise<
	{ id: string; markdown: string } | { error: string; nextAction: string }
> => {
	const entries = await readIndex(indexPath);
	if (entries.length === 0)
		return {
			error: `proposal index not found or empty at ${indexPath}`,
			nextAction: 'Run sync_proposals and retry.',
		};
	const entry = entries.find(
		(candidate) =>
			candidate.id === proposalId ||
			candidate.id.startsWith(`${proposalId}-`)
	);
	if (entry === undefined)
		return {
			error: `proposal "${proposalId}" not found in the index`,
			nextAction: 'Pass an existing proposalId.',
		};
	const docPath = join(dirname(indexPath), entry.file);
	const md = await readTextOrNull(docPath);
	if (md === null)
		return {
			error: `proposal file missing on disk: ${docPath}`,
			nextAction: 'Run sync_proposals to reconcile the index.',
		};
	return { id: entry.id, markdown: md };
};

/**
 * Resolve the next proposal to work on. `mode: "auto"` (default) reads
 * the index and returns the next actionable proposal by family cascade
 * (`f` before `p` by default). `mode: "plan"` returns the parsed
 * `## Slices` plan with claimable slices; `mode: "claim"` claims one
 * slice via the agent lock (the lock IS the claim primitive). Pure
 * over the injected index/lock paths.
 */
export const runContinueProposal = async (
	args: IContinueProposalArgs,
	options: IContinueProposalToolOptions
): Promise<IResult> => {
	const cascade = options.familyCascade ?? ['f', 'p'];

	if (args.mode === 'plan' || args.mode === 'claim') {
		if (!args.proposalId)
			return json({
				kind: 'slice-mode-error',
				reason: 'slice modes require an explicit proposalId',
				nextAction: 'Call mode:"plan" with a proposalId.',
			});
		const doc = await resolveDoc(options.indexPathAbs, args.proposalId);
		if ('error' in doc)
			return json({ kind: 'slice-mode-error', ...doc });
		const parsed = parseProposalSlicePlan(doc.id, doc.markdown);
		if (parsed === null)
			return json({
				kind: 'slice-mode-error',
				reason: `proposal "${doc.id}" has no ## Slices section`,
				nextAction:
					'Use mode:"auto" for serial work, or add a ## Slices section to parallelise it.',
			});
		const plan = deriveSliceStatuses(
			parsed,
			await readActiveLocks(options.lockPathAbs)
		);
		const relaunchCommand = `${options.namespacePrefix}_continue_proposal { proposalId: "${doc.id}", mode: "plan" }`;

		if (args.mode === 'plan')
			return json({
				kind: 'slice-plan',
				proposalId: doc.id,
				plan,
				disjointnessIssues: planDisjointnessIssues(plan),
				claimableSliceIds: plan.slices
					.filter((slice) => validateClaim(plan, slice.sliceId).ok)
					.map((slice) => slice.sliceId),
			});

		// mode === 'claim'
		if (!args.sliceId)
			return json({
				kind: 'slice-mode-error',
				reason: 'mode:"claim" requires sliceId',
				nextAction: 'Call mode:"plan" first and pick a claimable slice.',
			});
		const validation = validateClaim(plan, args.sliceId);
		const slice = plan.slices.find((s) => s.sliceId === args.sliceId) ?? null;
		if (!validation.ok || slice === null)
			return json({
				kind: 'slice-claim-rejected',
				proposalId: doc.id,
				sliceId: args.sliceId,
				validation,
				slice,
				relaunchCommand,
			});
		const agent = args.agentName ?? 'implementation_runner';
		const lockResult = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: args.sliceId,
				agent,
				files: [...slice.files],
			},
			{
				lockPath: options.lockPathAbs,
				toolName: `${options.namespacePrefix}_agent_lock`,
			}
		);
		const lockPayload = JSON.parse(
			lockResult.content[0]?.text ?? '{}'
		) as { blocked?: boolean };
		if (lockPayload.blocked === true)
			return json({
				kind: 'slice-claim-rejected',
				proposalId: doc.id,
				sliceId: args.sliceId,
				validation: {
					ok: false,
					blockerType: 'overlap-in-progress',
					reason: 'agent lock rejected the claim (file overlap with a live task)',
				},
				slice,
				relaunchCommand,
			});
		return json({
			kind: 'slice-claim',
			proposalId: doc.id,
			sliceId: args.sliceId,
			slice: { ...slice, status: 'in-progress', owner: agent },
			executionGuide: {
				files: slice.files,
				acceptanceCriteria: slice.acceptanceCriteria,
				gate: slice.gate,
				rules: [
					'Edit ONLY the files of this slice (disjointness is the contract).',
					'Run the slice acceptance, then flip `- status: done` in the ## Slices section.',
					'Release the lock (agent_lock release) when the slice closes.',
				],
			},
			relaunchCommand,
		});
	}

	// mode === 'auto' (serial): next actionable proposal by cascade.
	const entries = await readIndex(options.indexPathAbs);
	const actionable = entries.filter((entry) => ACTIONABLE.has(entry.status));
	if (actionable.length === 0)
		return json({
			kind: 'no-proposal',
			reason: 'no actionable proposal in the index',
			nextAction:
				'Create a proposal under the proposals dir and run sync_proposals.',
		});
	// Anti-loop [N9]: an `in_progress` proposal already covered by an active
	// lock is being worked by someone. Selecting it again only produces a
	// claim→lock-conflict→auto_work→same-proposal mini-loop, so exclude it
	// from the primary pick. `proposalIdOf` maps a lock's task_id (e.g.
	// `p81-slice-2`) back to its proposal base id (`p81`).
	const proposalIdOf = (value: string): string =>
		value.match(/^([a-z]+\d+[a-z]?)/i)?.[1] ?? value;
	const lockedProposalIds = new Set(
		(await readActiveLocks(options.lockPathAbs)).map((lock) =>
			proposalIdOf(lock.taskId)
		)
	);
	const isClaimedElsewhere = (entry: IIndexEntry): boolean =>
		entry.status === 'in_progress' &&
		lockedProposalIds.has(proposalIdOf(entry.id));
	const free = actionable.filter((entry) => !isClaimedElsewhere(entry));
	if (free.length === 0)
		return json({
			kind: 'all-claimed',
			reason:
				'every actionable proposal is in_progress under an active lock (being worked elsewhere)',
			nextAction:
				'Do NOT retry auto mode in a loop. Either pick a disjoint slice with mode:"plan"/"claim", or stop and report that all work is claimed.',
		});
	const rank = (id: string): number => {
		const index = cascade.indexOf(familyOf(id));
		return index < 0 ? cascade.length : index;
	};
	const next = [...free].sort((a, b) => {
		const byFamily = rank(a.id) - rank(b.id);
		return byFamily !== 0 ? byFamily : a.id.localeCompare(b.id);
	})[0];
	return json({
		kind: 'next-proposal',
		proposalId: next?.id,
		file: next?.file,
		status: next?.status,
		relaunchCommand: `${options.namespacePrefix}_continue_proposal { proposalId: "${next?.id}", mode: "plan" }`,
		guide: [
			'Open the proposal file and do the next atomic slice.',
			'For parallel work, call mode:"plan" then mode:"claim".',
			'Claim files with agent_lock before editing; release when done.',
		],
	});
};

/** Registration for `<prefix>_continue_proposal`. */
export const buildContinueProposalRegistration = (
	options: IContinueProposalToolOptions
): IToolRegistration => ({
	id: 'continue_proposal',
	summary:
		'Next proposal by cascade (mode auto), or a parallel slice plan/claim (modes plan/claim).',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_continue_proposal`,
			{
						outputSchema: z.object({}).catchall(z.unknown()),
				description:
					'Resolve the next proposal to work on. mode "auto" (default) returns the next actionable proposal by family cascade; mode "plan" returns the parsed ## Slices plan with claimable slices; mode "claim" claims a slice via the agent lock. Structured JSON.',
				inputSchema: z.object({
					proposalId: z.string().optional(),
					mode: z.enum(['auto', 'plan', 'claim']).optional(),
					sliceId: z.string().optional(),
					agentName: z.string().optional(),
				}),
			},
			async (args: IContinueProposalArgs) =>
				runContinueProposal(args, options)
		);
	},
});
