/**
 * f00046 S3 — unit tests for the deps / rules / test-convention groups.
 * Each command delegates 1:1 to its `*_*` MCP tool and forwards CLI
 * flags as the tool's `inputSchema` shape. `ctx.request` is a recording
 * stub — no MCP server is booted.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { depsCommands } from '../../../src/commands/groups/deps';
import { rulesCommands } from '../../../src/commands/groups/rules';
import { testConventionCommands } from '../../../src/commands/groups/test-convention';

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

const find = (group: readonly ICliCommand[], name: string): ICliCommand => {
	const command = group.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('deps group (f00046 S3)', async () => {
	it('exposes list/check/polyglot', async () => {
		expect(depsCommands.map((c) => c.name)).toEqual([
			'deps list',
			'deps check',
			'deps polyglot',
		]);
	});

	it('deps list forwards an optional manifest', async () => {
		const { ctx, calls } = buildStubContext();
		await find(depsCommands, 'deps list').run(['--manifest=apps/web'], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_deps_deps_list',
			args: { manifest: 'apps/web' },
		});
	});

	it('deps polyglot takes no args', async () => {
		const { ctx, calls } = buildStubContext();
		await find(depsCommands, 'deps polyglot').run([], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_deps_deps_polyglot',
			args: {},
		});
	});
});

describe('rules group (f00046 S3)', async () => {
	it('rules check forwards area + compact', async () => {
		const { ctx, calls } = buildStubContext();
		await find(rulesCommands, 'rules check').run(
			['--area=cli', '--compact'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_rules_check_rules',
			args: { area: 'cli', compact: true },
		});
	});

	it('rules apply forwards a files list', async () => {
		const { ctx, calls } = buildStubContext();
		await find(rulesCommands, 'rules apply').run(
			['--files=a.ts,b.ts'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_rules_apply_rules',
			args: { files: ['a.ts', 'b.ts'] },
		});
	});
});

describe('test-convention group (f00046 S3)', async () => {
	it('suggest requires a source path', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find(
			testConventionCommands,
			'test-convention suggest',
		).run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find(testConventionCommands, 'test-convention suggest').run(
			['src/lib/foo.ts'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'test-convention_suggest_spec_path',
			args: { sourcePath: 'src/lib/foo.ts' },
		});
	});

	it('scan forwards scope + maxFiles', async () => {
		const { ctx, calls } = buildStubContext();
		await find(testConventionCommands, 'test-convention scan').run(
			['--scope=src', '--max-files=100'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'test-convention_scan_drift',
			args: { scope: 'src', maxFiles: 100 },
		});
	});
});
