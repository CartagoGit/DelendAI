#!/usr/bin/env bun
/**
 * git-stale-lock.script.ts
 *
 * Detects and optionally reclaims a stale `.git/index.lock` left by a
 * killed git process. The lock is git's serialiser for index writes
 * (`git add`, `git commit`, `git merge`, `git rebase`, …) and is
 * removed by the writer on a clean exit. Crashes, `kill -9`, and a
 * remote VSCode killing its `git status` subprocess between calls
 * can leave the lock behind; subsequent `git add` then fails with
 * `Unable to create '.git/index.lock': File exists.` and the swarm
 * push-scheduler loops indefinitely refusing to commit.
 *
 * This lint treats a lock as STALE only when:
 *   1. No live git/another-git process holds it (`fuser`/`lsof`
 *      both report no PIDs); AND
 *   2. The lock file's mtime is older than the configured grace
 *      period (default 30s — generous enough that any genuine git
 *      command mid-flight won't be reclaimed).
 *
 * By default it is dry-run (reports + non-zero exit if stale).
 * Pass `--reclaim` to actually remove the stale lock.
 *
 * Usage:
 *   bun tools/scripts/lint/git-stale-lock.script.ts
 *   bun tools/scripts/lint/git-stale-lock.script.ts --reclaim
 *   bun tools/scripts/lint/git-stale-lock.script.ts --grace-ms=60000
 *
 * Exit codes:
 *   0 — no stale lock (or successfully reclaimed with --reclaim)
 *   1 — stale lock detected (no --reclaim)
 *   2 — invocation / IO error
 *
 * Reaper entry point: this script also runs as part of the commit
 * pre-flight so a single `git add` failure can self-heal.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths.ts';

const DEFAULT_GRACE_MS = 30_000;

interface IFlags {
	readonly reclaim: boolean;
	readonly graceMs: number;
}

export const parseFlags = (argv: readonly string[]): IFlags => {
	let reclaim = false;
	let graceMs = DEFAULT_GRACE_MS;
	for (const arg of argv) {
		if (arg === '--reclaim') {
			reclaim = true;
			continue;
		}
		if (arg.startsWith('--grace-ms=')) {
			const value = Number(arg.slice('--grace-ms='.length));
			if (Number.isFinite(value) && value >= 0) graceMs = value;
		}
	}
	return { reclaim, graceMs };
};

export const livePidHoldsLock = (lockPath: string): readonly number[] => {
	// `fuser` returns the PIDs of processes using the file, one per
	// line, with a non-zero exit if none. Some distros ship `fuser`
	// without the file-list output — fall back to `lsof -t`.
	try {
		const result = spawnSync('fuser', [lockPath], { encoding: 'utf8' });
		if (result.status === 0) {
			return (result.stdout ?? '')
				.split(/\s+/)
				.filter((s) => /^\d+$/.test(s))
				.map((s) => Number(s));
		}
	} catch {
		// fall through to lsof
	}
	try {
		const result = spawnSync('lsof', ['-t', lockPath], {
			encoding: 'utf8',
		});
		if (result.status === 0) {
			return (result.stdout ?? '')
				.split('\n')
				.map((s) => s.trim())
				.filter((s) => /^\d+$/.test(s))
				.map((s) => Number(s));
		}
	} catch {
		return [];
	}
	return [];
};

const main = (): void => {
	const flags = parseFlags(process.argv.slice(2));
	const rootDir = repoRoot();
	const lockPath = join(rootDir, '.git', 'index.lock');
	if (!existsSync(lockPath)) {
		console.log('[git-stale-lock] OK — no .git/index.lock present.');
		return;
	}
	const stat = statSync(lockPath);
	const ageMs = Date.now() - stat.mtimeMs;
	if (ageMs < flags.graceMs) {
		console.log(
			`[git-stale-lock] fresh — lock is ${Math.round(ageMs)}ms old (grace ${flags.graceMs}ms). Leaving alone.`,
		);
		return;
	}
	const livePids = livePidHoldsLock(lockPath);
	if (livePids.length > 0) {
		console.log(
			`[git-stale-lock] held — lock is ${Math.round(ageMs)}ms old but ${livePids.length} live process(es) hold it (pids: ${livePids.join(', ')}). Leaving alone.`,
		);
		return;
	}
	if (flags.reclaim) {
		try {
			execFileSync('rm', ['-f', lockPath], { stdio: 'ignore' });
			console.log(
				`[git-stale-lock] RECLAIMED stale lock (age ${Math.round(ageMs)}ms, no live holder).`,
			);
			return;
		} catch (err) {
			console.error(
				`[git-stale-lock] failed to remove stale lock: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(2);
		}
	}
	console.error(
		`[git-stale-lock] STALE — .git/index.lock is ${Math.round(ageMs)}ms old, no live holder. Run \`bun run lint:git-stale-lock -- --reclaim\` to remove it, or invoke with --reclaim.`,
	);
	process.exit(1);
};

if (import.meta.main) {
	main();
}
