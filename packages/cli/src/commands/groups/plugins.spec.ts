/**
 * plugins.spec.ts — `plugin doctor` reads what each plugin last said
 * about working in this workspace.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { pluginsCommands } from './plugins';

const doctor = pluginsCommands.find(
	(command) => command.name === 'plugin doctor',
);

describe('plugin doctor', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const run = async (cwd: string) =>
		doctor?.run(
			[],
			fakePartial<ICliCommandContext>({
				cwd,
				globals: fakePartial<ICliCommandContext['globals']>({}),
			}),
		);

	it('says how to get an answer when nothing has registered yet', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'plugin-doctor-'));
		dirs.push(cwd);
		expect(JSON.stringify(await run(cwd))).toContain(
			'No plugin has registered in this workspace yet',
		);
	});

	it('lists each plugin with its state, what is missing and the fix', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'plugin-doctor-'));
		dirs.push(cwd);
		const dir = join(cwd, '.cache/delendai/records/plugin-availability');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'roadmap.json'),
			JSON.stringify({
				plugin: 'roadmap',
				state: 'needs-configuration',
				missing: 'no roadmap file',
				fix: 'set plugins.roadmap.options.file',
				readAt: '2026-10-14T08:00:00.000Z',
			}),
		);
		writeFileSync(
			join(dir, 'memory.json'),
			JSON.stringify({
				plugin: 'memory',
				state: 'registered',
				readAt: '2026-10-14T08:00:00.000Z',
			}),
		);
		const out = JSON.stringify(await run(cwd));
		expect(out).toContain(
			'! roadmap [needs-configuration]: no roadmap file',
		);
		expect(out).toContain('fix: set plugins.roadmap.options.file');
		expect(out).toContain('* memory [registered]');
	});
});

describe('plugin search and add', () => {
	const command = (name: string) =>
		pluginsCommands.find((entry) => entry.name === name);
	const calls: Array<{ tool: string; args: unknown }> = [];
	const ctxAnswering = (answer: unknown) =>
		fakePartial<ICliCommandContext>({
			cwd: '/w',
			globals: fakePartial<ICliCommandContext['globals']>({}),
			request: async <T>(tool: string, args: object): Promise<T> => {
				calls.push({ tool, args });
				return answer as T;
			},
		});

	it('searches the registry with or without a query', async () => {
		await command('plugin search')?.run(
			['memory'],
			ctxAnswering({ ok: true }),
		);
		await command('plugin search')?.run([], ctxAnswering({ ok: true }));
		expect(calls.slice(-2)).toEqual([
			{ tool: 'delendai_plugin_search', args: { query: 'memory' } },
			{ tool: 'delendai_plugin_search', args: {} },
		]);
	});

	it('formats the recipe to adopt a plugin, and passes a refusal on', async () => {
		const recipe = await command('plugin add')?.run(
			['memory', '--consent'],
			ctxAnswering({
				ok: true,
				entry: {
					id: 'memory',
					package: '@delendai/memory',
					origin: 'first-party',
				},
				steps: [
					{ kind: 'install', summary: 'bun add @delendai/memory' },
				],
				alreadyAdopted: true,
			}),
		);
		const text = JSON.stringify(recipe);
		expect(text).toContain('already adopted');
		expect(text).toContain('[install] bun add @delendai/memory');
		expect(calls.at(-1)).toEqual({
			tool: 'delendai_plugin_add',
			args: { id: 'memory', consent: true },
		});
		const refused = await command('plugin add')?.run(
			['nope'],
			ctxAnswering({ ok: false, error: { reason: 'unknown plugin' } }),
		);
		expect(JSON.stringify(refused)).toContain('unknown plugin');
		expect(
			JSON.stringify(
				await command('plugin add')?.run([], ctxAnswering({})),
			),
		).toContain('missing plugin id');
	});
});
