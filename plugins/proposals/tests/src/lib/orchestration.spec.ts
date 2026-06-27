import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildDelegateRegistration,
	buildPlanRegistration,
} from '@mcp-vertex/proposals/lib/tools/orchestration.tool';
import type { IAgentNamesToolOptions } from '@mcp-vertex/proposals/lib/tools/agent-names.tool';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('plan tool', async () => {
	it('flags file overlap and lists claimable slices', async () => {
		const handler = await capture(buildPlanRegistration('proposals'));
		const out = parse(
			await handler({
				slices: [
					{ sliceId: 's1', files: ['a.ts'] },
					{ sliceId: 's2', files: ['a.ts', 'b.ts'] },
					{ sliceId: 's3', files: ['c.ts'] },
				],
			}),
		);
		expect(out.disjointnessIssues.length).toBeGreaterThan(0); // s1/s2 share a.ts
		expect(out.claimableSliceIds).toContain('s3');
	});
});

describe('delegate tool', async () => {
	let root = '';
	let opts: IAgentNamesToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deleg-'));
		opts = {
			namespacePrefix: 'proposals',
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: join(root, 'lock.json'),
			queuePathAbs: join(root, 'queue.json'),
			closedTasksPathAbs: join(root, 'closed.json'),
			workspaceRoot: root,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('assigns a name and locks the files in one handoff', async () => {
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.locked).toBe(true);
		expect(typeof out.agent).toBe('string');
		expect(out.instruction).toContain('src/x.ts');
	});
});

