/**
 * slice-listener.ts — polls the proposals plugin's `index.json` for
 * slices whose status flipped to `done` / `merged` since the last
 * scan, and emits a `TriggerEvent` per new close.
 *
 * x00260 (AUD-CP-002): events are no longer silently dropped.
 * The listener accepts an `onEvent` callback that is called for
 * each detected event. The previous slice map is only updated to
 * "seen" the event once the callback resolves successfully
 * (`ack: 'OK'`). A throw or `{ `ACK: 'ERR' }` leaves the event
 * un-marked so the next poll re-emits it — guaranteed delivery.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

import {
	BASELINE_EMIT_LIMIT,
	MAX_DELIVERY_ATTEMPTS,
} from '../contracts/constants/slice-listener.constant';
import type { ITriggerEvent, ISliceTriggerConfig } from './trigger-types';

export { BASELINE_EMIT_LIMIT, MAX_DELIVERY_ATTEMPTS };

export type { ITriggerEvent };

const DEFAULT_POLL_MS = 1_000;

/**
 * Result the engine returns after consuming a trigger event.
 * Anything other than `{ ack: 'OK' }` is treated as "not seen" so the
 * next poll re-emits the event.
 */
export type ITriggerAck =
	| { readonly ack: 'OK' }
	| { readonly ack: 'ERR'; readonly reason?: string };

/**
 * Engine callback. Receives the event; resolves with `ack`.
 * Pure: no I/O at the listener boundary — the engine owns the I/O.
 */
export type ITriggerHandler = (event: ITriggerEvent) => Promise<ITriggerAck>;

/** Marker a test can use to inspect emissions synchronously. */
export interface ISliceListenerEmissions {
	readonly pending: readonly ITriggerEvent[];
}

type SliceSnapshotEntry = {
	status: string;
	proposalId: string;
	files?: readonly string[];
};

const getSliceKey = (proposalId: string, sliceId: string): string =>
	`${proposalId}-${sliceId}`;

const getSliceSlotKey = (event: ITriggerEvent): string =>
	getSliceKey(event.proposalId ?? '', event.sliceId ?? '');

const buildSliceEventId = (
	proposalId: string,
	sliceId: string,
	status: string,
	files: readonly string[],
): string =>
	JSON.stringify({
		kind: 'slice',
		proposalId,
		sliceId,
		status,
		files,
	});

const getSliceEventId = (event: ITriggerEvent): string =>
	buildSliceEventId(
		event.proposalId ?? '',
		event.sliceId ?? '',
		event.status ?? '',
		event.files?.paths ?? [],
	);

const createSliceEvent = (
	key: string,
	entry: SliceSnapshotEntry,
): ITriggerEvent | ISliceRefusal => {
	const dash = key.indexOf('-');
	const sliceId = dash >= 0 ? key.slice(dash + 1) : key;
	if (entry.files === undefined || entry.files.length === 0) {
		return {
			key,
			reason: `SLICE_HAS_NO_FILES: ${key}`,
		};
	}
	return {
		kind: 'slice',
		proposalId: entry.proposalId,
		sliceId,
		status: entry.status,
		files: { paths: [...entry.files] },
	};
};

