/**
 * Unit tests for the `security` CLI group. Each command delegates 1:1 to its
 * `security_*` MCP tool; `ctx.request` is a recording stub (no server booted).
 */
import { describe, expect, it } from 'vitest';

import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { securityCommands } from './security';

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
	const command = securityCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('security group', () => {
	it('exposes secrets/audit', () => {
		expect(securityCommands.map((c) => c.name)).toEqual([
			'security secrets',
			'security audit',
		]);
	});

	it('security secrets forwards scope + includeTests', async () => {
		const { ctx, calls } = buildStubContext();
		await find('security secrets').run(
			['--scope=tracked', '--include-tests'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_security_security_secrets',
			args: { scope: 'tracked', includeTests: true },
		});
	});

	it('security audit takes no args', async () => {
		const { ctx, calls } = buildStubContext();
		await find('security audit').run([], ctx);
		expect(calls[0]).toEqual({
			tool: 'mcp-vertex_security_security_audit',
			args: {},
		});
	});
});
