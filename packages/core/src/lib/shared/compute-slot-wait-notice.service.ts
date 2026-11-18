/**
 * compute-slot-wait-notice.service.ts — what a caller waiting for the
 * machine's compute slot is told, and when.
 *
 * The notice appears only once the wait outlasts its delay. It names the
 * holder, and names each new holder once as turns pass: a wait outlives
 * several turns, and a notice that named only the first holder read as
 * stale once that one had finished. The owner record is rewritten at every
 * turn, so its change, heard through a watch and not a timer, is what says
 * the holder moved on.
 */
import { type FSWatcher, watch } from 'node:fs';
import { basename, dirname } from 'node:path';

import { NO_RECORDED_HOLDER } from '../contracts/constants/compute-slot.constant';
import {
	laneNotice,
	ownerFile,
	readLane,
	slotHolderOf,
} from './compute-slot-lane.service';

export const createWaitNotice = (input: {
	readonly lockPath: string;
	readonly label: string;
	readonly urgent: string | undefined;
	readonly delayMs: number;
	readonly notify: (message: string) => void;
}): { readonly end: () => boolean } => {
	const { lockPath, label, urgent, notify } = input;
	let waiting = false;
	let told: string | undefined;
	let watcher: FSWatcher | undefined;
	// One look at a time, in order, so an older read never announces a
	// holder that a newer one has already replaced.
	let looking: Promise<void> = Promise.resolve();
	const tell = (): void => {
		looking = looking
			.then(async () => {
				const [holder, lane] = await Promise.all([
					slotHolderOf(lockPath),
					readLane(lockPath),
				]);
				if (!waiting || holder === told) return;
				// Between two turns, or before the first holder wrote its
				// record, nobody is named: the watch hears the record when it
				// comes. Only a waiter with no watch says so rather than nothing.
				if (holder === NO_RECORDED_HOLDER && watcher !== undefined)
					return;
				told = holder;
				notify(
					`[compute-slot] "${label}" is waiting — ${holder} holds the machine's compute slot.${urgent === undefined ? '' : ` This turn is urgent (${urgent}): it goes next.`}${laneNotice(lane)} Waiting my turn...`,
				);
			})
			.catch(() => undefined);
	};
	let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
		timer = undefined;
		waiting = true;
		const owner = basename(ownerFile(lockPath));
		try {
			watcher = watch(dirname(lockPath), (_event, name) => {
				if (name === owner) tell();
			});
			watcher.unref();
		} catch {
			// No watch on this filesystem: the first notice stands alone.
		}
		tell();
	}, input.delayMs);
	return {
		/** Stop telling; whether the caller had been told it was waiting. */
		end: () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			watcher?.close();
			watcher = undefined;
			const was = waiting;
			waiting = false;
			return was;
		},
	};
};
