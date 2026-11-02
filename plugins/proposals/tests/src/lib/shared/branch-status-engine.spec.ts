import { describe, expect, it } from 'vitest';

import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/proposals/lib/shared/git-runner';
import {
	type IBranchStatusOutcome,
	parseBranchList,
	parseStatusPorcelain,
	runBranchStatusEngine,
} from '@delendai/proposals/lib/shared/branch-status-engine';

/**
 * Hand-rolled stub runner: pick the result by inspecting the args. Keeps
 * the spec deterministic without spinning up a real git repo. Mirrors
 * the pattern used by `agent-worktree-engine.spec.ts`.
 */
const makeRunner = (
	script: ReadonlyArray<readonly [readonly string[], IGitRunResult]>,
	fallback: IGitRunResult = {
		ok: true,
		output: '',
	},
): IGitRunner => {
	const match = (args: readonly string[]): IGitRunResult | undefined => {
		for (const [expected, result] of script) {
			if (
				expected.length === args.length &&
				expected.every((token, i) => args[i] === token)
			) {
				return result;
			}
		}
		return undefined;
	};
	return (args) => Promise.resolve(match(args) ?? fallback);
};

const FIXED_NOW = Date.parse('2026-06-27T22:00:00.000Z');

describe('parseBranchList', () => {
	it('strips the current-branch marker and blank lines', () => {
		expect(
			parseBranchList(
				'  agent/orion\n* agent/main-current\n  agent/vela',
			),
		).toEqual(['agent/orion', 'agent/main-current', 'agent/vela']);
	});

	it('keeps branches marked as checked-out in another worktree (`+ ` prefix)', () => {
		expect(
			parseBranchList('+ agent/orion\n+ agent/vela\n* develop'),
		).toEqual(['agent/orion', 'agent/vela', 'develop']);
	});

	it('drops detached HEAD lines', () => {
		expect(
			parseBranchList('* (HEAD detached at abc1234)\n  agent/vela'),
		).toEqual(['agent/vela']);
	});

	it('returns empty array for empty input', () => {
		expect(parseBranchList('')).toEqual([]);
	});
});

describe('parseStatusPorcelain', () => {
	it('counts modified + untracked rows separately', () => {
		const sample = [
			' M plugins/foo.ts',
			' M plugins/bar.ts',
			'?? docs/new.md',
			'?? apps/web/src/env.d.ts',
			'A  staged.ts',
		].join('\n');
		expect(parseStatusPorcelain(sample)).toEqual({
			dirty: 3,
			untracked: 2,
		});
	});

	it('returns zeros for empty status', () => {
		expect(parseStatusPorcelain('')).toEqual({ dirty: 0, untracked: 0 });
	});
});

