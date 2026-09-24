/**
 * publication-granularity.constant.ts — the default grouping of work into
 * pull requests, shared by every profile (f00554).
 *
 * `adaptive` by default: a small proposal is reviewed as one pull request,
 * a large one slice by slice. The thresholds are declared here once and a
 * project overrides them in its `development.integration.publication`.
 */
import type { IPolicyPublication } from '../interfaces/publication-unit.interface';

/**
 * How finished work becomes pull requests (f00554).
 *
 * - `slice`: one pull request per slice.
 * - `proposal`: one per proposal, once its slices are done.
 * - `adaptive`: one per proposal when it is small, slice by slice when it
 *   is not, by the thresholds in `IPolicyPublication.adaptive`.
 */
export const PUBLICATION_GRANULARITIES = [
	'slice',
	'proposal',
	'adaptive',
] as const;

export const DEFAULT_PUBLICATION: IPolicyPublication = {
	granularity: 'adaptive',
	adaptive: { maxSlices: 3, maxChangedLines: 400 },
};
