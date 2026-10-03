/**
 * repair-resolutions.ts — the one way a human answers a question the
 * reconciler is not allowed to answer.
 *
 * WHY this exists: a blocker the reconciler cannot close is permanent. It
 * refuses to guess (rightly), and nothing it can observe will ever turn
 * it green, so the workspace stays DEGRADED and mutations stay blocked
 * forever. A gate that can never go green stops being read. The missing
 * piece was never more automation — it was a place to record the one
 * thing only a person holds: what actually happened.
 *
 * WHY a resolution is pinned to an evidence digest and not to a code or
 * a task id alone: "this ref vanished" answered once must not answer the
 * NEXT vanishing of the same ref at a different checkpoint. The digest
 * makes a resolution expire exactly when the observation changes, which
 * is what separates an answer from a mute button.
 *
 * WHY parsing never throws and never repairs: a malformed file must not
 * take the boot down, and it must not be half-honoured either. Every
 * entry that does not typecheck is dropped WITH a reason, and a dropped
 * entry resolves nothing — the blocker stands.
 */

import type { IStartupFinding, IStartupRepairTask } from './contracts';
import { finding } from './finding-catalog';

import {
	REPAIR_DECISIONS,
	REPAIR_RESOLUTIONS_PATH,
	REPAIR_RESOLVED_CODE,
	REPAIR_STALE_CODE,
} from './repair-resolutions.constant';
import type {
	IRepairDecision,
	IRepairResolution,
	IRepairResolutionsFile,
	IRepairResolutionsParse,
	IRepairResolutionsSource,
	IResolvedBlockers,
} from './repair-resolutions.interface';

export {
	REPAIR_DECISIONS,
	REPAIR_RESOLUTIONS_PATH,
	REPAIR_RESOLVED_CODE,
	REPAIR_STALE_CODE,
} from './repair-resolutions.constant';
export type {
	IRepairDecision,
	IRepairResolution,
	IRepairResolutionsFile,
	IRepairResolutionsParse,
	IRepairResolutionsSource,
	IResolvedBlockers,
} from './repair-resolutions.interface';

const readDecision = (value: unknown): IRepairDecision | undefined =>
	REPAIR_DECISIONS.find((decision) => decision === value);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const nonEmpty = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: undefined;

const readEntry = (
	value: unknown,
	index: number,
	errors: string[],
): IRepairResolution | undefined => {
	const record = asRecord(value);
	if (record === undefined) {
		errors.push(`resolutions[${String(index)}]: not an object`);
		return undefined;
	}
	const taskId = nonEmpty(record.taskId);
	const evidenceDigest = nonEmpty(record.evidenceDigest);
	const reason = nonEmpty(record.reason);
	const decidedBy = nonEmpty(record.decidedBy);
	const decidedAt = nonEmpty(record.decidedAt);
	const missing = [
		taskId === undefined ? 'taskId' : undefined,
		evidenceDigest === undefined ? 'evidenceDigest' : undefined,
		reason === undefined ? 'reason' : undefined,
		decidedBy === undefined ? 'decidedBy' : undefined,
		decidedAt === undefined ? 'decidedAt' : undefined,
	].filter((name): name is string => name !== undefined);
	if (missing.length > 0) {
		errors.push(
			`resolutions[${String(index)}]: missing ${missing.join(', ')}`,
		);
		return undefined;
	}
	const decision = readDecision(record.decision);
	if (
		decision === undefined ||
		taskId === undefined ||
		evidenceDigest === undefined ||
		reason === undefined ||
		decidedBy === undefined ||
		decidedAt === undefined
	) {
		errors.push(
			`resolutions[${String(index)}]: decision must be one of ${REPAIR_DECISIONS.join(', ')}`,
		);
		return undefined;
	}
	return {
		taskId,
		evidenceDigest,
		decision,
		reason,
		decidedBy,
		decidedAt,
	};
};

