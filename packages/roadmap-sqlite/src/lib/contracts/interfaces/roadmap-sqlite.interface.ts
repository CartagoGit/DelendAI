export interface ISqliteTimelineStoreOptions {
	/**
	 * The directory the host gives the plugin for derived files. The
	 * database always lives inside it, so a caller cannot put it at the
	 * workspace root or in a folder of its own.
	 */
	readonly pluginCacheDir: string;
}

/** One step from `from` to the next schema version, applied in one transaction. */
export interface IRoadmapSqliteMigration {
	readonly from: number;
	readonly statements: readonly string[];
}
