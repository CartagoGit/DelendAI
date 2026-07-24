/**
 * licenses.interface.ts — types for the offline dependency-license scan
 * (`deps_licenses`). Kept under contracts/interfaces per types-in-contracts.
 */
import type { FindingSeverity } from '@mcp-vertex/core/public';

/** Classification of a single license string. */
export interface ILicenseClass {
	readonly severity: FindingSeverity;
	readonly label: string;
}

/** Injected I/O seam so the license scan is unit-testable. */
export interface ILicenseScanDeps {
	/** Declared dependency names from the manifest. */
	readonly listDependencyNames: () => Promise<readonly string[]>;
	/** The installed package's declared license id, or undefined. */
	readonly readLicense: (pkgName: string) => Promise<string | undefined>;
}
