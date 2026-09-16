/**
 * publish-proposal.spec.ts — getting a new proposal onto a ref is the
 * tool's job, not an instruction the agent may skip.
 *
 * The git calls are driven through an injected runner: what matters is
 * the SEQUENCE and the refusals, not that a real repository exists. The
 * refusals are the interesting half — a publisher that pushes onto the
 * integration branch, or invents a ref for a project that never asked
 * for one, would be worse than the problem it solves.
 */
import { describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import type { IPublishProposalRequest } from '@delendai/proposals/lib/contracts/interfaces/publish-proposal.interface';
import {
	protectedPushTarget,
	publicationRefFor,
	publishProposalOnRef,
	shouldPublishOnRef,
} from '@delendai/proposals/lib/tools/publish-proposal';

const PR_POLICY = {
	requiresPullRequest: true,
	publicationRefPrefix: 'delendai/pr/',
	integration: 'develop',
	release: 'main',
} as const;

/** A runner that records every call and answers ok unless told otherwise. */
const recordingRunner = (failOn?: {
	readonly step: string;
	readonly reason: string;
}): { readonly run: IGitRunner; readonly calls: string[][] } => {
	const calls: string[][] = [];
	const run: IGitRunner = async (args) => {
		calls.push([...args]);
		const step = args[0] ?? '';
		if (failOn !== undefined && step === failOn.step) {
			return { ok: false, output: '', reason: failOn.reason };
		}
		if (step === 'rev-parse') {
			return { ok: true, output: 'abc1234def5678\n' };
		}
		return { ok: true, output: '' };
	};
	return { run, calls };
};

/**
 * A complete request, with the runner the caller must always supply.
 *
 * Typed rather than `Record<string, unknown>`: an untyped override bag
 * makes the spread's result satisfy nothing, so `tsc` reports the
 * required field as missing even though every call site passes it.
 */
const request = (
	overrides: Partial<IPublishProposalRequest> & {
		readonly git: IGitRunner;
	},
): IPublishProposalRequest => ({
	proposalId: 'f00551',
	relativePath: 'docs/delendai/proposals/ready/feats/f00551-a-proposal.md',
	message: 'docs(proposals): add f00551',
	policy: PR_POLICY,
	...overrides,
});

describe('publicationRefFor', () => {
	it('names the ref from the project’s own prefix', () => {
		expect(publicationRefFor('delendai/pr/', 'f00551')).toBe(
			'delendai/pr/proposal-f00551',
		);
	});

	it('tolerates a prefix written without its trailing slash', () => {
		expect(publicationRefFor('team/publish', 'f00551')).toBe(
			'team/publish/proposal-f00551',
		);
	});
});

describe('shouldPublishOnRef', () => {
	it('publishes where the project integrates through a pull request', () => {
		expect(shouldPublishOnRef(PR_POLICY)).toBe(true);
	});

	it('publishes nothing for a project that integrates directly', () => {
		expect(shouldPublishOnRef({ requiresPullRequest: false })).toBe(false);
	});

	it('publishes nothing when no policy was resolved at all', () => {
		expect(shouldPublishOnRef(undefined)).toBe(false);
	});
});

describe('protectedPushTarget', () => {
	it('names the integration branch when a ref would land on it', () => {
		expect(protectedPushTarget('develop', PR_POLICY)).toBe('develop');
	});

	it('names the release branch too', () => {
		expect(protectedPushTarget('main', PR_POLICY)).toBe('main');
	});

	it('leaves an ordinary publication ref alone', () => {
		expect(
			protectedPushTarget('delendai/pr/proposal-f00551', PR_POLICY),
		).toBeUndefined();
	});
});

describe('publishProposalOnRef', () => {
	it('stages only the proposal, commits it, and pushes the ref by SHA', async () => {
		const { run, calls } = recordingRunner();

		const outcome = await publishProposalOnRef(request({ git: run }));

		expect(outcome.published).toBe(true);
		expect(outcome.ref).toBe('delendai/pr/proposal-f00551');
		expect(outcome.sha).toBe('abc1234def5678');

		// Staged by path — never `git add .`, which would fold a dirty
		// tree's unrelated changes into a proposal commit.
		expect(calls[0]).toEqual([
			'add',
			'--',
			'docs/delendai/proposals/ready/feats/f00551-a-proposal.md',
		]);
		expect(calls[1]?.slice(0, 3)).toEqual([
			'commit',
			'--only',
			'--message',
		]);
		// Pushed by SHA to the ref, so the checkout's own HEAD is
		// irrelevant and no local branch is created.
		expect(calls.at(-1)).toEqual([
			'push',
			'origin',
			'abc1234def5678:refs/heads/delendai/pr/proposal-f00551',
		]);
	});

	it('does nothing at all for a project that integrates directly', async () => {
		const { run, calls } = recordingRunner();

		const outcome = await publishProposalOnRef(
			request({ git: run, policy: { requiresPullRequest: false } }),
		);

		expect(outcome.published).toBe(false);
		expect(outcome.reason).toMatch(/does not publish proposals/u);
		// The point: no git ran. Imposing a ref on a host that never
		// asked for one is not a smaller mistake than not publishing.
		expect(calls).toEqual([]);
	});

	it('reports a failed push instead of throwing, so the document is not lost', async () => {
		const { run } = recordingRunner({
			step: 'push',
			reason: 'remote rejected',
		});

		const outcome = await publishProposalOnRef(request({ git: run }));

		expect(outcome.published).toBe(false);
		expect(outcome.reason).toContain('git push failed');
		expect(outcome.reason).toContain('remote rejected');
		// The ref is still reported: the agent needs to know which ref
		// the work is owed on.
		expect(outcome.ref).toBe('delendai/pr/proposal-f00551');
	});

	it('reports a failed commit and never reaches the push', async () => {
		const { run, calls } = recordingRunner({
			step: 'commit',
			reason: 'nothing to commit',
		});

		const outcome = await publishProposalOnRef(request({ git: run }));

		expect(outcome.published).toBe(false);
		expect(outcome.reason).toContain('git commit failed');
		expect(calls.some((call) => call[0] === 'push')).toBe(false);
	});

	it('falls back to a usable prefix rather than emitting an unpushable ref', async () => {
		const { run } = recordingRunner();

		const outcome = await publishProposalOnRef(
			request({
				git: run,
				policy: { ...PR_POLICY, publicationRefPrefix: '' },
			}),
		);

		// A blank prefix would produce `/proposal-f00551`, which git
		// refuses. The protected-branch guard itself is defence in depth
		// and is pinned directly by the `protectedPushTarget` cases above;
		// no reachable policy makes a publication ref collide with a
		// branch, which is why there is no integration case for it here.
		expect(outcome.ref).toBe('delendai/pr/proposal-f00551');
		expect(outcome.published).toBe(true);
	});

	it('pushes to the remote the caller names', async () => {
		const { run, calls } = recordingRunner();

		await publishProposalOnRef(request({ git: run, remote: 'upstream' }));

		expect(calls.at(-1)?.[1]).toBe('upstream');
	});
});
