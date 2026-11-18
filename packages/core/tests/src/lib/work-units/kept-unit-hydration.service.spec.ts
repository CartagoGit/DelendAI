/**
 * kept-unit-hydration.service.spec.ts — a unit entered again with nothing
 * of its own starts from where the integration branch is now.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

describe('work enter on a unit kept from before', () => {
	const template = createGitRepoTemplate({
		trunk: 'develop',
		files: {
			'delendai.config.json': JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
			'.gitignore': '.cache/\n',
		},
	});

	const repository = () => {
		const { root, git } = template.copy();
		return { root, git };
	};

	const enter = (root: string, session: string) =>
		runWorkUnit(
			[
				'enter',
				'--proposal=x00001',
				'--slice=S1',
				'--agent=glm-5.3-flash',
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

	it('brings an empty unit forward, and says so; leaves one with changes or a commit of its own where it is', async () => {
		// One unit walks all three states: enter is the costly step, so it
		// is entered the fewest times that still shows each.
		const { root, git } = repository();
		const first = (await enter(root, 's1')).data as { path: string };
		const inUnit = (...args: string[]) =>
			execFileSync('git', args, {
				cwd: first.path,
				encoding: 'utf8',
			}).trim();
		const tip = moveDevelop(root, git, 'a.txt');

		const again = (await enter(root, 's1')).data as {
			path: string;
			hydrated?: boolean;
		};
		expect(again.path).toBe(first.path);
		expect(again.hydrated).toBe(true);
		expect(inUnit('rev-parse', 'HEAD')).toBe(tip);

		// Uncommitted changes: the tree is its agent's.
		writeFileSync(join(first.path, 'work.txt'), 'in progress\n');
		moveDevelop(root, git, 'b.txt');
		const dirty = (await enter(root, 's1')).data as { hydrated?: boolean };
		expect(dirty.hydrated).toBeUndefined();

		// A commit of its own.
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
