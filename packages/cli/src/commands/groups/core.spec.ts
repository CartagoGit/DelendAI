/**
 * f00046 S5 — unit tests for the fs / knowledge / project group. Each
 * command delegates 1:1 to its `delendai_*` core meta-tool and maps
 * CLI flags onto the tool's inputSchema. Recording-stub ctx.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { coreExtraCommands } from './core';

const buildStubContext = () => {
	const calls: { tool: string; args: object }[] = [];
	const ctx: ICliCommandContext = {
		cwd: '/workspace',
		globals: {
			workspace: '/workspace',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		},
		request: async <TOut>(
			tool: string,
			args: object = {},
		): Promise<TOut> => {
			calls.push({ tool, args });
			return { ok: true } as unknown as TOut;
		},
		listTools: async () => [],
		close: async () => {},
	};
	return { ctx, calls };
};

const find = (name: string): ICliCommand => {
	const command = coreExtraCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('core extra group (f00046 S5)', async () => {
	it('exposes fs/knowledge/project commands', async () => {
		expect(coreExtraCommands.map((c) => c.name)).toEqual([
			'fs read',
			'fs write',
			'knowledge',
			'adopt',
			'project analyze',
			'project plan',
			'project create',
			'plugin new',
			'guard',
		]);
	});

	it('guard loads lazily and rejects an unknown hook without a server', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await find('guard').run(['post-rewrite'], ctx);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('unknown hook');
		expect(calls).toEqual([]);
	});

	it('fs read forwards a path and an optional range', async () => {
		const { ctx, calls } = buildStubContext();
		await find('fs read').run(['src/a.ts', '--start=1', '--end=5'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_fs_read',
			args: { path: 'src/a.ts', range: [1, 5] },
		});
	});

	it('fs read without a path is a USAGE error', async () => {
		const { ctx } = buildStubContext();
		const res = await find('fs read').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.USAGE);
	});

	it('fs write forwards content + flags (create-dirs)', async () => {
		const { ctx, calls } = buildStubContext();
		await find('fs write').run(
			['out/x.txt', '--content=hi', '--create-dirs'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_fs_write',
			args: {
				path: 'out/x.txt',
				content: 'hi',
				createDirs: true,
			},
		});
	});

	it('fs write rejects --no-atomic (atomic is non-negotiable via the LLM-facing tool, r00003 S3 / LSP)', async () => {
		const { ctx } = buildStubContext();
		const res = await find('fs write').run(
			['out/x.txt', '--content=hi', '--no-atomic'],
			ctx,
		);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect(res.data).toMatchObject({
			ok: false,
			error: expect.stringContaining(
				'--no-atomic is no longer supported',
			),
		});
	});

	it('knowledge forwards an optional id', async () => {
		const { ctx, calls } = buildStubContext();
		await find('knowledge').run(['some-id'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_knowledge',
			args: { id: 'some-id' },
		});
	});

	it('project create requires a kind and forwards names', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('project create').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('project create').run(
			['--kind=plugin', '--plugin=widgets'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_create_project',
			args: { kind: 'plugin', pluginName: 'widgets' },
		});
	});

	it('adopt forwards analyze mode and optional flags', async () => {
		const { ctx, calls } = buildStubContext();
		await find('adopt').run(
			[
				'--analyze',
				'--repo=acme/widgets',
				'--project-name=Widgets',
				'--prefix=acme',
			],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_adopt_project',
			args: {
				analyze: true,
				repo: 'acme/widgets',
				projectName: 'Widgets',
				namespacePrefix: 'acme',
			},
		});
	});
});

describe('core extra group — how each flag reaches its tool', async () => {
	it('fs read sends no range unless both ends are given', async () => {
		const { ctx, calls } = buildStubContext();
		await find('fs read').run(['src/a.ts', '--start=3'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_fs_read',
			args: { path: 'src/a.ts' },
		});
	});

	it('fs write needs both a path and content, and omits create-dirs unless asked', async () => {
		const { ctx, calls } = buildStubContext();
		expect((await find('fs write').run(['out.txt'], ctx)).code).toBe(
			EXIT_CODE.USAGE,
		);
		expect((await find('fs write').run(['--content=x'], ctx)).code).toBe(
			EXIT_CODE.USAGE,
		);
		await find('fs write').run(['out.txt', '--content=x'], ctx);
		expect(calls).toEqual([
			{
				tool: 'delendai_fs_write',
				args: { path: 'out.txt', content: 'x' },
			},
		]);
	});

	it('knowledge without an id lists every entry', async () => {
		const { ctx, calls } = buildStubContext();
		await find('knowledge').run([], ctx);
		expect(calls[0]).toEqual({ tool: 'delendai_knowledge', args: {} });
	});

	it('project analyze forwards only the names it was given', async () => {
		const { ctx, calls } = buildStubContext();
		await find('project analyze').run([], ctx);
		await find('project analyze').run(
			['--server-name=acme-mcp', '--prefix=acme'],
			ctx,
		);
		expect(calls).toEqual([
			{ tool: 'delendai_analyze_project', args: {} },
			{
				tool: 'delendai_analyze_project',
				args: { serverName: 'acme-mcp', namespacePrefix: 'acme' },
			},
		]);
	});

	it('project plan forwards names and turns --no-tests into tests: false', async () => {
		const { ctx, calls } = buildStubContext();
		await find('project plan').run([], ctx);
		await find('project plan').run(
			['--server-name=acme-mcp', '--prefix=acme', '--no-tests'],
			ctx,
		);
		expect(calls).toEqual([
			{ tool: 'delendai_plan_mcp_project', args: {} },
			{
				tool: 'delendai_plan_mcp_project',
				args: {
					serverName: 'acme-mcp',
					namespacePrefix: 'acme',
					tests: false,
				},
			},
		]);
	});

	it('project create forwards every name, taking --project when --name is absent', async () => {
		const { ctx, calls } = buildStubContext();
		await find('project create').run(
			[
				'--kind=host',
				'--project=Acme',
				'--client=acme-client',
				'--prefix=acme',
				'--description=Acme server',
			],
			ctx,
		);
		await find('project create').run(
			['--kind=client', '--name=Named'],
			ctx,
		);
		expect(calls).toEqual([
			{
				tool: 'delendai_create_project',
				args: {
					kind: 'host',
					projectName: 'Acme',
					clientName: 'acme-client',
					namespacePrefix: 'acme',
					description: 'Acme server',
				},
			},
			{
				tool: 'delendai_create_project',
				args: { kind: 'client', projectName: 'Named' },
			},
		]);
	});

	it('adopt forwards write mode and the remaining optional names', async () => {
		const { ctx, calls } = buildStubContext();
		await find('adopt').run([], ctx);
		await find('adopt').run(
			[
				'--write',
				'--overwrite',
				'--server-name=acme-mcp',
				'--default-model=claude-opus-5',
			],
			ctx,
		);
		expect(calls).toEqual([
			{ tool: 'delendai_adopt_project', args: {} },
			{
				tool: 'delendai_adopt_project',
				args: {
					write: true,
					overwrite: true,
					mcpServerName: 'acme-mcp',
					defaultModel: 'claude-opus-5',
				},
			},
		]);
	});
});
