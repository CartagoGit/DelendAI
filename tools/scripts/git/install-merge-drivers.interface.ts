/** Contracts for `install-merge-drivers.script.ts`. */

/** What the installer found, and what it did about it. */
export interface IMergeDriverReport {
	/** The pinned checkout whose config was read. */
	readonly root: string;
	/** The git config key the driver lives under. */
	readonly key: string;
	/** The command `.gitattributes` promises. */
	readonly wanted: string;
	/** What was configured before this ran, if anything. */
	readonly found: string;
	readonly installed: boolean;
	readonly changed: boolean;
	/** The paths `.gitattributes` routes through the driver. */
	readonly paths: readonly string[];
}
