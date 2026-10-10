export interface IStateSqliteMigration {
	/** The `user_version` this step starts from; it ends at `from + 1`. */
	readonly from: number;
	readonly statements: readonly string[];
}
