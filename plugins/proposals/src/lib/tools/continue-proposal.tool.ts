import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_STATUSES,
} from '../contracts/constants/proposal-glossary.constant';
import { parseProposalFrontmatter } from '../shared/proposal-frontmatter';
import { buildDefaultCascadeChain } from '../cascade/cascade-chain';
import { LEGACY_ALIAS_PREFIX } from '../cascade/cascade-priority';
import type {
	ICascadePriorityResolver,
	IProposalSummary,
	TCascadeBoost,
} from '../cascade/cascade-priority';

export interface IContinueProposalToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the proposal index (index.json). */
	readonly indexPathAbs: string;
	/** Absolute path of the agent lock file. */
	readonly lockPathAbs: string;
	/**
	 * @deprecated f127: superseded by `cascadeResolver` (kind-based
	 * cascade + frontmatter override/boost). Kept only so a host config
	 * that still sets `familyCascade` doesn't crash; when present, it is
	 * translated into an ad-hoc resolver that ranks by prefix order, with
	 * unknown prefixes pushed to the back — same externally observable
	 * behaviour as before f127, but does not block the (now wired-in)
	 * frontmatter override.
	 */
	readonly familyCascade?: readonly string[];
	/**
	 * f127: priority resolver for `mode: "auto"`. Defaults to
	 * `buildDefaultCascadeChain()` (kind-based cascade decorated with the
	 * frontmatter `cascadeOverride` break-glass). Injectable for tests
	 * (DIP) — a test can supply a fake resolver with a synthetic order
	 * and never touch the real glossary or disk.
	 */
	readonly cascadeResolver?: ICascadePriorityResolver;
}

export interface IContinueProposalArgs {
	readonly proposalId?: string | undefined;
	/** `auto` (serial next) | `plan` (slice plan) | `claim` (claim a slice). */
	readonly mode?: 'auto' | 'plan' | 'claim' | undefined;
	readonly sliceId?: string | undefined;
	readonly agentName?: string | undefined;
}

const json = toolJson;

const ACTIONABLE = new Set(['pending', 'ready', 'in_progress']);
const SLICE_GATE_SCHEMA = z.enum(['lint', 'type', 'e2e', 'none']);
const SLICE_STATUS_SCHEMA = z.enum([
	'pending',
	'in-progress',
	'done',
	'blocked',
]);
const CLAIM_BLOCKER_SCHEMA = z.enum([
	'none',
	'unknown-slice',
	'deps-not-done',
	'overlap-in-progress',
	'already-done',
	'already-in-progress',
]);

const PROPOSAL_SLICE_SCHEMA = z.object({
	proposalId: z.string(),
	sliceId: z.string(),
	title: z.string(),
	owner: z.string().nullable(),
	files: z.array(z.string()),
	dependsOn: z.array(z.string()),
	gate: SLICE_GATE_SCHEMA,
	status: SLICE_STATUS_SCHEMA,
	acceptanceCriteria: z.array(z.string()),
});

const PROPOSAL_SLICE_PLAN_SCHEMA = z.object({
	proposalId: z.string(),
	slices: z.array(PROPOSAL_SLICE_SCHEMA),
	globalGate: SLICE_GATE_SCHEMA,
});

const CLAIM_VALIDATION_SCHEMA = z.object({
	ok: z.boolean(),
	reason: z.string(),
	blockerType: CLAIM_BLOCKER_SCHEMA,
});

const SLICE_OVERLAP_SCHEMA = z.object({
	first: z.string(),
	second: z.string(),
	file: z.string(),
});

const EXECUTION_GUIDE_SCHEMA = z.object({
	files: z.array(z.string()),
	acceptanceCriteria: z.array(z.string()),
	gate: SLICE_GATE_SCHEMA,
	rules: z.array(z.string()),
});

const CONTINUE_PROPOSAL_OUTPUT_SCHEMA = z.object({
	kind: z.enum([
		'next-proposal',
		'no-proposal',
		'all-claimed',
		'slice-mode-error',
		'slice-plan',
		'slice-claim-rejected',
		'slice-claim',
	]),
	reason: z.string().optional(),
	nextAction: z.string().optional(),
	proposalId: z.string().optional(),
	file: z.string().optional(),
	status: z.string().optional(),
	relaunchCommand: z.string().optional(),
	guide: z.array(z.string()).optional(),
	plan: PROPOSAL_SLICE_PLAN_SCHEMA.optional(),
	disjointnessIssues: z.array(SLICE_OVERLAP_SCHEMA).optional(),
	claimableSliceIds: z.array(z.string()).optional(),
	sliceId: z.string().optional(),
	validation: CLAIM_VALIDATION_SCHEMA.optional(),
	slice: PROPOSAL_SLICE_SCHEMA.nullable().optional(),
	executionGuide: EXECUTION_GUIDE_SCHEMA.optional(),
	error: z.string().optional(),
});

