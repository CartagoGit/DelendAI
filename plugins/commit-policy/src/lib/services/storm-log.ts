import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

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
const JSON_SUFFIX = '.json';
const MAX_SAMPLE_PROPOSAL_IDS = 5;

const safeName = (s: string): string =>
	s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

const stormKeyFor = (trigger: string, code: string): string =>
	`${trigger}\u0000${code}`;

const identityKeyFor = (
	trigger: string,
	code: string,
	firstSeenAt: number,
): string => `${stormKeyFor(trigger, code)}\u0000${firstSeenAt}`;

const stormHashFor = (
	trigger: string,
	code: string,
	firstSeenAt: number,
): string =>
	createHash('sha256')
		.update(`${trigger}\u0000${code}\u0000${firstSeenAt}`)
		.digest('hex')
		.slice(0, 12);

const fileNameFor = (entry: IStormLogEntry): string =>
	`${safeName(entry.trigger)}__${safeName(entry.code)}__${entry.firstSeenAt}__${stormHashFor(entry.trigger, entry.code, entry.firstSeenAt)}${JSON_SUFFIX}`;

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

const dedupeProposalIds = (proposalIds: readonly string[]): string[] => {
	const unique: string[] = [];
	const seen = new Set<string>();
	for (const proposalId of proposalIds) {
		if (seen.has(proposalId)) continue;
		seen.add(proposalId);
		unique.push(proposalId);
	}
	return unique.slice(-MAX_SAMPLE_PROPOSAL_IDS);
};

const dedupeTimestamps = (
	timestamps: readonly number[],
	cutoff: number,
): number[] =>
	[...new Set(timestamps.filter((timestamp) => timestamp >= cutoff))].sort(
		(left, right) => left - right,
	);

const mergeEntry = (
	left: IStormLogEntry | undefined,
	right: IStormLogEntry,
	cutoff: number,
): IStormLogEntry | undefined => {
	const timestamps = dedupeTimestamps(
		[...(left?.timestamps ?? []), ...right.timestamps],
		cutoff,
	);
	if (timestamps.length === 0) {
		return undefined;
	}
	const earliestTimestamp = timestamps[0] ?? right.firstSeenAt;
	const latestTimestamp =
		timestamps[timestamps.length - 1] ?? right.lastSeenAt;
	return {
		trigger: right.trigger,
		code: right.code,
		firstSeenAt: Math.min(
			left?.firstSeenAt ?? right.firstSeenAt,
			right.firstSeenAt,
			earliestTimestamp,
		),
		lastSeenAt: Math.max(
			left?.lastSeenAt ?? right.lastSeenAt,
			right.lastSeenAt,
			latestTimestamp,
		),
		timestamps,
		sampleProposalIds: dedupeProposalIds([
			...(left?.sampleProposalIds ?? []),
			...right.sampleProposalIds,
		]),
		...(right.suggestedFix !== undefined
			? { suggestedFix: right.suggestedFix }
			: left?.suggestedFix !== undefined
				? { suggestedFix: left.suggestedFix }
				: {}),
	};
};

const parseEntries = (raw: string): IStormLogEntry[] => {
	const parsed: unknown = JSON.parse(raw);
	if (Array.isArray(parsed)) {
		const entries = parsed.filter(isStormLogEntry);
		if (entries.length === 0) {
			throw new Error('storm log file contains no valid entries');
		}
		return entries;
	}
	if (!isStormLogEntry(parsed)) {
		throw new Error('storm log file does not match IStormLogEntry');
	}
	return [parsed];
};

const serializeEntry = (entry: IStormLogEntry): string =>
	`${JSON.stringify(entry)}\n`;

const isMissingFileError = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { readonly code?: unknown }).code === 'ENOENT';

