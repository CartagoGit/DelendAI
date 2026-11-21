/**
 * tech-debt.interface.ts — types for the tech-debt plugin's marker scan. Kept
 * under contracts/interfaces per the types-in-contracts convention.
 */

/** One source file to scan: its repo-relative path and full text. */
export interface ISourceFile {
	readonly path: string;
	readonly content: string;
}

/** A source file the scan found and did not read, and why. */
export interface ISkippedSourceFile {
	readonly path: string;
	readonly reason: 'too-large' | 'unreadable';
}

/** The files a scan read, and what it left out. */
export interface ISourceFileScan {
	readonly files: readonly ISourceFile[];
	readonly skipped: readonly ISkippedSourceFile[];
	/** True when the scan stopped at its file cap. */
	readonly capped: boolean;
}

/** Injected I/O seam so the scan is unit-testable without a filesystem. */
export interface ITechDebtScanDeps {
	/** Every source file to scan (filtered), with the ones it left out. */
	readonly listSourceFiles: () => Promise<ISourceFileScan>;
}

/** Options for the `debt_scan` tool builder. */
export interface ITechDebtScanToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable reader for tests; production reads the filesystem. */
	readonly deps?: ITechDebtScanDeps;
}
