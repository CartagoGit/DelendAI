/**
 * urgent-turn.service.spec.ts — a proof is urgent only for a repair of a red
 * integration branch, or when the caller says why.
 */
import { describe, expect, it } from 'vitest';

import { urgentReasonOf } from '@delendai/core/lib/work-units/urgent-turn.service';

const red = () => Promise.resolve('failure');
const green = () => Promise.resolve('success');

const asked = (
	proposal: string,
	certification: typeof red,
	args: readonly string[] = [],
) =>
	urgentReasonOf({
		root: '/nowhere',
		args,
		proposal,
		integration: 'develop',
		certification,
	});

describe('urgentReasonOf', () => {
	it('is urgent when a fix meets a red integration branch', async () => {
		expect(await asked('x00001', red)).toMatch(/x00001 repairs develop/u);
	});

	it('is not urgent for a fix on a green branch, or a feature on a red one', async () => {
		expect(await asked('x00001', green)).toBeUndefined();
		expect(await asked('f00001', red)).toBeUndefined();
	});

	it('takes the stated reason from --urgent, whatever the branch', async () => {
		expect(
			await asked('f00001', green, ['--urgent=the owner is waiting']),
		).toBe('the owner is waiting');
	});
});
