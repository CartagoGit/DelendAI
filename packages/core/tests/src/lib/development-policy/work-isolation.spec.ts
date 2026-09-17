/**
 * work-isolation.spec.ts — the isolation advice agrees with the profile.
 *
 * An adopter project on `shared-checkout-merge` was told 2+ agents "must
 * call agent_worktree", refused that call with an invitation to enable
 * worktrees, and its agent created worktrees and `agent/*` branches by
 * hand. These cases pin the advice to every profile that exists.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { describeWorkIsolation } from '@delendai/core/lib/development-policy/work-isolation';
import type { IDevelopmentProfile } from '@delendai/core/lib/development-policy/profiles';

const SHARED: readonly IDevelopmentProfile[] = [
	'shared-checkout-pr',
	'shared-checkout-merge',
];

describe('describeWorkIsolation', () => {
	it.each(SHARED)('%s: never sends an agent to a worktree', (profile) => {
		const policy = expandProfile(profile);
		const isolation = describeWorkIsolation(policy);
		expect(isolation.agentWorktrees).toBe(false);
		expect(isolation.rule).toContain(`\`${profile}\``);
		expect(isolation.rule).toContain(`\`${policy.branches.integration}\``);
		expect(isolation.rule).toContain('Do not create worktrees or branches');
		expect(isolation.rule).toContain('agent_lock');
		// The work namespace is named without its `refs/heads/` plumbing.
		expect(isolation.rule).toContain('`wip/`');
		expect(isolation.worktreeRefusal).not.toContain(
			'--agent-worktree=true',
		);
		expect(isolation.worktreeRefusal).not.toContain('agentWorktree: true');
		expect(isolation.worktreeRefusal).toContain(isolation.rule);
	});

	it('shared-direct: says where finished slices go, still without worktrees', () => {
		const policy = expandProfile('shared-direct');
		const isolation = describeWorkIsolation(policy);
		expect(isolation.agentWorktrees).toBe(false);
		expect(isolation.rule).toContain(
			`finished slices are committed to \`${policy.branches.integration}\``,
		);
		expect(isolation.worktreeRefusal).not.toContain(
			'--agent-worktree=true',
		);
	});

	it('worktree-pr: each agent works in its own worktree', () => {
		const isolation = describeWorkIsolation(expandProfile('worktree-pr'));
		expect(isolation.agentWorktrees).toBe(true);
		expect(isolation.rule).toContain('agent_worktree (action: create)');
		// The host gate is the only thing that can refuse here.
		expect(isolation.worktreeRefusal).toContain('--agent-worktree=true');
	});

	it('no policy: keeps the historical advice', () => {
		const isolation = describeWorkIsolation(undefined);
		expect(isolation.agentWorktrees).toBe(true);
		expect(isolation.rule).toContain('2+ agents sharing this repo?');
	});
});
