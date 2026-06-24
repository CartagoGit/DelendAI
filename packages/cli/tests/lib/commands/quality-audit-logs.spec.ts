/**
 * f00046 S4 — unit tests for the quality / audit / logs groups. Each
 * command delegates 1:1 to its MCP tool; `quality run`/`run-all` also
 * map the report's pass/fail onto the exit code. Recording-stub ctx.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { auditCommands } from '../../../src/commands/groups/audit';
import { logsCommands } from '../../../src/commands/groups/logs';
import { qualityCommands } from '../../../src/commands/groups/quality';

const buildStubContext = (response: unknown = { ok: true }) => {
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
			return response as TOut;
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

describe('quality group (f00046 S4)', async () => {
	it('quality run forwards the scope', async () => {
		const { ctx, calls } = buildStubContext();
		await find(qualityCommands, 'quality run').run(['--scope=lint'], ctx);
		expect(calls[0]).toEqual({
			tool: 'quality_run_quality',
			args: { scope: 'lint' },
		});
	});

	it('quality run-all returns VALIDATION when the summary failed', async () => {
		const { ctx } = buildStubContext({ summary: { ok: false } });
		const res = await find(qualityCommands, 'quality run-all').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
		// The structured report is still returned for `--json` consumers.
		expect(res.data).toEqual({ summary: { ok: false } });
	});

	it('quality run-all returns OK when the summary passed', async () => {
		const { ctx } = buildStubContext({ summary: { ok: true } });
		const res = await find(qualityCommands, 'quality run-all').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
	});
});

describe('audit group (f00046 S4)', async () => {
	it('audit plan maps --kind to the tool scope', async () => {
		const { ctx, calls } = buildStubContext();
		await find(auditCommands, 'audit plan').run(['--kind=security'], ctx);
		expect(calls[0]).toEqual({
			tool: 'audit_audit_plan',
			args: { scope: 'security' },
		});
	});

	it('audit consolidate forwards dir + top', async () => {
		const { ctx, calls } = buildStubContext();
		await find(auditCommands, 'audit consolidate').run(
			['--dir=docs/audits', '--top=5'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'audit_audit_consolidate',
			args: { auditDir: 'docs/audits', topActions: 5 },
		});
	});
});

describe('logs group (f00046 S4)', async () => {
	it('logs query forwards filters incl. task→taskId alias', async () => {
		const { ctx, calls } = buildStubContext();
		await find(logsCommands, 'logs query').run(
			['--task=t1', '--outcome=failed', '--limit=10'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'logs_query',
			args: { taskId: 't1', outcome: 'failed', limit: 10 },
		});
	});

	it('logs redact-test requires a text sample', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find(logsCommands, 'logs redact-test').run(
			[],
			ctx,
		);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find(logsCommands, 'logs redact-test').run(['sk-secret'], ctx);
		expect(calls[0]).toEqual({
			tool: 'logs_redact_test',
			args: { text: 'sk-secret' },
		});
	});
});
