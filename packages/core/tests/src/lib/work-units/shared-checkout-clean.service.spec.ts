/**
 * shared-checkout-clean.service.spec.ts — no work command runs while the
 * shared checkout holds loose edits, and nothing is checkpointed from it
 * (x01003). Real git.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	looseEditsOf,
	looseSharedCheckoutRefusal,
	sharedCheckoutCheckpointRefusal,
} from '@delendai/core/lib/work-units/shared-checkout-clean.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: undefined }),
	});

const templateOn = (profile: string) =>
	createGitRepoTemplate({
		trunk: 'develop',
		files: {
			'README.md': '# repo\n',
			'delendai.config.json': JSON.stringify({
				development: {
					profile,
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		},
	});

/** One repository per profile, built once and copied per case. */
const templates = {
	'shared-checkout-pr': templateOn('shared-checkout-pr'),
	'worktree-pr': templateOn('worktree-pr'),
	'shared-direct': templateOn('shared-direct'),
};

const repoOn = (profile: keyof typeof templates): string =>
	templates[profile].copy().root;

const UNIT = [
	'--proposal=x1',
	'--slice=S1',
	'--agent=claude-sonnet-5-5',
	'--topic=probe',
] as const;

describe('the shared checkout stays clean (x01003)', () => {
	it.each([
		['enter', [...UNIT]],
		['checkpoint', [...UNIT, '--paths=README.md', '--message=docs: x']],
		['prove', [...UNIT]],
		['publish', [...UNIT]],
	])(
		'refuses %s while the shared checkout holds a loose edit, naming work rescue',
		async (sub, args) => {
			const root = repoOn('shared-checkout-pr');
			writeFileSync(join(root, 'stray.ts'), 'export {};\n');
			const result = await runWorkUnit([sub, ...args], contextFor(root));
			expect(result.code).toBe(4);
			expect(result.error).toContain('1 loose edit(s): stray.ts');
			expect(result.error).toContain('delendai work rescue');
			// Refused before anything was made.
			expect(git(root, 'branch', '--list', 'delendai/*')).toBe('');
		},
	);

	it('lets status and rescue run, so the way out is never refused', async () => {
		const root = repoOn('shared-checkout-pr');
		writeFileSync(join(root, 'stray.ts'), 'export {};\n');
		expect((await runWorkUnit(['status'], contextFor(root))).code).toBe(0);
		const rescued = await runWorkUnit(['rescue'], contextFor(root));
		expect(rescued.code).toBe(0);
		expect(looseEditsOf(root)).toEqual([]);
		expect(
			(await runWorkUnit(['enter', ...UNIT], contextFor(root))).code,
		).toBe(0);
	});

	it("does not count delendai's own state directory as an edit", () => {
		const root = repoOn('shared-checkout-pr');
		mkdirSync(join(root, '.cache', 'delendai'), { recursive: true });
		writeFileSync(join(root, '.cache', 'delendai', 'state.json'), '{}');
		expect(looseEditsOf(root)).toEqual([]);
	});

	it('reads the shared checkout from inside a unit worktree', async () => {
		const root = repoOn('shared-checkout-pr');
		const entered = await runWorkUnit(['enter', ...UNIT], contextFor(root));
		const { path } = entered.data as { readonly path: string };
		writeFileSync(join(root, 'stray.ts'), 'export {};\n');
		const refusal = looseSharedCheckoutRefusal(
			path,
			expandProfile('shared-checkout-pr'),
		);
		expect(refusal?.reason).toContain(root);
	});

	it('asks nothing of a profile whose main checkout is not pinned', () => {
		const root = repoOn('worktree-pr');
		writeFileSync(join(root, 'stray.ts'), 'export {};\n');
		expect(
			looseSharedCheckoutRefusal(root, expandProfile('worktree-pr')),
		).toBeUndefined();
	});
});

describe('sharedCheckoutCheckpointRefusal', () => {
	it('names each file it leaves and why, and enters a unit when it has no worktree', () => {
		const root = repoOn('shared-checkout-pr');
		writeFileSync(join(root, 'README.md'), '# somebody else\n');
		const refusal = sharedCheckoutCheckpointRefusal({
			root,
			policy: expandProfile('shared-checkout-pr'),
			paths: ['README.md', 'delendai.config.json'],
			ref: 'refs/heads/delendai/wip/nobody/implement/x1-S1-g1/none',
		});
		expect(refusal?.reason).toContain(
			'README.md: edited here, and nothing proves the unit wrote it',
		);
		expect(refusal?.reason).toContain(
			'delendai.config.json: unchanged here',
		);
		expect(refusal?.remedy).toContain('delendai work enter');
	});

	it('takes no position where no unit has a worktree', () => {
		const root = repoOn('shared-direct');
		expect(
			sharedCheckoutCheckpointRefusal({
				root,
				policy: expandProfile('shared-direct'),
				paths: ['README.md'],
			}),
		).toBeUndefined();
	});
});
