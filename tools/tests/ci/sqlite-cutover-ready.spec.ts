import { describe, expect, it } from 'vitest';

import {
	CUTOVER_STEPS,
	OUTSTANDING_CUTOVER_PROPERTIES,
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
			pack: () => {
				steps.push('pack-smoke');
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
		expect(output.some((line) => line.includes('all 6 checks passed'))).toBe(
			true,
		);
		// The job must never sign off on the cutover. It reports what it
		// actually proved (foundations) and then names what it did not.
		expect(output.join('\n')).toContain('NOT READY');
		for (const entry of OUTSTANDING_CUTOVER_PROPERTIES) {
			expect(output.join('\n')).toContain(entry.proposal);
		}
	});

	it('refuses to certify readiness under --assert-ready while properties are outstanding', () => {
		expect(OUTSTANDING_CUTOVER_PROPERTIES.length).toBeGreaterThan(0);
		const exitCode = main(['--assert-ready'], {
			cwd: '/repo',
			out: () => undefined,
			run: () => 0,
			pack: () => 0,
			probe: () => 0,
		});

		// Every foundation check passed and it STILL says no. That is the
		// whole point: a green gate named `sqlite-cutover-ready` was being
		// read as permission to flip the authority switch.
		expect(exitCode).toBe(1);
	});

	it('stops at the first failed check and preserves its exit code', () => {
		const steps: string[] = [];
		const exitCode = main([], {
			run: (step) => {
				steps.push(step.name);
				return step.name === 'sqlite-cas-idempotency-outbox' ? 17 : 0;
			},
			pack: () => {
				steps.push('pack-smoke');
				return 0;
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
