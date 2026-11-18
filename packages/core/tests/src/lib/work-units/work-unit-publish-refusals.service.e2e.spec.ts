/**
 * work-unit-publish-refusals.service.e2e.spec.ts — what `published` refuses
 * before it touches the forge, and the fence that reads a unit's
 * generation in either spelling (f00808).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { published } from '@delendai/core/lib/work-units/work-unit-publish.service';

import { commitOnRef } from './unit-repo.helper';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'publish-refusals-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: 'nowhere' }),
	});

const UNIT = [
	'--proposal=x00001',
	'--slice=S1',
	'--agent=claude-opus-5',
	'--topic=probe',
];
const REF = (generation: number): string =>
	`delendai/wip/claude-opus-5/implement/x00001-S1-g${String(generation)}/probe`;

describe('published refuses before it publishes', () => {
	it('[<1000ms] names the arguments it needs', async () => {
		const result = await published(['--slice=S1'], contextFor(repo()));
		expect(result.code).not.toBe(0);
	});

	it('[<1000ms] does not take a separate name for the publication', async () => {
		const result = await published(
			[...UNIT, '--as=elsewhere'],
			contextFor(repo()),
		);
		expect(result.error).toContain('is not named separately');
	});

	it('[<2000ms] refuses a unit another generation has taken over', async () => {
		const root = repo();
		commitOnRef(root, REF(1), { 'a.ts': 'export const a = 1;\n' });
		commitOnRef(root, REF(2), { 'b.ts': 'export const b = 1;\n' });
		const result = await published(
			[...UNIT, '--generation=1'],
			contextFor(root),
		);
		expect(result.error).toContain('was taken over: generation 2');
	});
});
