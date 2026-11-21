import { dirname, join } from 'node:path';

import z from 'zod';

import { readUnitStandings, summarizeStandings } from '@delendai/core/cli';
import type { IToolRegistration } from '@delendai/core/contracts';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	loadLockSnapshot,
	reportBackpressure,
} from '../agents/persistent-task-queue';
import type { IPersistentTaskQueue } from '../agents/persistent-task-queue';
import { PROPOSAL_STATUSES } from '../contracts/constants/proposal-glossary.constant';
import {
	reviewersAtWork,
	reviewStateOf,
} from '../services/review-state.service';
import {
	readJsonOrNull,
	readProposalIndex,
	readTextOrNull,
} from '../proposals/index-reader';
import { resolveDatabasePath } from '../proposals/index-reader-location';
import { everySliceReviewed } from '../services/review-attribution';

export interface ICompactStatusOptions {
	readonly namespacePrefix: string;
	readonly lockPathAbs: string;
	readonly queuePathAbs: string;
	readonly closedTasksPathAbs: string;
	readonly indexPathAbs: string;
	/**
	 * x00052: absolute path of the proposals directory. Optional —
	 * `compact_status` does not currently need to read proposal files
	 * but the wiring forwards it for consistency with the rest of the
	 * tool surface (see `continue-proposal.tool.ts`).
	 */
	readonly proposalsDirAbs?: string;
	/**
	 * Where the units of work are read, and the policy that names their
	 * refs. Without both there is no `units` field: a project that does not
	 * isolate work has no units to count.
	 */
	readonly workspaceRoot?: string;
	readonly developmentPolicy?: IResolvedDevelopmentPolicy | undefined;
}

type IField = 'locks' | 'units' | 'queue' | 'proposals';
const ALL_FIELDS: readonly IField[] = ['locks', 'units', 'queue', 'proposals'];

export interface ICompactStatus {
	/** File locks held through the task queue: not the units of work. */
	readonly locks?: { readonly active: number };
	/**
	 * The units of work (one work ref each, on this clone or its remotes)
	 * by standing, on one line: how a worktree-isolated swarm actually
	 * holds its work.
	 */
	readonly units?: string;
	readonly queue?: {
		readonly queued: number;
		readonly promoted: number;
		readonly waiterOrphans: number;
		readonly threshold: string;
	};
	readonly proposals?: {
		readonly total: number;
		readonly actionable: number;
		readonly byStatus: Record<string, number>;
		/**
		 * Proposal files the last rebuild could not represent, and so
		 * counted nowhere above: how many, and the first with its reason.
		 */
		readonly setAside: { readonly count: number; readonly first?: string };
	};
}

/** How many files were set aside, and the first of them with its reason. */
export const describeSetAside = (
	files: readonly { readonly path: string; readonly reason: string }[],
): { readonly count: number; readonly first?: string } => {
	const first = files[0];
	return first === undefined
		? { count: 0 }
		: { count: files.length, first: `${first.path}: ${first.reason}` };
};

/**
 * The files the projection set aside. Read through a dynamic import: the
 * database driver only loads under the runtime that has it, and a status
 * that cannot be told reports none rather than failing.
 */
const readSetAside = async (
	indexPathAbs: string,
): Promise<{ readonly count: number; readonly first?: string }> => {
	try {
		const databasePath = await resolveDatabasePath(indexPathAbs);
		if (databasePath === null) return { count: 0 };
		const { readSetAsideFiles } = await import(
			'@delendai/proposals-sqlite'
		);
		return describeSetAside(readSetAsideFiles(databasePath) ?? []);
	} catch {
		return { count: 0 };
	}
};

// `readJsonOrNull` is provided by `proposals/index-reader.ts` (DRY).

const readQueueTolerant = async (
	path: string,
): Promise<IPersistentTaskQueue> => {
	const p = await readJsonOrNull<{ entries?: unknown }>(path);
	return p && Array.isArray(p.entries)
		? (p as IPersistentTaskQueue)
		: { version: 1, entries: [] };
};

const ACTIONABLE = ['pending', 'ready', 'in_progress'];

/**
 * Aggregate ONLY the proposals plugin's own coordination state — locks,
 * task queue and the proposal board — into one tiny payload, so an agent
 * checks "where are we" in a single call instead of three. `fields`
 * narrows it further. delendai stays agnostic: core doesn't know about
 * proposals, so this aggregator lives in the plugin that owns the state.
 */
