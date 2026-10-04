/**
 * work-retire.service.spec.ts — a unit that will not land is removed
 * with its work kept on the forge, and nothing else is.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IRetirementOutcome } from '@delendai/core/lib/contracts/interfaces/work-retire.interface';
import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import {
	planRetirement,
	restoreAdvice,
} from '@delendai/core/lib/work-units/work-retire.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const SHAPE = {
	namespace: 'delendai',
	workRefPrefix: 'refs/heads/delendai/wip/',
	publicationRefPrefix: 'refs/heads/delendai/pr/',
};

describe('planRetirement', () => {
	it('names both branches of a unit and the ref that keeps it, from either', () => {
		const unit = 'agent-a/review/batch-all-g1/verdicts';
		for (const branch of [
			`delendai/wip/${unit}`,
			`refs/heads/delendai/pr/${unit}`,
		]) {
			expect(planRetirement({ branch, ...SHAPE })).toEqual({
				unit,
				workBranch: `delendai/wip/${unit}`,
				publicationBranch: `delendai/pr/${unit}`,
				retiredRef: `refs/delendai/retired/${unit}`,
			});
		}
	});

	it('takes no other branch for a unit', () => {
		for (const branch of [
			'develop',
			'main',
			'feature/x',
			'delendai/wip/',
		]) {
			expect(planRetirement({ branch, ...SHAPE })).toBeUndefined();
		}
	});

	it('says how the work comes back', () => {
		expect(restoreAdvice('origin', 'refs/delendai/retired/u')).toContain(
			'git fetch origin refs/delendai/retired/u',
		);
	});
});

describe('work retire', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const UNIT = 'agent-a/review/batch-all-g1/verdicts';
	const WORK = `delendai/wip/${UNIT}`;
	const PUBLISHED = `delendai/pr/${UNIT}`;

	const repository = () => {
		const base = mkdtempSync(join(tmpdir(), 'retire-'));
		roots.push(base);
		const remote = join(base, 'origin.git');
		const root = join(base, 'work');
		execFileSync('mkdir', ['-p', remote, root]);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		const forge = (...args: string[]) =>
			execFileSync('git', args, { cwd: remote, encoding: 'utf8' }).trim();
		forge('init', '-q', '--bare', '-b', 'develop');
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'work@example.com');
		git('config', 'user.name', 'Work');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		writeFileSync(join(root, '.gitignore'), '.cache/\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		git('remote', 'add', 'origin', remote);
		git('push', '-q', 'origin', 'develop');
		// A unit with one commit, on the forge as a work ref and a publication.
		git('switch', '-q', '-c', WORK);
		writeFileSync(join(root, 'verdict.md'), 'approved\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'docs(review): a verdict');
		const tip = git('rev-parse', 'HEAD');
		git('push', '-q', 'origin', `${WORK}:${WORK}`, `${WORK}:${PUBLISHED}`);
		git('switch', '-q', 'develop');
		git('fetch', '-q', 'origin');
		return { root, git, forge, tip };
	};

	const retire = (root: string, ...flags: string[]) =>
		runWorkUnit(
			['retire', ...flags],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);

	it('keeps the tip on the forge, then removes both branches there and here', async () => {
		const { root, git, forge, tip } = repository();

		const result = await retire(
			root,
			`--ref=${PUBLISHED}`,
			'--reason=the pack cannot merge',
			'--unowned',
		);

		expect(result.code).toBe(0);
		const outcome = result.data as IRetirementOutcome;
		expect(outcome.kept).toEqual([
			{ ref: `refs/delendai/retired/${UNIT}`, commit: tip },
		]);
		expect([...outcome.removed].sort()).toEqual(
			[WORK, `origin/${WORK}`, `origin/${PUBLISHED}`].sort(),
		);
		expect(forge('rev-parse', `refs/delendai/retired/${UNIT}`)).toBe(tip);
		expect(forge('for-each-ref', 'refs/heads/delendai')).toBe('');
		expect(git('branch', '--list', WORK)).toBe('');
		// And it is seen again by asking for what was retired.
		const listed = await runWorkUnit(
			['retired'],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);
		expect(
			(listed.data as { retired: { unit: string; commit: string }[] })
				.retired,
		).toEqual([
			{
				unit: UNIT,
				ref: `refs/delendai/retired/${UNIT}`,
				commit: tip,
			},
		]);
		// Nothing of it stays in the clone, not even the ref that kept it.
		expect(git('for-each-ref', 'refs/delendai')).toBe('');
		// The work comes back from the forge alone.
		git('fetch', '-q', 'origin', `refs/delendai/retired/${UNIT}`);
		expect(git('rev-parse', 'FETCH_HEAD')).toBe(tip);
	});

	it('removes nothing when the tip cannot be kept on the forge', async () => {
		const { root, git, forge } = repository();
		git('remote', 'set-url', '--push', 'origin', join(root, 'nowhere.git'));

		const result = await retire(
			root,
			`--ref=${WORK}`,
			'--reason=the pack cannot merge',
			'--unowned',
		);

		expect(result.code).not.toBe(0);
		expect(result.error).toContain('Nothing was removed');
		expect(forge('for-each-ref', 'refs/heads/delendai')).not.toBe('');
		expect(git('branch', '--list', WORK)).not.toBe('');
	});

	it('keeps nothing for a unit whose work the integration branch already holds', async () => {
		const { root, git, forge } = repository();
		git('merge', '-q', '--no-ff', '--no-edit', WORK);
		git('push', '-q', 'origin', 'develop');
		git('fetch', '-q', 'origin');

		const result = await retire(
			root,
			`--ref=${WORK}`,
			'--reason=landed',
			'--unowned',
		);

		expect(result.code).toBe(0);
		const outcome = result.data as IRetirementOutcome;
		expect(outcome.kept).toEqual([]);
		expect(outcome.restore).toContain('already holds');
		expect(forge('for-each-ref', 'refs/delendai/retired')).toBe('');
		expect(forge('for-each-ref', 'refs/heads/delendai')).toBe('');
	});

	it('keeps changes nobody committed, and refuses files git does not track', async () => {
		const { root, git, forge, tip } = repository();
		const tree = join(root, '.cache', 'unit');
		git('worktree', 'add', '-q', tree, WORK);
		writeFileSync(
			join(tree, 'verdict.md'),
			'approved, and a second thought\n',
		);
		writeFileSync(join(tree, 'notes.txt'), 'never added\n');

		const untracked = await retire(
			root,
			`--ref=${WORK}`,
			'--reason=x',
			'--unowned',
		);
		expect(untracked.error).toContain('notes.txt');
		expect(git('branch', '--list', WORK)).not.toBe('');

		rmSync(join(tree, 'notes.txt'));
		const result = await retire(
			root,
			`--ref=${WORK}`,
			'--reason=x',
			'--unowned',
		);
		expect(result.code).toBe(0);
		const outcome = result.data as IRetirementOutcome;
		expect(outcome.kept.map((each) => each.commit)).toContain(tip);
		expect(outcome.kept).toHaveLength(2);
		const second = outcome.kept[1];
		expect(forge('show', `${second?.commit ?? ''}:verdict.md`)).toContain(
			'a second thought',
		);
	});

	it('refuses without a reason, a branch that is no unit, and a recent unit nobody vouched for', async () => {
		const { root, git } = repository();
		expect((await retire(root, `--ref=${WORK}`)).code).not.toBe(0);

		const integration = await retire(root, '--ref=develop', '--reason=x');
		expect(integration.error).toContain('not a unit of work');

		// Committed a moment ago and with no lease: it may be somebody's.
		const recent = await retire(root, `--ref=${WORK}`, '--reason=x');
		expect(recent.error).toContain('--unowned');
		expect(git('branch', '--list', WORK)).not.toBe('');

		git('worktree', 'add', '-q', join(root, '.cache', 'unit'), WORK);
		const taken = await retire(
			root,
			`--ref=${WORK}`,
			'--reason=x',
			'--unowned',
		);
		expect(taken.code).toBe(0);
		expect(git('worktree', 'list')).not.toContain('.cache/unit');
	});

	it("refuses another agent's live unit, whatever the caller asserts, and lets its owner retire it", async () => {
		const { root, git } = repository();
		const enter = await runWorkUnit(
			[
				'enter',
				'--proposal=x00009',
				'--slice=S1',
				'--agent=agent-b',
				'--topic=theirs',
			],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);
		const theirs = (enter.data as { branch: string }).branch;

		const foreign = await retire(
			root,
			`--ref=${theirs}`,
			'--reason=x',
			'--agent=agent-a',
			'--unowned',
		);
		expect(foreign.code).not.toBe(0);
		expect(foreign.error).toContain("agent-b's to retire");
		expect(git('branch', '--list', theirs)).not.toBe('');

		const own = await retire(
			root,
			`--ref=${theirs}`,
			'--reason=x',
			'--agent=agent-b',
		);
		expect(own.code).toBe(0);
		expect(git('branch', '--list', theirs)).toBe('');
	});
});
