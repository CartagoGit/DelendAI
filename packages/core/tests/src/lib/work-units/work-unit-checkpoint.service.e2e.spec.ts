/**
 * work-unit-checkpoint.service.spec.ts — `work checkpoint` refuses, with a
 * reason, what it cannot take: missing arguments, a profile with no work
 * refs, and scope paths that leave the repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { checkpointed } from '@delendai/core/lib/work-units/work-unit-checkpoint.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (development: object): string => {
	const root = mkdtempSync(join(tmpdir(), 'checkpoint-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'work@example.com');
	git('config', 'user.name', 'Work');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({ development }),
	);
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	return root;
};

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<IWorkUnitContext['globals'], 'workspace' | 'json'>(
			{
				workspace: root,
				json: true,
			},
		),
	});

const WORK_PROFILE = {
	profile: 'shared-checkout-pr',
	branches: { namespacePrefix: 'delendai' },
};
const FULL = [
	'--proposal=x00001',
	'--slice=S1',
	'--message=wip',
	'--agent=claude-opus-5',
];

describe('work checkpoint refusals', () => {
	it('[<1500ms] refuses a call without paths', async () => {
		const result = await checkpointed(FULL, contextFor(repo(WORK_PROFILE)));
		expect(result.code).not.toBe(0);
	});

	it('[<1500ms] refuses a scope that leaves the repository, naming the path', async () => {
		const result = await checkpointed(
			[...FULL, '--paths=../outside.ts'],
			contextFor(repo(WORK_PROFILE)),
		);
		expect(result.code).not.toBe(0);
		expect(JSON.stringify(result)).toContain('../outside.ts');
	});

	it('[<1500ms] refuses to take a file from the shared checkout under the single-branch profile', async () => {
		const result = await checkpointed(
			[...FULL, '--paths=README.md'],
			contextFor(repo({ profile: 'single-branch' })),
		);
		expect(result.code).not.toBe(0);
		expect(JSON.stringify(result)).toContain(
			'every unit has its own worktree',
		);
	});
});
