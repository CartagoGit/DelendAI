/**
 * declared-slice.service.ts — a new unit works on a slice its proposal
 * declares.
 *
 * `work enter` took any `--slice`. a00095 declares S1, S2, S10 and S11;
 * its reviewers entered S3 to S16 and one published `S11S12S13S14`,
 * because a claim is per slice and an invented slice collides with no
 * one. The proposal then lists none of the work done under them.
 */
import { WHOLE_PROPOSAL_SLICE } from '../contracts/constants/publication-target.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { REVIEW_BATCH_ID } from '../development-policy/profiles.constant';
import { proposalFileAt } from './publication-target.service';
import { integrationBase, readGit, refused } from './work-unit-shared.service';

const SLICE_HEADING = /^###\s+(S\d+[a-z]?)\b/u;

/** The slices a proposal declares at `ref`, or `undefined` when it has no file there. */
export const declaredSlices = (
	root: string,
	proposal: string,
	ref: string,
): readonly string[] | undefined => {
	const file = proposalFileAt(root, proposal, ref);
	if (file === undefined) return undefined;
	return (readGit(root, ['show', `${ref}:${file}`]) ?? '')
		.split('\n')
		.flatMap((line) => {
			const id = SLICE_HEADING.exec(line)?.[1];
			return id === undefined ? [] : [id];
		});
};

/**
 * A refusal when `slice` is one the proposal does not declare, on the
 * integration branch or in any unit of it that has not landed, for a slice
 * no unit exists for yet; `undefined` otherwise. A slice already worked
 * on (anyone's unit, here or on the forge) is left to its units, a
 * proposal not written yet has no slices to check, and `all` and the
 * review batch are not slices of the document.
 */
export const undeclaredSlice = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	proposal: string,
	slice: string,
): IWorkUnitResult | undefined => {
	if (slice === WHOLE_PROPOSAL_SLICE || slice === REVIEW_BATCH_ID)
		return undefined;
	const base = integrationBase(root, policy);
	const integrated =
		base === undefined ? undefined : declaredSlices(root, proposal, base);
	if (integrated === undefined || integrated.length === 0) return undefined;
	const units = (readGit(root, ['for-each-ref', '--format=%(refname)']) ?? '')
		.split('\n')
		.filter((ref) => ref.includes(`/${proposal}-`));
	// A slice someone already works on is left to its units.
	if (units.some((ref) => ref.includes(`/${proposal}-${slice}-g`)))
		return undefined;
	// A slice written in a unit that has not landed is declared there.
	const declared = new Set([
		...integrated,
		...units.flatMap((ref) => declaredSlices(root, proposal, ref) ?? []),
	]);
	if (declared.has(slice)) return undefined;
	return refused(
		`${proposal} declares no slice ${slice}: its slices are ${[...declared].join(', ')}.`,
		`Enter one of them, or --slice=${WHOLE_PROPOSAL_SLICE} for the whole proposal. Work that needs a slice of its own is a slice added to the proposal first.`,
	);
};
