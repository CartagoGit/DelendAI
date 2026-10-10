/**
 * The work status view: per open proposal, how far its slices are, which
 * phase holds it back and when something last happened; and which agents
 * the events show at work.
 *
 * Pure. The proposals and the events are handed in, so the same answer
 * serves a terminal, a status bar and a host that prints it in a chat,
 * and none of them needs a model to compute it.
 */
import type { IWorkEvent } from '../events/work-event';
import type {
	IWorkItemInput,
	IWorkPhase,
} from '../projector/contracts/interfaces/work-progress.interface';
import { phaseRank } from '../projector/phase-inference.service';
import { aggregateProgress } from '../projector/progress-weighting.service';
import { createWorkProgressService } from '../projector/work-progress-api.service';
import {
	ACTIVE_AGENT_WINDOW_MS,
	FULL_PROGRESS,
	PROGRESS_BAR_WIDTH,
} from './contracts/constants/work-status.constant';
import type {
	IWorkAgentRow,
	IWorkStatusInput,
	IWorkStatusProposal,
	IWorkStatusRow,
} from './contracts/interfaces/work-status.interface';

const SLICE_HEADING = /^### (S\d+)\b[^\n]*$/gmu;
const STATUS_LINE = /^- \*\*Status\*\*:\s*([a-z-]+)/mu;
const ACCEPTANCE_ITEM = /^ {2}- /gmu;

const ITEM_STATUS: Readonly<Record<string, IWorkItemInput['status']>> = {
	pending: 'open',
	'in-progress': 'in-progress',
	review: 'review',
	done: 'done',
	blocked: 'blocked',
};

/** The slices of one proposal document as work items; retired ones are left out. */
export const workItemsOf = (
	proposal: IWorkStatusProposal,
): readonly IWorkItemInput[] => {
	const headings = [...proposal.markdown.matchAll(SLICE_HEADING)];
	return headings.flatMap((heading, index) => {
		const start = heading.index ?? 0;
		const end = headings[index + 1]?.index ?? proposal.markdown.length;
		const block = proposal.markdown.slice(start, end);
		const status = ITEM_STATUS[STATUS_LINE.exec(block)?.[1] ?? ''];
		if (status === undefined) return [];
		const acceptanceCount = Math.max(
			1,
			[...block.matchAll(ACCEPTANCE_ITEM)].length,
		);
		return [
			{
				workItemId: `${proposal.id}/${heading[1] ?? ''}`,
				acceptanceCount,
				// A document says whether a slice was delivered, not which of
				// its acceptance lines: one handed to review delivered them all
				// and waits for a verdict, which its phase says.
				acceptanceDone:
					status === 'done' || status === 'review'
						? acceptanceCount
						: 0,
				status,
			},
		];
	});
};

/** The least advanced phase a slice can be in, given what its document says. */
const PHASE_FLOOR: Readonly<
	Partial<Record<IWorkItemInput['status'], IWorkPhase>>
> = { review: 'reviewing', done: 'done', blocked: 'blocked' };

