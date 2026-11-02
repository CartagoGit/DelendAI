import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IBridgeEnvironment,
	IBridgeIo,
} from '../contracts/interfaces/bridge.interface';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createBridgeCommand } from './bridge.command';

const ioOver = (files: Record<string, string> = {}) => ({
	files,
	read: async (path: string) => files[path],
	write: async (path: string, contents: string) => {
		files[path] = contents;
	},
	remove: async (path: string) => {
		delete files[path];
	},
	exists: async (path: string) => path in files,
	join: (...parts: readonly string[]) => parts.join('/'),
});

const ctxFor = (workspace: string): ICliCommandContext => ({
	cwd: workspace,
	globals: {
		workspace,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>() => ({}) as TOut,
	listTools: async () => [],
	close: async () => {},
});

const commandOver = (io: IBridgeIo, seen: string[] = []) =>
	createBridgeCommand({
		io,
		envFactory: (ctx): IBridgeEnvironment => {
			seen.push(ctx.globals.workspace);
			return {
				platform: 'posix',
				workspaceRoot: ctx.globals.workspace,
				canonical: 'delendai',
			};
		},
	});

const dataOf = (result: { readonly data?: unknown }) =>
	result.data as Record<string, unknown>;

describe('bridge command', () => {
	it('names itself and documents its subcommands', () => {
		const command = commandOver(ioOver());
		expect(command.name).toBe('bridge');
		expect(command.usage).toContain('status|install|remove');
	});

	it('reports the bridge directory with no subcommand and with status, writing nothing', async () => {
		const io = ioOver();
		const command = commandOver(io);
		for (const path of [['bridge'], ['bridge', 'status']]) {
			const result = await command.run(path, ctxFor('/ws'));
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(dataOf(result)).toMatchObject({
				canonical: 'delendai',
				readmePresent: false,
			});
		}
		expect(io.files).toEqual({});
	});

	it('resolves the environment from the command workspace', async () => {
		const seen: string[] = [];
		await commandOver(ioOver(), seen).run(
			['bridge', 'status'],
			ctxFor('/elsewhere'),
		);
		expect(seen).toEqual(['/elsewhere']);
	});

	it('installs a shim per legacy name under the workspace and says what it did', async () => {
		const io = ioOver();
		const result = await commandOver(io).run(
			['bridge', 'install'],
			ctxFor('/ws'),
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		const out = dataOf(result);
		expect(out.action).toBeDefined();
		expect(Array.isArray(out.perShim)).toBe(true);
		expect(Object.keys(io.files).length).toBeGreaterThan(0);
		expect(Object.keys(io.files).every((p) => p.startsWith('/ws/'))).toBe(
			true,
		);
	});

	it('removes what it installed', async () => {
		const io = ioOver();
		const command = commandOver(io);
		await command.run(['bridge', 'install'], ctxFor('/ws'));
		const removed = await command.run(['bridge', 'remove'], ctxFor('/ws'));
		expect(removed.code).toBe(EXIT_CODE.OK);
		expect(
			Object.keys(io.files).filter((p) => !p.endsWith('README.md')),
		).toEqual([]);
	});

	it('leaves a file it did not write where it is', async () => {
		const probe = ioOver();
		await commandOver(probe).run(['bridge', 'install'], ctxFor('/ws'));
		const shimPath = Object.keys(probe.files).find(
			(p) => !p.endsWith('README.md'),
		);
		expect(shimPath).toBeDefined();
		const io = ioOver({ [shimPath as string]: 'somebody else wrote this' });
		await commandOver(io).run(['bridge', 'install'], ctxFor('/ws'));
		expect(io.files[shimPath as string]).toBe('somebody else wrote this');
		await commandOver(io).run(['bridge', 'remove'], ctxFor('/ws'));
		expect(io.files[shimPath as string]).toBe('somebody else wrote this');
	});

	it('answers an unknown subcommand with the usage exit code', async () => {
		const result = await commandOver(ioOver()).run(
			['bridge', 'frobnicate'],
			ctxFor('/ws'),
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toBe('unknown bridge subcommand: frobnicate');
	});
});
