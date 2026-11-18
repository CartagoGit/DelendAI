/**
 * work-progress.service.ts — `delendai work progress`: where the open
 * proposals stand and who is at work, from the events real work leaves.
 *
 * The proposals come from the proposals plugin's board, which reads them
 * through its one reader; this module reads no proposal document and no
 * status folder. The events come from the telemetry store, after the
 * journals published code appends to are drained into it, so the view is
 * as fresh as the last unit entered or published. No model is involved.
 */
import { join } from 'node:path';

import { sharedCheckoutOf } from '@delendai/core/cli';
import {
	DurationHistoryFacade,
	WATCH_INTERVAL_MS,
	WorkEventStoreFacade,
	activeAgents,
	buildWorkStatus,
	drainTelemetryJournals,
	renderWorkStatus,
	workItemsOf,
	type IWorkStatusProposal,
} from '@delendai/state-telemetry/public';

import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { hasFlag, request } from './helpers/cli-command.helper';

/** What the board answers when asked for the progress view. */
interface IProgressBoard {
	readonly proposals?: readonly {
		readonly id: string;
		readonly title?: string;
		readonly slices?: readonly {
			readonly sliceId: string;
			readonly status: string;
			readonly written?: string;
			readonly acceptance?: number;
		}[];
	}[];
}

/** The board's proposals as the view takes them. */
export const proposalsOfBoard = (
	board: IProgressBoard,
): readonly IWorkStatusProposal[] =>
	(board.proposals ?? [])
		.map((proposal) => ({
			id: proposal.id,
			title: proposal.title ?? '(untitled)',
			slices: (proposal.slices ?? []).map((slice) => ({
				id: slice.sliceId,
				status: slice.written ?? slice.status,
				acceptanceCount: slice.acceptance ?? 0,
			})),
		}))
		.sort((left, right) => left.id.localeCompare(right.id));

/** One rendering of the view for the workspace at `root`. */
const view = async (
	root: string,
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<{ readonly text: string; readonly data: unknown }> => {
	const proposals = proposalsOfBoard(
		await request<IProgressBoard>(
			ctx,
			'delendai_proposals_proposal_board',
			{
				progress: true,
			},
		),
	);
	const events = new WorkEventStoreFacade({ workspaceRoot: root });
	const history = new DurationHistoryFacade({
		path: join(root, '.cache/delendai/telemetry/duration-history.sqlite'),
	});
	try {
		await drainTelemetryJournals({ root, events, history });
		const all = (
			await Promise.all(
				proposals
					.flatMap(workItemsOf)
					.map((item) =>
						events.listByWorkItem(
							item.workItemId as Parameters<
								typeof events.listByWorkItem
							>[0],
						),
					),
			)
		).flat();
		const now = Date.now();
		const rows = buildWorkStatus({ proposals, events: all, now });
		const agents = activeAgents(all, now);
		return {
			text: renderWorkStatus(
				hasFlag(args, 'agents') ? [] : rows,
				agents,
				now,
			),
			data: { rows, agents },
		};
	} finally {
		events.close();
		history.close();
	}
};

/** Run `work progress [--watch] [--agents]`; `--json` gives the rows. */
export const runWorkProgress = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	// The store belongs to the shared checkout, whichever unit asks.
	const root = sharedCheckoutOf(ctx.cwd) ?? ctx.cwd;
	if (!hasFlag(args, 'watch')) {
		const once = await view(root, args, ctx);
		return ctx.globals.json
			? { code: 0, data: once.data }
			: { code: 0, text: once.text };
	}
	let last = '';
	const draw = async (): Promise<void> => {
		const next = (await view(root, args, ctx)).text;
		// Redraw only what changed, so the terminal does not flicker.
		if (next === last) return;
		last = next;
		process.stdout.write(`\u001b[2J\u001b[H${next}\n`);
	};
	await draw();
	await new Promise<void>((resolve) => {
		const timer = setInterval(() => void draw(), WATCH_INTERVAL_MS);
		process.once('SIGINT', () => {
			clearInterval(timer);
			resolve();
		});
	});
	return { code: 0, suppressDefaultPrint: true };
};