/** One row per proposal that has slices, in the order given. */
export const buildWorkStatus = (
	input: IWorkStatusInput,
): readonly IWorkStatusRow[] => {
	const service = createWorkProgressService({ now: () => input.now });
	const items = input.proposals.flatMap(workItemsOf);
	const known = new Set(items.map((item) => item.workItemId));
	service.load(
		input.events.filter((event) => known.has(event.work_item_id)),
		items,
	);
	service.flush();
	const statusOf = new Map(
		items.map((item) => [item.workItemId, item.status]),
	);
	return input.proposals.flatMap((proposal) => {
		// Events say how far work got; the document can only say further.
		const snapshots = service
			.getSnapshotsForProposal(proposal.id)
			.map((snapshot) => {
				const floor =
					PHASE_FLOOR[statusOf.get(snapshot.workItemId) ?? 'open'];
				return floor === undefined ||
					floor === 'blocked' ||
					phaseRank(snapshot.phase) >= phaseRank(floor)
					? floor === 'blocked'
						? { ...snapshot, phase: floor }
						: snapshot
					: { ...snapshot, phase: floor };
			});
		if (snapshots.length === 0) return [];
		// The proposal is as far as its furthest-behind slice that still moves.
		const moving = snapshots.filter(
			(snapshot) => snapshot.phase !== 'done',
		);
		const behind = [...(moving.length > 0 ? moving : snapshots)].sort(
			(left, right) => phaseRank(left.phase) - phaseRank(right.phase),
		)[0];
		return [
			{
				proposalId: proposal.id,
				title: proposal.title,
				progress: aggregateProgress(
					snapshots.map((snapshot) => ({
						sliceId: snapshot.sliceId,
						progress: snapshot.progress,
						weight: snapshot.weight,
					})),
				),
				phase: behind?.phase ?? 'done',
				slices: snapshots.length,
				stalled: snapshots.filter((snapshot) => snapshot.stalled)
					.length,
				lastEventAt: Math.max(
					0,
					...snapshots.map((snapshot) => snapshot.lastEventAt),
				),
				snapshots,
			},
		];
	});
};

/** The agents whose last event falls inside the window, most recent first. */
export const activeAgents = (
	events: readonly IWorkEvent[],
	now: number,
	windowMs: number = ACTIVE_AGENT_WINDOW_MS,
): readonly IWorkAgentRow[] => {
	const latest = new Map<string, IWorkEvent>();
	for (const event of events) {
		if (event.actor_id === null) continue;
		const seen = latest.get(event.actor_id);
		if (seen === undefined || event.created_at >= seen.created_at) {
			latest.set(event.actor_id, event);
		}
	}
	return [...latest.entries()]
		.filter(([, event]) => now - event.created_at <= windowMs)
		.sort(([, left], [, right]) => right.created_at - left.created_at)
		.map(([agentId, event]) => ({
			agentId,
			workItemId: event.work_item_id,
			lastKind: event.kind,
			lastEventAt: event.created_at,
		}));
};

const bar = (progress: number): string => {
	const filled = Math.round(
		(Math.min(FULL_PROGRESS, Math.max(0, progress)) / FULL_PROGRESS) *
			PROGRESS_BAR_WIDTH,
	);
	return `${'#'.repeat(filled)}${'.'.repeat(PROGRESS_BAR_WIDTH - filled)}`;
};

const ago = (at: number, now: number): string => {
	if (at === 0) return 'no event yet';
	const minutes = Math.max(0, Math.round((now - at) / 60_000));
	if (minutes < 60) return `${String(minutes)}m ago`;
	const hours = Math.round(minutes / 60);
	return hours < 48
		? `${String(hours)}h ago`
		: `${String(Math.round(hours / 24))}d ago`;
};

/** The view as fixed-width lines, the same on every call with the same input. */
export const renderWorkStatus = (
	rows: readonly IWorkStatusRow[],
	agents: readonly IWorkAgentRow[],
	now: number,
): string => {
	const lines =
		rows.length === 0
			? ['No open proposal has slices to show.']
			: rows.map(
					(row) =>
						`${row.proposalId.padEnd(8)} [${bar(row.progress)}] ${String(Math.round(row.progress)).padStart(3)}%  ${row.phase.padEnd(12)} ${String(row.slices).padStart(2)} slice(s)${row.stalled > 0 ? `, ${String(row.stalled)} stalled` : ''}  ${ago(row.lastEventAt, now)}  ${row.title}`,
				);
	const working =
		agents.length === 0
			? ['', 'No agent has left an event in the last half hour.']
			: [
					'',
					...agents.map(
						(agent) =>
							`${agent.agentId.padEnd(22)} ${agent.workItemId.padEnd(14)} ${agent.lastKind.padEnd(20)} ${ago(agent.lastEventAt, now)}`,
					),
				];
	return [...lines, ...working].join('\n');
};
