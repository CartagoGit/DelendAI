/**
 * config-file.migrator.spec.ts — b00239 S4.
 *
 * Pins the four-case contract of `createConfigFileMigrator` against a
 * real on-disk file: file absent, file ours, file foreign, file
 * malformed. Plus the happy-path round trip that proves the rewrite
 * actually happens and a "re-run is a no-op" idempotency check.
 *
 * What this spec is NOT trying to prove:
 *  - JSONC parser semantics (the shared parser has its own spec).
 *  - The identity-rename table (that lives in identity-renames.spec.ts).
 *
 * What this spec IS trying to prove:
 *  - The migrator touches exactly one file.
 *  - It walks strings only (does not rewrite boolean `true` → `true`).
 *  - It surfaces a parse failure as a typed error (not a silent write).
 *  - It is idempotent under repeat application.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	CONFIG_FILE_NAME,
	ConfigFileParseError,
	createConfigFileMigrator,
} from '@delendai/core/lib/workspace-migration/migrators/config-file.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-config-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeConfig = async (contents: string): Promise<string> => {
	const absolute = join(workspaceRoot, CONFIG_FILE_NAME);
	await mkdir(workspaceRoot, { recursive: true });
	await writeFile(absolute, contents, 'utf8');
	return absolute;
};

const ctx = (root: string) => ({ workspaceRoot: root, dryRun: false });

describe('config-file.migrator — detect', () => {
	it('returns false when the file is absent', async () => {
		const migrator = createConfigFileMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(false);
	});

	it('returns true when the file is present, regardless of contents', async () => {
		await writeConfig('{ "name": "any" }');
		const migrator = createConfigFileMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(true);
	});
});

describe('config-file.migrator — plan', () => {
	it('returns no steps when the file is absent', async () => {
		const migrator = createConfigFileMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('returns no steps when the file is clean (already migrated)', async () => {
		await writeConfig('{ "name": "delendai", "version": "1.0.0" }');
		const migrator = createConfigFileMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('returns one rewrite step when the file carries legacy identity', async () => {
		await writeConfig('{ "name": "mcp-vertex" }');
		const migrator = createConfigFileMigrator();
		const steps = await migrator.plan(ctx(workspaceRoot));
		expect(steps).toHaveLength(1);
		expect(steps[0]?.kind).toBe('rewrite-config-file');
	});
});

describe('config-file.migrator — apply (happy-path round trip)', () => {
	it('rewrites scalar string values', async () => {
		const path = await writeConfig(
			'{\n\t"name": "mcp-vertex",\n\t"version": "0.1.0"\n}\n',
		);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('"name": "delendai"');
		expect(after).toContain('"version": "0.1.0"');
		expect(after).not.toContain('mcp-vertex');
	});

	it('rewrites nested object values without disturbing siblings', async () => {
		const original = `{
	"name": "mcp-vertex",
	"plugins": {
		"git": { "label": "mcp-vertex-git" },
		"search": { "label": "delendai-search" }
	}
}
`;
		const path = await writeConfig(original);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('"name": "delendai"');
		expect(after).toContain('"label": "delendai-git"');
		expect(after).toContain('"label": "delendai-search"');
		expect(after).not.toContain('mcp-vertex');
	});

	it('rewrites strings inside arrays', async () => {
		const path = await writeConfig(
			'{ "namespaces": ["mcp-vertex.git", "delendai.search"] }\n',
		);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('"delendai.git"');
		expect(after).toContain('"delendai.search"');
		expect(after).not.toContain('mcp-vertex');
	});

	it('preserves JSONC comments round-trip', async () => {
		// Comments must survive the rewrite — the file is JSONC by
		// contract and the user might have authored notes here.
		const withComments = `{
	// the project identity
	"name": "mcp-vertex",
	/* nested scope */
	"plugins": ["mcp-vertex-core"]
}
`;
		const path = await writeConfig(withComments);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('// the project identity');
		expect(after).toContain('/* nested scope */');
		expect(after).toContain('"name": "delendai"');
		expect(after).toContain('"delendai-core"');
		expect(after).not.toContain('mcp-vertex');
	});

	it('rewrites @mcp-vertex/* scope references atomically', async () => {
		// The longest-prefix-first ordering in identity-renames must
		// win here: a naive substring rewrite would produce
		// `@delendai/core` correctly, but a naive alternation might
		// half-convert and leave `@delendai/core` next to
		// `@delendai-extra`. This pins the ordering.
		const path = await writeConfig(
			'{ "deps": ["@mcp-vertex/core", "@mcp-vertex/cli"] }\n',
		);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('"@delendai/core"');
		expect(after).toContain('"@delendai/cli"');
		expect(after).not.toContain('@mcp-vertex');
		expect(after).not.toContain('mcp-vertex');
	});

	it('leaves booleans, numbers and nulls untouched (no false rewrite)', async () => {
		const path = await writeConfig(
			'{\n\t"name": "mcp-vertex",\n\t"enabled": true,\n\t"port": 8080,\n\t"alias": null\n}\n',
		);
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('"enabled": true');
		expect(after).toContain('"port": 8080');
		expect(after).toContain('"alias": null');
		expect(after).toContain('"name": "delendai"');
	});

	it('is idempotent: a second apply leaves the file byte-identical', async () => {
		const path = await writeConfig('{ "name": "mcp-vertex" }\n');
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const firstPass = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const secondPass = await readFile(path, 'utf8');
		expect(secondPass).toBe(firstPass);
		expect(secondPass).toContain('"name": "delendai"');
	});
});

describe('config-file.migrator — apply (failure modes)', () => {
	it('throws ConfigFileParseError on malformed JSON', async () => {
		await writeConfig('{ "name": "mcp-vertex",,, }\n');
		const migrator = createConfigFileMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			ConfigFileParseError,
		);
	});

	it('does not write back the file when the parse fails', async () => {
		// Half-broken input must not be "fixed" by a partial rewrite.
		const path = await writeConfig('{ "name": "mcp-vertex",,, }\n');
		const original = await readFile(path, 'utf8');
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot)).catch(() => undefined);
		const after = await readFile(path, 'utf8');
		expect(after).toBe(original);
	});

	it('no-ops cleanly when the file is absent (apply is forgiving)', async () => {
		// `detect` already filters the absent case in the engine,
		// but apply must not blow up if called directly.
		const migrator = createConfigFileMigrator();
		await expect(
			migrator.apply(ctx(workspaceRoot)),
		).resolves.toBeUndefined();
	});

	it('does not rewrite the file when no string carries the legacy identity', async () => {
		const path = await writeConfig(
			'{ "name": "delendai", "version": "1.0.0" }\n',
		);
		const original = await readFile(path, 'utf8');
		const migrator = createConfigFileMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toBe(original);
	});
});
