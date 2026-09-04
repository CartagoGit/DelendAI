import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scssPlugin } from './scss-plugin';

interface IResolveArgs {
	readonly path: string;
	readonly resolveDir: string | undefined;
	readonly importer: string;
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
		const directory = await mkdtemp(join(tmpdir(), 'delendai-scss-'));
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
			importer: join(directory, 'consumer.ts'),
		}) as { path: string; namespace: string };
		expect(resolved).toEqual({
			path: join(directory, 'fixture.scss'),
			namespace: 'delendai-scss',
		});
		const loaded = (await loadCallback({ path: resolved.path })) as {
			contents: string;
			loader: string;
		};
		// A dynamic `import('data:text/javascript,...')` does not execute
		// the module in this Bun version — it silently resolves `default`
		// to the data: URL string itself instead of running the code
		// (reproduced directly with `bun -e`, independent of this test
		// runner). Writing to a real file and importing that path is the
		// reliable way to actually execute generated module source.
		const modulePath = join(directory, 'compiled.mjs');
		await writeFile(modulePath, loaded.contents);
		const module = (await import(modulePath)) as {
			default: string;
			compiledCss: string;
		};
		expect(loaded.loader).toBe('js');
		expect(module.default).toBe(module.compiledCss);
		expect(module.default).toContain('color: #5b8cff');
	});

	// x00162 S1 — a globally `Bun.plugin()`-registered instance (as
	// opposed to one passed directly to `Bun.build()`) can invoke
	// onResolve with an empty/undefined `resolveDir` for some import
	// chains, even though Bun's own types declare it as always a
	// string — reproduced live under `bun test --preload`. Falls back
	// to `dirname(importer)`.
	it('falls back to dirname(importer) when resolveDir is empty (global-plugin registration edge case)', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'delendai-scss-'));
		temporaryDirectories.push(directory);
		await writeFile(
			join(directory, 'fixture.scss'),
			'.fixture { color: red; }',
		);

		const { resolveCallback } = await registerPlugin();
		const resolved = resolveCallback({
			path: './fixture.scss',
			resolveDir: '',
			importer: join(directory, 'consumer.ts'),
		}) as { path: string; namespace: string };
		expect(resolved).toEqual({
			path: join(directory, 'fixture.scss'),
			namespace: 'delendai-scss',
		});
	});

	it('fails the bundle when Sass is invalid', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'delendai-scss-'));
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
