/** Where the runtime records what has already been applied to a workspace. */
export const MIGRATION_JOURNAL_PATH = [
	'.delendai',
	'migrations-applied.json',
] as const;

/** The journal's file name inside the records folder (`<cacheDir>/records/`). */
export const MIGRATION_JOURNAL_FILE = 'migrations-applied.json';
