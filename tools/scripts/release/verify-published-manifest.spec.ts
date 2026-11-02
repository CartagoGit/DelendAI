import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	readVerifyPackageInput,
	verifyPackage,
	type IRegistryEntryLike,
	type ISourceManifestLike,
} from './verify-published-manifest.script';

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

interface IFixtureOptions {
	readonly pkgDir?: string;
	readonly packageJson?: Record<string, unknown>;
	readonly registryEntries?: readonly IRegistryEntryLike[];
	readonly manifest?: ISourceManifestLike;
	readonly createMainFile?: boolean;
	readonly createTypesFile?: boolean;
	readonly packFiles?: readonly { readonly path: string }[];
}

const createFixture = async (
	options: IFixtureOptions = {},
): Promise<
	Awaited<ReturnType<typeof readVerifyPackageInput>> & {
		readonly root: string;
	}
> => {
	const root = await mkdtemp(join(tmpdir(), 'verify-published-manifest-'));
	tempRoots.push(root);
	const pkgDir = options.pkgDir ?? 'plugins/search';
	const absPkgDir = join(root, pkgDir);
	await mkdir(absPkgDir, { recursive: true });
	const packageJson = {
		name: '@delendai/search',
		version: '0.1.1',
		main: './dist/index.js',
		types: './dist/index.d.ts',
		files: ['dist', 'README.md'],
		exports: {
			'.': {
				types: './dist/index.d.ts',
				import: './dist/index.js',
			},
		},
		...options.packageJson,
	};
	await writeFile(
		join(absPkgDir, 'package.json'),
		`${JSON.stringify(packageJson, null, '\t')}\n`,
	);
	if (options.createMainFile ?? true) {
		await mkdir(join(absPkgDir, 'dist'), { recursive: true });
		await writeFile(
			join(absPkgDir, 'dist/index.js'),
			'export default 1;\n',
		);
	}
	if (options.createTypesFile ?? true) {
		await mkdir(join(absPkgDir, 'dist'), { recursive: true });
		await writeFile(
			join(absPkgDir, 'dist/index.d.ts'),
			'declare const value: 1;\nexport default value;\n',
		);
	}
	const manifest =
		options.manifest ??
		({
			id: 'search',
			package: '@delendai/search',
			version: '0.1.1',
			permissions: ['filesystem-read'],
		} satisfies ISourceManifestLike);
	await writeFile(
		join(absPkgDir, 'plugin.manifest.ts'),
		`export default ${JSON.stringify(manifest, null, '\t')} as const;\n`,
	);
	const input = await readVerifyPackageInput(root, pkgDir);
	return {
		...input,
		registryEntries:
			options.registryEntries ??
			([
				{
					id: 'search',
					package: '@delendai/search',
					summary: 'Code search plugin.',
					permissions: ['filesystem-read'],
				},
			] satisfies readonly IRegistryEntryLike[]),
		...(options.packFiles !== undefined
			? { packedFiles: options.packFiles }
			: {}),
		root,
	};
};

describe('verify-published-manifest', () => {
	it('accepts a coherent package, registry entry, and manifest', async () => {
		const input = await createFixture();

		const result = verifyPackage(input);

		expect(result.ok).toBe(true);
		expect(result.reasons).toEqual([]);
	});

	it('detects a registry package mismatch', async () => {
		const input = await createFixture({
			registryEntries: [
				{
					id: 'search',
					package: '@delendai/not-search',
					summary: 'Wrong package.',
				},
			],
		});

		const result = verifyPackage(input);

		expect(result.ok).toBe(false);
		expect(result.reasons).toContain(
			'registry entry package mismatch: registry="@delendai/not-search" package.json="@delendai/search"',
		);
	});

	it('detects an invalid semver version', async () => {
		const input = await createFixture({
			packageJson: {
				version: 'next',
			},
			manifest: {
				id: 'search',
				package: '@delendai/search',
				version: 'next',
				permissions: ['filesystem-read'],
			},
		});

		const result = verifyPackage(input);

		expect(result.ok).toBe(false);
		expect(result.reasons).toContain(
			'package version is not valid semver: "next"',
		);
	});

	it('detects a declared main missing from the packed artifact list', async () => {
		const input = await createFixture({
			createMainFile: false,
			createTypesFile: false,
			packFiles: [{ path: 'README.md' }],
		});

		const result = verifyPackage(input);

		expect(result.ok).toBe(false);
		expect(result.reasons).toContain(
			'npm pack --dry-run does not include declared main: "./dist/index.js"',
		);
	});
});
