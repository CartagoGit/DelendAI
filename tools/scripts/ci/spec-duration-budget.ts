/**
 * spec-duration-budget.ts — how long a spec file may take (q00045 S1).
 *
 * A full run's merge records each spec file's duration (spec-timings). A
 * file over `REPORT_MS` is reported; a file over `FAIL_MS` is an offender
 * unless it is in the declared e2e tier or is baselined. The baseline holds
 * the offenders that existed when the gate began and can only shrink: a
 * file leaves it by getting fast or by moving to the e2e tier, never joins
 * it.
 *
 * A wall clock on a shared runner is noisy, so the verdict is not the raw
 * number: a file is judged on the median of the recent runs when they are
 * given, and only a file over the limit by `NOISE_MARGIN` is a failure. A
 * file between the limit and the margin is an offender to report. What a
 * failure does depends on where it is found (see the script): a pull
 * request that adds a clearly slow spec fails; the integration branch's
 * certification reports it and files an issue, so runner noise on code
 * already merged never turns develop red.
 */

/** Over this a spec file is reported. */
export const REPORT_MS = 1_000;

/** Over this a spec file outside the e2e tier fails. */
export const FAIL_MS = 5_000;

/**
 * The declared e2e tier: a spec that must stay heavy because it drives a
 * real server, process or repository end to end is named `*.e2e.spec.ts`
 * or lives under an `e2e/` directory.
 */
export const isE2eSpec = (path: string): boolean =>
	/\.e2e\.spec\.[cm]?[jt]sx?$/u.test(path) ||
	/(?:^|\/)e2e\/[^/]+\.spec\.[cm]?[jt]sx?$/u.test(path);

/** A file must be over `FAIL_MS` by this factor to be clearly slow. */
export const NOISE_MARGIN = 1.5;

/** Over this, a spec file outside the e2e tier is clearly slow. */
export const CLEAR_MS = FAIL_MS * NOISE_MARGIN;

const median = (values: readonly number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/**
 * What a file took, as the gate judges it: the median of this run and the
 * recent ones that timed it, so one slow run on a busy runner does not
 * count. Without history it is this run's number.
 */
export const judgedDuration = (
	path: string,
	timings: Readonly<Record<string, number>>,
	history: readonly Readonly<Record<string, number>>[] = [],
): number | undefined => {
	const current = timings[path];
	if (current === undefined) return undefined;
	const earlier = history.flatMap((run) => {
		const ms = run[path];
		return ms === undefined ? [] : [ms];
	});
	return median([current, ...earlier]);
};

export interface ISpecDurationVerdict {
	/** Over `REPORT_MS`, slowest first. */
	readonly slow: readonly { readonly path: string; readonly ms: number }[];
	/** Over `FAIL_MS`, not e2e and not baselined: reported, not yet failing. */
	readonly offenders: readonly {
		readonly path: string;
		readonly ms: number;
	}[];
	/** Over `CLEAR_MS`, not e2e and not baselined: clearly slow. */
	readonly failures: readonly {
		readonly path: string;
		readonly ms: number;
	}[];
	/** Baselined paths that no longer need it: fast now, e2e now, or gone. */
	readonly stale: readonly string[];
}

export const judgeSpecDurations = (
	timings: Readonly<Record<string, number>>,
	baseline: ReadonlySet<string>,
	history: readonly Readonly<Record<string, number>>[] = [],
): ISpecDurationVerdict => {
	const entries = Object.keys(timings)
		.filter((path) => /\.spec\.[cm]?[jt]sx?$/u.test(path))
		.map((path) => ({
			path,
			ms: judgedDuration(path, timings, history) as number,
		}))
		.sort((a, b) => b.ms - a.ms || a.path.localeCompare(b.path));
	const slow = entries.filter(({ ms }) => ms > REPORT_MS);
	const offenders = entries.filter(
		({ path, ms }) =>
			ms > FAIL_MS && !isE2eSpec(path) && !baseline.has(path),
	);
	const failures = offenders.filter(({ ms }) => ms > CLEAR_MS);
	const stale = [...baseline]
		.filter((path) => {
			const ms = judgedDuration(path, timings, history);
			return ms === undefined || ms <= FAIL_MS || isE2eSpec(path);
		})
		.sort();
	return { slow, offenders, failures, stale };
};

/**
 * The failures a change answers for: a pull request's run times the specs
 * nearest its change, neighbours it did not touch included, so only a spec
 * the change adds or edits can fail it. `undefined` touched means all.
 */
export const failuresOfChange = (
	failures: ISpecDurationVerdict['failures'],
	touched: ReadonlySet<string> | undefined,
): ISpecDurationVerdict['failures'] =>
	touched === undefined
		? failures
		: failures.filter(({ path }) => touched.has(path));
