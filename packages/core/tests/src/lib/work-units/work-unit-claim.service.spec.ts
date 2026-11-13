/**
 * work-unit-claim.service.spec.ts — an orphaned publication is taken
 * over through `work claim`, kept, and its history names both agents.
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
import { readUnitLease } from '@delendai/core/lib/work-units/unit-lease.store';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const repoWith = (config: object | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-claim-'));
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

const PUBLICATION = 'delendai/pr/agent-a/implement/x00001-S1-g1/topic';

describe('work claim of an orphaned publication', () => {
	it('adopts a publication whose unit ended, keeps it, and names both agents', async () => {
		const root = repoWith(PR_MODEL);
		git(root, 'switch', '-q', '-c', PUBLICATION);
		writeFileSync(join(root, 'work.txt'), 'work\n');
		git(root, 'add', '-A');
		// Dated a month back: a delivery inside the recovery window waits for
		// its pull request and is not orphaned, so the unit is long gone.
		const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
		execFileSync('git', ['commit', '-q', '-m', 'work'], {
			cwd: root,
			env: {
				...process.env,
				GIT_AUTHOR_DATE: longAgo,
				GIT_COMMITTER_DATE: longAgo,
			},
		});
		const tip = git(root, 'rev-parse', 'HEAD');
		git(root, 'switch', '-q', 'develop');
		const before = await printed(() =>
			runWorkUnit(['status'], contextFor(root)),
		);
		expect(before).toContain(
			`orphaned         ${PUBLICATION} (agent-a, finished`,
		);
		const out = await printed(() =>
			runWorkUnit(
				['claim', `--ref=${PUBLICATION}`, '--agent=agent-b'],
				contextFor(root),
			),
		);
		expect(out).toContain('was agent-a, now agent-b');
		const adopted = 'delendai/wip/agent-b/implement/x00001-S1-g2/topic';
		expect(git(root, 'rev-parse', adopted)).toBe(tip);
		expect(git(root, 'rev-parse', PUBLICATION)).toBe(tip);
		const lease = await readUnitLease(
			git(
				root,
				'rev-parse',
				'--path-format=absolute',
				'--git-common-dir',
			),
			adopted,
		);
		expect(lease?.owner.agent).toBe('agent-b');
		expect(lease?.handedFrom?.map((hand) => hand.agent)).toEqual([
			'agent-a',
		]);
		const after = await printed(() =>
			runWorkUnit(['status'], contextFor(root)),
		);
		expect(after).not.toContain(`orphaned         ${PUBLICATION}`);
		expect(after).toContain(`publication      ${PUBLICATION}: 0 behind`);
	});
});
