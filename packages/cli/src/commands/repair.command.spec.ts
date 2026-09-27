/**
 * repair.command.spec.ts — recording the decision that closes a startup
 * repair task, from a plain shell, with no server and no database.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	parseRepairResolutions,
	REPAIR_RESOLUTIONS_PATH,
} from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createRepairCommand } from './repair.command';

const roots: string[] = [];

const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-repair-'));
	roots.push(root);
	return root;
};

// The parser consumes `--workspace` and resolves it, or the cwd, into
// `globals.workspace`; a command never sees it among its arguments.
const contextFor = (
	root: string,
	json = false,
	workspaceFlag = root,
): ICliCommandContext =>
	fakePartial<ICliCommandContext>({
		cwd: root,
		globals: fakePartial<ICliCommandContext['globals']>({
			json,
			workspace: workspaceFlag,
		}),
	});

const fileIn = (root: string): string => join(root, REPAIR_RESOLUTIONS_PATH);

const recorded = (root: string) =>
	parseRepairResolutions(readFileSync(fileIn(root), 'utf8')).resolutions;

const command = createRepairCommand();

const resolveArgs = (extra: readonly string[] = []): readonly string[] => [
	'resolve',
	'task-1',
	'--evidence=digest-1',
	'--decision=accepted-loss',
	'--reason=investigated in x00546; discarded deliberately',
	'--by=cartago',
	...extra,
];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('delendai repair (x00552)', () => {
	it('records a decision into the tracked file', async () => {
		const root = workspace();
		const result = await command.run(resolveArgs(), contextFor(root));
		expect(result.code).toBe(0);
		expect(recorded(root)).toEqual([
			{
				taskId: 'task-1',
				evidenceDigest: 'digest-1',
				decision: 'accepted-loss',
				reason: 'investigated in x00546; discarded deliberately',
				decidedBy: 'cartago',
				decidedAt: expect.any(String),
			},
		]);
	});

	it('supersedes an earlier answer to the same evidence', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		await command.run(
			[
				'resolve',
				'task-1',
				'--evidence=digest-1',
				'--decision=resolved-elsewhere',
				'--reason=the commits are on the release branch',
				'--by=cartago',
			],
			contextFor(root),
		);
		const entries = recorded(root);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.decision).toBe('resolved-elsewhere');
	});

	it('keeps a decision about different evidence for the same task', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		await command.run(
			[
				'resolve',
				'task-1',
				'--evidence=digest-2',
				'--decision=not-a-problem',
				'--reason=a second, different observation',
				'--by=cartago',
			],
			contextFor(root),
		);
		expect(recorded(root)).toHaveLength(2);
	});

	it('refuses to record without evidence, a decision and a reason', async () => {
		const root = workspace();
		for (const args of [
			['resolve'],
			['resolve', 'task-1'],
			['resolve', 'task-1', '--evidence=d'],
			['resolve', 'task-1', '--evidence=d', '--decision=nonsense'],
			[
				'resolve',
				'task-1',
				'--evidence=d',
				'--decision=accepted-loss',
				'--reason=x',
			],
		]) {
			const result = await command.run(args, contextFor(root));
			expect(result.code).not.toBe(0);
			expect(result.error).toContain('--evidence=');
		}
	});

	it('refuses to record beside entries it cannot read', async () => {
		const root = workspace();
		mkdirSync(dirname(fileIn(root)), { recursive: true });
		writeFileSync(
			fileIn(root),
			JSON.stringify({ version: 1, resolutions: [{ taskId: 'a' }] }),
			'utf8',
		);
		const result = await command.run(resolveArgs(), contextFor(root));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('cannot be read');
	});

	it('lists nothing when no decision was ever taken', async () => {
		const root = workspace();
		const result = await command.run(['list'], contextFor(root, true));
		expect(result.code).toBe(0);
		expect(result.data).toEqual({
			path: fileIn(root),
			resolutions: [],
			errors: [],
		});
	});

	it('lists what was recorded, and defaults to listing', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		const result = await command.run([], contextFor(root, true));
		expect(result.code).toBe(0);
		expect(
			(result.data as { resolutions: readonly unknown[] }).resolutions,
		).toHaveLength(1);
	});

	it('prints a human listing without the default JSON print', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		const result = await command.run(['list'], contextFor(root));
		expect(result.suppressDefaultPrint).toBe(true);
	});

	it('reports ignored entries when listing', async () => {
		const root = workspace();
		mkdirSync(dirname(fileIn(root)), { recursive: true });
		writeFileSync(
			fileIn(root),
			JSON.stringify({ version: 1, resolutions: [{ taskId: 'a' }] }),
			'utf8',
		);
		const result = await command.run(['list'], contextFor(root, true));
		expect(result.code).not.toBe(0);
		expect(
			(result.data as { errors: readonly string[] }).errors,
		).toHaveLength(1);
	});

	it('forgets a decision that should not stand', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		const result = await command.run(
			['forget', 'task-1'],
			contextFor(root),
		);
		expect(result.code).toBe(0);
		expect(recorded(root)).toEqual([]);
	});

	it('refuses to forget what was never recorded', async () => {
		const root = workspace();
		await command.run(resolveArgs(), contextFor(root));
		const missing = await command.run(
			['forget', 'other-task'],
			contextFor(root),
		);
		expect(missing.code).not.toBe(0);
		expect(missing.error).toContain('No resolution is recorded');
		const usage = await command.run(['forget'], contextFor(root));
		expect(usage.error).toContain('repair forget');
	});

	it('rejects an unknown subcommand', async () => {
		const result = await command.run(['nonsense'], contextFor(workspace()));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('Unknown subcommand');
	});

	it('records into an explicit workspace, not the cwd', async () => {
		const target = workspace();
		const elsewhere = workspace();
		await command.run(resolveArgs(), contextFor(elsewhere, false, target));
		expect(recorded(target)).toHaveLength(1);
		expect(existsSync(fileIn(elsewhere))).toBe(false);
	});
});

describe('a decision never lands in the shared checkout (x00689)', () => {
	it('is refused in a pinned shared checkout and recorded in a linked worktree', async () => {
		const root = workspace();
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, stdio: 'ignore' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'a@example.com');
		git('config', 'user.name', 'A');
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
		git('commit', '-q', '--no-verify', '-m', 'base');

		const shared = await command.run(resolveArgs(), contextFor(root));
		expect(shared.code).not.toBe(0);
		expect(shared.error).toContain('work enter --kind=repair');
		expect(existsSync(fileIn(root))).toBe(false);

		const unit = join(root, 'unit');
		git(
			'worktree',
			'add',
			'-q',
			'-b',
			'delendai/wip/a/repair/batch-all-g1/t',
			unit,
		);
		const inUnit = await command.run(resolveArgs(), contextFor(unit));
		expect(inUnit.code).toBe(0);
		expect(recorded(unit)).toHaveLength(1);

		// As the refusal says: from the shared checkout, --workspace=<unit>
		// (x00705).
		const named = await command.run(
			['resolve', 'task-2', ...resolveArgs().slice(2)],
			contextFor(root, false, unit),
		);
		expect(named.code).toBe(0);
		expect(recorded(unit)).toHaveLength(2);
		expect(existsSync(fileIn(root))).toBe(false);
	});
});
