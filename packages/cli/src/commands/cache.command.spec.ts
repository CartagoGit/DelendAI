import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { cacheCommand } from './cache.command';

const roots: string[] = [];

const workspace = async (): Promise<string> => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-cache-cmd-'));
	roots.push(root);
	await writeFile(join(root, 'delendai.config.json'), '{}', 'utf8');
	await mkdir(join(root, '.cache', 'delendai', 'memory'), {
		recursive: true,
	});
	await writeFile(
		join(root, '.cache', 'delendai', 'memory', 'n.json'),
		'keep',
		'utf8',
	);
	return root;
};

const calls: { tool: string; input: unknown }[] = [];

const ctxFor = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>(tool: string, input: unknown) => {
		calls.push({ tool, input });
		return { dryRun: true } as TOut;
	},
	listTools: async () => [],
	close: async () => {},
});

afterEach(() => {
	calls.length = 0;
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const resultData = (result: Awaited<ReturnType<typeof cacheCommand.run>>) =>
	JSON.parse(JSON.stringify(result.data)) as Record<string, unknown>;

describe('cache command', () => {
	it('status reports the epochs and plans without writing', async () => {
		const root = await workspace();
		const before = (await readdir(root, { recursive: true })).sort();
		const out = resultData(
			await cacheCommand.run(['status'], ctxFor(root)),
		);
		expect(out.appliedEpoch).toBeNull();
		expect(out.targetEpoch).toBe(5);
		expect(JSON.stringify(out.pending)).toContain(
			'memory -> results/memory',
		);
		expect((await readdir(root, { recursive: true })).sort()).toEqual(
			before,
		);
	});

	it('lists the registered migrations in order', async () => {
		const root = await workspace();
		const out = resultData(
			await cacheCommand.run(['migrations'], ctxFor(root)),
		);
		const ids = (out.migrations as { fromEpoch: number }[]).map(
			(m) => m.fromEpoch,
		);
		expect(ids).toEqual([0, 1, 2, 3, 4]);
	});

	it('migrate --dry-run changes nothing; migrate applies and keeps the records', async () => {
		const root = await workspace();
		const cacheFile = join(root, '.cache', 'delendai', 'memory', 'n.json');
		await cacheCommand.run(['migrate', '--dry-run'], ctxFor(root));
		expect(await readFile(cacheFile, 'utf8')).toBe('keep');
		const applied = await cacheCommand.run(['migrate'], ctxFor(root));
		expect(applied.code ?? EXIT_CODE.OK).toBe(EXIT_CODE.OK);
		expect(
			await readFile(
				join(root, '.cache', 'delendai', 'results', 'memory', 'n.json'),
				'utf8',
			),
		).toBe('keep');
	});

	it('gc previews by default and applies only on request', async () => {
		const root = await workspace();
		await cacheCommand.run(['gc'], ctxFor(root));
		await cacheCommand.run(['gc', '--apply'], ctxFor(root));
		await cacheCommand.run(['gc', '--apply', '--dry-run'], ctxFor(root));
		expect(calls.map((c) => c.input)).toEqual([
			{ dryRun: true },
			{ dryRun: false },
			{ dryRun: true },
		]);
		expect(calls.every((c) => c.tool === 'delendai_cache_gc')).toBe(true);
	});

	it('rejects an unknown subcommand', async () => {
		const root = await workspace();
		const result = await cacheCommand.run(['nope'], ctxFor(root));
		expect(result.code).toBe(EXIT_CODE.USAGE);
	});
});
