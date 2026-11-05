/**
 * work-git-spawn-budget.spec.ts — each `work` subcommand starts at most a
 * stated number of git processes.
 *
 * Every git process costs about 3 ms from bun, and a `work` command used
 * to start 35 to 64 of them in its own process. The seam reports every
 * spawn, so this spec counts them for each subcommand on a small fixture
 * (one commit, a bare origin) and fails when a change makes one grow.
 * Lower a ceiling when a change lowers its count.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { observeGitSpawns } from '@delendai/core/lib/shared/git-read.helper';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const AGENT = 'claude-opus-5-5';
const UNIT = ['--proposal=new', '--slice=all', `--agent=${AGENT}`];

/** Ceilings measured on this fixture; a count above one fails. */
const BUDGET = {
	status: 21,
	enter: 39,
	swarm: 22,
	prove: 27,
	publish: 43,
	retire: 31,
	refused: 8,
} as const;

let base = '';
let root = '';
let worktree = '';
const counts: Record<string, { spawns: number; fetches: number }> = {};

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const counted = async (
	name: keyof typeof BUDGET,
	cwd: string,
	args: readonly string[],
): Promise<number> => {
	const seen: string[][] = [];
	const stop = observeGitSpawns(({ args: spawned }) => {
		seen.push([...spawned]);
	});
	const ctx: IWorkUnitContext = {
		cwd,
		globals: { workspace: root, json: true, format: 'json' },
	};
	try {
		await runWorkUnit(args, ctx);
	} finally {
		stop();
	}
	counts[name] = {
		spawns: seen.length,
		fetches: seen.filter((spawned) => spawned[0] === 'fetch').length,
	};
	return seen.length;
};

beforeAll(() => {
	process.env.DELENDAI_AGENT_ID = AGENT;
	base = realpathSync(mkdtempSync(join(tmpdir(), 'work-spawn-budget-')));
	root = join(base, 'repo');
	git(base, 'init', '-q', '--bare', 'origin.git');
	git(base, 'init', '-q', '-b', 'main', 'repo');
	git(root, 'config', 'user.email', 'budget@example.com');
	git(root, 'config', 'user.name', 'Budget');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-merge',
				branches: { integration: 'main', release: 'main' },
			},
		}),
	);
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', join(base, 'origin.git'));
	git(root, 'push', '-q', 'origin', 'main');
});

afterAll(() => {
	rmSync(base, { recursive: true, force: true });
});

describe('the git spawn budget of each work subcommand', () => {
	it('status', async () => {
		expect(await counted('status', root, ['status'])).toBeLessThanOrEqual(
			BUDGET.status,
		);
	});

	it('enter', async () => {
		const spawns = await counted('enter', root, [
			'enter',
			...UNIT,
			'--kind=create',
			'--topic=budget',
		]);
		worktree =
			git(root, 'worktree', 'list', '--porcelain')
				.split('\n')
				.filter((line) => line.startsWith('worktree '))
				.map((line) => line.slice('worktree '.length))
				.find((path) => path !== root) ?? '';
		expect(worktree).not.toBe('');
		expect(spawns).toBeLessThanOrEqual(BUDGET.enter);
	});

	it('swarm', async () => {
		expect(await counted('swarm', root, ['swarm'])).toBeLessThanOrEqual(
			BUDGET.swarm,
		);
	});

	it('prove', async () => {
		writeFileSync(join(worktree, 'b.txt'), 'b\n');
		git(worktree, 'add', 'b.txt');
		git(worktree, 'commit', '-q', '-m', 'b');
		expect(
			await counted('prove', worktree, ['prove', ...UNIT]),
		).toBeLessThanOrEqual(BUDGET.prove);
	});

	it('publish', async () => {
		expect(
			await counted('publish', worktree, [
				'publish',
				...UNIT,
				'--no-pull-request',
			]),
		).toBeLessThanOrEqual(BUDGET.publish);
	});

	it('a refused checkpoint', async () => {
		expect(
			await counted('refused', root, ['checkpoint']),
		).toBeLessThanOrEqual(BUDGET.refused);
	});

	it('retire', async () => {
		const unit = git(
			root,
			'for-each-ref',
			'--format=%(refname)',
			'refs/heads/wip/',
		).split('\n')[0];
		expect(
			await counted('retire', root, [
				'retire',
				`--ref=${unit ?? ''}`,
				'--reason=budget',
			]),
		).toBeLessThanOrEqual(BUDGET.retire);
	});

	it('fetches at most once per subcommand', () => {
		for (const { fetches } of Object.values(counts))
			expect(fetches).toBeLessThanOrEqual(1);
	});
});
