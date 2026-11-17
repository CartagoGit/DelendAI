/** The fixed names and limits of a rehearsal of the pull request flow. */

/** Synthetic pull requests write only under this directory. */
export const REHEARSAL_DIR = 'rehearsal';

/** The fast CI workflow a rehearsal branch carries, and the check it reports. */
export const REHEARSAL_CI_WORKFLOW = 'rehearsal-ci.yml';
export const REHEARSAL_CI_CHECK = 'rehearsal-ci';

/** A workflow every push to the rehearsal integration branch starts: the stand-in for the scan. */
export const REHEARSAL_SCAN_WORKFLOW = 'rehearsal-scan.yml';

/**
 * Targets that are reported as not measured and do not fail a run, each with
 * the reason it is deferred. Activation refuses a not-measured target that
 * is not listed here.
 */
export const REHEARSAL_DEFERRED_TARGETS: Readonly<Record<string, string>> = {
	'session-notified-p95': 'the real-time transport is S11b',
};

const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;

/**
 * A read (GET) that fails with one of these statuses, or with a connection
 * reset or timeout, is asked again after each delay in turn through the
 * clock; the attempts are the first call plus one per delay. Writes and
 * every other status are never retried.
 */
export const REHEARSAL_READ_RETRY = {
	statuses: [
		HTTP_BAD_GATEWAY,
		HTTP_SERVICE_UNAVAILABLE,
		HTTP_GATEWAY_TIMEOUT,
	],
	delaysMs: [1_000, 3_000, 9_000],
	transientText: /ECONNRESET|ETIMEDOUT|connection reset|timed? ?out/iu,
} as const;

/**
 * The jobs whose `if:` names the integration branch and that a rehearsal
 * branch renders for itself. Every other job gated on that branch stays as
 * the project wrote it: some write to the forge, and must stay off rehearsal
 * branches.
 */
export const REHEARSAL_BRANCH_GATED_JOBS: readonly string[] = [
	'integration-signal',
];

/** The names the fast stand-in workflows list their runs under. */
export const REHEARSAL_FAST_WORKFLOW_NAMES = {
	ci: REHEARSAL_CI_CHECK,
	scan: 'rehearsal-scan',
} as const;

/** The project's own CI and scan workflow files a real-mode rehearsal runs. */
export const REHEARSAL_REAL_CI_FILE = 'ci.yml';
export const REHEARSAL_REAL_SCAN_FILE = 'codeql.yml';

/** A workflow that writes with the workflow token, on a label, so the run can reproduce what such writes do. */
export const REHEARSAL_TOKEN_WORKFLOW = 'rehearsal-token.yml';

/** The name its runs carry (the workflow's `name`), by which the harness finds the run a label started. */
export const REHEARSAL_TOKEN_RUN_NAME = 'rehearsal-token';

/** Labels the token workflow reacts to, under the run's label prefix. */
export const REHEARSAL_TOKEN_PUSH_LABEL = 'token-push';
export const REHEARSAL_TOKEN_OPEN_LABEL = 'token-open';

/**
 * Leftovers of a run older than the job timeout are swept by the next run's
 * start: a run that old was ended by the timeout, so its cleanup never ran.
 */
export const REHEARSAL_STALE_AFTER_MS = 45 * 60_000;

/** Seconds a run may stay queued with no job before it counts as unstarted, not as work in flight. */
export const REHEARSAL_UNSTARTED_AFTER_SECONDS = 60;

/** How often the harness reads the forge while it waits on a step. */
export const REHEARSAL_POLL_MS = 15_000;

/** Seconds the harness keeps reading the forge, after the last step, for the push runs of every merged tip. */
export const REHEARSAL_SETTLE_SECONDS = 120;

/**
 * How the catalogue is played, per mode. The catalogue is cut into groups of
 * `size` scenarios in its own order; each group is one job of the rehearsal
 * workflow (`maxParallel`: how many groups run at once, `all` for every
 * group), and its scenarios play at once inside it.
 *
 * `awaitBudgetSeconds` is the most one scenario spends in all its waits
 * together and `awaitCapSeconds` the most one wait takes; both are the plan
 * of `planGroupBudget`, which the budget spec recomputes, so the worst case
 * of the longest group fits the job timeout.
 */
