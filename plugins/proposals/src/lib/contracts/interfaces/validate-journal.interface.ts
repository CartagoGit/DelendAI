/**
 * Contract shapes for `../../shared/validate-journal`.
 */

/** One run of a project's validation gates, as the closing tools read it. */
export interface IValidateJournalEntry {
	readonly result: 'pass' | 'fail';
	readonly timestamp: string;
	readonly exitCode: number;
	readonly logPath: string;
	readonly command: string;
	/**
	 * The steps that failed, on a failing run only. Without them the
	 * closing tools could only answer "run validate", which the agent had
	 * just done, and it looped.
	 */
	readonly failedSteps?: readonly string[];
}

export interface IValidateJournalDeps {
	readonly ensureDir: (path: string) => Promise<void>;
	readonly readText: (path: string) => Promise<string>;
	readonly writeText: (path: string, text: string) => Promise<void>;
	readonly withLock?: <T>(path: string, work: () => Promise<T>) => Promise<T>;
}
