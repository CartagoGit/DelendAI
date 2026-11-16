/**
 * work-unit-prove-only.service.spec.ts — one gate of the proof runs alone,
 * and a partial run never proves the unit.
 */
import { describe, expect, it } from 'vitest';

import {
	asksForOneGate,
	partialProofOf,
} from '../../../../src/lib/work-units/work-unit-prove-only.service';

const PROVE = [{ scope: 'prove', command: 'bun run prove' }] as const;

const runner = (code: number, output = 'prove: ok') => {
	const calls: { command: string; cwd: string }[] = [];
	return {
		calls,
		run: (command: string, cwd: string) => {
			calls.push({ command, cwd });
			return { code, output };
		},
	};
};

describe('partialProofOf', () => {
	it('[<20ms] runs the project prove command with the gate in the unit worktree', () => {
		const { calls, run } = runner(0);
		const result = partialProofOf({
			only: 'changed-file-coverage',
			steps: PROVE,
			cwd: '/w',
			run,
		});
		expect(calls).toEqual([
			{
				command: 'bun run prove -- --only=changed-file-coverage',
				cwd: '/w',
			},
		]);
		expect(result.code).toBe(0);
	});

	it('[<20ms] a passing partial run does not mark the unit proved', () => {
		const result = partialProofOf({
			only: 'typecheck',
			steps: PROVE,
			cwd: '/w',
			run: runner(0).run,
		});
		expect(result.data).toMatchObject({ partial: true, proved: false });
	});

	it('[<20ms] an unknown gate exits 2 and a failed gate says the unit is not proved', () => {
		const unknown = partialProofOf({
			only: 'nope',
			steps: PROVE,
			cwd: '/w',
			run: runner(2, 'prove: unknown gate nope').run,
		});
		expect(unknown.code).toBe(2);
		const failed = partialProofOf({
			only: 'lint-docs',
			steps: PROVE,
			cwd: '/w',
			run: runner(1, 'prove: why re-run only this gate').run,
		});
		expect(failed.code).not.toBe(0);
		expect(failed.error).toContain('partial: the unit is not proved');
	});

	it('[<20ms] refuses a project whose proof is not a prove script', () => {
		const result = partialProofOf({
			only: 'typecheck',
			steps: [{ scope: 'gate', command: 'make test' }],
			cwd: '/w',
			run: runner(0).run,
		});
		expect(result.code).not.toBe(0);
	});
});

describe('asksForOneGate', () => {
	it('[<5ms] holds only with --only=', () => {
		expect(asksForOneGate(['prove', '--only=typecheck'])).toBe(true);
		expect(asksForOneGate(['prove', '--proposal=x1'])).toBe(false);
	});
});
