/**
 * `delendai work claim` — the subcommand an agent actually types.
 *
 * The service is tested on its own; this is the wiring around it: the
 * listing that takes nothing, the refusals, and the one path that
 * actually moves a ref.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { createWorkCommand } from './work.command';

const roots: string[] = [];
const captured = { out: '' };

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const capture = (): void => {
	captured.out = '';
	vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
		captured.out += String(chunk);
		return true;
	});
};

const ctxFor = (workspace: string): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: workspace,
		globals: fakePartial<ICliCommandContext['globals'], 'workspace'>({
			workspace,
		}),
	});

/** A project with a declared policy and a namespace, like this one. */
const project = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-claim-cmd-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-merge',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	execFileSync('git', ['add', '-A'], { cwd: root });
	execFileSync(
		'git',
		[
			'-c',
			'user.email=t@t',
			'-c',
			'user.name=t',
			'commit',
			'-q',
			'-m',
			'base',
		],
		{ cwd: root },
	);
	return root;
};

const ref = (root: string, name: string): void => {
	const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8',
	}).trim();
	execFileSync('git', ['update-ref', `refs/heads/${name}`, sha], {
		cwd: root,
	});
};

const has = (root: string, name: string): boolean => {
	try {
		execFileSync(
			'git',
			['rev-parse', '--verify', '--quiet', `refs/heads/${name}`],
			{
				cwd: root,
				stdio: 'ignore',
			},
		);
		return true;
	} catch {
		return false;
	}
};

describe('work claim', () => {
	it('lists what somebody else holds, and takes nothing', async () => {
		const root = project();
		ref(root, 'delendai/wip/other/x00001-S1-g1/topic');
		capture();

		const result = await createWorkCommand().run(
			['claim', '--agent=mine'],
			ctxFor(root),
		);

		expect(result.code).toBe(EXIT_CODE.OK);
		expect(captured.out).toContain('delendai/wip/other/x00001-S1-g1/topic');
		expect(captured.out).toContain('delendai/wip/mine/x00001-S1-g2/topic');
		expect(captured.out).toContain('work claim --ref=');
		// Listing is not taking.
		expect(has(root, 'delendai/wip/other/x00001-S1-g1/topic')).toBe(true);
		expect(has(root, 'delendai/wip/mine/x00001-S1-g2/topic')).toBe(false);
	});

	it('says so when nothing belongs to anybody else', async () => {
		const root = project();
		ref(root, 'delendai/wip/mine/x00001-S1-g1/already-mine');
		capture();

		const result = await createWorkCommand().run(
			['claim', '--agent=mine'],
			ctxFor(root),
		);

		expect(result.code).toBe(EXIT_CODE.OK);
		expect(captured.out).toContain('belongs to anybody else');
	});

	it('moves the ref when one is named', async () => {
		const root = project();
		ref(root, 'delendai/wip/other/x00001-S1-g1/topic');
		capture();

		const result = await createWorkCommand().run(
			[
				'claim',
				'--agent=mine',
				'--ref=delendai/wip/other/x00001-S1-g1/topic',
			],
			ctxFor(root),
		);

		expect(result.code).toBe(EXIT_CODE.OK);
		expect(captured.out).toContain('claimed');
		expect(captured.out).toContain('the same commit, a different name');
		expect(has(root, 'delendai/wip/mine/x00001-S1-g2/topic')).toBe(true);
		expect(has(root, 'delendai/wip/other/x00001-S1-g1/topic')).toBe(false);
	});

	it('refuses a ref this clone cannot resolve', async () => {
		const root = project();
		const result = await createWorkCommand().run(
			['claim', '--agent=mine', '--ref=delendai/wip/other/nope-S1-g1/x'],
			ctxFor(root),
		);
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(result.error).toContain('does not resolve');
	});

	it('refuses a project with no development policy', async () => {
		const root = mkdtempSync(join(tmpdir(), 'work-claim-nopolicy-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });

		const result = await createWorkCommand().run(
			['claim', '--agent=mine'],
			ctxFor(root),
		);

		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(result.error).toContain('development policy');
	});
});
