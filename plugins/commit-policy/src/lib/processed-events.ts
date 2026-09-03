/**
 * processed-events.ts — f00183 (AUD-CP-012) idempotency store
 * for automatic commits.
 *
 * Stores `idempotencyKey → { sha, ts }` records in a JSONL
 * file under `<workspaceRoot>/.commit-policy/processed-events.jsonl`.
 * Reads refresh from disk so long-lived writers observe markers
 * other processes persisted; writes go through `withFileMutex`
 * and merge against the latest file contents so concurrent
 * writers never lose keys. TTL is configurable; expired keys are
 * pruned after every N adds (debounced).
 *
 * The store holds NO knowledge of MCP, triggers, or the
 * engine — it is a pure key/value layer. The engine owns the
 * policy (when to consult / when to add).
 */

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import type { IEngineEvent } from './engine';

import type {
	IProcessedEventsOptions,
	IProcessedEventsStore,
	IProcessedRecord,
	ITerminalOutcome,
} from './contracts/interfaces/processed-events.interface';

export type {
	IProcessedEventsOptions,
	IProcessedEventsStore,
	IProcessedRecord,
	ITerminalOutcome,
} from './contracts/interfaces/processed-events.interface';

export class ProcessedEventsStoreReadError extends Error {
	readonly code = 'STORE_READ_ERROR';

	constructor(message: string) {
		super(message);
		this.name = 'ProcessedEventsStoreReadError';
	}
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
 * each instance owns its own in-memory map and refreshes it
 * from disk before answering.
 */
export const createProcessedEventsStore = (
	options: IProcessedEventsOptions,
): IProcessedEventsStore => {
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const filePath = join(options.workspaceRoot, options.path ?? DEFAULT_PATH);
	const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
	const seen = new Map<string, IProcessedRecord>();
	let addsSincePrune = 0;

	const readRecords = async (
		now = Date.now(),
		includeExpired = false,
	): Promise<Map<string, IProcessedRecord>> => {
		const records = new Map<string, IProcessedRecord>();
		try {
			const raw = await readFile(filePath, 'utf8');
			for (const line of raw.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				try {
					const parsed = JSON.parse(
						trimmed,
					) as Partial<IProcessedRecord> & {
						readonly outcome?: ITerminalOutcome;
					};
					if (
						typeof parsed.key === 'string' &&
						typeof parsed.ts === 'number'
					) {
						// f00417: legacy records (pre-f00417) only had
						// `{ key, sha, ts }` with sha always a commit
						// hash. New records carry `outcome` and may
						// have `sha: null` for non-APPLIED outcomes.
						const outcome: ITerminalOutcome =
							parsed.outcome ?? 'APPLIED';
						const sha =
							parsed.sha === null ||
							typeof parsed.sha === 'string'
								? parsed.sha
								: undefined;
						if (sha === undefined && outcome === 'APPLIED') {
							// Malformed legacy record without a sha —
							// skip rather than fabricate.
							continue;
						}
						if (includeExpired || now - parsed.ts <= ttlMs) {
							records.set(parsed.key, {
								key: parsed.key,
								ts: parsed.ts,
								outcome,
								...(outcome === 'APPLIED' &&
								typeof sha === 'string'
									? { sha }
									: outcome === 'APPLIED'
										? { sha: null }
										: { sha: null }),
								...(parsed.reason !== undefined
									? { reason: parsed.reason }
									: {}),
							});
						}
					}
				} catch (error) {
					throw new ProcessedEventsStoreReadError(
						`processed-events store contains invalid JSONL: ${
							error instanceof Error
								? error.message
								: String(error)
						}`,
					);
				}
			}
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				(error as { readonly code?: unknown }).code === 'ENOENT'
			) {
				return records;
			}
			if (error instanceof ProcessedEventsStoreReadError) {
				throw error;
			}
			throw new ProcessedEventsStoreReadError(
				`failed to read processed-events store: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		return records;
	};

	const syncSeenFromDisk = async (
		now = Date.now(),
		includeExpired = false,
	): Promise<void> => {
		const records = await readRecords(now, includeExpired);
		seen.clear();
		for (const [key, record] of records) {
			seen.set(key, record);
		}
	};

	const persist = async (): Promise<void> => {
		const lines: string[] = [];
		for (const rec of seen.values()) {
			lines.push(JSON.stringify(rec));
		}
		await mkdir(dirname(filePath), { recursive: true });
		await writeFileAtomic(filePath, `${lines.join('\n')}\n`);
	};

	return {
		async has(key) {
			await syncSeenFromDisk();
			return seen.has(key);
		},
		async add(key, sha, now = Date.now()) {
			await withFileMutex(filePath, async () => {
				await syncSeenFromDisk(now);
				seen.set(key, {
					key,
					sha,
					ts: now,
					outcome: 'APPLIED',
				});
				await persist();
			});
			addsSincePrune += 1;
			if (addsSincePrune >= pruneEvery) {
				addsSincePrune = 0;
				await this.prune(now);
			}
		},
		async recordTerminal(key, outcome, reason, now = Date.now()) {
			await withFileMutex(filePath, async () => {
				await syncSeenFromDisk(now);
				seen.set(key, {
					key,
					sha: null,
					ts: now,
					outcome,
					...(reason !== undefined ? { reason } : {}),
				});
				await persist();
			});
			addsSincePrune += 1;
			if (addsSincePrune >= pruneEvery) {
				addsSincePrune = 0;
				await this.prune(now);
			}
		},
		async prune(now = Date.now()) {
			return withFileMutex(filePath, async () => {
				await syncSeenFromDisk(now, true);
				let removed = 0;
				for (const [key, rec] of seen) {
					if (now - rec.ts > ttlMs) {
						seen.delete(key);
						removed += 1;
					}
				}
				if (removed > 0) await persist();
				return removed;
			});
		},
		async dispose() {
			seen.clear();
		},
	};
};
