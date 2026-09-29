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
/** The cases below describe an agent; a person is judged at the end. */
const AGENT = { agentMarker: 'AI_AGENT' } as const;
const PERSON = { agentMarker: undefined } as const;

describe('no declared policy', () => {
	it('refuses nothing', () => {
		for (const operation of [
			commit('develop'),
			create('refs/heads/anything'),
			push('refs/heads/develop'),
			{ kind: 'stash' } as const,
		]) {
			expect(judgeGitOperation(undefined, operation, AGENT).refused).toBe(
				false,
			);
		}
	});
});

describe('shared-checkout-merge — the observed project', () => {
	const policy = expandProfile('shared-checkout-merge');

	it('refuses a direct commit to the integration branch, and says how to work', () => {
		const verdict = judgeGitOperation(policy, commit('develop'), AGENT);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('`shared-checkout-merge`');
		expect(verdict.reason).toContain('`develop`');
		expect(verdict.remedy).toContain('Do not create worktrees or branches');
	});

	it('says how work lands in THIS profile, and it is not a pull request', () => {
		// The refusal the observed agent got said "not here" and nothing
		// about the route, so it took the one a document described: pull
		// requests, in a project that merges.
		const merge = judgeGitOperation(policy, commit('develop'), AGENT);
		const pr = judgeGitOperation(
			expandProfile('shared-checkout-pr'),
			commit('develop'),
			AGENT,
		);

		expect(merge.remedy).toContain('delendai work enter');
		expect(merge.remedy).toContain('MERGING it into develop');
		expect(merge.remedy).toContain('opens no pull request');
		expect(merge.remedy).not.toContain('opens a pull request');
		expect(pr.remedy).toContain('opens a pull request into develop');
		expect(pr.remedy).not.toContain('MERGING');
	});

	it('names the landing route when the checkout left the integration branch', () => {
		const work = 'wip/gpt-5-codex/implement/x00056-S1-g1/tetris-mock';
		const merge = judgeGitOperation(policy, commit(work), AGENT);
		const pr = judgeGitOperation(
			expandProfile('shared-checkout-pr'),
			commit(work),
			AGENT,
		);

		expect(merge.refused).toBe(true);
		expect(merge.remedy).toContain('MERGING it into develop');
		expect(pr.remedy).toContain('opens a pull request into develop');
	});

	it('allows the merge commit that moves the integration branch', () => {
		expect(
			judgeGitOperation(policy, commit('develop', true), AGENT).refused,
		).toBe(false);
	});

	it('refuses the hand-made agent branches, created or committed on', () => {
		const branch =
			'agent/screens-implementation-runner/x00056-S1-tetris-mock';
		expect(
			judgeGitOperation(policy, create(`refs/heads/${branch}`), AGENT)
				.refused,
		).toBe(true);
		expect(judgeGitOperation(policy, commit(branch), AGENT).refused).toBe(
			true,
		);
		expect(
			judgeGitOperation(policy, push(`refs/heads/${branch}`), AGENT)
				.refused,
		).toBe(true);
	});

	it('allows delendai work refs and publication refs', () => {
		const work = 'wip/gpt-5-codex/implement/x00056-S1-g1/tetris-mock';
		expect(
			judgeGitOperation(policy, create(`refs/heads/${work}`), AGENT)
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push(`refs/heads/${work}`), AGENT)
				.refused,
		).toBe(false);
		// The ref may be created and pushed; committing ON it is judged
		// separately, because that requires moving the shared checkout.
		expect(
			judgeGitOperation(policy, commitInWorktree(work), AGENT).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/heads/pr/x00056-s1'), AGENT)
				.refused,
		).toBe(false);
	});

	it('allows pushing the integration branch, since this profile merges locally', () => {
		expect(
			judgeGitOperation(policy, push('refs/heads/develop'), AGENT)
				.refused,
		).toBe(false);
	});

	it('never judges tags, remote-tracking refs or deletes', () => {
		expect(
			judgeGitOperation(policy, create('refs/tags/v1.0.0'), AGENT)
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(
				policy,
				create('refs/remotes/origin/agent/x'),
				AGENT,
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push('refs/heads/agent/x', true), AGENT)
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push('refs/tags/v1.0.0'), AGENT).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, commit(undefined), AGENT).refused,
		).toBe(false);
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
					'refs/heads/delendai/wip/claude-opus-5/implement/x00549-S1-g1/guard',
				),
				AGENT,
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(
				policy,
				push(
					'refs/heads/delendai/pr/claude-opus-5/implement/x00549-S1-g1/guard',
				),
				AGENT,
			).refused,
		).toBe(false);
	});

	it('refuses a work ref without its kind, or with a kind outside the vocabulary (f00644)', () => {
		for (const name of [
			'delendai/wip/claude-opus-5/x00549-S1-g1/guard',
			'delendai/wip/claude-opus-5/bogus/x00549-S1-g1/guard',
		]) {
			expect(
				judgeGitOperation(policy, create(`refs/heads/${name}`), AGENT)
					.refused,
			).toBe(true);
		}
	});

	it('refuses an agent id that spells the kind of work (f00644)', () => {
		const verdict = judgeGitOperation(
			policy,
			create(
				'refs/heads/delendai/wip/github-copilot-review-20260926/review/c00528-S1-g1/review',
			),
			AGENT,
		);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('spells the kind of work');
	});

	it('refuses an agent id that names the program it runs in, and accepts a model (x00694)', () => {
		const verdict = judgeGitOperation(
			policy,
			create('refs/heads/delendai/wip/copilot/review/batch-all-g1/close'),
			AGENT,
		);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain('program the agent runs in');
		for (const model of ['gpt-5-codex', 'minimax-m3', 'glm-5']) {
			expect(
				judgeGitOperation(
					policy,
					create(
						`refs/heads/delendai/wip/${model}/review/batch-all-g1/close`,
					),
					AGENT,
				).refused,
			).toBe(false);
		}
	});

	it('judges the shape inside delendai namespaces whoever runs git, and nothing outside (f00644)', () => {
		// A host that declares no agent marker is indistinguishable from a
		// person; the names in delendai's own namespaces are still the
		// tools', and a person's branches elsewhere stay free.
		expect(
			judgeGitOperation(
				policy,
				push(
					'refs/heads/delendai/pr/minimax-m3-review-20260926/x00558-review-g1/review',
				),
				PERSON,
			).refused,
		).toBe(true);
		expect(
			judgeGitOperation(
				policy,
				create('refs/heads/delendai/wip/someone/x00558-S1-g1/t'),
				PERSON,
			).refused,
		).toBe(true);
		expect(
			judgeGitOperation(policy, create('refs/heads/my-own-idea'), PERSON)
				.refused,
		).toBe(false);
	});

	it('keeps a unit written before the kind pushable and publishable (f00644)', () => {
		for (const ref of [
			'refs/heads/delendai/wip/claude-opus-5-5/f00644-S1-g1/the-work',
			'refs/heads/delendai/pr/claude-opus-5-5/f00644-S1-g1/the-work',
		]) {
			expect(judgeGitOperation(policy, push(ref), AGENT).refused).toBe(
				false,
			);
		}
		// Creating one in the old shape is what the kind now forbids.
		expect(
			judgeGitOperation(
				policy,
				create(
					'refs/heads/delendai/wip/claude-opus-5-5/f00644-S1-g1/new',
				),
				AGENT,
			).refused,
		).toBe(true);
	});

	it('refuses an agent id not written the way delendai writes it (f00644)', () => {
		expect(
			judgeGitOperation(
				policy,
				create(
					'refs/heads/delendai/wip/MiniMax-m3/review/x00553-all-g1/review',
				),
				PERSON,
			).reason,
		).toContain('lower case');
	});

	it('refuses a commit on a delendai branch authored as somebody else (f00644)', () => {
		const commit = {
			kind: 'commit' as const,
			branch: 'delendai/wip/minimax-m3/review/x00553-all-g1/review',
			isMerge: false,
			inMainWorktree: false,
			author: 'MiniMax-m3-review-20260926 <m@MiniMax-m3.invalid>',
			configuredAuthor: 'Owner <owner@example.com>',
		};
		for (const actor of [AGENT, PERSON]) {
			expect(judgeGitOperation(policy, commit, actor).refused).toBe(true);
		}
		expect(
			judgeGitOperation(
				policy,
				{ ...commit, author: 'Owner <owner@example.com>' },
				AGENT,
			).refused,
		).toBe(false);
		// A person's own branch elsewhere is theirs to author as they like.
		expect(
			judgeGitOperation(policy, { ...commit, branch: 'my-idea' }, PERSON)
				.refused,
		).toBe(false);
	});

	it('refuses a publication ref that does not have the shape of its work (f00644)', () => {
		const verdict = judgeGitOperation(
			policy,
			push('refs/heads/delendai/pr/proposal-f00643'),
			AGENT,
		);
		expect(verdict.refused).toBe(true);
		expect(verdict.remedy).toContain('delendai work publish');
	});

	it('refuses pushing the integration or release branch past pull requests', () => {
		const develop = judgeGitOperation(
			policy,
			push('refs/heads/develop'),
			AGENT,
		);
		expect(develop.refused).toBe(true);
		expect(develop.remedy).toContain('`delendai/pr/`');
		expect(
			judgeGitOperation(policy, push('refs/heads/main'), AGENT).refused,
		).toBe(true);
	});

	it('refuses an un-namespaced work branch', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/wip/claude/x'), AGENT)
				.refused,
		).toBe(true);
	});

	it('refuses deleting a work branch whose commits nothing else holds (x00687)', () => {
		const deletion = (deletedTipKept: boolean | undefined) =>
			({
				kind: 'push',
				remoteRef:
					'refs/heads/delendai/wip/agent/review/x00001-S1-g1/t',
				deleting: true,
				deletedTipKept,
			}) as const;
		const lost = judgeGitOperation(policy, deletion(false), AGENT);
		expect(lost.refused).toBe(true);
		expect(lost.remedy).toContain('work publish');
		expect(judgeGitOperation(policy, deletion(true), AGENT).refused).toBe(
			false,
		);
		// Unknown here (the commit is not local): not refused.
		expect(
			judgeGitOperation(policy, deletion(undefined), AGENT).refused,
		).toBe(false);
		// Inside delendai's namespaces the rule holds for whoever runs git:
		// a runtime that sets no agent marker is judged like one.
		expect(judgeGitOperation(policy, deletion(false), PERSON).refused).toBe(
			true,
		);
		// Outside them, a person deletes what they like.
		expect(
			judgeGitOperation(
				policy,
				{
					kind: 'push',
					remoteRef: 'refs/heads/my-own-branch',
					deleting: true,
					deletedTipKept: false,
				},
				PERSON,
			).refused,
		).toBe(false);
	});
});

