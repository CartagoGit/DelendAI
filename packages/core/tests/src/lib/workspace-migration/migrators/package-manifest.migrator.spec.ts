/**
 * package-manifest.migrator.spec.ts — b00239 S4.
 *
 * Pins the four-case contract of `createPackageManifestMigrator`
 * against a real on-disk `package.json`: file absent, file ours, file
 * foreign, file malformed. Plus targeted coverage for each of the
 * allowed fields (name, dependencies, devDependencies,
 * peerDependencies, optionalDependencies, scripts, workspaces) so a
 * future field is added with eyes open.
 *
 * What this spec is NOT trying to prove:
 *  - The identity-rename table (that lives in identity-renames.spec.ts).
 *  - The package manager's lockfile refresh (S7 owns it).
 *
 * What this spec IS trying to prove:
 *  - Only the seven enumerated fields are touched; everything else
 *    is preserved.
 *  - Deep dep rewrites (`@mcp-vertex/core` → `@delendai/core`) work
 *    on the npm scope atomically.
 *  - A non-delendai scope (e.g. `@types/node`) is left alone.
 *  - Workspace glob strings in `workspaces` are rewritten too.
 *  - The file is not rewritten when there is nothing to do.
 *  - The migrator surfaces malformed JSON as a typed error and
 *    does NOT write back a half-parsed manifest.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	PACKAGE_MANIFEST_NAME,
	PackageManifestParseError,
	createPackageManifestMigrator,
} from '@delendai/core/lib/workspace-migration/migrators/package-manifest.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-pkg-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeManifest = async (contents: string): Promise<string> => {
	const absolute = join(workspaceRoot, PACKAGE_MANIFEST_NAME);
	await mkdir(workspaceRoot, { recursive: true });
	await writeFile(absolute, contents, 'utf8');
	return absolute;
};

const ctx = (root: string) => ({ workspaceRoot: root, dryRun: false });

const pretty = (value: unknown): string =>
	`${JSON.stringify(value, null, '\t')}\n`;

describe('package-manifest.migrator — detect / plan / apply', () => {
	it('detect returns false when the file is absent', async () => {
		const migrator = createPackageManifestMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(false);
	});

	it('plan returns no steps when the file is clean', async () => {
		await writeManifest(pretty({ name: 'delendai', version: '0.1.0' }));
		const migrator = createPackageManifestMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('plan emits a manifest-changed step when the file carries legacy identity', async () => {
		await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				dependencies: { '@mcp-vertex/core': 'workspace:*' },
			}),
		);
		const migrator = createPackageManifestMigrator();
		const steps = await migrator.plan(ctx(workspaceRoot));
		expect(steps).toHaveLength(1);
		expect(steps[0]?.kind).toBe('manifest-changed');
	});
});

describe('package-manifest.migrator — apply (deep dependency rewrite)', () => {
	it('rewrites npm scope dependencies atomically', async () => {
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				version: '0.1.0',
				dependencies: {
					'@mcp-vertex/core': 'workspace:*',
					'@mcp-vertex/cli': 'workspace:*',
				},
				devDependencies: {
					'@mcp-vertex/contracts': 'workspace:*',
				},
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.name).toBe('delendai-helper');
		expect(after.dependencies).toEqual({
			'@delendai/core': 'workspace:*',
			'@delendai/cli': 'workspace:*',
		});
		expect(after.devDependencies).toEqual({
			'@delendai/contracts': 'workspace:*',
		});
		expect(after.version).toBe('0.1.0');
	});

	it('leaves non-delendai scopes untouched (e.g. @types/node)', async () => {
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				dependencies: {
					'@mcp-vertex/core': 'workspace:*',
					'@types/node': '^20.0.0',
					lodash: '^4.17.0',
				},
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.dependencies).toEqual({
			'@delendai/core': 'workspace:*',
			'@types/node': '^20.0.0',
			lodash: '^4.17.0',
		});
	});

	it('rewrites peerDependencies and optionalDependencies', async () => {
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				peerDependencies: { '@mcp-vertex/core': 'workspace:*' },
				optionalDependencies: { '@mcp-vertex/cli': 'workspace:*' },
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.peerDependencies).toEqual({
			'@delendai/core': 'workspace:*',
		});
		expect(after.optionalDependencies).toEqual({
			'@delendai/cli': 'workspace:*',
		});
	});

	it('rewrites script command strings', async () => {
		// Scripts are a common place for a binary invocation to live.
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				scripts: {
					start: 'mcp-vertex run',
					build: 'bunx mcp-vertex-cli build',
					lint: 'biome check .',
				},
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.scripts).toEqual({
			start: 'delendai run',
			build: 'bunx delendai-cli build',
			lint: 'biome check .',
		});
	});

	it('rewrites workspace glob strings', async () => {
		// A monorepo's workspaces array can include strings that name
		// legacy identity ("packages/mcp-vertex-*"). They must be
		// rewritten too — `bun install` would otherwise try to link
		// a non-existent path.
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-root',
				workspaces: [
					'packages/mcp-vertex-core',
					'packages/mcp-vertex-cli',
					'apps/shared',
				],
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.workspaces).toEqual([
			'packages/delendai-core',
			'packages/delendai-cli',
			'apps/shared',
		]);
	});

	it('preserves fields outside the allow-list untouched', async () => {
		// `keywords`, `repository`, `author`, `license` etc. must not
		// be touched even when they contain strings the legacy
		// identity could match. The allow-list is the contract.
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				version: '0.1.0',
				keywords: ['mcp-vertex', 'mcp'],
				repository: {
					type: 'git',
					url: 'git@github.com/foo/mcp-vertex.git',
				},
				author: 'mcp-vertex team',
				license: 'BSD-3-Clause',
				description: 'A mcp-vertex helper package',
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.keywords).toEqual(['mcp-vertex', 'mcp']);
		expect(after.repository).toEqual({
			type: 'git',
			url: 'git@github.com/foo/mcp-vertex.git',
		});
		expect(after.author).toBe('mcp-vertex team');
		expect(after.description).toBe('A mcp-vertex helper package');
		expect(after.name).toBe('delendai-helper');
	});

	it('does NOT touch a lockfile that happens to sit next to it', async () => {
		// S7 owns lockfile refresh. This migrator mutates the
		// manifest only. A naive text substitution here would be the
		// exact failure the S4 acceptance forbids.
		const manifestPath = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				dependencies: { '@mcp-vertex/core': 'workspace:*' },
			}),
		);
		const lockPath = join(workspaceRoot, 'bun.lock');
		const lockContents =
			'{"packages":{"@mcp-vertex/core":"workspace:packages/core"}}';
		await writeFile(lockPath, lockContents, 'utf8');
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(lockPath, 'utf8');
		expect(after).toBe(lockContents);
		expect(JSON.parse(await readFile(manifestPath, 'utf8')).name).toBe(
			'delendai-helper',
		);
	});

	it('is idempotent: a second apply leaves the file byte-identical', async () => {
		const path = await writeManifest(
			pretty({
				name: 'mcp-vertex-helper',
				dependencies: { '@mcp-vertex/core': 'workspace:*' },
			}),
		);
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const firstPass = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const secondPass = await readFile(path, 'utf8');
		expect(secondPass).toBe(firstPass);
	});

	it('does not write the file when nothing changes', async () => {
		const path = await writeManifest(
			pretty({
				name: 'delendai-helper',
				dependencies: { '@delendai/core': 'workspace:*' },
				keywords: ['mcp-vertex'],
			}),
		);
		const original = await readFile(path, 'utf8');
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toBe(original);
	});
});

describe('package-manifest.migrator — apply (failure modes)', () => {
	it('throws PackageManifestParseError on malformed JSON', async () => {
		await writeManifest('{ "name": "mcp-vertex-helper",,, }\n');
		const migrator = createPackageManifestMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			PackageManifestParseError,
		);
	});

	it('throws PackageManifestParseError when the top-level value is an array', async () => {
		await writeManifest('[]');
		const migrator = createPackageManifestMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			PackageManifestParseError,
		);
	});

	it('does not write back the file when the parse fails', async () => {
		const path = await writeManifest(
			'{ "name": "mcp-vertex-helper",,, }\n',
		);
		const original = await readFile(path, 'utf8');
		const migrator = createPackageManifestMigrator();
		await migrator.apply(ctx(workspaceRoot)).catch(() => undefined);
		const after = await readFile(path, 'utf8');
		expect(after).toBe(original);
	});

	it('no-ops cleanly when the file is absent', async () => {
		const migrator = createPackageManifestMigrator();
		await expect(
			migrator.apply(ctx(workspaceRoot)),
		).resolves.toBeUndefined();
	});
});
