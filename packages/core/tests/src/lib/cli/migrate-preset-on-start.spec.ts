import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migratePresetOnStart } from '@delendai/core/lib/cli/run-cli';
import { afterEach, describe, expect, it } from 'vitest';

describe('migratePresetOnStart', () => {
	const roots: string[] = [];
	const workspace = async (): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), 'preset-on-start-'));
		roots.push(root);
		return root;
	};
	afterEach(async () => {
		await Promise.all(
			roots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	const lean = JSON.stringify({
		plugins: { docs: {}, git: {}, memory: {}, search: {} },
	});

	it('runs with an explicit relative --config, the way consumers launch it', async () => {
		const root = await workspace();
		await writeFile(join(root, 'custom.config.json'), lean);
		const result = await migratePresetOnStart({
			workspace: root,
			configPath: 'custom.config.json',
		});
		expect(result.outcome).toBe('recorded');
		const journal = await readFile(
			join(root, '.cache/delendai/preset-migration.jsonl'),
			'utf8',
		);
		expect(JSON.parse(journal.trim())).toMatchObject({ retired: 'lean' });
		expect(await readFile(join(root, 'custom.config.json'), 'utf8')).toBe(
			lean,
		);
	});

	it('runs with an absolute --config and with the default config', async () => {
		const root = await workspace();
		await writeFile(join(root, 'delendai.config.json'), lean);
		expect((await migratePresetOnStart({ workspace: root })).outcome).toBe(
			'recorded',
		);
		const other = await workspace();
		const path = join(other, 'abs.json');
		await writeFile(path, lean);
		expect(
			(await migratePresetOnStart({ workspace: other, configPath: path }))
				.outcome,
		).toBe('recorded');
	});

	it('does nothing without a config', async () => {
		expect(
			(await migratePresetOnStart({ workspace: await workspace() }))
				.outcome,
		).toBe('unchanged');
	});
});
