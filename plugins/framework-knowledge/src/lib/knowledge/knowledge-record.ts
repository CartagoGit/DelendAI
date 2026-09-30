// knowledge-record.ts — f00547 S2: construct and validate one piece of
// framework knowledge, with its evidence and its force.
//
// Pure: no fs, no network, no clock reads other than validating a
// caller-supplied timestamp string. A record is only ever built through
// `createKnowledgeRecord`, which refuses a malformed one instead of
// letting bad data become a rule an agent trusts.

import { FORCE_VALUES } from '../contracts/constants/knowledge-force.constant';
import type {
	ICreateKnowledgeRecordResult,
	IKnowledgeForce,
	IKnowledgeRecordInput,
} from '../contracts/interfaces/knowledge-record.interface';

export { FORCE_VALUES } from '../contracts/constants/knowledge-force.constant';

export const isKnowledgeForce = (value: unknown): value is IKnowledgeForce =>
	typeof value === 'string' &&
	(FORCE_VALUES as readonly string[]).includes(value);

/** The record's position in `FORCE_VALUES`, or `undefined` for an invalid force. */
export const forceRank = (force: IKnowledgeForce): number =>
	FORCE_VALUES.indexOf(force);

/** One initial letter plus this many more lower-kebab characters. */
const MAX_ID_EXTRA_CHARS = 79;
const MAX_FRAMEWORK_ID_EXTRA_CHARS = 39;
const MAX_TOPIC_EXTRA_CHARS = 79;

const RECORD_ID_PATTERN = new RegExp(
	`^[a-z][a-z0-9-]{0,${MAX_ID_EXTRA_CHARS}}$`,
	'u',
);
const FRAMEWORK_ID_PATTERN = new RegExp(
	`^[a-z][a-z0-9-]{0,${MAX_FRAMEWORK_ID_EXTRA_CHARS}}$`,
	'u',
);
const TOPIC_PATTERN = new RegExp(
	`^[a-z][a-z0-9-]{0,${MAX_TOPIC_EXTRA_CHARS}}$`,
	'u',
);

const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const isValidTimestamp = (value: string): boolean =>
	isNonEmpty(value) && !Number.isNaN(Date.parse(value));

/**
 * Validate and construct one knowledge record. Refuses:
 * - a malformed `id`/`frameworkId`/`topic` (lower-kebab, bounded length —
 *   the same shape every other id-like field in this codebase uses),
 * - an empty `appliesToVersion` or `statement`,
 * - a `force` outside `FORCE_VALUES`,
 * - empty evidence, or a `retrievedAt` that does not parse as a date.
 */
export const createKnowledgeRecord = (
	input: IKnowledgeRecordInput,
): ICreateKnowledgeRecordResult => {
	if (!RECORD_ID_PATTERN.test(input.id)) {
		return { ok: false, reason: `invalid id: ${input.id}` };
	}
	if (!FRAMEWORK_ID_PATTERN.test(input.frameworkId)) {
		return {
			ok: false,
			reason: `invalid frameworkId: ${input.frameworkId}`,
		};
	}
	if (!isNonEmpty(input.appliesToVersion)) {
		return { ok: false, reason: 'appliesToVersion must not be empty' };
	}
	if (!TOPIC_PATTERN.test(input.topic)) {
		return { ok: false, reason: `invalid topic: ${input.topic}` };
	}
	if (!isNonEmpty(input.statement)) {
		return { ok: false, reason: 'statement must not be empty' };
	}
	if (!isKnowledgeForce(input.force)) {
		return { ok: false, reason: `invalid force: ${String(input.force)}` };
	}
	if (!isNonEmpty(input.evidence.source)) {
		return { ok: false, reason: 'evidence.source must not be empty' };
	}
	if (!isValidTimestamp(input.evidence.retrievedAt)) {
		return {
			ok: false,
			reason: `invalid evidence.retrievedAt: ${input.evidence.retrievedAt}`,
		};
	}
	return {
		ok: true,
		record: {
			id: input.id,
			frameworkId: input.frameworkId,
			appliesToVersion: input.appliesToVersion,
			topic: input.topic,
			statement: input.statement,
			force: input.force,
			evidence: {
				source: input.evidence.source,
				retrievedAt: input.evidence.retrievedAt,
			},
		},
	};
};
