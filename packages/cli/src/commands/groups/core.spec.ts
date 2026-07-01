/**
 * f00046 S5 — unit tests for the fs / knowledge / project group. Each
 * command delegates 1:1 to its `mcp-vertex_*` core meta-tool and maps
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
			'project analyze',
			'project plan',
			'project create',
		]);
	});

	it('fs read forwards a path and an optional range', async () => {
		const { ctx, calls } = buildStubContext();
		await find('fs read').run(['src/a.ts', '--start=1', '--end=5'], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_fs_read',
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
			tool: 'mcp-vertex_fs_write',
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
			tool: 'mcp-vertex_knowledge',
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
			tool: 'mcp-vertex_create_project',
			args: { kind: 'plugin', pluginName: 'widgets' },
		});
	});
});
