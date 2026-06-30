#!/usr/bin/env bun
/**
 * cache-eviction-verify.script.ts — f00072 S6 (delivery_verifier gate).
 *
 * Demonstrates, end-to-end, that the opt-in `@mcp-vertex/cache` plugin's
 * static rules actually evict and that a second apply is a no-op:
 *
 *   1. Seed a TEMP cache (never the real `.cache/mcp-vertex/`, per R3)
 *      with the artefacts the static rules target: stale one-shot
 *      snapshots, stale driver snapshots, an orphan worktree.
 *   2. `dryRun: true` reports AT LEAST 4 evictable items (the umbrella's
 *      operational acceptance: ≥1 worktree orphan, ≥2 driver snapshots,
 *      ≥1 drift snapshot).
 *   3. `dryRun: false` removes them and the cache shrinks on disk.
 *   4. A second `dryRun: false` removes nothing (idempotent).
 *
 * Architecture mirrors `no-shell-python.script.ts`:
 *   - `IEvictionVerifyResult` (interface) — the demonstration outcome.
 *   - `runEvictionDemonstration(root)` (pure engine) — seeds, runs,
 *     measures; returns the result. No `process.exit`, no argv.
 *   - `formatReport(result)` (pure formatter) — human-readable text.
 *   - `main()` (CLI shell) — owns the temp dir + exit code.
 *
 * Pure over its input root, so the spec drives the engine against an
 * injected temp directory without booting a server or touching argv.
 */
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCacheEvictionRegistry } from '@mcp-vertex/core/public';
import { buildStaticRules } from '@mcp-vertex/cache/public';

/** The minimum number of evictable items the dry-run MUST report. */
export const MIN_EVICTABLE = 4;

export interface IEvictionVerifyResult {
	readonly ok: boolean;
	/** Items the dry-run reported as evictable. */
	readonly previewed: number;
	/** Items the apply actually removed. */
	readonly applied: number;
	/** Items a SECOND apply removed (must be 0 for idempotency). */
	readonly secondApply: number;
	/** Cache byte size before / after the apply. */
	readonly bytesBefore: number;
	readonly bytesAfter: number;
	/** Human-readable failures (empty when ok). */
	readonly failures: readonly string[];
}

const daysAgo = (now: Date, days: number): Date =>
	new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const seedFile = async (
	abs: string,
	when: Date,
	content: string,
): Promise<void> => {
	await writeFile(abs, content);
	await utimes(abs, when, when);
};

const seedDir = async (abs: string, when: Date): Promise<void> => {
	await mkdir(abs, { recursive: true });
	await utimes(abs, when, when);
};

/** Recursively sum file sizes under a directory (0 when absent). */
const dirBytes = async (abs: string): Promise<number> => {
	const { readdir } = await import('node:fs/promises');
	let total = 0;
	let entries: Awaited<ReturnType<typeof readdir>>;
	try {
		entries = await readdir(abs, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const child = join(abs, entry.name);
		if (entry.isDirectory()) total += await dirBytes(child);
		else {
			try {
				total += (await stat(child)).size;
			} catch {
				// ignore — vanished mid-walk
			}
		}
	}
	return total;
};

/**
 * Seed a temp cache with rule-targeted artefacts and run the full
 * dry-run → apply → apply cycle. Pure over `cacheRoot` (the caller owns
 * the temp dir lifecycle). `now` is injectable for deterministic TTLs.
 */
export const runEvictionDemonstration = async (
	workspaceRoot: string,
	cacheRoot: string,
	now: Date = new Date(),
): Promise<IEvictionVerifyResult> => {
	await mkdir(cacheRoot, { recursive: true });

	// Stale one-shot snapshots (rule: olderThanDays 14) — drift.
	await mkdir(join(cacheRoot, 'drift'), { recursive: true });
	await seedFile(
		join(cacheRoot, 'drift', '2026-05-01.json'),
		daysAgo(now, 40),
		'{"stale":true}',
	);
	// Stale driver snapshots (rule: olderThanDays 7).
	await mkdir(join(cacheRoot, 's3-driver'), { recursive: true });
	await seedFile(
		join(cacheRoot, 's3-driver', 'snap-a.json'),
		daysAgo(now, 20),
		'{"a":1}',
	);
	await mkdir(join(cacheRoot, 's4-s5-driver'), { recursive: true });
	await seedFile(
		join(cacheRoot, 's4-s5-driver', 'snap-b.json'),
		daysAgo(now, 20),
		'{"b":2}',
	);
	// Orphan worktree (rule: keepLastN 3) — seed 4 so 1 is evicted.
	for (let i = 0; i < 4; i += 1) {
		await seedDir(
			join(cacheRoot, '.worktrees', `agent-${i}`),
			daysAgo(now, 30 - i),
		);
		await seedFile(
			join(cacheRoot, '.worktrees', `agent-${i}`, 'HEAD'),
			daysAgo(now, 30 - i),
			'ref\n',
		);
	}

	const registry = createCacheEvictionRegistry({
		workspaceRootAbs: workspaceRoot,
		cacheDirAbs: cacheRoot,
	});
	for (const rule of buildStaticRules({ worktrees: { keepLastN: 3 } })) {
		registry.register(rule);
	}

	const failures: string[] = [];

	const bytesBefore = await dirBytes(cacheRoot);
	const preview = await registry.run({ dryRun: true, now });
	const previewed = preview.removed.length;
	if (previewed < MIN_EVICTABLE) {
		failures.push(
			`dry-run reported ${previewed} evictable item(s), expected ≥ ${MIN_EVICTABLE}`,
		);
	}

	const apply = await registry.run({ dryRun: false, now });
	const applied = apply.removed.length;
	if (apply.errors.length > 0) {
		failures.push(
			`apply produced ${apply.errors.length} error(s): ${apply.errors
				.map((e) => `${e.id}:${e.error}`)
				.join('; ')}`,
		);
	}
	const bytesAfter = await dirBytes(cacheRoot);
	if (bytesAfter >= bytesBefore) {
		failures.push(
			`cache did not shrink: ${bytesBefore} → ${bytesAfter} bytes`,
		);
	}

	const second = await registry.run({ dryRun: false, now });
	const secondApply = second.removed.length;
	if (secondApply !== 0) {
		failures.push(
			`second apply removed ${secondApply} item(s); expected a no-op`,
		);
	}

	return {
		ok: failures.length === 0,
		previewed,
		applied,
		secondApply,
		bytesBefore,
		bytesAfter,
		failures,
	};
};

export const formatReport = (result: IEvictionVerifyResult): string => {
	const lines = [
		'cache-eviction-verify (f00072 S6)',
		`  dry-run evictable : ${result.previewed} (min ${MIN_EVICTABLE})`,
		`  applied removed   : ${result.applied}`,
		`  bytes             : ${result.bytesBefore} → ${result.bytesAfter}`,
		`  second apply      : ${result.secondApply} (expect 0)`,
	];
	if (result.ok) {
		lines.push('✓ cache eviction demonstration passed.');
	} else {
		lines.push('✖ cache eviction demonstration FAILED:');
		for (const f of result.failures) lines.push(`    - ${f}`);
	}
	return lines.join('\n');
};

const main = async (): Promise<number> => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), 'cache-evict-verify-'));
	const cacheRoot = join(workspaceRoot, '.cache/mcp-vertex');
	try {
		const result = await runEvictionDemonstration(workspaceRoot, cacheRoot);
		process.stdout.write(`${formatReport(result)}\n`);
		return result.ok ? 0 : 1;
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
	}
};

if (import.meta.main) {
	main().then((code) => process.exit(code));
}
