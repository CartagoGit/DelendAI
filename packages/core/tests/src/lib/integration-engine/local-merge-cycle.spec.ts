/**
 * local-merge-cycle.spec.ts — the merge model had a decision function
 * and no runner.
 *
 * `planLocalMerge` was exported and called by nothing but its own spec,
 * so a project on `shared-checkout-merge` could checkpoint work to a ref
 * and watch it sit there forever. This drives the runner that closes
 * that gap, and pins the four properties that make it safe to run
 * concurrently with other agents.
 */

import { describe, expect, it } from 'vitest';

import { runLocalMergeCycle } from '@delendai/core/lib/integration-engine/local-merge-cycle';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';
import type {
	IIntegrationGit,
	IMergeCommitResult,
	IPushRefRequest,
} from '@delendai/core/lib/integration-engine/git-port.interface';

const mergePolicy = (): IResolvedDevelopmentPolicy =>
	deriveCapabilities(expandProfile('shared-checkout-merge'));

/** Runs the body immediately, and counts that it was entered at all. */
const section = () => {
	const entered: string[] = [];
	return {
		entered,
		run: async <T>(key: string, body: () => Promise<T>): Promise<T> => {
			entered.push(key);
			return body();
		},
	};
};

interface IGitStub {
	readonly git: IIntegrationGit;
	readonly pushes: IPushRefRequest[];
	readonly deleted: string[];
}

const gitStub = (overrides?: {
	readonly merge?: IMergeCommitResult;
	readonly pushOk?: boolean;
	readonly integrationSha?: string;
	readonly isAncestor?: boolean;
}): IGitStub => {
	const pushes: IPushRefRequest[] = [];
	const deleted: string[] = [];
	const integrationSha = overrides?.integrationSha ?? 'a'.repeat(40);
	return {
		pushes,
		deleted,
		git: {
			root: '/tmp/repo',
			resolveRevision: async (revision: string) =>
				revision.startsWith('refs/wip')
					? 'b'.repeat(40)
					: integrationSha,
			fetch: async () => ({ ok: true, reason: '' }),
			pushRef: async (request: IPushRefRequest) => {
				pushes.push(request);
				return overrides?.pushOk === false
					? { ok: false, reason: 'non-fast-forward' }
					: { ok: true, reason: '' };
			},
			deleteRef: async (request) => {
				deleted.push(request.ref);
				return { ok: true, reason: '' };
			},
			isAncestor: async () => overrides?.isAncestor ?? true,
			mergeCommit: async () =>
				overrides?.merge ?? { kind: 'merged', sha: 'c'.repeat(40) },
		},
	};
};

/**
 * A certification is evidence about a PAIR — this candidate, against
 * that integration head — so it has to name the head it was produced
 * against, or it cannot be known to still be true.
 */
const certifiedAgainst = (integrationSha: string) => ({
	workRef: 'refs/wip/agent-a/p-s-g1',
	remote: 'origin',
	certification: { passed: true, againstIntegrationSha: integrationSha },
});

const input = certifiedAgainst('a'.repeat(40));

describe('runLocalMergeCycle', () => {
	it('declines a policy that is not on the merge model WITHOUT taking the lock', async () => {
		const lock = section();
		const stub = gitStub();

		const outcome = await runLocalMergeCycle(
			deriveCapabilities(expandProfile('shared-checkout-pr')),
			stub.git,
			lock,
			input,
		);

		expect(outcome.status).toBe('declined');
		// Serialising every other strategy behind an engine that is about
		// to say "not my model" would make the lock the bottleneck for
		// projects that never use this path at all.
		expect(lock.entered).toEqual([]);
	});

	it('compare-and-swaps against the head the merge was BUILT on', async () => {
		const stub = gitStub({ integrationSha: 'd'.repeat(40) });

		await runLocalMergeCycle(
			mergePolicy(),
			stub.git,
			section(),
			certifiedAgainst('d'.repeat(40)),
		);

		expect(stub.pushes).toHaveLength(1);
		// Not "the head we hope is there". This is what turns a lost race
		// into a refused push instead of a silent overwrite of whatever
		// landed first.
		expect(stub.pushes[0]?.expectedRemoteSha).toBe('d'.repeat(40));
		expect(stub.pushes[0]?.force).toBe(false);
	});

	it('reports a lost race as stale, not as failure', async () => {
		const stub = gitStub({ pushOk: false });

		const outcome = await runLocalMergeCycle(
			mergePolicy(),
			stub.git,
			section(),
			input,
		);

		// Nothing was lost and the remedy is mechanical, so the word has
		// to say "try again", not "something broke".
		expect(outcome.status).toBe('stale');
		expect(outcome.reason).toContain('nothing was lost');
		expect(stub.deleted).toEqual([]);
	});

	it('keeps a conflict distinct from a failure, and names the paths', async () => {
		const stub = gitStub({
			merge: { kind: 'conflict', paths: ['src/a.ts', 'src/b.ts'] },
		});

		const outcome = await runLocalMergeCycle(
			mergePolicy(),
			stub.git,
			section(),
			input,
		);

		// A human has to reconcile this; git is not broken. Only one of
		// those two is worth retrying, so they must not share a status.
		expect(outcome.status).toBe('RECOVERY_CONFLICT');
		expect(outcome.conflicts).toEqual(['src/a.ts', 'src/b.ts']);
		expect(stub.pushes).toEqual([]);
	});

	it('does not fail the landing because the cleanup did not happen', async () => {
		const stub = gitStub();
		stub.git.deleteRef = async () => ({ ok: false, reason: 'ref moved' });

		const outcome = await runLocalMergeCycle(
			mergePolicy(),
			stub.git,
			section(),
			input,
		);

		// The work IS on the branch. Reporting the landing as failed
		// because a tidy-up was refused sends somebody looking for work
		// that is already there.
		expect(outcome.status).toBe('merged');
		expect(outcome.mergedSha).toBe('c'.repeat(40));
	});
});
