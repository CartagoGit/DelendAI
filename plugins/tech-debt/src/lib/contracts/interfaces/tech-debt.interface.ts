/**
 * tech-debt.interface.ts — types for the tech-debt plugin's marker scan. Kept
 * under contracts/interfaces per the types-in-contracts convention.
 */

/** One source file to scan: its repo-relative path and full text. */
export interface ISourceFile {
	readonly path: string;
	readonly content: string;
}

/** Injected I/O seam so the scan is unit-testable without a filesystem. */
export interface ITechDebtScanDeps {
	/** Return every source file to scan (already bounded + filtered). */
	readonly listSourceFiles: () => Promise<readonly ISourceFile[]>;
}

/** Options for the `debt_scan` tool builder. */
export interface ITechDebtScanToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable reader for tests; production reads the filesystem. */
	readonly deps?: ITechDebtScanDeps;
}
