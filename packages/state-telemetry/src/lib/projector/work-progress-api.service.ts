import type { IWorkEvent } from '../events/work-event';
import { SUBSCRIBE_COALESCE_INTERVAL_MS } from './contracts/constants/work-progress.constant';
import type {
	IWorkItemInput,
	IWorkProgressRow,
	IWorkProgressService,
	IWorkProgressServiceOptions,
	IWorkProgressSnapshot,
	ISnapshotListener,
} from './contracts/interfaces/work-progress.interface';
import { rebuildRows, reconcileRows } from './work-progress-snapshot.service';

/**
 * The read side of the projector: holds the current rows, answers
 * lookups and notifies subscribers. Back-pressure is coalescing: a work
 * item is delivered at most once per interval, and while it waits only
 * its newest snapshot is kept.
 */
export const createWorkProgressService = (
	options: IWorkProgressServiceOptions,
): IWorkProgressService => {
	const interval =
		options.coalesceIntervalMs ?? SUBSCRIBE_COALESCE_INTERVAL_MS;
	let items: readonly IWorkItemInput[] = [];
	let rows: readonly IWorkProgressRow[] = [];
	const listeners = new Set<ISnapshotListener>();
	const lastDelivery = new Map<string, number>();
	const held = new Map<string, IWorkProgressSnapshot>();

	const deliver = (snapshot: IWorkProgressSnapshot): void => {
		lastDelivery.set(snapshot.workItemId, options.now());
		held.delete(snapshot.workItemId);
		for (const listener of [...listeners]) listener(snapshot);
	};

	const offer = (snapshot: IWorkProgressSnapshot): void => {
		const last = lastDelivery.get(snapshot.workItemId);
		if (last === undefined || options.now() - last >= interval)
			deliver(snapshot);
		else held.set(snapshot.workItemId, snapshot);
	};

	const snapshots = (): readonly IWorkProgressSnapshot[] =>
		rows.map((row) => row.snapshot);

	return {
		load(
			events: readonly IWorkEvent[],
			nextItems: readonly IWorkItemInput[],
		): void {
			items = nextItems;
			rows = rebuildRows(events, items, options);
		},
		append(events: readonly IWorkEvent[]): void {
			const touched = new Set(
				events.map((event) => event.work_item_id as string),
			);
			rows = reconcileRows(rows, events, items, options);
			for (const row of rows)
				if (touched.has(row.snapshot.workItemId)) offer(row.snapshot);
		},
		getSnapshot: (workItemId: string) =>
			snapshots().find((s) => s.workItemId === workItemId),
		getSnapshotsForProposal: (proposalId: string) =>
			snapshots().filter((s) => s.proposalId === proposalId),
		subscribe(listener: ISnapshotListener): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		flush(): void {
			for (const snapshot of [...held.values()]) {
				const last = lastDelivery.get(snapshot.workItemId) ?? 0;
				if (options.now() - last >= interval) deliver(snapshot);
			}
		},
	};
};
