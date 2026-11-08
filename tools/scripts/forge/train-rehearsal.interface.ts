/** One gate a train's run or push will meet, judged on the rehearsed train. */
export interface IRehearsalResult {
	readonly label: string;
	readonly ok: boolean;
	readonly seconds: number;
	/** The lines that name the cause, when it failed. */
	readonly causes: readonly string[];
}

/** One command the rehearsal runs on the assembled train. */
export interface IRehearsalGate {
	readonly label: string;
	/** A bash script, as the CI job or the hook runs it. */
	readonly script: string;
	/** What git writes to the hook's stdin; empty for a CI job. */
	readonly stdin?: string;
}
