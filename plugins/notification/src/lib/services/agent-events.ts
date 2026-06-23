import { stat, readFile } from 'node:fs/promises';

export type IAgentEventKind = 'agent-alive' | 'agent-idle' | 'agent-dead';

export interface IAgentEvent {
	readonly kind: IAgentEventKind;
	readonly agent: string;
	readonly taskId: string;
	readonly ts: string;
	readonly lastSeen: string;
	readonly missedBeats: number;
}

interface ILockEntryLite {
	task_id?: string;
	agent?: string;
}

export interface IAgentHeartbeatWatcher {
	check(now?: Date): Promise<IAgentEvent[]>;
	start(): void;
	stop(): void;
}

export interface IWatchAgentHeartbeatOptions {
	readonly lockFile: string;
	readonly heartbeatMs: number;
	readonly intervalMs?: number;
	readonly onEvent: (event: IAgentEvent) => void;
}

const readClaims = async (
	lockFile: string,
): Promise<Array<{ taskId: string; agent: string }>> => {
	try {
		const parsed = JSON.parse(await readFile(lockFile, 'utf8')) as {
			in_flight?: ILockEntryLite[];
		};
		return (parsed.in_flight ?? [])
			.filter((entry) => typeof entry.task_id === 'string')
			.map((entry) => ({
				taskId: entry.task_id ?? '',
				agent: entry.agent ?? 'unknown',
			}));
	} catch {
		return [];
	}
};

const mtimeMs = async (path: string): Promise<number | null> => {
	try {
		return (await stat(path)).mtimeMs;
	} catch {
		return null;
	}
};

const eventKey = (agent: string, taskId: string): string =>
	`${agent}\0${taskId}`;

/**
 * Watch the shared lock file heartbeat and emit coarse agent lifecycle events.
 * `check()` is exposed for deterministic tests and for callers that already
 * have their own scheduling loop; `start()` adds the normal interval.
 */
export const watchAgentHeartbeat = (
	options: IWatchAgentHeartbeatOptions,
): IAgentHeartbeatWatcher => {
	let lastMtime: number | null = null;
	let lastSeen = new Map<string, Date>();
	let emittedState = new Map<string, IAgentEventKind>();
	let timer: ReturnType<typeof setInterval> | undefined;

	const emit = (
		kind: IAgentEventKind,
		agent: string,
		taskId: string,
		now: Date,
		seen: Date,
		missedBeats: number,
	): IAgentEvent => {
		const event: IAgentEvent = {
			kind,
			agent,
			taskId,
			ts: now.toISOString(),
			lastSeen: seen.toISOString(),
			missedBeats,
		};
		options.onEvent(event);
		return event;
	};

	const check = async (now = new Date()): Promise<IAgentEvent[]> => {
		const claims = await readClaims(options.lockFile);
		const claimKeys = new Set(
			claims.map((claim) => eventKey(claim.agent, claim.taskId)),
		);
		lastSeen = new Map([...lastSeen].filter(([key]) => claimKeys.has(key)));
		emittedState = new Map(
			[...emittedState].filter(([key]) => claimKeys.has(key)),
		);

		const currentMtime = await mtimeMs(options.lockFile);
		const bumped = currentMtime !== null && currentMtime !== lastMtime;
		if (currentMtime !== null && lastMtime === null)
			lastMtime = currentMtime;

		const out: IAgentEvent[] = [];
		for (const claim of claims) {
			const key = eventKey(claim.agent, claim.taskId);
			if (bumped) {
				lastSeen.set(key, now);
				emittedState.delete(key);
				out.push(
					emit('agent-alive', claim.agent, claim.taskId, now, now, 0),
				);
				continue;
			}

			const seen = lastSeen.get(key) ?? now;
			lastSeen.set(key, seen);
			const missedBeats = Math.floor(
				(now.getTime() - seen.getTime()) / options.heartbeatMs,
			);
			const previous = emittedState.get(key);
			if (missedBeats >= 10 && previous !== 'agent-idle') {
				emittedState.set(key, 'agent-idle');
				out.push(
					emit(
						'agent-idle',
						claim.agent,
						claim.taskId,
						now,
						seen,
						missedBeats,
					),
				);
			} else if (missedBeats >= 3 && previous !== 'agent-dead') {
				emittedState.set(key, 'agent-dead');
				out.push(
					emit(
						'agent-dead',
						claim.agent,
						claim.taskId,
						now,
						seen,
						missedBeats,
					),
				);
			}
		}
		if (currentMtime !== null) lastMtime = currentMtime;
		return out;
	};

	const start = (): void => {
		const intervalMs = options.intervalMs ?? options.heartbeatMs;
		timer = setInterval(() => {
			void check().catch(() => undefined);
		}, intervalMs);
		timer.unref?.();
	};

	const stop = (): void => {
		if (timer) clearInterval(timer);
		timer = undefined;
	};

	return { check, start, stop };
};
