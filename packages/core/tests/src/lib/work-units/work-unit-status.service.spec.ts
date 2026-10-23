/**
 * work-unit-status.service.spec.ts — what `work status`, `work swarm` and
 * `work doctor` print for the cases the main work spec does not reach:
 * an unanchored or detached checkout, a profile with no work refs, an
 * adopted policy, the `--format=json` switch and a missing working tree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const repoWith = (config: object | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-status-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	if (config !== undefined) {
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify(config),
		);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const contextFor = (
	root: string,
	globals: { readonly json?: boolean; readonly format?: string } = {},
): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<IWorkUnitContext['globals'], 'workspace' | 'json'>(
			{
				workspace: root,
				json: globals.json ?? false,
				...(globals.format === undefined
					? {}
					: { format: globals.format }),
			},
		),
	});

const printed = async (
	run: () => Promise<IWorkUnitResult>,
): Promise<string> => {
	const chunks: string[] = [];
	const spy = vi
		.spyOn(process.stdout, 'write')
		.mockImplementation((chunk: unknown) => {
			chunks.push(String(chunk));
			return true;
		});
	try {
		await run();
	} finally {
		spy.mockRestore();
	}
	return chunks.join('');
};

const PR_MODEL = {
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
};

describe('work status, printed', () => {
	it('says why a checkout on another branch is not anchored', async () => {
		const root = repoWith(PR_MODEL);
		git(root, 'switch', '-q', '-c', 'elsewhere');
		const out = await printed(() =>
			runWorkUnit(['status'], contextFor(root)),
		);
		expect(out).toContain('checkout on      elsewhere');
		expect(out).toMatch(/anchored {9}NO — /u);
	});

	it('names a detached checkout', async () => {
		const root = repoWith(PR_MODEL);
		git(root, 'switch', '-q', '--detach');
		const out = await printed(() =>
			runWorkUnit(['status'], contextFor(root)),
		);
		expect(out).toContain('checkout on      (detached)');
	});

	it('says a profile that works in its own worktrees does not anchor the checkout', async () => {
		const root = repoWith({ development: { profile: 'worktree-pr' } });
		const out = await printed(() =>
			runWorkUnit(['status'], contextFor(root)),
		);
		expect(out).toContain(
			'not required (this profile does not anchor the checkout)',
		);
	});

	it('answers as data for --format=json', async () => {
		const root = repoWith(PR_MODEL);
		const result = await runWorkUnit(
			['status'],
			contextFor(root, { format: 'json' }),
		);
		expect(result.data).toMatchObject({ profile: 'shared-checkout-pr' });
	});
});

describe('work swarm and work doctor', () => {
	it('prints the swarm, with nothing to sort out in a quiet repository', async () => {
		const root = repoWith(PR_MODEL);
		const out = await printed(() =>
			runWorkUnit(['swarm'], contextFor(root)),
		);
		expect(out).toContain('publications     0');
		expect(out).toContain('to sort out      nothing');
	});

	it('prints the doctor report, and answers it as data when asked', async () => {
		const root = repoWith(PR_MODEL);
		const out = await printed(() =>
			runWorkUnit(['doctor'], contextFor(root)),
		);
		expect(out.length).toBeGreaterThan(0);
		const asData = await runWorkUnit(
			['doctor'],
			contextFor(root, { json: true }),
		);
		expect(asData.data).toBeDefined();
	});

	it('refuses the doctor outside a working tree', async () => {
		const outside = mkdtempSync(join(tmpdir(), 'work-status-none-'));
		roots.push(outside);
		const result = await runWorkUnit(['doctor'], contextFor(outside));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('is not inside a git working tree');
	});
});
