/**
 * Starting a server reads the project and never writes to it.
 *
 * The module these tests cover used to install the guard on boot. It was
 * observed doing so in an unrelated repository: eleven modified files
 * after starting the server, five of them the project's own git hooks.
 * There is no install path left here, and these tests are the proof —
 * they measure the tree, not the intention.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	guardHooksMode,
	reportGuardHooks,
} from './guard-hooks-autoinstall.service';
import { GENERATED_MERGE_DRIVER } from '../contracts/constants/generated-merge-driver.constant';
import { locateHooks } from './guard-hooks.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (config?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'guard-auto-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config);
	}
	return root;
};

const POLICY = '{ "development": { "profile": "shared-checkout-merge" } }';
const POLICY_INSTALLING =
	'{ "development": { "profile": "shared-checkout-merge", "guardHooks": "install" } }';

/** Every file in the tree, git's own directory excluded. */
const fingerprint = (root: string): string =>
	execFileSync(
		'sh',
		[
			'-c',
			'find . -type f -not -path "./.git/*" -exec sha256sum {} + | sort',
		],
		{ cwd: root, encoding: 'utf8' },
	);

describe('guardHooksMode', () => {
	it('reports by default when a policy is declared', async () => {
		expect(await guardHooksMode(repo(POLICY))).toBe('report');
	});

	it('reads back an explicit choice', async () => {
		for (const mode of ['report', 'off', 'install'] as const) {
			const root = repo(
				`{ "development": { "profile": "shared-direct", "guardHooks": "${mode}" } }`,
			);
			expect(await guardHooksMode(root)).toBe(mode);
		}
	});

	it('is absent without a configuration, a development block, or parsable JSON', async () => {
		expect(await guardHooksMode(repo())).toBe('absent');
		expect(await guardHooksMode(repo('{ "plugins": {} }'))).toBe('absent');
		expect(await guardHooksMode(repo('{ "development": '))).toBe('absent');
	});
});

describe('reportGuardHooks leaves the repository alone', () => {
	it('changes not one byte of an adopted project', async () => {
		// The report that prompted this: opening an unrelated project
		// produced eleven modified files, five of them the project's own
		// husky hooks — staged, and carrying the installing machine's
		// absolute paths, ready to be committed to colleagues who
		// installed nothing.
		const root = repo(POLICY);
		mkdirSync(join(root, '.husky'), { recursive: true });
		writeFileSync(
			join(root, '.husky', 'pre-commit'),
			'#!/usr/bin/env bash\nnpm test\n',
		);
		const before = fingerprint(root);

		const outcome = await reportGuardHooks({ workspaceRoot: root });

		expect(outcome.mode).toBe('report');
		expect(fingerprint(root)).toBe(before);
		expect(readFileSync(join(root, '.husky', 'pre-commit'), 'utf8')).toBe(
			'#!/usr/bin/env bash\nnpm test\n',
		);
	});

	it('changes not one byte even when the project asks to be installed into', async () => {
		// `guardHooks: "install"` is a statement of intent, not permission
		// to write during boot. Opening a folder is not the act that was
		// consented to; typing `delendai guard install` is.
		const root = repo(POLICY_INSTALLING);
		mkdirSync(join(root, '.husky'), { recursive: true });
		writeFileSync(
			join(root, '.husky', 'pre-commit'),
			'#!/bin/sh\nexit 0\n',
		);
		const before = fingerprint(root);

		const outcome = await reportGuardHooks({ workspaceRoot: root });

		expect(outcome.mode).toBe('install');
		expect(fingerprint(root)).toBe(before);
		expect(existsSync(join(locateHooks(root).dir, 'pre-push'))).toBe(false);
	});

	it('does not reach into git config for the merge driver either', async () => {
		// Boot wrote `merge.delendai-generated.driver` alongside the hooks.
		// `.git/config` is not tracked, but it is still the project's, and
		// it still changed because somebody opened a folder. The driver is
		// installed by `delendai guard install`, which `prepare` runs.
		const root = repo(POLICY_INSTALLING);
		await reportGuardHooks({ workspaceRoot: root });
		// `git config --get` exits non-zero for a key that is not set,
		// which is exactly the state being asserted.
		let configured = '';
		try {
			configured = execFileSync(
				'git',
				['config', '--get', `merge.${GENERATED_MERGE_DRIVER}.driver`],
				{
					cwd: root,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				},
			).trim();
		} catch {
			configured = '';
		}
		expect(configured).toBe('');
	});

	it('says what it found, and how to install it', async () => {
		// Silence would be its own problem: a project that wants the guard
		// has to be able to see that it is not there.
		const root = repo(POLICY);
		const outcome = await reportGuardHooks({ workspaceRoot: root });
		const text = outcome.lines.join('\n');
		expect(text).toContain('pre-commit: absent');
		expect(text).toContain('delendai guard install');
	});

	it('stays quiet for a project that says off, or declares no policy', async () => {
		for (const config of [
			'{ "development": { "profile": "shared-direct", "guardHooks": "off" } }',
			undefined,
		]) {
			const root = repo(config);
			const outcome = await reportGuardHooks({ workspaceRoot: root });
			expect(outcome.lines).toEqual([]);
		}
	});

	it('reports a repository it cannot inspect instead of failing the server', async () => {
		const notARepo = mkdtempSync(join(tmpdir(), 'guard-auto-plain-'));
		roots.push(notARepo);
		writeFileSync(join(notARepo, 'delendai.config.json'), POLICY);
		const outcome = await reportGuardHooks({ workspaceRoot: notARepo });
		expect(outcome.lines.join('\n')).toContain(
			'guard hooks could not be inspected',
		);
	});
});

describe('what the report tells a lefthook project', () => {
	it('points a hook lefthook owns at lefthook.yml instead of at `guard install`', async () => {
		const root = repo(POLICY);
		writeFileSync(
			join(root, 'lefthook.yml'),
			'pre-commit:\n  commands:\n    lint:\n      run: bun run lint\n',
		);
		// Every hook lefthook does not own is guarded the ordinary way.
		for (const hook of [
			'reference-transaction',
			'pre-push',
			'post-checkout',
			'post-merge',
		]) {
			const dir = join(root, '.git', 'hooks');
			writeFileSync(
				join(dir, hook),
				'#!/bin/sh\n# >>> delendai guard (managed by delendai; remove this block to stop enforcing the development policy) >>>\n',
			);
		}

		const outcome = await reportGuardHooks({ workspaceRoot: root });
		const text = outcome.lines.join('\n');

		expect(text).toMatch(/pre-commit: absent — .*lefthook\.yml/u);
		expect(text).not.toContain('run `delendai guard install`');
	});
});
