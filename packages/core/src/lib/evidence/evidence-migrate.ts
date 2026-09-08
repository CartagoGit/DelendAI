/**
 * evidence-migrate.ts — f00533 S3.
 *
 * One-shot importer for the legacy one-file-per-event layout. It
 * exists because the measured `.cache/delendai/evidence` on this
 * repository held 25.533 JSON files / 185 MB on 2026-09-08, and
 * f00533's non-goals forbid deleting that history without importing
 * it first.
 *
 * Three properties the implementation is built around:
 *
 * 1. **Bounded memory.** The evidence root is streamed with
 *    `opendir`, never `readdir`. Only `batchSize` envelopes (default
 *    500) are held at once, so a 20.000-file root costs the same
 *    memory as a 200-file one. `readdir` on the real root would
 *    materialise 25.533 names before the first row was written.
 *
 * 2. **Crash safety.** Files are deleted only after the transaction
 *    that inserted them has committed. A crash therefore leaves
 *    duplicated *work*, never lost data: the worst case is a file
 *    that is already in the table and still on disk.
 *
 * 3. **Idempotence.** Every row carries `source_key` =
 *    `<type>/<file name>`, unique in the schema, and the repository
 *    inserts with `INSERT OR IGNORE`. Re-running after a crash — or
 *    just re-running — re-inserts nothing and finishes the deletions
 *    the previous run did not reach.
 *
 * A file that cannot be parsed is counted and LEFT ON DISK. The
 * migrator will not delete something it failed to understand; an
 * operator gets a report naming the file instead of a silent loss.
 */

