/**
 * round-context-hash.spec.ts
 *
 * x00053 S1: the default `CORE_DOCS` constant in
 * `round-context-types.ts` was hardcoded to
 * `docs/mcp-vertex/proposals/index.json` after the index moved to
 * `.cache/mcp-vertex/proposals/index.json` (x00052). The hash helper
 * `computeCoreDocHashes` returns `'rh-missing'` when the path does
 * not resolve, so the default was silently always-missing — the
 * index's digest was frozen. The default now points at the cache
 * path; this test pins that as a regression guard.
 *
 * Acceptance:
 *   - with the cache-path index seeded, the default `CORE_DOCS`
 *     produces a real hash for the index, NOT `'rh-missing'`.
 *   - with the cache-path index absent, the default still produces
 *     `'rh-missing'` — we did not weaken the missing-file branch.
 *   - the production wiring in `index.ts:222` continues to override
 *     the default with `layout.proposalIndexFile` (covered by the
 *     e2e; here we only pin the default behaviour).
 */

import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
	existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CORE_DOCS } from '@mcp-vertex/proposals/lib/swarm/round-context-types';
import { computeCoreDocHashes } from '@mcp-vertex/proposals/lib/swarm/round-context-hash';

const INDEX_REL = '.cache/mcp-vertex/proposals/index.json';

describe('round-context CORE_DOCS default (x00053 S1)', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'round-context-hash-'));
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('default CORE_DOCS points at the cache-relative index (not docs/)', () => {
		expect(CORE_DOCS).toContain(INDEX_REL);
		expect(CORE_DOCS).not.toContain('docs/mcp-vertex/proposals/index.json');
	});

	it('hashes a real index file when it exists at the cache path (no rh-missing)', async () => {
		const dir = join(root, '.cache/mcp-vertex/proposals');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(root, INDEX_REL),
			JSON.stringify(
				{ generated_at: 'x', count: 0, proposals: [] },
				null,
				4,
			) + '\n',
		);
		// Also create README.md so the default `CORE_DOCS` has two
		// resolvable files; the assertion only cares about the index.
		writeFileSync(join(root, 'README.md'), '# root\n');

		const result = await computeCoreDocHashes(root);
		expect(result[INDEX_REL]).not.toBe('rh-missing');
		expect(result[INDEX_REL]).toMatch(/^rh-[0-9a-f]{16}$/);
		expect(existsSync(join(root, INDEX_REL))).toBe(true);
	});

	it('returns rh-missing for the index path when the file is absent (regression pin)', async () => {
		// No file seeded. The default CORE_DOCS points at the cache
		// path; the index is absent ⇒ the helper must return
		// 'rh-missing' for that key. This is the same behaviour the
		// pre-x00053 default had (against the old docs/ path) — we
		// only moved the path, not the fallback semantics.
		const result = await computeCoreDocHashes(root);
		expect(result[INDEX_REL]).toBe('rh-missing');
	});

	it('does NOT silently hash the legacy docs/ path (the regression we are guarding)', async () => {
		// Seed the OLD path (docs/) — the default CORE_DOCS must not
		// pick it up. If a future refactor reintroduces the old path
		// in `CORE_DOCS`, this test will fail because the result map
		// will not contain the cache key.
		const oldDir = join(root, 'docs/mcp-vertex/proposals');
		mkdirSync(oldDir, { recursive: true });
		writeFileSync(
			join(root, 'docs/mcp-vertex/proposals/index.json'),
			JSON.stringify({ proposals: [] }),
		);
		const result = await computeCoreDocHashes(root);
		expect(result['docs/mcp-vertex/proposals/index.json']).toBeUndefined();
		expect(result[INDEX_REL]).toBe('rh-missing');
	});
});
