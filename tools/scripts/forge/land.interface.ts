/**
 * Contract shapes for `./land`: what one pass reads from the forge and from
 * git, and what it reports. Any forge implements `ILandForge` (GitLab has
 * every call: pipelines, merge with `sha`, rebase, labels, notes, merge
 * requests); GitHub is the first implementation (`./land-forge.github`).
 */
import type { IChangeFootprint, ITrainCandidate } from '@delendai/core/cli';

/** One check on a commit: no conclusion yet means it is still running. */
export interface ILandCheck {
	readonly name: string;
	readonly conclusion: string | null;
	/** The run's link, quoted when the check is the reason of a verdict. */
	readonly url?: string | undefined;
	/** The specs the check reports as failing, when it names them. */
	readonly failingSpecs?: readonly string[] | undefined;
}

/** A pull request as the forge reports it right now. */
export interface ILandPullRequest {
	readonly number: number;
	readonly headRef: string;
	readonly headSha: string;
	readonly draft: boolean;
	readonly state: 'open' | 'closed';
	readonly merged: boolean;
	readonly labels: readonly string[];
	readonly body: string;
	/** The integration commit its head was tested against. */
	readonly testedBase: string;
}

/** The answer to a merge pinned to a head: nothing merges on another head. */
export type ILandMerge = 'merged' | 'head-moved' | 'refused';

/** The answer to bringing a branch up to the tip through the forge. */
export type ILandUpdate = 'updated' | 'head-moved' | 'conflict';

/** The forge calls land needs, and no others. */
export interface ILandForge {
	integrationTip(): Promise<string>;
	/** The checks the integration branch requires. */
	requiredChecks(): Promise<readonly string[]>;
	/** Open pull requests into the integration branch that are not batches. */
	openPullRequests(): Promise<readonly ILandPullRequest[]>;
	/** Batch pull requests under `prefix`, open and closed (the recent ones). */
	batchPullRequests(prefix: string): Promise<readonly ILandPullRequest[]>;
	pullRequest(number: number): Promise<ILandPullRequest>;
	checks(sha: string): Promise<readonly ILandCheck[]>;
	/** Merge, refusing when the head is no longer `sha`. */
	merge(number: number, sha: string): Promise<ILandMerge>;
	updateBranch(number: number, sha: string): Promise<ILandUpdate>;
	addLabel(number: number, label: string): Promise<void>;
	removeLabel(number: number, label: string): Promise<void>;
	comment(number: number, text: string): Promise<void>;
	openPullRequest(input: {
		readonly head: string;
		readonly title: string;
		readonly body: string;
	}): Promise<number>;
	updatePullRequest(number: number, body: string): Promise<void>;
	closePullRequest(number: number): Promise<void>;
}

/** What a trial merge onto the tip says about one pull request. */
export type ILandConflict = 'none' | 'derived' | 'authored';

/** What building a batch branch over the tip produced. */
export interface ILandBatchBuild {
	/** Members that conflict in authored code: left out, nothing is pushed. */
	readonly conflicting: readonly number[];
	/** The pushed head; absent when nothing was pushed. */
	readonly sha?: string;
	/** Derived files were regenerated in a commit of their own. */
	readonly regenerated: boolean;
	readonly failure?: string;
}

/** The git side of a pass: footprints, trial merges, the batch branch, trees. */
export interface ILandGit {
	/** What the pull request changed since its tested base. */
	footprint(pr: ILandPullRequest): IChangeFootprint;
	/** What the integration branch gained from `base` to `tip`. */
	landedSince(base: string, tip: string): IChangeFootprint;
	conflictOf(pr: ILandPullRequest, tip: string): ILandConflict;
	/** Tip plus members merged, derived files regenerated once, pushed as `ref`. */
	buildBatch(input: {
		readonly ref: string;
		readonly tip: string;
		readonly members: readonly ITrainCandidate[];
	}): ILandBatchBuild;
	/** The tree a commit holds, comparable by equality. */
	treeOf(sha: string): string;
}

export interface ILandDeps {
	readonly forge: ILandForge;
	readonly git: ILandGit;
	/** Where batch branches live, `<ns>/queue/`. */
	readonly batchPrefix: string;
}

/** What one pass did, in order; the next pass reads the forge, not this. */
export interface ILandReport {
	readonly actions: readonly string[];
}

/** What a batch pull request records in its body, read back by the next pass. */
export interface ILandBatchRecord {
	readonly tip: string;
	readonly members: readonly {
		readonly number: number;
		readonly sha: string;
	}[];
	readonly regenerated: boolean;
	readonly red?: {
		readonly culprit?: number;
		readonly suspects: readonly number[];
	};
}
