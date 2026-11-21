/** Shapes of the registry of versioned formats delendai owns. */

/** A reader of one version of a format: true when it accepts the fixture. */
export interface IFormatReader {
	/** The format version this reader parses. */
	readonly version: number;
	/** The existing function that reads it, as `module#export`. */
	readonly pointer: string;
	/**
	 * Parse a fixture of `version`. Absent when the reader lives in a
	 * package that depends on core (a core constant cannot import it); the
	 * spec then injects it by `pointer`.
	 */
	readonly read?: (fixture: unknown) => boolean;
}

/** The rewrite of one version into the next. */
export interface IFormatMigration {
	readonly from: number;
	readonly to: number;
	/** The existing function or list this migration comes from. */
	readonly pointer: string;
	/** Rewrite a `from` fixture into `to`; anything else is returned as it is. */
	readonly migrate: (fixture: unknown) => unknown;
}

/** One persisted or exchanged format and how it is carried forward. */
export interface IFormatEntry {
	readonly id: string;
	/** Where the format is written and read. */
	readonly owner: readonly string[];
	/** The first version the format was ever recorded at. */
	readonly introducedAt: number;
	readonly currentVersion: number;
	/** Readers of previous versions still supported. */
	readonly previousReaders: readonly IFormatReader[];
	/** The reader of the current version. */
	readonly currentReader: IFormatReader;
	/** Migrations, each rewriting one version to the next. */
	readonly migrations: readonly IFormatMigration[];
	/** One small fixture per version a reader or migration is declared for. */
	readonly fixtures: Readonly<Record<number, unknown>>;
	/** Said when the format has no previous-version reader to record. */
	readonly note?: string;
}
