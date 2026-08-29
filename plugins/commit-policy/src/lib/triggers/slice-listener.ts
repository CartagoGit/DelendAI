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

import type { ITriggerEvent, ISliceTriggerConfig } from './trigger-types';

export type { ITriggerEvent };

const DEFAULT_POLL_MS = 5_000;

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

const parseIndex = (
	raw: string,
): {
	slices: Map<
		string,
		{
			status: string;
			proposalId: string;
			/**
			 * x00263 (AUD-CP-005): paths the slice owns. The
			 * proposals registry does not always persist this
			 * field, so the listener treats its absence as a
			 * refusal (`SLICE_HAS_NO_FILES`) — never as an empty
			 * implicit skipAdd. Tests that want a clean path
			 * inject the field directly.
			 */
			files?: readonly string[];
		}
	>;
} => {
	const slices = new Map<
		string,
		{
			status: string;
			proposalId: string;
			files?: readonly string[];
		}
	>();
	try {
		const parsed = JSON.parse(raw) as {
			proposals?: readonly {
				id?: string;
				slices?: readonly {
					id?: string;
					status?: string;
					files?: readonly unknown[];
				}[];
			}[];
		};
		for (const proposal of parsed.proposals ?? []) {
			if (typeof proposal.id !== 'string') continue;
			for (const slice of proposal.slices ?? []) {
				if (typeof slice.id !== 'string') continue;
				const files = (slice.files ?? []).filter(
					(f): f is string => typeof f === 'string' && f.length > 0,
				);
				slices.set(`${proposal.id}-${slice.id}`, {
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
	prev: ReadonlyMap<
		string,
		{
			status: string;
			proposalId: string;
			files?: readonly string[];
		}
	>,
	curr: ReadonlyMap<
		string,
		{
			status: string;
			proposalId: string;
			files?: readonly string[];
		}
	>,
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
			const dash = key.indexOf('-');
			const sliceId = dash >= 0 ? key.slice(dash + 1) : key;
			// x00263 (AUD-CP-005): slices without a `files` field
			// trigger a refusal instead of an implicit empty
			// skipAdd. The driver must never stage a superset.
			if (entry.files === undefined || entry.files.length === 0) {
				refusals.push({
					key,
					reason: `SLICE_HAS_NO_FILES: ${key}`,
				});
				continue;
			}
			events.push({
				kind: 'slice',
				proposalId: entry.proposalId,
				sliceId,
				status: entry.status,
				files: { paths: entry.files },
			});
		}
	}
	return { events, refusals };
};

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
	docsDir: string,
	config: ISliceTriggerConfig,
	onHandler: ITriggerHandler,
	pollMs: number = DEFAULT_POLL_MS,
): ISliceListener => {
	const indexRel = join(docsDir, 'proposals', 'index.json');
	let prev = new Map<
		string,
		{
			status: string;
			proposalId: string;
			files?: readonly string[];
		}
	>();
	let initialized = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let checkInFlight: Promise<readonly ITriggerEvent[]> | undefined;
	const pending: ITriggerEvent[] = [];
	const refusals: ISliceRefusal[] = [];
	const reader = new SafeWorkspaceReader(workspaceRoot);

	/** Apply a single event against the engine; mark seen only on OK. */
	const deliverOne = async (event: ITriggerEvent): Promise<void> => {
		try {
			const ack = await onHandler(event);
			if (ack.ack === 'OK') {
				// Event handled: remove from pending queue.
				const idx = pending.indexOf(event);
				if (idx >= 0) pending.splice(idx, 1);
			}
			// Otherwise: leave it pending; next poll re-emits.
		} catch {
			// Engine threw: keep event pending; next poll re-emits.
		}
	};

	const checkImpl = async (): Promise<readonly ITriggerEvent[]> => {
		let raw = '';
		try {
			raw = (await reader.readText(indexRel)).content;
		} catch {
			return [];
		}
		const curr = parseIndex(raw).slices;
		if (pending.length > 0) {
			await Promise.all(pending.slice().map(deliverOne));
		}
		const { events: newEvents, refusals: newRefusals } = initialized
			? diffSlices(prev, curr, config.onStatuses)
			: { events: [], refusals: [] };
		prev = curr;
		initialized = true;
		if (newRefusals.length > 0) refusals.push(...newRefusals);
		if (newEvents.length > 0) {
			pending.push(...newEvents);
			// Deliver in parallel; each delivery either marks or leaves.
			await Promise.all(newEvents.map(deliverOne));
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
			const out = pending.slice();
			pending.length = 0;
			return out;
		},
		drainRefusals: () => {
			const out = refusals.slice();
			refusals.length = 0;
			return out;
		},
		start() {
			if (timer !== undefined) return;
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
	docsDir: string,
): Promise<
	Map<
		string,
		{
			status: string;
			proposalId: string;
			files?: readonly string[];
		}
	>
> => {
	const indexRel = join(docsDir, 'proposals', 'index.json');
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
	return parseIndex(raw).slices;
};
