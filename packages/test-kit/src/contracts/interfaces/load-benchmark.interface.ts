/** What one benchmark pass does, and the clock it is timed by. */
export interface ILoadBenchmarkWork {
	readonly now: () => number;
	readonly spawn: () => void;
	readonly writeAndRead: (index: number) => void;
	readonly cleanup: () => void;
}
