/**
 * work.command.spec.ts — the workflow, exercised against real git.
 *
 * The claim under test is the one the whole model rests on: work reaches
 * its ref while the shared checkout stays exactly where the policy
 * anchored it. Every assertion here is made on a real repository,
 * because the failure this fixes was precisely a model that was true on
 * paper and false in the working tree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { createWorkCommand } from './work.command';

const roots: string[] = [];
const command = createWorkCommand();

const PINNED = {
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
};

const repoWith = (config: object | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-cmd-'));
	roots.push(root);
	const run = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	run('init', '-q', '-b', 'develop');
	run('config', 'user.email', 'work@example.com');
	run('config', 'user.name', 'Work');
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
	return root;
};

const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const contextFor = (
	root: string,
	over: { readonly json?: boolean } = {},
): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			ICliCommandContext['globals'],
			'workspace' | 'json'
		>({ workspace: root, json: over.json ?? true }),
	});

const checkpoint = (
	root: string,
	extra: readonly string[] = [],
): Promise<ICliCommandResult> =>
	command.run(
		[
			'checkpoint',
			'--proposal=x00553',
			'--slice=S1',
			'--agent=claude-opus-5',
			'--topic=probe',
			'--message=feat: work reaches its ref',
			...extra,
		],
		contextFor(root),
	);

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('delendai work (x00553)', () => {
	it('reports where the checkout is against the policy', async () => {
		const root = repoWith(PINNED);
		const result = await command.run(['status'], contextFor(root));
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			profile: 'shared-checkout-pr',
			integration: 'develop',
			branch: 'develop',
			anchored: true,
		});
	});

	it('persists work to its ref and never moves the checkout', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		const result = await checkpoint(root, ['--paths=a.ts']);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			status: 'created',
			ref: 'refs/heads/delendai/wip/claude-opus-5/x00553-S1-g1/probe',
		});
		// The two properties the model rests on.
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		expect(
			git(
				root,
				'show',
				'--name-only',
				'--format=',
				'delendai/wip/claude-opus-5/x00553-S1-g1/probe',
			),
		).toBe('a.ts');
	});

	it('captures only the claimed paths, leaving another agent edits alone', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'mine.ts'), 'export const mine = 1;\n');
		writeFileSync(join(root, 'theirs.ts'), 'export const theirs = 1;\n');
		await checkpoint(root, ['--paths=mine.ts']);
		expect(
			git(
				root,
				'show',
				'--name-only',
				'--format=',
				'delendai/wip/claude-opus-5/x00553-S1-g1/probe',
			),
		).toBe('mine.ts');
		// Still dirty in the tree, still theirs.
		expect(git(root, 'status', '--porcelain')).toContain('theirs.ts');
	});

	it('refuses to checkpoint from a checkout that wandered off', async () => {
		const root = repoWith(PINNED);
		git(root, 'switch', '-q', '-c', 'somewhere-else');
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		const result = await checkpoint(root, ['--paths=a.ts']);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('not anchored');
		expect(result.error).toContain('git switch develop');
	});

	it('names what a checkpoint is missing instead of guessing', async () => {
		const root = repoWith(PINNED);
		const result = await command.run(
			['checkpoint', '--proposal=x1'],
			contextFor(root),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('--paths=');
	});

	it('refuses a scope that escapes the repository', async () => {
		const root = repoWith(PINNED);
		const result = await checkpoint(root, ['--paths=../outside.ts']);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('Invalid scope');
	});

	it('gives an agent its own worktree, and finds it again', async () => {
		const root = repoWith(PINNED);
		const created = await command.run(
			[
				'enter',
				'--proposal=x00553',
				'--slice=S2',
				'--agent=claude-opus-5',
				'--topic=isolated',
				`--dir=wt`,
			],
			contextFor(root),
		);
		expect(created.code).toBe(0);
		expect(created.data).toMatchObject({
			branch: 'delendai/wip/claude-opus-5/x00553-S2-g1/isolated',
			created: true,
		});
		// The shared checkout is untouched.
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		const again = await command.run(
			[
				'enter',
				'--proposal=x00553',
				'--slice=S2',
				'--agent=claude-opus-5',
				'--topic=isolated',
			],
			contextFor(root),
		);
		expect(again.data).toMatchObject({ created: false });
	});

	it('says nothing to do when the project declares no policy', async () => {
		const root = repoWith(undefined);
		const result = await command.run(['status'], contextFor(root));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('no development policy');
	});

	it('refuses a work ref under a profile that has none', async () => {
		const root = repoWith({ development: { profile: 'shared-direct' } });
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		const result = await checkpoint(root, ['--paths=a.ts']);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('no work-ref model');
	});

	it('rejects an unknown subcommand', async () => {
		const result = await command.run(
			['nonsense'],
			contextFor(repoWith(PINNED)),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('Unknown subcommand');
	});

	it('shows the swarm as data, and as lines a person reads', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await checkpoint(root, ['--paths=a.ts']);
		const asData = await command.run(['swarm'], contextFor(root));
		expect(asData.code).toBe(0);
		expect(asData.data).toMatchObject({ integration: 'develop' });
		expect(
			(asData.data as { units: readonly unknown[] }).units,
		).toHaveLength(1);

		const printed = await command.run(
			['swarm'],
			contextFor(root, { json: false }),
		);
		expect(printed.suppressDefaultPrint).toBe(true);
	});

	it('names what a publication is missing instead of guessing', async () => {
		const root = repoWith(PINNED);
		const result = await command.run(
			['publish', '--proposal=x00553', '--slice=S1'],
			contextFor(root),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('--as=');
	});

	it('refuses to publish or isolate under a profile with no work-ref model', async () => {
		const root = repoWith({ development: { profile: 'shared-direct' } });
		const published = await command.run(
			[
				'publish',
				'--proposal=x1',
				'--slice=S1',
				'--as=name',
				'--agent=a',
			],
			contextFor(root),
		);
		expect(published.error).toContain('no work-ref model');
		const entered = await command.run(
			['enter', '--proposal=x1', '--slice=S1', '--agent=a'],
			contextFor(root),
		);
		expect(entered.error).toContain('nothing to isolate');
	});

	it('names what a worktree is missing instead of guessing', async () => {
		const root = repoWith(PINNED);
		const result = await command.run(['enter'], contextFor(root));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('--proposal=');
	});

	it('publishes through the command, and ends the work ref', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await checkpoint(root, ['--paths=a.ts']);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--topic=probe',
				'--as=published-by-the-command',
			],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: true,
		});
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/*'),
		).toContain('published-by-the-command');
	});
});
