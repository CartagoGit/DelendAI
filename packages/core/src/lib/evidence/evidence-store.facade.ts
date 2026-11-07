/**
 * evidence-store.facade.ts — f00533 S2.
 *
 * Chooses between the SQLite primary backend (f00533 S1) and the
 * original one-file-per-event backend, and presents exactly the
 * `IEvidenceStore` surface either way. No consumer of the store knows
 * which one it got: `packages/core/src/lib/cli/assemble.ts` and every
 * plugin keep calling `ensureLayout()` / `write()` unchanged.
 *
 * The decision is made once, in the constructor, following the shape
 * `packages/state-telemetry/src/lib/events/work-event-store.facade.ts`
 * already proved: try the primary, and on any failure fall back
 * silently-but-recorded to the secondary. Evidence is diagnostic data;
 * a server must never fail to boot because its diagnostic sink could
 * not open a database. `degradedReason` is set once and the
 * `onDegraded` callback fires once, never per write.
 *
 * Eviction policy (f00533 S2 acceptance): both bounds are registered,
 * per evidence type.
 *
 *   - `olderThanMtimeDays` — the pre-existing age bound, default 30
 *     days (`EVIDENCE_DEFAULT_RETENTION_DAYS`).
 *   - `keepLastN` — the NEW count bound, default 2.000 entries per
 *     type (`EVIDENCE_DEFAULT_KEEP_LAST_N`).
 *
 * The age bound alone is what produced the measured 25.533 files /
 * 185 MB: at the observed ~2.800 events per type per day, nothing is
 * evicted until day 30, so the steady state is ~80.000 entries. The
 * count bound is what actually caps the store, and it holds
 * regardless of event rate. 2.000 per type is roughly seventeen hours
 * of the observed traffic and ~580 KB per type at the measured 289
 * bytes per entry — enough history to diagnose the session that just
 * happened, which is all evidence is for.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	ICacheEvictionRegistry,
	ICacheEvictionRemoved,
	ICacheEvictionReport,
} from '../contracts/interfaces/cache-eviction.interface';
import type {
	EvidenceType,
	IEvidenceStore,
} from '../contracts/interfaces/evidence.interface';
import { writeFileAtomic } from '../shared/atomic-write';

import { createEvidenceRepo, type IEvidenceRepo } from './evidence-repo';

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
	'startup-report',
	'surface',
	'skills',
	'verification',
	'diagnostic',
];

/** Age bound, unchanged from before f00533. */
export const EVIDENCE_DEFAULT_RETENTION_DAYS = 30;

/**
 * Count bound, new in f00533. Per evidence type, not global — one
 * chatty type must not evict another type's history.
 */
export const EVIDENCE_DEFAULT_KEEP_LAST_N = 2_000;

/** Default database location: a sibling of the evidence root, so the
 *  root itself stays a clean set of type directories. */
export const EVIDENCE_DB_BASENAME = 'evidence.sqlite';

const EVIDENCE_OWNER = 'core:evidence';
const EVIDENCE_TYPE_RE = /^[a-z][a-z0-9-]*$/u;
const FILE_NAME_RE = /^[a-z0-9][a-z0-9._-]*\.json$/u;

export type TEvidenceBackend = 'sqlite' | 'file';

export interface IEvidenceStoreOptions {
	readonly evidenceRootAbs: string;
	readonly evictionRegistry: ICacheEvictionRegistry;
	readonly retentionDays: number;
	/**
	 * Per-type ceiling. Defaults to
	 * {@link EVIDENCE_DEFAULT_KEEP_LAST_N}. Set to `0` to keep nothing
	 * beyond the age bound's reach.
	 */
	readonly keepLastN?: number | undefined;
	/**
	 * `'sqlite'` (default) prefers the table and degrades to files if
	 * the database cannot be opened. `'file'` pins the legacy backend.
	 */
	readonly backend?: TEvidenceBackend | undefined;
	/** Override the database path. Defaults to a sibling of the root. */
	readonly sqlitePathAbs?: string | undefined;
	/** Called at most once, when the primary backend is unavailable. */
	readonly onDegraded?: ((reason: string) => void) | undefined;
}

