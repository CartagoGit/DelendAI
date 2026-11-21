/**
 * init-vscode-settings.spec.ts — the editor never watches or searches the
 * cache: a new settings file has it, an existing one gains it, and a
 * value the person set for it stays.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';

import { ensureJsoncAssociation } from './init-vscode-settings';
import { VSCODE_SETTINGS_RELPATH } from '../../contracts/constants/init.constant';

const roots: string[] = [];
afterAll(async () => {
	await Promise.all(
		roots.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const workspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-init-vscode-'));
	roots.push(root);
	return root;
};

const settingsOf = async (root: string): Promise<Record<string, unknown>> =>
	parseJsonc(await readFile(join(root, VSCODE_SETTINGS_RELPATH), 'utf8'))
		.value as Record<string, unknown>;

describe('the cache is excluded from the editor', () => {
	it('writes both exclusions into a settings file that does not exist', async () => {
		const root = await workspace();
		await ensureJsoncAssociation(root);
		const settings = await settingsOf(root);
		expect(settings['files.watcherExclude']).toEqual({ '.cache/**': true });
		expect(settings['search.exclude']).toEqual({ '.cache/**': true });
	});

	it('merges them into an existing file, keeping its keys and comments', async () => {
		const root = await workspace();
		await mkdir(join(root, '.vscode'), { recursive: true });
		await writeFile(
			join(root, VSCODE_SETTINGS_RELPATH),
			`{
\t// Mi configuracion
\t"editor.formatOnSave": true,
\t"files.watcherExclude": {
\t\t"**/node_modules/**": true
\t}
}
`,
			'utf8',
		);
		await ensureJsoncAssociation(root);
		const text = await readFile(
			join(root, VSCODE_SETTINGS_RELPATH),
			'utf8',
		);
		expect(text).toContain('// Mi configuracion');
		const settings = await settingsOf(root);
		expect(settings['editor.formatOnSave']).toBe(true);
		expect(settings['files.watcherExclude']).toEqual({
			'**/node_modules/**': true,
			'.cache/**': true,
		});
		expect(settings['search.exclude']).toEqual({ '.cache/**': true });
	});

	it('keeps a value the person set for the cache', async () => {
		const root = await workspace();
		await mkdir(join(root, '.vscode'), { recursive: true });
		await writeFile(
			join(root, VSCODE_SETTINGS_RELPATH),
			`{ "files.watcherExclude": { ".cache/**": false } }\n`,
			'utf8',
		);
		await ensureJsoncAssociation(root);
		const settings = await settingsOf(root);
		expect(settings['files.watcherExclude']).toEqual({
			'.cache/**': false,
		});
		expect(settings['search.exclude']).toEqual({ '.cache/**': true });
	});

	it('names the configured directory when the cache is not under .cache', async () => {
		const root = await workspace();
		await writeFile(
			join(root, 'delendai.config.json'),
			'{ "cacheDir": "build/dl" }\n',
			'utf8',
		);
		await ensureJsoncAssociation(root);
		expect((await settingsOf(root))['search.exclude']).toEqual({
			'build/dl/**': true,
		});
	});
});
