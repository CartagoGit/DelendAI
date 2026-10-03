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

import { withFileMutex, type LockContentionError } from '@delendai/core/public';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
// Test-only escape hatch: specs need an isolated scratch lock so they don't
// contend with (or deadlock behind) a real, concurrently-running agent's
// heavy compute against the actual repo lock file.
const LOCK_PATH =
	process.env.DELENDAI_TEST_COMPUTE_LOCK_PATH ??
	resolve(REPO_ROOT, '.cache/delendai/state/heavy-compute.lock');

// Generous: a waiter should outlast even a very slow `bun test`/`tsc`
// run by a peer rather than give up and run alongside it.
const WAIT_BUDGET_MS = 30 * 60 * 1000;
// A holder that stops heartbeating (crashed, killed -9) for this long is
// treated as abandoned and reclaimed. Comfortably longer than the
// heartbeat interval withFileMutex derives from it (staleMs / 3).
const STALE_MS = 5 * 60 * 1000;

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

// Fires only while we are still BLOCKED waiting for the lock — cleared the
// instant acquisition succeeds (start of runChild), so it can never fire
// late and falsely claim we waited when acquisition was actually instant.
let waited = false;
let waitNotice: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
	waited = true;
	console.error(
		`[with-compute-lock] "${lockName}" is waiting — another agent's heavy compute (test/typecheck/lint) is currently running. Waiting my turn...`,
	);
}, 1_000);

const runChild = (): Promise<number> => {
	clearTimeout(waitNotice);
	waitNotice = undefined;
	if (waited) {
		console.error(`[with-compute-lock] "${lockName}" got its turn.`);
	}
	return new Promise((resolvePromise, reject) => {
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
};

const main = async (): Promise<number> => {
	try {
		return await withFileMutex(LOCK_PATH, runChild, {
			timeoutMs: WAIT_BUDGET_MS,
			staleMs: STALE_MS,
		});
	} catch (error) {
		const contentionError = error as LockContentionError;
		if (contentionError?.code === 'lock-contention-budget-exceeded') {
			console.error(
				`[with-compute-lock] gave up waiting for "${lockName}" after ${WAIT_BUDGET_MS}ms — another agent has held heavy-compute this whole time. Try again shortly.`,
			);
			return 1;
		}
		throw error;
	} finally {
		if (waitNotice !== undefined) clearTimeout(waitNotice);
	}
};

process.exit(await main());
