/**
 * git-guard-unit.spec.ts — a unit has one work ref. A scratch ref shaped
 * like the template (`…/x00799-all-g1/sim-a`) used to pass because an
 * agent's push was never judged for the shape of work refs at all.
 */
import { describe, expect, it } from 'vitest';

import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { workUnitKeyOf } from '@delendai/core/lib/development-policy/git-guard-unit';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const UNIT = 'delendai/wip/claude-sonnet-5-5/create/x00799-all-g1';
const REAL = `${UNIT}/derived-files-merge`;
const SCRATCH = `${UNIT}/sim-a`;
const AGENT = { agentMarker: 'CLAUDECODE' } as const;
const PERSON = { agentMarker: undefined } as const;

const push = (
	branch: string,
	unit?: { siblings: string[]; leasedRef?: string },
) => ({
	kind: 'push' as const,
	remoteRef: `refs/heads/${branch}`,
	deleting: false,
	unit,
});

describe('pushing into a unit', () => {
	it('refuses a scratch ref while the lease names another, for an agent and a person', () => {
		for (const actor of [AGENT, PERSON]) {
			const verdict = judgeGitOperation(
				policy,
				push(SCRATCH, { siblings: [REAL], leasedRef: REAL }),
				actor,
			);
			expect(verdict.refused).toBe(true);
			expect(verdict.reason).toContain(REAL);
			expect(verdict.remedy).toContain('throwaway');
		}
	});

	it('refuses a second ref when no lease exists but the unit already has one', () => {
		const verdict = judgeGitOperation(
			policy,
			push(SCRATCH, { siblings: [REAL] }),
			AGENT,
		);
		expect(verdict.refused).toBe(true);
	});

	it('lets the unit push its own ref, even beside leftover scratch', () => {
		expect(
			judgeGitOperation(
				policy,
				push(REAL, { siblings: [SCRATCH], leasedRef: REAL }),
				AGENT,
			).refused,
		).toBe(false);
	});

	it('lets a first push of a unit nobody has facts about through', () => {
		expect(judgeGitOperation(policy, push(REAL), AGENT).refused).toBe(
			false,
		);
	});

	it('judges the shape of a work ref an agent pushes', () => {
		const verdict = judgeGitOperation(
			policy,
			push('delendai/wip/claude-sonnet-5-5/just-a-name'),
			AGENT,
		);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('does not match the shape');
	});

	it('names a unit by everything but its topic', () => {
		expect(workUnitKeyOf(policy, REAL)).toBe(
			workUnitKeyOf(policy, SCRATCH),
		);
		expect(workUnitKeyOf(policy, REAL)).not.toBe(
			workUnitKeyOf(policy, REAL.replace('-g1', '-g2')),
		);
	});
});