describe('runBranchStatusEngine', () => {
	const workspaceRoot = '/home/cartago/_projects/delendai';

	it('returns a structured failure when branch --list fails', async () => {
		const runner: IGitRunner = makeRunner([], {
			ok: false,
			output: '',
			reason: 'git not on PATH',
		});
		const result = (await runBranchStatusEngine({
			run: runner,
			workspaceRoot,
			baseBranch: 'develop',
			now: FIXED_NOW,
		})) as Extract<IBranchStatusOutcome, { ok: false }>;
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('git not on PATH');
		expect(result.baseBranch).toBe('develop');
	});

	it('returns a full snapshot with ahead/behind + dirty counts', async () => {
		const runner: IGitRunner = makeRunner([
			[
				['branch', '--list', 'agent/*'],
				{
					ok: true,
					output: '  agent/orion\n  agent/vela\n  agent/zora\n',
				},
			],
			[
				['worktree', 'list', '--porcelain'],
				{
					ok: true,
					output: [
						'worktree /home/cartago/_projects/delendai',
						'HEAD abc1234',
						'branch refs/heads/develop',
						'',
						'worktree /home/cartago/_projects/delendai/.cache/delendai/.worktrees/orion',
						'HEAD def5678',
						'branch refs/heads/agent/orion',
						'',
						'worktree /home/cartago/_projects/delendai/.cache/delendai/.worktrees/vela',
						'HEAD 9abc123',
						'branch refs/heads/agent/vela',
					].join('\n'),
				},
			],
			// orion worktree status (dirty)
			[
				['-C', '/orion-path', 'status', '--porcelain'],
				{
					ok: true,
					output: [' M orion/foo.ts', '?? orion/new.ts'].join('\n'),
				},
			],
			// vela worktree status (clean)
			[
				['-C', '/vela-path', 'status', '--porcelain'],
				{ ok: true, output: '' },
			],
		]);
		// Stub the long-tail calls (shortHead, rev-list, log, status per
		// worktree, age per worktree) with empty-but-ok responses.
		const tailRunner: IGitRunner = (args) => {
			const isRevList = args[0] === 'rev-list';
			const isLog = args[0] === 'log';
			if (isRevList) {
				// first column = behind, second = ahead
				if (args[3]?.startsWith('develop...agent/orion')) {
					return Promise.resolve({
						ok: true,
						output: '0\t2\n',
					});
				}
				if (args[3]?.startsWith('develop...agent/vela')) {
					return Promise.resolve({
						ok: true,
						output: '5\t0\n',
					});
				}
				if (args[3]?.startsWith('develop...agent/zora')) {
					return Promise.resolve({
						ok: true,
						output: '0\t0\n',
					});
				}
			}
			if (isLog)
				return Promise.resolve({ ok: true, output: '1735000000' });
			// Worktree status: pick by path arg.
			if (args[0] === '-C') {
				const path = args[1];
				if (path?.includes('orion')) {
					return Promise.resolve({
						ok: true,
						output: [' M orion/foo.ts', '?? orion/new.ts'].join(
							'\n',
						),
					});
				}
				if (path?.includes('vela')) {
					return Promise.resolve({ ok: true, output: '' });
				}
				return Promise.resolve({ ok: true, output: '' });
			}
			// shortHead for branches: just return a short hash.
			if (args[0] === 'rev-parse' && args[1] === '--short') {
				return Promise.resolve({ ok: true, output: 'abcdef0' });
			}
			// branch --merged
			if (args[0] === 'branch' && args.includes('--merged')) {
				const target = args[args.length - 1];
				if (target === 'agent/vela' || target === 'agent/zora') {
					return Promise.resolve({
						ok: true,
						output: `  ${target}\n`,
					});
				}
				return Promise.resolve({ ok: true, output: '' });
			}
			// rev-list --count <base>..<branch> — second mergedIntoBase check.
			if (args[0] === 'rev-list' && args[1] === '--count') {
				const range = args[2] ?? '';
				if (range.startsWith('develop..agent/vela')) {
					return Promise.resolve({ ok: true, output: '0\n' });
				}
				if (range.startsWith('develop..agent/zora')) {
					return Promise.resolve({ ok: true, output: '0\n' });
				}
				if (range.startsWith('develop..agent/orion')) {
					return Promise.resolve({ ok: true, output: '2\n' });
				}
				return Promise.resolve({ ok: true, output: '0\n' });
			}
			return Promise.resolve({ ok: true, output: '' });
		};
		// Compose: prefer the script runner for branch-list + worktree-list,
		// fall through to the tail runner for everything else. The script
		// runner falls back to `{ok:true, output:''}` for non-mocked args,
		// so we only short-circuit when the matched script produced output.
		const composite: IGitRunner = async (args) => {
			const scriptMatch = await runner(args);
			if (scriptMatch.ok && scriptMatch.output.length > 0) {
				return scriptMatch;
			}
			return tailRunner(args);
		};

		const result = await runBranchStatusEngine({
			run: composite,
			workspaceRoot,
			baseBranch: 'develop',
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.branches.map((b) => b.name).sort()).toEqual([
			'agent/orion',
			'agent/vela',
			'agent/zora',
		]);
		const orion = result.branches.find((b) => b.name === 'agent/orion');
		const vela = result.branches.find((b) => b.name === 'agent/vela');
		expect(orion?.ahead).toBe(2);
		expect(orion?.behind).toBe(0);
		expect(vela?.ahead).toBe(0);
		expect(vela?.behind).toBe(5);
		expect(vela?.mergedIntoBase).toBe(true);
		const orionWt = result.worktrees.find(
			(w) => w.branch === 'agent/orion',
		);
		expect(orionWt?.dirtyFiles).toBe(1);
		expect(orionWt?.untrackedFiles).toBe(1);
		expect(orionWt?.outOfCache).toBe(false);
		expect(result.summary.mergedCount).toBeGreaterThanOrEqual(1);
		expect(result.summary.dirtyWorktrees).toBe(1);
	});

	it('flags a worktree outside the canonical cache dir as outOfCache', async () => {
		const runner: IGitRunner = makeRunner([
			[
				['branch', '--list', 'agent/*'],
				{ ok: true, output: '  agent/orion\n' },
			],
			[
				['worktree', 'list', '--porcelain'],
				{
					ok: true,
					output: [
						'worktree /home/cartago/_projects/delendai/.worktrees/orion',
						'HEAD def5678',
						'branch refs/heads/agent/orion',
					].join('\n'),
				},
			],
		]);
		const tailRunner: IGitRunner = async () => ({ ok: true, output: '' });
		const composite: IGitRunner = async (args) => {
			const m = await runner(args);
			if (m.ok || m.output.length > 0) return m;
			return tailRunner(args);
		};
		const result = await runBranchStatusEngine({
			run: composite,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const wt = result.worktrees[0];
		expect(wt?.outOfCache).toBe(true);
		expect(result.summary.outOfCacheWorktrees).toBe(1);
	});

	it('does not flag the main checkout as outOfCache', async () => {
		const runner: IGitRunner = makeRunner([
			[['branch', '--list', 'agent/*'], { ok: true, output: '' }],
			[
				['worktree', 'list', '--porcelain'],
				{
					ok: true,
					output: [
						`worktree ${workspaceRoot}`,
						'HEAD abc1234',
						'branch refs/heads/develop',
						'',
						'worktree /home/cartago/_projects/delendai/.worktrees/orion',
						'HEAD def5678',
						'branch refs/heads/agent/orion',
					].join('\n'),
				},
			],
		]);
		const tailRunner: IGitRunner = async () => ({ ok: true, output: '' });
		const composite: IGitRunner = async (args) => {
			const match = await runner(args);
			if (match.ok || match.output.length > 0) return match;
			return tailRunner(args);
		};
		const result = await runBranchStatusEngine({
			run: composite,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.worktrees[0]?.outOfCache).toBe(false);
		expect(result.worktrees[1]?.outOfCache).toBe(true);
		expect(result.summary.outOfCacheWorktrees).toBe(1);
	});

	it('flags drift when the main checkout branch left baseBranch', async () => {
		const runner: IGitRunner = makeRunner([
			[['branch', '--list', 'agent/*'], { ok: true, output: '' }],
			[
				['worktree', 'list', '--porcelain'],
				{
					ok: true,
					output: [
						'worktree /home/cartago/_projects/delendai',
						'HEAD abc1234',
						'branch refs/heads/agent/rogue',
						'',
						'worktree /home/cartago/_projects/delendai/.cache/delendai/.worktrees/rogue',
						'HEAD abc1234',
						'branch refs/heads/agent/rogue',
					].join('\n'),
				},
			],
		]);
		const tailRunner: IGitRunner = async () => ({ ok: true, output: '' });
		const composite: IGitRunner = async (args) => {
			const m = await runner(args);
			if (m.ok || m.output.length > 0) return m;
			return tailRunner(args);
		};
		const result = await runBranchStatusEngine({
			run: composite,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.mainCheckoutBranch).toBe('agent/rogue');
		expect(result.mainCheckoutDrift).toBe(true);
	});

	it('does NOT flag drift when the main checkout stays on baseBranch', async () => {
		const runner: IGitRunner = makeRunner([
			[['branch', '--list', 'agent/*'], { ok: true, output: '' }],
			[
				['worktree', 'list', '--porcelain'],
				{
					ok: true,
					output: [
						'worktree /home/cartago/_projects/delendai',
						'HEAD abc1234',
						'branch refs/heads/develop',
					].join('\n'),
				},
			],
		]);
		const tailRunner: IGitRunner = async () => ({ ok: true, output: '' });
		const composite: IGitRunner = async (args) => {
			const m = await runner(args);
			if (m.ok || m.output.length > 0) return m;
			return tailRunner(args);
		};
		const result = await runBranchStatusEngine({
			run: composite,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.mainCheckoutBranch).toBe('develop');
		expect(result.mainCheckoutDrift).toBe(false);
	});

	it('marks a branch as NOT merged when its tip has unique commits ahead of base, even if git branch --merged says otherwise (f00057-S11 trap)', async () => {
		const runner = makeRunner([
			[
				['branch', '--list', 'agent/*'],
				{ ok: true, output: '  agent/copilot-minimax-m3-s57\n' },
			],
			[
				[
					'branch',
					'--list',
					'--merged',
					'develop',
					'agent/copilot-minimax-m3-s57',
				],
				{ ok: true, output: '  agent/copilot-minimax-m3-s57\n' },
			],
			[
				[
					'rev-list',
					'--count',
					'develop..agent/copilot-minimax-m3-s57',
				],
				{ ok: true, output: '2\n' },
			],
			[
				[
					'rev-list',
					'--left-right',
					'--count',
					'develop...agent/copilot-minimax-m3-s57',
				],
				{ ok: true, output: '0\t2\n' },
			],
			[
				['rev-parse', '--short', 'agent/copilot-minimax-m3-s57'],
				{ ok: true, output: '649b941' },
			],
			[
				['log', '-1', '--format=%ct', 'agent/copilot-minimax-m3-s57'],
				{ ok: true, output: '1735056000' },
			],
		]);

		const result = await runBranchStatusEngine({
			run: runner,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const branch = result.branches[0];
		expect(branch?.ahead).toBe(2);
		expect(branch?.mergedIntoBase).toBe(false);
	});

	it('marks a branch as merged only when BOTH git --merged AND ahead==0 agree', async () => {
		const runner = makeRunner([
			[
				['branch', '--list', 'agent/*'],
				{ ok: true, output: '  agent/clean\n' },
			],
			[
				['branch', '--list', '--merged', 'develop', 'agent/clean'],
				{ ok: true, output: '  agent/clean\n' },
			],
			[
				['rev-list', '--count', 'develop..agent/clean'],
				{ ok: true, output: '0\n' },
			],
			[
				[
					'rev-list',
					'--left-right',
					'--count',
					'develop...agent/clean',
				],
				{ ok: true, output: '0\t0\n' },
			],
			[
				['rev-parse', '--short', 'agent/clean'],
				{ ok: true, output: '1234567' },
			],
			[
				['log', '-1', '--format=%ct', 'agent/clean'],
				{ ok: true, output: '1734566400' },
			],
		]);

		const result = await runBranchStatusEngine({
			run: runner,
			workspaceRoot,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.branches[0]?.mergedIntoBase).toBe(true);
	});
});

describe('runBranchStatusEngine decision branches (keep, delete, unknown)', () => {
	const workspaceRoot = '/ws';
	const BASE = 'develop';
	const WORKTREE_LIST = [
		'worktree /ws/.cache/delendai/.worktrees/orion',
		'HEAD def5678',
		'branch refs/heads/agent/orion',
	].join('\n');

	/** A repository answering the questions the engine asks, one override per verb. */
	const repo = (
		answers: Partial<{
			readonly status: IGitRunResult;
			readonly log: IGitRunResult;
			readonly revList: IGitRunResult;
			readonly merged: IGitRunResult;
			readonly gap: IGitRunResult;
			readonly worktrees: IGitRunResult;
		}> = {},
	): IGitRunner => {
		const ok = (output: string): IGitRunResult => ({ ok: true, output });
		return (args) => {
			if (args[0] === 'branch' && args.includes('--merged'))
				return Promise.resolve(answers.merged ?? ok(''));
			if (args[0] === 'branch')
				return Promise.resolve(ok('  agent/orion'));
			if (args[0] === 'worktree')
				return Promise.resolve(answers.worktrees ?? ok(WORKTREE_LIST));
			if (args[0] === '-C')
				return Promise.resolve(answers.status ?? ok(''));
			if (args[0] === 'log')
				return Promise.resolve(answers.log ?? ok('1735000000'));
			if (args[0] === 'rev-list' && args[1] === '--left-right')
				return Promise.resolve(answers.revList ?? ok('0\t0'));
			if (args[0] === 'rev-list')
				return Promise.resolve(answers.gap ?? ok('0'));
			return Promise.resolve(ok('abcdef0'));
		};
	};

	const snapshotOf = async (run: IGitRunner) => {
		const result = await runBranchStatusEngine({
			run,
			workspaceRoot,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		if (!result.ok) throw new Error(result.reason);
		return result;
	};

	it('reports a branch reachable from base with no unique commit as merged (delete)', async () => {
		const snapshot = await snapshotOf(
			repo({ merged: { ok: true, output: '  agent/orion' } }),
		);
		expect(snapshot.branches[0]?.mergedIntoBase).toBe(true);
	});

	it('keeps a branch as unmerged when the base gap cannot be counted (unknown is never merged)', async () => {
		const snapshot = await snapshotOf(
			repo({
				merged: { ok: true, output: '  agent/orion' },
				gap: { ok: false, output: '', reason: 'lock held' },
			}),
		);
		expect(snapshot.branches[0]?.mergedIntoBase).toBe(false);
	});

	it('keeps a branch as unmerged when the gap is not a number', async () => {
		const snapshot = await snapshotOf(
			repo({
				merged: { ok: true, output: '  agent/orion' },
				gap: { ok: true, output: 'garbled' },
			}),
		);
		expect(snapshot.branches[0]?.mergedIntoBase).toBe(false);
	});

	it('marks a worktree whose status cannot be read instead of calling it clean', async () => {
		const snapshot = await snapshotOf(
			repo({ status: { ok: false, output: '', reason: 'locked' } }),
		);
		const worktree = snapshot.worktrees[0];
		expect(worktree?.statusUnreadable).toBe(true);
		expect(worktree?.dirtyFiles).toBe(0);
	});

	it('reports an unreadable commit time as -1 minutes and an unknown age', async () => {
		const snapshot = await snapshotOf(
			repo({ log: { ok: false, output: '' } }),
		);
		expect(snapshot.branches[0]?.lastCommitMinutesAgo).toBe(-1);
	});

	it('treats an ahead/behind count it cannot read as zero on both sides', async () => {
		const snapshot = await snapshotOf(
			repo({ revList: { ok: true, output: 'one' } }),
		);
		expect(snapshot.branches[0]).toMatchObject({ ahead: 0, behind: 0 });
	});

	it('fails with a reason when the worktree list cannot be read', async () => {
		const result = await runBranchStatusEngine({
			run: repo({
				worktrees: {
					ok: false,
					output: '',
					reason: 'not a repository',
				},
			}),
			workspaceRoot,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain('not a repository');
	});
});
