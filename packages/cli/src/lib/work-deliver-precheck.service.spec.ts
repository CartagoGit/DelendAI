/**
 * work-deliver-precheck.service.spec.ts — a delivery is refused in seconds,
 * with the proof's own messages, before the compute slot is requested.
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { deliverUnit } from './work-deliver.service';
import { precheckDelivery } from './work-deliver-precheck.service';

const PASSES = async () => ({ code: EXIT_CODE.OK });

const BREACHES = [
	'lint-presets: tests/a.spec.ts [<500ms] over the 200 ms unit budget',
	'lint-presets: src/a.ts has no mirror spec',
	'lint-architecture: types-in-contracts: src/b.ts declares an interface',
	'lint-architecture: file-size: src/c.ts has 900 lines, over 600',
].join('\n');

describe('precheckDelivery', () => {
	it('[<20ms] passes when the static gates pass', async () => {
		const outcome = await precheckDelivery({
			coveragePrecheck: PASSES,
			precheck: async () => ({ code: EXIT_CODE.OK }),
		});
		expect(outcome).toBeUndefined();
	});

	it("[<20ms] refuses with the proof's own messages and says nothing was proved", async () => {
		const outcome = await precheckDelivery({
			coveragePrecheck: PASSES,
			precheck: async () => ({
				code: EXIT_CODE.VALIDATION,
				error: BREACHES,
			}),
		});
		expect(outcome?.code).toBe(EXIT_CODE.VALIDATION);
		expect(outcome?.error).toContain(BREACHES);
		expect(outcome?.error).toContain('before the compute slot');
	});

	it("[<20ms] refuses, with the coverage gate's message, a module covered only by a non-mirror spec", async () => {
		const gate =
			'changed-file-coverage: FAIL — src/a.ts: 0% lines (covered only by tests/b.spec.ts)';
		const outcome = await precheckDelivery({
			precheck: PASSES,
			coveragePrecheck: async () => ({
				code: EXIT_CODE.VALIDATION,
				error: gate,
			}),
		});
		expect(outcome?.code).toBe(EXIT_CODE.VALIDATION);
		expect(outcome?.error).toContain(gate);
	});

	it('[<20ms] does not run the coverage pre-check when the static one refuses', async () => {
		let covered = false;
		await precheckDelivery({
			precheck: async () => ({ code: EXIT_CODE.VALIDATION, error: 'x' }),
			coveragePrecheck: async () => {
				covered = true;
				return { code: EXIT_CODE.OK };
			},
		});
		expect(covered).toBe(false);
	});

	it('[<20ms] keeps a usage error a usage error', async () => {
		const outcome = await precheckDelivery({
			coveragePrecheck: PASSES,
			precheck: async () => ({
				code: EXIT_CODE.USAGE,
				error: 'bad gate',
			}),
		});
		expect(outcome?.code).toBe(EXIT_CODE.USAGE);
	});

	it('[<20ms] never requests the slot when a breach refuses the candidate', async () => {
		const calls: string[] = [];
		const result = await deliverUnit({
			slice: 'all',
			publish: async () => ({ code: EXIT_CODE.OK }),
			readOpenPullRequest: async () => undefined,
			publicationReached: async () => true,
			locate: async () => ({
				code: EXIT_CODE.OK,
				data: { worktree: '/unit' },
			}),
			preflight: async () => ({ ok: true }),
			transition: async () => ({ ok: true }),
			coveragePrecheck: PASSES,
			precheck: async () => {
				calls.push('precheck');
				return { code: EXIT_CODE.VALIDATION, error: BREACHES };
			},
			prove: async () => {
				calls.push('slot');
				return { code: EXIT_CODE.OK };
			},
		});
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(calls).toEqual(['precheck']);
	});
});
