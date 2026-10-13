/**
 * served-agent-identity.spec.ts — every agent is told to name itself.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { servedWorkModelLines } from '@delendai/core/lib/development-policy/served-work-model';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

describe('served instructions', () => {
	it('tell any agent to set DELENDAI_AGENT_ID to its exact model id', () => {
		const lines = servedWorkModelLines(
			resolveDevelopmentPolicy({
				development: { profile: 'shared-checkout-pr' },
			}),
		);
		expect(lines.at(-1)).toContain('DELENDAI_AGENT_ID');
		expect(lines.at(-1)).toContain('exact model id');
	});
});

describe('development.guard.unknownActor', () => {
	it('is validated like every other axis value', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				guard: { unknownActor: 'robot' },
			},
		});
		expect(
			validateDevelopmentPolicy(policy).some(
				(violation) => violation.path === 'guard.unknownActor',
			),
		).toBe(true);
	});
});
