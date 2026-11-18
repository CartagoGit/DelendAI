/**
 * work-rename-namespace.command.e2e.spec.ts — `work rename-namespace`
 * through the command, in a real repository with a real bare remote.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createWorkCommand } from './work.command';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const contextFor = (root: string): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			ICliCommandContext['globals'],
			'workspace' | 'json'
		>({ workspace: root, json: true }),
	});

const repo = (withOldRef: boolean): string => {
	const root = mkdtempSync(join(tmpdir(), 'ns-rename-cmd-'));
	const remote = mkdtempSync(join(tmpdir(), 'ns-rename-cmd-remote-'));
	roots.push(root, remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'a@example.com');
	git(root, 'config', 'user.name', 'A');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: {
					namespacePrefix: '',
					formerNamespacePrefixes: ['delendai'],
				},
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	if (withOldRef)
		git(
			root,
			'push',
			'-q',
			'origin',
			'HEAD:refs/heads/delendai/wip/a/implement/x1-S1-g1/work',
		);
	return root;
};

describe('work rename-namespace (f00808 S7)', () => {
	it('[<5000ms] refuses when the forge cannot be read and renames nothing', async () => {
		const root = repo(true);
		const result = await createWorkCommand().run(
			['rename-namespace', '--apply'],
			contextFor(root),
		);
		expect(result.error ?? '').toContain('forge cannot be read');
		expect(
			git(root, 'ls-remote', '--heads', 'origin', 'delendai/wip/*'),
		).not.toBe('');
	});

	it('[<5000ms] names the config line to remove when nothing is left', async () => {
		const root = repo(false);
		const result = await createWorkCommand().run(
			['rename-namespace'],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(JSON.stringify(result.data)).toContain(
			'formerNamespacePrefixes',
		);
	});
});
