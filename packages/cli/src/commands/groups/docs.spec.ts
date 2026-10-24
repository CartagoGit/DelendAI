/**
 * f00046 S6 — `docs search` delegates to delendai_docs_docs_search, and the
 * extended `search` command forwards `--context` to delendai_search_search.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { docsCommands } from './docs';
import { registerAllCommands } from '../registry';

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

const find = async (name: string): Promise<ICliCommand> => {
	const command = (await registerAllCommands()).find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('docs search (f00046 S6)', async () => {
	it('requires a query and forwards include/limit', async () => {
		const command = docsCommands[0] as ICliCommand;
		const { ctx, calls } = buildStubContext();
		const missing = await command.run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await command.run(['budgets', '--include=docs/**', '--limit=5'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_docs_docs_search',
			args: { query: 'budgets', include: ['docs/**'], limit: 5 },
		});
	});
});

describe('search --context extension (f00046 S6)', async () => {
	it('forwards context to delendai_search_search', async () => {
		const { ctx, calls } = buildStubContext();
		await (await find('search')).run(['needle', '--context=3'], ctx);
		const call = calls[0];
		if (call === undefined) throw new Error('expected search tool call');
		expect(call.tool).toBe('delendai_search_search');
		expect((call.args as { context?: number }).context).toBe(3);
	});

	it('omits context when not provided', async () => {
		const { ctx, calls } = buildStubContext();
		await (await find('search')).run(['needle'], ctx);
		const call = calls[0];
		if (call === undefined) throw new Error('expected search tool call');
		expect((call.args as { context?: number }).context).toBeUndefined();
	});
});
