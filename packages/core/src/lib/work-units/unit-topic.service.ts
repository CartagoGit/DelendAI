/**
 * unit-topic.service.ts — a unit's name says what it is.
 *
 * A unit entered with no topic was named `work`. Twelve reviewers left
 * `…/review/batch-all-gN/work` beside `review-backpack` and
 * `review-all-g8` for the same thing, and implementation units called
 * `work` that said nothing of what they held: the swarm view, the pull
 * request list and the branch list all read as one word repeated.
 *
 * The topic nobody chose is derived: a review pack is `verdicts`, and
 * any other unit takes the words of its proposal's title.
 */
import {
	DEFAULT_WORK_TOPIC,
	MAX_WORK_TOPIC_LENGTH,
	REVIEW_PACK_TOPIC,
} from '../contracts/constants/work-topic.constant';

/** The words of a title that fit in a topic, cut between words. */
const fitted = (slug: string): string => {
	if (slug.length <= MAX_WORK_TOPIC_LENGTH) return slug;
	const cut = slug.slice(0, MAX_WORK_TOPIC_LENGTH + 1);
	const dash = cut.lastIndexOf('-');
	return dash > 0 ? cut.slice(0, dash) : slug.slice(0, MAX_WORK_TOPIC_LENGTH);
};

/**
 * The topic of a unit entered without one. `documentPath` is the
 * proposal's document on the integration branch, when it has one.
 */
export const derivedTopic = (input: {
	readonly kind: string;
	readonly proposal: string;
	readonly documentPath: string | undefined;
}): string => {
	if (input.kind === 'review') return REVIEW_PACK_TOPIC;
	const file = input.documentPath?.split('/').at(-1) ?? '';
	const slug = file
		.replace(/\.md$/u, '')
		.slice(`${input.proposal}-`.length)
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-+|-+$/gu, '');
	return slug.length === 0 ? DEFAULT_WORK_TOPIC : fitted(slug);
};
