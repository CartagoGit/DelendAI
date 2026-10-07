/**
 * duration-journal.ts — q00020 F3 S2.
 *
 * The proposals plugin cannot depend on this package (it is published,
 * this one is not), so it journals each finished stretch of work as one
 * JSON line and leaves the history to pick the lines up. This module is
 * that pick-up: it claims the journal by renaming it, records every
 * line into the duration history, and deletes the claimed file. Lines
 * that arrive while it runs land in a fresh journal for the next drain.
 */

import { readFile, rename, rm } from 'node:fs/promises';

import {
	recordTransitionDuration,
	type IDurationHistoryStore,
} from './duration-history';
import type { IDrainResult } from './contracts/interfaces/duration-journal.interface';
import { computeFeatureVector } from './feature-vector';

const CLAIMED_SUFFIX = '.draining';

interface IJournalLine {
	readonly to: string;
	readonly features: Record<string, number>;
	readonly actorProfile: string;
	readonly taskKind: string;
	readonly durationMs: number;
	readonly createdAt: number;
}

const isJournalLine = (value: unknown): value is IJournalLine => {
	if (typeof value !== 'object' || value === null) return false;
	const line = value as Record<string, unknown>;
	return (
		typeof line.to === 'string' &&
		typeof line.actorProfile === 'string' &&
		typeof line.taskKind === 'string' &&
		typeof line.durationMs === 'number' &&
		typeof line.createdAt === 'number' &&
		typeof line.features === 'object' &&
		line.features !== null
	);
};

const parseLine = (text: string): IJournalLine | undefined => {
	try {
		const parsed: unknown = JSON.parse(text);
		return isJournalLine(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
};

export const drainTransitionDurationJournal = async (
	store: Pick<IDurationHistoryStore, 'recordDuration'>,
	journalPath: string,
): Promise<IDrainResult> => {
	const claimed = `${journalPath}${CLAIMED_SUFFIX}`;
	try {
		await rename(journalPath, claimed);
	} catch {
		// No journal, or another drain holds it: nothing to do now.
		return { recorded: 0, skipped: 0 };
	}
	const text = await readFile(claimed, 'utf8');
	let recorded = 0;
	let skipped = 0;
	for (const raw of text.split('\n')) {
		if (raw.trim() === '') continue;
		const line = parseLine(raw);
		if (line === undefined) {
			skipped += 1;
			continue;
		}
		const result = recordTransitionDuration(store, {
			to: line.to,
			vector: computeFeatureVector(line.features),
			actorProfile: line.actorProfile,
			taskKind: line.taskKind,
			durationMs: line.durationMs,
			createdAt: line.createdAt,
		});
		if (result.recorded) recorded += 1;
		else skipped += 1;
	}
	await rm(claimed, { force: true });
	return { recorded, skipped };
};
