/**
 * work-ref-placeholders.ts — the one reader of a work-ref template's
 * placeholders, and the one rule for a unit's kind (f00644).
 *
 * The placeholder list used to be spelled as a regex in four modules; a
 * placeholder added to the shape would have been silently ignored by
 * whichever copy was not updated.
 */
import {
	DEFAULT_WORK_KIND,
	WORK_KINDS,
	WORK_REF_PLACEHOLDERS,
} from './profiles.constant';

/**
 * A fresh matcher for `${placeholder}` in a template. Fresh on every
 * call because it is global: a shared instance carries `lastIndex` from
 * one caller into the next.
 */
export const workRefPlaceholderPattern = (): RegExp =>
	new RegExp(`\\$\\{(${WORK_REF_PLACEHOLDERS.join('|')})\\}`, 'gu');

/** Whether `value` is a kind of work the vocabulary names. */
export const isWorkKind = (value: string): boolean =>
	(WORK_KINDS as readonly string[]).includes(value);

/** The slices reviewers worked under before a ref named its kind. */
const LEGACY_REVIEW_SLICES: ReadonlySet<string> = new Set(['review', 'close']);

/**
 * The kind of a unit whose ref predates the kind segment: a review round
 * went by its slice name, everything else was implementation.
 */
export const legacyWorkKind = (slice: string): string =>
	LEGACY_REVIEW_SLICES.has(slice.toLowerCase())
		? 'review'
		: DEFAULT_WORK_KIND;

/**
 * The kinds of work an agent id spells out, as whole dash-separated
 * words. An agent id names who works (the model), not what it is doing:
 * `github-copilot-review-20260926` put the task where the ref's kind
 * belongs, and the ref then read as an agent nobody could recognise.
 */
export const kindsInAgentId = (agent: string): readonly string[] =>
	agent
		.toLowerCase()
		.split(/[-_.]/u)
		.filter((word) => isWorkKind(word) || LEGACY_REVIEW_SLICES.has(word));
