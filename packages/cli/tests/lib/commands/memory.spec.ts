/**
 * f00046 S2 — unit tests for the memory group. Verifies each command:
 *  1. has the canonical `name` (matches the registry spec).
 *  2. delegates 1:1 to the corresponding `memory_*` MCP tool.
 *  3. forwards CLI flags as the exact `inputSchema` shape the tool expects.
 *  4. surfaces a USAGE error when a required positional is missing.
 *
 * `ctx.request` is a stub that records calls — no MCP server is booted.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { memoryCommands } from '../../../src/commands/groups/memory';

const buildStubContext = (): {
	readonly ctx: ICliCommandContext;
	readonly calls: { readonly tool: string; readonly args: object }[];
} => {
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
	const command = memoryCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('memory group (f00046 S2)', async () => {
	it('exposes the 6 canonical commands', async () => {
		expect(memoryCommands.map((c) => c.name)).toEqual([
			'memory save',
			'memory recall',
			'memory list',
			'memory forget',
			'memory export',
			'memory import',
		]);
	});

	it('memory save maps title/body/tags/ttl to mcp-vertex_memory_save', async () => {
		const { ctx, calls } = buildStubContext();
		const res = await find('memory save').run(
			['my-note', '--body=hello', '--tags=a,b', '--ttl=60'],
			ctx,
		);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_save',
			args: {
				title: 'my-note',
				body: 'hello',
				tags: ['a', 'b'],
				ttlSeconds: 60,
			},
		});
	});

	it('memory save without a body is a USAGE error (no tool call)', async () => {
		const { ctx, calls } = buildStubContext();
		const res = await find('memory save').run(['only-title'], ctx);
		expect(res.code).toBe(EXIT_CODE.USAGE);
		expect(calls).toHaveLength(0);
	});

	it('memory recall forwards query/tags/limit', async () => {
		const { ctx, calls } = buildStubContext();
		await find('memory recall').run(
			['needle', '--tags=x', '--limit=5'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_recall',
			args: { query: 'needle', tags: ['x'], limit: 5 },
		});
	});

	it('memory list forwards limit/offset', async () => {
		const { ctx, calls } = buildStubContext();
		await find('memory list').run(['--limit=10', '--offset=20'], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_list',
			args: { limit: 10, offset: 20 },
		});
	});

	it('memory forget requires an id and forwards it', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('memory forget').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('memory forget').run(['note-123'], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_forget',
			args: { id: 'note-123' },
		});
	});

	it('memory export forwards format + include-expired', async () => {
		const { ctx, calls } = buildStubContext();
		await find('memory export').run(
			['--format=ndjson', '--include-expired'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_export',
			args: { format: 'ndjson', includeExpired: true },
		});
	});

	it('memory import requires a payload and forwards mode/conflict/format', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('memory import').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('memory import').run(
			[
				'{"notes":[]}',
				'--mode=merge',
				'--conflict=skip',
				'--format=json',
			],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_memory_import',
			args: {
				payload: '{"notes":[]}',
				mode: 'merge',
				conflict: 'skip',
				format: 'json',
			},
		});
	});
});
