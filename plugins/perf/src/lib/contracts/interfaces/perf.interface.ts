/**
 * perf.interface.ts — types for the perf plugin's bundle-size budgets. Kept
 * under contracts/interfaces per the types-in-contracts convention.
 */

/** One measured file and its size in bytes. */
export interface IFileSize {
	readonly path: string;
	readonly bytes: number;
}

/** Size budgets, in bytes. Absent fields mean "no budget for this axis". */
export interface IPerfBudgets {
	/** Max bytes any single matched file may reach. */
	readonly maxFileBytes?: number;
	/** Max bytes the matched files may total. */
	readonly maxTotalBytes?: number;
}

/** Injected I/O seam so the check is unit-testable without a filesystem. */
export interface IPerfScanDeps {
	/** Return the size of every file matching any of the globs. */
	readonly listSizes: (
		globs: readonly string[],
	) => Promise<readonly IFileSize[]>;
}

/** Options for the `perf_bundle` tool builder. */
export interface IPerfBundleToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable sizer for tests; production reads the filesystem. */
	readonly deps?: IPerfScanDeps;
}
