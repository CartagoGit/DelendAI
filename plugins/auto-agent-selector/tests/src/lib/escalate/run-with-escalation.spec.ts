import { describe, expect, it } from 'vitest';

import { runWithEscalation } from '../../../../src/lib/escalate/run-with-escalation';
import { buildEscalationLadder } from '../../../../src/lib/escalate/build-ladder';
import type { IProviderCandidate } from '../../../../src/lib/contracts/interfaces/roster.interface';

const cand = (id: string, costTier: 1 | 2 | 3 | 4 | 5): IProviderCandidate => ({
	id,
	label: id,
	source: 'api',
	vendor: id,
	reach: `${id}_KEY`,
	costTier,
});

const plan = buildEscalationLadder({
	ranked: [cand('cheap', 1), cand('mid', 3), cand('strong', 5)],
});

describe('runWithEscalation', () => {
	it('stops at the FIRST rung that passes the gate (no needless escalation)', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => `out:${c.id}`,
			checkAcceptance: async () => true, // cheap passes
		});
		expect(out.ok).toBe(true);
		expect(out.chosen?.id).toBe('cheap');
		expect(out.attempts).toHaveLength(1);
	});

	it('escalates up when a rung fails the gate, until one passes', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => c.id,
			// only `strong` passes → cheap fails, mid fails, strong passes
			checkAcceptance: async (_o, c) => c.id === 'strong',
		});
		expect(out.ok).toBe(true);
		expect(out.chosen?.id).toBe('strong');
		expect(
			out.attempts.map((a) => `${a.candidate.id}:${a.passed}`),
		).toEqual(['cheap:false', 'mid:false', 'strong:true']);
	});

	it('treats a THROWING provider as a failure and escalates past it', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => {
				if (c.id === 'cheap') throw new Error('cheap crashed');
				return c.id;
			},
			checkAcceptance: async (_o, c) => c.id === 'mid',
		});
		expect(out.ok).toBe(true);
		expect(out.chosen?.id).toBe('mid');
		expect(out.attempts[0]).toEqual({
			candidate: expect.objectContaining({ id: 'cheap' }),
			passed: false,
		});
	});

	it('reports failure with the full trace when every rung fails the gate', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => c.id,
			checkAcceptance: async () => false,
		});
		expect(out.ok).toBe(false);
		expect(out.chosen).toBeNull();
		expect(out.attempts).toHaveLength(3);
		expect(out.attempts.every((a) => !a.passed)).toBe(true);
	});
});
