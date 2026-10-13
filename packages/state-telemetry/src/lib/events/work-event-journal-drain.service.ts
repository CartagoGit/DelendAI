/**
 * work-event-journal-drain.service.ts — q00020.
 *
 * Published code cannot depend on this private package, so it journals
 * each work event as one JSON line under the cache directory. This is
 * the pick-up: it claims the journal by renaming it, appends every valid
 * line to the event bus and deletes the claimed file. Lines written while
 * it runs land in a fresh journal for the next drain.
 */

import { readFile, rename, rm } from 'node:fs/promises';

import type {
	IWorkEventDrainResult,
	IWorkEventSink,
} from './contracts/interfaces/work-event-journal-drain.interface';
import {
	asWorkItemId,
	isWorkEventKind,
	type INewWorkEvent,
} from './work-event';

const CLAIMED_SUFFIX = '.draining';

const NOTHING_DRAINED: IWorkEventDrainResult = { appended: 0, skipped: 0 };

const toEvent = (text: string): INewWorkEvent | undefined => {
	try {
		const line = JSON.parse(text) as Record<string, unknown>;
		if (
			typeof line.work_item_id !== 'string' ||
			typeof line.payload_hash !== 'string' ||
			typeof line.created_at !== 'number' ||
			!isWorkEventKind(line.kind)
		) {
			return undefined;
		}
		return {
			work_item_id: asWorkItemId(line.work_item_id),
			actor_id: typeof line.actor_id === 'string' ? line.actor_id : null,
			kind: line.kind,
			payload_hash: line.payload_hash,
			created_at: line.created_at,
		};
	} catch {
		return undefined;
	}
};

/**
 * A claimed file a crashed drain left behind is taken up first, so no
 * line is lost between two runs.
 */
const claim = async (journalPath: string): Promise<string | undefined> => {
	const claimed = `${journalPath}${CLAIMED_SUFFIX}`;
	try {
		await readFile(claimed, 'utf8');
		return claimed;
	} catch {
		// No leftover claim: take the live journal.
	}
	try {
		await rename(journalPath, claimed);
		return claimed;
	} catch {
		return undefined;
	}
};

export const drainWorkEventJournal = async (
	sink: IWorkEventSink,
	journalPath: string,
): Promise<IWorkEventDrainResult> => {
	const claimed = await claim(journalPath);
	if (claimed === undefined) return NOTHING_DRAINED;
	const text = await readFile(claimed, 'utf8');
	let appended = 0;
	let skipped = 0;
	for (const raw of text.split('\n')) {
		if (raw.trim() === '') continue;
		const event = toEvent(raw);
		if (event === undefined) {
			skipped += 1;
			continue;
		}
		try {
			await sink.append(event);
			appended += 1;
		} catch {
			skipped += 1;
		}
	}
	await rm(claimed, { force: true });
	return { appended, skipped };
};
