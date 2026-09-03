/**
 * dry-run-commit.spec.ts — f00189 (Track F / security).
 *
 * Pins the dry-run contract for `commit_policy_run`: when
 * `args.dryRun === true`, the tool MUST return a `DryRunResult`
 * describing the change WITHOUT executing any git operation
 * (`git add`, `git commit`, `git push`).
 *
 * Tests:
 *   - `dryRun: true` returns a valid DryRunResult.
 *   - The handler does NOT call the git runner when `dryRun: true`.
 *   - Refusals propagate identically to the live branch.
 *   - Push policy influences the `risk` and the planned git runs.
 */

import { describe, expect, it } from 'vitest';

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import {
	buildRunToolRegistration,
	planCommitPolicyRun,
	runCommitPolicyRun,
} from '@mcp-vertex/commit-policy/lib/tools/run-tool';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

/**
 * Build a runner that records every command it is asked to run.
 * The dry-run tests assert the runner was NEVER called.
 */
const buildSpyRunner = (
	currentBranch: string,
	record: string[],
): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		record.push(args.join(' '));
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return Promise.resolve(ok(`${currentBranch}\n`));
		}
		if (args[0] === 'commit') return Promise.resolve(ok('committed\n'));
		if (args[0] === 'add') return Promise.resolve(ok('added\n'));
		if (args[0] === 'push') return Promise.resolve(ok('pushed\n'));
		if (args[0] === 'status')
			return Promise.resolve(
				ok(' M packages/core/src/lib/capabilities/schema.ts\n'),
			);
		if (args[0] === 'config')
			return Promise.resolve(ok('cartago@example.com\n'));
		return Promise.resolve(ok(''));
	};
	return handler as IGitRunner;
};

const buildPolicy = (
	overrides: Partial<ICommitPolicyOptions> = {},
): ICommitPolicyOptions => {
	const base = {
		commit: {
			enabled: true,
			requireConventional: false,
			autoScopeFromProposal: false,
			refuseWhenDisabled: false,
		},
		cadence: {
			triggers: [],
			sliceScoping: false,
			allowForeignChanges: true,
		},
		push: {
			enabled: false,
			onCommit: false,
			everyNCommits: 0,
			everyNMinutes: 0,
			protectedBranches: ['main', 'master'],
			protectedPrefixes: ['release/', 'hotfix/'],
			force: 'with-lease' as const,
		},
		identity: {
			mode: 'global' as const,
		},
		audit: {
			trailer: 'none' as const,
			agentFormat: '${host}/${model}',
		},
	};
	const merged: ICommitPolicyOptions = {
		gitTimeoutMs: 60_000,
		commit: { ...base.commit, ...(overrides.commit ?? {}) },
		stash: { enabled: false },
		cadence: {
			sliceScoping: base.cadence.sliceScoping,
			allowForeignChanges: base.cadence.allowForeignChanges,
			triggers: overrides.cadence?.triggers ?? base.cadence.triggers,
		},
		push: { ...base.push, ...(overrides.push ?? {}) },
		identity: { ...base.identity, ...(overrides.identity ?? {}) },
		audit: { ...base.audit, ...(overrides.audit ?? {}) },
	};
	return merged;
};

const baseOptions = (run: IGitRunner, policy: ICommitPolicyOptions) => ({
	workspaceRoot: '/tmp/dry-run-test',
	docsDir: '/tmp/dry-run-test/docs',
	namespacePrefix: 'mcp-vertex_commit-policy',
	policy,
	run,
	identityCtx: {
		run,
		envVars: {},
	},
	auditAgent: null,
});

