import type {
	IRehearsalMode,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalWorkflowNames,
} from './rehearsal.interface';

/** Everything one scenario left on the forge, read back after it ran. */
export interface IRehearsalEvidence {
	readonly scenario: string;
	readonly integration: string;
	readonly pulls: Readonly<Record<string, IRehearsalPullState>>;
	readonly events: Readonly<Record<string, readonly IRehearsalPullEvent[]>>;
	/** Every run on the integration branch and on each pull request's head. */
	readonly runs: readonly IRehearsalRun[];
	/** The names of the CI and scan workflows the run judged; absent means the fast stand-ins. */
	readonly workflows?: IRehearsalWorkflowNames;
	/** Shas the integration branch held, in order, from the setup commit on. */
	readonly tips: readonly string[];
	/** Each wake or other action the harness took that a person would have had to. */
	readonly manualSteps: readonly string[];
	/** Notification receipts a subscribed session recorded, if a receiver ran. */
	readonly notifications?: readonly {
		readonly event: string;
		readonly at: string;
		readonly number?: number;
	}[];
	/**
	 * Seconds from each change to its notification, measured only when a
	 * real-time transport ran. Catch-up alone leaves it absent.
	 */
	readonly notifiedSeconds?: readonly number[];
	/** Head shas the harness pushed with the workflow token, by key. */
	readonly tokenHeads: Readonly<Record<string, readonly string[]>>;
	/** Pull requests a workflow opened with the workflow token, by key. */
	readonly tokenPulls: Readonly<Record<string, number>>;
	/** When each group of overlapping pull requests was formed (all opened and ready). */
	readonly startedAt: string;
	readonly finishedAt: string;
	/** Steps that could not be taken, with the reason. */
	readonly failures: readonly string[];
}

export interface IRehearsalExpectationResult {
	readonly expectation: string;
	readonly ok: boolean;
	readonly detail: string;
}

export interface IRehearsalScenarioResult {
	readonly id: string;
	readonly title: string;
	readonly reproduces?: string;
	readonly ok: boolean;
	readonly expectations: readonly IRehearsalExpectationResult[];
	readonly integration: string;
	readonly pulls: Readonly<Record<string, number>>;
}

export interface IRehearsalTargetResult {
	readonly id: string;
	readonly value: number | undefined;
	readonly threshold: number;
	readonly unit: string;
	/** True only when the target was measured and met. */
	readonly ok: boolean;
	/** True when nothing could be measured: `ok` is then false, and the detail says why. */
	readonly notMeasured?: true;
	readonly detail: string;
}

/**
 * What the targets are computed from, kept in the report so that the reports
 * of several groups merge into targets over all their pull requests.
 */
export interface IRehearsalSamples {
	/** Minutes from ready to merged, one per pull request expected merged that merged. */
	readonly mergeMinutes: readonly number[];
	/** Pull requests expected merged. */
	readonly expectedMerged: number;
	readonly manualSteps: number;
	readonly notifiedSeconds: readonly number[];
	/** Whether any scenario had a receiver connected. */
	readonly caughtUp: boolean;
	/** Merged tips, and how many of them started a scan. */
	readonly tips: number;
	readonly scanned: number;
	readonly groupChecks: readonly {
		readonly ok: boolean;
		readonly detail: string;
	}[];
}

export interface IRehearsalReport {
	readonly runId: string;
	readonly mode: IRehearsalMode;
	readonly repository: string;
	readonly tip: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly scenarios: readonly IRehearsalScenarioResult[];
	readonly targets: readonly IRehearsalTargetResult[];
	readonly leftovers: readonly string[];
	readonly secretHits: readonly string[];
	/** Runs whose log could not be read, each with its run id: neither a hit nor a pass. */
	readonly unreadLogs?: readonly string[];
	/** Runs that never started, from the scan and from the cleanup. */
	readonly unstartedRuns?: readonly IUnstartedRun[];
	/** The measurements behind `targets`; reports with them merge. */
	readonly samples?: IRehearsalSamples;
	readonly ok: boolean;
}

/**
 * A workflow run the forge lists as queued but never started (no jobs, no
 * log, not cancellable). `lost`: no pass of its workflow on its branch
 * completed successfully after it was created, so no pass re-read the forge
 * after it and the wake it carried was lost; otherwise `coveredBy` names that pass.
 */
export interface IUnstartedRun {
	readonly id: number;
	readonly workflow: string;
	readonly branch: string;
	readonly lost: boolean;
	readonly coveredBy?: number;
}

/** What cleaning one run left on the forge, and the runs that never started. */
export interface ICleanRunResult {
	readonly leftovers: readonly string[];
	readonly unstarted: readonly IUnstartedRun[];
}

/** What the secret scan of the logs found. */
export interface ILogScan {
	/** Lines of a log that carry a token shape. */
	readonly hits: readonly string[];
	/** Runs that started and were not read, each with its run id and why. */
	readonly unread: readonly string[];
	/** Runs that never started: they have no log, so they are not unread. */
	readonly unstarted: readonly IUnstartedRun[];
}
