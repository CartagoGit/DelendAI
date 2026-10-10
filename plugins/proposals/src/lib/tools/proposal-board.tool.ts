import { dirname, join } from 'node:path';
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
});

const BOARD_PROPOSAL = z.object({
	id: z.string(),
	status: z.string(),
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
				}),
				outputSchema: z.object({
					proposals: z.array(BOARD_PROPOSAL),
					next: z.string().optional(),
				}),
				description:
					'Returns each actionable proposal with the slices claimable right now and how many slices it has. Pass proposalId for one proposal with its slices (status, owner), or detail: true for all of them. Read-only; the orchestrator board for planning multi-agent work. A proposal whose document cannot be read reports `unreadable` instead of an empty slice list.',
			},
			async (args: {
				readonly proposalId?: string | undefined;
				readonly detail?: boolean | undefined;
			}) => {
				const proposals = await readProposalIndex(options.indexPathAbs);
				const locks = await readActiveLocks(options.lockPathAbs);
				// real documents carry the hyphenated status; keep
				// the underscore spellings for indexes written before the
				// vocabulary converged.
				const actionable = proposals.filter(
					(p) =>
						[
							'pending',
							'ready',
							'in_progress',
							'in-progress',
						].includes(p.status ?? '') &&
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
								status: p.status ?? 'unknown',
								slices: [],
								unreadable: `index points at ${p.file}, which does not exist — run sync_proposals`,
							};
						}
						const parsed = parseProposalSlicePlan(p.id, md);
						if (parsed === null) {
							return {
								id: p.id,
								status: p.status ?? 'unknown',
								slices: [],
								unreadable:
									'the document has no parseable `## Slices` section',
							};
						}
						const plan = deriveSliceStatuses(parsed, locks);
						return {
							id: p.id,
							status: p.status ?? 'unknown',
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
				if (args.proposalId !== undefined || args.detail === true) {
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