const FAST_GROUP_SIZE = 4;
const REAL_GROUP_SIZE = 3;
const FAST_AWAIT_MIN_SECONDS = 600;
const REAL_AWAIT_MIN_SECONDS = 900;
const FAST_AWAIT_BUDGET_SECONDS = 1640;
const REAL_AWAIT_BUDGET_SECONDS = 1920;
const FAST_AWAIT_CAP_SECONDS = 820;
const REAL_AWAIT_CAP_SECONDS = 960;
export const REHEARSAL_GROUPING = {
	fast: {
		size: FAST_GROUP_SIZE,
		maxParallel: 'all',
		awaitMinSeconds: FAST_AWAIT_MIN_SECONDS,
		awaitBudgetSeconds: FAST_AWAIT_BUDGET_SECONDS,
		awaitCapSeconds: FAST_AWAIT_CAP_SECONDS,
	},
	// Real CI queues behind the account's runners: one group at a time.
	real: {
		size: REAL_GROUP_SIZE,
		maxParallel: 1,
		awaitMinSeconds: REAL_AWAIT_MIN_SECONDS,
		awaitBudgetSeconds: REAL_AWAIT_BUDGET_SECONDS,
		awaitCapSeconds: REAL_AWAIT_CAP_SECONDS,
	},
} as const;
/** The waits of a scenario that may each take the full cap; the later ones share what the budget has left. */
export const REHEARSAL_AWAITS_AT_CAP = 2;
/** The longest the log scan waits, once for all scenarios, for their runs to conclude. */
export const REHEARSAL_SCAN_WAIT_CAP_SECONDS = 3 * 60;

/** The longest a token step waits for what the workflow token does. */
export const REHEARSAL_TOKEN_WAIT_SECONDS = 5 * 60;

/** Allowance per step for the forge calls it makes around its wait. */
export const REHEARSAL_STEP_OVERHEAD_SECONDS = 10;

/** The job timeout of the rehearsal workflow, in minutes; the workflow file carries the same number. */
export const REHEARSAL_JOB_TIMEOUT_MINUTES = 45;

/** The stale age is the job timeout: a root older than it belongs to a run that cannot be alive. */
export const REHEARSAL_JOB_TIMEOUT_MS = REHEARSAL_JOB_TIMEOUT_MINUTES * 60_000;

/** The longest the cleanup waits, once for all branches, for a workflow run in progress before it deletes them. */
export const REHEARSAL_CLEANUP_WAIT_SECONDS = 2 * 60;

/** Minutes of the job timeout the worst case of every cap must leave unused. */
export const REHEARSAL_JOB_MARGIN_MINUTES = 5;

/** The pinned checkout action the rendered workflows use. */
export const REHEARSAL_CHECKOUT_ACTION =
	'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7';

/** Token shapes no run log may contain. */
const CLASSIC_TOKEN_LENGTH = 30;
const FINE_GRAINED_TOKEN_LENGTH = 40;
export const REHEARSAL_SECRET_SHAPES: readonly RegExp[] = [
	new RegExp(
		`\\bgh[pousr]_[A-Za-z0-9]{${String(CLASSIC_TOKEN_LENGTH)},}`,
		'u',
	),
	new RegExp(
		`\\bgithub_pat_[A-Za-z0-9_]{${String(FINE_GRAINED_TOKEN_LENGTH)},}`,
		'u',
	),
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];

/** The measurable targets of the pull request flow, in the units the report prints. */
const MERGE_P50_MINUTES = 15;
const MERGE_P95_MINUTES = 30;
const NOTIFIED_P95_SECONDS = 10;
const SCAN_COVERAGE_MINUTES = 30;
export const REHEARSAL_TARGETS = {
	prToMergedP50Minutes: MERGE_P50_MINUTES,
	prToMergedP95Minutes: MERGE_P95_MINUTES,
	groupCiRuns: 1,
	manualSteps: 0,
	notifiedP95Seconds: NOTIFIED_P95_SECONDS,
	scanCoverageMinutes: SCAN_COVERAGE_MINUTES,
	secretHits: 0,
} as const;

