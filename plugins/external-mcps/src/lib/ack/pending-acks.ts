/**
 * pending-acks.ts — the durable human-ack ledger (f00068 S3, gate
 * decision 5).
 *
 * When `requireHumanAckWhenLlmDecides` is true (the default), the FIRST
 * activation of a declared server needs a recorded, ACCEPTED human ack.
 * This module owns that record:
 *
 * - One JSON file under the plugin cache dir
 *   (`<cacheDir>/external-mcps/pending-acks.json`), written durably via
 *   the core primitives: `withFileMutex` → `redactSecrets` →
 *   `writeFileAtomic`. Two agents acking concurrently serialize on the
 *   mutex; a crash mid-write never corrupts the ledger.
 * - ONE entry per serverId (the writer upholds the parser invariant):
 *   `request` is idempotent while pending, re-requesting after a
 *   rejection re-opens the entry, and `record` overwrites the decision.
 * - A REJECTION is recorded durably too (`ackedAt` set,
 *   `accepted: false`) — the server stays un-acked but the human's "no"
 *   survives restarts, so the LLM cannot re-ask its way past it
 *   silently.
 *
 * The pure `isAcked` predicate is exported for the S2 subprocess
 * registry to consume (injected there; this module never imports S2).
 */
import { readFile } from 'node:fs/promises';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

export const PENDING_ACKS_SCHEMA =
	'mcp-vertex/external-mcps/pending-acks/1' as const;

/** One activation request and (once decided) its human verdict. */
export interface IPendingAck {
	/** The declared server this ack gates (kebab-case roster key). */
	readonly serverId: string;
	/** ISO timestamp of the activation request. */
	readonly requestedAt: string;
	/** Optional one-line reason the requester supplied (redacted on disk). */
	readonly reason?: string;
	/** ISO timestamp of the human decision; absent while pending. */
	readonly ackedAt?: string;
	/** Who decided (host identity or free-form); absent while pending. */
	readonly ackedBy?: string;
	/** true = accepted, false = rejected; absent while pending. */
	readonly accepted?: boolean;
}

/** On-disk envelope (schema-versioned like every durable cache file). */
interface IPendingAcksFile {
	readonly schema: typeof PENDING_ACKS_SCHEMA;
	readonly updatedAt: string;
	readonly acks: readonly IPendingAck[];
}

/**
 * Pure predicate: does the ledger hold a RECORDED, ACCEPTED ack for
 * `serverId`? A pending entry or a recorded rejection both return
 * false. The S2 registry injects this to gate first activation.
 */
export const isAcked = (
	acks: readonly IPendingAck[],
	serverId: string,
): boolean =>
	acks.some(
		(ack) =>
			ack.serverId === serverId &&
			ack.ackedAt !== undefined &&
			ack.accepted === true,
	);

/** Pure projection: entries still awaiting a human decision. */
export const listPending = (
	acks: readonly IPendingAck[],
): readonly IPendingAck[] => acks.filter((ack) => ack.ackedAt === undefined);

/** Durable ledger API (all reads/writes go through the store). */
export interface IPendingAcksStore {
	/** Every entry currently in the ledger (pending and decided). */
	read(): Promise<readonly IPendingAck[]>;
	/**
	 * Register a pending activation request. Idempotent while pending;
	 * a NEW request after a rejection re-opens the entry; an accepted
	 * entry is returned unchanged (already acked).
	 */
	request(serverId: string, reason?: string): Promise<IPendingAck>;
	/**
	 * Record the human decision durably. Creates the entry when the
	 * human acks proactively (no prior request).
	 */
	record(
		serverId: string,
		accept: boolean,
		ackedBy?: string,
	): Promise<IPendingAck>;
	/** Convenience: `isAcked` over a fresh read of the ledger. */
	isAcked(serverId: string): Promise<boolean>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Salvage valid entries; last write per serverId wins (one-entry invariant). */
const parseLedger = (raw: string): IPendingAck[] => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!isPlainObject(parsed) || !Array.isArray(parsed['acks'])) return [];
	const byId = new Map<string, IPendingAck>();
	for (const entry of parsed['acks']) {
		if (!isPlainObject(entry)) continue;
		const serverId = entry['serverId'];
		const requestedAt = entry['requestedAt'];
		if (typeof serverId !== 'string' || typeof requestedAt !== 'string') {
			continue;
		}
		byId.set(serverId, {
			serverId,
			requestedAt,
			...(typeof entry['reason'] === 'string'
				? { reason: entry['reason'] }
				: {}),
			...(typeof entry['ackedAt'] === 'string'
				? { ackedAt: entry['ackedAt'] }
				: {}),
			...(typeof entry['ackedBy'] === 'string'
				? { ackedBy: entry['ackedBy'] }
				: {}),
			...(typeof entry['accepted'] === 'boolean'
				? { accepted: entry['accepted'] }
				: {}),
		});
	}
	return [...byId.values()];
};

/**
 * Create the durable store bound to one absolute ledger path (resolved
 * by the plugin from `ctx.pluginCacheDir` — never `process.cwd()`).
 */
export const createPendingAcksStore = (
	storePath: string,
	now: () => Date = () => new Date(),
): IPendingAcksStore => {
	const load = async (): Promise<IPendingAck[]> => {
		let raw: string;
		try {
			raw = await readFile(storePath, 'utf8');
		} catch {
			return [];
		}
		return parseLedger(raw);
	};

	const persist = async (acks: readonly IPendingAck[]): Promise<void> => {
		const file: IPendingAcksFile = {
			schema: PENDING_ACKS_SCHEMA,
			updatedAt: now().toISOString(),
			acks,
		};
		const redacted = redactSecrets(JSON.stringify(file, null, '\t'));
		await writeFileAtomic(storePath, `${redacted.text}\n`);
	};

	/** Read → transform → durable write, all under the file mutex. */
	const mutate = (
		transform: (acks: IPendingAck[]) => IPendingAck,
	): Promise<IPendingAck> =>
		withFileMutex(storePath, async () => {
			const acks = await load();
			const result = transform(acks);
			await persist(acks);
			return result;
		});

	return {
		read: load,

		request: (serverId, reason) =>
			mutate((acks) => {
				const index = acks.findIndex((a) => a.serverId === serverId);
				const existing = index >= 0 ? acks[index] : undefined;
				// Pending or already accepted: idempotent, keep the record.
				if (
					existing !== undefined &&
					(existing.ackedAt === undefined ||
						existing.accepted === true)
				) {
					return existing;
				}
				const fresh: IPendingAck = {
					serverId,
					requestedAt: now().toISOString(),
					...(reason !== undefined ? { reason } : {}),
				};
				if (index >= 0) acks.splice(index, 1, fresh);
				else acks.push(fresh);
				return fresh;
			}),

		record: (serverId, accept, ackedBy) =>
			mutate((acks) => {
				const index = acks.findIndex((a) => a.serverId === serverId);
				const requestedAt =
					index >= 0
						? (acks[index]?.requestedAt ?? now().toISOString())
						: now().toISOString();
				const reason = index >= 0 ? acks[index]?.reason : undefined;
				const decided: IPendingAck = {
					serverId,
					requestedAt,
					...(reason !== undefined ? { reason } : {}),
					ackedAt: now().toISOString(),
					...(ackedBy !== undefined ? { ackedBy } : {}),
					accepted: accept,
				};
				if (index >= 0) acks.splice(index, 1, decided);
				else acks.push(decided);
				return decided;
			}),

		isAcked: async (serverId) => isAcked(await load(), serverId),
	};
};
