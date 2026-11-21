export interface IFakeClock {
	/** Move the clock; timers due in the span run, in order. */
	readonly advance: (ms: number) => void;
	/** As `advance`, and lets promise callbacks run between the timers. */
	readonly advanceAsync: (ms: number) => Promise<void>;
	/** Run every pending timer. */
	readonly runAll: () => void;
}