// f113 S4: a proposal already on the new state machine is actionable by
// FOLDER, not by status string — `review` isn't even in the legacy
// ACTIONABLE set, and `auto_work` should respect a slice already in
// `review/` the same way it respects `in-progress/`.
const NEW_SYSTEM_ACTIONABLE_FOLDERS = new Set([
	'ready',
	'in-progress',
	'review',
]);

/**
 * Same dual signal as S5's `isNewSystemFilename` (status alone isn't
 * safe — `ready` is the *default* status `create_proposal` writes for
 * any brand-new proposal regardless of kind): a proposal is only on the
 * new state machine if its id's prefix is one of the 12 live kinds
 * (explicitly excluding the retired legacy `p`) AND its status resolves
 * to one of the 7 glossary statuses.
 */
const isNewSystemEntry = (entry: IIndexEntry): boolean => {
	const prefix = entry.id[0] ?? '';
	return (
		prefix !== 'p' &&
		prefix in PROPOSAL_KIND_BY_PREFIX &&
		entry.status in PROPOSAL_STATUSES
	);
};

/** The folder a registry `file` path lives in, or `null` for a flat (root) file. */
const folderOf = (file: string): string | null => {
	const idx = file.lastIndexOf('/');
	return idx === -1 ? null : file.slice(0, idx);
};

/**
 * Legacy entries (the 14 not-yet-migrated proposals) keep their EXACT
 * existing status-string behaviour, untouched. New-system entries are
 * actionable purely by which of the 7 folders they physically live in
 * (S5's reconciler keeps that folder in sync with frontmatter `status`,
 * so this is the operative source of truth post-migration).
 */
const isActionable = (entry: IIndexEntry): boolean => {
	if (isNewSystemEntry(entry)) {
		const folder = folderOf(entry.file);
		return folder !== null && NEW_SYSTEM_ACTIONABLE_FOLDERS.has(folder);
	}
	return ACTIONABLE.has(entry.status);
};

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

const readIndex = async (
	indexPath: string,
): Promise<readonly IIndexEntry[]> => {
	const parsed = await readJsonOrNull<{ proposals?: IIndexEntry[] }>(
		indexPath,
	);
	return parsed?.proposals ?? [];
};

const familyOf = (id: string): string => id.match(/^[a-z]+/i)?.[0] ?? '';

const CASCADE_BOOSTS: ReadonlySet<TCascadeBoost> = new Set([
	'shipped-blocking',
	'customer-reported',
	'security',
]);

const isCascadeBoost = (value: string | undefined): value is TCascadeBoost =>
	typeof value === 'string' && CASCADE_BOOSTS.has(value as TCascadeBoost);

/**
 * f127: resolves a free index entry's frontmatter (`cascadeOverride`,
 * `cascadeOverrideReason`, `cascadeBoost`) into an `IProposalSummary`
 * the cascade resolver can rank. Reads only the entries already
 * filtered down to `free` (actionable, not claimed elsewhere) — never
 * the whole proposals tree — so this stays a bounded, small batch of
 * extra file reads instead of an O(all proposals) scan. A missing or
 * unparsable file degrades to "no override/boost", never throws.
 */
const summaryFor = async (
	entry: IIndexEntry,
	indexPath: string,
): Promise<IProposalSummary> => {
	const prefix = familyOf(entry.id);
	const kind = PROPOSAL_KIND_BY_PREFIX[prefix] ?? LEGACY_ALIAS_PREFIX;
	const docPath = join(dirname(indexPath), entry.file);
	const markdown = await readTextOrNull(docPath);
	if (markdown === null) return { id: entry.id, kind };
	const frontmatter = parseProposalFrontmatter(markdown);
	const overrideRaw = frontmatter.cascadeOverride;
	const override =
		overrideRaw !== undefined && overrideRaw.trim() !== ''
			? Number(overrideRaw)
			: undefined;
	const boost = isCascadeBoost(frontmatter.cascadeBoost)
		? frontmatter.cascadeBoost
		: undefined;
	return {
		id: entry.id,
		kind,
		...(override !== undefined && Number.isFinite(override)
			? { cascadeOverride: override }
			: {}),
		...(frontmatter.cascadeOverrideReason
			? { cascadeOverrideReason: frontmatter.cascadeOverrideReason }
			: {}),
		...(boost ? { cascadeBoost: boost } : {}),
	};
};