/** Read the tracked file's text. Bad entries are dropped, never guessed. */
export const parseRepairResolutions = (
	raw: string,
): IRepairResolutionsParse => {
	const errors: string[] = [];
	if (raw.trim().length === 0) return { resolutions: [], errors };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			resolutions: [],
			errors: [
				`${REPAIR_RESOLUTIONS_PATH}: ${error instanceof Error ? error.message : 'invalid JSON'}`,
			],
		};
	}
	const record = asRecord(parsed);
	if (record === undefined) {
		return {
			resolutions: [],
			errors: [`${REPAIR_RESOLUTIONS_PATH}: not an object`],
		};
	}
	if (record.version !== 1) {
		return {
			resolutions: [],
			errors: [
				`${REPAIR_RESOLUTIONS_PATH}: unsupported version ${String(record.version)}`,
			],
		};
	}
	const list = record.resolutions;
	if (!Array.isArray(list)) {
		return {
			resolutions: [],
			errors: [
				`${REPAIR_RESOLUTIONS_PATH}: resolutions must be an array`,
			],
		};
	}
	const resolutions: IRepairResolution[] = [];
	for (const [index, entry] of list.entries()) {
		const read = readEntry(entry, index, errors);
		if (read !== undefined) resolutions.push(read);
	}
	return { resolutions, errors };
};

/** Serialise for writing. Stable order, trailing newline, no surprises. */
export const renderRepairResolutions = (
	resolutions: readonly IRepairResolution[],
): string => {
	const file: IRepairResolutionsFile = {
		version: 1,
		resolutions: [...resolutions].sort((left, right) =>
			left.taskId === right.taskId
				? left.decidedAt < right.decidedAt
					? -1
					: 1
				: left.taskId < right.taskId
					? -1
					: 1,
		),
	};
	return `${JSON.stringify(file, null, '\t')}\n`;
};

/** A source that answers from a list already in memory. */
export const staticRepairResolutions = (
	resolutions: readonly IRepairResolution[],
): IRepairResolutionsSource => ({ read: () => resolutions });

/** Restate an answered blocker as a note. Same evidence, new verdict. */
const asNote = (item: IStartupFinding): IStartupFinding => ({
	...item,
	kind: 'note',
	blocksMutation: false,
	recoveryRequired: false,
});

/**
 * Split blockers into what a recorded decision answered and what still
 * blocks. A task is answered only when BOTH its id and the digest of the
 * evidence it was raised on match a recorded resolution.
 */
export const applyRepairResolutions = (input: {
	readonly blockers: readonly IStartupFinding[];
	readonly tasks: ReadonlyMap<string, IStartupRepairTask>;
	readonly resolutions: readonly IRepairResolution[];
}): IResolvedBlockers => {
	if (input.resolutions.length === 0) {
		return {
			blockers: input.blockers,
			notes: [],
			answeredTaskIds: [],
			answered: [],
		};
	}
	const byTask = new Map<string, IRepairResolution[]>();
	for (const resolution of input.resolutions) {
		byTask.set(resolution.taskId, [
			...(byTask.get(resolution.taskId) ?? []),
			resolution,
		]);
	}
	const blockers: IStartupFinding[] = [];
	const notes: IStartupFinding[] = [];
	const answered: IStartupFinding[] = [];
	const answeredTaskIds: string[] = [];
	for (const blocker of input.blockers) {
		const task = [...input.tasks.values()].find(
			(candidate) =>
				candidate.code === blocker.code &&
				candidate.subject === blocker.subject,
		);
		const candidates = task === undefined ? undefined : byTask.get(task.id);
		if (task === undefined || candidates === undefined) {
			blockers.push(blocker);
			continue;
		}
		const answer = candidates.find(
			(entry) => entry.evidenceDigest === task.evidenceDigest,
		);
		if (answer === undefined) {
			blockers.push(blocker);
			notes.push(
				finding({
					code: REPAIR_STALE_CODE,
					phase: blocker.phase,
					kind: 'note',
					subject: task.id,
					message: `A resolution exists for ${task.code} on ${task.subject}, but it answered different evidence (${candidates.map((entry) => entry.evidenceDigest).join(', ')} != ${task.evidenceDigest}). It resolves nothing and the blocker stands.`,
				}),
			);
			continue;
		}
		answered.push(asNote(blocker));
		answeredTaskIds.push(task.id);
		notes.push(
			finding({
				code: REPAIR_RESOLVED_CODE,
				phase: blocker.phase,
				kind: 'note',
				subject: task.id,
				message: `${task.code} on ${task.subject} was resolved by ${answer.decidedBy} on ${answer.decidedAt} as ${answer.decision}: ${answer.reason}`,
				detail: {
					taskId: task.id,
					evidenceDigest: answer.evidenceDigest,
					decision: answer.decision,
				},
			}),
		);
	}
	return { blockers, notes, answered, answeredTaskIds };
};
