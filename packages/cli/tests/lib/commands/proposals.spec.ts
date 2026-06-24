/**
 * f00046 S7 — unit tests for the proposals group. Verifies the surface
 * (25 commands) and a representative sample of flag→tool mappings,
 * including the positional + required-flag validations. Recording-stub ctx.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../src/contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../../src/contracts/interfaces/cli-command.interface';
import { proposalsCommands } from '../../../src/commands/groups/proposals';

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

const find = (name: string): ICliCommand => {
	const command = proposalsCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('proposals group (f00046 S7)', async () => {
	it('exposes 25 commands, all prefixed "proposals "', async () => {
		expect(proposalsCommands).toHaveLength(25);
		for (const command of proposalsCommands) {
			expect(command.name.startsWith('proposals ')).toBe(true);
		}
	});

	it('auto-work maps --mode to persist', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals auto-work').run(['--mode=commit-and-push'], ctx);
		expect(calls[0]).toEqual({
			tool: 'proposals_auto_work',
			args: { persist: 'commit-and-push' },
		});
	});

	it('transition needs id + to + --reason', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('proposals transition').run(
			['f1', 'done'],
			ctx,
		);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('proposals transition').run(
			['f1', 'in-progress', '--reason=start'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'proposals_proposal_transition',
			args: { id: 'f1', to: 'in-progress', reason: 'start' },
		});
	});

	it('close-slice maps two positionals', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals close-slice').run(['f1', 'S2'], ctx);
		expect(calls[0]).toEqual({
			tool: 'proposals_close_slice',
			args: { proposalId: 'f1', sliceId: 'S2' },
		});
	});

	it('lock maps action + task→task_id + files', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals lock').run(
			['--action=claim', '--task=t1', '--agent=a', '--files=x.ts,y.ts'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'proposals_agent_lock',
			args: {
				action: 'claim',
				agent: 'a',
				task_id: 't1',
				files: ['x.ts', 'y.ts'],
			},
		});
	});

	it('delegate requires taskId + slot + files', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('proposals delegate').run(['t1'], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('proposals delegate').run(
			['t1', '--slot=implementation_runner', '--files=a.ts'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'proposals_delegate',
			args: {
				taskId: 't1',
				slot: 'implementation_runner',
				files: ['a.ts'],
			},
		});
	});

	it('state-repair defaults to dry-run, --execute switches mode', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals state-repair').run([], ctx);
		expect(calls[0]?.args).toEqual({ mode: 'dry-run' });
		await find('proposals state-repair').run(['--execute'], ctx);
		expect(calls[1]?.args).toEqual({ mode: 'execute' });
	});

	it('plan requires a --json slices array', async () => {
		const { ctx, calls } = buildStubContext();
		const missing = await find('proposals plan').run([], ctx);
		expect(missing.code).toBe(EXIT_CODE.USAGE);
		await find('proposals plan').run(
			['--json=[{"sliceId":"S1","files":["a.ts"]}]'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'proposals_plan',
			args: { slices: [{ sliceId: 'S1', files: ['a.ts'] }] },
		});
	});
});
