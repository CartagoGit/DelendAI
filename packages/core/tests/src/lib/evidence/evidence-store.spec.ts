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
import {
	createEvidenceStore,
	EVIDENCE_TYPES,
} from '@delendai/core/lib/evidence/evidence-store';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const makeStore = async (retentionDays = 30) => {
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
	});
	await store.ensureLayout();
	return { store, evictionRegistry, cacheDirAbs };
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
