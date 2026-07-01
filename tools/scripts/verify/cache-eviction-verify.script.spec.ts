/**
 * cache-eviction-verify.script.spec.ts — f00072 S6.
 *
 * Drives the pure engine `runEvictionDemonstration` against an injected
 * temp cache (never the real `.cache/mcp-vertex/`), so the verifier's
 * acceptance is itself unit-tested: ≥4 evictable on dry-run, apply
 * shrinks the cache, second apply is a no-op.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	MIN_EVICTABLE,
	formatReport,
	runEvictionDemonstration,
} from './cache-eviction-verify.script';

describe('runEvictionDemonstration (f00072 S6)', () => {
	let workspace: string;
	let cacheRoot: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'cache-evict-spec-'));
		cacheRoot = join(workspace, '.cache/mcp-vertex');
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('reports ≥4 evictable on dry-run, shrinks on apply, and is idempotent', async () => {
		const now = new Date('2026-06-27T12:00:00Z');
		const result = await runEvictionDemonstration(
			workspace,
			cacheRoot,
			now,
		);

		expect(result.ok).toBe(true);
		expect(result.previewed).toBeGreaterThanOrEqual(MIN_EVICTABLE);
		expect(result.applied).toBe(result.previewed);
		expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
		expect(result.secondApply).toBe(0);
		expect(result.failures).toEqual([]);
	});

	it('formatReport renders a pass banner when ok', async () => {
		const now = new Date('2026-06-27T12:00:00Z');
		const result = await runEvictionDemonstration(
			workspace,
			cacheRoot,
			now,
		);
		const text = formatReport(result);
		expect(text).toContain('cache-eviction-verify (f00072 S6)');
		expect(text).toContain('✓ cache eviction demonstration passed.');
	});
});