describe('f00189 — commit_policy_run dry-run (Track F)', () => {
	/**
	 * Filter the recorded commands to only the destructive ones
	 * (`add`, `commit`, `push`). `rev-parse` and `status` are
	 * read-only — the dry-run is allowed to read the branch name
	 * to enforce branch policy, so they don't count as side
	 * effects.
	 */
	const destructiveOnly = (record: readonly string[]): string[] =>
		record.filter(
			(cmd) =>
				cmd.startsWith('add ') ||
				cmd.startsWith('commit ') ||
				cmd.startsWith('push'),
		);

	it('returns a DryRunResult for manual dryRun without executing git', async () => {
		const record: string[] = [];
		const run = buildSpyRunner('develop', record);
		const plan = await planCommitPolicyRun(
			{ kind: 'manual' },
			baseOptions(run, buildPolicy()),
		);
		if (plan.kind !== 'plan') throw new Error('expected plan');
		expect(plan.plan.dryRun).toBe(true);
		expect(plan.plan.risk).toBe('low');
		// Manual trigger → no files staged.
		expect(plan.plan.wouldChange).toEqual([]);
		expect(
			plan.plan.wouldRun.some((r) => r.target.includes('git commit')),
		).toBe(true);
		expect(
			plan.plan.wouldRun.some((r) => r.target.includes('git push')),
		).toBe(false);
		// Critical: no destructive git operations were executed.
		expect(destructiveOnly(record)).toEqual([]);
	});

	it('runCommitPolicyRun dryRun path is side-effect free', async () => {
		const record: string[] = [];
		const run = buildSpyRunner('develop', record);
		const result = await runCommitPolicyRun(
			{ kind: 'manual', dryRun: true },
			baseOptions(run, buildPolicy()),
		);
		// The result is a toolOk envelope — the body must be a DryRunResult.
		const body = result.structuredContent as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(Array.isArray(body.wouldChange)).toBe(true);
		expect(Array.isArray(body.wouldRun)).toBe(true);
		expect(typeof body.risk).toBe('string');
		// Critical: no destructive git operations were executed.
		expect(destructiveOnly(record)).toEqual([]);
	});

	it('push.enabled escalates the risk and adds the push to the plan', async () => {
		const record: string[] = [];
		const run = buildSpyRunner('develop', record);
		const plan = await planCommitPolicyRun(
			{ kind: 'manual' },
			baseOptions(
				run,
				buildPolicy({
					push: {
						enabled: true,
						onCommit: true,
						everyNCommits: 0,
						everyNMinutes: 0,
						protectedBranches: ['main'],
						protectedPrefixes: [],
						force: 'with-lease',
					},
				}),
			),
		);
		if (plan.kind !== 'plan') throw new Error('expected plan');
		expect(plan.plan.risk).toBe('medium');
		expect(plan.plan.wouldRun.some((r) => r.target === 'git push')).toBe(
			true,
		);
		// No git operations executed even with push policy enabled.
		expect(destructiveOnly(record)).toEqual([]);
	});

	it('refusal surfaces identically to the live branch', async () => {
		const record: string[] = [];
		const run = buildSpyRunner('main', record); // protected branch
		const result = await runCommitPolicyRun(
			{ kind: 'manual', dryRun: true },
			baseOptions(run, buildPolicy()),
		);
		expect(result.isError).toBe(true);
		const body = result.structuredContent as Record<string, unknown>;
		const error = body.error as { reason?: string };
		expect(error.reason).toMatch(/BRANCH_PROTECTED|protected/);
		expect(destructiveOnly(record)).toEqual([]);
	});

	it('buildRunToolRegistration declares dryRunSupported + effects', () => {
		const run = buildSpyRunner('develop', []);
		const registration = buildRunToolRegistration(
			baseOptions(run, buildPolicy()),
		);
		expect(registration.effects).toEqual(['write']);
		expect(registration.dryRunSupported).toBe(true);
	});

	it('runs the configured push callback after a successful commit', async () => {
		// x00269: `commitWithGuard` runs the isolated-index path
		// whenever `workspaceRoot` is set, and that path shells out
		// to the REAL `git` binary (it cannot be spied). So this test
		// provisions a real throwaway repo — otherwise `read-tree` /
		// `write-tree` fail and `committed` stays false.
		const repo = await mkdtemp(join(tmpdir(), 'dry-run-commit-push-'));
		try {
			execFileSync('git', ['init', '-q'], { cwd: repo });
			execFileSync('git', ['config', 'user.email', 't@t.t'], {
				cwd: repo,
			});
			execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
			writeFileSync(join(repo, 'README.md'), '# init\n');
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });

			const record: string[] = [];
			let pushCalls = 0;
			const result = await runCommitPolicyRun(
				{ kind: 'manual' },
				{
					...baseOptions(
						buildSpyRunner('develop', record),
						buildPolicy({
							push: {
								enabled: true,
								onCommit: true,
								everyNCommits: 0,
								everyNMinutes: 0,
								protectedBranches: ['main', 'master'],
								protectedPrefixes: [],
								force: 'with-lease',
							},
						}),
					),
					workspaceRoot: repo,
					onCommitSucceeded: async () => {
						pushCalls += 1;
						return {
							ok: true,
							pushed: true,
							remote: 'origin',
							branch: 'develop',
						};
					},
				},
			);
			const body = result.structuredContent as Record<string, unknown>;
			const commit = body.commit as {
				committed: boolean;
				pushed: boolean;
			};
			expect(pushCalls).toBe(1);
			expect(commit).toMatchObject({ committed: true, pushed: true });
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
