/**
 * user-host-config.interface.ts — the user-level config files of the agent
 * hosts, and what a migration of them reports.
 */
import type { IAgentHostUserConfigFile } from './agent-host.interface';
import type { ILegacyResidueIO } from './legacy-residue.interface';

/** What the resolver needs to know about the machine; nothing is read from it. */
export interface IUserConfigEnvironment {
	readonly platform: 'linux' | 'darwin' | 'win32';
	readonly home: string;
	/** Roaming application data, on Windows. */
	readonly appData?: string;
	/** Under WSL: the Windows users' home directories, e.g. `/mnt/c/Users/<name>`. */
	readonly windowsHomes?: readonly string[];
}

export interface IResolvedUserConfigFile {
	readonly hostId: string;
	readonly path: string;
	readonly format: IAgentHostUserConfigFile['format'];
}

export interface IResolvedUserConfig {
	readonly files: readonly IResolvedUserConfigFile[];
	/** Hosts that declare no user-level config file. */
	readonly notCovered: readonly string[];
}

export interface IUserHostConfigChange {
	readonly hostId: string;
	readonly file: string;
	readonly backup: string;
	/** The server entries that were rewritten. */
	readonly entries: readonly string[];
}

export interface IUserHostConfigQuestion {
	readonly hostId: string;
	readonly file: string;
	/** An entry that is not demonstrably delendai's own. */
	readonly entry: string;
}

export interface IUserHostConfigFailure {
	readonly file: string;
	readonly reason: string;
}

export interface IUserHostConfigReport {
	readonly changes: readonly IUserHostConfigChange[];
	readonly questions: readonly IUserHostConfigQuestion[];
	readonly failures: readonly IUserHostConfigFailure[];
	readonly notCovered: readonly string[];
	/** Directories of old clones the entries launch from; reported, never touched. */
	readonly clones: readonly string[];
}

export interface IUserHostConfigMigrationOptions {
	readonly resolved: IResolvedUserConfig;
	readonly io: ILegacyResidueIO;
	/** The delendai user state directory's backups folder. */
	readonly backupDir: string;
	readonly now: () => Date;
	/** Report what would change, writing nothing: no backup, no edit. */
	readonly dryRun?: boolean;
}
