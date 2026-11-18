/**
 * sent-back-proposals.ts — a proposal with a slice sent back belongs with
 * whoever will do the work, not in `review/`.
 *
 * A request for changes reopens its proposal when it is recorded. Ones
 * recorded before it did, or whose reopening was refused at the time,
 * stayed in `review/` with a slice only "its implementer" could resubmit;
 * where that implementer was `unrecorded`, or the committer of a merge,
 * nobody was ever going to. Any agent may take a slice that was sent
 * back: the one who resubmits it is its implementer from then on.
 */

/** A slice heading and everything under it, up to the next heading. */
const SLICE_BLOCK = /^### [^\n]*\n(?:(?!^#{2,3} )[^\n]*\n?)*/gmu;

const SENT_BACK =
	/^[-*]\s*\*{0,2}review-state\*{0,2}:\s*changes_requested\b/imu;

const STATUS_LINE = /^([-*]\s*\*\*Status\*\*:\s*)[a-z-]+[^\n]*/imu;

/** The ids of the slices of `markdown` that were sent back. */
export const slicesSentBack = (markdown: string): readonly string[] =>
	[...markdown.matchAll(SLICE_BLOCK)]
		.map((match) => match[0])
		.filter((block) => SENT_BACK.test(block))
		.map((block) => /^### (\S+)/u.exec(block)?.[1] ?? '')
		.filter((id) => id.length > 0);

/** Whether a proposal in review has a slice that was sent back. */
export const waitsOnNobody = (markdown: string): boolean => {
	const frontmatter = markdown.split(/^---\s*$/mu)[1] ?? '';
	if (!/^status:\s*review\s*$/mu.test(frontmatter)) return false;
	if (/^owner-decision:\s*pending/mu.test(frontmatter)) return false;
	return slicesSentBack(markdown).length > 0;
};

/** `markdown` with every slice that was sent back marked as work to do. */
export const withSentBackSlicesOpen = (markdown: string): string =>
	markdown.replace(SLICE_BLOCK, (block) =>
		SENT_BACK.test(block)
			? block.replace(
					STATUS_LINE,
					(_line, prefix: string) => `${prefix}in-progress`,
				)
			: block,
	);
