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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
	// The worktrees these cases place inside the repository are ignored,
	// as a worktree in the shared checkout's tree must be (x00695).
	writeFileSync(join(root, '.gitignore'), 'wt*/\nbatch-wt/\n');
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
	over: { readonly json?: boolean; readonly remote?: string } = {},
): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			ICliCommandContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: over.json ?? true, remote: over.remote }),
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
			ref: 'refs/heads/delendai/wip/claude-opus-5/implement/x00553-S1-g1/probe',
		});
		// The two properties the model rests on.
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		expect(
			git(
				root,
				'show',
				'--name-only',
				'--format=',
				'delendai/wip/claude-opus-5/implement/x00553-S1-g1/probe',
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
				'delendai/wip/claude-opus-5/implement/x00553-S1-g1/probe',
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

	it('refuses a worktree the shared checkout would show as untracked (x00695)', async () => {
		const root = repoWith(PINNED);
		const loose = await command.run(
			[
				'enter',
				'--proposal=x1',
				'--slice=S1',
				'--agent=minimax-m3',
				'--dir=batch-g5',
			],
			contextFor(root),
		);
		expect(loose.code).not.toBe(0);
		expect(loose.error).toContain('loose edit on the integration branch');
	});

	it('gives two agents entering the same batch two worktrees (x00695)', async () => {
		const root = repoWith(PINNED);
		const paths: string[] = [];
		for (const agent of ['glm-5', 'minimax-m3']) {
			const entered = await command.run(
				[
					'enter',
					'--kind=review',
					'--proposal=batch',
					'--slice=all',
					`--agent=${agent}`,
					'--topic=close',
					'--json',
				],
				contextFor(root, { json: true }),
			);
			expect(entered.code).toBe(0);
			paths.push(String((entered.data as { path?: unknown }).path));
		}
		expect(paths[0]).toContain('glm-5-batch-all');
		expect(paths[1]).toContain('minimax-m3-batch-all');
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
			branch: 'delendai/wip/claude-opus-5/implement/x00553-S2-g1/isolated',
			created: true,
		});
		// The shared checkout is untouched.
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
		const session = String(
			(created.data as { session?: unknown }).session ?? '',
		);
		expect(session.length).toBeGreaterThan(0);
		const reenter = (extra: readonly string[]) =>
			command.run(
				[
					'enter',
					'--proposal=x00553',
					'--slice=S2',
					'--agent=claude-opus-5',
					'--topic=isolated',
					...extra,
				],
				contextFor(root),
			);
		const again = await reenter([`--session=${session}`]);
		expect(again.data).toMatchObject({ created: false, session });
		// Another instance under the same agent id does not get the unit
		// another session holds (x00699).
		for (const extra of [[], ['--session=someone-else']]) {
			const other = await reenter(extra);
			expect(other.code).not.toBe(0);
			expect(other.error).toContain('held by another session');
		}
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
		expect(result.error).toContain('--agent=');
	});

	it('refuses to let the caller name the publication', async () => {
		const root = repoWith(PINNED);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--as=something-i-made-up',
			],
			contextFor(root),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('Drop `--as=`');
	});

	it('refuses to publish or isolate under a profile with no work-ref model', async () => {
		const root = repoWith({ development: { profile: 'shared-direct' } });
		const published = await command.run(
			['publish', '--proposal=x1', '--slice=S1', '--agent=a'],
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
			],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: true,
		});
		// The publication keeps the name of the work it published: same
		// agent, same slice, same generation, same topic — only `wip`
		// became `pr`. That is the single shape, observed end to end.
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/**'),
		).toContain(
			'refs/heads/delendai/pr/claude-opus-5/implement/x00553-S1-g1/probe',
		);
	});

	it('keeps the work ref when asked, and reports it as not finished', async () => {
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
				'--keep-work-ref',
			],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: false,
		});
	});

	it('keeps the branch of a proposal still in progress, unasked', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		const doc = 'docs/delendai/proposals/in-progress/x00553-probe.md';
		mkdirSync(join(root, 'docs/delendai/proposals/in-progress'), {
			recursive: true,
		});
		writeFileSync(join(root, doc), '# x00553\n\n### S1 — one\n');
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await checkpoint(root, [`--paths=a.ts,${doc}`]);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--topic=probe',
			],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: false,
		});
		const steps = (
			result.data as {
				readonly steps: readonly {
					readonly name: string;
					readonly detail: string;
				}[];
			}
		).steps;
		expect(
			steps.find((step) => step.name === 'remove-work-ref')?.detail,
		).toContain('x00553 is still in progress');
	});

	it('ends the branch when the published tree takes its proposal out of progress', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		const doc = 'docs/delendai/proposals/blocked/x00553-probe.md';
		mkdirSync(join(root, 'docs/delendai/proposals/blocked'), {
			recursive: true,
		});
		writeFileSync(join(root, doc), '# x00553\n\n### S1 — one\n');
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await checkpoint(root, [`--paths=a.ts,${doc}`]);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--topic=probe',
			],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		// Nothing is lost: the publication carries every commit, and it was
		// proven on the remote before the branch went.
		expect(result.data).toMatchObject({
			published: true,
			workRefRemoved: true,
		});
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/wip/**'),
		).toBe('');
	});

	it('runs a review batch as one branch, claimed by commits, published once (f00644)', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		const entered = await command.run(
			[
				'enter',
				'--kind=review',
				'--proposal=batch',
				'--slice=all',
				'--agent=claude-opus-5',
				'--topic=sweep',
				'--dir=batch-wt',
			],
			contextFor(root),
		);
		expect(entered.data).toMatchObject({
			branch: 'delendai/wip/claude-opus-5/review/batch-all-g1/sweep',
		});
		const unit = join(root, 'batch-wt');
		for (const id of ['x00001', 'x00002']) {
			execFileSync(
				'git',
				[
					'commit',
					'-q',
					'--allow-empty',
					'-m',
					`chore(review): claim ${id}`,
					'--trailer',
					`Claims: ${id}`,
				],
				{ cwd: unit },
			);
		}
		const published = await command.run(
			[
				'publish',
				'--kind=review',
				'--proposal=batch',
				'--slice=all',
				'--agent=claude-opus-5',
				'--topic=sweep',
			],
			contextFor(root),
		);
		expect(published.data).toMatchObject({
			published: true,
			publication: {
				ref: 'refs/heads/delendai/pr/claude-opus-5/review/batch-all-g1/sweep',
			},
		});
		expect(
			(published.data as { publication: { reason: string } }).publication
				.reason,
		).toContain('review batch');
	});

	it('refuses a kind outside the vocabulary, and an agent id that spells one (f00644)', async () => {
		const root = repoWith(PINNED);
		const badKind = await command.run(
			[
				'enter',
				'--kind=hacking',
				'--proposal=x1',
				'--slice=S1',
				'--agent=a',
			],
			contextFor(root),
		);
		expect(badKind.code).not.toBe(0);
		expect(badKind.error).toContain('not a kind of work');
		const badAgent = await command.run(
			[
				'enter',
				'--proposal=x1',
				'--slice=S1',
				'--agent=minimax-m3-review-20260926',
			],
			contextFor(root),
		);
		expect(badAgent.code).not.toBe(0);
		expect(badAgent.error).toContain('spells a kind of work');
		const host = await command.run(
			['enter', '--proposal=x1', '--slice=S1', '--agent=copilot'],
			contextFor(root),
		);
		expect(host.code).not.toBe(0);
		expect(host.error).toContain('program the agent runs in');
	});

	it('still publishes a unit entered before the shape named its kind (f00644)', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		// A unit written by the old shape: no kind segment.
		const tree = git(root, 'rev-parse', 'HEAD^{tree}');
		const commit = git(
			root,
			'commit-tree',
			tree,
			'-p',
			'HEAD',
			'-m',
			'feat: work from before the kind',
		);
		git(
			root,
			'update-ref',
			'refs/heads/delendai/wip/claude-opus-5/x00553-S1-g1/probe',
			commit,
		);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--topic=probe',
			],
			contextFor(root),
		);
		expect(result.data).toMatchObject({ published: true });
		expect(
			git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/**'),
		).toContain('refs/heads/delendai/pr/claude-opus-5/x00553-S1-g1/probe');
	});

	it('finds a unit by what it is, not by the name it was entered under (x00704)', async () => {
		const root = repoWith(PINNED);
		const remote = mkdtempSync(join(tmpdir(), 'work-cmd-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		await command.run(
			[
				'enter',
				'--kind=review',
				'--proposal=batch',
				'--slice=all',
				'--agent=claude-opus-5',
				'--topic=sweep',
				'--dir=batch-wt',
			],
			contextFor(root),
		);
		execFileSync(
			'git',
			[
				'commit',
				'-q',
				'--allow-empty',
				'-m',
				'chore(review): claim x00001',
			],
			{ cwd: join(root, 'batch-wt') },
		);
		// Neither the kind nor the topic it was entered with.
		const published = await command.run(
			[
				'publish',
				'--proposal=batch',
				'--slice=all',
				'--agent=claude-opus-5',
			],
			contextFor(root),
		);
		expect(published.data).toMatchObject({
			published: true,
			publication: {
				ref: 'refs/heads/delendai/pr/claude-opus-5/review/batch-all-g1/sweep',
			},
		});
	});

	it('refuses to guess between two refs of one unit (x00704)', async () => {
		const root = repoWith(PINNED);
		const head = git(root, 'rev-parse', 'HEAD');
		for (const topic of ['first', 'second']) {
			git(
				root,
				'update-ref',
				`refs/heads/delendai/wip/claude-opus-5/implement/x00553-S1-g1/${topic}`,
				head,
			);
		}
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
			],
			contextFor(root),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('has 2 refs');
		expect(
			git(
				root,
				'for-each-ref',
				'--format=%(refname)',
				'refs/heads/delendai/wip/',
			).split('\n'),
		).toHaveLength(2);
	});

	it('reports a publication that could not be pushed, and keeps everything', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await checkpoint(root, ['--paths=a.ts']);
		const result = await command.run(
			[
				'publish',
				'--proposal=x00553',
				'--slice=S1',
				'--agent=claude-opus-5',
				'--topic=probe',
			],
			// `--remote=nowhere`, as the parser hands it over.
			contextFor(root, { remote: 'nowhere' }),
		);
		expect(result.code).not.toBe(0);
		expect(result.data).toMatchObject({
			published: false,
			workRefRemoved: false,
		});
	});
	it('names the agent already in these paths instead of refusing bare (x00555 S2)', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		// Another agent gets there first, in a unit of its own.
		const theirs = await command.run(
			[
				'checkpoint',
				'--proposal=x00553',
				'--slice=S9',
				'--agent=gpt-5',
				'--topic=their-own-slice',
				'--message=feat: theirs',
				'--paths=a.ts',
			],
			contextFor(root),
		);
		expect(theirs.code).toBe(0);

		writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
		const mine = await checkpoint(root, ['--paths=a.ts']);

		expect(mine.code).not.toBe(0);
		const said = JSON.stringify(mine);
		// Who, which unit, which path — and the three ways out.
		expect(said).toContain('gpt-5');
		expect(said).toContain('x00553-S9');
		expect(said).toContain('a.ts');
		expect(said).toContain('wait');
		expect(said).toContain('re-scope');
		expect(said).toContain('delendai work claim --ref=');
	});

	it('lets an agent checkpoint beside another unit that shares no path (x00555 S2)', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await command.run(
			[
				'checkpoint',
				'--proposal=x00553',
				'--slice=S9',
				'--agent=gpt-5',
				'--topic=their-own-slice',
				'--message=feat: theirs',
				'--paths=a.ts',
			],
			contextFor(root),
		);
		writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');
		expect((await checkpoint(root, ['--paths=b.ts'])).code).toBe(0);
	});
	it('tells an entering agent what the rest of the swarm is doing (x00555 S3)', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		// Somebody else is already live, on a path of their own.
		await command.run(
			[
				'checkpoint',
				'--proposal=x00553',
				'--slice=S9',
				'--agent=gpt-5',
				'--topic=their-own-slice',
				'--message=feat: theirs',
				'--paths=a.ts',
			],
			contextFor(root),
		);
		const entered = await command.run(
			[
				'enter',
				'--proposal=x00555',
				'--slice=S3',
				'--agent=claude-opus-5',
				'--topic=briefed',
				'--dir=wt-briefed',
			],
			contextFor(root),
		);
		expect(entered.code).toBe(0);
		// The picture arrives unasked, before the first edit.
		expect(entered.data).toMatchObject({
			created: true,
			swarm: {
				others: [{ agent: 'gpt-5', paths: ['a.ts'] }],
			},
		});
	});

	it('briefs an entering agent that it is alone, out loud (x00555 S3)', async () => {
		const root = repoWith(PINNED);
		const entered = await command.run(
			[
				'enter',
				'--proposal=x00555',
				'--slice=S3',
				'--agent=claude-opus-5',
				'--topic=alone',
				'--dir=wt-alone',
			],
			contextFor(root),
		);
		expect(entered.data).toMatchObject({ swarm: { others: [] } });
	});
});

describe('delendai work, as a person reads it', () => {
	const printed = async (
		run: () => Promise<ICliCommandResult>,
	): Promise<string> => {
		const lines: string[] = [];
		const spy = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation((chunk: unknown) => {
				lines.push(String(chunk));
				return true;
			});
		try {
			await run();
		} finally {
			spy.mockRestore();
		}
		return lines.join('');
	};

	it('prints the briefing to an entering agent, not only the JSON (x00555 S3)', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await command.run(
			[
				'checkpoint',
				'--proposal=x00553',
				'--slice=S9',
				'--agent=gpt-5',
				'--topic=their-own-slice',
				'--message=feat: theirs',
				'--paths=a.ts',
			],
			contextFor(root),
		);
		const out = await printed(() =>
			command.run(
				[
					'enter',
					'--proposal=x00555',
					'--slice=S3',
					'--agent=claude-opus-5',
					'--dir=wt-print',
				],
				contextFor(root, { json: false }),
			),
		);
		expect(out).toContain('gpt-5');
		expect(out).toContain('worktree');
		expect(out).toContain('1 other unit(s)');
	});

	it('prints the swarm, naming the paths more than one unit is changing', async () => {
		const root = repoWith(PINNED);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		await command.run(
			[
				'checkpoint',
				'--proposal=x00553',
				'--slice=S9',
				'--agent=gpt-5',
				'--topic=theirs',
				'--message=feat: theirs',
				'--paths=a.ts',
			],
			contextFor(root),
		);
		const out = await printed(() =>
			command.run(['swarm'], contextFor(root, { json: false })),
		);
		expect(out).toContain('units of work    1');
		expect(out).toContain('gpt-5');
		expect(out).toContain('overlaps');
	});

	it('prints where the checkout stands against the policy', async () => {
		const root = repoWith(PINNED);
		const out = await printed(() =>
			command.run(['status'], contextFor(root, { json: false })),
		);
		expect(out).toContain('profile          shared-checkout-pr');
		expect(out).toContain('checkout on      develop');
		expect(out).toContain('anchored         yes');
	});
});
