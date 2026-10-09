import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { WORK_EVENT_JOURNAL_PATH } from '../contracts/constants/work-event-journal.constant';
import type {
	IWorkEventJournalEntry,
	IWorkEventJournalLine,
} from '../contracts/interfaces/work-event-journal.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { sharedCheckout } from '../shared/shared-checkout';
import { scalarArg } from './command-args.helper';
import { agentFor } from './work-unit-shared.service';

/** Sorted keys, so the same facts always hash the same. */
const hashOf = (detail: IWorkEventJournalEntry['detail']): string =>
	createHash('sha256')
		.update(
			JSON.stringify(
				Object.entries(detail ?? {}).sort(([a], [b]) =>
					a.localeCompare(b),
				),
			),
		)
		.digest('hex');

/** The journal file of the project `root` belongs to, worktree or not. */
export const workEventJournalPath = (root: string): string =>
	resolve(sharedCheckout(root) ?? root, WORK_EVENT_JOURNAL_PATH);

/**
 * Record that something happened to a unit of work.
 *
 * WHY a journal and not the event store: the store lives in a private
 * package this one may not depend on, so published code appends one JSON
 * line and the private side reads it later. One `appendFile` of a short
 * line is atomic enough for concurrent writers, and a failure to record
 * is swallowed: observing the work must never fail it.
 */
export const journalWorkEvent = async (
	root: string,
	entry: IWorkEventJournalEntry,
	now: () => number = Date.now,
): Promise<boolean> => {
	const line: IWorkEventJournalLine = {
		work_item_id: `${entry.proposal}/${entry.slice}`,
		actor_id: entry.actor,
		kind: entry.kind,
		payload_hash: hashOf(entry.detail),
		created_at: now(),
	};
	try {
		const path = workEventJournalPath(root);
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(line)}\n`, 'utf8');
		return true;
	} catch {
		return false;
	}
};

/** A unit that was entered is a slice claimed; a refusal claimed nothing. */
export const journalEnteredUnit = async (
	root: string,
	args: readonly string[],
	entry: IWorkUnitResult,
): Promise<void> => {
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	if (entry.code !== EXIT_CODE.OK) return;
	if (proposal === undefined || slice === undefined) return;
	await journalWorkEvent(root, {
		kind: 'slice_claimed',
		proposal,
		slice,
		actor: agentFor(args),
		detail: { unitKind: scalarArg(args, 'kind') ?? 'implement' },
	});
};
