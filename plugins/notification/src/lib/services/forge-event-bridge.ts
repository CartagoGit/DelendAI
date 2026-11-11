// effect-boundary-authorized: a directory watcher cannot route through
// ctx.effects, which declares only `git`; these are read-only observations
// of the workspace's own forge event store (fs.watch + readdir + reads).
/**
 * forge-event-bridge.ts — a forge event reaches the sessions waiting on it
 * the moment the server that hears the forge writes it down.
 *
 * Only the server holding the maintenance lease hears the forge. It writes
 * each event as a file in the workspace's shared store; this bridge, in
 * every server, watches that directory. A file appearing is the trigger:
 * nothing here asks the forge or looks on a timer. The event is matched
 * against the subscriptions (by repository and number), and each one whose
 * agent this session serves becomes a notice: an MCP notification at once,
 * and a queue that `forge_await` returns from, so an agent waits in one
 * blocking call that costs it nothing until the forge speaks.
 *
 * A session serves every agent it subscribes or waits for. Binding replays
 * what that agent missed since it subscribed, within the store's retention.
 */

import { watch as watchFs } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';

import {
	forgeEventRecordsDir,
	readForgeEventRecord,
	readForgeEventSubscriptions,
} from '@delendai/core/public';

import {
	LAND_COMMENT_PREFIX,
	MAX_DELIVERED_KEYS,
	MAX_NOTICE_COMMENT_CHARS,
	MAX_QUEUED_FORGE_NOTICES,
	PASSING_CONCLUSIONS,
} from '../contracts/constants/forge-event-bridge.constant';

import type {
	IForgeEventBridge,
	IForgeEventBridgeInput,
	IForgeEventView,
	IForgeEventWatch,
	IForgeNotice,
} from '../contracts/interfaces/forge-event-bridge.interface';

const optionalText = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

/** The fields the bridge reads, or `undefined` when it is no event. */
export const viewOfForgeEvent = (
	value: unknown,
): IForgeEventView | undefined => {
	if (typeof value !== 'object' || value === null) return undefined;
	const raw = value as Readonly<Record<string, unknown>>;
	if (typeof raw.kind !== 'string' || typeof raw.repository !== 'string')
		return undefined;
	return {
		kind: raw.kind,
		repository: raw.repository,
		number: typeof raw.number === 'number' ? raw.number : undefined,
		change: optionalText(raw.change),
		label: optionalText(raw.label),
		check: optionalText(raw.check),
		conclusion: optionalText(raw.conclusion),
		review: optionalText(raw.review),
		comment: optionalText(raw.comment),
	};
};

const targetOf = (event: IForgeEventView): string => `#${String(event.number)}`;

/** One sentence per kind worth waking for; a kind absent here wakes nobody. */
const OUTCOMES: Readonly<
	Record<string, (event: IForgeEventView) => string | undefined>
> = {
	'pr.merged': (event) => `${targetOf(event)} merged`,
	'pr.closed': (event) => `${targetOf(event)} closed without merging`,
	'check.completed': (event) => {
		const name = event.check ?? 'a check';
		const conclusion = event.conclusion ?? 'unknown';
		return PASSING_CONCLUSIONS.includes(conclusion)
			? `${targetOf(event)}: check ${name} passed`
			: `${targetOf(event)}: check ${name} failed (${conclusion})`;
	},
	'pr.updated': (event) =>
		event.change === 'labelled' && event.label !== undefined
			? `${targetOf(event)} labelled ${event.label}`
			: undefined,
	// `land` comments the reason of its verdict; other comments wake nobody.
	'pr.commented': (event) => {
		const said = event.comment?.trim() ?? '';
		return said.startsWith(LAND_COMMENT_PREFIX)
			? `${targetOf(event)} ${said.slice(0, MAX_NOTICE_COMMENT_CHARS)}`
			: undefined;
	},
	'review.submitted': (event) =>
		`${targetOf(event)}: review ${event.review ?? 'submitted'}`,
	'issue.closed': (event) => `issue ${targetOf(event)} closed`,
};

/**
 * The sentence a subscribed session is told, or `undefined` when the event
 * is no outcome worth waking for. Pure.
 */
export const describeForgeOutcome = (
	event: IForgeEventView,
): string | undefined => OUTCOMES[event.kind]?.(event);

