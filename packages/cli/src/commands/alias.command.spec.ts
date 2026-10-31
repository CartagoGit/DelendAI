import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IAliasIo } from '../contracts/interfaces/alias.interface';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createAliasCommand } from './alias.command';

const BIN_DIR = '/opt/bin';
const LAUNCH = {
	canonicalPath: '/opt/delendai/dist/index.js',
	binDir: BIN_DIR,
	source: 'argv1',
} as const;

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

const ctxWith = (
	extraOptions?: ICliCommandContext['globals']['extraOptions'],
): ICliCommandContext => ({
	cwd: '/ws',
	globals: {
		workspace: '/ws',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
		...(extraOptions === undefined ? {} : { extraOptions }),
	},
	request: async <TOut>() => ({}) as TOut,
	listTools: async () => [],
	close: async () => {},
});

const commandOver = (io: IAliasIo) =>
	createAliasCommand({ io, resolveLaunch: () => LAUNCH });

const dataOf = (result: { readonly data?: unknown }) =>
	result.data as Record<string, unknown>;

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('alias command', () => {
	it('names itself and documents its subcommands', () => {
		const command = commandOver(ioOver());
		expect(command.name).toBe('alias');
		expect(command.usage).toContain('status|install|remove');
	});

	it('reports an absent alias with no subcommand and with status', async () => {
		const command = commandOver(ioOver());
		for (const path of [['alias'], ['alias', 'status'], ['status']]) {
			const result = await command.run(path, ctxWith());
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(dataOf(result)).toMatchObject({
				alias: 'est',
				state: 'absent',
			});
		}
	});

	it('installs the alias into the resolved bin directory, then reports it as ours', async () => {
		const io = ioOver();
		const command = commandOver(io);
		const installed = await command.run(['alias', 'install'], ctxWith());
		expect(installed.code).toBe(EXIT_CODE.OK);
		expect(dataOf(installed).action).toBe('created');
		expect(Object.keys(io.files)).toEqual([`${BIN_DIR}/est`]);
		const status = await command.run(['alias', 'status'], ctxWith());
		expect(dataOf(status).state).toBe('ours');
	});

	it('removes only what it installed', async () => {
		const io = ioOver();
		const command = commandOver(io);
		await command.run(['alias', 'install'], ctxWith());
		const removed = await command.run(['alias', 'remove'], ctxWith());
		expect(removed.code).toBe(EXIT_CODE.OK);
		expect(dataOf(removed).status).toMatchObject({ state: 'absent' });
		expect(io.files).toEqual({});
	});

	it('refuses to overwrite a name somebody else holds', async () => {
		const io = ioOver({ [`${BIN_DIR}/est`]: '#!/bin/sh\necho foreign\n' });
		const result = await commandOver(io).run(
			['alias', 'install'],
			ctxWith(),
		);
		expect(dataOf(result).action).toBe('refused');
		expect(io.files[`${BIN_DIR}/est`]).toContain('foreign');
	});

	it('takes the bin directory from --options-alias-bin-dir before the environment', async () => {
		vi.stubEnv('DELENDAI_ALIAS_BIN_DIR', '/from/env');
		const io = ioOver();
		await commandOver(io).run(
			['alias', 'install'],
			ctxWith({ alias: { binDir: '/from/option' } }),
		);
		expect(Object.keys(io.files)).toEqual(['/from/option/est']);
	});

	it('takes the bin directory from DELENDAI_ALIAS_BIN_DIR when no option is given', async () => {
		vi.stubEnv('DELENDAI_ALIAS_BIN_DIR', '/from/env');
		const io = ioOver();
		await commandOver(io).run(['alias', 'install'], ctxWith());
		expect(Object.keys(io.files)).toEqual(['/from/env/est']);
	});

	it('ignores an empty bin directory option and uses the launch directory', async () => {
		vi.stubEnv('DELENDAI_ALIAS_BIN_DIR', '');
		const io = ioOver();
		await commandOver(io).run(
			['alias', 'install'],
			ctxWith({ alias: { binDir: '' } }),
		);
		expect(Object.keys(io.files)).toEqual([`${BIN_DIR}/est`]);
	});

	it('answers an unknown subcommand with the usage exit code', async () => {
		const result = await commandOver(ioOver()).run(
			['alias', 'frobnicate'],
			ctxWith(),
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toBe('unknown alias subcommand: frobnicate');
	});

	it('links a launcher into the global bin directory and unlinks it', async () => {
		vi.stubEnv('BUN_INSTALL', '/bun');
		vi.stubEnv('HOME', '/home/x');
		const io = ioOver({ '/bun/bin': '' });
		const command = commandOver(io);
		const linked = await command.run(['alias', 'link'], ctxWith());
		expect(linked.code).toBe(EXIT_CODE.OK);
		expect(dataOf(linked).detail).toContain('delendai alias unlink');
		expect(
			Object.keys(io.files).some((p) => p.startsWith('/bun/bin/')),
		).toBe(true);
		const unlinked = await command.run(['alias', 'unlink'], ctxWith());
		expect(unlinked.code).toBe(EXIT_CODE.OK);
		expect(dataOf(unlinked).detail).toContain('launcher removed');
	});

	it('fails link with a usage code when no global bin directory can be found', async () => {
		for (const name of [
			'BUN_INSTALL',
			'HOME',
			'USERPROFILE',
			'NPM_CONFIG_PREFIX',
			'npm_config_prefix',
		])
			vi.stubEnv(name, '');
		const result = await commandOver(ioOver()).run(
			['alias', 'link'],
			ctxWith(),
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toContain('no global bin directory found');
	});
});
