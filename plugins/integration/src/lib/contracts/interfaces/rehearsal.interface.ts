/**
 * The shapes of a rehearsal of the pull request flow on the real forge:
 * what a synthetic pull request declares, the scenarios a run plays, the
 * evidence it reads back from the forge, and the report it judges.
 */

/** What a synthetic pull request's fast CI concludes, and after how long. */
export interface IRehearsalDeclaration {
	readonly result: 'success' | 'failure';
	readonly seconds: number;
	/** Sections the change claims to touch; the files it writes carry them. */
	readonly sections: readonly string[];
}

/** One synthetic pull request of a scenario, by key. */
export interface IRehearsalPullSpec {
	readonly key: string;
	readonly declaration: IRehearsalDeclaration;
	/** Files under `rehearsal/` it writes, path to content. */
	readonly files: Readonly<Record<string, string>>;
	/** Opened as a draft and marked ready by a later step. */
	readonly draft?: boolean;
}

/** One step the harness takes, as the author or the environment. */
export type IRehearsalStep =
	| { readonly kind: 'open'; readonly keys: readonly string[] }
	| { readonly kind: 'ready'; readonly keys: readonly string[] }
	| {
			readonly kind: 'await';
			readonly until: 'merged' | 'labelled' | 'checked';
			readonly keys: readonly string[];
			readonly seconds: number;
			/** Wake the integrator (counted as a manual step) when it has not acted. */
			readonly wakeAfterSeconds?: number;
	  }
	| {
			/** The author pushes a new head that resolves what it was told. */
			readonly kind: 'author-update';
			readonly key: string;
			readonly files: Readonly<Record<string, string>>;
	  }
	| {
			/** A workflow pushes to the pull request with the workflow token. */
			readonly kind: 'token-push';
			readonly key: string;
	  }
	| {
			/** A workflow opens a pull request with the workflow token. */
			readonly kind: 'token-open';
			readonly key: string;
	  }
	| {
			/** The integration branch moves under the run, merged by the environment. */
			readonly kind: 'move-integration';
			readonly key: string;
	  };

/** What a scenario must show on the forge for it to pass. */
export type IRehearsalExpectation =
	| { readonly kind: 'merged'; readonly keys: readonly string[] }
	| { readonly kind: 'not-merged'; readonly keys: readonly string[] }
	| {
			readonly kind: 'labelled';
			readonly key: string;
			readonly label: 'needs-update' | 'culprit';
	  }
	| {
			/** Each label is applied once per head and never flips while its reason holds. */
			readonly kind: 'labels-stable';
			readonly key: string;
	  }
	| {
			/** Every head of the pull request started its CI. */
			readonly kind: 'heads-built';
			readonly key: string;
	  }
	| {
			/** CI runs of the overlapping group after it formed, members' own runs excluded. */
			readonly kind: 'group-ci-runs';
			readonly keys: readonly string[];
			readonly exactly: number;
	  }
	| {
			/** Each tip of the integration branch started its push workflows. */
			readonly kind: 'tips-built';
	  }
	| { readonly kind: 'no-manual-steps' }
	| {
			/** A subscribed session heard each merge and failure. */
			readonly kind: 'sessions-notified';
	  };

export interface IRehearsalScenario {
	readonly id: string;
	readonly title: string;
	/** The production failure it reproduces (F1 to F9, F1b), when it is one. */
	readonly reproduces?: string;
	readonly pulls: readonly IRehearsalPullSpec[];
	readonly steps: readonly IRehearsalStep[];
	readonly expect: readonly IRehearsalExpectation[];
}

/** A pull request as the forge reports it. */
export interface IRehearsalPullState {
	readonly number: number;
	readonly head: string;
	readonly headSha: string;
	readonly base: string;
	readonly state: 'open' | 'closed';
	readonly draft: boolean;
	readonly createdAt: string;
	readonly mergedAt?: string;
	readonly labels: readonly string[];
	readonly author: string;
}

/** A label, readiness or merge event on a pull request's timeline. */
export interface IRehearsalPullEvent {
	readonly event: string;
	readonly label?: string;
	readonly createdAt: string;
	readonly actor: string;
}

