/**
 * Contract shapes for `./commit`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `commit.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `commit.ts`, so no import site changes.
 */

import type { IWipAuthor } from './types.interface';

/** Arguments for `createCommit`. */
export interface ICreateCommitOptions {
	readonly tree: string;
	readonly parents: readonly string[];
	readonly message: string;
	readonly author?: IWipAuthor;
}
