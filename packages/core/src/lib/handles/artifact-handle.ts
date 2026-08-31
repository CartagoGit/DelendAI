/**
 * lib/handles/artifact-handle.ts — v00133 (S2)
 *
 * Result handles for tool chaining. They avoid re-injecting large
 * payloads into subsequent prompts by referencing an opaque,
 * digest-addressed, TTL-bound, authorization-gated blob kept
 * server-side.
 *
 * Privacy & determinism (R1.1–R1.10): no I/O, no clock. The store
 * is in-memory; callers can swap in a durable backend without
 * breaking the contract. Handles are opaque outside this module;
 * authorization uses an opaque `viewerToken` issued at open time.
 *
 * Vocabulary:
 *   - `open(value, options)` returns `{ handleId, viewerToken }`.
 *     The `viewerToken` is required to retrieve the blob later.
 *   - `get(handleId, viewerToken)` returns the original value if
 *     (a) it exists, (b) is not expired, (c) the viewer token
 *     matches, (d) is not redacted. A redaction marker is
 *     returned for redacted blobs instead of the raw value.
 *   - `expire(handleId)` evicts the entry; further `get` returns
 *     `handle-expired`.
 *   - `redact(handleId)` marks the entry as redacted so subsequent
 *     `get` returns a sentinel without surfacing the value.
 *
 * The store is bounded: callers can pass a `maxBytes` budget; the
 * store refuses entries whose JSON-serialized payload exceeds the
 * budget.
 */

import { createHash } from 'node:crypto';

const UTF8_ENCODER = new TextEncoder();

export interface IHandleOptions {
	readonly ttlMs?: number;
	readonly maxBytes?: number;
	readonly label?: string;
	readonly clock?: IClock;
}

export interface IClock {
	readonly now: () => number;
}

export interface IArtifactHandle {
	readonly handleId: string;
	readonly viewerToken: string;
	readonly digest: string;
	readonly label: string;
	readonly expiresAt: number | null;
}

export type THandleReadResult<T> =
	| { readonly status: 'ok'; readonly value: T }
	| {
			readonly status: 'redacted';
			readonly message: string;
	  }
	| {
			readonly status: 'expired' | 'not-found' | 'unauthorized';
	  };

interface IHandleEntry {
	readonly handleId: string;
	readonly viewerToken: string;
	readonly digest: string;
	readonly label: string;
	readonly value: unknown;
	readonly redacted: boolean;
	readonly expiresAt: number | null;
	readonly ttlClock: IClock | null;
}

export interface IHandleStore<T> {
	open(value: T, options?: IHandleOptions): IArtifactHandle;
	get(handleId: string, viewerToken: string): THandleReadResult<T>;
	expire(handleId: string): boolean;
	redact(handleId: string): boolean;
	size(): number;
}

const byteLength = (value: string): number => UTF8_ENCODER.encode(value).length;

const digestOf = (value: unknown): string =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex');

const randomToken = (length: number): string => {
	const alphabet =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let out = '';
	for (let i = 0; i < length; i += 1) {
		out += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return out;
};

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_CLOCK: IClock = Object.freeze({
	now: () => Date.now(),
});

export const createInMemoryHandleStore = <T>(): IHandleStore<T> => {
	const entries = new Map<string, IHandleEntry>();
	const store: IHandleStore<T> = {
		open(value: T, options: IHandleOptions = {}): IArtifactHandle {
			const serialized = JSON.stringify(value);
			const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
			if (byteLength(serialized) > maxBytes) {
				throw new Error(
					`artifact exceeds maxBytes budget (${byteLength(serialized)} > ${maxBytes})`,
				);
			}
			const digest = digestOf(value);
			const handleId = `h:${digest.slice(0, 12)}:${randomToken(8)}`;
			const viewerToken = randomToken(32);
			const ttlClock =
				options.ttlMs !== undefined
					? (options.clock ?? DEFAULT_CLOCK)
					: null;
			const expiresAt =
				ttlClock !== null && options.ttlMs !== undefined
					? ttlClock.now() + options.ttlMs
					: null;
			entries.set(handleId, {
				handleId,
				viewerToken,
				digest,
				label: options.label ?? '',
				value,
				redacted: false,
				expiresAt,
				ttlClock,
			});
			return Object.freeze({
				handleId,
				viewerToken,
				digest,
				label: options.label ?? '',
				expiresAt,
			});
		},
		get: (handleId, viewerToken): THandleReadResult<T> => {
			const entry = entries.get(handleId);
			if (entry === undefined) {
				return { status: 'not-found' };
			}
			if (entry.viewerToken !== viewerToken) {
				return { status: 'unauthorized' };
			}
			if (entry.redacted) {
				return {
					status: 'redacted',
					message: 'artifact was redacted',
				};
			}
			if (
				entry.expiresAt !== null &&
				entry.ttlClock !== null &&
				entry.ttlClock.now() >= entry.expiresAt
			) {
				entries.delete(handleId);
				return { status: 'expired' };
			}
			return { status: 'ok', value: entry.value as T };
		},
		expire(handleId: string): boolean {
			return entries.delete(handleId);
		},
		redact(handleId: string): boolean {
			const entry = entries.get(handleId);
			if (entry === undefined) return false;
			entries.set(handleId, { ...entry, redacted: true });
			return true;
		},
		size(): number {
			return entries.size;
		},
	};
	return store;
};

export const __testing = Object.freeze({
	digestOf,
	randomToken,
	DEFAULT_MAX_BYTES,
	DEFAULT_CLOCK,
});
