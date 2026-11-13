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
	it('[<200ms] stops at the FIRST rung that passes the gate (no needless escalation)', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => `out:${c.id}`,
			checkAcceptance: async () => true, // cheap passes
		});
		expect(out.ok).toBe(true);
		expect(out.chosen?.id).toBe('cheap');
		expect(out.attempts).toHaveLength(1);
	});

	it('[<200ms] returns a blocker instead of escalating when the first rung fails the gate', async () => {
		const ran: string[] = [];
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => {
				ran.push(c.id);
				return c.id;
			},
			checkAcceptance: async (_o, c) => c.id === 'strong',
		});
		expect(out.ok).toBe(false);
		expect(ran).toEqual(['cheap']);
		expect(out.blocker).toContain('needs more capacity');
	});

	it('[<200ms] records the model used and reports a mismatch with the requested one', async () => {
		const withModels = buildEscalationLadder({
			ranked: [{ ...cand('cheap', 1), models: ['m-small'] }],
		});
		const out = await runWithEscalation(withModels, 'task', {
			runProvider: async () => 'm-big',
			checkAcceptance: async () => true,
			modelUsed: (o) => String(o),
		});
		expect(out.models[0]).toMatchObject({ used: 'm-big' });
		expect(out.models[0]?.mismatch).toContain('m-big was used');
	});

	it('[<200ms] treats a THROWING provider as a failure with a blocker', async () => {
		const out = await runWithEscalation(plan, 'task', {
			runProvider: async (c) => {
				if (c.id === 'cheap') throw new Error('cheap crashed');
				return c.id;
			},
			checkAcceptance: async (_o, c) => c.id === 'mid',
		});
		expect(out.ok).toBe(false);
		expect(out.blocker).toBeDefined();
		expect(out.attempts[0]).toEqual({
			candidate: expect.objectContaining({ id: 'cheap' }),
			passed: false,
		});
	});

	it('[<200ms] blocks with no attempts when no provider is within the ceiling', async () => {
		const empty = buildEscalationLadder({ ranked: [] });
		const out = await runWithEscalation(empty, 'task', {
			runProvider: async () => 'x',
			checkAcceptance: async () => true,
		});
		expect(out).toMatchObject({ ok: false, attempts: [] });
		expect(out.blocker).toContain('cost ceiling');
	});
});
