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
	/** Whether the residue is present. Reads only. */
	readonly detect: (ctx: ILegacyResidueContext) => Promise<boolean>;
	/** Migrates the residue; returns the paths it changed, none when clean. */
	readonly migrate: (
		ctx: ILegacyResidueContext,
	) => Promise<readonly string[]>;
}
