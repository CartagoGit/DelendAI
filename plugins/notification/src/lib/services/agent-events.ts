import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

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
	started_at?: string;
	last_seen?: string;
}

const AGENT_IDLE_MISSED_BEATS = 10;
const AGENT_DEAD_MISSED_BEATS = 3;

export interface IAgentHeartbeatWatcher {
	check(now?: Date): Promise<IAgentEvent[]>;
	start(): void;
	stop(): void;
}

export interface IWatchAgentHeartbeatOptions {
	readonly lockFile: string;
	readonly heartbeatMs: number;
	readonly intervalMs?: number;
	readonly onEvent: (event: IAgentEvent) => void | Promise<void>;
}

interface IHeartbeatSnapshot {
	readonly claims: Array<{
		taskId: string;
		agent: string;
		lastSeen: string | undefined;
	}>;
	readonly staleAfterMinutes: number;
}

const readSnapshot = async (lockFile: string): Promise<IHeartbeatSnapshot> => {
	try {
		const parsed = JSON.parse(
			(
				await new SafeWorkspaceReader(dirname(lockFile)).readText(
					basename(lockFile),
				)
			).content,
		) as {
			stale_after_minutes?: number;
			in_flight?: ILockEntryLite[];
		};
		return {
			staleAfterMinutes:
				typeof parsed.stale_after_minutes === 'number' &&
				parsed.stale_after_minutes > 0
					? parsed.stale_after_minutes
					: 10,
			claims: (parsed.in_flight ?? [])
				.filter((entry) => typeof entry.task_id === 'string')
				.map((entry) => ({
					taskId: entry.task_id ?? '',
					agent: entry.agent ?? 'unknown',
					lastSeen: entry.last_seen ?? entry.started_at,
				})),
		};
	} catch {
		return { claims: [], staleAfterMinutes: 10 };
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
	const legacyLastSeen = new Map<string, Date>();
	let emittedState = new Map<string, IAgentEventKind>();
	let timer: ReturnType<typeof setInterval> | undefined;

	const emit = (
		kind: IAgentEventKind,
		agent: string,
		taskId: string,
		now: Date,
		seen: Date,
		missedBeats: number,
	): Promise<IAgentEvent> => {
		const event: IAgentEvent = {
			kind,
			agent,
			taskId,
			ts: now.toISOString(),
			lastSeen: seen.toISOString(),
			missedBeats,
		};
		return Promise.resolve(options.onEvent(event)).then(() => event);
	};

	const check = async (now = new Date()): Promise<IAgentEvent[]> => {
		const snapshot = await readSnapshot(options.lockFile);
		const claims = snapshot.claims;
		const claimKeys = new Set(
			claims.map((claim) => eventKey(claim.agent, claim.taskId)),
		);
		emittedState = new Map(
			[...emittedState].filter(([key]) => claimKeys.has(key)),
		);
		for (const key of legacyLastSeen.keys()) {
			if (!claimKeys.has(key)) legacyLastSeen.delete(key);
		}

		const out: IAgentEvent[] = [];
		for (const claim of claims) {
			const key = eventKey(claim.agent, claim.taskId);
			const persistedLastSeen = claim.lastSeen
				? Date.parse(claim.lastSeen)
				: Number.NaN;
			if (Number.isNaN(persistedLastSeen)) {
				const firstSeen = legacyLastSeen.get(key);
				if (firstSeen === undefined) {
					legacyLastSeen.set(key, now);
					if (emittedState.has(key)) continue;
					emittedState.set(key, 'agent-alive');
					out.push(
						await emit(
							'agent-alive',
							claim.agent,
							claim.taskId,
							now,
							now,
							0,
						),
					);
					continue;
				}
				const ageMs = Math.max(0, now.getTime() - firstSeen.getTime());
				const missedBeats = Math.floor(
					ageMs / Math.max(1, options.heartbeatMs),
				);
				const deadAfterMs =
					AGENT_DEAD_MISSED_BEATS * Math.max(1, options.heartbeatMs);
				if (
					ageMs >=
					AGENT_IDLE_MISSED_BEATS * Math.max(1, options.heartbeatMs)
				) {
					if (emittedState.get(key) === 'agent-idle') continue;
					emittedState.set(key, 'agent-idle');
					out.push(
						await emit(
							'agent-idle',
							claim.agent,
							claim.taskId,
							now,
							firstSeen,
							missedBeats,
						),
					);
				} else if (ageMs >= deadAfterMs) {
					if (emittedState.get(key) === 'agent-dead') continue;
					emittedState.set(key, 'agent-dead');
					out.push(
						await emit(
							'agent-dead',
							claim.agent,
							claim.taskId,
							now,
							firstSeen,
							missedBeats,
						),
					);
				}
				continue;
			}
			const seen = Number.isNaN(persistedLastSeen)
				? now
				: new Date(Math.min(persistedLastSeen, now.getTime()));
			const ageMs = Math.max(0, now.getTime() - seen.getTime());
			const deadAfterMs =
				AGENT_DEAD_MISSED_BEATS * Math.max(1, options.heartbeatMs);
			const missedBeats = Math.floor(
				ageMs / Math.max(1, options.heartbeatMs),
			);
			if (ageMs >= deadAfterMs) {
				if (emittedState.get(key) === 'agent-dead') continue;
				emittedState.set(key, 'agent-dead');
				out.push(
					await emit(
						'agent-dead',
						claim.agent,
						claim.taskId,
						now,
						seen,
						missedBeats,
					),
				);
				continue;
			}
			const previous = emittedState.get(key);
			if (
				missedBeats >= AGENT_IDLE_MISSED_BEATS &&
				previous !== 'agent-idle'
			) {
				emittedState.set(key, 'agent-idle');
				out.push(
					await emit(
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
					await emit(
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
