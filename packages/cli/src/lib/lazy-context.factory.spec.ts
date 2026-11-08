import { describe, expect, it, vi } from 'vitest';

import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../contracts/interfaces/cli-command.interface';
import { parseCliInvocation } from './parser.service';
import { createLazyContext } from './lazy-context.factory';

const GLOBALS: ICliGlobalOptions = parseCliInvocation(
	[],
	'/w',
	new Set(),
	null,
).globals;

const server = () => {
	let requests = 0;
	const request = async <TOut>(): Promise<TOut> => {
		requests += 1;
		return JSON.parse('null');
	};
	const close = vi.fn(async () => undefined);
	const context: ICliCommandContext = {
		cwd: '/w',
		globals: GLOBALS,
		request,
		listTools: async () => [],
		close,
	};
	return { context, requests: () => requests, close };
};

describe('createLazyContext', () => {
	it('starts no server for a command that never calls a tool', async () => {
		const open = vi.fn();
		const lazy = createLazyContext('/w', GLOBALS, open);
		await lazy.close();
		expect(open).not.toHaveBeenCalled();
	});

	it('starts the server once, at the first tool call', async () => {
		const { context, requests, close } = server();
		const open = vi.fn(async () => context);
		const lazy = createLazyContext('/w', GLOBALS, open);
		await lazy.request('a', {});
		await lazy.request('b', {});
		expect(open).toHaveBeenCalledTimes(1);
		expect(requests()).toBe(2);
		await lazy.close();
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('closes without throwing when the server never came up', async () => {
		const lazy = createLazyContext('/w', GLOBALS, async () => {
			throw new Error('no server');
		});
		await expect(lazy.request('a', {})).rejects.toThrow('no server');
		await expect(lazy.close()).resolves.toBeUndefined();
	});
});
