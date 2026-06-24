/**
 * f00046 S8 — notification / web-fetch / status-marker delegation tests.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { notificationCommands } from '../../../src/commands/groups/notification';
import { statusMarkerCommands } from '../../../src/commands/groups/status-marker';
import { webFetchCommands } from '../../../src/commands/groups/web-fetch';

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

describe('notification group (f00046 S8)', async () => {
	it('await-lock requires a taskId and forwards timeout', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find(
			notificationCommands,
			'notification await-lock',
		).run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find(notificationCommands, 'notification await-lock').run(
			['t1', '--timeout=5000'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'notification_await_lock',
			args: { taskId: 't1', timeoutMs: 5000 },
		});
	});
});

describe('web-fetch group (f00046 S8)', async () => {
	it('requires a url and forwards max-bytes/timeout', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find(webFetchCommands, 'web-fetch').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find(webFetchCommands, 'web-fetch').run(
			['https://example.com', '--max-bytes=1000', '--timeout=2000'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'web-fetch_web_fetch',
			args: {
				url: 'https://example.com',
				maxBytes: 1000,
				timeoutMs: 2000,
			},
		});
	});
});

describe('status-marker group (f00046 S8)', async () => {
	it('close forwards state + reason', async () => {
		const { ctx, calls } = buildStubContext();
		await find(statusMarkerCommands, 'status-marker close').run(
			['CAP', '--reason=out of budget'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'status-marker_close',
			args: { state: 'CAP', reason: 'out of budget' },
		});
	});

	it('ping takes no args', async () => {
		const { ctx, calls } = buildStubContext();
		await find(statusMarkerCommands, 'status-marker ping').run([], ctx);
		expect(calls[0]).toEqual({ tool: 'status-marker_ping', args: {} });
	});
});