describe('shared-direct', () => {
	const policy = expandProfile('shared-direct');

	it('allows committing to the integration branch it commits to', () => {
		expect(
			judgeGitOperation(policy, commit('develop'), AGENT).refused,
		).toBe(false);
	});

	it('still keeps branches to the ones the profile uses', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/feature/x'), AGENT)
				.refused,
		).toBe(true);
	});
});

describe('worktree-pr', () => {
	const policy = expandProfile('worktree-pr');

	it('lets agents create and push their own branches, whatever they are called', () => {
		expect(
			judgeGitOperation(policy, create('refs/heads/agent/a/x-S1'), AGENT)
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/heads/feature/x'), AGENT)
				.refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, commit('agent/a/x-S1'), AGENT).refused,
		).toBe(false);
	});

	it('refuses a direct commit or push to the integration branch', () => {
		expect(
			judgeGitOperation(policy, commit('develop'), AGENT).refused,
		).toBe(true);
		expect(
			judgeGitOperation(policy, push('refs/heads/develop'), AGENT)
				.refused,
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
		const verdict = judgeGitOperation(policy, commit(work), AGENT);
		expect(verdict.refused).toBe(true);
		expect(verdict.reason).toContain(work);
		expect(verdict.reason).toContain('`develop`');
		expect(verdict.remedy).toContain('delendai work checkpoint');
	});

	it('allows the same commit in the agent own worktree', () => {
		expect(
			judgeGitOperation(policy, commitInWorktree(work), AGENT).refused,
		).toBe(false);
	});

	it('treats an unobserved worktree as the shared one', () => {
		// Absent evidence must not weaken the rule that protects the
		// checkout every other agent reads.
		expect(
			judgeGitOperation(
				policy,
				{
					kind: 'commit',
					branch: work,
					isMerge: false,
				},
				AGENT,
			).refused,
		).toBe(true);
	});

	it('still allows a merge, which is how the integration branch moves', () => {
		expect(
			judgeGitOperation(policy, commit('develop', true), AGENT).refused,
		).toBe(false);
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
			AGENT,
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
			judgeGitOperation(free, commit('agent/claude/x00001-S1'), AGENT)
				.refused,
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
					'refs/heads/delendai/wip/claude-opus-5/implement/x00563-S1-g1/the-explanation',
				),
				AGENT,
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
				AGENT,
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
				AGENT,
			).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, create('refs/heads/develop'), AGENT)
				.refused,
		).toBe(false);
	});

	it('leaves a worktree profile free to name its own branches', () => {
		// `worktree-pr` gives every agent its own worktree and says so:
		// taking that away would be a different policy, not this rule.
		const free = resolveDevelopmentPolicy({
			development: { profile: 'worktree-pr' },
		});
		expect(
			judgeGitOperation(
				free,
				create('refs/heads/agent/claude/whatever'),
				AGENT,
			).refused,
		).toBe(false);
	});
});