import { opendir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { EvidenceType } from '../contracts/interfaces/evidence.interface';

import type { IEvidenceAppend, IEvidenceRepo } from './evidence-repo';
import { EVIDENCE_TYPES } from './evidence-store.facade';

/** Envelopes buffered per transaction. Small enough to stay cheap,
 *  large enough that the per-transaction cost disappears. */
export const EVIDENCE_MIGRATE_DEFAULT_BATCH_SIZE = 500;

export interface IEvidenceMigrateBatch {
	/** 0-based batch ordinal. */
	readonly index: number;
	/** Envelopes in THIS batch. Never exceeds `batchSize`. */
	readonly size: number;
	/** Running total of files deleted so far. */
	readonly migratedSoFar: number;
}

export interface IEvidenceMigrateFailure {
	readonly file: string;
	readonly reason: string;
}

export interface IEvidenceMigrateReport {
	/** `.json` files encountered under a known type directory. */
	readonly scanned: number;
	/** Files inserted (or already present) and then deleted. */
	readonly migrated: number;
	/** Files left on disk because they could not be read or parsed. */
	readonly failed: number;
	readonly batches: number;
	/** Bytes of JSON reclaimed from the filesystem. */
	readonly bytesReclaimed: number;
	readonly durationMs: number;
	readonly failures: readonly IEvidenceMigrateFailure[];
	/** True when nothing was written or deleted. */
	readonly dryRun: boolean;
}

export interface IEvidenceMigrateOptions {
	/** Absolute `<cacheDir>/evidence` root to drain. */
	readonly evidenceRootAbs: string;
	/** Destination. The caller owns opening and closing it. */
	readonly repo: IEvidenceRepo;
	readonly batchSize?: number | undefined;
	/** Restrict to a subset of types. Defaults to all of them. */
	readonly types?: readonly EvidenceType[] | undefined;
	/** Count everything, write and delete nothing. */
	readonly dryRun?: boolean | undefined;
	/** Fires once per committed batch. Progress reporting seam. */
	readonly onBatch?: ((batch: IEvidenceMigrateBatch) => void) | undefined;
}

interface IPending {
	readonly absolutePath: string;
	readonly entry: IEvidenceAppend;
	readonly bytes: number;
}

const JSON_FILE_RE = /\.json$/u;

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The stored payload is the envelope verbatim — byte-identical to
 * what the file backend wrote — so a migrated row and a natively
 * appended row are indistinguishable to any reader.
 */
const parseEnvelope = (
	type: EvidenceType,
	fileName: string,
	raw: string,
): IEvidenceAppend => {
	const parsed: unknown = JSON.parse(raw);
	if (parsed === null || typeof parsed !== 'object') {
		throw new Error('evidence envelope is not an object');
	}
	const recordedAtRaw = (parsed as { recordedAt?: unknown }).recordedAt;
	const recordedAt =
		typeof recordedAtRaw === 'string' ? Date.parse(recordedAtRaw) : Number.NaN;
	return {
		type,
		// A legacy file with no usable timestamp is not a reason to drop
		// it; it sorts as "oldest" and the prune will reach it first.
		recordedAt: Number.isFinite(recordedAt) ? recordedAt : 0,
		payload: raw,
		sourceKey: `${type}/${fileName}`,
	};
};

export const migrateEvidenceFiles = async (
	options: IEvidenceMigrateOptions,
): Promise<IEvidenceMigrateReport> => {
	const batchSize = options.batchSize ?? EVIDENCE_MIGRATE_DEFAULT_BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) {
		throw new Error('evidence migrate batchSize must be a positive integer');
	}
	const types = options.types ?? EVIDENCE_TYPES;
	const dryRun = options.dryRun ?? false;
	const startedAt = performance.now();

	let scanned = 0;
	let migrated = 0;
	let batches = 0;
	let bytesReclaimed = 0;
	const failures: IEvidenceMigrateFailure[] = [];

	// The ONLY unbounded-ish allocation in this function, and it is
	// capped at `batchSize` entries by `flush` below.
	let pending: IPending[] = [];

	const flush = async (): Promise<void> => {
		if (pending.length === 0) return;
		const batch = pending;
		pending = [];
		if (!dryRun) {
			// Commit first...
			options.repo.appendMany(batch.map((item) => item.entry));
			// ...then delete. Never the other way round: a crash
			// between the two costs a re-insert that `INSERT OR IGNORE`
			// discards, whereas the reverse would lose the evidence.
			for (const item of batch) {
				try {
					await unlink(item.absolutePath);
					migrated += 1;
					bytesReclaimed += item.bytes;
				} catch (error) {
					// Already gone (a concurrent run) is success.
					if (
						(error as NodeJS.ErrnoException).code === 'ENOENT'
					) {
						migrated += 1;
						continue;
					}
					failures.push({
						file: item.absolutePath,
						reason: describe(error),
					});
				}
			}
		} else {
			migrated += batch.length;
			for (const item of batch) bytesReclaimed += item.bytes;
		}
		options.onBatch?.({
			index: batches,
			size: batch.length,
			migratedSoFar: migrated,
		});
		batches += 1;
	};

	for (const type of types) {
		const typeDirAbs = join(options.evidenceRootAbs, type);
		let dir: Awaited<ReturnType<typeof opendir>>;
		try {
			dir = await opendir(typeDirAbs);
		} catch (error) {
			// A type directory that was never created is not an error.
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw error;
		}
		// `for await` over the Dir handle pulls entries in chunks from
		// the OS instead of buffering the whole directory listing.
		for await (const dirent of dir) {
			if (!dirent.isFile() || !JSON_FILE_RE.test(dirent.name)) continue;
			scanned += 1;
			const absolutePath = join(typeDirAbs, dirent.name);
			try {
				const raw = await readFile(absolutePath, 'utf8');
				pending.push({
					absolutePath,
					entry: parseEnvelope(type, dirent.name, raw),
					bytes: Buffer.byteLength(raw, 'utf8'),
				});
			} catch (error) {
				// Unparseable input stays on disk, by design.
				failures.push({
					file: absolutePath,
					reason: describe(error),
				});
				continue;
			}
			if (pending.length >= batchSize) await flush();
		}
	}
	await flush();

	return {
		scanned,
		migrated,
		failed: failures.length,
		batches,
		bytesReclaimed,
		durationMs: performance.now() - startedAt,
		failures,
		dryRun,
	};
};