describe('delegate tool — x00051 per-agent worktree wiring', () => {
	let root = '';
	let opts: IAgentNamesToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deleg-wt-'));
		opts = {
			namespacePrefix: 'proposals',
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: join(root, 'lock.json'),
			queuePathAbs: join(root, 'queue.json'),
			closedTasksPathAbs: join(root, 'closed.json'),
			workspaceRoot: root,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	/** Fake git runner that records every arg array the worktree engine saw. */
	const recordingRunner = (
		fail: boolean,
	): IGitRunner & { calls: string[][] } => {
		const calls: string[][] = [];
		const runner = ((args: readonly string[]) => {
			calls.push([...args]);
			// The worktree engine first probes `rev-parse --verify
			// --quiet <branch>` to know whether to create the branch or
			// just attach to it. We make the probe fail (no existing
			// branch) so the engine follows the `add -b ... HEAD` path,
			// which is the regression we're guarding.
			const result =
				args[0] === 'rev-parse'
					? { ok: false, output: '', reason: 'no such ref' }
					: fail
						? { ok: false, output: '', reason: 'mock failure' }
						: { ok: true, output: '' };
			return Promise.resolve(result);
		}) as unknown as IGitRunner & { calls: string[][] };
		runner.calls = calls;
		return runner;
	};

	it('creates a per-agent worktree when worktree.enabled is true', async () => {
		const runner = recordingRunner(false);
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
				worktree: {
					enabled: true,
					workspaceRoot: root,
					run: runner,
				},
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.locked).toBe(true);
		expect(out.worktree).toBeDefined();
		expect(out.worktree.created).toBe(true);
		expect(out.worktree.branch).toBe(`agent/${out.agent}`);
		expect(out.worktree.path).toContain(out.agent);
		// `git worktree add -b agent/<slug> <path> HEAD` must have
		// been issued — this is the regression we're guarding.
		const addCall = runner.calls.find(
			(c) => c[0] === 'worktree' && c[1] === 'add',
		);
		expect(addCall).toBeDefined();
		expect(addCall).toContain('-b');
		expect(addCall).toContain(`agent/${out.agent}`);
		expect(addCall?.[addCall.length - 1]).toBe('HEAD');
		// Instruction must surface the worktree path so the subagent
		// knows where to commit.
		expect(out.instruction).toContain(out.worktree.path);
	});

	it('returns stage "worktree" without claiming the lock when worktree create fails', async () => {
		const runner = recordingRunner(true);
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
				worktree: {
					enabled: true,
					workspaceRoot: root,
					run: runner,
				},
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(false);
		expect(out.stage).toBe('worktree');
		expect(out.reason).toContain('mock failure');
		expect(out.locked).toBeUndefined();
		// Lock file must not exist — the failure short-circuits the
		// claim step, so no agent holds the files.
		expect(existsSync(opts.lockPathAbs)).toBe(false);
		// Defensive: if the file did exist for any reason, it must
		// not contain a claim entry for this task.
		if (existsSync(opts.lockPathAbs)) {
			const parsed = JSON.parse(readFileSync(opts.lockPathAbs, 'utf8'));
			expect(parsed.locks ?? parsed).not.toMatchObject({
				t1: expect.anything(),
			});
		}
	});

	it('does NOT invoke the worktree engine when worktree option is omitted (back-compat)', async () => {
		const runner = recordingRunner(false);
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
				// no `worktree` field
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.locked).toBe(true);
		expect(out.worktree).toBeUndefined();
		// No worktree git calls at all.
		expect(runner.calls).toHaveLength(0);
	});

	it('does NOT invoke the worktree engine when worktree.enabled is false (gate off)', async () => {
		const runner = recordingRunner(false);
		const handler = await capture(
			buildDelegateRegistration({
				namespacePrefix: 'proposals',
				agentNames: opts,
				lockPathAbs: opts.lockPathAbs,
				worktree: {
					enabled: false,
					workspaceRoot: root,
					run: runner,
				},
			}),
		);
		const out = parse(
			await handler({
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['src/x.ts'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.locked).toBe(true);
		expect(out.worktree).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});
});

/**
 * Real-git end-to-end: drive `delegate` against a temp git repo with
 * the real `git` binary. This is the regression the unit tests cannot
 * catch — that the worktree engine call actually produced a
 * `git worktree add` that the OS recognises as a worktree. Skip when
 * `git` is unavailable on PATH.
 */
describe('delegate tool — x00051 real-git e2e', () => {
	const hasGit = (() => {
		try {
			execFileSync('git', ['--version'], { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	})();

	const itGit = hasGit ? it : it.skip;

	let root = '';
	let opts: IAgentNamesToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deleg-e2e-'));
		opts = {
			namespacePrefix: 'proposals',
			registryPathAbs: join(root, 'registry.json'),
			lockPathAbs: join(root, 'lock.json'),
			queuePathAbs: join(root, 'queue.json'),
			closedTasksPathAbs: join(root, 'closed.json'),
			workspaceRoot: root,
		};
		// Initialise a real git repo so `git worktree add` succeeds.
		execFileSync('git', ['init', '--initial-branch=main', root], {
			stdio: 'ignore',
		});
		execFileSync('git', ['-C', root, 'config', 'user.email', 'e2e@test'], {
			stdio: 'ignore',
		});
		execFileSync('git', ['-C', root, 'config', 'user.name', 'e2e'], {
			stdio: 'ignore',
		});
		execFileSync(
			'git',
			['-C', root, 'commit', '--allow-empty', '-m', 'init'],
			{ stdio: 'ignore' },
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	itGit(
		'creates a real git worktree + branch agent/<slug> end-to-end',
		async () => {
			const handler = await capture(
				buildDelegateRegistration({
					namespacePrefix: 'proposals',
					agentNames: opts,
					lockPathAbs: opts.lockPathAbs,
					worktree: {
						enabled: true,
						workspaceRoot: root,
					},
				}),
			);
			const out = parse(
				await handler({
					taskId: 't1',
					slot: 'implementation_runner',
					files: ['src/x.ts'],
				}),
			);
			expect(out.ok).toBe(true);
			expect(out.worktree).toBeDefined();
			expect(out.worktree.created).toBe(true);

			// `git worktree list --porcelain` must report the worktree
			// exists, pointing at branch agent/<slug>.
			const list = execFileSync(
				'git',
				['-C', root, 'worktree', 'list', '--porcelain'],
				{
					encoding: 'utf8',
				},
			);
			expect(list).toContain(out.worktree.path);
			expect(list).toContain(`branch refs/heads/${out.worktree.branch}`);

			// Idempotency: a second delegate for the same agent reuses the
			// existing worktree instead of failing or duplicating.
			const out2 = parse(
				await handler({
					taskId: 't2',
					slot: 'implementation_runner',
					files: ['src/y.ts'],
				}),
			);
			// The pool picks the same first-free name deterministically per
			// task seed, so `t1` and `t2` may map to different agents —
			// either way the second call must succeed and reuse `created:
			// false` for the agent it did pick.
			expect(out2.ok).toBe(true);
			if (out2.agent === out.agent) {
				expect(out2.worktree.created).toBe(false);
			}
		},
	);
});
