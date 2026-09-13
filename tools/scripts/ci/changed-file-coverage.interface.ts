/** Types for `./changed-file-coverage.script`. */

/** The four numbers every coverage floor in this repo is written in. */
export interface ICoverageMetrics {
	readonly statements: number;
	readonly branches: number;
	readonly functions: number;
	readonly lines: number;
}

/** One metric as vitest's `json-summary` reporter writes it. */
export interface ICoverageCounts {
	readonly total: number;
	readonly covered: number;
}

/** One file's four metrics, as they appear in `coverage-summary.json`. */
export interface IFileCoverageEntry {
	readonly statements: ICoverageCounts;
	readonly branches: ICoverageCounts;
	readonly functions: ICoverageCounts;
	readonly lines: ICoverageCounts;
}

/**
 * What the gate concluded.
 *
 * `NOT_APPLICABLE` and `NOT_EXECUTABLE` are deliberately different
 * words. The first means the question was asked and has no subject — a
 * pull request that changed only documentation has no coverage to
 * judge, and saying so is a verified answer. The second means the
 * question could not be asked at all, which is never a pass.
 */
export type IChangedCoverageVerdict =
	| 'PASS'
	| 'FAIL'
	| 'NOT_APPLICABLE'
	| 'NOT_EXECUTABLE';

/** The gate's full answer, including what it could not see. */
export interface IChangedCoverageReport {
	readonly verdict: IChangedCoverageVerdict;
	/** Files that carried coverage numbers and were judged. */
	readonly judged: readonly string[];
	/**
	 * Changed source files absent from the report.
	 *
	 * Named rather than counted, because the two reasons a file lands
	 * here — deliberately excluded from coverage, or simply never
	 * executed — are indistinguishable from a number.
	 */
	readonly unmeasured: readonly string[];
	/** The aggregate over `judged`, or `undefined` when there is none. */
	readonly measured: ICoverageMetrics | undefined;
	/** Metrics that came in under their floor, worst first. */
	readonly shortfalls: readonly string[];
	readonly reason: string;
}
