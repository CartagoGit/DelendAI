/**
 * legacy-residue.interface.ts — what an older delendai left behind, as data.
 *
 * An entry names one kind of residue, says where it lives and carries two
 * functions over an injected IO: one finds it, one migrates it and may be run
 * again without changing anything more.
 */

/** What the residue is. */
export type ILegacyResidueKind =
	| 'name'
	| 'config-key'
	| 'file'
	| 'launch-command'
	| 'clone'
	| 'ref-namespace'
	| 'process';

/** Where the residue lives: on the machine, or inside one project. */
export type ILegacyResidueScope = 'machine' | 'project';

/** The only way an entry reaches the filesystem. */
export interface ILegacyResidueIO {
	/** The file's text, or `undefined` when it does not exist. */
	readonly readText: (path: string) => Promise<string | undefined>;
	readonly writeText: (path: string, text: string) => Promise<void>;
}

export interface ILegacyResidueContext {
	/** The project root for a project entry, the home directory for a machine one. */
	readonly root: string;
	readonly io: ILegacyResidueIO;
}

export interface ILegacyResidueEntry {
	readonly id: string;
	/** The release this entry was added in. */
	readonly since: string;
	readonly kind: ILegacyResidueKind;
	readonly scope: ILegacyResidueScope;
	/** The retired names, config keys, file names or launch shapes this entry carries away. */
	readonly names?: readonly string[];
	/** Whether the residue is present. Reads only. */
	readonly detect: (ctx: ILegacyResidueContext) => Promise<boolean>;
	/** Migrates the residue; returns the paths it changed, none when clean. */
	readonly migrate: (
		ctx: ILegacyResidueContext,
	) => Promise<readonly string[]>;
}

/** What a machine-scope run records in the user state directory. */
export interface ILegacyResidueState {
	/** The registry the run was made against; a changed registry runs again. */
	readonly registry: string;
	/** Questions already put to the person, as `file::entry`. */
	readonly asked: readonly string[];
}

export interface ILegacyResidueBootOptions {
	readonly workspaceRoot: string;
	readonly home: string;
	readonly platform: 'linux' | 'darwin' | 'win32';
	readonly appData?: string;
	readonly windowsHomes?: readonly string[];
	readonly env: Readonly<Record<string, string | undefined>>;
	/** The workspace configuration's text, when it has one. */
	readonly configText: string | undefined;
	/** Reads and writes files; writing creates the directories it needs. */
	readonly io: ILegacyResidueIO;
	readonly now: () => Date;
}