export interface IEvidenceStoreWithCleanup extends IEvidenceStore {
	cleanup(
		mode?: 'on-boot' | 'dry-run' | 'off',
	): Promise<ICacheEvictionReport>;
	/** Which backend construction actually settled on. */
	readonly activeBackend: TEvidenceBackend;
	/** Why the primary was not used, or `undefined` when it was. */
	readonly degradedReason: string | undefined;
	/** Release the database handle. A no-op on the file backend. */
	close(): void;
}

interface IEvidenceEnvelope {
	readonly schemaVersion: number;
	readonly type: EvidenceType;
	readonly recordedAt: string;
	readonly payload: unknown;
}

const emptyReport = (): ICacheEvictionReport => ({
	dryRun: true,
	appliedAt: new Date().toISOString(),
	totalBytes: 0,
	removed: [],
	skipped: [],
	errors: [],
	rulesEvaluated: 0,
});

const validateType = (type: string): void => {
	if (
		!EVIDENCE_TYPE_RE.test(type) ||
		!(EVIDENCE_TYPES as readonly string[]).includes(type)
	) {
		throw new Error(`invalid evidence type: ${type}`);
	}
};

const defaultFileName = (recordedAt: Date): string =>
	`${recordedAt.toISOString().replace(/[:.]/gu, '-').toLowerCase()}.json`;

export const buildEvidenceEnvelope = (
	type: EvidenceType,
	payload: unknown,
	recordedAt: Date,
): IEvidenceEnvelope => ({
	schemaVersion: 1,
	type,
	recordedAt: recordedAt.toISOString(),
	payload,
});

/**
 * Registers both bounds for every type. Two rules per type rather
 * than one so `registry.list()` shows the policy explicitly — an
 * operator reading the registry can see the ceiling without reading
 * this file.
 */
const registerRules = (
	registry: ICacheEvictionRegistry,
	retentionDays: number,
	keepLastN: number,
): void => {
	for (const type of EVIDENCE_TYPES) {
		registry.register({
			id: `core-evidence-${type}`,
			owner: EVIDENCE_OWNER,
			path: `evidence/${type}/*`,
			when: { kind: 'olderThanMtimeDays', days: retentionDays },
		});
		// NOTE the path has no `/*`: `keepLastN` operates on a
		// directory's children, so it must be given the directory.
		registry.register({
			id: `core-evidence-${type}-keep-last`,
			owner: EVIDENCE_OWNER,
			path: `evidence/${type}`,
			when: { kind: 'keepLastN', n: keepLastN },
		});
	}
};

/* --- file backend (pre-f00533, kept as the fallback) --------------- */

interface IBackend {
	ensureLayout(): Promise<void>;
	write(
		type: EvidenceType,
		envelope: IEvidenceEnvelope,
		fileName: string,
	): Promise<string>;
	/** Extra removals to merge into the eviction report. */
	prune(
		retentionDays: number,
		keepLastN: number,
		dryRun: boolean,
	): readonly ICacheEvictionRemoved[];
	close(): void;
}

const createFileBackend = (evidenceRootAbs: string): IBackend => ({
	async ensureLayout() {
		await mkdir(evidenceRootAbs, { recursive: true });
		await Promise.all(
			EVIDENCE_TYPES.map((type) =>
				mkdir(join(evidenceRootAbs, type), { recursive: true }),
			),
		);
	},
	async write(type, envelope, fileName) {
		const absolutePath = join(evidenceRootAbs, type, fileName);
		await writeFileAtomic(
			absolutePath,
			`${JSON.stringify(envelope, null, '\t')}\n`,
		);
		return absolutePath;
	},
	prune() {
		// The eviction registry already walks the files for both
		// bounds; there is nothing backend-specific left to do.
		return [];
	},
	close() {
		// No handle to release.
	},
});

/* --- sqlite backend ------------------------------------------------ */

