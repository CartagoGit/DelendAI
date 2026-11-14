/** The fixed names and limits of a rehearsal of the pull request flow. */

/** Synthetic pull requests write only under this directory. */
export const REHEARSAL_DIR = 'rehearsal';

/** The fast CI workflow a rehearsal branch carries, and the check it reports. */
export const REHEARSAL_CI_WORKFLOW = 'rehearsal-ci.yml';
export const REHEARSAL_CI_CHECK = 'rehearsal-ci';

/** A workflow every push to the rehearsal integration branch starts: the stand-in for the scan. */
export const REHEARSAL_SCAN_WORKFLOW = 'rehearsal-scan.yml';

/** A workflow that writes with the workflow token, on a label, so the run can reproduce what such writes do. */
export const REHEARSAL_TOKEN_WORKFLOW = 'rehearsal-token.yml';

/** Labels the token workflow reacts to, under the run's label prefix. */
export const REHEARSAL_TOKEN_PUSH_LABEL = 'token-push';
export const REHEARSAL_TOKEN_OPEN_LABEL = 'token-open';

/** Leftovers of a run older than this are swept by the next run's start. */
export const REHEARSAL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** How often the harness reads the forge while it waits on a step. */
export const REHEARSAL_POLL_MS = 15_000;

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
