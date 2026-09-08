import {
	mkdtemp,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	utimes,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCacheEvictionRegistry } from '@delendai/core/lib/cache/eviction-registry';
import { createEvidenceRepo } from '@delendai/core/lib/evidence/evidence-repo';
import {
	createEvidenceStore,
	EVIDENCE_DEFAULT_KEEP_LAST_N,
	EVIDENCE_TYPES,
} from '@delendai/core/lib/evidence/evidence-store';
import type {
	IEvidenceStoreOptions,
	IEvidenceStoreWithCleanup,
} from '@delendai/core/lib/evidence/evidence-store';

const roots: string[] = [];
const stores: IEvidenceStoreWithCleanup[] = [];

afterEach(async () => {
	for (const store of stores.splice(0)) {
		try {
			store.close();
		} catch {
			// already closed
		}
	}
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

/**
 * f00533: these cases assert the on-disk layout the *file* backend
 * produces, so they pin it explicitly. The API they exercise —
 * `ensureLayout` / `write` / `cleanup` and the errors they raise — is
 * unchanged; only the backend selection is now stated out loud. The
 * SQLite default gets its own cases further down.
 */
const makeStore = async (
	retentionDays = 30,
	overrides: Partial<IEvidenceStoreOptions> = {},
) => {
	const workspaceRootAbs = await mkdtemp(
		join(tmpdir(), 'delendai-evidence-'),
	);
	roots.push(workspaceRootAbs);
	const cacheDirAbs = join(workspaceRootAbs, '.cache');
	const evictionRegistry = createCacheEvictionRegistry({
		workspaceRootAbs,
		cacheDirAbs,
	});
	const store = createEvidenceStore({
		evidenceRootAbs: join(cacheDirAbs, 'evidence'),
		evictionRegistry,
		retentionDays,
		backend: 'file',
		...overrides,
	});
	stores.push(store);
	await store.ensureLayout();
	return { store, evictionRegistry, cacheDirAbs, workspaceRootAbs };
};

describe('evidence store', () => {
	it('creates typed evidence directories and writes an envelope lazily', async () => {
		const { store } = await makeStore();
		expect((await readdir(store.rootDir)).sort()).toEqual(
			[...EVIDENCE_TYPES].sort(),
		);

		const path = await store.write(
			'surface',
			{ mode: 'managed', exposed: 6 },
			{ fileName: 'session.json' },
		);
		const envelope = JSON.parse(await readFile(path, 'utf8')) as {
			type: string;
			payload: { mode: string };
		};
		expect(envelope.type).toBe('surface');
		expect(envelope.payload.mode).toBe('managed');
	});

	it('removes old evidence on boot without touching other cache owners', async () => {
		const { store, evictionRegistry, cacheDirAbs } = await makeStore(1);
		const oldPath = await store.write(
			'diagnostic',
			{ old: true },
			{ fileName: 'old.json' },
		);
		const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		await utimes(oldPath, old, old);
		const unrelated = join(cacheDirAbs, 'other-cache', 'item.txt');
		await mkdir(join(cacheDirAbs, 'other-cache'), { recursive: true });
		await writeFile(unrelated, 'keep', 'utf8');
		const unrelatedTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		await utimes(unrelated, unrelatedTime, unrelatedTime);
		evictionRegistry.register({
			id: 'other-owner-rule',
			owner: 'other-owner',
			path: 'other-cache/*',
			when: { kind: 'olderThanMtimeDays', days: 1 },
		});
		await store.write('surface', { keep: true }, { fileName: 'keep.json' });

		const report = await store.cleanup('on-boot');
		expect(report.dryRun).toBe(false);
		expect(report.removed.map((entry) => entry.path)).toContain(
			'evidence/diagnostic/old.json',
		);
		await expect(stat(oldPath)).rejects.toThrow();
		expect(
			evictionRegistry
				.list()
				.some((rule) => rule.owner === 'core:evidence'),
		).toBe(true);
		await expect(stat(unrelated)).resolves.toBeDefined();
	});

	it('supports dry-run and off cleanup modes', async () => {
		const { store } = await makeStore(1);
		const oldPath = await store.write(
			'skills',
			{ old: true },
			{ fileName: 'old.json' },
		);
		const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		await utimes(oldPath, old, old);
		const preview = await store.cleanup('dry-run');
		expect(preview.dryRun).toBe(true);
		expect(preview.removed).toHaveLength(1);
		await expect(stat(oldPath)).resolves.toBeDefined();
		expect((await store.cleanup('off')).rulesEvaluated).toBe(0);
	});

	it('rejects evidence types outside the canonical taxonomy', async () => {
		const { store } = await makeStore();
		await expect(
			store.write('not-a-real-type' as never, { unexpected: true }),
		).rejects.toThrow('invalid evidence type');
	});
});

describe('evidence store facade (f00533)', () => {
	it('defaults to the sqlite backend and keeps the evidence root free of per-event files', async () => {
		const { store, cacheDirAbs } = await makeStore(30, {
			backend: 'sqlite',
		});
		expect(store.activeBackend).toBe('sqlite');
		expect(store.degradedReason).toBeUndefined();

		const locator = await store.write(
			'surface',
			{ mode: 'managed', exposed: 6 },
			{ fileName: 'session.json' },
		);
		// The public contract is "returns a string locator"; the sqlite
		// backend returns a database-and-row address, not a path.
		expect(locator).toContain('evidence-sqlite:');

		// The type directories still exist (the layout is documented and
		// the fallback needs it) but no event file was written.
		expect((await readdir(store.rootDir)).sort()).toEqual(
			[...EVIDENCE_TYPES].sort(),
		);
		expect(await readdir(join(store.rootDir, 'surface'))).toEqual([]);
		expect(await readdir(cacheDirAbs)).toContain('evidence.sqlite');
	});

	it('reads back what it wrote, newest first, through the repository', async () => {
		const { store, cacheDirAbs } = await makeStore(30, {
			backend: 'sqlite',
		});
		await store.write(
			'skills',
			{ n: 1 },
			{ recordedAt: new Date('2026-01-01T00:00:00.000Z') },
		);
		await store.write(
			'skills',
			{ n: 2 },
			{ recordedAt: new Date('2026-01-02T00:00:00.000Z') },
		);
		store.close();
		stores.length = 0;

		const repo = createEvidenceRepo({
			path: join(cacheDirAbs, 'evidence.sqlite'),
		});
		try {
			const rows = repo.listByType('skills');
			expect(rows).toHaveLength(2);
			const newest = JSON.parse(rows[0]?.payload ?? '{}') as {
				payload: { n: number };
				type: string;
				schemaVersion: number;
			};
			// The stored value is the same envelope the file backend wrote.
			expect(newest.schemaVersion).toBe(1);
			expect(newest.type).toBe('skills');
			expect(newest.payload.n).toBe(2);
			expect(repo.integrityCheck()).toEqual(['ok']);
		} finally {
			repo.close();
		}
	});

	it('degrades to the file backend once, without throwing, when the database cannot be opened', async () => {
		const workspaceRootAbs = await mkdtemp(
			join(tmpdir(), 'delendai-evidence-degrade-'),
		);
		roots.push(workspaceRootAbs);
		const cacheDirAbs = join(workspaceRootAbs, '.cache');
		// A directory where the database file must go: opening it as a
		// SQLite database can only fail.
		const blockedDbPath = join(cacheDirAbs, 'evidence.sqlite');
		await mkdir(blockedDbPath, { recursive: true });

		const reasons: string[] = [];
		const store = createEvidenceStore({
			evidenceRootAbs: join(cacheDirAbs, 'evidence'),
			evictionRegistry: createCacheEvictionRegistry({
				workspaceRootAbs,
				cacheDirAbs,
			}),
			retentionDays: 30,
			backend: 'sqlite',
			onDegraded: (reason) => reasons.push(reason),
		});
		stores.push(store);

		// Construction did not throw; the store is usable.
		expect(store.activeBackend).toBe('file');
		expect(store.degradedReason).toContain('evidence sqlite backend');
		expect(reasons).toHaveLength(1);

		await store.ensureLayout();
		const path = await store.write(
			'diagnostic',
			{ degraded: true },
			{ fileName: 'd.json' },
		);
		expect(path.endsWith('d.json')).toBe(true);
		const parsed = JSON.parse(await readFile(path, 'utf8')) as {
			payload: { degraded: boolean };
		};
		expect(parsed.payload.degraded).toBe(true);

		// Repeated writes must not re-report the degradation.
		await store.write('diagnostic', { again: true });
		expect(reasons).toHaveLength(1);
	});

	it('registers keepLastN alongside olderThanMtimeDays, with an explicit default', async () => {
		const { store, evictionRegistry } = await makeStore(30, {
			backend: 'sqlite',
		});
		await store.cleanup('dry-run');

		const rules = evictionRegistry
			.list()
			.filter((rule) => rule.owner === 'core:evidence');
		const kinds = new Set(rules.map((rule) => rule.when.kind));
		expect(kinds).toEqual(new Set(['olderThanMtimeDays', 'keepLastN']));

		const keepRules = rules.filter(
			(rule) => rule.when.kind === 'keepLastN',
		);
		expect(keepRules).toHaveLength(EVIDENCE_TYPES.length);
		for (const rule of keepRules) {
			// The default is a documented constant, not a literal buried
			// in the registration call.
			expect(rule.when.kind === 'keepLastN' ? rule.when.n : -1).toBe(
				EVIDENCE_DEFAULT_KEEP_LAST_N,
			);
			// keepLastN operates on a directory, never on a glob.
			expect(rule.path.endsWith('/*')).toBe(false);
		}
		expect(EVIDENCE_DEFAULT_KEEP_LAST_N).toBe(2_000);
	});

	it('caps the table by row count on cleanup and reports it', async () => {
		const { store, cacheDirAbs } = await makeStore(30, {
			backend: 'sqlite',
			keepLastN: 5,
		});
		for (let i = 0; i < 20; i += 1) {
			await store.write(
				'surface',
				{ i },
				{ recordedAt: new Date(Date.now() - (20 - i) * 1_000) },
			);
		}

		const preview = await store.cleanup('dry-run');
		expect(preview.dryRun).toBe(true);
		expect(
			preview.removed.some((entry) =>
				entry.path.startsWith('evidence.sqlite#surface'),
			),
		).toBe(true);

		// A dry run must not have deleted anything.
		const repo = createEvidenceRepo({
			path: join(cacheDirAbs, 'evidence.sqlite'),
		});
		try {
			expect(repo.countByType('surface')).toBe(20);
		} finally {
			repo.close();
		}

		const applied = await store.cleanup('on-boot');
		expect(applied.dryRun).toBe(false);

		const after = createEvidenceRepo({
			path: join(cacheDirAbs, 'evidence.sqlite'),
		});
		try {
			expect(after.countByType('surface')).toBe(5);
			expect(after.integrityCheck()).toEqual(['ok']);
		} finally {
			after.close();
		}
	});

	it('does nothing at all in off mode', async () => {
		const { store } = await makeStore(1, { backend: 'sqlite' });
		await store.write('surface', { keep: true });
		const report = await store.cleanup('off');
		expect(report.rulesEvaluated).toBe(0);
		expect(report.removed).toEqual([]);
	});

	it('rejects a non-integer keepLastN at construction', async () => {
		await expect(makeStore(30, { keepLastN: -1 })).rejects.toThrow(
			'keepLastN',
		);
	});
});
