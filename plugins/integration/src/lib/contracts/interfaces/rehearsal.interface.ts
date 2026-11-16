export type {
	IRehearsalEvidence,
	IRehearsalExpectationResult,
	IRehearsalReport,
	IRehearsalSamples,
	IRehearsalScenarioResult,
	IRehearsalTargetResult,
} from './rehearsal-evidence.interface';
import type { IRehearsalSetupMaterialiser } from './rehearsal-setup-materialiser.interface';

/**
 * The shapes of a rehearsal of the pull request flow on the real forge:
 * what a synthetic pull request declares, the scenarios a run plays, the
 * evidence it reads back from the forge, and the report it judges.
 */

/** What a synthetic pull request's fast CI concludes, and after how long. */
export interface IRehearsalDeclaration {
	readonly result: 'success' | 'failure';
	readonly seconds: number;
	/**
	 * What a batch holding this pull request concludes, whatever its own
	 * result: the batch is red when any declaration in its tree says `failure`.
	 */
	readonly batch?: 'success' | 'failure';
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
	| {
			readonly kind: 'ready';
			readonly keys: readonly string[];
			/** Members of one batch: made ready in one forge request, once no pass is open. */
			readonly together?: boolean;
	  }
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
	  }
	| {
			/**
			 * A receiver subscribed to these pull requests connects after they
			 * changed, asks the forge once for what it missed, and connects
			 * again: the host's own catch-up, driven by the harness.
			 */
			readonly kind: 'receive';
			readonly keys: readonly string[];
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
			/** A subscribed session heard each merge and failure, each exactly once. */
			readonly kind: 'sessions-notified';
	  };

/** How a rehearsal runs: on stand-in workflows, or under the project's own CI and scans. */
export type IRehearsalMode = 'fast' | 'real';

export interface IRehearsalScenario {
	readonly id: string;
	readonly title: string;
	/** The modes it runs in; absent means both. A scenario that needs the workflow token runs in fast only. */
	readonly modes?: readonly IRehearsalMode[];
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
/** What cancelling a workflow run came to. */
export type IRehearsalCancel = 'cancelled' | 'ended' | 'unstarted';

export interface IRehearsalRun {
	readonly id: number;
	/** The run's name: its `run-name` once the workflow evaluated it, else the workflow's name. */
	readonly workflow: string;
	/** The workflow file's id: the same for every run of it, however each is named. */
	readonly workflowId?: number;
	readonly event: string;
	readonly headBranch: string;
	readonly headSha: string;
	readonly status: string;
	readonly conclusion?: string;
	readonly actor: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** A check run of a commit: what branch protection judges, one per job a workflow started. */
export interface IRehearsalCheckRun {
	readonly id: number;
	readonly name: string;
	readonly headSha: string;
	readonly status: string;
	readonly conclusion?: string;
	readonly startedAt: string;
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
	/** Marks several draft pull requests ready in ONE request, so the forge emits their events together. */
	readonly readyTogether: (numbers: readonly number[]) => Promise<void>;
	readonly mergePull: (number: number, sha: string) => Promise<void>;
	readonly closePull: (number: number) => Promise<void>;
	readonly addLabel: (number: number, label: string) => Promise<void>;
	readonly pulls: (base: string) => Promise<readonly IRehearsalPullState[]>;
	readonly pullEvents: (
		number: number,
	) => Promise<readonly IRehearsalPullEvent[]>;
	readonly runs: (branch: string) => Promise<readonly IRehearsalRun[]>;
	readonly runLog: (id: number) => Promise<string>;
	/**
	 * Cancels a workflow run that is queued or in progress. `ended`: it had
	 * already concluded. `unstarted`: the forge lists it as queued but has not
	 * enqueued it ("has not been queued yet"), so it cannot be cancelled and
	 * has no jobs or log.
	 */
	readonly cancelRun: (id: number) => Promise<IRehearsalCancel>;
	/** How many jobs the forge has created for a workflow run. */
	readonly jobCount: (id: number) => Promise<number>;
	/** Reopens a closed pull request: with `closePull`, the event the integrator wakes on. */
	readonly reopenPull: (number: number) => Promise<void>;
	/** The check runs of the commit `sha`; a workflow run with no job has none. */
	readonly checkRuns: (sha: string) => Promise<readonly IRehearsalCheckRun[]>;
	readonly labels: (prefix: string) => Promise<readonly string[]>;
	readonly deleteLabel: (name: string) => Promise<void>;
}

/** The clock and the wait of a run, injected so a spec never sleeps. */
export interface IRehearsalClock {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
}

/** What the integrator workflow and the project files of a branch are. */
/** The names the forge lists the CI and the scan workflow runs under. */
export interface IRehearsalWorkflowNames {
	readonly ci: string;
	readonly scan: string;
}

export interface IRehearsalSetup {
	/** The workflows the run judges; absent means the fast stand-ins. */
	readonly workflows?: IRehearsalWorkflowNames;
	/** The names of the checks branch protection requires on a pull request's head. */
	readonly requiredChecks: readonly string[];
	/** Files the setup commit writes, given the scenario's integration branch. */
	readonly files: (
		integration: string,
	) => Promise<readonly IRehearsalFileChange[]>;
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
	/** The branch the run starts from when no commit is given; it is read, never written. */
	readonly baseBranch: string;
	/**
	 * The commit every scenario's integration branch is cut from, and the one
	 * the report names as its tip: the commit the code under test runs at.
	 * Absent: the tip of `baseBranch`.
	 */
	readonly baseCommit?: string;
	readonly scenarios: readonly IRehearsalScenario[];
	/** The mode the run plays and its report names; absent means fast. */
	readonly mode?: IRehearsalMode;
	/** How many scenarios play at once; absent means the default, 1 plays them one after another. */
	readonly concurrency?: number;
	/** The group of the mode's catalogue this run plays: its run root carries the number, so groups never read each other's branches. */
	readonly group?: number;
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
	/** Real mode: the project's integration branch name, the one the filters of those workflows name. */
	readonly projectIntegration?: string;
	/** Real mode: the policy's `rehearsal.setupCommand`; empty or absent runs nothing. */
	readonly setupCommand?: string;
	/** Real mode: runs `setupCommand`; required when there is one. */
	readonly materialise?: IRehearsalSetupMaterialiser;
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
	/** The longest one wait takes, and the most a scenario spends in all its waits; absent means the fast mode's. */
	readonly awaitCapSeconds?: number;
	readonly awaitBudgetSeconds?: number;
}

/** What a scenario run keeps while it plays its steps. */
export interface IScenarioState {
	readonly integration: string;
	readonly numbers: Map<string, number>;
	readonly manualSteps: string[];
	readonly failures: string[];
	readonly tokenHeads: Map<string, string[]>;
	readonly tokenPulls: Map<string, number>;
	/** What each receiver that connected was told; `undefined` until one did. */
	notifications: { event: string; at: string; number?: number }[] | undefined;
	setupSha: string;
	awaitedMs: number; // milliseconds spent in waits so far
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
