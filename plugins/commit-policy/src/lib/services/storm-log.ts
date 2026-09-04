/**
 * storm-log.ts — x00419 S4.
 *
 * Persist StormDetector snapshots as append-only JSONL segments under
 * `<pluginCacheDir>/storms/` so the count survives a host restart.
 * Each persisted entry gets its own atomic segment file; on boot we
 * re-read every segment, keep only the newest entry per storm key, and
 * replay its timestamps into the in-memory detector. Entries older than
 * 24h are pruned on read.
 *
 * The journal is intentionally conservative:
 * - writes never mutate an existing segment in place;
 * - malformed segments are ignored instead of crashing boot;
 * - old legacy `<key>.json` snapshots are still read so an upgrade does
 *   not lose storm history.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';

import { writeFileAtomicSync } from '@delendai/core/public';

import type { IStormEvent } from './storm-detector';

import type {
	IStormLogEntry,
	IStormLogOptions,
} from '../contracts/interfaces/storm-log.interface';

export type {
	IStormLogEntry,
	IStormLogOptions,
} from '../contracts/interfaces/storm-log.interface';

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const JSONL_SUFFIX = '.jsonl';
const LEGACY_JSON_SUFFIX = '.json';

const safeName = (s: string): string =>
	s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

const keyFor = (trigger: string, code: string): string =>
	`${safeName(trigger)}__${safeName(code)}`;

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

const isNumberArray = (value: unknown): value is readonly number[] =>
	Array.isArray(value) && value.every((item) => isFiniteNumber(item));

const isStormLogEntry = (value: unknown): value is IStormLogEntry =>
	value !== null &&
	typeof value === 'object' &&
	typeof (value as IStormLogEntry).trigger === 'string' &&
	typeof (value as IStormLogEntry).code === 'string' &&
	isFiniteNumber((value as IStormLogEntry).firstSeenAt) &&
	isFiniteNumber((value as IStormLogEntry).lastSeenAt) &&
	isNumberArray((value as IStormLogEntry).timestamps) &&
	isStringArray((value as IStormLogEntry).sampleProposalIds) &&
	((value as IStormLogEntry).suggestedFix === undefined ||
		typeof (value as IStormLogEntry).suggestedFix === 'string');

const deleteBestEffort = (path: string): void => {
	try {
		unlinkSync(path);
	} catch {
		// best-effort
	}
};

const newerEntry = (
	left: IStormLogEntry,
	right: IStormLogEntry,
): IStormLogEntry => {
	if (left.lastSeenAt !== right.lastSeenAt) {
		return left.lastSeenAt > right.lastSeenAt ? left : right;
	}
	if (left.firstSeenAt !== right.firstSeenAt) {
		return left.firstSeenAt > right.firstSeenAt ? left : right;
	}
	return left.timestamps.length >= right.timestamps.length ? left : right;
};

const parseJsonlEntries = (raw: string): IStormLogEntry[] => {
	const entries: IStormLogEntry[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (isStormLogEntry(parsed)) entries.push(parsed);
		} catch {
			// Keep valid history when one append is malformed.
		}
	}
	return entries;
};

const parseLegacyEntries = (raw: string): IStormLogEntry[] => {
	const parsed: unknown = JSON.parse(raw);
	if (Array.isArray(parsed)) {
		return parsed.filter(isStormLogEntry);
	}
	return isStormLogEntry(parsed) ? [parsed] : [];
};

export class StormLog {
	private readonly dir: string;
	private readonly maxAgeMs: number;

	constructor(options: IStormLogOptions) {
		this.dir = join(options.cacheDir, 'storms');
		this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
	}

	ensureDir(): void {
		mkdirSync(this.dir, { recursive: true });
	}

	private readEntriesFromFile(path: string, ext: string): IStormLogEntry[] {
		const raw = readFileSync(path, 'utf8');
		if (ext === LEGACY_JSON_SUFFIX) return parseLegacyEntries(raw);
		return parseJsonlEntries(raw);
	}

	/**
	 * The `existsSync` guards this method and `readOne` used to carry are
	 * gone on purpose. Each was a check-then-read race — the directory or
	 * file can vanish between the two calls, and in a swarm that writes
	 * these entries concurrently it will — while the `catch` immediately
	 * below already produced the identical answer for a missing path. Two
	 * syscalls to learn what one already told us, and the pair was less
	 * correct than the single call.
	 */
	readAll(now: number = Date.now()): IStormLogEntry[] {
		const cutoff = now - this.maxAgeMs;
		const latestByKey = new Map<string, IStormLogEntry>();
		let names: string[];
		try {
			names = readdirSync(this.dir);
		} catch {
			return [];
		}
		for (const name of names) {
			const ext = extname(name);
			if (ext !== JSONL_SUFFIX && ext !== LEGACY_JSON_SUFFIX) continue;
			const path = join(this.dir, name);
			try {
				const list = this.readEntriesFromFile(path, ext);
				let hasFreshEntry = false;
				for (const entry of list) {
					if (entry.lastSeenAt < cutoff) {
						continue;
					}
					hasFreshEntry = true;
					const key = keyFor(entry.trigger, entry.code);
					const previous = latestByKey.get(key);
					latestByKey.set(
						key,
						previous === undefined
							? entry
							: newerEntry(previous, entry),
					);
				}
				if (!hasFreshEntry) deleteBestEffort(path);
			} catch {
				// Skip corrupt files; do not throw. The detector still
				// works without them.
			}
		}
		return [...latestByKey.values()];
	}

	write(entries: readonly IStormLogEntry[]): void {
		// Nothing to persist means nothing to create. `ensureDir` used to run
		// first unconditionally, so a write of zero entries still left a
		// directory behind — and `lint:cache` then failed the whole
		// `validate` run over two empty `storms/` trees under
		// `plugins/*/.cache`, which nothing had ever written to.
		if (entries.length === 0) return;
		this.ensureDir();
		const cutoff = Date.now() - this.maxAgeMs;
		const latestByKey = new Map<string, IStormLogEntry>();
		for (const entry of entries) {
			if (entry.lastSeenAt < cutoff) continue;
			const key = keyFor(entry.trigger, entry.code);
			const previous = latestByKey.get(key);
			latestByKey.set(
				key,
				previous === undefined ? entry : newerEntry(previous, entry),
			);
		}
		for (const [key, entry] of latestByKey) {
			const path = join(
				this.dir,
				`${key}__${entry.lastSeenAt}__${randomUUID().slice(0, 8)}${JSONL_SUFFIX}`,
			);
			try {
				writeFileAtomicSync(path, `${JSON.stringify(entry)}\n`);
			} catch {
				// best-effort persistence
			}
		}
	}

	/**
	 * Read a single entry by key. Returns undefined if the file
	 * does not exist or is corrupt.
	 */
	readOne(trigger: string, code: string): IStormLogEntry | undefined {
		return this.readAll().find(
			(entry) => entry.trigger === trigger && entry.code === code,
		);
	}

	replayInto(events: { observe(event: IStormEvent): void }): void {
		const entries = this.readAll();
		for (const entry of entries) {
			const firstSample = entry.sampleProposalIds[0];
			for (const ts of entry.timestamps) {
				events.observe({
					timestamp: ts,
					code: entry.code,
					trigger: entry.trigger,
					...(firstSample !== undefined
						? { proposalId: firstSample }
						: {}),
					...(entry.suggestedFix !== undefined
						? { suggestedFix: entry.suggestedFix }
						: {}),
				});
			}
		}
	}
}
