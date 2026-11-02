/**
 * work-event-journal-drain.service.ts — q00020.
 *
 * Published code cannot depend on this private package, so it journals
 * each work event as one JSON line under the cache directory. This is
 * the pick-up: it claims the journal (see `journal-claim.helper`),
 * appends every valid line to the event bus and deletes the claimed file.
 * Lines written while it runs land in a fresh journal for the next drain;
 * a line the bus refused goes back to the journal for the next one.
 */

import { appendFile, readFile, rm } from 'node:fs/promises';

import { claimJournal } from '../drain/journal-claim.helper';

import type {
	IWorkEventDrainResult,
	IWorkEventSink,
} from './contracts/interfaces/work-event-journal-drain.interface';
import {
	asWorkItemId,
	isWorkEventKind,
	type INewWorkEvent,
} from './work-event';

const NOTHING_DRAINED: IWorkEventDrainResult = {
	appended: 0,
	skipped: 0,
	retained: 0,
};

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

export const drainWorkEventJournal = async (
	sink: IWorkEventSink,
	journalPath: string,
): Promise<IWorkEventDrainResult> => {
	const claimed = await claimJournal(journalPath);
	if (claimed === undefined) return NOTHING_DRAINED;
	const text = await readFile(claimed, 'utf8');
	let appended = 0;
	let skipped = 0;
	// Lines the bus could not take now: a transient failure must not
	// retire the only copy of an event.
	const retained: string[] = [];
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
			retained.push(raw);
		}
	}
	if (retained.length > 0)
		await appendFile(journalPath, `${retained.join('\n')}\n`, 'utf8');
	await rm(claimed, { force: true });
	return { appended, skipped, retained: retained.length };
};
