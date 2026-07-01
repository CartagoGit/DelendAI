import type { ILogRangeFilter, ILogStore } from './log-store';
import type { ILogEvent } from './normalize-event';

export interface ILogGap {
	readonly startTs: string;
	readonly endTs: string;
	readonly durationMs: number;
}

export interface ICorrelateOptions extends ILogRangeFilter {
	readonly taskId?: string;
	readonly agent?: string;
	readonly gapMs?: number;
}

export const correlateEvents = async (
	store: ILogStore,
	options: ICorrelateOptions,
): Promise<{
	chain: readonly ILogEvent[];
	firstTs: string | null;
	lastTs: string | null;
	gaps: readonly ILogGap[];
}> => {
	if ((options.taskId ? 1 : 0) + (options.agent ? 1 : 0) !== 1) {
		throw new Error('Provide exactly one of taskId or agent.');
	}
	const chain = await store.readRange(options);
	const gapMs = options.gapMs ?? 60_000;
	const gaps: ILogGap[] = [];
	for (let i = 1; i < chain.length; i += 1) {
		const prev = chain[i - 1];
		const next = chain[i];
		if (!prev || !next) continue;
		const durationMs =
			new Date(next.ts).getTime() - new Date(prev.ts).getTime();
		if (durationMs > gapMs) {
			gaps.push({ startTs: prev.ts, endTs: next.ts, durationMs });
		}
	}
	return {
		chain,
		firstTs: chain[0]?.ts ?? null,
		lastTs: chain.at(-1)?.ts ?? null,
		gaps,
	};
};
