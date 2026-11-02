/**
 * config-jsonc.spec.ts — f00502 S5.
 *
 * `config show`, `config get` and `config set` against a config the user
 * has commented. Every one of them used JSON.parse, so a commented file
 * could not even be displayed, and `set` rebuilt the object and wrote it
 * back — silently deleting every comment in the file.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type {
	ICliCommand,
	ICliCommandContext,
} from '../contracts/interfaces/cli-command.interface';
import { registerAllCommands } from './registry';

const COMMENTED_CONFIG = [
	'{',
	'\t// Docs live outside the default folder here.',
	'\t"docsDir": "documentation",',
	'\t"plugins": {',
	'\t\t// Off until the security review lands. Do not re-enable.',
	'\t\t"git": {',
	'\t\t\t"enabled": false,',
	'\t\t\t"options": {',
	'\t\t\t\t"depth": 1',
	'\t\t\t}',
	'\t\t}',
	'\t}',
	'}',
	'',
].join('\n');

const roots: string[] = [];

const workspaceWith = async (contents?: string): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-config-'));
	roots.push(root);
	if (contents !== undefined) {
		await writeFile(join(root, 'delendai.config.json'), contents, 'utf8');
	}
	return root;
};

const contextFor = (workspace: string): ICliCommandContext =>
	({
		cwd: workspace,
		globals: {
			workspace,
			json: true,
			format: 'json',
			lang: 'en',
			noColor: true,
			plugins: [],
		},
		request: async () => {
			throw new Error('not used');
		},
		listTools: async () => [],
		close: async () => undefined,
	}) as unknown as ICliCommandContext;

const command = async (name: string): Promise<ICliCommand> => {
	const found = (await registerAllCommands()).find(
		(entry) => entry.name === name,
	);
	if (found === undefined) throw new Error(`no command named ${name}`);
	return found;
};

const readConfig = async (workspace: string): Promise<string> =>
	readFile(join(workspace, 'delendai.config.json'), 'utf8');

afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe('config commands on a commented config (f00502 S5)', () => {
	describe('config show', () => {
		it('displays a config that has comments in it', async () => {
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			const result = await (await command('config show')).run(
				[],
				contextFor(workspace),
			);

			expect(result.code ?? 0).toBe(0);
			expect(result.data).toMatchObject({ docsDir: 'documentation' });
		});

		it('reports the syntax error instead of throwing, when the file is genuinely broken', async () => {
			const workspace = await workspaceWith('{ "docsDir": ');

			const result = await (await command('config show')).run(
				[],
				contextFor(workspace),
			);

			expect(result.code).not.toBe(0);
			expect(result.error).toContain('invalid JSONC');
		});
	});

	describe('config get', () => {
		it('reads a nested path out of a commented config', async () => {
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			const result = await (await command('config get')).run(
				['plugins.git.options.depth'],
				contextFor(workspace),
			);

			expect(result.data).toBe(1);
		});
	});

	describe('config set', () => {
		it('keeps every comment in the file', async () => {
			// The destructive case: setting one value used to rewrite the
			// whole document from a parsed object, taking the comments
			// with it.
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			await (await command('config set')).run(
				['plugins.git.options.depth=5'],
				contextFor(workspace),
			);
			const after = await readConfig(workspace);

			expect(after).toContain(
				'// Off until the security review lands. Do not re-enable.',
			);
			expect(after).toContain(
				'// Docs live outside the default folder here.',
			);
		});

		it('actually sets the value it was asked to set', async () => {
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			await (await command('config set')).run(
				['plugins.git.options.depth=5'],
				contextFor(workspace),
			);

			const result = await (await command('config get')).run(
				['plugins.git.options.depth'],
				contextFor(workspace),
			);
			expect(result.data).toBe(5);
		});

		it("leaves the rest of the user's values untouched", async () => {
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			await (await command('config set')).run(
				['docsDir="docs"'],
				contextFor(workspace),
			);

			const enabled = await (await command('config get')).run(
				['plugins.git.enabled'],
				contextFor(workspace),
			);
			expect(enabled.data).toBe(false);
		});

		it('adds a path that did not exist yet', async () => {
			const workspace = await workspaceWith(COMMENTED_CONFIG);

			await (await command('config set')).run(
				['plugins.search.enabled=true'],
				contextFor(workspace),
			);

			const result = await (await command('config get')).run(
				['plugins.search.enabled'],
				contextFor(workspace),
			);
			expect(result.data).toBe(true);
			expect(await readConfig(workspace)).toContain(
				'// Off until the security review lands. Do not re-enable.',
			);
		});

		it('refuses to write over a file it cannot parse', async () => {
			// Rewriting here would replace contents we never understood.
			const broken = '{ "docsDir": ';
			const workspace = await workspaceWith(broken);

			const result = await (await command('config set')).run(
				['docsDir="docs"'],
				contextFor(workspace),
			);

			expect(result.code).not.toBe(0);
			expect(result.error).toContain('invalid JSONC');
			expect(await readConfig(workspace)).toBe(broken);
		});

		it('creates a config from nothing when there is none', async () => {
			const workspace = await workspaceWith();

			const result = await (await command('config set')).run(
				['docsDir="docs"'],
				contextFor(workspace),
			);

			expect(result.code ?? 0).toBe(0);
			expect(await readConfig(workspace)).toContain('"docsDir"');
		});
	});
});
