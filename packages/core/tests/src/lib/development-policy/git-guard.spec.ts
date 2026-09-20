/**
 * git-guard.spec.ts — what each development profile lets git do.
 *
 * Pinned against the operations an adopter project's agent actually ran
 * on `shared-checkout-merge`: commits straight to `develop`, and
 * `agent/<role>/<id>-<slice>-<topic>` branches for hand-made worktrees.
 * delendai's own operations (work refs, publication refs) must stay
 * allowed under every profile that uses them.
 */
import { describe, expect, it } from 'vitest';

import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const commit = (branch: string | undefined, isMerge = false) =>
	({ kind: 'commit', branch, isMerge }) as const;
/** The same commit, made in an agent's OWN worktree. */
const commitInWorktree = (branch: string | undefined, isMerge = false) =>
	({ kind: 'commit', branch, isMerge, inMainWorktree: false }) as const;
const create = (ref: string) => ({ kind: 'branch-create', ref }) as const;
const push = (remoteRef: string, deleting = false) =>
	({ kind: 'push', remoteRef, deleting }) as const;

describe('no declared policy', () => {
	it('refuses nothing', () => {
		for (const operation of [
			commit('develop'),
			create('refs/heads/anything'),
			push('refs/heads/develop'),
		]) {
			expect(judgeGitOperation(undefined, operation).refused).toBe(false);
		}
	});
});

describe('shared-checkout-merge — the observed project', () => {
	const policy = expandProfile('shared-checkout-merge');

	it('refuses a direct commit to the integration branch, and says how to work', () => {
		const verdict = judgeGitOperation(policy, commit('develop'));
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('`shared-checkout-merge`');
		expect(verdict.reason).toContain('`develop`');
		expect(verdict.remedy).toContain('Do not create worktrees or branches');
	});

	it('allows the merge commit that moves the integration branch', () => {
		expect(judgeGitOperation(policy, commit('develop', true)).refused).toBe(
			false,
		);
	});

	it('refuses the hand-made agent branches, created or committed on', () => {
		const branch =
			'agent/screens-implementation-runner/x00056-S1-tetris-mock';
		expect(
			judgeGitOperation(policy, create(`refs/heads/${branch}`)).refused,
		).toBe(true);
		expect(judgeGitOperation(policy, commit(branch)).refused).toBe(true);
		expect(
			judgeGitOperation(policy, push(`refs/heads/${branch}`)).refused,
		).toBe(true);
	});

	it('allows delendai work refs and publication refs', () => {
		const work = 'wip/codex-mcp-client/x00056-S1-g1/tetris-mock';
		expect(
			judgeGitOperation(policy, create(`refs/heads/${work}`)).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push(`refs/heads/${work}`)).refused,
		).toBe(false);
		// The ref may be created and pushed; committing ON it is judged
		// separately, because that requires moving the shared checkout.
		expect(judgeGitOperation(policy, commitInWorktree(work)).refused).toBe(
			false,
		);
		expect(
			judgeGitOperation(policy, create('refs/heads/pr/x00056-s1'))
				.refused,
		).toBe(false);
	});

	it('allows pushing the integration branch, since this profile merges locally', () => {
		expect(
			judgeGitOperation(policy, push('refs/heads/develop')).refused,
		).toBe(false);
	});

	it('never judges tags, remote-tracking refs or deletes', () => {
		expect(
			judgeGitOperation(policy, create('refs/tags/v1.0.0')).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/remotes/origin/agent/x'))
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push('refs/heads/agent/x', true)).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push('refs/tags/v1.0.0')).refused,
		).toBe(false);
		expect(judgeGitOperation(policy, commit(undefined)).refused).toBe(
			false,
		);
	});
});

describe('shared-checkout-pr with a namespace prefix — this repository', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});

	it('allows the namespaced work and publication branches', () => {
		expect(
			judgeGitOperation(
				policy,
				create(
					'refs/heads/delendai/wip/claude-opus-5/x00549-S1-g1/guard',
				),
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(
				policy,
				push('refs/heads/delendai/pr/x00549-guard'),
			).refused,
		).toBe(false);
	});

	it('refuses pushing the integration or release branch past pull requests', () => {
		const develop = judgeGitOperation(policy, push('refs/heads/develop'));
		expect(develop.refused).toBe(true);
		expect(develop.remedy).toContain('`delendai/pr/`');
		expect(judgeGitOperation(policy, push('refs/heads/main')).refused).toBe(
			true,
		);
	});

	it('refuses an un-namespaced work branch', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/wip/claude/x'))
				.refused,
		).toBe(true);
	});
});

