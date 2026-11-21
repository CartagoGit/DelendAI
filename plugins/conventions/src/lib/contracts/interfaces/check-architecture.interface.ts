/**
 * Contract shapes for `conventions_check_architecture`.
 */
import type { IImportDetectorId } from './layer-graph.interface';

export interface IArchitectureDirEntry {
	readonly name: string;
	readonly isDirectory: boolean;
}

/**
 * Narrow filesystem port. Production lists through the containment-checked
 * directory reader and reads through `SafeWorkspaceReader`; specs use memory.
 */
export interface IArchitectureReader {
	list(relDir: string): Promise<readonly IArchitectureDirEntry[]>;
	/** File text, or `undefined` when it cannot be read. */
	readText(relPath: string): Promise<string | undefined>;
}

export interface ICheckArchitectureToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IArchitectureReader;
	readonly defaultRoots?: readonly string[];
}

export interface ICheckArchitectureArgs {
	readonly roots?: readonly string[] | undefined;
	/** Finding keys accepted as pre-existing debt. */
	readonly baseline?: readonly string[] | undefined;
}

export interface IArchitectureFinding {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
	readonly rule: string;
	readonly enforcedBy: string;
	readonly because: string;
	/** `file:specifier:enforcedBy` — stable across line moves. */
	readonly baselineKey: string;
	readonly baselined: boolean;
}

/** How much each detector actually read, so a green report can be judged. */
export interface IArchitectureDetectorSample {
	readonly detector: IImportDetectorId;
	readonly enforcedBy: string;
	readonly filesInScope: number;
	readonly findings: number;
}
