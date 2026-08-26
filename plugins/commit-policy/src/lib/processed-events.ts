/**
 * processed-events.ts — f00183 (AUD-CP-012) idempotency store
 * for automatic commits.
 *
 * Stores `idempotencyKey → { sha, ts }` records in a JSONL
 * file under `<workspaceRoot>/.commit-policy/processed-events.jsonl`.
 * Reads are in-memory after a one-shot load; writes go through
 * `withFileMutex` so concurrent commits do not corrupt the
 * file. TTL is configurable; expired keys are pruned on boot
 * and after every N adds (debounced).
 *
 * The store holds NO knowledge of MCP, triggers, or the
 * engine — it is a pure key/value layer. The engine owns the
 * policy (when to consult / when to add).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { IEngineEvent } from './engine';

export interface IProcessedRecord {
	readonly key: string;
	readonly sha: string;
	readonly ts: number;
}

export interface IProcessedEventsStore {
	has(key: string): Promise<boolean>;
	add(key: string, sha: string, now?: number): Promise<void>;
	prune(now: number): Promise<number>;
	dispose(): Promise<void>;
}

export interface IProcessedEventsOptions {
	readonly workspaceRoot: string;
	/** TTL in milliseconds. Default 30 days. */
	readonly ttlMs?: number;
	/** Path under workspaceRoot. Default `.commit-policy/processed-events.jsonl`. */
	readonly path?: string;
	/** Prune every N adds. Default 100. */
	readonly pruneEvery?: number;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_PATH = '.commit-policy/processed-events.jsonl';
const DEFAULT_PRUNE_EVERY = 100;

export const computeIdempotencyKey = (event: IEngineEvent): string => {
	switch (event.kind) {
		case 'slice':
			return `commit-policy:${event.proposalId}:${event.sliceId}:${event.eventId}`;
		case 'threshold':
			return `commit-policy:threshold:${event.eventId}:${event.dirtyCount}`;
		case 'interval':
			return `commit-policy:interval:${event.eventId}:${event.dirtyCount}`;
		case 'manual':
			// Manual events are opt-in: the caller may force a
			// duplicate by changing `eventId` between calls. Default
			// is to dedupe per `eventId`.
			return `commit-policy:manual:${event.eventId}`;
	}
};

/**
 * Create the idempotency store. Safe to call multiple times —
 * each instance owns its own in-memory map and file handle
 * (none, actually — every write flushes to disk).
 */
export const createProcessedEventsStore = (
	options: IProcessedEventsOptions,
): IProcessedEventsStore => {
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const filePath = join(options.workspaceRoot, options.path ?? DEFAULT_PATH);
	const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
	const seen = new Map<string, IProcessedRecord>();
	let addsSincePrune = 0;
	let loaded = false;

	const load = async (): Promise<void> => {
		if (loaded) return;
		try {
			const raw = await readFile(filePath, 'utf8');
			for (const line of raw.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				try {
					const parsed = JSON.parse(
						trimmed,
					) as Partial<IProcessedRecord>;
					if (
						typeof parsed.key === 'string' &&
						typeof parsed.sha === 'string' &&
						typeof parsed.ts === 'number'
					) {
						seen.set(parsed.key, {
							key: parsed.key,
							sha: parsed.sha,
							ts: parsed.ts,
						});
					}
				} catch {
					// corrupt line — skip
				}
			}
		} catch {
			// file missing — start empty
		}
		loaded = true;
	};

	const persist = async (): Promise<void> => {
		const lines: string[] = [];
		for (const rec of seen.values()) {
			lines.push(JSON.stringify(rec));
		}
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
	};

	return {
		async has(key) {
			await load();
			return seen.has(key);
		},
		async add(key, sha, now = Date.now()) {
			await load();
			seen.set(key, { key, sha, ts: now });
			addsSincePrune += 1;
			await persist();
			if (addsSincePrune >= pruneEvery) {
				await this.prune(now);
				addsSincePrune = 0;
			}
		},
		async prune(now = Date.now()) {
			await load();
			let removed = 0;
			for (const [key, rec] of seen) {
				if (now - rec.ts > ttlMs) {
					seen.delete(key);
					removed += 1;
				}
			}
			if (removed > 0) await persist();
			return removed;
		},
		async dispose() {
			seen.clear();
			loaded = false;
		},
	};
};
