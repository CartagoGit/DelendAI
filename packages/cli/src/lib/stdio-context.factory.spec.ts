/**
 * Which file the CLI spawns as its server.
 *
 * This was a ladder of four guesses, every rung describing the
 * development layout. From the built bundle in a consumer project all
 * four were missing, so the shipped CLI could not start its own server —
 * which is every consumer.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';
import {
	createStdioContext,
	type IConnectToServer,
	resolveServerEntrypoint,
} from './stdio-context.factory';

const globalsWith = (over: Partial<ICliGlobalOptions> = {}) =>
	fakePartial<ICliGlobalOptions, 'workspace'>({
		workspace: '/p',
		...over,
	});

describe('resolveServerEntrypoint (x00612)', () => {
	it('spawns the binary that is already running', () => {
		// `__serve` is handled by this same entrypoint in both layouts:
		// from source it is the .ts, installed it is the bundle.
		expect(resolveServerEntrypoint({}, ['bun', import.meta.filename])).toBe(
			import.meta.filename,
		);
	});

	it('lets a host say so explicitly, and prefers that over anything', () => {
		expect(
			resolveServerEntrypoint({ DELENDAI_SERVER_BIN: '/opt/delendai' }, [
				'bun',
				import.meta.filename,
			]),
		).toBe('/opt/delendai');
	});

	it('refuses, naming the override, when the entrypoint is not on disk', () => {
		// Guessing here is what produced four wrong answers.
		expect(() =>
			resolveServerEntrypoint({}, ['bun', '/nowhere/that/exists.js']),
		).toThrow(/DELENDAI_SERVER_BIN/u);
	});

	it('refuses when the process hides its own entrypoint', () => {
		expect(() => resolveServerEntrypoint({}, ['bun'])).toThrow(
			/does not expose its own entrypoint/u,
		);
	});

	it('treats an empty override as no override', () => {
		expect(
			resolveServerEntrypoint({ DELENDAI_SERVER_BIN: '' }, [
				'bun',
				import.meta.filename,
			]),
		).toBe(import.meta.filename);
	});
});

describe('createStdioContext (x00612)', () => {
	const spy = () => {
		const seen: Parameters<IConnectToServer>[0][] = [];
		const calls: string[] = [];
		const connect: IConnectToServer = async (options) => {
			seen.push(options);
			return {
				request: async <TOut>(tool: string): Promise<TOut> => {
					calls.push(`request:${tool}`);
					return {} as TOut;
				},
				listTools: async () => {
					calls.push('listTools');
					return [];
				},
				close: async () => {
					calls.push('close');
				},
			};
		};
		return { seen, calls, connect };
	};

	it('spawns the running binary with the workspace it was given', async () => {
		const { seen, connect } = spy();

		const ctx = await createStdioContext(
			'/somebody/else/project',
			globalsWith({ workspace: '/somebody/else/project' }),
			[],
			connect,
		);

		expect(ctx.cwd).toBe('/somebody/else/project');
		const options = seen[0];
		expect(options?.command).toBe('bun');
		expect(options?.cwd).toBe('/somebody/else/project');
		expect(options?.args?.[0]).toBe(process.argv[1]);
		expect(options?.args).toContain('__serve');
	});

	it('refuses a tcp remote by name rather than trying to speak it', async () => {
		const { seen, connect } = spy();

		await expect(
			createStdioContext(
				'/p',
				globalsWith({ remote: 'tcp://host:1' }),
				[],
				connect,
			),
		).rejects.toThrow(/tcp remote transport is planned/u);
		// And it did not spawn anything on the way to refusing.
		expect(seen).toHaveLength(0);
	});

	it('names the flag to use when the transport is not one it has', async () => {
		const { seen, connect } = spy();

		await expect(
			createStdioContext(
				'/p',
				globalsWith({ remote: 'carrier-pigeon' }),
				[],
				connect,
			),
		).rejects.toThrow(/--remote=stdio/u);
		expect(seen).toHaveLength(0);
	});

	it('passes the extra plugins the caller asked for', async () => {
		const { seen, connect } = spy();

		await createStdioContext('/p', globalsWith(), ['proposals'], connect);

		expect(seen[0]?.args).toContain('proposals');
	});

	it('hands back a context whose calls reach the server it connected to', () => {
		return (async () => {
			const { calls, connect } = spy();

			const ctx = await createStdioContext(
				'/p',
				globalsWith(),
				[],
				connect,
			);
			await ctx.request('delendai_status', {});
			await ctx.listTools();
			await ctx.close?.();

			// The context is a thin pass-through, and a test that never
			// calls it would not notice if it stopped being one.
			expect(calls).toStrictEqual([
				'request:delendai_status',
				'listTools',
				'close',
			]);
		})();
	});
});
