/**
 * spec-duration-budget.ts — how long a spec file may take (q00045 S1).
 *
 * A full run's merge records each spec file's duration (spec-timings). A
 * file over `REPORT_MS` is reported; a file over `FAIL_MS` fails unless it
 * is in the declared e2e tier or is baselined. The baseline holds the
 * offenders that existed when the gate began and can only shrink: a file
 * leaves it by getting fast or by moving to the e2e tier, never joins it.
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

export interface ISpecDurationVerdict {
	/** Over `REPORT_MS`, slowest first. */
	readonly slow: readonly { readonly path: string; readonly ms: number }[];
	/** Over `FAIL_MS`, not e2e and not baselined. */
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
): ISpecDurationVerdict => {
	const entries = Object.entries(timings)
		.filter(([path]) => /\.spec\.[cm]?[jt]sx?$/u.test(path))
		.map(([path, ms]) => ({ path, ms }))
		.sort((a, b) => b.ms - a.ms || a.path.localeCompare(b.path));
	const slow = entries.filter(({ ms }) => ms > REPORT_MS);
	const failures = entries.filter(
		({ path, ms }) =>
			ms > FAIL_MS && !isE2eSpec(path) && !baseline.has(path),
	);
	const stale = [...baseline]
		.filter((path) => {
			const ms = timings[path];
			return ms === undefined || ms <= FAIL_MS || isE2eSpec(path);
		})
		.sort();
	return { slow, failures, stale };
};
