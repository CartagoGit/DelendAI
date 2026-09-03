#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	attributableDrift,
	main,
	selectSteps,
	STEPS,
	type IGenAllIo,
} from './gen-all.script.ts';

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
		// A clean tree by default: tests that care about drift override it.
		dirtyPaths: () => new Set<string>(),
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
			// No `git diff --exit-code` any more: drift is now read from
			// the dirty-path snapshot, not from a subprocess exit code,
			// because the exit code cannot say WHICH files moved and this
			// gate has to tell its own output from another agent's edit.
		]);
	});

	it('--check exits 1 when a generator leaves a checked-in artifact stale', async () => {
		// The drift the generators caused: nothing was dirty going in, a
		// generated file is dirty coming out.
		const { io, errors } = createIo({});
		let call = 0;
		const withDirt: IGenAllIo = {
			...io,
			dirtyPaths: () =>
				(call += 1) === 1
					? new Set<string>()
					: new Set(['docs/mcp-vertex/TOKEN-BUDGETS.md']),
		};

		const exit = await main(['--check'], withDirt);

		expect(exit).toBe(1);
		expect(errors.join('\n')).toContain('TOKEN-BUDGETS.md');
	});

	it('--check exits 0 when the only dirty file was another agent\u2019s', async () => {
		// The deadlock. Several agents share this checkout, so judging the
		// whole tree let one half-written file block every other agent's
		// push with nothing they could do about it.
		const { io, output } = createIo({});
		const inFlight = new Set(['plugins/other/src/in-flight.ts']);
		const withDirt: IGenAllIo = { ...io, dirtyPaths: () => inFlight };

		expect(await main(['--check'], withDirt)).toBe(0);
		expect(output.join('\n')).toContain('unattributable');
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

describe('drift attribution', () => {
	it('blames the generators only for files they actually changed', () => {
		// The deadlock this replaced: `git diff --exit-code` judged the
		// whole working tree, so in a repo where several agents share one
		// checkout, any agent with a half-written file failed the pre-push
		// hook for everyone else — permanently, with nothing the blocked
		// agent could do. On 2026-09-04 it held seven finished commits
		// hostage to an unrelated file someone else was mid-edit on.
		const before = new Set(['plugins/other/src/in-flight.ts']);
		const after = new Set([
			'plugins/other/src/in-flight.ts',
			'docs/mcp-vertex/TOKEN-BUDGETS.md',
		]);
		expect(attributableDrift(before, after)).toEqual([
			'docs/mcp-vertex/TOKEN-BUDGETS.md',
		]);
	});

	it('says nothing when the only dirty files were dirty already', () => {
		const dirty = new Set(['a.ts', 'b.ts']);
		expect(attributableDrift(dirty, dirty)).toEqual([]);
	});

	it('still catches a stale artifact in an otherwise clean tree', () => {
		// The case the gate exists for, and the one that must keep failing:
		// nothing was dirty, a generator rewrote a checked-in artifact,
		// so that artifact is stale in git.
		expect(
			attributableDrift(
				new Set(),
				new Set(['packages/core/src/lib/x.generated.ts']),
			),
		).toEqual(['packages/core/src/lib/x.generated.ts']);
	});
});
