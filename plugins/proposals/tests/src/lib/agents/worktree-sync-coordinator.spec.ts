/**
 * worktree-sync-coordinator.spec.ts — r00003 S10 (CONC-1, S + D).
 *
 * The coordinator serializes a `git worktree add` against a concurrent
 * `syncProposalRegistry.run()` by sharing a single `withFileMutex` lock
 * keyed on the registry index path. These specs prove:
 *
 *   - the file-mutex coordinator and a registry-sync that hold the SAME
 *     lock path never interleave (no stale index read mid-worktree-add);
 *   - the pass-through coordinator runs work directly (no lock);
 *   - `resolveWorktreeSyncCoordinator` picks the right one from the path.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withFileMutex } from '@mcp-vertex/core/public';

import {
	createFileMutexWorktreeCoordinator,
	createPassthroughWorktreeCoordinator,
	resolveWorktreeSyncCoordinator,
} from '../../../../src/lib/agents/worktree-sync-coordinator';

let workspace: string;
let registryPath: string;

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'wt-coord-'));
	registryPath = join(workspace, 'index.json');
});

afterEach(async () => {
	await rm(workspace, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

describe('createPassthroughWorktreeCoordinator', () => {
	it('runs the work directly and returns its result', async () => {
		const coord = createPassthroughWorktreeCoordinator();
		const result = await coord.runExclusive(async () => 42);
		expect(result).toBe(42);
	});
});

describe('createFileMutexWorktreeCoordinator — serialization', () => {
	it('serializes a worktree mutation against a registry sync on the same lock', async () => {
		const coord = createFileMutexWorktreeCoordinator(registryPath);
		const events: string[] = [];

		// The "worktree add": enters its critical section, lingers, exits.
		const worktreeAdd = coord.runExclusive(async () => {
			events.push('worktree:enter');
			await sleep(40);
			events.push('worktree:exit');
		});

		// A concurrent "registry sync" takes the SAME mutex path. Without
		// shared exclusion it would read mid-add; with it, it must wait for
		// the worktree mutation to fully complete first (or vice versa).
		const registrySync = (async () => {
			// Let the worktree add grab the lock first.
			await sleep(5);
			await withFileMutex(registryPath, async () => {
				events.push('registry:enter');
				await sleep(10);
				events.push('registry:exit');
			});
		})();

		await Promise.all([worktreeAdd, registrySync]);

		// The two critical sections must NOT interleave: every event of one
		// section appears before any event of the other.
		const worktreeExit = events.indexOf('worktree:exit');
		const registryEnter = events.indexOf('registry:enter');
		expect(worktreeExit).toBeLessThan(registryEnter);
		expect(events).toEqual([
			'worktree:enter',
			'worktree:exit',
			'registry:enter',
			'registry:exit',
		]);
	});
});

describe('resolveWorktreeSyncCoordinator', () => {
	it('returns a pass-through coordinator when no registry path is given', async () => {
		const coord = resolveWorktreeSyncCoordinator(undefined);
		// Pass-through has no lock, so two overlapping runs CAN interleave.
		const events: string[] = [];
		await Promise.all([
			coord.runExclusive(async () => {
				events.push('a:enter');
				await sleep(20);
				events.push('a:exit');
			}),
			coord.runExclusive(async () => {
				await sleep(5);
				events.push('b:enter');
				events.push('b:exit');
			}),
		]);
		// b runs while a is still inside its section → interleaving proves
		// there is no lock.
		expect(events.indexOf('b:enter')).toBeLessThan(
			events.indexOf('a:exit'),
		);
	});

	it('returns a file-mutex coordinator when a registry path is given', async () => {
		const coord = resolveWorktreeSyncCoordinator(registryPath);
		const result = await coord.runExclusive(async () => 'locked');
		expect(result).toBe('locked');
	});
});
