import { UNRECORDED_IMPLEMENTER } from '../contracts/constants/review-attribution.constant';
import type { IReviewIndependence } from '../contracts/interfaces/review-independence.interface';

/**
 * independent-approval.ts — the one rule for reaching `done`: every
 * finished slice carries an approval by someone other than its
 * implementer (x00718).
 *
 * `proposal_transition`, `proposal_force_transition` and CI's
 * `closed-with-independent-approval` each judged this their own way, and
 * a `force: true` or `skipPeerReview: true` skipped the tools' version.
 * On 2026-09-28 one agent closed about seventy proposals with
 * `skipPeerReview`, citing an owner's decision that was never taken. The
 * rule now lives here, every path to `done` applies it, and no flag an
 * agent can pass skips it. A project that does not review turns it off
 * in its own configuration (`requirePeerReview: false`).
 */

/**
 * What an approval line carries when the tool saw that its reviewer and
 * the implementer, one model, were two instances. A document cannot show
 * an instance, so without it the same model's approval proves nothing.
 */
export const ANOTHER_INSTANCE_MARK = '[another instance]';

/** The letters and digits of a model id, in one case. */
const lettersOf = (agent: string): string =>
	agent.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

/**
 * Whether two ids name one model: `MiniMax-M3` and `minimaxm3` do. A
 * comparison of the text alone took five spellings of one model for five
 * reviewers.
 */
export const isSameModel = (left: string, right: string): boolean =>
	lettersOf(left) === lettersOf(right);

/**
 * Whether `approver` approving `implementer`'s work is a self-approval.
 *
 * Another model is another reviewer under either rule: it is necessarily
 * another instance too. The same model is independent only where the
 * project accepts another INSTANCE of it, and only when both instances
 * are known and differ. `instance` used to mean "anybody": with nothing
 * compared, an agent approved its own work under its own name.
 */
export const isSelfApproval = (
	implementer: string | undefined,
	approver: string,
	independence: IReviewIndependence = 'model',
	instances?: {
		readonly implementer?: string | undefined;
		readonly approver?: string | undefined;
	},
): boolean => {
	if (implementer === undefined) return false;
	if (!isSameModel(implementer, approver)) return false;
	if (independence === 'model') return true;
	const mine = instances?.approver ?? '';
	const theirs = instances?.implementer ?? '';
	return !(mine.length > 0 && theirs.length > 0 && mine !== theirs);
};

/** The finished slices of `markdown` that lack an independent approval. */
export const unapprovedSlices = (
	markdown: string,
	independence: IReviewIndependence = 'model',
): readonly string[] => {
	// A slice is a `###` block with a Status line; other `###` headings
	// (notes, measurements) are not judged. A proposal with no slices is
	// judged as a whole. Both spellings of the review fields are in use
	// (`- review-log:` and `- **review-log**:`), so both are read.
	const statusOf = (block: string) =>
		block
			.match(/^[-*]\s*\*\*Status\*\*:\s*([a-z-]+)/imu)?.[1]
			?.toLowerCase();
	const slices = markdown
		.split(/^### /mu)
		.slice(1)
		.filter((block) => statusOf(block) !== undefined);
	const judged =
		slices.length > 0
			? slices.filter((block) => statusOf(block) === 'done')
			: [markdown];
	return judged.flatMap((block) => {
		const title =
			slices.length > 0 ? (block.split('\n')[0] ?? '').trim() : '';
		const implementer = block
			.match(/^[-*]\s*\*{0,2}review-implementer\*{0,2}:\s*(\S+)/imu)?.[1]
			?.toLowerCase();
		const approvals = [
			...block.matchAll(
				/^[-*]\s*\*{0,2}review-log\*{0,2}:\s*approved by\s+(\S+)([^\n]*)/gimu,
			),
		].map((match) => ({
			approver: (match[1] ?? '').toLowerCase(),
			anotherInstance: (match[2] ?? '').includes(ANOTHER_INSTANCE_MARK),
		}));
		// Work nobody could be named for has no reviewer who is provably
		// somebody else: it does not reach `done` until its commit is named.
		const independent =
			implementer !== UNRECORDED_IMPLEMENTER &&
			approvals.some(
				({ approver, anotherInstance }) =>
					approver.length > 0 &&
					!isSelfApproval(
						implementer,
						approver,
						independence,
						// The mark stands for two instances the tool compared.
						anotherInstance
							? { implementer: 'recorded', approver: 'another' }
							: undefined,
					),
			);
		return independent ? [] : [title.length > 0 ? title : '(the proposal)'];
	});
};
