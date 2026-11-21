/** Types for the import graph (`import-graph.service`). */
/** What one module declares and names, by the names it asks for. */
export interface IModuleFacts {
	/** The names the module declares and exports itself. */
	readonly local: ReadonlySet<string>;
	/** `export … from`: names it answers for another module, or all of them. */
	readonly reexports: readonly {
		readonly from: string;
		/** Exported name to the name the source module gives it, or `*`. */
		readonly names: ReadonlyMap<string, string> | '*';
	}[];
	/** What it imports from each module: the names asked, or `*` for all. */
	readonly imports: readonly {
		readonly target: string;
		readonly names: readonly string[] | '*';
	}[];
}

/** The repository as the analysis reads it. */
export interface IAffectedSpecsInput {
	/** Every tracked file, relative to the root. */
	readonly files: readonly string[];
	/** Changed files, relative to the root. */
	readonly changed: readonly string[];
	/** The text of a tracked file. */
	readonly read: (file: string) => string;
	/** `compilerOptions.paths` of the base tsconfig. */
	readonly paths: Readonly<Record<string, readonly string[]>>;
	/** The setup files every spec loads; none when omitted. */
	readonly setupFiles?: readonly string[];
}

/** Who imports whom, as the analysis follows it: file to its importers. */
export type IImportEdges = ReadonlyMap<string, ReadonlySet<string>>;

/** The part of the analysis that does not depend on what changed. */
export interface IImportGraph {
	/** The tracked TypeScript files the graph was built over. */
	readonly known: ReadonlySet<string>;
	/** Importers by the module that declares what they ask for. */
	readonly bySymbol: IImportEdges;
	/** Importers by the module they name, whatever they ask of it. */
	readonly byFile: IImportEdges;
}

/** The graph as stored: importers as sorted lists. */
export interface IStoredImportGraph {
	readonly known: readonly string[];
	readonly bySymbol: Readonly<Record<string, readonly string[]>>;
	readonly byFile: Readonly<Record<string, readonly string[]>>;
}

/** Where a built graph is kept between calls, by the tree it was built for. */
export interface IImportGraphStore {
	readonly load: (key: string) => Promise<IStoredImportGraph | undefined>;
	readonly save: (key: string, graph: IStoredImportGraph) => Promise<void>;
}

/** What the analysis reads of a repository, once its files are in memory. */
export type IImportGraphInput = Pick<
	IAffectedSpecsInput,
	'files' | 'read' | 'paths'
>;
