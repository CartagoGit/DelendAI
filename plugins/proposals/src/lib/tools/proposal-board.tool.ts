import { dirname, join } from 'node:path';
import {
	reviewersAtWork,
	reviewStateOf,
} from '../services/review-state.service';
import z from 'zod';
import type { IToolRegistration } from '@delendai/core/contracts';
import { toolJson } from '@delendai/core/public';

import { readProposalIndex, readTextOrNull } from '../proposals/index-reader';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import {
	type IAuthoringToolOptions,
	readActiveLocks,
} from './authoring-options';

const BOARD_SLICE = z.object({
	sliceId: z.string(),
	status: z.string(),
	owner: z.string().nullable(),
	/** With `progress`: the status word the document carries. */
	written: z.string().optional(),
	/** With `progress`: how many acceptance lines the slice has. */
	acceptance: z.number().optional(),
});

const BOARD_PROPOSAL = z.object({
	id: z.string(),
	status: z.string(),
	/** With `progress`: the proposal's title. */
	title: z.string().optional(),
	/** The slices with status and owner: for the proposal asked for, or with `detail`. */
	slices: z.array(BOARD_SLICE).optional(),
	/** How many slices the proposal has, in the default list. */
	sliceCount: z.number().optional(),
	claimableSliceIds: z.array(z.string()).optional(),
	/**
	 * Why the board could not read this proposal.
	 *
	 * Absent on the happy path. Without it, an index entry pointing at a
	 * moved or deleted file was indistinguishable from a proposal that
	 * genuinely has no slices: both came back as `slices: []`, and an
	 * orchestrator would report "actionable, nothing to claim" and stall.
	 */
	unreadable: z.string().optional(),
});

/**
 * The statuses a proposal can be claimed in. Real documents carry the
 * hyphenated status; the underscore spellings are kept for indexes
 * written before the vocabulary converged.
 */
const CLAIMABLE_STATUSES: readonly string[] = [
	'pending',
	'ready',
	'in_progress',
	'in-progress',
];

/** Open, but nothing to claim: shown to whoever watches the work. */
const WATCHED_STATUSES: readonly string[] = ['review', 'blocked'];

type IBoardEntry = z.infer<typeof BOARD_PROPOSAL>;

/** An entry of the default list: the slices counted, not listed. */
const briefEntry = ({ slices, ...rest }: IBoardEntry): IBoardEntry => ({
	...rest,
	sliceCount: slices?.length ?? 0,
});

/**
 * `proposal_board` — orchestrator overview: each actionable proposal, the
 * slices claimable now, and how many it has. The slices with status and
 * owner come for the proposal asked for (`proposalId`), or for all of them
 * with `detail: true` (f00645: list tools answer compact by default).
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
				inputSchema: z.object({
					proposalId: z
						.string()
						.optional()
						.describe(
							'One proposal, with its slices, status and owner.',
						),
					detail: z
						.boolean()
						.optional()
						.describe('Every actionable proposal with its slices.'),
					progress: z
						.boolean()
						.optional()
						.describe(
							'Every open proposal (also in review or blocked) with its title and, per slice, the status its document carries and its acceptance count.',
						),
				}),
				outputSchema: z.object({
					proposals: z.array(BOARD_PROPOSAL),
					next: z.string().optional(),
				}),
				description:
					'Returns each actionable proposal with the slices claimable right now and how many slices it has. Pass proposalId for one proposal with its slices (status, owner), or detail: true for all of them; progress: true adds the proposals in review or blocked, titles, and the written status and acceptance count of each slice. Read-only; the orchestrator board for planning multi-agent work. A proposal whose document cannot be read reports `unreadable` instead of an empty slice list.',
			},
			async (args: {
				readonly proposalId?: string | undefined;
				readonly detail?: boolean | undefined;
				readonly progress?: boolean | undefined;
			}) => {
				const wanted =
					args.progress === true
						? [...CLAIMABLE_STATUSES, ...WATCHED_STATUSES]
						: CLAIMABLE_STATUSES;
				const proposals = await readProposalIndex(options.indexPathAbs);
				const locks = await readActiveLocks(options.lockPathAbs);
				// A proposal in review a reviewer holds shows as in-review.
				const atWork =
					args.progress === true &&
					options.developmentPolicy !== undefined
						? await reviewersAtWork(
								options.workspaceRoot,
								options.developmentPolicy,
							)
						: new Map<string, readonly string[]>();
				const shown = (p: { id: string; status?: string }): string =>
					p.status === 'review'
						? reviewStateOf(p.id, atWork)
						: (p.status ?? 'unknown');
				const actionable = proposals.filter(
					(p) =>
						wanted.includes(p.status ?? '') &&
						(args.proposalId === undefined ||
							p.id === args.proposalId),
				);
				const board = await Promise.all(
					actionable.map(async (p): Promise<IBoardEntry> => {
						const docPath = join(
							options.proposalsDirAbs ??
								dirname(options.indexPathAbs),
							p.file,
						);
						const md = await readTextOrNull(docPath);
						if (md === null) {
							// The index points to a file that no longer exists.
							// It happens as soon as someone moves a proposal
							// by hand — archiving it in `done/`, for example —
							// without going through `sync_proposals`, and in
							// a repo where the human also touches the files
							// that is the norm, not the exception.
							return {
								id: p.id,
								status: shown(p),
								slices: [],
								unreadable: `index points at ${p.file}, which does not exist — run sync_proposals`,
							};
						}
						const parsed = parseProposalSlicePlan(p.id, md);
						if (parsed === null) {
							return {
								id: p.id,
								status: shown(p),
								slices: [],
								unreadable:
									'the document has no parseable `## Slices` section',
							};
						}
						const plan = deriveSliceStatuses(parsed, locks);
						return {
							id: p.id,
							status: shown(p),
							...(args.progress === true && p.title !== undefined
								? { title: p.title }
								: {}),
							slices: plan.slices.map((s) => ({
								sliceId: s.sliceId,
								status: s.status,
								owner: s.owner,
								...(args.progress === true
									? {
											written:
												s.documentStatus ?? s.status,
											acceptance:
												s.acceptanceCriteria.length,
										}
									: {}),
							})),
							claimableSliceIds: plan.slices
								.filter(
									(s) => validateClaim(plan, s.sliceId).ok,
								)
								.map((s) => s.sliceId),
						};
					}),
				);
				if (
					args.proposalId !== undefined ||
					args.detail === true ||
					args.progress === true
				) {
					return toolJson({ proposals: board });
				}
				return toolJson({
					proposals: board.map(briefEntry),
					next: `${options.namespacePrefix}_proposal_board { proposalId: "<id>" } for one proposal's slices; { detail: true } for all of them.`,
				});
			},
		);
	},
});