const readActiveLocks = async (
	lockPath: string,
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
	proposalId: string,
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
			candidate.id.startsWith(`${proposalId}-`),
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
	options: IContinueProposalToolOptions,
): Promise<IToolTextResult> => {
	if (args.mode === 'plan' || args.mode === 'claim') {
		if (!args.proposalId)
			return json({
				kind: 'slice-mode-error',
				reason: 'slice modes require an explicit proposalId',
				nextAction: 'Call mode:"plan" with a proposalId.',
			});
		const doc = await resolveDoc(options.indexPathAbs, args.proposalId);
		if ('error' in doc) return json({ kind: 'slice-mode-error', ...doc });
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
			await readActiveLocks(options.lockPathAbs),
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
				nextAction:
					'Call mode:"plan" first and pick a claimable slice.',
			});
		const validation = validateClaim(plan, args.sliceId);
		const slice =
			plan.slices.find((s) => s.sliceId === args.sliceId) ?? null;
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
			},
		);
		const lockPayload = JSON.parse(lockResult.content[0]?.text ?? '{}') as {
			blocked?: boolean;
		};
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
	const actionable = entries.filter(isActionable);
	if (actionable.length === 0)
		return json({
			kind: 'no-proposal',
			reason: 'no actionable proposal in the index',
			nextAction:
				'Create a proposal under the proposals dir and run sync_proposals.',
		});
	// Anti-loop: an `in_progress`/`in-progress` proposal already covered
	// by an active lock is being worked by someone. Selecting it again only
	// produces a claim→lock-conflict→auto_work→same-proposal mini-loop, so
	// exclude it from the primary pick. `proposalIdOf` maps a lock's task_id
	// (e.g. `p81-slice-2`) back to its proposal base id (`p81`).
	const proposalIdOf = (value: string): string =>
		value.match(/^([a-z]+\d+[a-z]?)/i)?.[1] ?? value;
	const lockedProposalIds = new Set(
		(await readActiveLocks(options.lockPathAbs)).map((lock) =>
			proposalIdOf(lock.taskId),
		),
	);
	const isClaimedElsewhere = (entry: IIndexEntry): boolean =>
		(entry.status === 'in_progress' || entry.status === 'in-progress') &&
		lockedProposalIds.has(proposalIdOf(entry.id));
	const free = actionable.filter((entry) => !isClaimedElsewhere(entry));
	if (free.length === 0)
		return json({
			kind: 'all-claimed',
			reason: 'every actionable proposal is in_progress under an active lock (being worked elsewhere)',
			nextAction:
				'Do NOT retry auto mode in a loop. Either pick a disjoint slice with mode:"plan"/"claim", or stop and report that all work is claimed.',
		});
	// f127: kind-based cascade (+ frontmatter override/boost) replaces the
	// old hardcoded `['f', 'p']` family-prefix rank. A host that still
	// configures the deprecated `familyCascade` keeps its exact previous
	// ranking (by prefix order, unknown prefixes pushed to the back); a
	// host on the new default gets the full 13-family cascade plus the
	// break-glass override.
	const resolver: ICascadePriorityResolver =
		options.cascadeResolver ??
		(options.familyCascade
			? {
					resolve: (proposal) => {
						const index = options.familyCascade?.indexOf(
							familyOf(proposal.id),
						);
						return index === undefined || index < 0
							? (options.familyCascade?.length ?? 0)
							: index;
					},
				}
			: buildDefaultCascadeChain());
	const summaries = await Promise.all(
		free.map((entry) => summaryFor(entry, options.indexPathAbs)),
	);
	const summaryById = new Map(summaries.map((s) => [s.id, s]));
	const next = [...free].sort((a, b) => {
		const priorityA = resolver.resolve(
			summaryById.get(a.id) as IProposalSummary,
		);
		const priorityB = resolver.resolve(
			summaryById.get(b.id) as IProposalSummary,
		);
		const byPriority = priorityA - priorityB;
		return byPriority !== 0 ? byPriority : a.id.localeCompare(b.id);
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
	options: IContinueProposalToolOptions,
): IToolRegistration => ({
	id: 'continue_proposal',
	effects: ['write'],
	summary:
		'Next proposal by cascade (mode auto), or a parallel slice plan/claim (modes plan/claim).',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_continue_proposal`,
			{
				outputSchema: CONTINUE_PROPOSAL_OUTPUT_SCHEMA,
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
				runContinueProposal(args, options),
		);
	},
});
