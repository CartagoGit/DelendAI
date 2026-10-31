/**
 * cleanup-stale-tmp.spec.ts — a00072 S7.b acceptance.
 *
 * The helper is a small pure module over `node:fs/promises`. Tests
 * run in a tempdir, drop a few tmp files with known mtimes, and
 * assert the sweep removed the right ones.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupStaleTmpFiles } from '../../../src/lib/cleanup-stale-tmp';

const FIVE_MIN_MS = 5 * 60 * 1000;

describe('cleanupStaleTmpFiles (a00072 S7.b)', () => {
	let root = '';
	let cacheDirAbs = '';

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'cleanup-stale-tmp-'));
		cacheDirAbs = join(root, 'cache');
		mkdirSync(cacheDirAbs, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const backdate = async (path: string, ageMs: number) => {
		const past = new Date(Date.now() - ageMs);
		const { utimes } = await import('node:fs/promises');
		await utimes(path, past, past);
	};

	it('removes a 0-byte .tmp file older than the stale threshold', async () => {
		const tmpPath = join(cacheDirAbs, 'usage-summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		await backdate(tmpPath, FIVE_MIN_MS);

		const result = await cleanupStaleTmpFiles({ cacheDirAbs });
		expect(result.scanned).toBe(1);
		expect(result.removed).toBe(1);
		expect(result.removedPaths).toEqual([tmpPath]);
	});

	it('keeps a fresh 0-byte tmp file (still in the write window)', async () => {
		const tmpPath = join(cacheDirAbs, 'usage-summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		// mtime is "now" — inside the 60s window.

		const result = await cleanupStaleTmpFiles({ cacheDirAbs });
		expect(result.scanned).toBe(1);
		expect(result.removed).toBe(0);
	});

	it('keeps a non-empty tmp file (still being written)', async () => {
		const tmpPath = join(cacheDirAbs, 'usage-summary.json.tmp');
		writeFileSync(tmpPath, '{"partial": true}', 'utf8');
		await backdate(tmpPath, FIVE_MIN_MS);

		const result = await cleanupStaleTmpFiles({ cacheDirAbs });
		expect(result.scanned).toBe(1);
		expect(result.removed).toBe(0);
	});

	it('does not touch non-tmp files', async () => {
		const stablePath = join(cacheDirAbs, 'usage-summary.json');
		writeFileSync(stablePath, '{"ok": true}', 'utf8');
		await backdate(stablePath, FIVE_MIN_MS);

		const result = await cleanupStaleTmpFiles({ cacheDirAbs });
		expect(result.scanned).toBe(0);
		expect(result.removed).toBe(0);
	});

	it('is a no-op when the cache dir is missing', async () => {
		const result = await cleanupStaleTmpFiles({
			cacheDirAbs: join(root, 'does-not-exist'),
		});
		expect(result.scanned).toBe(0);
		expect(result.removed).toBe(0);
	});

	it('honours a custom stale threshold', async () => {
		const tmpPath = join(cacheDirAbs, 'usage-summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		await backdate(tmpPath, 5_000); // 5s old

		// Threshold of 2s means 5s-old file is stale.
		const result = await cleanupStaleTmpFiles({
			cacheDirAbs,
			staleMs: 2_000,
		});
		expect(result.removed).toBe(1);
	});

	it('uses injected now() for determinism', async () => {
		const tmpPath = join(cacheDirAbs, 'usage-summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		// File mtime is "now". Inject a future-time clock so the file
		// is exactly 5 minutes old relative to the fake clock.
		const _now = 0;
		await backdate(tmpPath, 0); // mtime = (real now - 0) = now-ish
		const fakeNowAt = Date.now();
		const result = await cleanupStaleTmpFiles({
			cacheDirAbs,
			now: () => fakeNowAt + FIVE_MIN_MS, // 5min after real-mtime
		});
		expect(result.removed).toBe(1);
	});
});
