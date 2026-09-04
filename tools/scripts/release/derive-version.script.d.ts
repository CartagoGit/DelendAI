#!/usr/bin/env bun
export type BumpKind = 'major' | 'minor' | 'patch' | 'none';
/**
 * Classify a set of commits into the strongest bump they justify. `commits` is
 * the list of full messages (subject + body, separated by newlines).
 */
export declare const classifyBump: (commits: readonly string[]) => BumpKind;
/** Apply a bump to a `X.Y.Z` version. `none` returns the version unchanged. */
export declare const applyBump: (version: string, bump: BumpKind) => string;
export interface IVersionDecision {
	readonly release: boolean;
	readonly version: string;
	readonly bump: BumpKind;
	readonly lastTag: string | null;
}
/** Compute the release decision for the repo at `root`. */
export declare const decideVersion: (root: string) => IVersionDecision;
