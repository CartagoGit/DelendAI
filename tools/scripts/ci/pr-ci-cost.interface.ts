export interface IGhStep {
	readonly started_at: string | null;
	readonly completed_at: string | null;
}

export interface IGhJob {
	readonly name: string;
	readonly steps: readonly IGhStep[];
}

export interface IJobCost {
	readonly name: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly seconds: number;
}

export interface IPrCiCost {
	readonly jobs: number;
	readonly runnerSeconds: number;
	readonly wallSeconds: number;
	readonly slowest: readonly IJobCost[];
}

/** A merged pull request, as the weekly report reads it. */
export interface IMergedPr {
	readonly number: number;
	readonly createdAt: string;
	/** When it left draft; its creation when it never was one. */
	readonly readyAt: string;
	readonly mergedAt: string;
	readonly mergedBy: string;
}

/** One CI run of a pull request's head. */
export interface IPrRun {
	readonly pr: number;
	readonly startedAt: string;
	readonly endedAt: string;
	readonly conclusion: string;
	/** Names of the jobs that failed; empty for a run that passed. */
	readonly failedJobs: readonly string[];
}

/** One CI run on the integration branch. */
export interface IDevelopRun {
	readonly createdAt: string;
	readonly conclusion: string;
}

export interface IWeeklyInput {
	readonly prs: readonly IMergedPr[];
	readonly prRuns: readonly IPrRun[];
	readonly developRuns: readonly IDevelopRun[];
	readonly nowMs: number;
}

export interface IFailureCause {
	readonly name: string;
	readonly count: number;
}

export interface IWeeklyCost {
	/** UTC Monday of the week, `YYYY-MM-DD`. */
	readonly week: string;
	readonly developRedHours: number;
	readonly merged: number;
	readonly openToMergeP50Hours: number;
	readonly openToMergeP90Hours: number;
	readonly runsPerPr: number;
	readonly topFailures: readonly IFailureCause[];
}
