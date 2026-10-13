/**
 * host-packages.helper.spec.ts — a user's plugin imports the host's own
 * `@delendai/*` packages, not whatever its project has installed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	packageRootOf,
	rewriteHostImports,
	shareHostPackages,
} from '@delendai/core/lib/plugins/host-packages.helper';

type IRuntime = NonNullable<Parameters<typeof shareHostPackages>[1]>;
type ILoad = (args: { readonly path: string }) => Promise<{
	readonly contents: string;
	readonly loader: string;
}>;

const known = (specifier: string): string | undefined =>
	specifier.startsWith('@delendai/core')
		? `/host/${specifier.slice('@delendai/'.length)}.ts`
		: undefined;

describe('rewriteHostImports', () => {
	it('points every import form of a known package at the host', () => {
		const source = [
			"import { definePlugin } from '@delendai/core/public';",
			'export * from "@delendai/core";',
			"import '@delendai/core/side-effect';",
			"const lazy = await import('@delendai/core/public');",
			"const old = require('@delendai/core');",
		].join('\n');
		expect(rewriteHostImports(source, known)).toBe(
			[
				"import { definePlugin } from '/host/core/public.ts';",
				'export * from "/host/core.ts";',
				"import '/host/core/side-effect.ts';",
				"const lazy = await import('/host/core/public.ts');",
				"const old = require('/host/core.ts');",
			].join('\n'),
		);
	});

	it('leaves unknown packages, other packages and plain strings alone', () => {
		const source = [
			"import { z } from 'zod';",
			"import { x } from '@delendai/unknown';",
			"const label = '@delendai/core';",
		].join('\n');
		expect(rewriteHostImports(source, known)).toBe(source);
	});

	it('writes a Windows path with forward slashes', () => {
		expect(
			rewriteHostImports(
				"import a from '@delendai/core';",
				() => 'C:\\host\\core.ts',
			),
		).toBe("import a from 'C:/host/core.ts';");
	});
});

describe('shareHostPackages', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	const plugin = (): { root: string; entry: string } => {
		const root = mkdtempSync(join(tmpdir(), 'host-packages-'));
		dirs.push(root);
		writeFileSync(join(root, 'package.json'), '{}');
		mkdirSync(join(root, 'src'), { recursive: true });
		mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
		const entry = join(root, 'src', 'index.ts');
		writeFileSync(entry, "import { x } from '@delendai/core/public';\n");
		writeFileSync(
			join(root, 'node_modules', 'dep', 'index.js'),
			"import { y } from '@delendai/core/public';\n",
		);
		return { root, entry };
	};

	const fakeRuntime = () => {
		const loads: { filter: RegExp; load: ILoad }[] = [];
		const runtime: IRuntime = {
			plugin: (definition) =>
				definition.setup({
					onLoad: (options, load) => {
						loads.push({ filter: options.filter, load });
					},
				}),
			resolveSync: (specifier) => {
				const target = known(specifier);
				if (target === undefined) throw new Error('not found');
				return target;
			},
			file: (path) => ({
				text: async () =>
					(await import('node:fs')).readFileSync(path, 'utf8'),
			}),
		};
		return { runtime, loads };
	};

	it('loads the plugin package against the host, once per package', async () => {
		const { root, entry } = plugin();
		const { runtime, loads } = fakeRuntime();
		await shareHostPackages(entry, runtime);
		await shareHostPackages(join(root, 'src', 'other.ts'), runtime);
		expect(await packageRootOf(entry)).toBe(root);
		expect(loads).toHaveLength(1);
		const [only] = loads;
		expect(only?.filter.test(entry)).toBe(true);
		expect(only?.filter.test('/elsewhere/index.ts')).toBe(false);

		const own = await only?.load({ path: entry });
		expect(own).toEqual({
			contents: "import { x } from '/host/core/public.ts';\n",
			loader: 'ts',
		});
		const dependency = await only?.load({
			path: join(root, 'node_modules', 'dep', 'index.js'),
		});
		expect(dependency).toEqual({
			contents: "import { y } from '@delendai/core/public';\n",
			loader: 'js',
		});
	});

	it('does nothing without a runtime that can redirect a load', async () => {
		const { entry } = plugin();
		await expect(
			shareHostPackages(entry, undefined),
		).resolves.toBeUndefined();
	});

	it('takes the file\u2019s own directory when no package.json is above it', async () => {
		expect(await packageRootOf('/no-package-here/src/index.ts')).toBe(
			'/no-package-here/src',
		);
	});
});
