import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	buildCloseSliceValidationProvider,
	selectManagedWorktrees,
} from '../../../../src/lib/swarm/validation-provider';
import type { IScopeMap } from '@delendai/quality/public';

const SCOPES: IScopeMap = {
	proposals: [{ command: 'echo scoped', expect: 'exit0' }],
	all: [{ command: 'echo full', expect: 'exit0' }],
};

const lock = (taskId: string, agent: string, file: string) => ({
	task_id: taskId,
	agent,
	ownership: [file],
	last_seen: new Date().toISOString(),
});

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

const BRANCHES = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
}).branches;
const UNIT_BRANCH =
	'delendai/wip/claude-sonnet-5-5/implement/x00871-S1-g1/a-topic';

describe('buildCloseSliceValidationProvider actor resolution', () => {
	let root = '';

	afterEach(() => {
		if (root !== '') rmSync(root, { recursive: true, force: true });
	});

	/** A repo whose checked-out branch is `branch`, with `inFlight` locks. */
	const setup = (
		inFlight: readonly unknown[],
		branch: string,
	): { readonly repo: string; readonly locks: string } => {
		root = mkdtempSync(join(tmpdir(), 'validation-actor-'));
		const repo = join(root, 'repo');
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
		git('init', '-q', '-b', branch);
		git('commit', '-q', '--allow-empty', '-m', 'init');
		writeFileSync(
			join(root, 'registry.json'),
			JSON.stringify({ assignments: [] }),
			'utf8',
		);
		const locks = join(root, 'locks.json');
		writeFileSync(locks, JSON.stringify({ in_flight: inFlight }), 'utf8');
		return { repo, locks };
	};

	const provide = (
		fixture: { readonly repo: string; readonly locks: string },
		environmentAgent?: string,
	) =>
		buildCloseSliceValidationProvider({
			workspaceRoot: fixture.repo,
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: fixture.locks,
			worktreesDirAbs: join(root, 'managed'),
			scopes: SCOPES,
			branches: BRANCHES,
			environmentAgent,
		});
	const close = {
		operation: 'close' as const,
		ownedFiles: ['plugins/proposals/src/lib/x.ts'],
		proposalId: 'x00871',
		sliceId: 'S1',
	};

	it("recognises a claim spelled proposal/slice as the caller's", async () => {
		const fixture = setup(
			[lock('x00871/S1', 'claude-sonnet-5-5', 'plugins/p/x.ts')],
			'develop',
		);
		const decision = await provide(fixture)({
			...close,
			agent: 'claude-sonnet-5-5',
		});
		expect(decision.mode).not.toBe('blocked');
		expect(decision.activeAgents).toBe(1);
	});

	it('lets the owner of the unit the checkout is on close without a claim', async () => {
		const fixture = setup([], UNIT_BRANCH);
		const decision = await provide(fixture)(close);
		expect(decision.mode).not.toBe('blocked');
	});

	it("does not count another agent's unit as the caller's proof", async () => {
		const fixture = setup([], UNIT_BRANCH);
		const decision = await provide(fixture)({
			...close,
			agent: 'someone-else',
		});
		expect(decision.mode).toBe('blocked');
		expect(decision.blockingReasons.join(' ')).toContain(
			'resolved actor: someone-else (from argument)',
		);
	});

	it('does not count a unit of another slice as proof', async () => {
		const fixture = setup([], UNIT_BRANCH);
		const decision = await provide(fixture)({ ...close, sliceId: 'S2' });
		expect(decision.mode).toBe('blocked');
	});

	it('resolves the actor from the environment when no agent is passed', async () => {
		const fixture = setup(
			[lock('x00871-S1', 'claude-sonnet-5-5', 'plugins/p/x.ts')],
			'develop',
		);
		const decision = await provide(fixture, 'claude-sonnet-5-5')(close);
		expect(decision.mode).not.toBe('blocked');
	});

	it('names the actor, the claim state and the files it read when it refuses', async () => {
		const fixture = setup([], 'develop');
		const decision = await provide(fixture)(close);
		expect(decision.mode).toBe('blocked');
		const reasons = decision.blockingReasons.join('\n');
		expect(reasons).toContain('resolved actor: none');
		expect(reasons).toContain('claim for x00871-S1: none');
		expect(reasons).toContain(fixture.locks);
	});

	it('says a stale claim is stale rather than missing', async () => {
		const fixture = setup(
			[
				{
					...lock('x00871/S1', 'owl', 'plugins/p/x.ts'),
					last_seen: '2020-01-01T00:00:00.000Z',
				},
			],
			'develop',
		);
		const decision = await provide(fixture)({ ...close, agent: 'owl' });
		expect(decision.mode).toBe('blocked');
		expect(decision.blockingReasons.join('\n')).toContain(
			'claim for x00871-S1: stale (held by owl)',
		);
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
