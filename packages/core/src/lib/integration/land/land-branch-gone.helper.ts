/**
 * land-branch-gone.helper.ts — a pass woken for a branch that no longer
 * exists. The run it served is over (a rehearsal's cleanup, a deleted
 * integration branch): there is nothing to settle, so the pass ends without
 * failing instead of reporting a 404 as a defect.
 */

/** The integration branch the pass was woken for is not on the forge. */
export class LandBranchGoneError extends Error {
	constructor(readonly branch: string) {
		super(`the integration branch ${branch} no longer exists`);
		this.name = 'LandBranchGoneError';
	}
}
