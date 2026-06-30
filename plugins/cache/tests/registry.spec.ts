/**
 * registry.spec.ts — f00072 S2/S5.
 *
 * Tests the cache plugin's static rule set against a REAL core
 * eviction registry over a per-test temp cache (never the real
 * `.cache/mcp-vertex/`). Coverage:
 *
 *   - `buildStaticRules` shape + `maxAgeDays` cap + worktrees toggle
 *   - registration into the core registry (every rule is contained)
 *   - end-to-end eviction: dry-run reports, apply removes, second
 *     apply is a no-op (idempotent)
 *   - the S5 worktree-orphan sweeper keeps the most-recent N
 */
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCacheEvictionRegistry } from '@mcp-vertex/core/lib/cache/eviction-registry';
import type { ICacheEvictionRegistry } from '@mcp-vertex/core/public';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerStaticRules } from '../src/lib/registry';
import { buildStaticRules, CACHE_OWNER } from '../src/lib/static-rules';

const NOW = new Date('2026-06-27T12:00:00Z');
const daysAgo = (days: number): Date =>
	new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

/** Write a file and back-date its mtime to `days` ago. */
const seedFile = async (
	abs: string,
	days: number,
	content = 'x',
): Promise<void> => {
	await writeFile(abs, content);
	const when = daysAgo(days);
	await utimes(abs, when, when);
};

const seedDir = async (abs: string, days: number): Promise<void> => {
	await mkdir(abs, { recursive: true });
	const when = daysAgo(days);
	await utimes(abs, when, when);
};

describe('buildStaticRules', () => {
	it('declares a rule for every one-shot snapshot dir + state + worktrees', () => {
		const ids = buildStaticRules().map((r) => r.id);
		expect(ids).toContain('drift-snapshots');
		expect(ids).toContain('bootstrap-snapshots');
		expect(ids).toContain('verify-snapshots');
		expect(ids).toContain('s3-driver-snapshots');
		expect(ids).toContain('s4-s5-driver-snapshots');
		expect(ids).toContain('rules-snapshots');
		expect(ids).toContain('state-journal-roll');
		expect(ids).toContain('cache-worktrees-orphans');
	});

	it('stamps every rule with the cache owner', () => {
		for (const rule of buildStaticRules()) {
			expect(rule.owner).toBe(CACHE_OWNER);
		}
	});

	it('caps olderThanDays lifetimes at maxAgeDays', () => {
		const rules = buildStaticRules({ maxAgeDays: 5 });
		for (const rule of rules) {
			if (rule.when.kind === 'olderThanDays') {
				expect(rule.when.days).toBeLessThanOrEqual(5);
			}
		}
	});

	it('honours the worktrees toggle and keepLastN', () => {
		const disabled = buildStaticRules({ worktrees: { enabled: false } });
		const wt = disabled.find((r) => r.id === 'cache-worktrees-orphans');
		expect(wt?.enabled).toBe(false);

		const tuned = buildStaticRules({ worktrees: { keepLastN: 1 } });
		const wt2 = tuned.find((r) => r.id === 'cache-worktrees-orphans');
		expect(wt2?.when).toEqual({ kind: 'keepLastN', n: 1 });
	});
});

describe('registerStaticRules + end-to-end eviction', () => {
	let workspace: string;
	let cacheDir: string;
	let registry: ICacheEvictionRegistry;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'cache-plugin-test-'));
		cacheDir = join(workspace, '.cache/mcp-vertex');
		await mkdir(cacheDir, { recursive: true });
		registry = createCacheEvictionRegistry({
			workspaceRootAbs: workspace,
			cacheDirAbs: cacheDir,
		});
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('registers every static rule without a containment error', () => {
		const ids = registerStaticRules(registry);
		expect(
			registry
				.list()
				.map((r) => r.id)
				.sort(),
		).toEqual([...ids].sort());
	});

	it('dry-run reports evictable entries, apply removes them, second apply is a no-op', async () => {
		// Seed stale + fresh artefacts across several owned directories.
		await mkdir(join(cacheDir, 'drift'), { recursive: true });
		await seedFile(join(cacheDir, 'drift', 'old.json'), 30); // > 14d → evict
		await seedFile(join(cacheDir, 'drift', 'recent.json'), 1); // keep
		await mkdir(join(cacheDir, 's3-driver'), { recursive: true });
		await seedFile(join(cacheDir, 's3-driver', 'snap.json'), 20); // > 7d → evict

		registerStaticRules(registry);

		const dry = await registry.run({ dryRun: true, now: NOW });
		expect(dry.dryRun).toBe(true);
		const dryPaths = dry.removed.map((r) => r.path);
		expect(dryPaths).toContain('drift/old.json');
		expect(dryPaths).toContain('s3-driver/snap.json');
		expect(dryPaths).not.toContain('drift/recent.json');

		const apply = await registry.run({ dryRun: false, now: NOW });
		expect(apply.removed.length).toBe(dry.removed.length);
		expect(apply.errors).toEqual([]);

		// Second apply over the now-clean cache removes nothing.
		const again = await registry.run({ dryRun: false, now: NOW });
		expect(again.removed).toEqual([]);
		expect(again.totalBytes).toBe(0);
	});

	it('worktree-orphan sweeper keeps the most-recent N by mtime', async () => {
		const wt = join(cacheDir, '.worktrees');
		await seedDir(join(wt, 'agent-old'), 10);
		await seedDir(join(wt, 'agent-mid'), 5);
		await seedDir(join(wt, 'agent-new'), 1);

		registerStaticRules(registry, { worktrees: { keepLastN: 1 } });

		const report = await registry.run({
			dryRun: false,
			onlyOwner: CACHE_OWNER,
			now: NOW,
		});
		const removed = report.removed.map((r) => r.path).sort();
		// keepLastN=1 keeps `agent-new`, evicts the two older worktrees.
		expect(removed).toEqual([
			'.worktrees/agent-mid',
			'.worktrees/agent-old',
		]);
	});
});
