import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ILoadedPlugin } from '../../../../src/lib/plugins/load-plugins';
import {
	localLazyPluginIdFor,
	managedLazyPluginEntry,
	useLocalLazyEntries,
} from '../../../../src/lib/plugins/managed-lazy-catalog-lookup';
import {
	localLazyCatalogPath,
	localLazyRecordOf,
	recordLocalLazyCatalog,
	useLocalLazyCatalog,
} from '../../../../src/lib/plugins/managed-lazy-local-catalog.service';

describe('the project-local lazy catalog', () => {
	const dirs: string[] = [];
	afterEach(() => {
		useLocalLazyEntries([]);
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('records a plugin the generated catalog lacks, and serves it until its file changes', async () => {
		const root = mkdtempSync(join(tmpdir(), 'local-lazy-'));
		dirs.push(root);
		const file = join(root, 'plugin.ts');
		writeFileSync(file, 'export default {};\n');
		const loaded = fakePartial<ILoadedPlugin>({
			specifier: './plugin.ts',
			resolved: file,
			plugin: fakePartial<ILoadedPlugin['plugin']>({
				name: 'acme-app',
				describe: 'Acme tools',
			}),
			registrations: {
				tools: [
					fakePartial<
						NonNullable<
							ILoadedPlugin['registrations']['tools']
						>[number]
					>({ id: 'acme_build' }),
				],
				knowledge: [
					fakePartial<
						NonNullable<
							ILoadedPlugin['registrations']['knowledge']
						>[number]
					>({ id: 'acme-notes' }),
				],
			},
		});
		const path = localLazyCatalogPath(root, '.cache/delendai');

		expect(
			await recordLocalLazyCatalog(
				path,
				[loaded],
				['./plugin.ts', './other.ts'],
			),
		).toEqual(['./plugin.ts']);
		expect(await useLocalLazyCatalog(path)).toEqual(['./plugin.ts']);
		expect(localLazyPluginIdFor('./plugin.ts')).toBe('acme-app');
		expect(managedLazyPluginEntry('acme-app')).toMatchObject({
			packageSpecifier: file,
			toolIds: ['acme_build'],
			knowledgeIds: ['acme-notes'],
			summary: 'Acme tools',
		});
		expect(managedLazyPluginEntry('acme-app')?.startupActivation).toBe(
			undefined,
		);

		writeFileSync(file, 'export default { changed: true };\n');
		utimesSync(
			file,
			new Date(Date.now() + 5_000),
			new Date(Date.now() + 5_000),
		);
		expect(await useLocalLazyCatalog(path)).toEqual([]);
		expect(localLazyPluginIdFor('./plugin.ts')).toBeUndefined();
	});

	it('serves nothing from a catalog that is missing or unreadable', async () => {
		expect(
			await useLocalLazyCatalog(
				join(tmpdir(), 'no-such-local-lazy.json'),
			),
		).toEqual([]);
	});

	it('activates at start a plugin that contributes what no tool call brings in', async () => {
		const plugin = (registrations: ILoadedPlugin['registrations']) =>
			fakePartial<ILoadedPlugin>({
				specifier: './p.ts',
				resolved: join(tmpdir(), 'no-such-plugin.ts'),
				plugin: fakePartial<ILoadedPlugin['plugin']>({ name: 'p' }),
				registrations,
			});
		const contributing: ILoadedPlugin['registrations'][] = [
			{ errorSinks: [] },
			{
				agentRoles: [
					{
						role: 'migration-runner',
						description: 'd',
						instructions: 'i',
					},
				],
			},
			{ beforeToolCall: () => undefined },
		];
		for (const registrations of contributing)
			expect(
				(await localLazyRecordOf(plugin(registrations)))?.entry
					.startupActivation,
			).toBe(true);
		expect(
			(await localLazyRecordOf(plugin({ tools: [], skills: [] })))?.entry
				.startupActivation,
		).toBeUndefined();
	});
});
