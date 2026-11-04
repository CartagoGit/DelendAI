/** Types for `./affected-specs.service`. */

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
}