export const collectCompactStatus = async (
	options: ICompactStatusOptions,
	fields: readonly IField[] = ALL_FIELDS,
): Promise<ICompactStatus> => {
	const want = new Set(fields);
	const out: {
		locks?: { active: number };
		units?: string;
		queue?: {
			queued: number;
			promoted: number;
			waiterOrphans: number;
			threshold: string;
		};
		proposals?: {
			total: number;
			actionable: number;
			byStatus: Record<string, number>;
			setAside: { readonly count: number; readonly first?: string };
		};
	} = {};

	if (want.has('locks') || want.has('queue')) {
		const snapshot = await loadLockSnapshot(
			options.lockPathAbs,
			options.closedTasksPathAbs,
		);
		if (want.has('locks')) {
			out.locks = { active: snapshot.in_flight.length };
		}
		if (want.has('queue')) {
			const bp = reportBackpressure(
				await readQueueTolerant(options.queuePathAbs),
				snapshot,
			);
			out.queue = {
				queued: bp.queuedCount,
				promoted: bp.promotedCount,
				waiterOrphans: bp.waiterOrphans,
				threshold: bp.threshold,
			};
		}
	}

	if (
		want.has('units') &&
		options.workspaceRoot !== undefined &&
		options.developmentPolicy !== undefined
	) {
		out.units = summarizeStandings(
			await readUnitStandings({
				root: options.workspaceRoot,
				policy: options.developmentPolicy,
			}),
		).line.replace(/^units: /u, '');
	}

	if (want.has('proposals')) {
		// Through the one reader every other tool uses: the projection of
		// the markdown, rebuilt first when it is missing or behind it. This
		// read the legacy registry file by itself and counted what a pull
		// had long since changed, or nothing at all where none existed.
		const list = await readProposalIndex(options.indexPathAbs);
		const total = list.length;
		// Every status the workflow has, at zero when no proposal is in it:
		// a status left out read as "does this project have it?" where the
		// answer was "nothing is in progress".
		const byStatus = list.reduce<Record<string, number>>(
			(acc, p) => {
				const k = p.status ?? 'unknown';
				acc[k] = (acc[k] ?? 0) + 1;
				return acc;
			},
			Object.fromEntries(
				Object.keys(PROPOSAL_STATUSES).map((status) => [status, 0]),
			),
		);
		// A proposal in review whose every slice is approved only waits to
		// close: `approved`. It should last minutes; one that stays was
		// refused its close, which is what the owner has to see. Of the
		// rest, one a reviewer is on is `in-review` (the claim says which),
		// and the others wait for a reviewer.
		const inReview = list.filter((p) => p.status === 'review');
		const approved = new Set<string>();
		const proposalsDir =
			options.proposalsDirAbs ?? dirname(options.indexPathAbs);
		for (const p of inReview) {
			// An entry that names no document says nothing about its slices.
			if (typeof p.file !== 'string') continue;
			const md = await readTextOrNull(join(proposalsDir, p.file));
			if (md !== null && everySliceReviewed(String(p.id), md))
				approved.add(String(p.id));
		}
		byStatus.approved = approved.size;
		byStatus.review = (byStatus.review ?? 0) - approved.size;
		if (
			options.workspaceRoot !== undefined &&
			options.developmentPolicy !== undefined
		) {
			const atWork = await reviewersAtWork(
				options.workspaceRoot,
				options.developmentPolicy,
			);
			const reviewing = inReview.filter(
				(p) =>
					!approved.has(String(p.id)) &&
					reviewStateOf(String(p.id ?? ''), atWork) === 'in-review',
			).length;
			byStatus['in-review'] = reviewing;
			byStatus.review = (byStatus.review ?? 0) - reviewing;
		}
		const actionable = ACTIONABLE.reduce(
			(n, s) => n + (byStatus[s] ?? 0),
			0,
		);
		out.proposals = {
			total,
			actionable,
			byStatus,
			setAside: await readSetAside(options.indexPathAbs),
		};
	}

	return out;
};

export const buildCompactStatusRegistration = (
	options: ICompactStatusOptions,
): IToolRegistration => ({
	id: 'compact_status',
	summary:
		'One-call low-token snapshot of the swarm: active locks, queue backpressure and proposal board counts.',
	tags: ['coordination', 'orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_compact_status`,
			{
				description:
					'One low-token call: task-queue file locks (worktree units take none), units of work by standing, queue backpressure and proposal counts by status with the files the projection set aside. `fields` narrows it. Read-only.',
				inputSchema: z.object({
					fields: z
						.array(z.enum(['locks', 'units', 'queue', 'proposals']))
						.optional(),
				}),
				outputSchema: z.object({
					locks: z.object({ active: z.number() }).optional(),
					units: z.string().optional(),
					queue: z
						.object({
							queued: z.number(),
							promoted: z.number(),
							waiterOrphans: z.number(),
							threshold: z.string(),
						})
						.optional(),
					proposals: z
						.object({
							total: z.number(),
							actionable: z.number(),
							byStatus: z.record(z.string(), z.number()),
							setAside: z.object({
								count: z.number(),
								first: z.string().optional(),
							}),
						})
						.optional(),
				}),
			},
			async (args: { fields?: IField[] | undefined }) => {
				const fields =
					args.fields && args.fields.length > 0
						? args.fields
						: ALL_FIELDS;
				return toolJson(await collectCompactStatus(options, fields));
			},
		);
	},
});
