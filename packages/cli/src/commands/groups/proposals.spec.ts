/**
 * f00046 S7 — unit tests for the proposals group. Verifies the surface
 * (26 commands) and a representative sample of flag→tool mappings,
 * including the positional + required-flag validations. Recording-stub ctx.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { proposalsCommands } from './proposals';

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
	it('exposes 26 commands, all prefixed "proposals "', async () => {
		expect(proposalsCommands).toHaveLength(26);
		for (const command of proposalsCommands) {
			expect(command.name.startsWith('proposals ')).toBe(true);
		}
	});

	it('auto-work maps --mode to persist', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals auto-work').run(['--mode=commit-and-push'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_proposals_auto_work',
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
			tool: 'delendai_proposals_proposal_transition',
			args: { id: 'f1', to: 'in-progress', reason: 'start' },
		});
	});

	it('close-slice maps two positionals', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals close-slice').run(['f1', 'S2'], ctx);
		expect(calls[0]).toEqual({
			tool: 'delendai_proposals_close_slice',
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
			tool: 'delendai_proposals_agent_lock',
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
			tool: 'delendai_proposals_delegate',
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

	it('review carries the delivering commit and the approval evidence (x00646)', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals review').run(
			[
				'x00001',
				'S1',
				'--action=approve',
				'--agent=reviewer',
				'--note=checked',
				'--commit=abc1234',
				'--validate-exit=0',
				'--tests-passing=3',
				'--tests-total=3',
			],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_proposals_proposal_review',
			args: {
				proposalId: 'x00001',
				sliceId: 'S1',
				action: 'approve',
				agent: 'reviewer',
				note: 'checked',
				commitHash: 'abc1234',
				evidence: {
					commitHash: 'abc1234',
					validateExitCode: 0,
					testsPassing: 3,
					testsTotal: 3,
				},
			},
		});
	});

	it('review sends no evidence with a change request', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals review').run(
			[
				'x00001',
				'S1',
				'--action=request_changes',
				'--agent=reviewer',
				'--note=broken',
				'--commit=abc1234',
			],
			ctx,
		);
		expect(calls[0]?.args).toEqual({
			proposalId: 'x00001',
			sliceId: 'S1',
			action: 'request_changes',
			agent: 'reviewer',
			note: 'broken',
			commitHash: 'abc1234',
		});
	});

	it('review-queue maps --proposal, --limit and --agent', async () => {
		const { ctx, calls } = buildStubContext();
		await find('proposals review-queue').run(
			['--proposal=x00001', '--limit=5', '--agent=glm-5.3-max'],
			ctx,
		);
		expect(calls[0]).toEqual({
			tool: 'delendai_proposals_review_queue',
			args: { proposalId: 'x00001', limit: 5, agent: 'glm-5.3-max' },
		});
	});
});
