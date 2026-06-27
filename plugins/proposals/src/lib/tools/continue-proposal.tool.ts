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
import { buildCascadeSummary } from '../cascade/cascade-summary';
import { buildDefaultCascadeChain } from '../cascade/cascade-chain';
import type { TCascadeBoost } from '../cascade/cascade-priority';
import { blockedByFor } from '../proposals/blocked-by';
import type { IProposalIndexEntry } from '../proposals/index-reader';
import {
	readJsonOrNull,
	readProposalIndex,
	readTextOrNull,
} from '../proposals/index-reader';
import type {
	ICascadePriorityResolver,
	IProposalSummary,
} from '../cascade/cascade-priority';

export interface IContinueProposalToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the proposal index (index.json). */
	readonly indexPathAbs: string;
	/** Absolute path of the agent lock file. */
	readonly lockPathAbs: string;
	/**
	 * f00024: priority resolver for `mode: "auto"`. Defaults to
	 * `buildDefaultCascadeChain()` (kind-based cascade decorated with the
	 * frontmatter `cascadeOverride` break-glass). Injectable for tests
	 * (DIP) — a test can supply a fake resolver with a synthetic order
	 * and never touch the real glossary or disk.
	 */
	readonly cascadeResolver?: ICascadePriorityResolver;
	/**
	 * Engine-internal flag for `mode: "auto"`: when true, if the
	 * normal cascade finds no actionable proposal (no entries in the
	 * standard actionable folders, or every actionable entry is
	 * covered by an active lock / has no claimable slices), fall back
	 * to a second cascade pass over entries living in `paused/`.
	 *
	 * Paused proposals are NEVER interleaved with the primary cascade
	 * — they only enter the pick when nothing else is actionable, so
	 * the default contract is preserved. Surfaced through
	 * `auto_work { includePaused: true }` (default false); not part
	 * of the public `continue_proposal` arg surface, by design.
	 */
	readonly includePausedFallback?: boolean;
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

const CASCADE_BOOST_VALUES = [
	'shipped-blocking',
	'customer-reported',
	'security',
] as const satisfies readonly [TCascadeBoost, ...TCascadeBoost[]];

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

const CASCADE_TRACE_SCHEMA = z.object({
	priority: z.number().optional(),
	cascadeOverrideReason: z.string().optional(),
	cascadeBoost: z.enum(CASCADE_BOOST_VALUES).optional(),
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
	cascadeTrace: CASCADE_TRACE_SCHEMA.optional(),
	error: z.string().optional(),
	blockedBy: z.array(z.string()).optional(),
	/**
	 * True when this `next-proposal` pick came from the `paused/`
	 * fallback pass (only reachable when the caller passed
	 * `includePausedFallback: true` AND the primary cascade had
	 * nothing actionable to return). Lets the UI/orchestrator render
	 * a "this was a paused proposal" hint without `auto_work` having
	 * to introspect the path. Always undefined otherwise.
	 */
	pickedFromPaused: z.boolean().optional(),
});

