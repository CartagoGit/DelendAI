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
import { compileWorkRefParser } from '@delendai/core/public';

import type { IWorkRefParts } from '../contracts/interfaces/work-ref-shape.interface';

export type { IWorkRefParts } from '../contracts/interfaces/work-ref-shape.interface';

const AGENT_MARKER = '${agent}/';

/**
 * Read a work ref's subject — everything after `${agent}/` — or
 * `undefined` when it is not this shape.
 *
 * The reading is core's, the same parser the reconciler and the guard
 * use, so this module holds no second copy of the shape (f00644). It is
 * strict about the topic's separator: a ref in the old dash spelling
 * cannot be renamed into the shape without guessing where its slice
 * ended. A ref written before the shape named its kind still reads, with
 * its kind derived.
 */
export const parseWorkSubject = (
	template: string | undefined,
	subject: string,
): IWorkRefParts | undefined => {
	// A profile may declare no work refs at all (`shared-direct`), and a
	// policy can reach here unresolved. Neither is a crash: both mean
	// "this project names no work refs", which reads nothing.
	if (template === undefined || template === '') return undefined;
	const parser = compileWorkRefParser(template, '', {
		strict: true,
		requireKind: false,
	});
	if (parser === undefined) return undefined;
	const at = template.indexOf(AGENT_MARKER);
	const name =
		at === -1 ? subject : `${template.slice(0, at)}agent/${subject}`;
	const identity = parser.parse(
		name.startsWith('refs/') ? name : `refs/${name}`,
	);
	if (identity === undefined || identity.topic === undefined) {
		return undefined;
	}
	return {
		kind: identity.kind,
		proposal: identity.proposal,
		slice: identity.slice,
		generation: String(identity.generation),
		topic: identity.topic,
	};
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
		: `${prefix}${template.replaceAll(/\$\{([a-z]+)\}/gu, '<$1>')}`;
