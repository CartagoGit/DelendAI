import { describe, expect, it } from 'vitest';

import {
	CUTOVER_STEPS,
	main,
} from '../../scripts/ci/sqlite-cutover-ready.script';

describe('sqlite-cutover-ready gate', () => {
	it('runs every required check in order and records the runtime probe', () => {
		const steps: string[] = [];
		const output: string[] = [];
		const exitCode = main([], {
			cwd: '/repo',
			out: (message) => output.push(message),
			run: (step) => {
				steps.push(step.name);
				return 0;
			},
			probe: () => {
				steps.push('sqlite-runtime-integrity');
				return 0;
			},
		});

		expect(exitCode).toBe(0);
		expect(steps).toEqual([
			...CUTOVER_STEPS.map((step) => step.name),
			'sqlite-runtime-integrity',
		]);
		expect(output.at(-1)).toContain('all 6 checks passed');
	});

	it('stops at the first failed check and preserves its exit code', () => {
		const steps: string[] = [];
		const exitCode = main([], {
			run: (step) => {
				steps.push(step.name);
				return step.name === 'sqlite-cas-idempotency-outbox' ? 17 : 0;
			},
			probe: () => {
				throw new Error('probe must not run after a failed step');
			},
		});

		expect(exitCode).toBe(17);
		expect(steps).toEqual([
			'build',
			'pack-smoke',
			'sqlite-migrations-reconcile',
			'sqlite-cas-idempotency-outbox',
		]);
	});
});