/** Items per page of a forge listing, and the pages read before a listing is refused. */
export const REHEARSAL_PAGE_SIZE = 100;
export const REHEARSAL_PAGE_LIMIT = 50;

/** The workflow that runs the rehearsal, and its path in the repository. */
export const REHEARSAL_WORKFLOW_NAME = 'rehearsal';
export const REHEARSAL_WORKFLOW_PATH = '.github/workflows/rehearsal.yml';

/** Where `rehearse` writes its report, and the artifact the workflow uploads it as: one per mode. */
export const REHEARSAL_REPORT_DIR = '.cache/delendai/rehearsal';
export const rehearsalReportPath = (mode: string): string =>
	`${REHEARSAL_REPORT_DIR}/report-${mode}.json`;
export const rehearsalReportArtifact = (mode: string): string =>
	`rehearsal-report-${mode}`;
/** The partial report of one group of a mode, and the artifact the group's job uploads it as. */
export const rehearsalGroupReportPath = (mode: string, group: number): string =>
	`${REHEARSAL_REPORT_DIR}/report-${mode}-${String(group)}.json`;
export const rehearsalGroupReportArtifact = (
	mode: string,
	group: number,
): string => `rehearsal-report-${mode}-${String(group)}`;
/** Where the report job puts the partial reports it downloads. */
export const REHEARSAL_GROUP_REPORTS_DIR = `${REHEARSAL_REPORT_DIR}/groups`;

/** Days the forge keeps a report artifact. */
export const REHEARSAL_REPORT_RETENTION_DAYS = 30;

/** The pinned action that downloads the partial reports of a mode's groups. */
export const REHEARSAL_DOWNLOAD_ACTION =
	'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8';
/** The pinned action that uploads the report. */
export const REHEARSAL_UPLOAD_ACTION =
	'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7';

/** What a rehearsal run is told to play: every scenario of the catalogue. */
export const REHEARSAL_ALL_SCENARIOS = 'all';

/** What a scenario writes where the run's id belongs. */
export const RUN_PLACEHOLDER = '{run}';

/** A pull request's CI wall time, in minutes: the target for one that does not touch the integration code, and for one that also runs the rehearsal. */
const PLAIN_WALL_MINUTES = 5;
const REHEARSAL_WALL_MINUTES = 20;
export const PR_CI_WALL_TARGET_MINUTES = {
	plain: PLAIN_WALL_MINUTES,
	withRehearsal: REHEARSAL_WALL_MINUTES,
} as const;

/**
 * The file two pull requests of one scenario both change, a different line
 * each, so their diffs overlap whatever zones the project declares and still
 * merge without a conflict. The setup commit creates it.
 */
export const REHEARSAL_OVERLAP_FILE = `${REHEARSAL_DIR}/shared/overlap.txt`;
const OVERLAP_LINES = 30;
/** The overlap file with `key` written on `line` (a 0-based line; none leaves it as the setup made it). */
export const rehearsalOverlapContent = (edit?: {
	readonly line: number;
	readonly key: string;
}): string =>
	`${Array.from({ length: OVERLAP_LINES }, (_, index) =>
		edit?.line === index
			? `edited by ${edit.key}`
			: `line ${String(index)}`,
	).join('\n')}\n`;

/** Run statuses of work still in flight: the system is not idle. */
export const REHEARSAL_RUNNING_STATUSES: ReadonlySet<string> = new Set([
	'queued',
	'in_progress',
	'waiting',
	'pending',
	'requested',
]);

/**
 * The shape of a synthetic head under the run's root: the project's own
 * publication shape (`<agent>/<kind>/<proposal>-<slice>-g<n>/<topic>`), so the
 * project's head-shape lint judges it as it judges any publication. The
 * run's policy names the root as its publication prefix.
 */
export const REHEARSAL_HEAD_UNIT = 'rehearsal/implement/x00000-S1-g1';

/** The mode a run plays when nobody chose: a push has no inputs. */
export const MODE_EXPRESSION = "${{ inputs.mode || 'fast' }}";
