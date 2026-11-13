/**
 * Contract shapes for `./land`: what one pass reads from the forge and from
 * git, and what it reports. Any forge implements `ILandForge` (GitLab has
 * every call: pipelines, merge with `sha`, rebase, labels, notes, merge
 * requests); GitHub is the first implementation (`./land-forge.github`).
 */
import type { ITrainCandidate } from '../decisions/culprit.interface';
import type { IChangeFootprint } from '../decisions/overlap.interface';

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
	/** Who pushed its head, when the forge says (a login). */
	readonly headAuthor?: string | undefined;
}

/** The answer to a merge pinned to a head: nothing merges on another head. */
export type ILandMerge = 'merged' | 'head-moved' | 'refused';

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
	/**
	 * Start `workflow` on `ref`, as a person's push there would have; whether
	 * the forge took it. The integrator's own merges start no workflow, so it
	 * starts the ones a push would.
	 */
	dispatchWorkflow(workflow: string, ref: string): Promise<boolean>;
}

/** When a workflow runs, as far as a merge by the integrator is concerned. */
export interface ILandWorkflowTriggers {
	/** Its file name, which is how the forge is asked to start it. */
	readonly file: string;
	/** A push to the integration branch starts it. */
	readonly pushesIntegration: boolean;
	/** It can be started on request. */
	readonly dispatchable: boolean;
	/** The workflows whose completion starts it. */
	readonly afterWorkflows: readonly string[];
}

/** What follows a pass that merged: what to start, and what cannot be. */
export interface ILandFollowUps {
	readonly dispatch: readonly string[];
	/** Started by a push but not on request: a merge by the integrator skips it. */
	readonly unreachable: readonly string[];
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
	/**
	 * The tree `members` merged onto `tip` would hold, as `treeOf` writes
	 * it, without regenerating or pushing anything; `undefined` when they
	 * conflict. Read before a merge: nothing lands that was not tested.
	 */
	mergedTree(input: {
		readonly tip: string;
		readonly members: readonly ITrainCandidate[];
	}): string | undefined;
}

/**
 * Everything project-specific a pass reads. `landConfigFromPolicy` fills
 * the branch, namespace, merge method and required checks from the
 * development policy; the rest is how the project selects, regenerates and
 * names its checks, supplied by whoever wires `land` in.
 */
export interface ILandConfig {
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	/** Where batch branches live, `<ns>/queue/`. */
	readonly batchPrefix: string;
	readonly mergeMethod: 'merge' | 'squash' | 'rebase';
	/** The checks that must be green; empty reads them from the forge. */
	readonly requiredChecks: readonly string[];
	/** True only where the policy opts in to landing with no required check. */
	readonly withoutChecks: boolean;
	/**
	 * Whether land may build batch branches. Only where the actor that runs
	 * land pushes commits the forge builds: a workflow token's push and the
	 * pull request it opens start no CI, so a batch it built would never be
	 * judged. Off, overlapping pull requests land one at a time.
	 */
	readonly batches: boolean;
	/** Actors whose pushes the forge does not build; a head they pushed is never ready. */
	readonly unbuiltAuthors: readonly string[];
	/** Most pull requests in one batch. */
	readonly batchCapacity: number;
	/**
	 * The section (test zone, package, job group) a check name reports, or
	 * `undefined` for a check that names none. Projects without sections
	 * return `undefined` always: a failure then has no single owner.
	 */
	readonly sectionOfCheck: (name: string) => string | undefined;
}

export interface ILandDeps {
	readonly forge: ILandForge;
	readonly git: ILandGit;
	readonly config: ILandConfig;
}

/** Runs the forge CLI with these arguments (the forge seam's shape). */
export type ILandCommandRunner = (args: readonly string[]) => Promise<{
	readonly exitCode?: number | undefined;
	readonly stdout: string;
	readonly stderr: string;
	readonly spawnError?: string | undefined;
}>;

/** What one pass did, in order; the next pass reads the forge, not this. */
export interface ILandReport {
	readonly actions: readonly string[];
	/** Every open pull request this pass saw, with what happened to it or why it waits. */
	readonly reasons: ReadonlyMap<number, string>;
	/** How many pull requests the forge merged in this pass. */
	readonly mergedCount: number;
	/** The pull requests the forge merged, a batch by its own number. */
	readonly mergedPRs: readonly number[];
	/** The integration tip when the pass ended. */
	readonly tipSha: string;
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

/** One upkeep step the land workflow runs on its schedule. */
export interface ILandUpkeepStep {
	readonly name: string;
	readonly run: string;
	readonly env?: Readonly<Record<string, string>>;
}

/**
 * The values the land workflow template takes from a project. Whether the
 * project integrates with `land` at all is its policy's
 * `development.integration.engine`: the file exists only when it says so.
 */
export interface ILandWorkflowInput {
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	/**
	 * The workflows whose finishing starts a pass on a pull request, and
	 * the promotion on the integration branch (the project's CI, its scan).
	 */
	readonly checkWorkflows: readonly string[];
	/** Steps that prepare a runner (checkout and toolchain), as YAML lines. */
	readonly setupSteps: readonly string[];
	/** The command that runs one pass. */
	readonly passCommand: string;
	readonly cron: string;
	/**
	 * Run once the integration branch's CI finishes: opens the promotion
	 * when the branch is green, files one urgent repair when it is red.
	 */
	readonly promotionCommand?: string;
	/** Run when the release branch moves: carries it back into the integration branch. */
	readonly forwardSyncCommand?: string;
	/** Upkeep run on the schedule, every step whatever the previous one concluded. */
	readonly upkeep?: readonly ILandUpkeepStep[];
	/** The concurrency group of the passes; `land` when absent. A rehearsal names its own, so it never queues behind production. */
	readonly concurrencyGroup?: string;
}
