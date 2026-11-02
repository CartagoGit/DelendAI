/**
 * Contract shapes for `./repair-resolutions-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: the seam module keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `repair-resolutions-seam.ts`, so no import site changes.
 */

import type { IRepairResolutionsSource } from '../startup-reconciler/index';

/** What the workspace's tracked decisions file yielded. */
export interface IRepairResolutionsSeam {
	readonly source: IRepairResolutionsSource;
	/** Why entries were ignored. Empty when the file is clean or absent. */
	readonly errors: readonly string[];
}
