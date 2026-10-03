/**
 * publication-unit.ts — whether a proposal becomes one pull request or one
 * per slice, and why (f00554).
 *
 * One pure answer, from the declared policy, so `work publish`, `work
 * status` and any agent ask the same question and get the same reason. A
 * pull request never carries two proposals: this only decides how the
 * slices of ONE proposal are grouped.
 */
import type {
	IPolicyPublication,
	IPublicationSubject,
	IPublicationUnit,
} from '../contracts/interfaces/publication-unit.interface';

export const publicationUnitFor = (
	subject: IPublicationSubject,
	publication: IPolicyPublication,
): IPublicationUnit => {
	const { granularity } = publication;
	if (granularity === 'slice') {
		return {
			unit: 'slice',
			granularity,
			reason: `the project publishes every slice as its own pull request`,
		};
	}
	if (granularity === 'proposal') {
		return {
			unit: 'proposal',
			granularity,
			reason: `the project publishes each proposal as one pull request`,
		};
	}
	const { maxSlices, maxChangedLines } = publication.adaptive;
	const size = `${String(subject.sliceCount)} slice(s), ${String(subject.changedLines)} changed line(s)`;
	const small =
		subject.sliceCount <= maxSlices &&
		subject.changedLines <= maxChangedLines;
	return small
		? {
				unit: 'proposal',
				granularity,
				reason: `${size}: within ${String(maxSlices)} slices and ${String(maxChangedLines)} lines, so ${subject.proposalId} is one pull request`,
			}
		: {
				unit: 'slice',
				granularity,
				reason: `${size}: over ${String(maxSlices)} slices or ${String(maxChangedLines)} lines, so ${subject.proposalId} is published slice by slice`,
			};
};
