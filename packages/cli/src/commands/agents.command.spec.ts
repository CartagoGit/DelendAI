/**
 * agents.command.spec.ts — `delendai agents list|add|install|show`, with
 * the core flows stubbed so nothing reads the machine or the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

const core = vi.hoisted(() => ({
	listAgents: vi.fn(),
	declareAgent: vi.fn(),
	installAgent: vi.fn(),
	introduceAgent: vi.fn(),
	writeAgentUsagePage: vi.fn(),
}));
vi.mock('@delendai/core/cli', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	...core,
}));
const prompts = vi.hoisted(() => ({
	isInteractive: vi.fn(() => false),
	openRl: vi.fn(() => ({ close: vi.fn() })),
	askConfirm: vi.fn(async () => false),
}));
vi.mock('../lib/init/init-prompts.service', () => prompts);

const {
	agentsAddCommand,
	agentsInstallCommand,
	agentsListCommand,
	agentsShowCommand,
} = await import('./agents.command');

const ctx = (json = true): ICliCommandContext => ({
	cwd: '/ws',
	globals: {
		workspace: '/ws',
		json,
		format: json ? 'json' : 'text',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async () => {
		throw new Error('no tool call expected');
	},
	listTools: async () => [],
	close: async () => undefined,
});

const opencode = {
	id: 'opencode',
	name: 'OpenCode',
	kind: 'acp',
	origin: 'detected',
	launch: { command: 'opencode', args: ['acp'] },
	found: [
		{ name: 'OpenCode', foundIn: 'path', evidence: 'opencode is on PATH' },
	],
};

beforeEach(() => {
	core.listAgents.mockResolvedValue({
		agents: [
			opencode,
			{ ...opencode, id: 'x', launch: undefined, found: [] },
		],
		detected: [],
	});
	vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('agents list', () => {
	it('returns the agents as data, and prints a line each at a terminal', async () => {
		expect(
			(await agentsListCommand.run(['--all'], ctx())).data,
		).toMatchObject({ agents: [opencode, expect.anything()] });
		expect(core.listAgents).toHaveBeenCalledWith({
			workspace: '/ws',
			all: true,
		});
		const text = await agentsListCommand.run([], ctx(false));
		expect(text.suppressDefaultPrint).toBe(true);
		const printed = vi
			.mocked(process.stdout.write)
			.mock.calls.map(([line]) => String(line))
			.join('');
		expect(printed).toContain('2 agent(s)');
		expect(printed).toContain('can start');
		expect(printed).toContain('opencode is on PATH');
	});
});

describe('agents add', () => {
	it('declares what the flags say, and needs an id and a kind', async () => {
		core.declareAgent.mockResolvedValue({ added: true });
		await agentsAddCommand.run(
			['--id=mine', '--kind=acp', '--command=mine', '--args=a,b'],
			ctx(),
		);
		expect(core.declareAgent).toHaveBeenCalledWith({
			workspace: '/ws',
			agent: {
				id: 'mine',
				kind: 'acp',
				command: 'mine',
				args: ['a', 'b'],
			},
		});
		expect((await agentsAddCommand.run(['--id=mine'], ctx())).code).toBe(2);
		core.declareAgent.mockRejectedValue(
			new Error('kind: needs what reaches it'),
		);
		expect(
			(await agentsAddCommand.run(['--id=x', '--kind=http'], ctx()))
				.error,
		).toContain('needs what reaches it');
	});
});

describe('agents install', () => {
	it('installs with --yes, refuses without a terminal, and asks at one', async () => {
		core.installAgent.mockResolvedValue({ id: 'goose', note: 'installed' });
		expect(
			(await agentsInstallCommand.run(['goose', '--yes'], ctx())).data,
		).toEqual({ id: 'goose', note: 'installed' });
		expect(
			(await agentsInstallCommand.run(['goose'], ctx())).error,
		).toContain('--yes');
		prompts.isInteractive.mockReturnValue(true);
		expect((await agentsInstallCommand.run(['goose'], ctx())).data).toEqual(
			{ id: 'goose', installed: false },
		);
		expect((await agentsInstallCommand.run([], ctx())).code).toBe(2);
		core.installAgent.mockRejectedValue(
			new Error('does not match its sha256'),
		);
		expect(
			(await agentsInstallCommand.run(['goose', '--yes'], ctx())).error,
		).toContain('sha256');
	});
});

describe('agents show', () => {
	it('greets an agent that can start, and says why one cannot', async () => {
		core.introduceAgent.mockResolvedValue({ agent: { name: 'OpenCode' } });
		expect((await agentsShowCommand.run(['opencode'], ctx())).data).toEqual(
			{
				id: 'opencode',
				introduction: { agent: { name: 'OpenCode' } },
			},
		);
		expect(core.introduceAgent).toHaveBeenCalledWith(
			opencode.launch,
			'/ws',
		);
		expect(
			JSON.stringify((await agentsShowCommand.run(['x'], ctx())).data),
		).toContain('cannot start');
		expect((await agentsShowCommand.run(['nope'], ctx())).error).toContain(
			'no agent nope',
		);
		expect((await agentsShowCommand.run([], ctx())).code).toBe(2);
		core.introduceAgent.mockRejectedValue(new Error('did not answer'));
		expect(
			(await agentsShowCommand.run(['opencode'], ctx())).error,
		).toContain('did not answer');
	});
});