const parseIndex = async (
	raw: string,
	reader: SafeWorkspaceReader,
	proposalsDir: string,
): Promise<{
	slices: Map<string, SliceSnapshotEntry>;
}> => {
	const slices = new Map<string, SliceSnapshotEntry>();
	try {
		const parsed = JSON.parse(raw) as {
			proposals?: readonly {
				id?: string;
				file?: string;
				slices?: readonly {
					id?: string;
					status?: string;
					files?: readonly unknown[];
				}[];
			}[];
		};
		for (const proposal of parsed.proposals ?? []) {
			if (typeof proposal.id !== 'string') continue;
			let sourceSlices = proposal.slices ?? [];
			if (
				sourceSlices.length === 0 &&
				typeof proposal.file === 'string'
			) {
				const markdown = (
					await reader.readText(join(proposalsDir, proposal.file))
				).content;
				const section = markdown.match(
					/^##(?:\s+\d+\.)?\s*Slices\b[^\n]*$([\s\S]*?)(?=^## (?!#)|\n*$(?![\s\S]))/im,
				)?.[1];
				if (section !== undefined) {
					sourceSlices = [
						...section.matchAll(
							/^### (\S+)\s+—\s+[^\n]*$([\s\S]*?)(?=^### |\n*$(?![\s\S]))/gmu,
						),
					].map((match) => {
						const body = match[2] ?? '';
						const files = [
							...body.matchAll(
								/^[-*]\s*(?:files|\*\*Files\*\*):\s*(.+)$/gmu,
							),
						].flatMap((fileMatch) =>
							(fileMatch[1] ?? '')
								.split(',')
								.map((file) =>
									file.trim().replace(/^`|`$/gu, '').trim(),
								)
								.filter((file) => file.length > 0),
						);
						return {
							id: match[1] ?? '',
							status:
								body
									.match(
										/^[-*]\s*(?:status|\*\*Status\*\*):\s*`?([^`\n]+)`?\s*$/mu,
									)?.[1]
									?.trim() ?? 'unknown',
							files,
						};
					});
				}
			}
			for (const slice of sourceSlices) {
				if (typeof slice.id !== 'string') continue;
				const files = (slice.files ?? []).filter(
					(f): f is string => typeof f === 'string' && f.length > 0,
				);
				slices.set(getSliceKey(proposal.id, slice.id), {
					status: slice.status ?? 'unknown',
					proposalId: proposal.id,
					...(files.length > 0 ? { files } : {}),
				});
			}
		}
	} catch {
		// corrupt/missing index — treat as empty
	}
	return { slices };
};

const diffSlices = (
	prev: ReadonlyMap<string, SliceSnapshotEntry>,
	curr: ReadonlyMap<string, SliceSnapshotEntry>,
	onStatuses: readonly string[],
): {
	events: ITriggerEvent[];
	refusals: readonly { readonly key: string; readonly reason: string }[];
} => {
	const events: ITriggerEvent[] = [];
	const refusals: { key: string; reason: string }[] = [];
	for (const [key, entry] of curr) {
		const prior = prev.get(key);
		const wasPresent = prior !== undefined;
		const statusChanged =
			wasPresent && prior !== undefined && prior.status !== entry.status;
		if (!wasPresent || statusChanged) {
			if (!onStatuses.includes(entry.status)) continue;
			const candidate = createSliceEvent(key, entry);
			if ('reason' in candidate) {
				refusals.push(candidate);
				continue;
			}
			events.push(candidate);
		}
	}
	return { events, refusals };
};

/**
 * Decide what the FIRST poll should emit.
 *
 * The two situations a baseline has to tell apart:
 *
 *   - The repo's history. Hundreds of slices that reached `done` weeks
 *     ago and were committed at the time. Re-emitting them is the
 *     storm; they must stay silent.
 *
 *   - Work that finished while nobody was listening. A slice closed
 *     during a server restart, or before this plugin was lazily
 *     activated. Nothing has persisted it. Staying silent here means
 *     the commit never happens — no error, no retry, no trace — and
 *     the changes sit dirty until some sweep commits them under
 *     another proposal's name.
 *
 * Treating both as "baseline" is what the previous unconditional
 * `{ events: [] }` did. The processed-events store already knows the
 * difference: it holds a terminal outcome for everything that was
 * genuinely handled. So ask it.
 *
 * `isAlreadyPersisted` is injected rather than the store itself, so
 * the listener stays free of storage concerns and a test can drive
 * both branches directly. When it is absent — or throws — the caller
 * gets the old silent baseline, which is the safe direction: a missed
 * commit is recoverable by hand, a storm is not.
 */
const collectUnpersistedBaseline = async (
	curr: ReadonlyMap<string, SliceSnapshotEntry>,
	onStatuses: readonly string[],
	isAlreadyPersisted: (event: ITriggerEvent) => Promise<boolean>,
): Promise<{
	queue: ITriggerEvent[];
	refusals: readonly { readonly key: string; readonly reason: string }[];
}> => {
	const queue: ITriggerEvent[] = [];
	const refusals: { key: string; reason: string }[] = [];
	for (const [key, entry] of curr) {
		if (!onStatuses.includes(entry.status)) continue;
		const candidate = createSliceEvent(key, entry);
		if ('reason' in candidate) {
			refusals.push(candidate);
			continue;
		}
		let persisted = true;
		try {
			persisted = await isAlreadyPersisted(candidate);
		} catch {
			// Store unreadable. Fail to "already persisted" so a broken
			// store cannot turn into a replay of the whole history.
			persisted = true;
		}
		if (!persisted) queue.push(candidate);
	}
	return { queue, refusals };
};

export const computeSliceTriggerEventId = (event: ITriggerEvent): string =>
	getSliceEventId(event);

/**
 * x00263 (AUD-CP-005): a structured refusal from the listener.
 * The engine never stages an empty `files` list; instead it
 * receives this refusal and decides what to do (log, escalate,
 * or pass an explicit `skipStageEmpty` flag).
 */
export interface ISliceRefusal {
	readonly key: string;
	readonly reason: string;
}

export interface ISliceListener {
	check(): Promise<readonly ITriggerEvent[]>;
	/** Drain the pending-events queue (events the engine has not acked yet). */
	drainPending(): readonly ITriggerEvent[];
	/**
	 * x00263: drain refusals emitted by the listener since the last
	 * drain. The engine logs / escalates these — they are never
	 * re-emitted, but they ARE preserved across polls because the
	 * underlying slice did not change (it is still missing files).
	 */
	drainRefusals(): readonly ISliceRefusal[];
	start(): void;
	stop(): void;
}

export const createSliceListener = (
	workspaceRoot: string,
	indexDir: string,
	config: ISliceTriggerConfig,
	onHandler: ITriggerHandler,
	pollMs: number = DEFAULT_POLL_MS,
	proposalsDir: string = indexDir,
	/**
	 * x00423: lets the FIRST poll distinguish the repo's already-
	 * committed history from work that finished while nobody was
	 * listening. See `collectUnpersistedBaseline`. Omitted means the old
	 * unconditional silent baseline.
	 */
	isAlreadyPersisted?: (event: ITriggerEvent) => Promise<boolean>,
): ISliceListener => {
	const indexRel = join(indexDir, 'proposals', 'index.json');
	let prev = new Map<string, SliceSnapshotEntry>();
	let initialized = false;
	/**
	 * Un-persisted slices found on the first poll that the per-poll cap
	 * has not reached yet. Normal diffing waits until this is empty, so
	 * a capped batch is deferred rather than lost.
	 */
	let baselineQueue: ITriggerEvent[] = [];
	// `indexWasUnavailable` used to live here, to tell "the first read
	// failed, so the next success is the baseline" from "the first read
	// succeeded". x00423 removed that distinction: what matters is not
	// which poll first saw the index, it is whether each already-`done`
	// slice was ever actually persisted — and only the store knows that.
	let timer: ReturnType<typeof setInterval> | undefined;
	let checkInFlight: Promise<readonly ITriggerEvent[]> | undefined;
	const pending = new Map<string, ITriggerEvent>();
	const acknowledged = new Map<string, string>();
	/** Consecutive failed delivery attempts, keyed by event id. */
	const attempts = new Map<string, number>();
	const refusals: ISliceRefusal[] = [];
	const reader = new SafeWorkspaceReader(workspaceRoot);

	/** Apply a single event against the engine; mark seen only on OK. */
	/**
	 * Deliver one event, and give up on it if it will clearly never
	 * land.
	 *
	 * "Leave it pending; the next poll re-emits" is guaranteed delivery
	 * — the right default, and the reason x00260 introduced it. But
	 * unbounded, it is also a guaranteed infinite loop the moment a
	 * refusal is permanent rather than transient. An adopter project on
	 * 2026-09-03 re-emitted eight slices roughly once a second,
	 * indefinitely: their `Files:` lists named paths from an older repo
	 * layout, and the pre-commit hook was failing outright. No number
	 * of retries could have changed either.
	 *
	 * The engine already classifies the refusals it recognises as
	 * terminal. This is the backstop for the ones it does not, and for
	 * anything genuinely new: after `MAX_DELIVERY_ATTEMPTS` consecutive
	 * failures on the SAME event, stop, and say so once with the last
	 * reason attached.
	 *
	 * The counter is keyed on the event id, not the slot, so a slice
	 * that changes — new files, a re-close — starts fresh. Retrying a
	 * different event is progress; retrying an identical one that has
	 * failed five times is not.
	 */
	const deliverOne = async (event: ITriggerEvent): Promise<void> => {
		const slotKey = getSliceSlotKey(event);
		const eventId = getSliceEventId(event);
		const giveUp = (reason: string): void => {
			pending.delete(slotKey);
			attempts.delete(eventId);
			refusals.push({
				key: slotKey,
				reason:
					`gave up after ${String(MAX_DELIVERY_ATTEMPTS)} identical failed attempts. ` +
					`Last reason: ${reason}. This event will NOT be retried — retrying it ` +
					'produced the same answer every time. Fix the cause, then re-close the ' +
					'slice to emit a fresh event.',
			});
		};
		try {
			const ack = await onHandler(event);
			if (ack.ack === 'OK') {
				acknowledged.set(slotKey, eventId);
				pending.delete(slotKey);
				attempts.delete(eventId);
				return;
			}
			const failed = (attempts.get(eventId) ?? 0) + 1;
			attempts.set(eventId, failed);
			if (failed >= MAX_DELIVERY_ATTEMPTS) {
				giveUp(ack.reason ?? 'no reason reported');
			}
		} catch (error) {
			const failed = (attempts.get(eventId) ?? 0) + 1;
			attempts.set(eventId, failed);
			if (failed >= MAX_DELIVERY_ATTEMPTS) {
				giveUp(error instanceof Error ? error.message : 'engine threw');
			}
		}
	};

	const refreshPending = (
		curr: ReadonlyMap<string, SliceSnapshotEntry>,
		onStatuses: readonly string[],
	): void => {
		for (const [slotKey, event] of pending) {
			const entry = curr.get(slotKey);
			if (entry === undefined || !onStatuses.includes(entry.status)) {
				pending.delete(slotKey);
				continue;
			}
			const candidate = createSliceEvent(slotKey, entry);
			if ('reason' in candidate) {
				pending.delete(slotKey);
				refusals.push(candidate);
				continue;
			}
			if (getSliceEventId(candidate) !== getSliceEventId(event)) {
				pending.set(slotKey, candidate);
			}
		}
	};

	const pruneAcknowledged = (
		curr: ReadonlyMap<string, SliceSnapshotEntry>,
		onStatuses: readonly string[],
	): void => {
		for (const slotKey of acknowledged.keys()) {
			const entry = curr.get(slotKey);
			if (entry === undefined || !onStatuses.includes(entry.status)) {
				acknowledged.delete(slotKey);
			}
		}
	};

	const checkImpl = async (): Promise<readonly ITriggerEvent[]> => {
		let raw = '';
		try {
			raw = (await reader.readText(indexRel)).content;
		} catch {
			return [];
		}
		const curr = (
			await parseIndex(raw, reader, join(proposalsDir, 'proposals'))
		).slices;
		pruneAcknowledged(curr, config.onStatuses);
		refreshPending(curr, config.onStatuses);
		// f00417: the first successful poll is a BASELINE, not a
		// snapshot-vs-empty diff. Replaying every `done` slice as a
		// fresh transition is what drove the 2026-09-02 storm (83
		// events on startup).
		//
		// x00423: but "baseline" must not mean "emit nothing, ever".
		// A slice that reached `done` while this listener was not
		// running is NOT history — nothing has persisted it, and
		// silence loses the commit.
		//
		// The cap is DRAINED, not discarded. The first version of this
		// emitted ten and counted the rest as "skipped" — but the very
		// next line sets `prev = curr`, so on the following poll those
		// slices show no status change and are never emitted again.
		// The log said "re-check after this batch settles" while the
		// listener had already made that re-check impossible: a silent
		// drop wearing the costume of a bounded one. So the remainder
		// lives in a queue that later polls work through, and normal
		// diffing only begins once it is empty.
		if (!initialized && isAlreadyPersisted !== undefined) {
			const collected = await collectUnpersistedBaseline(
				curr,
				config.onStatuses,
				isAlreadyPersisted,
			);
			baselineQueue = [...collected.queue];
			if (collected.refusals.length > 0) {
				refusals.push(...collected.refusals);
			}
			if (baselineQueue.length > 0) {
				console.warn(
					JSON.stringify({
						event: 'commit-policy.baseline.unpersisted',
						total: baselineQueue.length,
						perPoll: BASELINE_EMIT_LIMIT,
						note: 'These slices finished while no listener was running. Committing them a batch at a time.',
					}),
				);
			}
		}

		const drainedBaseline = baselineQueue.splice(0, BASELINE_EMIT_LIMIT);
		const { events: diffedEvents, refusals: newRefusals } =
			initialized && baselineQueue.length === 0
				? diffSlices(prev, curr, config.onStatuses)
				: { events: [], refusals: [] };
		const newEvents = [...drainedBaseline, ...diffedEvents];
		prev = curr;
		initialized = true;
		if (newRefusals.length > 0) refusals.push(...newRefusals);
		if (newEvents.length > 0) {
			for (const event of newEvents) {
				const slotKey = getSliceSlotKey(event);
				if (acknowledged.get(slotKey) === getSliceEventId(event))
					continue;
				pending.set(slotKey, event);
			}
		}
		if (pending.size > 0) {
			await Promise.all(Array.from(pending.values(), deliverOne));
		}
		return newEvents;
	};
	const check = (): Promise<readonly ITriggerEvent[]> => {
		if (checkInFlight !== undefined) return checkInFlight;
		checkInFlight = checkImpl().finally(() => {
			checkInFlight = undefined;
		});
		return checkInFlight;
	};

	return {
		check,
		// x00263: both drain helpers are *true* drains — they
		// clear the queue. Pending events are also cleared by
		// `deliverOne` on OK; refusals have no auto-clear path,
		// so the engine must drain them to keep memory bounded.
		drainPending: () => {
			const out = Array.from(pending.values());
			pending.clear();
			return out;
		},
		drainRefusals: () => {
			const out = refusals.slice();
			refusals.length = 0;
			return out;
		},
		start() {
			if (timer !== undefined) return;
			// Prime immediately so a transition made after startup does
			// not wait for the first polling interval.
			void check();
			timer = setInterval(() => {
				void check();
			}, pollMs);
			if (typeof timer.unref === 'function') timer.unref();
		},
		stop() {
			if (timer !== undefined) {
				clearInterval(timer);
				timer = undefined;
			}
		},
	};
};

export const readCurrentSliceSnapshot = async (
	workspaceRoot: string,
	indexDir: string,
	proposalsDir: string = indexDir,
): Promise<Map<string, SliceSnapshotEntry>> => {
	const indexRel = join(indexDir, 'proposals', 'index.json');
	let raw = '';
	try {
		raw = (await new SafeWorkspaceReader(workspaceRoot).readText(indexRel))
			.content;
	} catch {
		try {
			raw = await readFile(join(workspaceRoot, indexRel), 'utf8');
		} catch {
			return new Map();
		}
	}
	return (
		await parseIndex(
			raw,
			new SafeWorkspaceReader(workspaceRoot),
			join(proposalsDir, 'proposals'),
		)
	).slices;
};
