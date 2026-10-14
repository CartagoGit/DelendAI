/**
 * git-guard-live-unit.spec.ts — a unit's branch is not deleted while a
 * worktree works on it, whoever deletes it.
 */
import { describe, expect, it } from 'vitest';

import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const UNIT = 'refs/heads/delendai/wip/glm-5/implement/x00001-S1-g1/the-work';
const AGENT = { agentMarker: 'AI_AGENT' } as const;
const PERSON = { agentMarker: undefined } as const;

describe('deleting a unit branch', () => {
	it('is refused while a worktree works on it, for an agent and for anyone', () => {
		for (const actor of [AGENT, PERSON]) {
			const verdict = judgeGitOperation(
				policy,
				{
					kind: 'branch-delete',
					ref: UNIT,
					worktree: '/repo/.cache/wt',
				},
				actor,
			);
			expect(verdict.refused).toBe(true);
			expect(verdict.reason).toContain('/repo/.cache/wt');
			expect(verdict.remedy).toContain('publish');
		}
	});

	it('goes through once no worktree stands on it, or outside the work namespace', () => {
		expect(
			judgeGitOperation(
				policy,
				{ kind: 'branch-delete', ref: UNIT },
				AGENT,
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(
				policy,
				{
					kind: 'branch-delete',
					ref: 'refs/heads/feature/mine',
					worktree: '/elsewhere',
				},
				PERSON,
			).refused,
		).toBe(false);
	});
});
