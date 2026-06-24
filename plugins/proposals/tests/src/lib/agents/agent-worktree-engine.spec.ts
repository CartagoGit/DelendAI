import { describe, expect, it } from 'vitest';

import {
	parseWorktreeList,
	runAgentWorktreeEngine,
} from '../../../../src/lib/agents/agent-worktree-engine';
import type {
	IGitRunResult,
	IGitRunner,
} from '../../../../src/lib/shared/git-runner';

const ok = (output = ''): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const recordingRunner = (
	handler: (args: readonly string[]) => IGitRunResult,
): { run: IGitRunner; calls: (readonly string[])[] } => {
	const calls: (readonly string[])[] = [];
	return {
		calls,
		run: async (args) => {
			calls.push(args);
			return handler(args);
		},
	};
};

describe('parseWorktreeList', async () => {
	it('parses branch, detached and locked entries', async () => {
		const raw = [
			'worktree /repo',
			'HEAD aaa111',
			'branch refs/heads/main',
			'',
			'worktree /repo/.worktrees/orion',
			'HEAD bbb222',
			'branch refs/heads/agent/orion',
			'',
			'worktree /repo/.worktrees/stale',
			'HEAD ccc333',
			'detached',
			'locked stale agent',
		].join('\n');

		const entries = parseWorktreeList(raw);

		expect(entries).toHaveLength(3);
		expect(entries[0]).toEqual({
			path: '/repo',
			head: 'aaa111',
			branch: 'main',
			detached: false,
			locked: false,
		});
		expect(entries[1]).toMatchObject({
			path: '/repo/.worktrees/orion',
			branch: 'agent/orion',
		});
		expect(entries[2]).toMatchObject({
			path: '/repo/.worktrees/stale',
			detached: true,
			locked: true,
		});
	});

	it('returns an empty array for empty output', async () => {
		expect(parseWorktreeList('')).toEqual([]);
	});
});

describe('runAgentWorktreeEngine — create', async () => {
	it('creates a new branch + worktree when neither exists', async () => {
		const { run, calls } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok('');
			if (args[0] === 'rev-parse') return fail('not a valid ref');
			if (args[0] === 'worktree' && args[1] === 'add') return ok('');
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});

		const result = await runAgentWorktreeEngine(
			{ action: 'create', agent: 'Orion' },
			{ run, workspaceRoot: '/repo' },
		);

		expect(result).toMatchObject({
			ok: true,
			action: 'create',
			branch: 'agent/orion',
			created: true,
		});
		expect(result.ok && result.action === 'create' ? result.path : '').toBe(
			'/repo/.worktrees/orion',
		);
		const addCall = calls.find(
			(c) => c[0] === 'worktree' && c[1] === 'add',
		);
		expect(addCall).toEqual([
			'worktree',
			'add',
			'-b',
			'agent/orion',
			'/repo/.worktrees/orion',
			'HEAD',
		]);
	});

	it('reuses an existing branch without -b', async () => {
		const { run, calls } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok('');
			if (args[0] === 'rev-parse') return ok('deadbeef');
			if (args[0] === 'worktree' && args[1] === 'add') return ok('');
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});

		await runAgentWorktreeEngine(
			{ action: 'create', agent: 'lyra' },
			{ run, workspaceRoot: '/repo' },
		);

		const addCall = calls.find(
			(c) => c[0] === 'worktree' && c[1] === 'add',
		);
		expect(addCall).toEqual([
			'worktree',
			'add',
			'/repo/.worktrees/lyra',
			'agent/lyra',
		]);
	});

	it('is idempotent: returns the existing worktree without calling add', async () => {
		const list = [
			'worktree /repo/.worktrees/vega',
			'HEAD aaa',
			'branch refs/heads/agent/vega',
		].join('\n');
		const { run, calls } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok(list);
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});

		const result = await runAgentWorktreeEngine(
			{ action: 'create', agent: 'vega' },
			{ run, workspaceRoot: '/repo' },
		);

		expect(result).toMatchObject({
			ok: true,
			created: false,
			branch: 'agent/vega',
		});
		expect(calls.some((c) => c[1] === 'add')).toBe(false);
	});

	it('rejects a missing agent name', async () => {
		const { run } = recordingRunner(() => ok(''));
		const result = await runAgentWorktreeEngine(
			{ action: 'create' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: false,
			action: 'create',
			reason: 'create requires "agent"',
		});
	});

	it('surfaces a git failure as a structured reason', async () => {
		const { run } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok('');
			if (args[0] === 'rev-parse') return fail('not a valid ref');
			return fail('fatal: branch already checked out');
		});
		const result = await runAgentWorktreeEngine(
			{ action: 'create', agent: 'orion' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: false,
			action: 'create',
			reason: 'fatal: branch already checked out',
		});
	});
});

