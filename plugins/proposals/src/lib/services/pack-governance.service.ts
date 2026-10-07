/**
 * pack-governance.service.ts — what keeps a review pack from landing,
 * read the same way before it is published and in CI.
 *
 * `closed-with-independent-approval` refuses a pack that carries another
 * reviewer's approvals or changes a proposal it never claimed. It ran
 * only in CI, so a reviewer was told its pack was done, published it, and
 * learned from a red pull request that it could never merge (#873 carried
 * approvals by another model in a unit named for the publisher).
 * `review finish` now asks first, with these same predicates.
 */

/** Every approval a unified diff adds, by its approver. */
export const approvalsAdded = (unifiedDiff: string): readonly string[] =>
	unifiedDiff.split('\n').flatMap((line) => {
		const approver = line.match(
			/^\+[-*]\s*review-log:\s*approved by\s+(\S+)/iu,
		)?.[1];
		return approver === undefined ? [] : [approver];
	});

/**
 * The approvals a diff adds that are not its author's (x00715).
 *
 * `reviewer ≠ implementer` compares names an agent declares. An approval
 * that enters the integration branch through the pull request of its
 * reviewer's own unit ties the declared name to the unit that did the
 * review: approving as someone else then means entering, publishing and
 * approving under that name, and any mismatch between the three is caught
 * here, on every host.
 */
export const approvalsNotBy = (
	unifiedDiff: string,
	author: string,
): readonly string[] =>
	approvalsAdded(unifiedDiff).filter(
		(approver) => approver.toLowerCase() !== author.toLowerCase(),
	);

/**
 * The proposals a review pack changes without having claimed them.
 *
 * A pack that merged other packs carried the edits of three of them:
 * nothing in it said which were its author's, so nothing could be checked
 * against what it claimed. `changedPaths` are the proposal documents the
 * pack touches, and `claimed` the ids of the `Claims` trailers of its own
 * commits.
 */
export const unclaimedProposals = (
	changedPaths: readonly string[],
	claimed: readonly string[],
): readonly string[] => {
	const mine = new Set(claimed.map((id) => id.trim().toLowerCase()));
	return [
		...new Set(
			changedPaths
				.map((path) =>
					/^([a-z]\d{5})-/iu
						.exec(path.split('/').at(-1) ?? '')?.[1]
						?.toLowerCase(),
				)
				.filter(
					(id): id is string => id !== undefined && !mine.has(id),
				),
		),
	].sort();
};

/**
 * Why a review pack by `author` would be refused, one sentence each;
 * empty when it can land. `diff` is the pack's unified diff of the
 * proposals directory against the integration branch.
 */
export const packRefusals = (input: {
	readonly author: string;
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly claimed: readonly string[];
}): readonly string[] => {
	const foreign = [...new Set(approvalsNotBy(input.diff, input.author))];
	const unclaimed = unclaimedProposals(input.changedPaths, input.claimed);
	return [
		...(foreign.length === 0
			? []
			: [
					`It adds approvals by ${foreign.join(', ')}, and an approval enters through the pull request of its reviewer's own unit.`,
				]),
		...(unclaimed.length === 0
			? []
			: [
					`It changes ${unclaimed.join(', ')} without having claimed ${unclaimed.length === 1 ? 'it' : 'them'}; what belongs to another pack lands with that pack.`,
				]),
	];
};
