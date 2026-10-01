import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildCloseSliceValidationProvider,
	selectManagedWorktrees,
} from '../../../../src/lib/swarm/validation-provider';
import type { IScopeMap } from '@delendai/quality/public';

const SCOPES: IScopeMap = {
	proposals: [{ command: 'echo scoped', expect: 'exit0' }],
	all: [{ command: 'echo full', expect: 'exit0' }],
};

describe('buildCloseSliceValidationProvider (f00386 S2)', () => {
	let root = '';

	afterEach(() => {
		if (root !== '') rmSync(root, { recursive: true, force: true });
	});

	const setup = (inFlight: readonly unknown[]): string => {
		root = mkdtempSync(join(tmpdir(), 'validation-provider-'));
		writeFileSync(
			join(root, 'registry.json'),
			JSON.stringify({ assignments: [] }),
			'utf8',
		);
		writeFileSync(
			join(root, 'locks.json'),
			JSON.stringify({ in_flight: inFlight }),
			'utf8',
		);
		return root;
	};

	const lock = (taskId: string, agent: string, file: string) => ({
		task_id: taskId,
		agent,
		ownership: [file],
		last_seen: new Date().toISOString(),
	});

	it('resolves scoped while another actor holds an active lock', async () => {
		const rootPath = setup([
			lock('f00386-S3', 'owl', 'plugins/proposals/src/lib/x.ts'),
			lock('f00386-S2', 'falcon', 'plugins/demo/src/index.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('scoped');
		expect(decision.resolvedScopes).toEqual(['proposals']);
		expect(decision.activeAgents).toBe(2);
		expect(decision.snapshotId).not.toBe('');
	});

	it('requires the full gate when this close is the last active actor', async () => {
		const rootPath = setup([
			lock('f00386-S3', 'owl', 'plugins/proposals/src/lib/x.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('full');
		expect(decision.resolvedScopes).toEqual(['all']);
		expect(decision.activeAgents).toBe(1);
	});

	it('blocks when the current actor cannot be proven active', async () => {
		const rootPath = setup([
			lock('f00386-S2', 'falcon', 'plugins/demo/src/index.ts'),
		]);
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: rootPath,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: rootPath,
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('blocked');
		expect(decision.blockingReasons.join(' ')).toMatch(
			/not provably active|active current actor/i,
		);
	});

	it('does not block the close while a detached scratch worktree exists', async () => {
		const rootPath = setup([
			lock('f00386-S3', 'owl', 'plugins/proposals/src/lib/x.ts'),
			lock('f00386-S2', 'falcon', 'plugins/demo/src/index.ts'),
		]);
		const repo = join(rootPath, 'repo');
		mkdirSync(repo);
		const git = (...args: string[]): void => {
			execFileSync(
				'git',
				[
					'-c',
					'user.name=t',
					'-c',
					'user.email=t@example.com',
					'-c',
					'commit.gpgsign=false',
					...args,
				],
				{ cwd: repo, stdio: 'ignore' },
			);
		};
		git('init', '-q');
		git('commit', '-q', '--allow-empty', '-m', 'init');
		git('worktree', 'add', '-q', '--detach', join(rootPath, 'scratch'));
		const provider = buildCloseSliceValidationProvider({
			workspaceRoot: repo,
			registryPathAbs: join(rootPath, 'registry.json'),
			lockPathAbs: join(rootPath, 'locks.json'),
			worktreesDirAbs: join(rootPath, 'managed'),
			scopes: SCOPES,
		});
		const decision = await provider({
			operation: 'close',
			ownedFiles: ['plugins/proposals/src/lib/x.ts'],
			proposalId: 'f00386',
			sliceId: 's3',
		});
		expect(decision.mode).toBe('scoped');
	});
});

describe('selectManagedWorktrees', () => {
	const managed = {
		worktreesDirAbs: '/repo/.cache/worktrees',
		branchPrefixes: ['delendai/wip/'],
	};

	it('keeps worktrees under the managed directory or on a swarm branch', () => {
		const underDir = { path: '/repo/.cache/worktrees/a' };
		const onBranch = { path: '/elsewhere/b', branch: 'delendai/wip/x/y' };
		expect(selectManagedWorktrees([underDir, onBranch], managed)).toEqual([
			underDir,
			onBranch,
		]);
	});

	it('ignores a scratch checkout, a sibling directory and an unrelated branch', () => {
		expect(
			selectManagedWorktrees(
				[
					{ path: '/tmp/candidate-refresh-1' },
					{ path: '/repo/.cache/worktrees-other/c' },
					{ path: '/repo', branch: 'develop' },
				],
				managed,
			),
		).toEqual([]);
	});
});
