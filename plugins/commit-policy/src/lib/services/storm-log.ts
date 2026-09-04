/**
 * storm-log.ts — x00419 S4.
 *
 * Persist StormDetector buckets to `<pluginCacheDir>/storms/<hash>.json`
 * so the count survives a host restart. On boot we re-read these files
 * and replay their timestamps into the in-memory detector. Entries
 * older than 24h are pruned on read.
 *
 * The log is intentionally append-only JSON: small files (one per
 * storm), bounded total size (24h × at most 256 storms = 256 files),
 * and no schema migrations to worry about. The hash is
 * `<trigger>:<code>` so all events for the same storm share a file
 * and we rewrite it on every snapshot.
 */

import {
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
	unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

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

const safeName = (s: string): string =>
	s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

const keyFor = (trigger: string, code: string): string =>
	`${safeName(trigger)}__${safeName(code)}`;

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
		const entries: IStormLogEntry[] = [];
		let names: string[];
		try {
			names = readdirSync(this.dir);
		} catch {
			return [];
		}
		for (const name of names) {
			const path = join(this.dir, name);
			try {
				const raw = readFileSync(path, 'utf8');
				const parsed = JSON.parse(raw) as
					| IStormLogEntry
					| IStormLogEntry[];
				const list: IStormLogEntry[] = Array.isArray(parsed)
					? parsed
					: [parsed];
				for (const entry of list) {
					if (entry.lastSeenAt < cutoff) {
						try {
							unlinkSync(path);
						} catch {
							// best-effort
						}
						continue;
					}
					entries.push(entry);
				}
			} catch {
				// Skip corrupt files; do not throw. The detector still
				// works without them.
			}
		}
		return entries;
	}

	write(entries: readonly IStormLogEntry[]): void {
		// Nothing to persist means nothing to create. `ensureDir` used to run
		// first unconditionally, so a write of zero entries still left a
		// directory behind — and `lint:cache` then failed the whole
		// `validate` run over two empty `storms/` trees under
		// `plugins/*/.cache`, which nothing had ever written to.
		if (entries.length === 0) return;
		this.ensureDir();
		// Group entries by key for fast lookup. We rewrite the file
		// for each key — the total write count is bounded by
		// `maxTrackedKeys` (256).
		const grouped = new Map<string, IStormLogEntry[]>();
		for (const entry of entries) {
			const key = keyFor(entry.trigger, entry.code);
			const list = grouped.get(key);
			if (list === undefined) {
				grouped.set(key, [entry]);
			} else {
				list.push(entry);
			}
		}
		for (const [key, list] of grouped) {
			const path = join(this.dir, `${key}.json`);
			try {
				writeFileSync(path, JSON.stringify(list, null, 2), 'utf8');
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
		const path = join(this.dir, `${keyFor(trigger, code)}.json`);
		try {
			const raw = readFileSync(path, 'utf8');
			const parsed = JSON.parse(raw) as IStormLogEntry | IStormLogEntry[];
			if (Array.isArray(parsed)) {
				return parsed[0];
			}
			return parsed;
		} catch {
			return undefined;
		}
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