const pickLatestEntry = (
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

export class StormLog {
	private readonly dir: string;
	private readonly maxAgeMs: number;

	constructor(options: IStormLogOptions) {
		this.dir = join(options.cacheDir, 'storms');
		this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
	}

	private pathForEntry(entry: IStormLogEntry): string {
		return join(this.dir, fileNameFor(entry));
	}

	async ensureDir(): Promise<void> {
		await mkdir(this.dir, { recursive: true });
	}

	private async readMergedEntryFromPath(
		path: string,
		now: number,
	): Promise<IStormLogEntry | undefined> {
		const cutoff = now - this.maxAgeMs;
		try {
			const raw = await readFile(path, 'utf8');
			let merged: IStormLogEntry | undefined;
			for (const entry of parseEntries(raw)) {
				merged = mergeEntry(merged, entry, cutoff);
			}
			return merged;
		} catch (error) {
			if (isMissingFileError(error)) {
				return undefined;
			}
			const quarantinedPath = await quarantineCorruptFile(path);
			void quarantinedPath;
			return undefined;
		}
	}

	async readAll(now: number = Date.now()): Promise<IStormLogEntry[]> {
		let names: string[];
		try {
			names = await readdir(this.dir);
		} catch (error) {
			if (isMissingFileError(error)) {
				return [];
			}
			throw error;
		}
		const byIdentity = new Map<string, IStormLogEntry>();
		for (const name of names) {
			if (!name.endsWith(JSON_SUFFIX)) continue;
			const path = join(this.dir, name);
			const entry = await this.readMergedEntryFromPath(path, now);
			if (entry === undefined) {
				await rm(path, { force: true }).catch(() => undefined);
				continue;
			}
			const key = identityKeyFor(
				entry.trigger,
				entry.code,
				entry.firstSeenAt,
			);
			const previous = byIdentity.get(key);
			byIdentity.set(
				key,
				previous === undefined
					? entry
					: (mergeEntry(previous, entry, now - this.maxAgeMs) ??
							previous),
			);
		}
		return [...byIdentity.values()].sort((left, right) => {
			if (left.lastSeenAt !== right.lastSeenAt) {
				return right.lastSeenAt - left.lastSeenAt;
			}
			return right.firstSeenAt - left.firstSeenAt;
		});
	}

	async write(
		entries: readonly IStormLogEntry[],
		now: number = Date.now(),
	): Promise<void> {
		if (entries.length === 0) return;
		const cutoff = now - this.maxAgeMs;
		const byIdentity = new Map<string, IStormLogEntry>();
		for (const entry of entries) {
			const key = identityKeyFor(
				entry.trigger,
				entry.code,
				entry.firstSeenAt,
			);
			const previous = byIdentity.get(key);
			const merged = mergeEntry(previous, entry, cutoff);
			if (merged !== undefined) {
				byIdentity.set(key, merged);
			}
		}
		if (byIdentity.size === 0) return;
		await this.ensureDir();
		await Promise.all(
			[...byIdentity.values()].map(async (incomingEntry) => {
				const path = this.pathForEntry(incomingEntry);
				await withFileMutex(
					path,
					async () => {
						const existingEntry =
							await this.readMergedEntryFromPath(path, now);
						const merged = mergeEntry(
							existingEntry,
							incomingEntry,
							cutoff,
						);
						if (merged === undefined) {
							await rm(path, { force: true }).catch(
								() => undefined,
							);
							return;
						}
						await writeFileAtomic(path, serializeEntry(merged));
					},
					{ onContention: 'wait' },
				);
			}),
		);
	}

	async readOne(
		trigger: string,
		code: string,
		now: number = Date.now(),
	): Promise<IStormLogEntry | undefined> {
		const entries = await this.readAll(now);
		return entries
			.filter((entry) => entry.trigger === trigger && entry.code === code)
			.reduce<IStormLogEntry | undefined>((latest, entry) => {
				if (latest === undefined) return entry;
				return pickLatestEntry(latest, entry);
			}, undefined);
	}

	async replayInto(
		events: { observe(event: IStormEvent): void },
		now: number = Date.now(),
	): Promise<void> {
		const entries = await this.readAll(now);
		const latestByStorm = new Map<string, IStormLogEntry>();
		for (const entry of entries) {
			const stormKey = stormKeyFor(entry.trigger, entry.code);
			const previous = latestByStorm.get(stormKey);
			latestByStorm.set(
				stormKey,
				previous === undefined
					? entry
					: pickLatestEntry(previous, entry),
			);
		}
		for (const entry of latestByStorm.values()) {
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
