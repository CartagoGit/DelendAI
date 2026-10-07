/**
 * work-swarm-relations.spec.ts — what the swarm says its units have to
 * sort out: published work, stacks, duplicates, landed refs and overlaps.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	describeSwarm,
	readSwarm,
	relationsOf,
	unitKeyOf,
	unlandedElsewhere,
	type ISwarmUnit,
	type ISwarmView,
} from '@delendai/core/lib/work-units/work-swarm.service';

const unit = (ref: string, paths: readonly string[], ahead = 1): ISwarmUnit => {
	const [, agent = 'agent', ...rest] = ref.split('/').slice(1);
	return {
		ref,
		agent,
		subject: rest.join('/'),
		tip: ref,
		ahead,
		behind: 0,
		paths,
	};
};

const none = (): number => 0;

describe('a unit whose base moved', () => {
	const behind = (ref: string, ahead: number, by: number): ISwarmUnit => ({
		...unit(ref, [`${ref}.ts`], ahead),
		behind: by,
	});

	it('is told to bring it forward when it holds work, and last', () => {
		const relations = relationsOf({
			units: [
				behind('ns/wip/a/implement/x1-S1-g1/t', 2, 5),
				behind('ns/wip/b/implement/x2-S1-g1/t', 0, 5),
				behind('ns/wip/c/implement/x3-S1-g1/t', 3, 0),
			],
			published: [
				{
					...unit('ns/pr/d/implement/x4-S1-g1/t', ['b.ts'], 1),
					behind: 9,
				},
			],
			sharedUnlanded: none,
		});
		expect(relations).toEqual([
			{
				kind: 'behind',
				refs: ['ns/wip/a/implement/x1-S1-g1/t'],
				detail: expect.stringContaining(
					'its base moved 5 commit(s) on',
				),
			},
		]);
		expect(relations[0]?.detail).toContain('git merge');
	});
});

describe('unitKeyOf', () => {
	it('reads the slice and generation a unit ref names', () => {
		expect(unitKeyOf('implement/x00780-all-g2/topic')).toEqual({
			slice: 'x00780-all',
			generation: '2',
		});
		expect(unitKeyOf('implement/f00547-S2-g1')).toEqual({
			slice: 'f00547-S2',
			generation: '1',
		});
		expect(unitKeyOf('a-name-with-no-generation')).toBeUndefined();
	});
});

describe('relationsOf', () => {
	it('names a publication whose commits are all integrated as landed', () => {
		const relations = relationsOf({
			units: [],
			published: [unit('ns/pr/a/implement/x1-S1-g1/t', ['a.ts'], 0)],
			sharedUnlanded: none,
		});
		expect(relations).toEqual([
			expect.objectContaining({
				kind: 'landed',
				refs: ['ns/pr/a/implement/x1-S1-g1/t'],
			}),
		]);
	});

	it('names one slice live under two generations as a duplicate', () => {
		const relations = relationsOf({
			units: [],
			published: [
				unit('ns/pr/a/create/x2-all-g1/t', ['a.ts']),
				unit('ns/pr/a/create/x2-all-g2/t', ['a.ts']),
			],
			sharedUnlanded: () => 3,
		});
		expect(relations.map((relation) => relation.kind)).toEqual([
			'duplicate',
		]);
	});

	it('does not call an agent updating its own pull request a duplicate', () => {
		expect(
			relationsOf({
				units: [unit('ns/wip/a/implement/x3-S1-g1/t', ['a.ts'])],
				published: [unit('ns/pr/a/implement/x3-S1-g1/t', ['a.ts'])],
				sharedUnlanded: () => 2,
			}),
		).toEqual([]);
	});

	it('names units sharing unlanded commits as stacked, before any overlap', () => {
		const relations = relationsOf({
			units: [],
			published: [
				unit('ns/pr/a/implement/x4-S1-g1/t', ['a.ts', 'b.ts']),
				unit('ns/pr/a/implement/x5-S1-g1/t', ['a.ts', 'b.ts']),
			],
			sharedUnlanded: () => 4,
		});
		expect(relations).toEqual([
			expect.objectContaining({
				kind: 'stacked',
				detail: expect.stringContaining('4 unlanded commit(s)'),
			}),
		]);
	});

	it('names independent units sharing most of their files as an overlap, and leaves the rest alone', () => {
		const relations = relationsOf({
			units: [
				unit('ns/wip/a/implement/x6-S1-g1/t', ['a.ts', 'b.ts', 'c.ts']),
				unit('ns/wip/b/implement/x7-S1-g1/t', ['a.ts', 'b.ts']),
				unit('ns/wip/c/implement/x8-S1-g1/t', ['a.ts', 'z.ts', 'y.ts']),
				unit('ns/wip/d/implement/x9-S1-g1/t', []),
			],
			published: [],
			sharedUnlanded: none,
		});
		expect(relations).toEqual([
			{
				kind: 'overlap',
				refs: [
					'ns/wip/a/implement/x6-S1-g1/t',
					'ns/wip/b/implement/x7-S1-g1/t',
				],
				detail: '2 of 2 path(s) in common: run them one after the other',
			},
		]);
	});
});

describe('relationsOf — the cases that are not a relation', () => {
	it('calls one slice held by two agents a duplicate, even in one generation', () => {
		const relations = relationsOf({
			units: [unit('ns/wip/a/implement/x20-S1-g1/t', ['a.ts'])],
			published: [unit('ns/pr/b/implement/x20-S1-g1/t', ['a.ts'])],
			sharedUnlanded: none,
		});
		expect(relations).toEqual([
			expect.objectContaining({
				kind: 'duplicate',
				detail: 'x20-S1 is live 2 times; keep one',
			}),
		]);
	});

	it('leaves units whose names carry no generation, and landed ones, out of the pairs', () => {
		const relations = relationsOf({
			units: [
				unit('ns/wip/a/no-generation-here', ['a.ts']),
				unit('ns/wip/b/neither-here', ['a.ts']),
			],
			published: [unit('ns/pr/c/implement/x21-S1-g1/t', ['a.ts'], 0)],
			sharedUnlanded: () => 9,
		});
		expect(relations.map((relation) => relation.kind)).toEqual([
			'landed',
			'stacked',
		]);
		expect(relations[1]?.refs).toEqual([
			'ns/wip/a/no-generation-here',
			'ns/wip/b/neither-here',
		]);
	});
});

describe('unlandedElsewhere', () => {
	it('drops a publication whose own work ref is live, and a landed one', () => {
		const live = unit('ns/wip/a/implement/x30-S1-g1/t', ['a.ts']);
		const own = unit('ns/pr/a/implement/x30-S1-g1/t', ['a.ts']);
		const otherGeneration = unit('ns/pr/a/implement/x30-S1-g2/t', ['a.ts']);
		const someoneElse = unit('ns/pr/b/implement/x30-S1-g1/t', ['a.ts']);
		const landed = unit('ns/pr/c/implement/x31-S1-g1/t', ['a.ts'], 0);
		expect(
			unlandedElsewhere(
				[live],
				[own, otherGeneration, someoneElse, landed],
			).map((entry) => entry.ref),
		).toEqual([otherGeneration.ref, someoneElse.ref]);
	});
});

describe('describeSwarm', () => {
	const view = (overlaps: number): ISwarmView => ({
		integration: 'develop',
		units: [unit('ns/wip/a/implement/x1-S1-g1/t', ['a.ts'])],
		published: [unit('ns/pr/b/implement/x2-S1-g1/t', ['a.ts'])],
		publications: ['ns/pr/b/implement/x2-S1-g1/t'],
		overlaps: Array.from({ length: overlaps }, (_, index) => ({
			path: `f${String(index)}.ts`,
			refs: ['one', 'two'],
		})),
		relations: [],
	});

	it('says when there is nothing to sort out', () => {
		const lines = describeSwarm(view(0));
		expect(lines).toContain('overlaps         none');
		expect(lines).toContain('to sort out      nothing');
		expect(lines).toContain('publications     1');
	});

	it('lists each relation with the refs it names', () => {
		const lines = describeSwarm({
			...view(0),
			relations: [
				{
					kind: 'stacked',
					refs: ['one', 'two'],
					detail: 'land one first',
				},
			],
		});
		expect(lines).toContain('to sort out      1:');
		expect(lines).toContain('  stacked   land one first');
		expect(lines).toContain('            two');
	});

	it('summarises a long overlap list instead of burying the relations', () => {
		const lines = describeSwarm(view(14));
		expect(lines.filter((line) => line.endsWith('— 2 units'))).toHaveLength(
			10,
		);
		expect(lines).toContain('  … 4 more; --json lists every path and unit');
	});
});

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** Commit `files` on top of `base` and point `ref` at the result. */
const commitOnto = (
	root: string,
	base: string,
	ref: string,
	files: Record<string, string>,
): string => {
	git(root, 'checkout', '-q', '--detach', base);
	for (const [name, body] of Object.entries(files)) {
		writeFileSync(join(root, name), body);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', `feat: ${ref}`);
	const tip = git(root, 'rev-parse', 'HEAD');
	git(root, 'update-ref', ref, tip);
	git(root, 'checkout', '-q', 'develop');
	return tip;
};

describe('reading published work from git', () => {
	it('reads publications as units, leaves derived files out, and finds a stack', () => {
		const root = mkdtempSync(join(tmpdir(), 'swarm-rel-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		git(root, 'config', 'user.email', 'swarm@example.com');
		git(root, 'config', 'user.name', 'Swarm');
		git(root, 'config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, '.gitattributes'),
			'catalog.json linguist-generated\nindex.md merge=delendai-generated\nlock.json linguist-generated=true\n',
		);
		writeFileSync(join(root, 'base.ts'), 'export const base = 0;\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		const develop = git(root, 'rev-parse', 'HEAD');

		const remote = 'refs/remotes/origin/delendai/pr/sonnet/implement';
		const lower = commitOnto(root, develop, `${remote}/x10-S1-g1/base`, {
			'policy.ts': 'export const policy = 1;\n',
			'catalog.json': '{"a":1}\n',
			'index.md': '# a\n',
		});
		commitOnto(root, lower, `${remote}/x11-S1-g1/on-top`, {
			'release.ts': 'export const release = 1;\n',
			'catalog.json': '{"b":1}\n',
			'lock.json': '{}\n',
		});
		// Already merged: its tip is develop itself.
		git(root, 'update-ref', `${remote}/x12-S1-g1/done`, develop);

		const view = readSwarm({ root, policy });
		expect(view.units).toEqual([]);
		expect(view.publications).toHaveLength(3);
		const base = view.published.find((entry) =>
			entry.ref.endsWith('x10-S1-g1/base'),
		);
		expect(base?.agent).toBe('sonnet');
		expect(base?.paths).toEqual(['policy.ts']);
		expect(view.relations.map((relation) => relation.kind).sort()).toEqual([
			'landed',
			'stacked',
		]);
		// The derived catalog both of them touch is not an overlap.
		expect(view.overlaps.map((overlap) => overlap.path)).toEqual([
			'policy.ts',
		]);
	});
});
