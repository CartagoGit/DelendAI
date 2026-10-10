/**
 * work-unit-publish-failure.spec.ts — a publication that did not land
 * says so in words, not only in a list of steps.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'publish-failure-'));
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

describe('a publication that cannot reach the remote', () => {
	it('fails with the reason first, and keeps the work ref', async () => {
		const root = repo();
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		const checkpointed = await runWorkUnit(
			['checkpoint', ...UNIT, '--paths=a.ts', '--message=feat: a'],
			contextFor(root),
		);
		expect(checkpointed.code).toBe(0);

		const published = await runWorkUnit(
			['publish', ...UNIT, '--no-pull-request'],
			contextFor(root),
		);

		expect(published.code).not.toBe(0);
		expect(published.error?.split('\n')[0]).toContain('was NOT published');
		// The step that failed is named, not only listed in the data.
		expect(published.error).toMatch(/\n[a-z-]+: /u);
		expect(
			git(
				root,
				'for-each-ref',
				'--format=%(refname)',
				'refs/heads/delendai',
			),
		).toContain('delendai/wip/claude-opus-5/implement/x00001-S1-g1/probe');
	});
});