const createSqliteBackend = (
	evidenceRootAbs: string,
	repo: IEvidenceRepo,
): IBackend => ({
	async ensureLayout() {
		// The type directories are still created. They cost nothing
		// when empty, they keep `rootDir` a stable, documented shape
		// for operators, and they mean a later degradation to the file
		// backend lands on a layout that already exists.
		await mkdir(evidenceRootAbs, { recursive: true });
		await Promise.all(
			EVIDENCE_TYPES.map((type) =>
				mkdir(join(evidenceRootAbs, type), { recursive: true }),
			),
		);
	},
	async write(type, envelope) {
		const id = repo.append({
			type,
			recordedAt: Date.parse(envelope.recordedAt),
			payload: JSON.stringify(envelope),
		});
		// `IEvidenceStore.write` is typed as returning a string
		// locator. No consumer in this repository dereferences it as a
		// path; a row is addressed by database and id.
		return `evidence-sqlite:${repo.dbPath}#${id}`;
	},
	prune(retentionDays, keepLastN, dryRun) {
		const removed: ICacheEvictionRemoved[] = [];
		for (const type of EVIDENCE_TYPES) {
			const result = repo.prune({
				type,
				olderThanDays: retentionDays,
				keepLastN,
				dryRun,
			});
			if (result.total === 0) continue;
			removed.push({
				id: `core-evidence-sqlite-${type}`,
				// Logical path: the rows of one type inside the store's
				// own database, not a file on disk.
				path: `${EVIDENCE_DB_BASENAME}#${type} (${result.total} rows)`,
				bytes: 0,
			});
		}
		return removed;
	},
	close() {
		repo.close();
	},
});

/* --- facade -------------------------------------------------------- */

const _safeClose = (repo: IEvidenceRepo): void => {
	try {
		repo.close();
	} catch {
		// Closing after a botched boot must not mask why we degraded.
	}
};

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const createEvidenceStore = (
	options: IEvidenceStoreOptions,
): IEvidenceStoreWithCleanup => {
	if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1) {
		throw new Error('evidence retentionDays must be a positive integer');
	}
	const keepLastN = options.keepLastN ?? EVIDENCE_DEFAULT_KEEP_LAST_N;
	if (!Number.isInteger(keepLastN) || keepLastN < 0) {
		throw new Error('evidence keepLastN must be a non-negative integer');
	}

	const desired: TEvidenceBackend = options.backend ?? 'sqlite';
	let backend: IBackend;
	let activeBackend: TEvidenceBackend;
	let degradedReason: string | undefined;

	if (desired === 'sqlite') {
		const dbPath =
			options.sqlitePathAbs ??
			join(dirname(options.evidenceRootAbs), EVIDENCE_DB_BASENAME);
		try {
			backend = createSqliteBackend(
				options.evidenceRootAbs,
				createEvidenceRepo({ path: dbPath }),
			);
			activeBackend = 'sqlite';
		} catch (error) {
			// Recorded once, here, and never again: a per-write warning
			// on a degraded store would be thousands of lines of noise.
			degradedReason = `evidence sqlite backend unavailable at ${dbPath}: ${describe(error)}`;
			options.onDegraded?.(degradedReason);
			backend = createFileBackend(options.evidenceRootAbs);
			activeBackend = 'file';
		}
	} else {
		backend = createFileBackend(options.evidenceRootAbs);
		activeBackend = 'file';
	}

	let rulesRegistered = false;

	return {
		rootDir: options.evidenceRootAbs,
		activeBackend,
		degradedReason,

		async ensureLayout() {
			await backend.ensureLayout();
		},

		async write(type, payload, input = {}) {
			validateType(type);
			const recordedAt = input.recordedAt ?? new Date();
			const fileName = input.fileName ?? defaultFileName(recordedAt);
			if (!FILE_NAME_RE.test(fileName)) {
				throw new Error(`invalid evidence file name: ${fileName}`);
			}
			return backend.write(
				type,
				buildEvidenceEnvelope(type, payload, recordedAt),
				fileName,
			);
		},

		async cleanup(mode = 'on-boot') {
			if (mode === 'off') return emptyReport();
			if (!rulesRegistered) {
				registerRules(
					options.evictionRegistry,
					options.retentionDays,
					keepLastN,
				);
				rulesRegistered = true;
			}
			const dryRun = mode !== 'on-boot';
			const report = await options.evictionRegistry.run({
				onlyOwner: EVIDENCE_OWNER,
				dryRun,
			});
			const fromBackend = backend.prune(
				options.retentionDays,
				keepLastN,
				dryRun,
			);
			if (fromBackend.length === 0) return report;
			return {
				...report,
				removed: [...report.removed, ...fromBackend],
				rulesEvaluated: report.rulesEvaluated + fromBackend.length,
			};
		},

		close() {
			backend.close();
		},
	};
};
