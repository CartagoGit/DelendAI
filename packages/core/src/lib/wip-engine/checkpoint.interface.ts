/**
 * Contract shapes for `./checkpoint`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `checkpoint.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `checkpoint.ts`, so no import site changes.
 */

import type { IAnchorRequirement } from './anchor.interface';
import type { IScopedGitRunner } from './git-command';

/** Repository binding every operation in this engine works against. */
export interface IWipEngineContext {
	/** Runner rooted at the working tree, able to set environment. */
	readonly run: IScopedGitRunner;
	/** Absolute working-tree root; all scope paths are relative to it. */
	readonly root: string;
	/**
	 * What the policy demands of the checkout's branch.
	 *
	 * Required, not optional, and deliberately so: an optional guard is a
	 * guard every future caller can forget, and forgetting it is exactly
	 * the failure that produced it. Stating `{ required: false }` for a
	 * worktree model is a decision; leaving the field out would be an
	 * omission that looks identical.
	 */
	readonly anchor: IAnchorRequirement;
}
