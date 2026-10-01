/**
 * project-plugins-behaviour.spec.ts — what the three project-plugin tools
 * do to a real workspace: create, inspect and repair a project-owned
 * plugin, and where their writes land.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildProjectPluginsCreateToolRegistration,
	buildProjectPluginsInspectToolRegistration,
	buildProjectPluginsRepairToolRegistration,
	createWorkspacePathProvider,
	type IToolRegistration,
} from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { bindWriteRoot } from '../../../../src/lib/shared/bind-write-root';
import { workspaceForCall } from '../../../../src/lib/shared/shared-checkout';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

interface IResult {
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
	readonly content?: readonly { readonly text?: string }[];
}

const workspace = () => {
	const root = mkdtempSync(join(tmpdir(), 'project-plugins-'));
	roots.push(root);
	const options = {
		namespacePrefix: 'core',
		workspace: createWorkspacePathProvider(root),
	};
	const handlerOf = async (
		registration: IToolRegistration,
	): Promise<(args: unknown) => Promise<IResult>> => {
		let handler: ((args: unknown) => unknown) | undefined;
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handler = tool.handler;
				},
			}),
		);
		if (handler === undefined) throw new Error('no handler registered');
		const registered = handler;
		return async (args) => (await registered(args)) as IResult;
	};
	return {
		root,
		pluginDir: join(root, 'packages/delendai/plugins/delendai_demo'),
		create: async (args: Record<string, unknown>) =>
			(
				await handlerOf(
					buildProjectPluginsCreateToolRegistration(options),
				)
			)(args),
		inspect: async (args: Record<string, unknown>) =>
			(
				await handlerOf(
					buildProjectPluginsInspectToolRegistration(options),
				)
			)(args),
		repair: async (args: Record<string, unknown>) =>
			(
				await handlerOf(
					buildProjectPluginsRepairToolRegistration(options),
				)
			)(args),
		config: () =>
			JSON.parse(
				readFileSync(join(root, 'delendai.config.json'), 'utf8'),
			) as {
				plugins: Record<string, { path: string; enabled?: boolean }>;
			},
	};
};

const body = (result: IResult) => result.structuredContent ?? {};
const ids = (result: IResult) =>
	((body(result).diagnostics ?? []) as { id: string }[]).map((d) => d.id);

describe('project_plugins_create', () => {
	it('writes the scaffold, registers its path and leaves nothing to fix', async () => {
		const ws = workspace();
		const result = await ws.create({ name: 'Demo' });
		expect(result.isError).toBeFalsy();
		expect(body(result)).toMatchObject({ ok: true, name: 'demo' });
		expect(ids(result)).toEqual([]);
		expect((body(result).autoFixed as string[]).length).toBeGreaterThan(0);
		expect(ws.config().plugins.demo?.path).toBe(
			'packages/delendai/plugins/delendai_demo/src/index.ts',
		);
		expect(body(result).registration).toMatchObject({ action: 'added' });
	});

	it('plans without writing on a dry run', async () => {
		const ws = workspace();
		const result = await ws.create({ name: 'demo', dryRun: true });
		const files = body(result).files as {
			written: string[];
			planned: unknown[];
		};
		expect(files.written).toEqual([]);
		expect(files.planned.length).toBeGreaterThan(0);
		expect(() => ws.config()).toThrow();
	});

	it('refuses to overwrite an existing plugin, as a tool error', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		const again = await ws.create({ name: 'demo' });
		expect(again.isError).toBe(true);
		expect(JSON.stringify(again)).toContain('already exists');
	});

	it('updates a registration that pointed elsewhere, keeping its other settings', async () => {
		const ws = workspace();
		writeFileSync(
			join(ws.root, 'delendai.config.json'),
			JSON.stringify({
				plugins: { demo: { path: 'old/index.ts', enabled: false } },
			}),
		);
		const result = await ws.create({ name: 'demo' });
		expect(body(result).registration).toMatchObject({
			action: 'updated',
			previousPath: 'old/index.ts',
		});
		expect(ws.config().plugins.demo?.enabled).toBe(false);
	});

	it('refuses a config file that is not a JSON object', async () => {
		const ws = workspace();
		writeFileSync(join(ws.root, 'delendai.config.json'), '[]');
		const result = await ws.create({ name: 'demo' });
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result)).toContain('must contain a JSON object');
	});

	it('refuses a name with no usable id', async () => {
		const result = await workspace().create({ name: '---' });
		expect(result.isError).toBe(true);
	});
});

describe('project_plugins_inspect', () => {
	it('reports every scaffold file missing for a plugin that does not exist', async () => {
		const result = await workspace().inspect({ name: 'demo' });
		expect(body(result).ok).toBe(false);
		expect(ids(result).every((id) => id.startsWith('missing-'))).toBe(true);
	});

	it('finds a freshly created plugin valid', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		const result = await ws.inspect({ name: 'demo' });
		expect(body(result)).toMatchObject({
			ok: true,
			nextSteps: 'Project plugin structure is valid.',
		});
	});

	it('names the structural markers an entrypoint lacks and the metadata that drifted', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		writeFileSync(join(ws.pluginDir, 'src/index.ts'), 'export {};\n');
		writeFileSync(
			join(ws.pluginDir, 'package.json'),
			JSON.stringify({ name: 'x', main: 'dist/index.js' }),
		);
		const found = ids(await ws.inspect({ name: 'demo' }));
		expect(found).toEqual(
			expect.arrayContaining([
				'default-export',
				'define-plugin',
				'register-hook',
				'tool-registration',
				'tool-output-schema',
				'package-main',
				'package-type',
				'package-scripts.typecheck',
			]),
		);
	});

	it('reports a package.json that is not JSON', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		writeFileSync(join(ws.pluginDir, 'package.json'), '{ not json');
		expect(ids(await ws.inspect({ name: 'demo' }))).toContain(
			'package-json-invalid',
		);
	});
});

describe('project_plugins_repair', () => {
	it('restores missing files and metadata and keeps the implementation', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		const implementation = readFileSync(
			join(ws.pluginDir, 'src/index.ts'),
			'utf8',
		);
		rmSync(join(ws.pluginDir, 'tsconfig.json'), { force: true });
		writeFileSync(
			join(ws.pluginDir, 'package.json'),
			JSON.stringify({ name: 'x', scripts: { build: 'x' } }),
		);
		const result = await ws.repair({ name: 'demo' });
		expect(body(result).ok).toBe(true);
		expect(ids(result)).toEqual([]);
		expect(body(result).autoFixed).toEqual(
			expect.arrayContaining(['package-main']),
		);
		expect(readFileSync(join(ws.pluginDir, 'src/index.ts'), 'utf8')).toBe(
			implementation,
		);
		const repaired = JSON.parse(
			readFileSync(join(ws.pluginDir, 'package.json'), 'utf8'),
		) as { scripts: Record<string, string> };
		expect(repaired.scripts.build).toBe('x');
	});

	it('leaves a package.json that is not JSON for a person to fix', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		writeFileSync(join(ws.pluginDir, 'package.json'), '{ not json');
		expect(ids(await ws.repair({ name: 'demo' }))).toContain(
			'package-json-invalid',
		);
	});

	it('changes nothing when the plugin is already sound', async () => {
		const ws = workspace();
		await ws.create({ name: 'demo' });
		const result = await ws.repair({ name: 'demo' });
		expect(body(result).registration).toMatchObject({
			action: 'unchanged',
		});
		expect(body(result).autoFixed).toEqual([]);
	});
});

describe('where the project-plugin tools write', () => {
	it('declares the caller checkout for the two that write, and nothing for inspect', () => {
		const options = {
			namespacePrefix: 'core',
			workspace: createWorkspacePathProvider('/tmp'),
		};
		expect(
			buildProjectPluginsCreateToolRegistration(options).writeRoot,
		).toBe('caller-checkout');
		expect(
			buildProjectPluginsRepairToolRegistration(options).writeRoot,
		).toBe('caller-checkout');
		expect(
			buildProjectPluginsInspectToolRegistration(options).writeRoot,
		).toBeUndefined();
	});
});

describe('project_plugins_create acts in the checkout the call names (x00638 S4)', () => {
	it("scaffolds into the worktree and leaves the server's tree alone", async () => {
		const parent = realpathSync(
			mkdtempSync(join(tmpdir(), 'project-plugins-x638-')),
		);
		roots.push(parent);
		const server = join(parent, 'checkout');
		const worktree = join(parent, 'worktree');
		execFileSync('git', ['init', '-q', '-b', 'develop', server]);
		execFileSync(
			'git',
			[
				'-c',
				'user.email=s@e.t',
				'-c',
				'user.name=S',
				'commit',
				'-q',
				'--allow-empty',
				'-m',
				'base',
			],
			{ cwd: server },
		);
		execFileSync('git', ['worktree', 'add', '-q', '-b', 'work', worktree], {
			cwd: server,
		});
		// As core assembles it: a workspace that follows the bound call,
		// and a registration bound to the server's root.
		const registration = bindWriteRoot(
			buildProjectPluginsCreateToolRegistration({
				namespacePrefix: 'core',
				workspace: workspaceForCall(
					createWorkspacePathProvider(server),
				),
			}),
			server,
		);
		let handler: ((args: unknown) => unknown) | undefined;
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handler = tool.handler;
				},
			}),
		);
		const result = (await handler?.({
			name: 'Demo',
			checkout: worktree,
		})) as IResult;
		expect(result.isError).toBeFalsy();
		const pluginIndex =
			'packages/delendai/plugins/delendai_demo/src/index.ts';
		expect(existsSync(join(worktree, pluginIndex))).toBe(true);
		expect(existsSync(join(worktree, 'delendai.config.json'))).toBe(true);
		expect(existsSync(join(server, pluginIndex))).toBe(false);
		expect(existsSync(join(server, 'delendai.config.json'))).toBe(false);
	});
});
