/**
 * observation-store.service.ts — the append-only, bounded record of
 * what this project has already taught us (q00014 S4).
 *
 * Three properties, and each of them is a decision rather than a detail:
 *
 *  1. **Append-only, JSONL.** One line per observation, so a partially
 *     written file loses the last line and nothing else. A JSON array
 *     would have to be read, parsed and rewritten whole on every write,
 *     and a crash mid-rewrite loses everything the project has learned.
 *  2. **Bounded.** `maxObservations` is enforced on write by dropping
 *     the oldest. A store that grows forever is not a cache; it becomes
 *     a file nobody can read and a cost nobody accounted for.
 *  3. **Never throws for an expected failure.** A missing file is an
 *     empty store; a corrupt line is skipped. Learning is an
 *     optimisation — it must never be able to fail the work it exists
 *     to make cheaper.
 *
 * The store is per project (`<cacheDir>/self-learning/observations.jsonl`)
 * and never leaves it. Nothing here sends anything anywhere.
 */

// effect-boundary-authorized: this module IS the persistence adapter for
// one JSONL file inside the plugin's own cache directory, and the effect
// broker has no filesystem effect to route a write through — only git.
// Reads do not come through here at all: they are injected
// (`IWorkspaceTextReader`) and the plugin fills that seam with the host's
// SafeWorkspaceReader, which is what containment is enforced by.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { realpathContained, writeFileAtomic } from '@delendai/core/public';

import {
	OBSERVATION_KINDS,
	type IObservation,
	type IObservationQuery,
	type IObservationStoreOptions,
	type IObservationWriteResult,
	type IObservationKind,
} from '../contracts/interfaces/observation.interface';

/** Default ceiling: about a month of a busy project at a few dozen a day. */
const DEFAULT_MAX_OBSERVATIONS = 5_000;

/** Longest `detail` kept. Anything longer is a log, not an observation. */
const MAX_DETAIL_LENGTH = 240;

const KIND_SET: ReadonlySet<string> = new Set(OBSERVATION_KINDS);

const isKind = (value: unknown): value is IObservationKind =>
	typeof value === 'string' && KIND_SET.has(value);

/**
 * Parse one stored line, or `null` when it is not an observation.
 *
 * Tolerant by design: a line half-written by a killed process, or one
 * from a future version with an unknown `kind`, is skipped. The
 * alternative — throwing — would make one bad byte cost the whole
 * store.
 */
export const parseObservation = (line: string): IObservation | null => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const record = parsed as Record<string, unknown>;
	if (!isKind(record.kind)) return null;
	if (typeof record.subject !== 'string' || record.subject.length === 0)
		return null;
	if (typeof record.atMs !== 'number' || !Number.isFinite(record.atMs))
		return null;
	const outcome = record.outcome;
	if (outcome !== 'ok' && outcome !== 'fail' && outcome !== 'unknown')
		return null;
	const detail = record.detail;
	return {
		kind: record.kind,
		subject: record.subject,
		outcome,
		atMs: record.atMs,
		source: typeof record.source === 'string' ? record.source : 'unknown',
		...(typeof detail === 'string' && detail.length > 0
			? { detail: detail.slice(0, MAX_DETAIL_LENGTH) }
			: {}),
	};
};

/** Read every observation the store holds. A missing file is empty. */
export const readObservations = async (
	options: IObservationStoreOptions,
): Promise<readonly IObservation[]> => {
	const raw = await options.readText(options.filePath);
	if (raw === null) return [];
	const out: IObservation[] = [];
	for (const line of raw.split('\n')) {
		const parsed = parseObservation(line);
		if (parsed !== null) out.push(parsed);
	}
	return out;
};

/** The stored form: exactly the contract, with `detail` capped. */
const serialise = (observation: IObservation): string =>
	JSON.stringify({
		kind: observation.kind,
		subject: observation.subject,
		outcome: observation.outcome,
		atMs: observation.atMs,
		source: observation.source,
		...(observation.detail !== undefined
			? { detail: observation.detail.slice(0, MAX_DETAIL_LENGTH) }
			: {}),
	});

/**
 * The identity of an observation for de-duplication.
 *
 * Two collectors reading the same journal must not double-count it: the
 * same fact observed twice is still one fact, and a lesson's confidence
 * is built on how often something happened.
 */
const identityOf = (observation: IObservation): string =>
	`${observation.kind} ${observation.subject} ${observation.outcome} ${observation.atMs}`;

/**
 * Append observations, dropping duplicates and the oldest overflow.
 *
 * Rewrites the file rather than appending in place when compaction is
 * needed — the only moment the whole store is held in memory, and the
 * bound is what makes that safe.
 */
export const appendObservations = async (
	options: IObservationStoreOptions,
	incoming: readonly IObservation[],
): Promise<IObservationWriteResult> => {
	const max = options.maxObservations ?? DEFAULT_MAX_OBSERVATIONS;
	const existing = await readObservations(options);
	const seen = new Set(existing.map(identityOf));

	const accepted: IObservation[] = [];
	let skipped = 0;
	for (const observation of incoming) {
		const identity = identityOf(observation);
		if (seen.has(identity)) {
			skipped += 1;
			continue;
		}
		seen.add(identity);
		accepted.push(observation);
	}

	const combined = [...existing, ...accepted].sort(
		(left, right) => left.atMs - right.atMs,
	);
	const compacted = Math.max(0, combined.length - max);
	const kept = compacted > 0 ? combined.slice(compacted) : combined;

	// x00544 S3: PHYSICAL containment before the directory is created and
	// the store is rewritten. `filePath` is lexically contained at
	// register time, but a symlinked parent still names another tree and
	// only realpath can see that.
	const containmentRoot = options.workspaceRoot ?? dirname(options.filePath);
	if (!(await realpathContained(options.filePath, [containmentRoot]))) {
		throw new Error(
			'self-learning: refusing to write the observation store outside the workspace',
		);
	}
	await mkdir(dirname(options.filePath), { recursive: true });
	// Atomic, per the repo's durable-writes rule: this rewrite is the one
	// moment the whole store is in flight, and a process killed halfway
	// through a plain write leaves a truncated file that the next read
	// would silently treat as a smaller store.
	await writeFileAtomic(
		options.filePath,
		kept.length > 0 ? `${kept.map(serialise).join('\n')}\n` : '',
	);

	return {
		appended: accepted.length,
		skipped,
		total: kept.length,
		compacted,
	};
};

/** Read with a filter applied. Newest first — recency is the question. */
export const queryObservations = async (
	options: IObservationStoreOptions,
	query: IObservationQuery = {},
): Promise<readonly IObservation[]> => {
	const all = await readObservations(options);
	const filtered = all.filter(
		(observation) =>
			(query.kind === undefined || observation.kind === query.kind) &&
			(query.subject === undefined ||
				observation.subject === query.subject) &&
			(query.sinceMs === undefined || observation.atMs >= query.sinceMs),
	);
	filtered.sort((left, right) => right.atMs - left.atMs);
	return query.limit === undefined
		? filtered
		: filtered.slice(0, query.limit);
};
