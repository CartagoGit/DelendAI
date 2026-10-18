/**
 * stray-ref-retire.service.spec.ts — a ref `no-stray-refs` names is
 * retired: its tip is kept on the forge, and the ref goes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { retireStrayRef } from '@delendai/core/lib/work-units/stray-ref-retire.service';

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const setUp = () => {
	const root = mkdtempSync(join(tmpdir(), 'stray-retire-'));
	const forge = mkdtempSync(join(tmpdir(), 'stray-retire-forge-'));
	dirs.push(root, forge);
	const git = (...args: string[]): string =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	execFileSync('git', ['init', '-q', '--bare', forge]);
	git('init', '-q', '-b', 'develop');
	git('config', 'user.name', 'spec');
	git('config', 'user.email', 'spec@example.invalid');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('remote', 'add', 'origin', forge);
	git('push', '-q', 'origin', 'develop');
	git('fetch', '-q', 'origin');
	writeFileSync(join(root, 'b.txt'), 'b\n');
	git('add', 'b.txt');
	const work = git(
		'commit-tree',
		git('write-tree'),
		'-p',
		'HEAD',
		'-m',
		'only here',
	);
	git('reset', '-q', '--hard', 'HEAD');
	git('update-ref', 'refs/remotes/prg14', work);
	const retire = (ref: string) =>
		retireStrayRef({
			root,
			policy,
			remote: 'origin',
			ref,
			reason: 'kept for its owner',
			agent: 'bot-1.0',
		});
	const forgeRefs = (): string =>
		execFileSync(
			'git',
			['for-each-ref', '--format=%(refname) %(objectname)'],
			{
				cwd: forge,
				encoding: 'utf8',
			},
		);
	return { git, work, retire, forgeRefs };
};

describe('retireStrayRef', () => {
	it('keeps a tip only this clone has on the forge, then removes the ref', () => {
		const { git, work, retire, forgeRefs } = setUp();
		const result = retire('refs/remotes/prg14');
		const kept = `refs/delendai/retired/bot-1.0/stray/remotes/prg14-${work.slice(0, 12)}`;
		expect(result?.data).toMatchObject({
			unit: 'refs/remotes/prg14',
			reason: 'kept for its owner',
			kept: [{ ref: kept, commit: work }],
			removed: ['refs/remotes/prg14'],
		});
		expect(forgeRefs()).toContain(`${kept} ${work}`);
		expect(
			git(
				'for-each-ref',
				'--format=%(refname)',
				'refs/remotes/prg14',
				'refs/delendai/',
			),
		).toBe('');
	});

	it('removes a copy of what the forge already holds without pushing it again', () => {
		const { git, retire, forgeRefs } = setUp();
		git(
			'update-ref',
			'refs/remotes/ret/copy',
			'refs/remotes/origin/develop',
		);
		const before = forgeRefs();
		expect(retire('remotes/ret/copy')?.data).toMatchObject({
			kept: [],
			removed: ['refs/remotes/ret/copy'],
		});
		expect(forgeRefs()).toBe(before);
	});

	it('leaves anything that is not a stray ref to the caller', () => {
		const { retire } = setUp();
		expect(retire('refs/heads/develop')).toBeUndefined();
		expect(retire('refs/remotes/origin/develop')).toBeUndefined();
	});
});
