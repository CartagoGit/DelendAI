/**
 * test-journal.service.ts — the first collector (q00014 S4).
 *
 * It instruments nothing. The test failure journal (q00014 S2) already
 * writes one JSON line per run to
 * `.cache/delendai/results/logs/test-runs.jsonl`, including every
 * failure with its file, its full name and its kind. That file is the
 * cheapest evidence this project produces about itself and, until now,
 * only a human reading it ever benefited.
 *
 * The mapping is deliberately narrow:
 *
 *   - a FAILED run contributes one `test-failure` observation per
 *     failure, keyed by the test's full name, because that is the
 *     identity a lesson can be about ("this spec fails after touching
 *     core");
 *   - a PASSED run contributes ONE `command-outcome` observation. A
 *     store that only ever hears about failures cannot answer "does
 *     this usually work?", which is most of what an arriving agent
 *     wants to know.
 *
 * Nothing here reads a diff, a message or a stack. Those are the parts
 * of a journal entry that carry source text, and an observation is a
 * fact about what happened, not a copy of the output.
 */

import type {
	IObservation,
	IWorkspaceTextReader,
} from '../contracts/interfaces/observation.interface';

/** What this collector reads out of a journal line. Deliberately partial. */
interface IJournalEntryShape {
	readonly timestamp?: unknown;
	readonly result?: unknown;
	readonly command?: unknown;
	readonly failures?: unknown;
}

interface IJournalFailureShape {
	readonly file?: unknown;
	readonly fullName?: unknown;
	readonly name?: unknown;
	readonly kind?: unknown;
}

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Epoch milliseconds for a journal timestamp, or `undefined`.
 *
 * An entry whose time cannot be read is dropped rather than stamped
 * with "now": recency is half of what makes a lesson true, and a wrong
 * timestamp is worse than a missing observation.
 */
const atMsOf = (timestamp: unknown): number | undefined => {
	const text = asString(timestamp);
	if (text === undefined) return undefined;
	const parsed = Date.parse(text);
	return Number.isNaN(parsed) ? undefined : parsed;
};

/** Turn one journal line into observations. Never throws. */
export const observationsFromJournalLine = (
	line: string,
): readonly IObservation[] => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [];
	}
	if (typeof parsed !== 'object' || parsed === null) return [];
	const entry = parsed as IJournalEntryShape;
	const atMs = atMsOf(entry.timestamp);
	if (atMs === undefined) return [];

	const command = asString(entry.command) ?? 'test';
	if (entry.result === 'pass') {
		return [
			{
				kind: 'command-outcome',
				subject: command,
				outcome: 'ok',
				atMs,
				source: 'test-journal',
			},
		];
	}
	if (entry.result !== 'fail') return [];

	const out: IObservation[] = [
		{
			kind: 'command-outcome',
			subject: command,
			outcome: 'fail',
			atMs,
			source: 'test-journal',
		},
	];
	const failures = Array.isArray(entry.failures) ? entry.failures : [];
	for (const raw of failures) {
		if (typeof raw !== 'object' || raw === null) continue;
		const failure = raw as IJournalFailureShape;
		const subject =
			asString(failure.fullName) ?? asString(failure.name) ?? undefined;
		if (subject === undefined) continue;
		const file = asString(failure.file);
		const kind = asString(failure.kind);
		out.push({
			kind: 'test-failure',
			subject,
			outcome: 'fail',
			atMs,
			source: 'test-journal',
			// The file and the failure's kind, and nothing else: no
			// message, no diff, no stack. Those carry source text.
			...(file !== undefined
				? { detail: kind === undefined ? file : `${file} (${kind})` }
				: {}),
		});
	}
	return out;
};

/**
 * Read a whole journal file into observations.
 *
 * A missing journal is not an error — it is a project that has not run
 * its tests through the reporter yet, which is the normal state of a
 * fresh clone.
 */
export const collectFromTestJournal = async (
	journalPath: string,
	readText: IWorkspaceTextReader,
): Promise<readonly IObservation[]> => {
	const raw = await readText(journalPath);
	if (raw === null) return [];
	return raw.split('\n').flatMap((line) => observationsFromJournalLine(line));
};
