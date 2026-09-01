#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import { main, selectSteps, STEPS, type IGenAllIo } from './gen-all.script.ts';

const createIo = (
	responses: Record<string, number>,
): {
	readonly io: IGenAllIo;
	readonly output: string[];
	readonly errors: string[];
	readonly commands: string[];
} => {
	const output: string[] = [];
	const errors: string[] = [];
	const commands: string[] = [];
	const io: IGenAllIo = {
		out: (msg) => {
			output.push(msg);
		},
		err: (msg) => {
			errors.push(msg);
		},
		runCommand: async (command, args) => {
			const key = [command, ...args].join(' ');
			commands.push(key);
			return responses[key] ?? 0;
		},
	};
	return { io, output, errors, commands };
};

describe('gen-all.script', () => {
	it('wires the slice generators in the proposal order', () => {
		expect(
			STEPS.map((step) => ({
				name: step.name,
				cmd: step.cmd.join(' '),
			})),
		).toEqual([
			{
				name: 'agent-catalog',
				cmd: 'bun tools/scripts/catalog/generate-agent-catalog.script.ts',
			},
			{
				name: 'plugin-manifests',
				cmd: 'bun tools/scripts/generate/from-manifests.script.ts',
			},
			{
				name: 'capability-matrix',
				cmd: 'bun tools/scripts/gen/capability-matrix.script.ts',
			},
			{
				name: 'agent-md',
				cmd: 'bun tools/scripts/gen/agent-md.script.ts',
			},
			{
				name: 'token-budget-dashboard',
				cmd: 'bun tools/scripts/report/token-budget-dashboard.script.ts',
			},
			{
				name: 'host-hints',
				cmd: 'bun tools/scripts/catalog/render-host-hints.script.ts',
			},
		]);
	});

	it('selects a single step with --only', () => {
		const selection = selectSteps(['--only', 'agent-md']);
		expect(selection.only).toBe('agent-md');
		expect(selection.steps.map((step) => step.name)).toEqual(['agent-md']);
	});

	it('--list prints the selected commands without executing them', async () => {
		const { io, output, commands } = createIo({});
		const exit = await main(['--list', '--only', 'host-hints'], io);
		expect(exit).toBe(0);
		expect(commands).toEqual([]);
		expect(output).toEqual([
			'  host-hints: bun tools/scripts/catalog/render-host-hints.script.ts',
		]);
	});

	it('--check uses step-specific check commands and runs git diff last', async () => {
		const { io, commands } = createIo({
			'bun tools/scripts/catalog/generate-agent-catalog.script.ts': 0,
			'bun tools/scripts/generate/from-manifests.script.ts --check': 0,
			'bun tools/scripts/gen/capability-matrix.script.ts': 0,
			'bun tools/scripts/gen/agent-md.script.ts': 0,
			'bun tools/scripts/report/token-budget-dashboard.script.ts': 0,
			'bun tools/scripts/catalog/render-host-hints.script.ts --check': 0,
			'git diff --exit-code': 0,
		});

		const exit = await main(['--check'], io);

		expect(exit).toBe(0);
		expect(commands).toEqual([
			'bun tools/scripts/catalog/generate-agent-catalog.script.ts',
			'bun tools/scripts/generate/from-manifests.script.ts --check',
			'bun tools/scripts/gen/capability-matrix.script.ts',
			'bun tools/scripts/gen/agent-md.script.ts',
			'bun tools/scripts/report/token-budget-dashboard.script.ts',
			'bun tools/scripts/catalog/render-host-hints.script.ts --check',
			'git diff --exit-code',
		]);
	});

	it('--check exits 1 when git diff reports drift', async () => {
		const { io, errors } = createIo({
			'git diff --exit-code': 1,
		});

		const exit = await main(['--check'], io);

		expect(exit).toBe(1);
		expect(errors).toContain(
			'gen-all: drift detected — see the diff above',
		);
	});

	it('returns 1 when a generator fails and skips git diff', async () => {
		const { io, commands, errors } = createIo({
			'bun tools/scripts/catalog/generate-agent-catalog.script.ts': 0,
			'bun tools/scripts/generate/from-manifests.script.ts --check': 2,
		});

		const exit = await main(['--check'], io);

		expect(exit).toBe(1);
		expect(commands).toEqual([
			'bun tools/scripts/catalog/generate-agent-catalog.script.ts',
			'bun tools/scripts/generate/from-manifests.script.ts --check',
			'bun tools/scripts/gen/capability-matrix.script.ts',
			'bun tools/scripts/gen/agent-md.script.ts',
			'bun tools/scripts/report/token-budget-dashboard.script.ts',
			'bun tools/scripts/catalog/render-host-hints.script.ts --check',
		]);
		expect(errors).toContain(
			'gen-all: at least one generator exited non-zero (exit=2)',
		);
		expect(commands).not.toContain('git diff --exit-code');
	});

	it('returns 2 for an unknown --only selector', async () => {
		const { io, errors } = createIo({});
		const exit = await main(['--only', 'missing-step'], io);
		expect(exit).toBe(2);
		expect(errors[0]).toContain('gen-all: unknown --only');
	});
});
