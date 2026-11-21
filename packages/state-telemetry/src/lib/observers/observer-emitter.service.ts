/**
 * observer-emitter.service.ts — the part every pure observer shares:
 * a sha256 of a canonical JSON projection and an ordered, fire-and-forget
 * hand-off to the sink. A sink that rejects is swallowed, so nothing an
 * observer does can reach its caller.
 */

import { createHash } from 'node:crypto';

import type { IWorkItemId, TWorkEventKind } from '../events/work-event';
import type { IObserverEventSink } from './contracts/interfaces/observer.interface';

/** Recursively sorts object keys so equal values serialize equal. */
export const canonicalize = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(source)
				.sort()
				.map((key) => [key, canonicalize(source[key])]),
		);
	}
	return value;
};

/** sha256 of the canonical JSON projection of `projection`. */
export const hashProjection = (projection: unknown): string =>
	createHash('sha256')
		.update(JSON.stringify(canonicalize(projection)))
		.digest('hex');

export class ObserverEmitter {
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly sink: IObserverEventSink,
		private readonly now: () => number,
	) {}

	/** Queues one event behind the previous ones. Never throws. */
	emit(
		kind: TWorkEventKind,
		workItemId: IWorkItemId,
		actorId: string | null,
		payloadHash: string,
		createdAt: number = this.now(),
	): void {
		this.tail = this.tail.then(async () => {
			try {
				await this.sink.append({
					work_item_id: workItemId,
					actor_id: actorId,
					kind,
					payload_hash: payloadHash,
					created_at: createdAt,
				});
			} catch {
				// A failing sink must never reach the caller.
			}
		});
	}

	/** Resolves once every queued event reached the sink. Meant for tests and shutdown. */
	async idle(): Promise<void> {
		await this.tail;
	}
}