// f00016 S4: a proposal already on the new state machine is actionable by
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
const isNewSystemEntry = (entry: IProposalIndexEntry): boolean => {
	const prefix = entry.id[0] ?? '';
	return (
		prefix !== 'p' &&
		prefix in PROPOSAL_KIND_BY_PREFIX &&
		entry.status !== undefined &&
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
const isActionable = (entry: IProposalIndexEntry): boolean => {
	if (isNewSystemEntry(entry)) {
		const folder = folderOf(entry.file);
		return folder !== null && NEW_SYSTEM_ACTIONABLE_FOLDERS.has(folder);
	}
	return entry.status !== undefined && ACTIONABLE.has(entry.status);
};

const readActiveLocks = async (
	lockPath: string,
): Promise<readonly ILockSnapshotEntry[]> => {
	const lock = await readJsonOrNull<{
		stale_after_minutes?: number;
		in_flight?: Array<{
			task_id?: string;
			agent?: string;
			ownership?: string[];
			started_at?: string;
			last_seen?: string;
		}>;
	}>(lockPath);
	if (lock === null) return [];
	const staleMinutes = lock.stale_after_minutes ?? 10;
	const now = Date.now();
	return (lock.in_flight ?? [])
		.filter((entry) => {
			if (typeof entry.task_id !== 'string') return false;
			if (entry.last_seen) {
				const t = new Date(entry.last_seen).getTime();
				if (!Number.isNaN(t) && now - t > staleMinutes * 60_000) {
					return false;
				}
			}
			return true;
		})
		.map((entry) => ({
			taskId: entry.task_id ?? '',
			agent: entry.agent ?? 'unknown',
			...(Array.isArray(entry.ownership)
				? {
						ownership: entry.ownership.filter(
							(item) => typeof item === 'string',
						),
					}
				: {}),
		}));
};

const resolveDoc = async (
	indexPath: string,
	proposalId: string,
): Promise<
	{ id: string; markdown: string } | { error: string; nextAction: string }
> => {
	const entries = await readProposalIndex(indexPath);
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

// q00001 helper extracted to `proposals/blocked-by.ts` (SRP).

/**
 * Engine-internal paused-fallback pass for `mode: "auto"`. Runs the
 * same kind-based cascade over the entries that physically live in
 * `paused/` (so `paused` is the operative folder, not just the
 * status string — mirrors S5's reconciliation semantics) and returns
 * the highest-priority candidate, with `pickedFromPaused: true` so
 * `auto_work` can render a "this came from `paused/`" hint.
 *
 * Constraints:
 *  - Only entries on the new state machine (`isNewSystemEntry`) are
 *    eligible. Legacy `p`-prefixed entries are skipped, same as the
 *    primary cascade.
 *  - Entries currently held under an active lock are skipped: the
 *    cascade's anti-loop guarantee (don't reopen work in flight)
 *    applies equally here.
 *  - Returns `null` if no eligible paused proposal exists; the caller
 *    then renders the standard `no-proposal` / `all-claimed` idle.
 *
 * Exported for unit testing only; not part of the public surface.
 */
export const pickFromPausedFallback = async (
	entries: readonly IProposalIndexEntry[],
	options: IContinueProposalToolOptions,
): Promise<IToolTextResult | null> => {
	const pausedEntries = entries.filter((entry) => {
		if (!isNewSystemEntry(entry)) return false;
		const folder = folderOf(entry.file);
		return folder === 'paused';
	});
	if (pausedEntries.length === 0) return null;
	const proposalIdOf = (value: string): string =>
		value.match(/^([a-z]+\d+[a-z]?)/i)?.[1] ?? value;
	const lockedProposalIds = new Set(
		(await readActiveLocks(options.lockPathAbs)).map((lock) =>
			proposalIdOf(lock.taskId),
		),
	);
	const unlocked = pausedEntries.filter(
		(entry) => !lockedProposalIds.has(proposalIdOf(entry.id)),
	);
	if (unlocked.length === 0) return null;
	const resolver: ICascadePriorityResolver =
		options.cascadeResolver ?? buildDefaultCascadeChain();
	const summaries = await Promise.all(
		unlocked.map((entry) =>
			buildCascadeSummary(entry, options.indexPathAbs),
		),
	);
	const summaryById = new Map(summaries.map((s) => [s.id, s]));
	const next = [...unlocked].sort((a, b) => {
		const priorityA = resolver.resolve(
			summaryById.get(a.id) as IProposalSummary,
		);
		const priorityB = resolver.resolve(
			summaryById.get(b.id) as IProposalSummary,
		);
		const byPriority = priorityA - priorityB;
		return byPriority !== 0 ? byPriority : a.id.localeCompare(b.id);
	})[0];
	if (next === undefined) return null;
	const nextSummary = summaryById.get(next.id);
	const nextPriority =
		nextSummary === undefined ? undefined : resolver.resolve(nextSummary);
	return json({
		kind: 'next-proposal',
		proposalId: next.id,
		file: next.file,
		status: next.status,
		relaunchCommand: `${options.namespacePrefix}_continue_proposal { proposalId: "${next.id}", mode: "plan" }`,
		cascadeTrace:
			nextSummary === undefined
				? undefined
				: {
						...(nextPriority !== undefined &&
						Number.isFinite(nextPriority)
							? { priority: nextPriority }
							: {}),
						...(nextSummary.cascadeOverrideReason
							? {
									cascadeOverrideReason:
										nextSummary.cascadeOverrideReason,
								}
							: {}),
						...(nextSummary.cascadeBoost
							? { cascadeBoost: nextSummary.cascadeBoost }
							: {}),
					},
		pickedFromPaused: true,
		guide: [
			'Open the proposal file and do the next atomic slice.',
			'For parallel work, call mode:"plan" then mode:"claim".',
			'Claim files with agent_lock before editing; release when done.',
			'This proposal lives in `paused/`: it was picked only because the standard cascade had no actionable candidates (paused-fallback).',
		],
		blockedBy: await blockedByFor(next, options.indexPathAbs),
	});
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
	const entries = await readProposalIndex(options.indexPathAbs);
	const actionable = entries.filter(isActionable);
	if (actionable.length === 0) {
		if (options.includePausedFallback === true) {
			const pausedPick = await pickFromPausedFallback(entries, options);
			if (pausedPick !== null) return pausedPick;
		}
		return json({
			kind: 'no-proposal',
			reason: 'no actionable proposal in the index',
			nextAction:
				'Create a proposal under the proposals dir and run sync_proposals.',
		});
	}
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
	const isClaimedElsewhere = (entry: IProposalIndexEntry): boolean =>
		(entry.status === 'in_progress' || entry.status === 'in-progress') &&
		lockedProposalIds.has(proposalIdOf(entry.id));
	const free = actionable.filter((entry) => !isClaimedElsewhere(entry));
	if (free.length === 0) {
		if (options.includePausedFallback === true) {
			const pausedPick = await pickFromPausedFallback(entries, options);
			if (pausedPick !== null) return pausedPick;
		}
		return json({
			kind: 'all-claimed',
			reason: 'every actionable proposal is in_progress under an active lock (being worked elsewhere)',
			nextAction: `Do NOT retry auto mode in a loop. Either pick a disjoint slice with mode:"plan"/"claim", or wait once with ${options.namespacePrefix}_await_lock / a lock-released notification, then retry the claim path.`,
		});
	}
	// f00024: kind-based cascade (+ frontmatter override/boost) — the host
	// may inject a custom resolver (DIP, for tests), otherwise the full
	// 13-family cascade plus the break-glass override is used.
	const resolver: ICascadePriorityResolver =
		options.cascadeResolver ?? buildDefaultCascadeChain();
	const summaries = await Promise.all(
		free.map((entry) => buildCascadeSummary(entry, options.indexPathAbs)),
	);
	const summaryById = new Map(summaries.map((s) => [s.id, s]));
	const activeLocks = await readActiveLocks(options.lockPathAbs);
	const claimableById = new Map<string, number>();
	for (const entry of free) {
		const docPath = join(dirname(options.indexPathAbs), entry.file);
		const markdown = await readTextOrNull(docPath);
		if (markdown === null) continue;
		const parsedPlan = parseProposalSlicePlan(entry.id, markdown);
		if (parsedPlan === null) continue;
		const derivedPlan = deriveSliceStatuses(parsedPlan, activeLocks);
		claimableById.set(
			entry.id,
			derivedPlan.slices.filter(
				(slice) => validateClaim(derivedPlan, slice.sliceId).ok,
			).length,
		);
	}
	const seriallyFree = free.filter(
		(entry) => (claimableById.get(entry.id) ?? 1) > 0,
	);
	if (seriallyFree.length === 0) {
		if (options.includePausedFallback === true) {
			const pausedPick = await pickFromPausedFallback(entries, options);
			if (pausedPick !== null) return pausedPick;
		}
		return json({
			kind: 'all-claimed',
			reason: 'every actionable proposal is currently covered by live slice claims or ownership overlap',
			nextAction: `Do NOT retry auto mode in a loop. Wait once with ${options.namespacePrefix}_await_lock / a lock-released notification, then retry auto mode or the exact claim path.`,
		});
	}
	const priorityById = new Map<string, number>();
	const next = [...seriallyFree].sort((a, b) => {
		const priorityA = resolver.resolve(
			summaryById.get(a.id) as IProposalSummary,
		);
		const priorityB = resolver.resolve(
			summaryById.get(b.id) as IProposalSummary,
		);
		priorityById.set(a.id, priorityA);
		priorityById.set(b.id, priorityB);
		const byPriority = priorityA - priorityB;
		return byPriority !== 0 ? byPriority : a.id.localeCompare(b.id);
	})[0];
	const nextSummary = next ? summaryById.get(next.id) : undefined;
	const nextPriority =
		nextSummary === undefined
			? undefined
			: (priorityById.get(nextSummary.id) ??
				resolver.resolve(nextSummary));
	return json({
		kind: 'next-proposal',
		proposalId: next?.id,
		file: next?.file,
		status: next?.status,
		relaunchCommand: `${options.namespacePrefix}_continue_proposal { proposalId: "${next?.id}", mode: "plan" }`,
		cascadeTrace:
			nextSummary === undefined
				? undefined
				: {
						...(nextPriority !== undefined &&
						Number.isFinite(nextPriority)
							? { priority: nextPriority }
							: {}),
						...(nextSummary.cascadeOverrideReason
							? {
									cascadeOverrideReason:
										nextSummary.cascadeOverrideReason,
								}
							: {}),
						...(nextSummary.cascadeBoost
							? { cascadeBoost: nextSummary.cascadeBoost }
							: {}),
					},
		guide: [
			'Open the proposal file and do the next atomic slice.',
			'For parallel work, call mode:"plan" then mode:"claim".',
			'Claim files with agent_lock before editing; release when done.',
		],
		...(next === undefined
			? {}
			: {
					blockedBy: await blockedByFor(next, options.indexPathAbs),
				}),
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
