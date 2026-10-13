/**
 * idempotency.ts — c00143 (Track N / q00006 §54).
 *
 * Drop-in helper that gives every mutation a `withIdempotency(key,
 * fn)` wrapper. A second call with the same key returns the cached
 * result without re-running `fn`, so the LLM can retry safely and
 * the host cannot accidentally duplicate side effects.
 *
 * Storage is **process-local** (a JSON map held in memory, with an
 * optional atomic file persistence path). No remote sink. Privacy
 * (R1.1–R1.10): only the JSON-serialisable result is cached; the
 * function's *args* are NEVER persisted, so a plugin that passes
 * secrets through args does not leak them to disk.
 *
 * TTL is configurable; expired keys are pruned on access (cheap
 * amortised cost) and via an explicit `prune(now)`.
 *
 * Inspired by `plugins/commit-policy/src/lib/processed-events.ts`
 * (f00183). c00143 generalises the pattern: the store is now
 * JSON-shaped (no SHA coupling), the cache lives in core (not the
 * commit-policy plugin), and the helper is reusable for any
 * mutation, not just commits.
 */

import type { Refusal } from '../contracts/envelopes.contract';

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

export interface IIdempotencyRecord<T> {
	readonly key: string;
	readonly value: T;
	readonly storedAt: number;
	readonly expiresAt: number;
}

export interface IIdempotencyOptions {
	/** Time-to-live in milliseconds. Default 24 hours. */
	readonly ttlMs?: number;
	/** Current wall-clock (injected for tests). */
	readonly now?: () => number;
}

export interface IIdempotencyStore<T = unknown> {
	/** Run `fn` only if `key` is not cached (or expired). Returns
	 *  the cached value on cache hit. */
	withIdempotency(key: string, fn: () => Promise<T> | T): Promise<T>;
	/** Look up a cached value without running `fn`. */
	peek(key: string): T | undefined;
	/** Drop one key. Returns true if it was present. */
	forget(key: string): boolean;
	/** Drop every expired entry. Returns the number removed. */
	prune(): number;
	/** Number of entries currently held (including not-yet-expired). */
	size(): number;
	/** Serialise the cache to a JSON-safe shape for persistence. */
	serialize(): IIdempotencySnapshot<T>;
	/** Replace the cache with a serialised snapshot. Expired entries
	 *  in the snapshot are skipped silently. */
	hydrate(snapshot: IIdempotencySnapshot<T>): void;
	/** Wipe the in-memory store. */
	clear(): void;
}

export interface IIdempotencySnapshot<T> {
	readonly version: 1;
	readonly records: readonly {
		readonly key: string;
		readonly value: T;
		readonly storedAt: number;
		readonly expiresAt: number;
	}[];
	/** Counter: total times a duplicate invocation was suppressed. */
	readonly duplicateSuppressed: number;
}

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1 as const;

/**
 * Counter event name for downstream observability. Surfaced via
 * the returned store so a plugin (or a future dashboard) can
 * increment a Prometheus-style metric.
 */
export const IDEMPOTENCY_DUPLICATE_SUPPRESSED =
	'idempotency.duplicate_suppressed';

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export const createIdempotencyStore = <T = unknown>(
	options: IIdempotencyOptions = {},
): IIdempotencyStore<T> => {
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const now = options.now ?? (() => Date.now());

	const records = new Map<string, IIdempotencyRecord<T>>();
	let duplicateSuppressed = 0;

	const isExpired = (rec: IIdempotencyRecord<T>, at: number): boolean =>
		at >= rec.expiresAt;

	return {
		async withIdempotency(key, fn) {
			const at = now();
			const hit = records.get(key);
			if (hit !== undefined && !isExpired(hit, at)) {
				duplicateSuppressed += 1;
				return hit.value;
			}
			const value = await fn();
			records.set(key, {
				key,
				value,
				storedAt: at,
				expiresAt: at + ttlMs,
			});
			return value;
		},
		peek(key) {
			const at = now();
			const hit = records.get(key);
			if (hit === undefined || isExpired(hit, at)) return undefined;
			return hit.value;
		},
		forget(key) {
			return records.delete(key);
		},
		prune() {
			const at = now();
			let removed = 0;
			for (const [k, rec] of records) {
				if (isExpired(rec, at)) {
					records.delete(k);
					removed += 1;
				}
			}
			return removed;
		},
		size() {
			return records.size;
		},
		serialize() {
			return {
				version: SCHEMA_VERSION,
				records: [...records.values()].map((r) => ({
					key: r.key,
					value: r.value,
					storedAt: r.storedAt,
					expiresAt: r.expiresAt,
				})),
				duplicateSuppressed,
			};
		},
		hydrate(snapshot) {
			records.clear();
			if (snapshot.version !== SCHEMA_VERSION) return;
			const at = now();
			for (const rec of snapshot.records) {
				if (!isExpired(rec as IIdempotencyRecord<T>, at)) {
					records.set(rec.key, rec as IIdempotencyRecord<T>);
				}
			}
			// Snapshot's counter is a lower bound; we keep the
			// larger of the two to be safe.
			duplicateSuppressed = Math.max(
				duplicateSuppressed,
				snapshot.duplicateSuppressed,
			);
		},
		clear() {
			records.clear();
			duplicateSuppressed = 0;
		},
	};
};

// ---------------------------------------------------------------------------
// File-backed persistence helpers.
//
// The store above is process-local by default; if a host wants
// crash-survival, it can dump the JSON snapshot to disk via
// `writeFileAtomic` and reload via `readFile`. The two helpers
// below isolate the JSON shape from the store API so callers do not
// have to reach into `serialize()`/`hydrate()` themselves.
// ---------------------------------------------------------------------------

export interface IIdempotencyFile<_T> {
	readonly path: string;
}

export const writeIdempotencyFile = async <T>(
	store: IIdempotencyStore<T>,
	file: IIdempotencyFile<T>,
	writeFile: (path: string, content: string) => Promise<void>,
): Promise<void> => {
	const snapshot = store.serialize();
	const json = JSON.stringify(snapshot);
	await writeFile(file.path, json);
};

export const readIdempotencyFile = async <T>(
	file: IIdempotencyFile<T>,
	readFile: (path: string) => Promise<string>,
): Promise<IIdempotencySnapshot<T> | undefined> => {
	try {
		const json = await readFile(file.path);
		const parsed = JSON.parse(json) as IIdempotencySnapshot<T>;
		if (parsed.version !== SCHEMA_VERSION) return undefined;
		return parsed;
	} catch {
		// File missing or corrupt — start empty.
		return undefined;
	}
};

// ---------------------------------------------------------------------------
// Optional helper: build a deterministic refusal for "duplicate
// suppressed" when callers want to surface it as an
// `OperationResult.failure` instead of a silent cache hit.
// ---------------------------------------------------------------------------

export const duplicateSuppressedRefusal = (key: string): Refusal => ({
	code: 'IDEMPOTENT-DUPLICATE',
	message: `operation with idempotencyKey="${key}" was suppressed (cached result returned)`,
});
