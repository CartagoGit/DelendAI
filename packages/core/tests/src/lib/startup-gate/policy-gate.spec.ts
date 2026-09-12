/**
 * policy-gate.spec.ts — the gate reads capabilities, never a profile.
 *
 * The regression these assertions protect against is a breaking change
 * dressed up as a feature: turning boot-time reconciliation on for every
 * existing adopter. A `shared-direct` project keeps no durable work
 * outside its checkout, so it must not start fetching refs on every boot.
 */

import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { decideStartupReconciliation } from '@delendai/core/lib/startup-gate/index';

describe('decideStartupReconciliation', () => {
	it('stays shut for the legacy shared-direct model', () => {
		const gate = decideStartupReconciliation(
			expandProfile('shared-direct'),
		);
		expect(gate.required).toBe(false);
		expect(gate.reason).toContain('persistence.usesWipRefs=false');
	});

	it('opens when work lives in wip refs', () => {
		const gate = decideStartupReconciliation(
			expandProfile('shared-checkout-pr'),
		);
		expect(gate.required).toBe(true);
		expect(gate.reason).toContain('persistence.usesWipRefs=true');
	});

	it('opens when abandoned work has to be resumed, even without wip refs', () => {
		const worktree = expandProfile('worktree-pr');
		expect(worktree.persistence.usesWipRefs).toBe(false);
		expect(decideStartupReconciliation(worktree).required).toBe(true);
	});

	it('reads capabilities, not the profile name', () => {
		const policy = expandProfile('shared-direct');
		const reconciling = {
			...policy,
			// The profile string deliberately still says `shared-direct`:
			// only the resolved capability may change the answer.
			recovery: { ...policy.recovery, resumeExistingWork: true },
		};
		expect(reconciling.profile).toBe('shared-direct');
		expect(decideStartupReconciliation(reconciling).required).toBe(true);
	});
});
