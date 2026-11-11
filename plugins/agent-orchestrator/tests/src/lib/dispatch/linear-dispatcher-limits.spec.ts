/**
 * linear-dispatcher-limits.spec.ts — the dispatcher enforces its own
 * limits: a subagent past its token cap is cut whatever the host did,
 * and a timed-out one is stopped before the next one starts.
 */
import { describe, expect, it } from 'vitest';

import type { IDispatchPort } from '../../../../src/lib/dispatch/contracts.js';
import { LinearDispatcher } from '../../../../src/lib/dispatch/linear-dispatcher.js';
import type {
	IModePlan,
	RotationReason,
} from '../../../../src/lib/policy/types.js';

const planWith = (input: {
	readonly maxTokensPerSubagent?: number;
	readonly timeoutMs?: number;
	readonly allow?: readonly RotationReason[];
	readonly maxIterationsPerSubagent?: number;
}): IModePlan => ({
	mode: 'single',
	rationale: 'limits',
	steps: [
		{
			order: 1,
			kind: 'spawn',
			subagentRole: 'implementer',
			instruction: 'do it',
		},
	],
	budget: {
		maxTokensOrchestrator: 0,
		maxTokensPerSubagent: input.maxTokensPerSubagent ?? 0,
		timeoutMs: input.timeoutMs ?? 0,
	},
	rotation: {
		maxIterationsPerSubagent: input.maxIterationsPerSubagent ?? 2,
		allow: input.allow ?? ['token-budget-exhausted', 'error-storm'],
	},
});

/** A port whose subagents report `tokensUsed` each, and remember their calls. */
const spending = (tokensUsed: number) => {
	const calls: string[] = [];
	const port: IDispatchPort = {
		spawnSubagent: async (input) => {
			calls.push(input.slotId);
			return {
				subagentId: `${input.slotId}-${String(calls.length)}`,
				tokensUsed,
				output: 'done',
				schemaOk: true,
				hadError: false,
			};
		},
	};
	return { port, calls };
};

describe('LinearDispatcher limits', () => {
	it('cuts a subagent past maxTokensPerSubagent and rotates, then fails the step', async () => {
		const { port, calls } = spending(500);
		const out = await new LinearDispatcher(
			planWith({ maxTokensPerSubagent: 100 }),
			port,
			't1',
		).run();
		expect(calls).toHaveLength(2);
		expect(out.ok).toBe(false);
		expect(out.steps[0]?.rotations.map((each) => each.reason)).toEqual([
			'token-budget-exhausted: used 500 of 100 tokens',
			'token-budget-exhausted: used 500 of 100 tokens',
		]);
	});

	it('fails at once when the plan does not allow rotating on the cap', async () => {
		const { port, calls } = spending(500);
		const out = await new LinearDispatcher(
			planWith({ maxTokensPerSubagent: 100, allow: ['error-storm'] }),
			port,
			't2',
		).run();
		expect(calls).toHaveLength(1);
		expect(out.steps[0]?.rotations[0]?.reason).toMatch(
			/^forbidden: token-budget-exhausted/u,
		);
	});

	it('stops a timed-out subagent before it starts the next one', async () => {
		const events: string[] = [];
		let started = 0;
		const port: IDispatchPort = {
			spawnSubagent: (input) => {
				started += 1;
				const id = started;
				events.push(`start ${String(id)}`);
				input.signal?.addEventListener('abort', () =>
					events.push(`abort ${String(id)}`),
				);
				return new Promise(() => undefined);
			},
		};
		await new LinearDispatcher(
			planWith({ timeoutMs: 20, maxIterationsPerSubagent: 2 }),
			port,
			't3',
		).run();
		expect(events).toEqual(['start 1', 'abort 1', 'start 2', 'abort 2']);
	});
});