describe('delendai governs agents; a person uses git freely (x00626)', () => {
	const profiles = [
		'shared-direct',
		'shared-checkout-pr',
		'shared-checkout-merge',
		'worktree-pr',
	] as const;

	it('refuses an agent stash, says why, and names the marker that identified it', () => {
		for (const profile of profiles) {
			const verdict = judgeGitOperation(
				resolveDevelopmentPolicy({ development: { profile } }),
				{ kind: 'stash' },
				{ agentMarker: 'CLAUDECODE' },
			);
			expect(verdict.refused).toBe(true);
			// Every worktree shares one stash, so this holds for the
			// worktree profile as much as for a shared checkout.
			expect(verdict.reason).toContain('refs/stash');
			expect(verdict.reason).toContain('CLAUDECODE');
			expect(verdict.remedy).toContain('work ref');
		}
	});

	it('lets a person stash, branch, commit and push under every profile', () => {
		for (const profile of profiles) {
			const policy = resolveDevelopmentPolicy({
				development: { profile },
			});
			for (const operation of [
				{ kind: 'stash' } as const,
				create('refs/heads/feature/my-own-branch'),
				commit('develop'),
				push('refs/heads/develop'),
			]) {
				expect(
					judgeGitOperation(policy, operation, PERSON).refused,
				).toBe(false);
			}
		}
	});
});
