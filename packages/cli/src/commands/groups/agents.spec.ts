/**
 * Unit tests for the `agents` CLI group — the terminal surface for the
 * auto-agent-selector router. Each command delegates 1:1 to its `auto_*`
 * MCP tool; `ctx.request` is a recording stub (no MCP server booted).
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { agentsCommands } from './agents';

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
	const command = agentsCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('agents group', () => {
	it('exposes status/recommend/record', () => {
		expect(agentsCommands.map((c) => c.name)).toEqual([
			'agents status',
			'agents recommend',
			'agents record',
			'agents run',
		]);
	});

	it('agents run forwards task + routing knobs', async () => {
		const { ctx, calls } = buildStubContext();
		await find('agents run').run(
			['--task=refactor', '--dial=7', '--ceiling=4', '--max-depth=3'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_auto-agent-selector_auto_run',
			args: {
				task: 'refactor',
				costQualityTradeoff: 7,
				costCeiling: 4,
				maxDepth: 3,
			},
		});
	});

	it('agents status takes no args', async () => {
		const { ctx, calls } = buildStubContext();
		await find('agents status').run([], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_auto-agent-selector_auto_status',
			args: {},
		});
	});

	it('agents recommend forwards the dial + pin', async () => {
		const { ctx, calls } = buildStubContext();
		await find('agents recommend').run(['--dial=3', '--pin=claude'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_auto-agent-selector_auto_recommend',
			args: { costQualityTradeoff: 3, pin: 'claude' },
		});
	});

	it('agents record requires a provider and coerces success', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('agents record').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('agents record').run(
			['--provider=gemini', '--success=true', '--task=review'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_auto-agent-selector_auto_record',
			args: { providerId: 'gemini', success: true, taskType: 'review' },
		});
	});
});
