/**
 * work-ref-shape.service.ts — read a work ref back, using the same shape
 * that wrote it.
 *
 * ## Why this exists
 *
 * The shape of a work ref was written down in four places, in three
 * different spellings:
 *
 *   - `WORK_REF_SHAPE`, which the policy expands — `…-g${generation}/${topic}`;
 *   - the claim service's pattern, a hand-written regex agreeing with it;
 *   - `commit-branch-discipline`'s refusal, which told agents
 *     `…-g<n>-<topic>` — a DASH, so an agent following the message named a
 *     branch the parser could not read;
 *   - a persistence remedy quoting a shape with no `${topic}` at all.
 *
 * A ref in the dash spelling sits in the right namespace, so the guard
 * passes it, and then cannot be claimed ("cannot read … as
 * `{proposal}-{slice}-g{n}/{topic}`"), cannot be renamed, and cannot be
 * published. It is litter the moment it is created, and nothing says so.
 *
 * ## The fix is subtraction
 *
 * There is exactly one statement of the shape — `branches.workRefTemplate`,
 * as the policy resolved it. This derives the reader FROM it, so a reader
 * that disagreed with the writer is no longer expressible, and renders it
 * for messages so a refusal cannot teach a spelling nothing produces.
 */
import type { IWorkRefParts } from '../contracts/interfaces/work-ref-shape.interface';

export type { IWorkRefParts } from '../contracts/interfaces/work-ref-shape.interface';

/** `${agent}`, `${proposal}` … as they appear in a template. */
const PLACEHOLDER = /\$\{(agent|proposal|slice|generation|topic)\}/gu;

/** Regex-literal text, so a `.` in a template cannot match anything. */
const escaped = (literal: string): string =>
	literal.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The template's tail: everything after `${agent}/`.
 *
 * The agent is stripped by the caller (it is the ref's owner, read
 * separately), so the pattern describes only what is left to identify.
 */
const subjectOf = (template: string | undefined): string => {
	// A profile may declare no work refs at all (`shared-direct`), and a
	// policy can reach here unresolved. Neither is a crash: both mean
	// "this project names no work refs", which reads as a shape that
	// matches nothing.
	if (template === undefined || template === '') return '';
	const marker = '${agent}/';
	const at = template.indexOf(marker);
	return at === -1 ? template : template.slice(at + marker.length);
};

/**
 * A reader for the subject of a work ref, built from the template that
 * writes it.
 *
 * `${generation}` is digits because it is a counter; everything else is
 * whatever the sanitiser emits, bounded by the separators the template
 * itself puts between them. A template with no placeholders yields a
 * pattern that matches nothing rather than everything — an unreadable
 * configuration must not read every ref as claimable.
 */
export const workSubjectPatternFor = (template: string | undefined): RegExp => {
	const subject = subjectOf(template);
	let matched = false;
	let source = '';
	let cursor = 0;
	for (const match of subject.matchAll(PLACEHOLDER)) {
		matched = true;
		source += escaped(subject.slice(cursor, match.index));
		const name = match[1] ?? '';
		source +=
			name === 'generation'
				? '(?<generation>\\d+)'
				: `(?<${name}>[^/]+?)`;
		cursor = match.index + match[0].length;
	}
	if (!matched) return /(?!)/u;
	source += escaped(subject.slice(cursor));
	// The last placeholder is greedy-safe only if it may contain slashes:
	// a topic is one component, so lazy matching plus an anchored end is
	// what makes `a-S1-g1/x` read as topic `x` and not as part of a slice.
	return new RegExp(`^${source}$`, 'u');
};

/** Read a work ref's subject, or `undefined` when it is not this shape. */
export const parseWorkSubject = (
	template: string | undefined,
	subject: string,
): IWorkRefParts | undefined => {
	const groups = workSubjectPatternFor(template).exec(subject)?.groups;
	if (groups === undefined) return undefined;
	const { proposal, slice, generation, topic } = groups;
	if (
		proposal === undefined ||
		slice === undefined ||
		generation === undefined ||
		topic === undefined
	) {
		return undefined;
	}
	return { proposal, slice, generation, topic };
};

/**
 * The shape in words, for a message.
 *
 * Rendered from the template rather than written out, because a refusal
 * that teaches a spelling nothing produces is worse than no refusal: the
 * agent complies, and the ref it makes is unreadable.
 */
export const workRefShapeInWords = (
	template: string | undefined,
	prefix = '',
): string =>
	template === undefined || template === ''
		? `${prefix}<the shape branches.workRefTemplate declares>`
		: `${prefix}${template.replaceAll(PLACEHOLDER, (_m, name: string) => `<${name}>`)}`;
