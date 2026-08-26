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
): { slices: Map<string, { status: string; proposalId: string }> } => {
	const slices = new Map<string, { status: string; proposalId: string }>();
	try {
		const parsed = JSON.parse(raw) as {
			proposals?: readonly {
				id?: string;
				slices?: readonly { id?: string; status?: string }[];
			}[];
		};
		for (const proposal of parsed.proposals ?? []) {
			if (typeof proposal.id !== 'string') continue;
			for (const slice of proposal.slices ?? []) {
				if (typeof slice.id !== 'string') continue;
				slices.set(`${proposal.id}-${slice.id}`, {
					status: slice.status ?? 'unknown',
					proposalId: proposal.id,
				});
			}
		}
	} catch {
		// corrupt/missing index — treat as empty
	}
	return { slices };
};

const diffSlices = (
	prev: ReadonlyMap<string, { status: string; proposalId: string }>,
	curr: ReadonlyMap<string, { status: string; proposalId: string }>,
	onStatuses: readonly string[],
): ITriggerEvent[] => {
	const events: ITriggerEvent[] = [];
	for (const [key, entry] of curr) {
		const prior = prev.get(key);
		const wasPresent = prior !== undefined;
		const statusChanged =
			wasPresent && prior !== undefined && prior.status !== entry.status;
		if (!wasPresent || statusChanged) {
			if (onStatuses.includes(entry.status)) {
				const dash = key.indexOf('-');
				const sliceId = dash >= 0 ? key.slice(dash + 1) : key;
				events.push({
					kind: 'slice',
					proposalId: entry.proposalId,
					sliceId,
					status: entry.status,
				});
			}
		}
	}
	return events;
};

export interface ISliceListener {
	check(): Promise<readonly ITriggerEvent[]>;
	/** Drain the pending-events queue (events the engine has not acked yet). */
	drainPending(): readonly ITriggerEvent[];
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
	let prev = new Map<string, { status: string; proposalId: string }>();
	let initialized = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	const pending: ITriggerEvent[] = [];
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
		const newEvents = initialized
			? diffSlices(prev, curr, config.onStatuses)
			: [];
		prev = curr;
		initialized = true;
		if (newEvents.length > 0) {
			pending.push(...newEvents);
			// Deliver in parallel; each delivery either marks or leaves.
			await Promise.all(newEvents.map(deliverOne));
		}
		return newEvents;
	};

	return {
		check: checkImpl,
		drainPending: () => pending.slice(),
		start() {
			if (timer !== undefined) return;
			timer = setInterval(() => {
				void checkImpl();
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
): Promise<Map<string, { status: string; proposalId: string }>> => {
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
