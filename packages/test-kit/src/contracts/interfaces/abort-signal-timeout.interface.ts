export interface IAbortSignalTimeoutStub {
	/** The durations the code asked for, in call order. */
	readonly requested: () => readonly number[];
	/** How many deadlines the code has set so far. */
	readonly count: () => number;
	/** The deadline at `index` elapses (all of them when omitted). */
	readonly fire: (index?: number) => void;
}
