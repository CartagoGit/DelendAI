/**
 * work-deliver.service.spec.ts — one command proves, hands over and
 * publishes, stops at the first refusal, and republishes what is in review.
 */
import { describe, expect, it } from 'vitest';

import {
	EXIT_CODE,
	type IExitCode,
} from '../contracts/constants/exit-code.constant';
import { deliverUnit, type IWorkDeliverPorts } from './work-deliver.service';

const ports = (
	answers: { 'in-progress'?: unknown; review?: unknown },
	proveCode: IExitCode = EXIT_CODE.OK,
) => {
	const calls: string[] = [];
	const value: IWorkDeliverPorts = {
		prove: async () => {
			calls.push('prove');
			return proveCode === EXIT_CODE.OK
				? { code: proveCode, data: { worktree: '/unit' } }
				: { code: proveCode, error: 'its proof failed' };
		},
		publish: async () => {
			calls.push('publish');
			return { code: 0, data: { published: true } };
		},
		transition: async (to, checkout) => {
			calls.push(`${to}@${String(checkout)}`);
			return answers[to] ?? { ok: true };
		},
	};
	return { calls, value };
};

const illegal = (from: string, to: string) => ({
	ok: false,
	reason: `illegal transition: "${from}" → "${to}"`,
});

describe('deliverUnit', () => {
	it('proves, then moves the proposal to review from the unit worktree', async () => {
		const { calls, value } = ports({});
		const result = await deliverUnit(value);
		expect(result.code).toBe(0);
		expect(calls).toEqual(['prove', 'in-progress@/unit', 'review@/unit']);
	});

	it('touches nothing when the proof fails', async () => {
		const { calls, value } = ports({}, EXIT_CODE.VALIDATION);
		const result = await deliverUnit(value);
		expect(result).toMatchObject({ code: 4, error: 'its proof failed' });
		expect(calls).toEqual(['prove']);
	});

	it('goes on from in-progress', async () => {
		const { calls, value } = ports({
			'in-progress': illegal('in-progress', 'in-progress'),
		});
		expect((await deliverUnit(value)).code).toBe(0);
		expect(calls.at(-1)).toBe('review@/unit');
	});

	it('only publishes what is already in review', async () => {
		const { calls, value } = ports({
			'in-progress': illegal('review', 'in-progress'),
			review: illegal('review', 'review'),
		});
		expect(await deliverUnit(value)).toMatchObject({ code: 0 });
		expect(calls.at(-1)).toBe('publish');
	});

	it('stops with the reason of any other refusal', async () => {
		const reason = 'S1: nothing records which commit delivered it';
		const { calls, value } = ports({ review: { ok: false, reason } });
		const refused = await deliverUnit(value);
		expect(refused.code).toBe(EXIT_CODE.VALIDATION);
		expect(refused.error).toBe(reason);
		expect(calls).not.toContain('publish');
		const first = ports({ 'in-progress': { ok: false, reason } });
		expect((await deliverUnit(first.value)).error).toBe(reason);
		expect(first.calls).toHaveLength(2);
	});
});
