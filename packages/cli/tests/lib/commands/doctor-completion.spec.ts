/**
 * f00046 S10 — doctor + completion tests. Doctor rolls section statuses
 * onto the exit code; completion derives a shell script from the command
 * list (pure generator).
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { doctorCommands } from '../../../src/commands/groups/doctor';
import {
	buildCompletionModel,
	generateCompletion,
} from '../../../src/lib/completion/completion';

const buildStubContext = (response: unknown) => {
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
		request: async <TOut>(): Promise<TOut> => response as TOut,
		listTools: async () => [],
		close: async () => {},
	};
	return ctx;
};

const find = (name: string): ICliCommand => {
	const command = doctorCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('doctor (f00046 S10)', async () => {
	it('reports ok (exit 0) when plugins + tools are healthy', async () => {
		const ctx = buildStubContext({
			plugins: ['a', 'b'],
			tools: ['t1', 't2'],
			pluginDiagnostic: { missing: [], errors: 0 },
		});
		const res = await find('doctor').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect((res.data as { status: string }).status).toBe('ok');
	});

	it('warns (non-zero) when a configured plugin is missing', async () => {
		const ctx = buildStubContext({
			plugins: ['a'],
			tools: ['t1'],
			pluginDiagnostic: { missing: ['b'], errors: 1 },
		});
		const res = await find('doctor').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
		expect((res.data as { status: string }).status).toBe('warn');
	});
});

describe('completion (f00046 S10)', async () => {
	const names = ['status', 'git status', 'git log', 'memory save'];

	it('builds a model of leaves + groups', async () => {
		const model = buildCompletionModel(names);
		expect(model.leaves).toContain('status');
		// Verbs keep insertion order; the generators sort them on emit.
		expect(model.groups.get('git')).toEqual(['status', 'log']);
		expect(model.firstWords).toEqual(['git', 'memory', 'status']);
	});

	it('generates non-empty bash/zsh/fish scripts mentioning a group verb', async () => {
		for (const shell of ['bash', 'zsh', 'fish'] as const) {
			const script = generateCompletion(shell, names);
			expect(script.length).toBeGreaterThan(0);
			expect(script).toContain('git');
		}
	});

	it('rejects an unknown shell with USAGE', async () => {
		const ctx = buildStubContext({});
		const res = await find('completion').run(['powershell'], ctx);
		expect(res.code).toBe(EXIT_CODE.USAGE);
	});

	it('emits a bash script for `completion bash`', async () => {
		const ctx = buildStubContext({});
		const res = await find('completion').run(['bash'], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect(res.text).toContain('complete -F _mcpv_complete mcpv');
	});
});