describe('shared-direct', () => {
	const policy = expandProfile('shared-direct');

	it('allows committing to the integration branch it commits to', () => {
		expect(judgeGitOperation(policy, commit('develop')).refused).toBe(
			false,
		);
	});

	it('still keeps branches to the ones the profile uses', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/feature/x')).refused,
		).toBe(true);
	});
});

describe('worktree-pr', () => {
	const policy = expandProfile('worktree-pr');

	it('lets agents create and push their own branches, whatever they are called', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/agent/a/x-S1'))
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/heads/feature/x')).refused,
		).toBe(false);
		expect(judgeGitOperation(policy, commit('agent/a/x-S1')).refused).toBe(
			false,
		);
	});

	it('refuses a direct commit or push to the integration branch', () => {
		expect(judgeGitOperation(policy, commit('develop')).refused).toBe(true);
		expect(
			judgeGitOperation(policy, push('refs/heads/develop')).refused,
		).toBe(true);
	});
});

describe('the shared checkout may not become a work branch (x00553)', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});
	const work = 'delendai/wip/claude-opus-5/x00553-S1-g1-work-command';

	it('refuses a commit made from a work ref in the shared checkout', () => {
		const verdict = judgeGitOperation(policy, commit(work));
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain(work);
		expect(verdict.reason).toContain('`develop`');
		expect(verdict.remedy).toContain('delendai work checkpoint');
	});

	it('allows the same commit in the agent own worktree', () => {
		expect(judgeGitOperation(policy, commitInWorktree(work)).refused).toBe(
			false,
		);
	});

	it('treats an unobserved worktree as the shared one', () => {
		// Absent evidence must not weaken the rule that protects the
		// checkout every other agent reads.
		expect(
			judgeGitOperation(policy, {
				kind: 'commit',
				branch: work,
				isMerge: false,
			}).refused,
		).toBe(true);
	});

	it('still allows a merge, which is how the integration branch moves', () => {
		expect(judgeGitOperation(policy, commit('develop', true)).refused).toBe(
			false,
		);
	});

	it('names the integration branch the project declared, never develop', () => {
		const trunk = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				branches: { integration: 'trunk', namespacePrefix: 'acme' },
			},
		});
		const verdict = judgeGitOperation(
			trunk,
			commit('acme/wip/agent/x00001-S1-g1-topic'),
		);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('`trunk`');
		expect(verdict.remedy).toContain('git switch trunk');
	});

	it('does not constrain a profile with no pinned checkout', () => {
		const free = resolveDevelopmentPolicy({
			development: { profile: 'worktree-pr' },
		});
		expect(
			judgeGitOperation(free, commit('agent/claude/x00001-S1')).refused,
		).toBe(false);
	});
});

describe('a work ref carries the shape the policy declares (x00563 S3)', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});

	it('allows the shape the template renders', () => {
		expect(
			judgeGitOperation(
				policy,
				create(
					'refs/heads/delendai/wip/claude-opus-5/x00563-S1-g1/the-explanation',
				),
			).refused,
		).toBe(false);
	});

	it('refuses a name somebody typed by hand', () => {
		// Every one of these reached this repository's graph.
		for (const name of [
			'delendai/wip/claude-opus-5/x00563-S2-g1-cli-shape-typed-by-hand',
			'delendai/wip/claude-opus-5/hydrate',
			'delendai/wip/claude-opus-5/x00563/S1/g1/split-wrong',
		]) {
			const verdict = judgeGitOperation(
				policy,
				create(`refs/heads/${name}`),
			);
			expect(verdict.refused).toBe(true);
			expect(verdict.reason).toContain('does not match the shape');
			expect(verdict.remedy).toContain('delendai work enter');
		}
	});

	it('says nothing about refs outside the work namespace', () => {
		expect(
			judgeGitOperation(
				policy,
				create('refs/heads/delendai/pr/anything-at-all'),
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/heads/develop')).refused,
		).toBe(false);
	});

	it('leaves a worktree profile free to name its own branches', () => {
		// `worktree-pr` gives every agent its own worktree and says so:
		// taking that away would be a different policy, not this rule.
		const free = resolveDevelopmentPolicy({
			development: { profile: 'worktree-pr' },
		});
		expect(
			judgeGitOperation(free, create('refs/heads/agent/claude/whatever'))
				.refused,
		).toBe(false);
	});
});
