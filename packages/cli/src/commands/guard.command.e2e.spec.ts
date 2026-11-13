/**
 * guard.command.e2e.spec.ts — git itself refuses what the policy forbids.
 *
 * The end-to-end tier of guard.command.spec.ts: it installs real hooks that
 * call the real CLI, then runs the operations an adopter project's agent ran
 * by hand on `shared-checkout-merge`: a commit on `develop` and an `agent/*`
 * branch. They must fail from a plain shell, while delendai's own work
 * branch, a merge into `develop`, and every operation in a project with no
 * declared policy still succeed. Every git command starts a bun process
 * through a hook, so this stays heavy and runs in the e2e tier.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard governs agents; a person is never refused (x00626): the
 * environment says an agent is running git, for this process and the git
 * hooks it spawns.
 */
beforeEach(() => {
	vi.stubEnv('AI_AGENT', 'guard-spec_1_agent');
});
afterEach(() => {
	vi.unstubAllEnvs();
});

const CLI_ENTRY = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'index.ts',
);

// Every git command in these cases starts a bun process through the hook,
// so a case is a dozen process starts. A minute covers an idle machine; a
// loaded one needs several, and the ceiling only has to catch a hang.
const REAL_HOOKS_TIMEOUT_MS = 300_000;

describe('guard through real git hooks', () => {
	const roots: string[] = [];
	// The owner's identity is the global config's (x00698), so the machine
	// running the suite must not lend its own: each case gets a global
	// config naming the test repository's owner, and no system config.
	beforeEach(() => {
		const home = mkdtempSync(join(tmpdir(), 'guard-e2e-home-'));
		roots.push(home);
		const global = join(home, 'gitconfig');
		writeFileSync(
			global,
			'[user]\n\tname = Guard\n\temail = guard@example.com\n',
		);
		vi.stubEnv('GIT_CONFIG_GLOBAL', global);
		vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
	});
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

	it('refuses deleting a unit branch a worktree still works on', () => {
		const root = repoWith({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		});
		const branch = 'delendai/wip/glm-5/implement/x00001-S1-g1/the-work';
		const worktree = join(
			root,
			'..',
			`${root.split('/').pop() ?? 'r'}-unit`,
		);
		roots.push(worktree);
		expect(
			git(root, 'worktree', 'add', '-q', '-b', branch, worktree).status,
		).toBe(0);

		const deleted = git(root, 'update-ref', '-d', `refs/heads/${branch}`);

		expect(deleted.status).not.toBe(0);
		expect(deleted.stderr).toContain('a worktree is working on');
		expect(git(root, 'rev-parse', '--verify', '-q', branch).status).toBe(0);
		expect(
			git(root, 'worktree', 'remove', '--force', worktree).status,
		).toBe(0);
		expect(
			git(root, 'update-ref', '-d', `refs/heads/${branch}`).status,
		).toBe(0);
	});

	it('refuses an empty commit on the integration branch where pre-commit never runs', () => {
		const root = repoWith({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		});
		// A hook manager that skips pre-commit when nothing is staged, as
		// lefthook does: only commit-msg is left to judge a claim.
		rmSync(join(root, '.git', 'hooks', 'pre-commit'));
		const hook = join(root, '.git', 'hooks', 'commit-msg');
		writeFileSync(
			hook,
			`#!/bin/sh\nexec bun "${CLI_ENTRY}" guard commit-msg "$@"\n`,
		);
		chmodSync(hook, 0o755);

		const claim = git(
			root,
			'commit',
			'--allow-empty',
			'-m',
			'chore(review): claim x00604',
		);

		expect(claim.status).not.toBe(0);
		expect(claim.stderr).toContain('guard (commit-msg): refused');
		expect(git(root, 'log', '-1', '--format=%s').stdout.trim()).toBe(
			'base',
		);
	});

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
			'delendai/wip/claude/implement/x00553-S1-g1/topic',
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
		expect(committed.stderr).toContain('delendai work rescue');
		expect(committed.stderr).not.toContain('delendai work checkpoint');
	});

	it('lets git pack an existing ref it would refuse to create (x00703)', () => {
		const root = repoWith({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		});
		// A badly named ref that exists already, made without hooks.
		expect(
			git(
				root,
				'-c',
				'core.hooksPath=/dev/null',
				'branch',
				'delendai/wip/copilot/review/batch-all-g1/t',
			).status,
		).toBe(0);
		const packed = git(root, 'pack-refs', '--all');
		expect(packed.stderr).not.toContain('aborted by hook');
		expect(packed.status).toBe(0);
		// Creating one is still refused.
		expect(
			git(root, 'branch', 'delendai/wip/copilot/review/batch-all-g1/u')
				.status,
		).not.toBe(0);
	});

	it('refuses an identity an agent wrote into the repository config (x00698)', () => {
		const root = repoWith({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		});
		const unit = join(root, '..', `${root.split('/').at(-1)}-owned`);
		roots.push(unit);
		expect(
			git(
				root,
				'worktree',
				'add',
				'-q',
				'-b',
				'delendai/wip/minimax-m3/review/batch-all-g1/t',
				unit,
			).status,
		).toBe(0);
		// Shared by every worktree: what MiniMax did on 2026-09-27.
		git(root, 'config', 'user.name', 'delendai-impl-minimax-3');
		git(root, 'config', 'user.email', 'delendai@MiniMax.local');
		writeFileSync(join(unit, 'a.ts'), 'export const a = 1;\n');
		git(unit, 'add', 'a.ts');
		const committed = git(unit, 'commit', '-m', 'feat: as the agent');
		expect(committed.status).not.toBe(0);
		expect(committed.stderr).toContain('Guard <guard@example.com>');
	});

	it(
		'refuses a borrowed author on a delendai branch, however it was borrowed (f00644)',
		() => {
			const root = repoWith({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			});
			const unit = join(root, '..', `${root.split('/').at(-1)}-unit`);
			roots.push(unit);
			expect(
				git(
					root,
					'worktree',
					'add',
					'-q',
					'-b',
					'delendai/wip/gpt-5-codex/implement/x00056-S1-g1/t',
					unit,
				).status,
			).toBe(0);
			writeFileSync(join(unit, 'a.ts'), 'export const a = 1;\n');
			git(unit, 'add', 'a.ts');
			for (const args of [
				[
					'commit',
					'-q',
					'--author=Bot <bot@x.invalid>',
					'-m',
					'feat: a',
				],
				[
					'-c',
					'user.name=Bot',
					'-c',
					'user.email=bot@x.invalid',
					'commit',
					'-q',
					'-m',
					'feat: a',
				],
			]) {
				const borrowed = git(unit, ...args);
				expect(borrowed.status).not.toBe(0);
				expect(borrowed.stderr).toContain('is authored as');
			}
			expect(git(unit, 'commit', '-q', '-m', 'feat: a').status).toBe(0);
		},
		REAL_HOOKS_TIMEOUT_MS,
	);

	it(
		'under shared-checkout-merge, blocks the hand-made branch and the direct commit',
		() => {
			const root = repoWith({
				development: { profile: 'shared-checkout-merge' },
			});

			const agentBranch = git(
				root,
				'switch',
				'-c',
				'agent/runner/x00056-S1',
			);
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
				git(
					root,
					'switch',
					'-q',
					'-c',
					'wip/gpt-5-codex/implement/x00056-S1-g1/t',
				).status,
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
				execFileSync('git', args, {
					cwd: root,
					encoding: 'utf8',
				}).trim();
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
			plumb(
				'update-ref',
				'refs/heads/wip/gpt-5-codex/implement/x00056-S1-g1/t',
				commit,
			);
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
					'wip/gpt-5-codex/implement/x00056-S1-g1/t',
				).status,
			).toBe(0);
		},
		REAL_HOOKS_TIMEOUT_MS,
	);

	it(
		'without a declared policy, the adopted default judges an agent',
		() => {
			const root = repoWith(undefined);
			const created = git(root, 'switch', '-q', '-c', 'agent/runner/x');
			expect(created.status).not.toBe(0);
			expect(created.stderr).toContain('`shared-checkout-merge`');
		},
		REAL_HOOKS_TIMEOUT_MS,
	);
});
