/**
 * guard.command.spec.ts — git itself refuses what the policy forbids.
 *
 * The end-to-end case installs real hooks that call the real CLI, then
 * runs the operations an adopter project's agent ran by hand on
 * `shared-checkout-merge`: a commit on `develop` and an `agent/*`
 * branch. They must fail from a plain shell, while delendai's own work
 * branch, a merge into `develop`, and every operation in a project with
 * no declared policy still succeed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGuardFacts } from '../contracts/interfaces/guard.interface';
import { createGuardCommand, operationsForHook } from './guard.command';

const ZERO = '0000000000000000000000000000000000000000';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('operationsForHook', () => {
	it('pre-commit asks about the branch being committed to', () => {
		expect(
			operationsForHook('pre-commit', [], '', {
				branch: 'develop',
				isMerge: false,
			}),
		).toEqual([{ kind: 'commit', branch: 'develop', isMerge: false }]);
	});

	it('reference-transaction judges only creations, only when prepared', () => {
		const stdin = [
			`${ZERO} ${A} refs/heads/agent/x`,
			`${A} ${B} refs/heads/develop`,
			`${A} ${ZERO} refs/heads/old`,
		].join('\n');
		const facts = { branch: undefined, isMerge: false };
		expect(
			operationsForHook(
				'reference-transaction',
				['prepared'],
				stdin,
				facts,
			),
		).toEqual([{ kind: 'branch-create', ref: 'refs/heads/agent/x' }]);
		expect(
			operationsForHook(
				'reference-transaction',
				['committed'],
				stdin,
				facts,
			),
		).toEqual([]);
	});

	it('pre-push reads every pushed ref and marks deletes', () => {
		const stdin = [
			`refs/heads/wip/a/x ${A} refs/heads/wip/a/x ${ZERO}`,
			`(delete) ${ZERO} refs/heads/old ${B}`,
			'',
		].join('\n');
		expect(
			operationsForHook('pre-push', ['origin', 'url'], stdin, {
				branch: undefined,
				isMerge: false,
			}),
		).toEqual([
			{ kind: 'push', remoteRef: 'refs/heads/wip/a/x', deleting: false },
			{ kind: 'push', remoteRef: 'refs/heads/old', deleting: true },
		]);
	});
});

const context = (workspace: string): ICliCommandContext =>
	({
		cwd: workspace,
		globals: { workspace },
	}) as unknown as ICliCommandContext;

const facts = (over: Partial<IGuardFacts>): IGuardFacts => ({
	branch: () => 'develop',
	isMerge: () => false,
	stdin: async () => '',
	policy: async () =>
		resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-merge' },
		}),
	...over,
});

describe('guard command', () => {
	it('refuses with the policy reason and remedy', async () => {
		const result = await createGuardCommand(() => facts({})).run(
			['pre-commit'],
			context('/ws'),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('refused');
		expect(result.error).toContain('`shared-checkout-merge`');
		expect(result.error).toContain('Do not create worktrees or branches');
	});

	it('refuses nothing without a declared policy, or when it cannot be read', async () => {
		const none = await createGuardCommand(() =>
			facts({ policy: async () => undefined }),
		).run(['pre-commit'], context('/ws'));
		expect(none.code).toBe(0);
		const unreadable = await createGuardCommand(() =>
			facts({
				policy: async () => {
					throw new Error('broken json');
				},
			}),
		).run(['pre-commit'], context('/ws'));
		expect(unreadable.code).toBe(0);
	});

	it('rejects an unknown hook as a usage error', async () => {
		const result = await createGuardCommand(() => facts({})).run(
			['post-checkout'],
			context('/ws'),
		);
		expect(result.error).toContain('unknown hook');
	});
});

const CLI_ENTRY = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'index.ts',
);

describe('guard through real git hooks', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const repoWith = (config: object | undefined): string => {
		const root = mkdtempSync(join(tmpdir(), 'guard-e2e-'));
		roots.push(root);
		const run = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		run('init', '-q', '-b', 'develop');
		run('config', 'user.email', 'guard@example.com');
		run('config', 'user.name', 'Guard');
		run('config', 'commit.gpgsign', 'false');
		writeFileSync(join(root, 'README.md'), '# repo\n');
		if (config !== undefined) {
			writeFileSync(
				join(root, 'delendai.config.json'),
				JSON.stringify(config),
			);
		}
		run('add', '-A');
		run('commit', '-q', '-m', 'base');
		for (const hook of ['pre-commit', 'reference-transaction']) {
			const path = join(root, '.git', 'hooks', hook);
			writeFileSync(
				path,
				`#!/bin/sh\nexec bun "${CLI_ENTRY}" guard ${hook} "$@"\n`,
			);
			chmodSync(path, 0o755);
		}
		return root;
	};

	const git = (root: string, ...args: string[]) =>
		spawnSync('git', args, { cwd: root, encoding: 'utf8' });

	it('under shared-checkout-merge, blocks the hand-made branch and the direct commit', () => {
		const root = repoWith({
			development: { profile: 'shared-checkout-merge' },
		});

		const agentBranch = git(root, 'switch', '-c', 'agent/runner/x00056-S1');
		expect(agentBranch.status).not.toBe(0);
		expect(agentBranch.stderr).toContain('refused');
		// The observed agent made its worktrees this way.
		const worktree = git(
			root,
			'worktree',
			'add',
			'-q',
			'-b',
			'agent/runner/x00056-S2',
			join(root, '..', `${root.split('/').at(-1)}-wt`),
		);
		roots.push(join(root, '..', `${root.split('/').at(-1)}-wt`));
		expect(worktree.status).not.toBe(0);
		expect(worktree.stderr).toContain('refused');

		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		git(root, 'add', 'a.ts');
		const direct = git(root, 'commit', '-q', '-m', 'feat: direct');
		expect(direct.status).not.toBe(0);
		expect(direct.stderr).toContain(
			'forbids committing directly to `develop`',
		);

		// delendai's own work branch is created and committed on normally.
		expect(
			git(root, 'switch', '-q', '-c', 'wip/codex/x00056-S1-g1-t').status,
		).toBe(0);
		expect(
			git(root, 'commit', '-q', '-m', 'feat: on the work branch').status,
		).toBe(0);
		// And a merge is how develop moves.
		expect(git(root, 'switch', '-q', 'develop').status).toBe(0);
		expect(
			git(
				root,
				'merge',
				'-q',
				'--no-ff',
				'-m',
				'merge work',
				'wip/codex/x00056-S1-g1-t',
			).status,
		).toBe(0);
	}, 60_000);

	it('without a declared policy, every operation goes through', () => {
		const root = repoWith(undefined);
		expect(git(root, 'switch', '-q', '-c', 'agent/runner/x').status).toBe(
			0,
		);
		writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');
		git(root, 'add', 'b.ts');
		expect(git(root, 'commit', '-q', '-m', 'feat: anything').status).toBe(
			0,
		);
	}, 60_000);
});
