/**
 * kept-unit-hydration.service.spec.ts — a unit entered again with nothing
 * of its own starts from where the integration branch is now.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

describe('work enter on a unit kept from before', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const repository = () => {
		const root = mkdtempSync(join(tmpdir(), 'kept-unit-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
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
		return { root, git };
	};

	const enter = (root: string, session: string) =>
		runWorkUnit(
			[
				'enter',
				'--proposal=x00001',
				'--slice=S1',
				'--agent=agent-a',
				`--session=${session}`,
			],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);

	const moveDevelop = (
		root: string,
		git: (...args: string[]) => string,
		file: string,
	): string => {
		writeFileSync(join(root, file), `${file}\n`);
		git('add', '-A');
		git('commit', '-q', '-m', `develop gains ${file}`);
		return git('rev-parse', 'HEAD');
	};

	it('brings an empty unit forward, and says so', async () => {
		const { root, git } = repository();
		const first = (await enter(root, 's1')).data as { path: string };
		const tip = moveDevelop(root, git, 'a.txt');

		const again = (await enter(root, 's1')).data as {
			path: string;
			hydrated?: boolean;
		};

		expect(again.path).toBe(first.path);
		expect(again.hydrated).toBe(true);
		expect(
			execFileSync('git', ['rev-parse', 'HEAD'], {
				cwd: again.path,
				encoding: 'utf8',
			}).trim(),
		).toBe(tip);
	});

	it('leaves a unit with a commit of its own, or with changes, where it is', async () => {
		const { root, git } = repository();
		const unit = (await enter(root, 's1')).data as { path: string };
		const inUnit = (...args: string[]) =>
			execFileSync('git', args, {
				cwd: unit.path,
				encoding: 'utf8',
			}).trim();
		writeFileSync(join(unit.path, 'work.txt'), 'in progress\n');
		moveDevelop(root, git, 'a.txt');

		// Uncommitted changes: the tree is its agent's.
		const dirty = (await enter(root, 's1')).data as { hydrated?: boolean };
		expect(dirty.hydrated).toBeUndefined();

		inUnit('add', '-A');
		inUnit('commit', '-q', '-m', 'work');
		const head = inUnit('rev-parse', 'HEAD');
		const ahead = (await enter(root, 's1')).data as { hydrated?: boolean };
		expect(ahead.hydrated).toBeUndefined();
		expect(inUnit('rev-parse', 'HEAD')).toBe(head);
	});

	it('is brought forward by the maintenance too, without being entered', async () => {
		// A unit kept for its proposal's next slice fell behind with every
		// merge, and the doctor called it broken for it.
		const { root, git } = repository();
		const unit = (await enter(root, 's1')).data as { path: string };
		const tip = moveDevelop(root, git, 'a.txt');
		const reap = (apply: boolean) =>
			runWorkUnit(
				['reap', ...(apply ? ['--apply'] : [])],
				fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
					cwd: root,
					globals: fakePartial<
						IWorkUnitContext['globals'],
						'workspace' | 'json'
					>({ workspace: root, json: true }),
				}),
			);
		const head = () =>
			execFileSync('git', ['rev-parse', 'HEAD'], {
				cwd: unit.path,
				encoding: 'utf8',
			}).trim();

		const dry = (await reap(false)).data as {
			advanced: { outcome: string }[];
		};
		expect(dry.advanced.map((each) => each.outcome)).toEqual([
			'would-advance',
		]);
		expect(head()).not.toBe(tip);

		const done = (await reap(true)).data as {
			advanced: { outcome: string }[];
		};
		expect(done.advanced.map((each) => each.outcome)).toEqual(['advanced']);
		expect(head()).toBe(tip);
	});
});