const watchDirectory: IForgeEventWatch = (dir, onChange) => {
	const watcher = watchFs(dir, (_type, name) => {
		onChange(typeof name === 'string' ? name : undefined);
	});
	// A watcher error (the directory removed) ends it quietly; the next
	// server start watches again.
	watcher.on('error', () => undefined);
	return () => {
		watcher.close();
	};
};

/** A record's name starts with the time it was written. */
const writtenAt = (name: string): number => Number(name.split('-')[0]);

export const createForgeEventBridge = (
	input: IForgeEventBridgeInput,
): IForgeEventBridge => {
	const agents = new Set<string>();
	const delivered = new Set<string>();
	const queues = new Map<string, IForgeNotice[]>();
	const waiters = new Map<string, Set<() => void>>();
	let unwatch: (() => void) | undefined;
	let stopped = false;

	const enqueue = (notice: IForgeNotice): void => {
		const queue = queues.get(notice.agent) ?? [];
		queue.push(notice);
		queues.set(notice.agent, queue.slice(-MAX_QUEUED_FORGE_NOTICES));
		for (const wake of waiters.get(notice.agent) ?? []) wake();
	};

	/** Deliver file `name` to `only`, or to every agent served. */
	const deliver = async (name: string, only?: string): Promise<void> => {
		const record = await readForgeEventRecord(input.dir, name);
		const event = viewOfForgeEvent(record?.event);
		if (record === undefined || event?.number === undefined) return;
		const outcome = describeForgeOutcome(event);
		if (outcome === undefined) return;
		for (const subscription of await readForgeEventSubscriptions(
			input.dir,
		)) {
			if (
				subscription.repository !== event.repository ||
				subscription.number !== event.number ||
				!agents.has(subscription.agent) ||
				(only !== undefined && subscription.agent !== only) ||
				record.at < subscription.since
			)
				continue;
			const key = `${subscription.agent}\n${name}`;
			if (delivered.has(key)) continue;
			delivered.add(key);
			// Insertion order is age: past the bound the oldest half goes,
			// long after the store itself removed those files.
			if (delivered.size > MAX_DELIVERED_KEYS)
				for (const old of [...delivered].slice(
					0,
					MAX_DELIVERED_KEYS / 2,
				))
					delivered.delete(old);
			const notice: IForgeNotice = {
				agent: subscription.agent,
				repository: event.repository,
				number: event.number,
				kind: event.kind,
				outcome,
				at: record.at,
			};
			input.notify(notice);
			enqueue(notice);
		}
	};

	const names = async (): Promise<readonly string[]> => {
		try {
			return (await readdir(forgeEventRecordsDir(input.dir))).sort(
				(a, b) => writtenAt(a) - writtenAt(b),
			);
		} catch {
			return [];
		}
	};

	const handle = async (name: string | undefined): Promise<void> => {
		if (stopped) return;
		if (name !== undefined) {
			await deliver(name);
			return;
		}
		for (const each of await names()) await deliver(each);
	};

	const bind = async (agent: string): Promise<void> => {
		if (agents.has(agent)) return;
		agents.add(agent);
		for (const name of await names()) await deliver(name, agent);
	};

	const start = async (): Promise<void> => {
		const dir = forgeEventRecordsDir(input.dir);
		await mkdir(dir, { recursive: true });
		if (stopped) return;
		unwatch = (input.watch ?? watchDirectory)(dir, (name) => {
			void handle(name);
		});
	};
	const started = start().catch(() => undefined);

	const next = async (
		agent: string,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<readonly IForgeNotice[]> => {
		await started;
		await bind(agent);
		const take = (): readonly IForgeNotice[] => {
			const queue = queues.get(agent) ?? [];
			queues.delete(agent);
			return queue;
		};
		const ready = take();
		if (ready.length > 0 || stopped) return ready;
		return new Promise((resolve) => {
			const set = waiters.get(agent) ?? new Set<() => void>();
			waiters.set(agent, set);
			const finish = (): void => {
				clearTimeout(timer);
				set.delete(finish);
				signal?.removeEventListener('abort', finish);
				resolve(take());
			};
			const timer = setTimeout(finish, timeoutMs);
			signal?.addEventListener('abort', finish, { once: true });
			set.add(finish);
		});
	};

	return {
		bind: async (agent) => {
			await started;
			await bind(agent);
		},
		next,
		handle,
		stop: () => {
			stopped = true;
			unwatch?.();
			for (const set of waiters.values())
				for (const wake of [...set]) wake();
		},
	};
};
