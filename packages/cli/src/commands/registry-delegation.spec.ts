import { describe, expect, it, vi } from 'vitest';

import type {
	ICliCommand,
	ICliCommandContext,
} from '../contracts/interfaces/cli-command.interface';
import { registerAllCommands } from './registry';

/** A command that answers with the name it was registered under. */
const answering = (name: string): ICliCommand => ({
	name,
	summary: name,
	run: async (args) => ({ code: 0, data: { name, args } }),
});

vi.mock('./agents.command', () => ({
	agentsListCommand: answering('agents list'),
	agentsAddCommand: answering('agents add'),
	agentsInstallCommand: answering('agents install'),
	agentsAnswerCommand: answering('agents answer'),
	agentsShowCommand: answering('agents show'),
}));
vi.mock('./language.command', () => ({
	languageCommand: answering('language'),
}));
vi.mock('./alias.command', () => ({ aliasCommand: answering('alias') }));
vi.mock('./bridge.command', () => ({ bridgeCommand: answering('bridge') }));
vi.mock('./migrate.command', () => ({ migrateCommand: answering('migrate') }));
vi.mock('./cache.command', () => ({ cacheCommand: answering('cache') }));

const ctx = (answer: unknown = { ok: true }): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>() => answer as TOut,
	listTools: async () => [],
	close: async () => undefined,
});

const commandNamed = async (name: string): Promise<ICliCommand> => {
	const found = (await registerAllCommands()).find(
		(command) => command.name === name,
	);
	if (found === undefined) throw new Error(`no command ${name}`);
	return found;
};

describe('registry delegation', () => {
	it.each([
		'agents list',
		'agents add',
		'agents install',
		'agents answer',
		'agents show',
		'language',
		'alias',
		'bridge',
		'migrate',
		'cache',
	])('%s runs the command its own module exports', async (name) => {
		const result = await (await commandNamed(name)).run(['--x'], ctx());
		expect(result.data).toEqual({ name, args: ['--x'] });
	});

	it('status and overview answer from the server and only read', async () => {
		for (const name of ['status', 'overview']) {
			const command = await commandNamed(name);
			expect(command.readsOnly?.([])).toBe(true);
			const result = await command.run([], ctx({ answered: name }));
			expect(result.code).toBe(0);
			expect(result.data).toEqual({ answered: name });
		}
	});

	it('adopt only reads unless it is asked to write', async () => {
		const adopt = await commandNamed('adopt');
		expect(adopt.readsOnly?.([])).toBe(true);
		expect(adopt.readsOnly?.(['--write'])).toBe(false);
	});
});
