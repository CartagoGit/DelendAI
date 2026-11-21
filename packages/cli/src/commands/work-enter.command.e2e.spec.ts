/**
 * work-enter.command.e2e.spec.ts — the parts of the work command that load a
 * plugin or the policy, or run a real git repository: a refused entry, the
 * planning briefing, a delivery that moves the proposal, and the unit flags
 * read from the branch a worktree stands on. Not unit specs: each pays for
 * a real repository or the plugin load, which a cold CI worker bills.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { taskBriefingFor } from '@delendai/core/cli';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoopContext } from '../lib/noop-context.factory';
import {
	briefOnEntering,
	createWorkCommand,
	unitHere,
	withUnitHere,
} from './work.command';

const globals = (json: boolean) => ({
	workspace: '/work',
	json,
	format: json ? ('json' as const) : ('text' as const),
	lang: 'en',
	noColor: true,
	plugins: [],
});

const roots: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('entering a unit from the CLI', () => {
	it('[<6000ms] prints no path when the entry is refused', async () => {
		const result = await createWorkCommand().run(
			['enter', '--proposal=x00001', '--print-path'],
			createNoopContext('/nowhere', {
				workspace: '/work',
				json: true,
				format: 'json',
				lang: 'en',
				noColor: true,
				plugins: [],
			}),
		);
		expect(result.code).not.toBe(0);
	});

	it('[<600ms] asks the planning plugin, which knows no such proposal here', async () => {
		const worktree = mkdtempSync(join(tmpdir(), 'work-briefing-'));
		await briefOnEntering();
		const task = await taskBriefingFor({
			worktree,
			proposal: 'f00001',
			slice: 'S1',
		});
		rmSync(worktree, { recursive: true, force: true });
		expect(task).toBeUndefined();
	});
});

describe('work deliver', () => {
	const command = createWorkCommand();

	const unitRepo = async () => {
		const root = mkdtempSync(join(tmpdir(), 'work-deliver-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, stdio: 'ignore' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'work@example.com');
		git('config', 'user.name', 'Work');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		// The unit's commit, made where a unit commits: on its own branch
		// in a worktree of its own. The shared checkout stays clean.
		const unit = join(root, '.cache', 'delendai', 'unit');
		git(
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/claude-opus-5/implement/x00001-S1-g1/probe',
			unit,
		);
		writeFileSync(join(unit, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', 'a.ts'], { cwd: unit, stdio: 'ignore' });
		execFileSync('git', ['commit', '-q', '-m', 'feat: a'], {
			cwd: unit,
			stdio: 'ignore',
		});
		execFileSync('git', ['worktree', 'remove', '--force', unit], {
			cwd: root,
			stdio: 'ignore',
		});
		return root;
	};

	it('[<600ms] moves the proposal as the agent named, from wherever it stands', async () => {
		const root = await unitRepo();
		const asked: unknown[] = [];
		const ctx = {
			...createNoopContext(root, { ...globals(true), workspace: root }),
			request: async <TOut>(_tool: string, args: object) => {
				asked.push(args);
				return { ok: false, reason: 'held back' } as TOut;
			},
		};
		const unit = [
			'--proposal=x00001',
			'--slice=S1',
			'--agent=claude-opus-5',
			'--topic=probe',
		];
		const result = await command.run(['deliver', ...unit], ctx);
		expect(result.error).toBe('held back');
		expect(asked).toEqual([
			{
				id: 'x00001',
				to: 'in-progress',
				reason: 'Proved and delivered.',
				agent: 'claude-opus-5',
				checkout: root,
			},
		]);
	});
});

describe('unitHere', () => {
	it('[<600ms] reads the unit and its kind (implement, create) from the branch a worktree stands on, for that proposal only', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'unit-here-'));
		const git = (...args: string[]) =>
			execFileSync(
				'git',
				['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
				{
					cwd: dir,
				},
			);
		git('init', '-q', '-b', 'develop');
		writeFileSync(
			join(dir, 'delendai.config.json'),
			'{"development":{"profile":"shared-checkout-pr","branches":{"namespacePrefix":"delendai"}}}\n',
		);
		git('commit', '-q', '--allow-empty', '-m', 'base');
		git(
			'switch',
			'-q',
			'-c',
			'delendai/wip/a/implement/x00001-S2-g2/the-fix',
		);
		expect(await unitHere(dir, 'x00001')).toEqual([
			'--kind=implement',
			'--slice=S2',
			'--generation=2',
			'--topic=the-fix',
		]);
		expect(await unitHere(dir, 'x00002')).toEqual([]);
		git('switch', '-q', '-c', 'delendai/wip/a/create/x00003-all-g1/new');
		expect(await unitHere(dir, 'x00003')).toEqual([
			'--kind=create',
			'--slice=all',
			'--generation=1',
			'--topic=new',
		]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe('withUnitHere', () => {
	const inUnit = () => {
		const dir = mkdtempSync(join(tmpdir(), 'with-unit-here-'));
		const git = (...args: string[]) =>
			execFileSync(
				'git',
				['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
				{ cwd: dir },
			);
		git('init', '-q', '-b', 'develop');
		writeFileSync(
			join(dir, 'delendai.config.json'),
			'{"development":{"profile":"shared-checkout-pr","branches":{"namespacePrefix":"delendai"}}}\n',
		);
		git('commit', '-q', '--allow-empty', '-m', 'base');
		git('switch', '-q', '-c', 'delendai/wip/a/implement/x00001-S2-g2/fix');
		return dir;
	};

	it('[<600ms] adds the unit of the branch when the args name none', async () => {
		const dir = inUnit();
		expect(await withUnitHere(['--proposal=x00001'], dir)).toEqual([
			'--proposal=x00001',
			'--kind=implement',
			'--slice=S2',
			'--generation=2',
			'--topic=fix',
		]);
		rmSync(dir, { recursive: true, force: true });
	});

	it('[<600ms] leaves args that name a unit flag, or no proposal, as they are', async () => {
		const dir = inUnit();
		const named = ['--proposal=x00001', '--generation=1'];
		expect(await withUnitHere(named, dir)).toEqual(named);
		expect(await withUnitHere(['--agent=a'], dir)).toEqual(['--agent=a']);
		rmSync(dir, { recursive: true, force: true });
	});
});
