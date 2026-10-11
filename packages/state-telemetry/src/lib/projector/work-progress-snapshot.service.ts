import type { IWorkEvent } from '../events/work-event';
import { computeConfidence, uncertaintyOf } from './confidence-model.service';
import {
	ATTEMPT_EVENT_KINDS,
	EMPTY_FOLD,
	CONFIDENCE_WINDOW,
	FAILURE_EVENT_KINDS,
	STALLED_FAILURE_THRESHOLD_DEFAULT,
} from './contracts/constants/work-progress.constant';
import type {
	IWorkItemInput,
	IWorkProgressFold,
	IWorkProgressOptions,
	IWorkProgressRow,
	IWorkProgressSnapshot,
	IWorkPhase,
} from './contracts/interfaces/work-progress.interface';
import {
	advanceRank,
	inferPhase,
	phaseAtRank,
	phaseRank,
} from './phase-inference.service';
import { resolvePhaseRules } from './phase-rules.service';
import { sliceProgress, sliceWeight } from './progress-weighting.service';

/** Canonical order of a stream: by time, then by the store's id. */
export const compareEvents = (a: IWorkEvent, b: IWorkEvent): number =>
	a.created_at - b.created_at || (a.id ?? 0) - (b.id ?? 0);

/** One step of the left fold. Pure: the same fold and event always give the same result. */
export const foldEvent = (
	fold: IWorkProgressFold,
	event: IWorkEvent,
	options: IWorkProgressOptions = {},
): IWorkProgressFold => {
	const implied = inferPhase(
		resolvePhaseRules(options.rules),
		event.kind,
		fold.lastKind,
	);
	const rank = advanceRank(fold.phaseRank, implied);
	// An ambiguous event carries the running phase, so it never adds variance.
	const eventRank = implied === undefined ? rank : phaseRank(implied);
	const isFailure = FAILURE_EVENT_KINDS.includes(event.kind);
	const startsAttempt = ATTEMPT_EVENT_KINDS.includes(event.kind);
	let failureRun = fold.failureRun;
	let lastFailureHash = fold.lastFailureHash;
	if (isFailure) {
		failureRun =
			lastFailureHash === event.payload_hash ? failureRun + 1 : 1;
		lastFailureHash = event.payload_hash;
	} else if (startsAttempt) {
		failureRun = 0;
		lastFailureHash = null;
	}
	return {
		phaseRank: rank,
		recentRanks: [...fold.recentRanks, eventRank].slice(-CONFIDENCE_WINDOW),
		lastKind: event.kind,
		lastFailureHash,
		failureRun,
		eventCount: fold.eventCount + 1,
		lastEventAt: Math.max(fold.lastEventAt, event.created_at),
	};
};

export const foldEvents = (
	fold: IWorkProgressFold,
	events: readonly IWorkEvent[],
	options: IWorkProgressOptions = {},
): IWorkProgressFold =>
	events.reduce((acc, event) => foldEvent(acc, event, options), fold);

const splitWorkItemId = (
	id: string,
): { proposalId: string; sliceId: string } => {
	const at = id.indexOf('/');
	return at < 0
		? { proposalId: id, sliceId: '' }
		: { proposalId: id.slice(0, at), sliceId: id.slice(at + 1) };
};

/** An item the host did not describe: no criteria, still open. */
export const unknownItem = (workItemId: string): IWorkItemInput => ({
	workItemId,
	acceptanceCount: 0,
	acceptanceDone: 0,
	status: 'open',
});

const terminalPhase = (
	status: IWorkItemInput['status'],
): IWorkPhase | undefined =>
	status === 'done' ? 'done' : status === 'blocked' ? 'blocked' : undefined;

/** Derive the public snapshot from a fold and the plain item facts. */
export const deriveSnapshot = (
	item: IWorkItemInput,
	fold: IWorkProgressFold,
	options: IWorkProgressOptions = {},
): IWorkProgressSnapshot => {
	const threshold =
		options.stalledThreshold ?? STALLED_FAILURE_THRESHOLD_DEFAULT;
	const confidence = computeConfidence(fold.recentRanks, {
		count: item.acceptanceCount,
		done: item.acceptanceDone,
	});
	return {
		workItemId: item.workItemId,
		...splitWorkItemId(item.workItemId),
		phase: terminalPhase(item.status) ?? phaseAtRank(fold.phaseRank),
		progress: sliceProgress(item),
		weight: sliceWeight(item),
		confidence,
		uncertainty: uncertaintyOf(confidence),
		stalled: fold.failureRun >= threshold,
		eventCount: fold.eventCount,
		lastEventAt: fold.lastEventAt,
	};
};

export const buildRow = (
	item: IWorkItemInput,
	fold: IWorkProgressFold,
	options: IWorkProgressOptions = {},
): IWorkProgressRow => ({
	snapshot: deriveSnapshot(item, fold, options),
	fold,
});

const byWorkItemId = (a: IWorkProgressRow, b: IWorkProgressRow): number =>
	a.snapshot.workItemId.localeCompare(b.snapshot.workItemId);

const groupByItem = (
	events: readonly IWorkEvent[],
): Map<string, IWorkEvent[]> => {
	const groups = new Map<string, IWorkEvent[]>();
	for (const event of [...events].sort(compareEvents)) {
		const list = groups.get(event.work_item_id) ?? [];
		list.push(event);
		groups.set(event.work_item_id, list);
	}
	return groups;
};

/** Build every row from scratch, ordered by work item id. */
export const rebuildRows = (
	events: readonly IWorkEvent[],
	items: readonly IWorkItemInput[],
	options: IWorkProgressOptions = {},
): readonly IWorkProgressRow[] => {
	const groups = groupByItem(events);
	const byId = new Map(items.map((item) => [item.workItemId, item]));
	const ids = new Set<string>([...byId.keys(), ...groups.keys()]);
	return [...ids]
		.map((id) =>
			buildRow(
				byId.get(id) ?? unknownItem(id),
				foldEvents(EMPTY_FOLD, groups.get(id) ?? [], options),
				options,
			),
		)
		.sort(byWorkItemId);
};

/**
 * Apply appended events on top of a base. Only the rows of the touched
 * work items are rebuilt; every other row is carried over as it was. The
 * delta must be later than everything the base has folded.
 */
export const reconcileRows = (
	base: readonly IWorkProgressRow[],
	delta: readonly IWorkEvent[],
	items: readonly IWorkItemInput[],
	options: IWorkProgressOptions = {},
): readonly IWorkProgressRow[] => {
	const groups = groupByItem(delta);
	const byId = new Map(items.map((item) => [item.workItemId, item]));
	const rows = new Map(base.map((row) => [row.snapshot.workItemId, row]));
	for (const [id, list] of groups) {
		const previous = rows.get(id)?.fold ?? EMPTY_FOLD;
		rows.set(
			id,
			buildRow(
				byId.get(id) ?? unknownItem(id),
				foldEvents(previous, list, options),
				options,
			),
		);
	}
	return [...rows.values()].sort(byWorkItemId);
};
