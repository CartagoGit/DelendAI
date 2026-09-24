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
import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGuardFacts } from '../contracts/interfaces/guard.interface';
import {
	checkoutWarning,
	createGuardCommand,
	operationsForHook,
} from './guard.command';

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
		).toEqual([
			{
				kind: 'commit',
				branch: 'develop',
				isMerge: false,
				inMainWorktree: true,
			},
		]);
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

	it('reference-transaction judges every write to the stash, not only the first', () => {
		// A second stash updates `refs/stash` instead of creating it, so
		// judging creations alone let every stash after the first through.
		const facts = { branch: undefined, isMerge: false };
		const first = `${ZERO} ${A} refs/stash`;
		const next = `${A} ${B} refs/stash`;
		const dropLast = `${A} ${ZERO} refs/stash`;
		for (const line of [first, next]) {
			expect(
				operationsForHook(
					'reference-transaction',
					['prepared'],
					line,
					facts,
				),
			).toEqual([{ kind: 'stash' }]);
		}
		// Removing the stash is how an existing one gets cleaned up.
		expect(
			operationsForHook(
				'reference-transaction',
				['prepared'],
				dropLast,
				facts,
			),
		).toEqual([]);
		expect(
			operationsForHook(
				'reference-transaction',
				['committed'],
				next,
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
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: workspace,
		globals: fakePartial<ICliCommandContext['globals'], 'workspace'>({
			workspace,
		}),
	});

const facts = (over: Partial<IGuardFacts>): IGuardFacts => ({
	branch: () => 'develop',
	isMerge: () => false,
	inMainWorktree: () => true,
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

	it('refuses nothing without a declared policy', async () => {
		// Split from the case below, which used to share this assertion.
		// "No policy" is an answer; "the policy is unreadable" is not, and
		// treating them alike is what made the guard pass an operation it
		// had not checked.
		const none = await createGuardCommand(() =>
			facts({ policy: async () => undefined }),
		).run(['pre-commit'], context('/ws'));
		expect(none.code).toBe(0);
	});

	it('answers an inherited property name as an unknown hook (x00558)', async () => {
		// `MANAGEMENT[hook]` on a plain object resolved `toString` and
		// `constructor` to inherited members instead of reaching the
		// unknown-command answer.
		for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
			const result = await createGuardCommand(() => facts({})).run(
				[name],
				context('/ws'),
			);
			expect(result.error).toContain('unknown hook');
		}
	});

	it('rejects an unknown hook as a usage error', async () => {
		const result = await createGuardCommand(() => facts({})).run(
			['post-rewrite'],
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
		for (const hook of [
			'pre-commit',
			'reference-transaction',
			'post-checkout',
		]) {
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

	it('warns but never blocks when the shared checkout moves (x00553)', () => {
		const root = repoWith({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		});
		// Creating the work ref is allowed; landing on it is the mistake.
		const moved = git(
			root,
			'switch',
			'-c',
			'delendai/wip/claude/x00553-S1-g1/topic',
		);
		expect(moved.status).toBe(0);
		expect(moved.stderr).toContain('post-checkout');
		expect(moved.stderr).toContain('git switch develop');

		// And the commit that would have landed there IS refused.
		writeFileSync(join(root, 'README.md'), '# repo\nmore\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		const committed = git(root, 'commit', '-m', 'feat: from a work ref');
		expect(committed.status).not.toBe(0);
		expect(committed.stderr).toContain('refused');
		expect(committed.stderr).toContain('delendai work checkpoint');
	});

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

		// delendai's own work ref may be created — but committing on it
		// from the SHARED checkout is refused (x00553): work refs are
		// written by the engine, never checked out and committed on.
		expect(
			git(root, 'switch', '-q', '-c', 'wip/codex/x00056-S1-g1/t').status,
		).toBe(0);
		const onWorkBranch = git(
			root,
			'commit',
			'-q',
			'-m',
			'feat: on the work branch',
		);
		expect(onWorkBranch.status).not.toBe(0);
		expect(onWorkBranch.stderr).toContain('anchors it to `develop`');
		// The engine writes the ref with plumbing instead, which runs no
		// hooks and never moves HEAD — reproduced here with the same
		// commands it uses, so the merge below integrates real work.
		const plumb = (...args: string[]): string =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		// Throwaway fixture repository: drop the refused change entirely.
		plumb('reset', '-q', '--hard', 'HEAD');
		plumb('switch', '-q', 'develop');
		const tree = plumb('rev-parse', 'HEAD^{tree}');
		const commit = plumb(
			'commit-tree',
			tree,
			'-p',
			plumb('rev-parse', 'HEAD'),
			'-m',
			'feat: written to the work ref by plumbing',
		);
		plumb('update-ref', 'refs/heads/wip/codex/x00056-S1-g1/t', commit);
		// HEAD never moved: the shared checkout is still on develop.
		expect(plumb('symbolic-ref', '--short', 'HEAD')).toBe('develop');
		expect(
			git(
				root,
				'merge',
				'-q',
				'--no-ff',
				'-m',
				'merge work',
				'wip/codex/x00056-S1-g1/t',
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

describe('post-checkout (x00553)', () => {
	const pinned = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});

	it('says the shared checkout left the integration node, and how to return', () => {
		const warning = checkoutWarning(
			pinned,
			{
				branch: 'delendai/wip/claude-opus-5/x00553-S1-g1/topic',
				inMainWorktree: true,
			},
			['old', 'new', '1'],
		);
		expect(warning).toContain('delendai/wip/claude-opus-5');
		expect(warning).toContain('git switch develop');
		expect(warning).toContain('delendai work');
	});

	it('says nothing on the integration branch, in a worktree, or for a file checkout', () => {
		const inMain = {
			branch: 'delendai/wip/a/b',
			inMainWorktree: true,
		} as const;
		expect(
			checkoutWarning(
				pinned,
				{ branch: 'develop', inMainWorktree: true },
				['old', 'new', '1'],
			),
		).toBe('');
		expect(
			checkoutWarning(
				pinned,
				{ branch: 'delendai/wip/a/b', inMainWorktree: false },
				['old', 'new', '1'],
			),
		).toBe('');
		expect(checkoutWarning(pinned, inMain, ['old', 'new', '0'])).toBe('');
		expect(checkoutWarning(pinned, inMain, [])).toBe('');
	});

	it('says nothing when the profile does not pin the checkout', () => {
		const free = resolveDevelopmentPolicy({
			development: { profile: 'worktree-pr' },
		});
		expect(
			checkoutWarning(
				free,
				{ branch: 'agent/claude/x', inMainWorktree: true },
				['old', 'new', '1'],
			),
		).toBe('');
	});
});

describe('a guard never authorises what it did not check (x00580)', () => {
	it('refuses when the policy is declared and unreadable', async () => {
		// A project with a broken `delendai.config.json` is a project whose
		// rules nobody is applying — and the operations this hook guards
		// are exactly the ones the rules exist for. Passing them because
		// the rulebook is unreadable is the fail-open shape this cycle has
		// found three times now.
		const result = await createGuardCommand(() =>
			facts({
				policy: async () => {
					throw new Error(
						'Unexpected token } in JSON at position 42',
					);
				},
			}),
		).run(['pre-commit'], context('/ws'));
		expect(result.code).not.toBe(0);
	});

	it('still passes a project that simply declares no policy', async () => {
		// The distinction that makes the refusal fair: no policy is an
		// answer, an unreadable one is not.
		const result = await createGuardCommand(() =>
			facts({ policy: async () => undefined }),
		).run(['pre-commit'], context('/ws'));
		expect(result.code).toBe(0);
	});
});

describe('a project whose trunk is not develop can still commit (x00602)', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const consumer = (config: string): string => {
		const root = mkdtempSync(join(tmpdir(), 'guard-consumer-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
		writeFileSync(join(root, 'delendai.config.json'), config);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		execFileSync(
			'git',
			[
				'-c',
				'user.email=t@t',
				'-c',
				'user.name=t',
				'commit',
				'-q',
				'-m',
				'base',
			],
			{ cwd: root },
		);
		return root;
	};

	const refusal = async (config: string): Promise<string> => {
		const root = consumer(config);
		const result = await createGuardCommand().run(
			['pre-commit'],
			context(root),
		);
		return result.error ?? '';
	};

	it('names the branch the project is actually on, not `develop`', async () => {
		// Before this, a consumer on `main` was told: "the shared checkout
		// is on `main`, but the profile anchors it to `develop`. Return it
		// with `git switch develop`" — a branch their repository does not
		// have. Every commit refused, with an impossible remedy.
		const said = await refusal(
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		expect(said).not.toContain('git switch develop');
		expect(said).not.toContain('anchors it to `develop`');
		// The profile does forbid committing to the integration branch —
		// that refusal is correct. What changed is which branch it names,
		// and that the remedy is the workflow rather than a branch switch.
		expect(said).toContain('committing directly to `main`');
	});

	it('still points at a branch the project DID declare', async () => {
		// Declaring is the stronger statement: a project that says `trunk`
		// while sitting on `main` has wandered and wants to be told so —
		// and `trunk` is a branch it can actually switch to.
		const said = await refusal(
			'{ "development": { "profile": "shared-checkout-merge", "branches": { "integration": "trunk" } } }',
		);
		expect(said).toContain('git switch trunk');
	});
});
