/**
 * repair.command.spec.ts — recording the decision that closes a startup
 * repair task, from a plain shell, with no server and no database.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const contextFor = (root: string, json = false): ICliCommandContext =>
	fakePartial<ICliCommandContext>({
		cwd: root,
		globals: fakePartial<ICliCommandContext['globals']>({ json }),
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
		await command.run(
			resolveArgs([`--workspace=${target}`]),
			contextFor(elsewhere),
		);
		expect(recorded(target)).toHaveLength(1);
	});
});