/** A workflow run as the forge reports it. */
export interface IRehearsalRun {
	readonly id: number;
	readonly workflow: string;
	readonly event: string;
	readonly headBranch: string;
	readonly headSha: string;
	readonly status: string;
	readonly conclusion?: string;
	readonly actor: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** A file written or deleted by one commit. */
export interface IRehearsalFileChange {
	readonly path: string;
	/** `null` deletes the file. */
	readonly content: string | null;
}

/**
 * The forge calls a rehearsal needs. GitHub implements it through `gh`;
 * a spec implements it in memory.
 */
export interface IRehearsalForge {
	readonly tipOf: (branch: string) => Promise<string>;
	readonly createBranch: (name: string, sha: string) => Promise<void>;
	readonly deleteBranch: (name: string) => Promise<void>;
	readonly listBranches: (prefix: string) => Promise<readonly string[]>;
	/**
	 * One commit on `branch` with `parents` (two for a merge), whose tree is
	 * `treeFrom`'s (default the first parent's) with `changes` applied;
	 * returns its sha and moves the branch, never by force.
	 */
	readonly commit: (input: {
		readonly branch: string;
		readonly parents: readonly string[];
		readonly treeFrom?: string;
		readonly message: string;
		readonly changes: readonly IRehearsalFileChange[];
	}) => Promise<string>;
	/** The files directly under `dir` at `sha`. */
	readonly listFiles: (
		sha: string,
		dir: string,
	) => Promise<readonly string[]>;
	/** A file's content at `sha`. */
	readonly readFile: (sha: string, path: string) => Promise<string>;
	/** The first-parent shas `branch` reached, newest first, down to and including `until`. */
	readonly history: (
		branch: string,
		until: string,
	) => Promise<readonly string[]>;
	readonly openPull: (input: {
		readonly head: string;
		readonly base: string;
		readonly title: string;
		readonly body: string;
		readonly draft: boolean;
	}) => Promise<number>;
	readonly setDraft: (number: number, draft: boolean) => Promise<void>;
	readonly mergePull: (number: number, sha: string) => Promise<void>;
	readonly closePull: (number: number) => Promise<void>;
	readonly addLabel: (number: number, label: string) => Promise<void>;
	readonly pulls: (base: string) => Promise<readonly IRehearsalPullState[]>;
	readonly pullEvents: (
		number: number,
	) => Promise<readonly IRehearsalPullEvent[]>;
	readonly runs: (branch: string) => Promise<readonly IRehearsalRun[]>;
	readonly runLog: (id: number) => Promise<string>;
	readonly labels: (prefix: string) => Promise<readonly string[]>;
	readonly deleteLabel: (name: string) => Promise<void>;
	readonly hooks: () => Promise<
		readonly { readonly id: number; readonly url: string }[]
	>;
	readonly deleteHook: (id: number) => Promise<void>;
}

/** The clock and the wait of a run, injected so a spec never sleeps. */
export interface IRehearsalClock {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
}

/** What the integrator workflow and the project files of a branch are. */
export interface IRehearsalSetup {
	/** Files the setup commit writes, given the scenario's integration branch. */
	readonly files: (integration: string) => readonly IRehearsalFileChange[];
}

/** Everything one scenario left on the forge, read back after it ran. */
export interface IRehearsalEvidence {
	readonly scenario: string;
	readonly integration: string;
	readonly pulls: Readonly<Record<string, IRehearsalPullState>>;
	readonly events: Readonly<Record<string, readonly IRehearsalPullEvent[]>>;
	/** Every run on the integration branch and on each pull request's head. */
	readonly runs: readonly IRehearsalRun[];
	/** Shas the integration branch held, in order, from the setup commit on. */
	readonly tips: readonly string[];
	/** Each wake or other action the harness took that a person would have had to. */
	readonly manualSteps: readonly string[];
	/** Notification receipts a subscribed session recorded, if a receiver ran. */
	readonly notifications?: readonly {
		readonly event: string;
		readonly at: string;
	}[];
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
	readonly ok: boolean;
	readonly detail: string;
}

export interface IRehearsalReport {
	readonly runId: string;
	readonly mode: 'fast';
	readonly repository: string;
	readonly tip: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly scenarios: readonly IRehearsalScenarioResult[];
	readonly targets: readonly IRehearsalTargetResult[];
	readonly leftovers: readonly string[];
	readonly secretHits: readonly string[];
	readonly ok: boolean;
}

/** What one `gh` call answered; a refusal is an exit code, never a throw. */
export interface IRehearsalCommandResult {
	readonly exitCode?: number | undefined;
	readonly stdout: string;
	readonly stderr: string;
	readonly spawnError?: string | undefined;
}

/** Runs `gh` with `args`, feeding `input` to its stdin when given. The authentication is the caller's own. */
export type IRehearsalCommandRunner = (
	args: readonly string[],
	input?: string,
) => Promise<IRehearsalCommandResult>;

/** What a run of the rehearsal is given. */
export interface IRehearseInput {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	/** The setup commit's files, given the run they belong to. */
	readonly setup: (runId: string) => IRehearsalSetup;
	readonly repository: string;
	/** `<namespace>/rehearsal/`, from the decisions module. */
	readonly branchPrefix: string;
	/** The branch the run starts from; it is read, never written. */
	readonly baseBranch: string;
	readonly scenarios: readonly IRehearsalScenario[];
	readonly log: (line: string) => void;
}

/** The rendered pieces a rehearsal branch's setup commit is made of. */
export interface IRehearsalSetupInput {
	readonly runId: string;
	readonly branchPrefix: string;
	/** The integrator workflow for a branch, as the project's land renders it. */
	readonly integratorWorkflow: (
		integration: string,
		concurrencyGroup: string,
	) => string;
	/** The project's policy file text; the setup points its integration branch at the rehearsal one. */
	readonly policyText: string;
	/**
	 * Real mode: the project's own CI and scan workflows (file name to text)
	 * replace the fast stand-ins, with their branch filters rendered for the
	 * rehearsal branch, and the project's required checks stay as they are.
	 */
	readonly realWorkflows?: Readonly<Record<string, string>>;
}

/** What a scenario run is given: the forge, the clock and the run's names. */
export interface IRehearsalRunContext {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly setup: IRehearsalSetup;
	readonly runId: string;
	/** The commit every scenario's integration branch starts from. */
	readonly tip: string;
	/** `<namespace>/rehearsal/`, from the decisions module. */
	readonly branchPrefix: string;
	readonly log: (line: string) => void;
}

/** What a scenario run keeps while it plays its steps. */
export interface IScenarioState {
	readonly integration: string;
	readonly numbers: Map<string, number>;
	readonly manualSteps: string[];
	readonly failures: string[];
	readonly tokenHeads: Map<string, string[]>;
	readonly tokenPulls: Map<string, number>;
	setupSha: string;
}

/** A scenario that is red against today's land, and the slice that makes it green. */
export interface IRehearsalKnownRed {
	readonly scenario: string;
	readonly fixedBy: string;
	/** Real mode only: fast mode cannot measure it, so it has no fast scenario. */
	readonly realModeOnly?: boolean;
}

/** The verdict on one pull request's CI wall time. */
export interface IPrCiWallVerdict {
	readonly ok: boolean;
	readonly minutes: number;
	readonly thresholdMinutes: number;
}
