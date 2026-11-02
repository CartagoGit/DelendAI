/**
 * work-deliver.service.spec.ts — one command proves, hands over and
 * publishes, stops at the first refusal, and republishes what is in review.
 */
import { describe, expect, it } from 'vitest';

import {
	EXIT_CODE,
	type IExitCode,
} from '../contracts/constants/exit-code.constant';
import type { IWorkDeliverPorts } from '../contracts/interfaces/work-deliver.interface';
import { deliverUnit } from './work-deliver.service';

const ports = (
	answers: { 'in-progress'?: unknown; review?: unknown },
	proveCode: IExitCode = EXIT_CODE.OK,
) => {
	const calls: string[] = [];
	const value: IWorkDeliverPorts = {
		locate: async () => ({
			code: EXIT_CODE.OK,
			data: { worktree: '/unit', publication: 'pr/unit' },
		}),
		prove: async () => {
			calls.push('prove');
			return proveCode === EXIT_CODE.OK
				? { code: proveCode, data: { proved: true } }
				: { code: proveCode, error: 'its proof failed' };
		},
		transition: async (to, checkout) => {
			expect(checkout).toBe('/unit');
			calls.push(to);
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
	it('opens the proposal, proves the unit, then hands it to review', async () => {
		const { calls, value } = ports({});
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.OK);
		expect(calls).toEqual(['in-progress', 'prove', 'review']);
	});

	it('hands nothing over when the proof fails', async () => {
		const { calls, value } = ports({}, EXIT_CODE.VALIDATION);
		expect(await deliverUnit(value)).toMatchObject({
			error: 'its proof failed',
		});
		expect(calls).toEqual(['in-progress', 'prove']);
	});

	it('goes on from a proposal already in progress', async () => {
		const { calls, value } = ports({
			'in-progress': illegal('in-progress', 'in-progress'),
		});
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.OK);
		expect(calls).toEqual(['in-progress', 'prove', 'review']);
	});

	it('stops with the reason of any other refusal', async () => {
		const reason = 'S1: nothing records which commit delivered it';
		const late = ports({ review: { ok: false, reason } });
		expect(await deliverUnit(late.value)).toMatchObject({ error: reason });
		const early = ports({ 'in-progress': { ok: false, reason } });
		expect((await deliverUnit(early.value)).error).toBe(reason);
		expect(early.calls).toEqual(['in-progress']);
	});

	it("says the tool's reason wherever it put it, and where the work went", async () => {
		const nested = ports({
			'in-progress': { ok: false, error: { reason: 'no such proposal' } },
		});
		expect((await deliverUnit(nested.value)).error).toBe(
			'no such proposal',
		);
		const bare = ports({ 'in-progress': { ok: false } });
		expect((await deliverUnit(bare.value)).error).toContain('{"ok":false}');
		expect((await deliverUnit(ports({}).value)).data).toMatchObject({
			publication: 'pr/unit',
		});
	});
});
