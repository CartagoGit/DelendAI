import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scssPlugin } from './scss-plugin';

interface IResolveArgs {
	readonly path: string;
	readonly resolveDir: string;
}

interface ILoadArgs {
	readonly path: string;
}

type ResolveCallback = (args: IResolveArgs) => unknown;
type LoadCallback = (args: ILoadArgs) => unknown;

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe('scssPlugin', () => {
	it('compiles relative Sass modules and exposes named and default exports', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'mcp-vertex-scss-'));
		temporaryDirectories.push(directory);
		await writeFile(join(directory, '_tokens.scss'), '$accent: #5b8cff;');
		await writeFile(
			join(directory, 'fixture.scss'),
			'@use "./tokens"; .fixture { color: tokens.$accent; }',
		);

		const { resolveCallback, loadCallback } = await registerPlugin();
		const resolved = resolveCallback({
			path: './fixture.scss?raw',
			resolveDir: directory,
		}) as { path: string; namespace: string };
		expect(resolved).toEqual({
			path: join(directory, 'fixture.scss'),
			namespace: 'mcp-vertex-scss',
		});
		const loaded = (await loadCallback({ path: resolved.path })) as {
			contents: string;
			loader: string;
		};
		const module = (await import(
			`data:text/javascript,${encodeURIComponent(loaded.contents)}`
		)) as { default: string; compiledCss: string };
		expect(loaded.loader).toBe('js');
		expect(module.default).toBe(module.compiledCss);
		expect(module.default).toContain('color: #5b8cff');
	});

	it('fails the bundle when Sass is invalid', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'mcp-vertex-scss-'));
		temporaryDirectories.push(directory);
		await writeFile(join(directory, 'broken.scss'), '.broken { color: ;');

		const { loadCallback } = await registerPlugin();
		await expect(
			loadCallback({ path: join(directory, 'broken.scss') }),
		).rejects.toThrow('SCSS compile failed');
	});
});

const registerPlugin = async (): Promise<{
	readonly resolveCallback: ResolveCallback;
	readonly loadCallback: LoadCallback;
}> => {
	let resolveCallback: ResolveCallback | undefined;
	let loadCallback: LoadCallback | undefined;
	const builder = {
		onResolve: (_options: unknown, callback: ResolveCallback) => {
			resolveCallback = callback;
		},
		onLoad: (_options: unknown, callback: LoadCallback) => {
			loadCallback = callback;
		},
	};
	await scssPlugin.setup(builder as unknown as import('bun').PluginBuilder);
	if (resolveCallback === undefined || loadCallback === undefined) {
		throw new Error('SCSS plugin did not register both callbacks');
	}
	return { resolveCallback, loadCallback };
};