describe('runAgentWorktreeEngine — remove', async () => {
	it('removes a worktree by agent name', async () => {
		const { run, calls } = recordingRunner(() => ok(''));
		const result = await runAgentWorktreeEngine(
			{ action: 'remove', agent: 'orion' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: true,
			action: 'remove',
			path: '/repo/.worktrees/orion',
			removed: true,
		});
		expect(calls[0]).toEqual([
			'worktree',
			'remove',
			'/repo/.worktrees/orion',
		]);
	});

	it('passes --force when requested', async () => {
		const { run, calls } = recordingRunner(() => ok(''));
		await runAgentWorktreeEngine(
			{ action: 'remove', agent: 'orion', force: true },
			{ run, workspaceRoot: '/repo' },
		);
		expect(calls[0]).toEqual([
			'worktree',
			'remove',
			'--force',
			'/repo/.worktrees/orion',
		]);
	});

	it('surfaces a refusal (e.g. dirty tree) as a structured reason', async () => {
		const { run } = recordingRunner(() =>
			fail('contains modified or untracked files'),
		);
		const result = await runAgentWorktreeEngine(
			{ action: 'remove', agent: 'orion' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: false,
			action: 'remove',
			reason: 'contains modified or untracked files',
		});
	});
});

describe('runAgentWorktreeEngine — list', async () => {
	it('returns parsed entries', async () => {
		const { run } = recordingRunner(() =>
			ok(
				['worktree /repo', 'HEAD aaa', 'branch refs/heads/main'].join(
					'\n',
				),
			),
		);
		const result = await runAgentWorktreeEngine(
			{ action: 'list' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: true,
			action: 'list',
			worktrees: [
				{
					path: '/repo',
					head: 'aaa',
					branch: 'main',
					detached: false,
					locked: false,
				},
			],
		});
	});

	it('surfaces a git failure', async () => {
		const { run } = recordingRunner(() =>
			fail('git is not available here'),
		);
		const result = await runAgentWorktreeEngine(
			{ action: 'list' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toEqual({
			ok: false,
			action: 'list',
			reason: 'git is not available here',
		});
	});
});

/**
 * r00003 S10 (CONC-1): the engine must route every `git worktree`
 * mutation through the injected `IWorktreeSyncCoordinator`, so a host can
 * serialize it against `syncProposalRegistry.run()`.
 */
describe('runAgentWorktreeEngine — sync coordinator (CONC-1)', async () => {
	it('runs `worktree add` INSIDE the injected coordinator (create)', async () => {
		const order: string[] = [];
		const { run } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok('');
			if (args[0] === 'rev-parse') return fail('not a valid ref');
			if (args[0] === 'worktree' && args[1] === 'add') {
				order.push('git:add');
				return ok('');
			}
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});

		const coordinator = {
			async runExclusive<T>(work: () => Promise<T>): Promise<T> {
				order.push('coordinator:enter');
				try {
					return await work();
				} finally {
					order.push('coordinator:exit');
				}
			},
		};

		await runAgentWorktreeEngine(
			{ action: 'create', agent: 'orion' },
			{ run, workspaceRoot: '/repo', coordinator },
		);

		// The git mutation must be strictly nested inside the coordinator.
		expect(order).toEqual([
			'coordinator:enter',
			'git:add',
			'coordinator:exit',
		]);
	});

	it('runs `worktree remove` INSIDE the injected coordinator', async () => {
		const order: string[] = [];
		const { run } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'remove') {
				order.push('git:remove');
				return ok('');
			}
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});
		const coordinator = {
			async runExclusive<T>(work: () => Promise<T>): Promise<T> {
				order.push('coordinator:enter');
				try {
					return await work();
				} finally {
					order.push('coordinator:exit');
				}
			},
		};

		await runAgentWorktreeEngine(
			{ action: 'remove', agent: 'orion' },
			{ run, workspaceRoot: '/repo', coordinator },
		);

		expect(order).toEqual([
			'coordinator:enter',
			'git:remove',
			'coordinator:exit',
		]);
	});

	it('the default (no coordinator, no registryMutexPath) is pass-through', async () => {
		// Behaviour must be byte-identical to direct git when nothing opts
		// into coordination.
		const { run, calls } = recordingRunner((args) => {
			if (args[0] === 'worktree' && args[1] === 'list') return ok('');
			if (args[0] === 'rev-parse') return ok('deadbeef');
			if (args[0] === 'worktree' && args[1] === 'add') return ok('');
			throw new Error(`unexpected git call: ${args.join(' ')}`);
		});
		const result = await runAgentWorktreeEngine(
			{ action: 'create', agent: 'lyra' },
			{ run, workspaceRoot: '/repo' },
		);
		expect(result).toMatchObject({ ok: true, created: true });
		expect(calls.some((c) => c[1] === 'add')).toBe(true);
	});
});
