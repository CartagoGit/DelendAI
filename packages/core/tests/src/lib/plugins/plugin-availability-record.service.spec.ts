/**
 * plugin-availability-record.service.spec.ts — what a plugin said about
 * working here is kept from its registration for every surface to read.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { registerPluginWithLifecycle } from '@delendai/core/lib/plugins/load-plugins-runtime.helper';
import {
	pluginAvailabilityDir,
	readAndRecordAvailability,
	readPluginAvailabilities,
} from '@delendai/core/lib/plugins/plugin-availability-record.service';
import type {
	IMcpPlugin,
	IMcpPluginContext,
} from '@delendai/core/lib/plugins/plugin-contract';

const CACHE = '.cache/delendai';

describe('plugin availability record', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const workspace = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'availability-'));
		dirs.push(root);
		return root;
	};
	const ctxIn = (root: string): IMcpPluginContext =>
		fakePartial<IMcpPluginContext>({
			workspace: fakePartial<IMcpPluginContext['workspace']>({ root }),
			cacheDir: CACHE,
			options: {},
		});

	it('keeps each answer with the time it was read, by plugin', async () => {
		const root = workspace();
		const at = () => new Date('2026-10-14T08:00:00.000Z');
		await readAndRecordAvailability(
			{
				name: 'roadmap',
				availability: () => ({
					state: 'needs-configuration',
					missing: 'no roadmap file',
					fix: 'set plugins.roadmap.options.file',
				}),
			},
			ctxIn(root),
			at,
		);
		await readAndRecordAvailability({ name: 'memory' }, ctxIn(root), at);
		expect(await readPluginAvailabilities(root, CACHE)).toEqual([
			{
				plugin: 'memory',
				state: 'registered',
				readAt: '2026-10-14T08:00:00.000Z',
			},
			{
				plugin: 'roadmap',
				state: 'needs-configuration',
				missing: 'no roadmap file',
				fix: 'set plugins.roadmap.options.file',
				readAt: '2026-10-14T08:00:00.000Z',
			},
		]);
	});

	it('reads nothing where nothing registered, and skips a file cut short', async () => {
		const root = workspace();
		expect(await readPluginAvailabilities(root, CACHE)).toEqual([]);
		await readAndRecordAvailability({ name: 'memory' }, ctxIn(root));
		writeFileSync(
			join(pluginAvailabilityDir(root, CACHE), 'broken.json'),
			'{',
		);
		writeFileSync(
			join(pluginAvailabilityDir(root, CACHE), 'notes.txt'),
			'x',
		);
		const records = await readPluginAvailabilities(root, CACHE);
		expect(records.map((record) => record.plugin)).toEqual(['memory']);
	});

	it('still answers when the answer cannot be kept', async () => {
		const root = workspace();
		writeFileSync(join(root, '.cache'), 'a file where the directory goes');
		expect(
			await readAndRecordAvailability({ name: 'memory' }, ctxIn(root)),
		).toEqual({ state: 'registered' });
	});

	it('is read and kept by every registration', async () => {
		const root = workspace();
		const plugin = fakePartial<IMcpPlugin>({
			name: 'style-convention',
			availability: () => ({ state: 'library' }),
			register: () => ({ tools: [] }),
		});
		await registerPluginWithLifecycle({
			plugin,
			ctx: ctxIn(root),
			timeoutMs: 1000,
		});
		const [record] = await readPluginAvailabilities(root, CACHE);
		expect(record).toMatchObject({
			plugin: 'style-convention',
			state: 'library',
		});
	});
});
