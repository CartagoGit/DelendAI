/**
 * eviction-registry.spec.ts — f00068 slice A.
 *
 * Unit tests for `createCacheEvictionRegistry`. Every test runs
 * against a per-test temp directory so it never touches the real
 * `.cache/mcp-vertex/`. Coverage:
 *
 *   - validation (id/owner/path, workspace containment)
 *   - the four strategies (olderThanDays, olderThanMtimeDays,
 *     keepLastN, custom)
 *   - single-`*` glob expansion
 *   - idempotency (second run is a no-op when state is consistent)
 *   - error containment (one rule's failure does not abort the run)
 *   - `onlyOwner` filter
 *
 * The boot-sweep integration lives in `eviction-registry.boot.spec.ts`.
 */
import {
	mkdtemp,
	mkdir,
	rm,
	stat,
	utimes,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCacheEvictionRegistry } from '@mcp-vertex/core/lib/cache/eviction-registry';
import type {
	ICacheEvictionRegistry,
	ICacheEvictionRule,
} from '@mcp-vertex/core/public';

const NOW = new Date('2026-06-27T12:00:00Z');

const daysAgo = (now: Date, days: number): Date =>
	new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('createCacheEvictionRegistry', () => {
	let workspace: string;
	let cacheDir: string;
	let registry: ICacheEvictionRegistry;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'evict-test-'));
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

	describe('validation', () => {
		it('rejects rules with empty id', () => {
			expect(() =>
				registry.register({
					id: '',
					owner: 'x',
					path: 'logs',
					when: { kind: 'olderThanDays', days: 7 },
				}),
			).toThrow(/id is required/);
		});

		it('rejects rules with empty owner', () => {
			expect(() =>
				registry.register({
					id: 'r',
					owner: '',
					path: 'logs',
					when: { kind: 'olderThanDays', days: 7 },
				}),
			).toThrow(/owner is required/);
		});

		it('rejects rules with empty path', () => {
			expect(() =>
				registry.register({
					id: 'r',
					owner: 'x',
					path: '',
					when: { kind: 'olderThanDays', days: 7 },
				}),
			).toThrow(/path is required/);
		});

		it('rejects rules with an absolute path', () => {
			expect(() =>
				registry.register({
					id: 'evil',
					owner: 'x',
					path: '/etc/passwd',
					when: { kind: 'olderThanDays', days: 7 },
				}),
			).toThrow(/must be cache-relative/);
		});

		it('rejects a `dir/*` glob whose base escapes the workspace', () => {
			// Construct a workspace where cacheDir sits deep enough that
			// `../../../etc` would exit the workspace.
			// Because cacheDir in tests is `<workspace>/.cache/mcp-vertex`,
			// `../..` resolves to `.cache/` (still inside). Use enough
			// `..` segments to climb past the workspace root.
			const tooDeep = '../../../etc/*';
			expect(() =>
				registry.register({
					id: 'ok',
					owner: 'x',
					path: tooDeep,
					when: { kind: 'olderThanDays', days: 7 },
				}),
			).toThrow(/escapes workspace/);
		});
	});

	describe('olderThanDays', () => {
		it('removes entries whose name encodes an old date', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, '2026-06-01.jsonl'), 'old\n');
			await writeFile(join(logsDir, '2026-06-26.jsonl'), 'recent\n');

			registry.register({
				id: 'logs',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'olderThanDays', days: 7 },
			});

			const dry = await registry.run({ dryRun: true, now: NOW });
			expect(dry.dryRun).toBe(true);
			expect(dry.removed).toHaveLength(1);
			expect(dry.removed[0]?.path).toBe('logs/2026-06-01.jsonl');

			// File still there after dry-run.
			expect(
				(await stat(join(logsDir, '2026-06-01.jsonl'))).isFile(),
			).toBe(true);

			const applied = await registry.run({ dryRun: false, now: NOW });
			expect(applied.removed).toHaveLength(1);
			await expect(stat(join(logsDir, '2026-06-01.jsonl'))).rejects.toThrow();
		});

		it('falls back to mtime when the name has no date', async () => {
			const dir = join(cacheDir, 'snapshots');
			await mkdir(dir, { recursive: true });
			const f = join(dir, 'no-date.json');
			await writeFile(f, 'old\n');
			await utimes(f, daysAgo(NOW, 30), daysAgo(NOW, 30));

			registry.register({
				id: 'snapshots',
				owner: 'cache',
				path: 'snapshots/*',
				when: { kind: 'olderThanDays', days: 14 },
			});

			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed.map((r) => r.path)).toContain('snapshots/no-date.json');
		});

		it('skips targets that are within the TTL', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, '2026-06-25.jsonl'), 'recent\n');

			registry.register({
				id: 'logs',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'olderThanDays', days: 7 },
			});
			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed).toHaveLength(0);
			expect(report.skipped).toHaveLength(0);
		});
	});

	describe('olderThanMtimeDays', () => {
		it('removes entries by mtime regardless of name', async () => {
			const f = join(cacheDir, 'snap.json');
			await writeFile(f, '{"k":1}');
			await utimes(f, daysAgo(NOW, 60), daysAgo(NOW, 60));

			registry.register({
				id: 'mtime',
				owner: 'cache',
				path: 'snap.json',
				when: { kind: 'olderThanMtimeDays', days: 30 },
			});

			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed.map((r) => r.path)).toContain('snap.json');
		});
	});

	describe('keepLastN', () => {
		it('keeps the most-recent N entries by mtime, removes the rest', async () => {
			const dir = join(cacheDir, 'state');
			await mkdir(dir, { recursive: true });
			for (let i = 0; i < 5; i++) {
				const f = join(dir, `${i}.jsonl`);
				await writeFile(f, `${i}\n`);
				await utimes(f, daysAgo(NOW, 5 - i), daysAgo(NOW, 5 - i));
			}

			registry.register({
				id: 'state-journal',
				owner: 'cache',
				path: 'state',
				when: { kind: 'keepLastN', n: 2 },
			});

			const dry = await registry.run({ dryRun: true, now: NOW });
			// Newest are `4.jsonl` (today) and `3.jsonl` (yesterday); the
			// other three should be flagged for removal.
			expect(dry.removed.map((r) => r.path).sort()).toEqual([
				'state/0.jsonl',
				'state/1.jsonl',
				'state/2.jsonl',
			]);
			expect(dry.totalBytes).toBeGreaterThan(0);

			await registry.run({ dryRun: false, now: NOW });
			const survivors = (await stat(dir)).isDirectory()
				? (await import('node:fs/promises')).readdir(dir)
				: [];
			expect((await survivors).sort()).toEqual(['3.jsonl', '4.jsonl']);
		});

		it('is a no-op when there are fewer than N entries', async () => {
			const dir = join(cacheDir, 'state');
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, 'only.jsonl'), 'one\n');

			registry.register({
				id: 'state-journal',
				owner: 'cache',
				path: 'state',
				when: { kind: 'keepLastN', n: 5 },
			});

			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed).toHaveLength(0);
		});

		it('skips a non-directory target', async () => {
			await writeFile(join(cacheDir, 'not-a-dir'), 'x');

			registry.register({
				id: 'state-journal',
				owner: 'cache',
				path: 'not-a-dir',
				when: { kind: 'keepLastN', n: 1 },
			});

			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed).toHaveLength(0);
		});
	});

	describe('custom', () => {
		it('delegates deletion to the rule callback', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, 'a.jsonl'), 'a\n');
			await writeFile(join(logsDir, 'b.jsonl'), 'b\n');

			const seen: { dryRun: boolean; target: string }[] = [];
			registry.register({
				id: 'logs-gc',
				owner: 'logs',
				path: 'logs',
				when: {
					kind: 'custom',
					run: async (targetAbs, dryRun) => {
						seen.push({ dryRun, target: targetAbs });
						// Mimic logs.gc(): remove all jsonl files.
						const { readdir } = await import('node:fs/promises');
						const entries = await readdir(targetAbs);
						const out = entries
							.filter((e) => e.endsWith('.jsonl'))
							.map((e) => join(targetAbs, e));
						if (!dryRun) {
							const { rm } = await import('node:fs/promises');
							for (const f of out) await rm(f);
						}
						return out;
					},
				},
			});

			await registry.run({ dryRun: true, now: NOW });
			await registry.run({ dryRun: false, now: NOW });

			expect(seen).toHaveLength(2);
			expect(seen[0]?.dryRun).toBe(true);
			expect(seen[1]?.dryRun).toBe(false);

			await expect(stat(join(logsDir, 'a.jsonl'))).rejects.toThrow();
			await expect(stat(join(logsDir, 'b.jsonl'))).rejects.toThrow();
		});
	});

	describe('single-`*` glob', () => {
		it('expands `dir/*` to every direct child of dir', async () => {
			const dir = join(cacheDir, 'worktrees');
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, 'a'), 'a');
			await writeFile(join(dir, 'b'), 'b');

			registry.register({
				id: 'worktree-orphans',
				owner: 'cache',
				path: 'worktrees/*',
				when: { kind: 'olderThanMtimeDays', days: 0 },
			});
			// Force every file's mtime to the past.
			await utimes(join(dir, 'a'), daysAgo(NOW, 5), daysAgo(NOW, 5));
			await utimes(join(dir, 'b'), daysAgo(NOW, 5), daysAgo(NOW, 5));

			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed.map((r) => r.path).sort()).toEqual([
				'worktrees/a',
				'worktrees/b',
			]);
		});

		it('reports a missing glob base as `no targets` (not an error)', async () => {
			registry.register({
				id: 'worktree-orphans',
				owner: 'cache',
				path: 'worktrees/*',
				when: { kind: 'olderThanMtimeDays', days: 0 },
			});
			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.removed).toHaveLength(0);
			expect(report.skipped.some((s) => /no targets/.test(s.reason))).toBe(true);
			expect(report.errors).toHaveLength(0);
		});
	});

	describe('idempotency', () => {
		it('a second run with the same state is a no-op', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, '2026-06-01.jsonl'), 'old\n');
			registry.register({
				id: 'logs',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'olderThanDays', days: 7 },
			});
			const first = await registry.run({ dryRun: false, now: NOW });
			expect(first.removed).toHaveLength(1);
			const second = await registry.run({ dryRun: false, now: NOW });
			expect(second.removed).toHaveLength(0);
			expect(second.skipped.some((s) => /no targets/.test(s.reason))).toBe(true);
		});
	});

	describe('error containment', () => {
		it('reports a per-rule error without aborting the rest', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, '2026-06-01.jsonl'), 'old\n');
			// Two rules: first targets a path that will throw at stat
			// (a file under cacheDir with a `keepLastN` rule expecting
			// a directory — see `runKeepLastN`'s no-op behaviour). To
			// really test error containment we use a rule whose path
			// is itself malformed at the FS layer: point at a path
			// under cacheDir that doesn't exist AND has no `*`, so
			// the strategy runs `stat()` on a missing file and throws.
			registry.register({
				id: 'bad',
				owner: 'cache',
				path: 'missing-file.json',
				when: { kind: 'olderThanDays', days: 7 },
			});
			registry.register({
				id: 'good',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'olderThanDays', days: 7 },
			});
			const report = await registry.run({ dryRun: false, now: NOW });
			expect(report.errors).toHaveLength(1);
			expect(report.errors[0]?.id).toBe('bad');
			expect(report.removed.map((r) => r.id)).toContain('good');
		});
	});

	describe('onlyOwner filter', () => {
		it('limits evaluation to the given owner', async () => {
			const logsDir = join(cacheDir, 'logs');
			await mkdir(logsDir, { recursive: true });
			await writeFile(join(logsDir, '2026-06-01.jsonl'), 'old\n');
			registry.register({
				id: 'logs-a',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'olderThanDays', days: 7 },
			});
			registry.register({
				id: 'cache-b',
				owner: 'cache',
				path: 'snapshots/*',
				when: { kind: 'olderThanMtimeDays', days: 7 },
			});
			const report = await registry.run({
				dryRun: false,
				now: NOW,
				onlyOwner: 'logs',
			});
			expect(report.rulesEvaluated).toBe(1);
			expect(report.removed.map((r) => r.id)).toEqual(['logs-a']);
		});
	});

	describe('unregister + list', () => {
		it('replaces by id (last-writer-wins)', () => {
			const rule: ICacheEvictionRule = {
				id: 'dup',
				owner: 'a',
				path: 'logs',
				when: { kind: 'olderThanDays', days: 1 },
			};
			registry.register(rule);
			registry.register({ ...rule, owner: 'b' });
			expect(registry.list()).toHaveLength(1);
			expect(registry.list()[0]?.owner).toBe('b');
		});

		it('unregister returns true for a known id and false otherwise', () => {
			registry.register({
				id: 'x',
				owner: 'a',
				path: 'logs',
				when: { kind: 'olderThanDays', days: 1 },
			});
			expect(registry.unregister('x')).toBe(true);
			expect(registry.unregister('x')).toBe(false);
			expect(registry.list()).toHaveLength(0);
		});
	});
});