/**
 * merged-publications.helper.ts — whether a work ref's publication merged
 * into the integration branch, as the integration branch's own merges say.
 *
 * A unit whose work was rewritten before publishing (amended, rebased)
 * leaves its last checkpoint outside the integration branch even though
 * the unit landed through its pull request: on 2026-11-01 a consumer's
 * boots were blocked by a vanished `batch-infra-g11` whose pull request
 * (#56) had merged. The merge commit names the publication it came from,
 * and the publication is the work ref's own unit under another prefix.
 */
import type { IStartupGitSeam } from '../seams.interface';

/** The ref prefix as a branch name spells it. */
const bare = (prefix: string): string =>
	prefix.replace(/^(refs\/)?(heads\/)?/u, '');

/**
 * The unit a branch or a merge subject names after `prefix`, wherever an
 * owner or the merge's own words come first; up to the first space.
 */
const unitAfter = (text: string, prefix: string): string | undefined => {
	if (prefix.length === 0) return undefined;
	const at = text.startsWith(prefix) ? 0 : text.indexOf(`/${prefix}`) + 1;
	if (at === 0 && !text.startsWith(prefix)) return undefined;
	const unit = text.slice(at + prefix.length).split(/\s/u)[0] ?? '';
	return unit.length > 0 ? unit : undefined;
};

/**
 * A predicate on work refs: true when a merge of the integration branch
 * names the publication of that ref's unit. Never true without a seam
 * that can read the merges.
 */
export const publicationMergedFor = async (
	git: IStartupGitSeam,
	branches: {
		readonly integration: string;
		readonly workRefPrefix: string;
		readonly publicationRefPrefix: string;
	},
): Promise<(wipRef: string) => boolean> => {
	const publication = bare(branches.publicationRefPrefix);
	const merged = new Set(
		((await git.mergeSubjects?.(branches.integration)) ?? [])
			.map((branch) => unitAfter(branch, publication))
			.filter((unit): unit is string => unit !== undefined),
	);
	const work = bare(branches.workRefPrefix);
	return (wipRef) => {
		const unit = unitAfter(bare(wipRef), work);
		return unit !== undefined && merged.has(unit);
	};
};
