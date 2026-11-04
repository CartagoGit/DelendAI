/**
 * vscode-cache-exclude.migrator.spec.ts — a project that already has a
 * settings file gets the cache excluded on the next start, and nothing the
 * person wrote is replaced.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	cacheExcludeGlob,
	mergeCacheExcludes,
} from '@delendai/core/lib/workspace-migration/migrators/vscode-cache-exclude';
import { ensureWorkspaceMigrated } from '@delendai/core/lib/workspace-migration/legacy-migration.service';
import {
	createVscodeCacheExcludeMigrator,
	pendingCacheExclude,
} from '@delendai/core/lib/workspace-migration/migrators/vscode-cache-exclude.migrator';

let root = '';
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'vscode-cache-exclude-'));
	await mkdir(join(root, '.vscode'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const settingsPath = (): string => join(root, '.vscode', 'settings.json');
const ctx = (dryRun = false) => ({ workspaceRoot: root, dryRun });

describe('cacheExcludeGlob', () => {
	it('collapses a cache under .cache to .cache/**', () => {
		expect(cacheExcludeGlob('.cache/delendai')).toBe('.cache/**');
		expect(cacheExcludeGlob('./.cache/delendai/')).toBe('.cache/**');
	});

	it('names any other directory, and skips one outside the workspace', () => {
		expect(cacheExcludeGlob('build/dl')).toBe('build/dl/**');
		expect(cacheExcludeGlob('/var/cache/dl')).toBeUndefined();
		expect(cacheExcludeGlob('../shared')).toBeUndefined();
	});
});

describe('mergeCacheExcludes', () => {
	it('adds only what is missing and changes nothing the second time', () => {
		const once = mergeCacheExcludes('{}', '.cache/delendai');
		expect(once).toBeDefined();
		expect(
			mergeCacheExcludes(once as string, '.cache/delendai'),
		).toBeUndefined();
	});

	it('refuses text that is not a settings object', () => {
		expect(mergeCacheExcludes('[1]', '.cache/delendai')).toBeUndefined();
		expect(mergeCacheExcludes('{ nope', '.cache/delendai')).toBeUndefined();
	});
});

describe('the migrator', () => {
	it("merges into a project that already has settings, keeping the person's value", async () => {
		await writeFile(
			settingsPath(),
			`{\n\t// mine\n\t"search.exclude": { ".cache/**": false }\n}\n`,
			'utf8',
		);
		const migrator = createVscodeCacheExcludeMigrator();
		expect(await migrator.detect(ctx())).toBe(true);
		await migrator.apply(ctx());
		const text = await readFile(settingsPath(), 'utf8');
		expect(text).toContain('// mine');
		expect(text).toContain('".cache/**": false');
		expect(text).toContain('files.watcherExclude');
		expect(await migrator.detect(ctx())).toBe(false);
	});

	it('creates no settings file and writes nothing on a rehearsal', async () => {
		const migrator = createVscodeCacheExcludeMigrator();
		expect(await migrator.detect(ctx())).toBe(false);
		await writeFile(settingsPath(), '{}\n', 'utf8');
		await migrator.apply(ctx(true));
		expect(await readFile(settingsPath(), 'utf8')).toBe('{}\n');
	});
});

describe('a start only reports; migrate applies', () => {
	const migrations = [createVscodeCacheExcludeMigrator()];
	const journal = { read: async () => [], record: async () => undefined };
	const adopt = () =>
		writeFile(join(root, 'delendai.config.json'), '{}\n', 'utf8');

	it('leaves the settings file as it is on a start and names the command', async () => {
		await adopt();
		await writeFile(settingsPath(), '{}\n', 'utf8');
		const result = await ensureWorkspaceMigrated({
			migrations,
			journal,
			workspaceRoot: root,
			transitions: [],
		});
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(await readFile(settingsPath(), 'utf8')).toBe('{}\n');
		expect(await pendingCacheExclude(root)).toContain('migrate run');
	});

	it('writes it when a person asked, and then has nothing to report', async () => {
		await adopt();
		await writeFile(settingsPath(), '{}\n', 'utf8');
		await ensureWorkspaceMigrated({
			migrations,
			journal,
			workspaceRoot: root,
			transitions: [],
			explicit: true,
		});
		expect(await readFile(settingsPath(), 'utf8')).toContain(
			'files.watcherExclude',
		);
		expect(await pendingCacheExclude(root)).toBeUndefined();
	});

	it('reports nothing in a project that never adopted delendai', async () => {
		await writeFile(settingsPath(), '{}\n', 'utf8');
		expect(await pendingCacheExclude(root)).toBeUndefined();
	});

	it('never touches the settings of a linked worktree', async () => {
		await adopt();
		await writeFile(join(root, '.git'), 'gitdir: /elsewhere\n', 'utf8');
		await writeFile(settingsPath(), '{}\n', 'utf8');
		const migrator = createVscodeCacheExcludeMigrator();
		expect(await migrator.detect(ctx())).toBe(false);
		await migrator.apply(ctx());
		expect(await readFile(settingsPath(), 'utf8')).toBe('{}\n');
		expect(await pendingCacheExclude(root)).toBeUndefined();
	});
});
