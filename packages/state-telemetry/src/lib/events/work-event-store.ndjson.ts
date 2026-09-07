/**
 * work-event-store.ndjson.ts — NDJSON fallback backend for the Work
 * Event Bus (q00020 F1).
 *
 * Used when the SQLite shadow is disabled (`delendai.config.json#state
 * .parity.shadow.enabled === false`) or `@delendai/state-sqlite` is not
 * installed in the consumer. Writes are append-only and atomic per
 * line; reads buffer the whole file because the volume per consumer
 * is small and the projector never tails live.
 */

import { mkdirSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
	isWorkEventKind,
	type INewWorkEvent,
	type IWorkEvent,
} from './work-event';

export interface INdjsonWorkEventStoreOptions {
	readonly path: string;
	readonly now?: () => number;
}

const parseLine = (line: string, fallbackId: number): IWorkEvent | null => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const candidate = JSON.parse(trimmed) as Partial<IWorkEvent>;
	if (
		typeof candidate.work_item_id !== 'string' ||
		typeof candidate.created_at !== 'number' ||
		!isWorkEventKind(candidate.kind)
	) {
		return null;
	}
	return {
		id: typeof candidate.id === 'number' ? candidate.id : fallbackId,
		work_item_id: candidate.work_item_id as IWorkEvent['work_item_id'],
		actor_id:
			typeof candidate.actor_id === 'string' ||
			candidate.actor_id === null
				? candidate.actor_id
				: null,
		kind: candidate.kind,
		payload_hash:
			typeof candidate.payload_hash === 'string'
				? candidate.payload_hash
				: '',
		created_at: candidate.created_at,
	};
};

export class NdjsonWorkEventStore {
	private readonly path: string;
	private readonly now: () => number;
	private nextId = 1;

	constructor(options: INdjsonWorkEventStoreOptions) {
		mkdirSync(dirname(options.path), { recursive: true });
		this.path = options.path;
		this.now = options.now ?? (() => Date.now());
	}

	async append(event: INewWorkEvent): Promise<IWorkEvent> {
		if (!isWorkEventKind(event.kind)) {
			throw new Error(`unknown work event kind: ${event.kind}`);
		}
		const createdAt = event.created_at ?? this.now();
		const id = this.nextId++;
		const record: IWorkEvent = {
			id,
			work_item_id: event.work_item_id,
			actor_id: event.actor_id,
			kind: event.kind,
			payload_hash: event.payload_hash,
			created_at: createdAt,
		};
		await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
		return record;
	}

	async list(): Promise<readonly IWorkEvent[]> {
		let raw: string;
		try {
			raw = await readFile(this.path, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
		const events: IWorkEvent[] = [];
		const lines = raw.split('\n');
		for (let index = 0; index < lines.length; index += 1) {
			const parsed = parseLine(lines[index] ?? '', index + 1);
			if (parsed !== null) events.push(parsed);
		}
		return events;
	}
}
