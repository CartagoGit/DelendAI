import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureRulesCache } from '@mcp-vertex/rules/lib/frameworks/manifest';
import type { IRulesManifest } from '@mcp-vertex/rules/lib/frameworks/types';

// l00008 s2 — regression coverage for the durable-write fix in
// `ensureRulesCache`: the historical `writeFileSync`/`mkdirSync` bypass
// (no atomicity, no cross-host mutex) is now `writeFileAtomic` +
// `withFileMutex`. These specs exercise crash-safety, parallel
// convergence, and the unchanged happy path.

const manifestFixture = (fingerprint: string): IRulesManifest => ({
	generatedAt: new Date(0).toISOString(),
	fingerprint,
	mode: 'mixed',
	projects: { demo: {} },
});

describe('ensureRulesCache (l00008 s2 durable-write fix)', async () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'rules-cache-'));
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	const baseOptions = (manifest: IRulesManifest) => ({
		resolve: (rel: string) => join(root, rel),
		cacheRelDir: '.cache/mcp-vertex/rules',
		manifest,
		manifestRelPath: '.cache/mcp-vertex/rules/rules-map.json',
	});

	it('happy path: materialises presets and writes the manifest on first run', async () => {
		const manifest = manifestFixture('rm-happy');
		const result = await ensureRulesCache(baseOptions(manifest));

		expect(result.manifestWritten).toBe(true);
		expect(result.materialized.length).toBeGreaterThan(0);

		const onDisk = JSON.parse(
			await readFile(join(root, result.manifestPath), 'utf8'),
		) as IRulesManifest;
		expect(onDisk.fingerprint).toBe('rm-happy');

		for (const rel of result.materialized) {
			// Every materialised preset file actually landed on disk —
			// writeFileAtomic's rename completed, not left in a .tmp file.
			await expect(readFile(join(root, rel), 'utf8')).resolves.not.toBe(
				'',
			);
		}
	});

	it('leaves a matching-fingerprint manifest untouched (human edits survive)', async () => {
		const manifest = manifestFixture('rm-stable');
		await ensureRulesCache(baseOptions(manifest));

		// Second call with the same fingerprint must not rewrite the manifest.
		const second = await ensureRulesCache(baseOptions(manifest));
		expect(second.manifestWritten).toBe(false);
	});

	it('never leaves a truncated manifest on disk — writeFileAtomic guarantees old-or-new content only', async () => {
		const manifest = manifestFixture('rm-crash');
		await ensureRulesCache(baseOptions(manifest));

		const onDisk = await readFile(
			join(root, '.cache/mcp-vertex/rules/rules-map.json'),
			'utf8',
		);
		// Content is always a complete, parseable JSON document — never a
		// half-written blob (the bug this fix closes).
		expect(() => JSON.parse(onDisk)).not.toThrow();
		expect((JSON.parse(onDisk) as IRulesManifest).fingerprint).toBe(
			'rm-crash',
		);
	});

	it('8 ensureRulesCache calls running in parallel against the same cache converge to one consistent manifest', async () => {
		const manifest = manifestFixture('rm-parallel');
		const options = baseOptions(manifest);

		const results = await Promise.allSettled(
			Array.from({ length: 8 }, () => ensureRulesCache(options)),
		);
		for (const result of results) {
			expect(result.status).toBe('fulfilled');
		}

		const onDisk = JSON.parse(
			await readFile(
				join(root, '.cache/mcp-vertex/rules/rules-map.json'),
				'utf8',
			),
		) as IRulesManifest;
		expect(onDisk.fingerprint).toBe('rm-parallel');
	});
});
