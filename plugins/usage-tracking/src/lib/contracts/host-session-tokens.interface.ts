/** A time window; either end open. Both are ISO timestamps or `YYYY-MM-DD`. */
export interface IHostSessionWindow {
	readonly from?: string | undefined;
	readonly to?: string | undefined;
}

/** What one thread (the main one or a subagent) spent. */
export interface IThreadTokens {
	readonly calls: number;
	readonly input: number;
	readonly cacheWrite: number;
	readonly cacheRead: number;
	readonly output: number;
	/** Median of input + cache per call: the context each call carried. */
	readonly contextMedian: number;
	readonly contextMax: number;
	readonly first: string | null;
	readonly last: string | null;
	/** The thread's first user prompt, whitespace-folded and cut. */
	readonly prompt: string;
}

export interface IHostSessionTokens {
	readonly session: string;
	readonly main: IThreadTokens;
	readonly subagents: readonly (IThreadTokens & { readonly id: string })[];
}

export interface IMeterSessionsOptions extends IHostSessionWindow {
	/** One session id (the transcript's file name without `.jsonl`). */
	readonly session?: string | undefined;
}
