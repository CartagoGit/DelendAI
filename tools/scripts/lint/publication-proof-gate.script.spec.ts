/**
 * The gate exists because two candidates failed CI on checks that take
 * seconds locally. These cases pin the decisions that made that
 * possible, so a later simplification cannot quietly re-open the hole.
 */
import { describe, expect, it } from 'vitest';

import {
	PROOF_STEPS,
	decideProofGate,
	publicationsAmong,
} from './publication-proof-gate.script';

const update = (remoteRef: string, localSha = 'a'.repeat(40)) => ({
	localRef: 'HEAD',
	localSha,
	remoteRef,
	remoteSha: '0'.repeat(40),
});

describe('publicationsAmong', () => {
	it('recognises a publication push by the policy prefix', () => {
		expect(
			publicationsAmong(
				[update('refs/heads/delendai/pr/some-slice')],
				'delendai/pr/',
			),
		).toEqual(['delendai/pr/some-slice']);
	});

	it('ignores a push that publishes nothing', () => {
		// The gate runs on every push. A developer pushing a personal
		// branch must not pay ninety seconds of typecheck for it.
		expect(
			publicationsAmong([update('refs/heads/develop')], 'delendai/pr/'),
		).toEqual([]);
	});

	it('does not treat a ref deletion as a publication', () => {
		// Deleting a spent ref publishes no code, so there is nothing to
		// prove — and the tree it pointed at may not even be checked out.
		expect(
			publicationsAmong(
				[update('refs/heads/delendai/pr/spent', '0'.repeat(40))],
				'delendai/pr/',
			),
		).toEqual([]);
	});

	it('claims nothing when the policy has no publication namespace', () => {
		// Under the direct-merge model there are no publication refs at
		// all, and a prefix of `''` would otherwise match every ref in
		// the repository.
		expect(publicationsAmong([update('refs/heads/anything')], '')).toEqual(
			[],
		);
	});
});

describe('decideProofGate', () => {
	it('runs nothing at all when the push publishes nothing', () => {
		const ran: string[] = [];
		const decision = decideProofGate([], (script) => {
			ran.push(script);
			return 0;
		});
		expect(ran).toEqual([]);
		expect(decision.ok).toBe(true);
	});

	it('reports every failing check, not just the first', () => {
		// Stopping at the first failure would hand the author one
		// problem, cost them a second push to find the next, and defeat
		// the point of paying for the pre-flight once.
		const decision = decideProofGate(['delendai/pr/x'], (script) =>
			script === 'lint' || script === 'typecheck' ? 1 : 0,
		);
		expect(decision.ok).toBe(false);
		expect(decision.failed).toEqual(['lint', 'typecheck']);
	});

	it('puts the slowest check last', () => {
		// A candidate that fails a four-second lint should not wait for
		// a ninety-second typecheck to be told.
		expect(PROOF_STEPS.at(-1)?.script).toBe('typecheck');
	});

	it('gives every step a reason it earned its place', () => {
		// A pre-flight grows by accretion unless each entry has to
		// justify the seconds it costs.
		for (const step of PROOF_STEPS) {
			expect(step.because.length).toBeGreaterThan(20);
		}
	});
});
