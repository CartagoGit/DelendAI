#!/usr/bin/env bun
/**
 * with-compute-lock.script.ts
 *
 * Serializes heavy local compute (test / typecheck / lint) across
 * CONCURRENT agents in this swarm. Without this, N agents each running
 * `bun run test`/`bun run typecheck` at the same time spawn N sets of
 * vitest workers / tsc processes simultaneously and can starve the
 * machine's CPU and RAM — the machine has one set of cores regardless of
 * how many agents are "working" on it.
 *
 * Wraps the real command in `withFileMutex` against a single shared lock
 * file, so only one heavy-compute command runs at a time; everyone else
 * waits their turn. A live holder is never stolen from — the mutex's
 * heartbeat keeps refreshing for as long as the child process runs, no
 * matter how many minutes that takes — so a slow `bun test` never gets
 * preempted mid-run. A waiter just blocks (with a friendly heads-up
 * printed once) until the lock frees up.
 *
 * Usage:
 *   bun tools/scripts/lib/with-compute-lock.script.ts <lock-name> -- <shell command...>
 *
 * Everything after `--` is joined back into a single string and run
 * through the shell (so `&&`, pipes, etc. all work exactly like they did
 * in the un-wrapped script). <lock-name> is cosmetic (shown in the wait
 * message); every invocation shares the SAME underlying lock file
 * regardless of the name, because the point is to serialize ALL heavy
 * compute against every OTHER heavy compute, not just same-named
 * siblings (two agents running `test` and `typecheck` at once still
 * contend for the same CPU/RAM).
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import type { LockContentionError } from '@delendai/core/public';
import { computeSlotPath, withComputeSlot } from '@delendai/core/runtime';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
// Test-only escape hatch: specs need an isolated scratch lock so they don't
// contend with (or deadlock behind) a real, concurrently-running agent's
// heavy compute against the actual repo lock file.
const LOCK_PATH =
	process.env.DELENDAI_TEST_COMPUTE_LOCK_PATH ??
	// One slot per clone, shared by every worktree and by unit proofs.
	computeSlotPath(REPO_ROOT) ??
	resolve(REPO_ROOT, '.cache/delendai/state/heavy-compute.lock');

const args = process.argv.slice(2);
const sepIndex = args.indexOf('--');
if (sepIndex === -1 || sepIndex === args.length - 1) {
	console.error(
		'usage: with-compute-lock.script.ts <lock-name> -- <shell command...>',
	);
	process.exit(2);
}
const lockName = args.slice(0, sepIndex).join(' ') || 'heavy-compute';
const shellCommand = args.slice(sepIndex + 1).join(' ');

const runChild = (): Promise<number> =>
	new Promise((resolvePromise, reject) => {
		const child = spawn(shellCommand, {
			stdio: 'inherit',
			cwd: REPO_ROOT,
			shell: true,
		});
		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal !== null) {
				reject(new Error(`"${lockName}" killed by signal ${signal}`));
				return;
			}
			resolvePromise(code ?? 1);
		});
	});

const main = async (): Promise<number> => {
	try {
		return await withComputeSlot({
			lockPath: LOCK_PATH,
			label: lockName,
			run: runChild,
		});
	} catch (error) {
		const contentionError = error as LockContentionError;
		if (contentionError?.code === 'lock-contention-budget-exceeded') {
			console.error(
				`[with-compute-lock] gave up waiting for "${lockName}" — another agent has held heavy-compute this whole time. Try again shortly.`,
			);
			return 1;
		}
		throw error;
	}
};

process.exit(await main());
