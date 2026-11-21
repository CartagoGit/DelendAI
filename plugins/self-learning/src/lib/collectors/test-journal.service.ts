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
	readonly budgetWarnings?: unknown;
}

/** One time-budget warning the runner recorded (x01101 S3). */
interface IJournalBudgetWarningShape {
	readonly file?: unknown;
	readonly fullName?: unknown;
	readonly name?: unknown;
	readonly normalizedMs?: unknown;
	readonly estimateMs?: unknown;
	readonly causes?: unknown;
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

const asFiniteNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * A budget warning as an observation: the test id, the normalized time
 * and the estimate, and nothing else the journal holds. A warning with
 * no readable time or estimate says nothing about the budget and is
 * dropped.
 */
const budgetWarningOf = (
	raw: unknown,
	atMs: number,
): IObservation | undefined => {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const warning = raw as IJournalBudgetWarningShape;
	const subject = asString(warning.fullName) ?? asString(warning.name);
	const normalizedMs = asFiniteNumber(warning.normalizedMs);
	const estimateMs = asFiniteNumber(warning.estimateMs);
	if (
		subject === undefined ||
		normalizedMs === undefined ||
		estimateMs === undefined
	)
		return undefined;
	const causes = (Array.isArray(warning.causes) ? warning.causes : [])
		.filter((cause): cause is string => typeof cause === 'string')
		.map((cause) => cause.replace(/[^a-z0-9-]/gi, ''))
		.filter((cause) => cause.length > 0);
	const file = asString(warning.file);
	const parts = [
		...(file === undefined ? [] : [file]),
		`normalizedMs=${String(Math.round(normalizedMs))}`,
		`estimateMs=${String(Math.round(estimateMs))}`,
		...(causes.length === 0 ? [] : [`causes=${causes.join(',')}`]),
	];
	return {
		kind: 'budget-warning',
		subject,
		outcome: 'fail',
		atMs,
		source: 'test-journal',
		detail: parts.join(' '),
	};
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
	const warnings = (
		Array.isArray(entry.budgetWarnings) ? entry.budgetWarnings : []
	).flatMap((raw) => budgetWarningOf(raw, atMs) ?? []);
	if (entry.result === 'pass') {
		return [
			{
				kind: 'command-outcome',
				subject: command,
				outcome: 'ok',
				atMs,
				source: 'test-journal',
			},
			...warnings,
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
	return [...out, ...warnings];
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
