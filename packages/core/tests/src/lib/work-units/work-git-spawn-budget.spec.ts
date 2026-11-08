/**
 * work-git-spawn-budget.spec.ts — how many git processes each work
 * subcommand may start, on a fixture of one commit and a bare origin.
 *
 * Each `work` call used to start 80 to 140 git processes, most of them
 * asking what an earlier one had just answered (x01034). The counts come
 * from the spawn observer every git runner reports to, so a change that
 * adds a spawn anywhere on these paths fails here, with the commands of
 * the run that went over.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';

import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { observeGitSpawns } from '@delendai/core/lib/shared/git-read.helper';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

/** The most git processes each subcommand may start (x01034 S5). */
const BUDGET = {
	refusal: 2,
	status: 25,
	// 46: holding the unit's enter lock forgets the memoised reads (x01048),
	// so the policy and the checkout are read again once under the lock.
	enter: 46,
	checkpoint: 30,
	swarm: 35,
	prove: 30,
	publish: 40,
	retire: 40,
	fetch: 1,
} as const;

const template = createGitRepoTemplate({
	trunk: 'develop',
	remote: true,
	files: {
		'README.md': '# r\n',
		'.gitignore': '.cache/\n',
		'package.json': JSON.stringify({
			name: 'm',
			scripts: { prove: 'true' },
		}),
		'delendai.config.json': JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	},
});

const AGENT = 'claude-opus-5';
const UNIT = [
	'--proposal=x1',
	'--slice=S1',
	`--agent=${AGENT}`,
	'--topic=probe',
];
const REF = `delendai/wip/${AGENT}/implement/x1-S1-g1/probe`;

const contextFor = (cwd: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: cwd, json: true, remote: undefined }),
	});

interface IRun {
	readonly result: IWorkUnitResult;
	readonly spawns: readonly string[];
	readonly ms: number;
}

const counted = async (args: readonly string[], cwd: string): Promise<IRun> => {
	const spawns: string[] = [];
	const stop = observeGitSpawns(({ args: git }) =>
		spawns.push(git.join(' ')),
	);
	const started = performance.now();
	try {
		const result = await runWorkUnit(args, contextFor(cwd));
		return { result, spawns, ms: Math.round(performance.now() - started) };
	} finally {
		stop();
	}
};

const fetches = (run: IRun): number =>
	run.spawns.filter((spawn) => /^fetch\b/u.test(spawn)).length;

/**
 * Where to write each step's count and time, for a delivery that records
 * them: `DELENDAI_TEST_SPAWN_REPORT=<file>`. Unset, nothing is written.
 */
const REPORT = process.env.DELENDAI_TEST_SPAWN_REPORT;

const withinBudget = (name: keyof typeof BUDGET, run: IRun, code = 0): void => {
	if (REPORT !== undefined)
		appendFileSync(
			REPORT,
			`${JSON.stringify({ step: name, spawns: run.spawns.length, ms: run.ms })}\n`,
		);
	expect(run.result.code, String(run.result.error)).toBe(code);
	expect(run.spawns.length, run.spawns.join('\n')).toBeLessThanOrEqual(
		BUDGET[name],
	);
	expect(fetches(run)).toBeLessThanOrEqual(BUDGET.fetch);
};

describe('the git processes of one work invocation', () => {
	it('refuses a call that names no unit before asking git anything', async () => {
		const { root } = template.copy();
		for (const sub of [
			'enter',
			'checkpoint',
			'prove',
			'publish',
			'retire',
		]) {
			withinBudget('refusal', await counted([sub], root), 4);
		}
	});

	it('keeps a whole unit, enter to retire, within the budget of each step', async () => {
		const { root, git } = template.copy();
		withinBudget('status', await counted(['status'], root));
		const entered = await counted(['enter', ...UNIT], root);
		withinBudget('enter', entered);
		const unit = String((entered.result.data as { path?: unknown }).path);
		writeFileSync(join(unit, 'c.txt'), 'c\n');
		git('-C', unit, 'add', 'c.txt');
		git('-C', unit, 'commit', '-q', '-m', 'feat: c');
		// Inside its own worktree a checkpoint is refused: the commit is
		// the checkpoint. The refusal is still held to the budget.
		withinBudget(
			'checkpoint',
			await counted(
				['checkpoint', ...UNIT, '--paths=c.txt', '--message=feat: c'],
				unit,
			),
			4,
		);
		withinBudget('swarm', await counted(['swarm'], root));
		withinBudget('prove', await counted(['prove', ...UNIT], unit));
		withinBudget(
			'publish',
			await counted(['publish', ...UNIT, '--no-pull-request'], unit),
		);
		withinBudget(
			'retire',
			await counted(
				[
					'retire',
					`--ref=${REF}`,
					`--agent=${AGENT}`,
					'--reason=landed',
				],
				root,
			),
		);
	});
});
