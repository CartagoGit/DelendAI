/**
 * engine-legacy-parity.spec.ts — the direct-integration path must be
 * bit-for-bit what it was before the development policy existed.
 *
 * Split out of `engine-policy-routing.spec.ts` when that file crossed
 * the SRP ceiling. The two describe blocks answer different questions:
 * this one that NOTHING changed for a `shared-direct` project, the
 * other that a `shared-checkout-pr` project routes to a work ref.
 */
/**
 * engine-policy-routing.spec.ts — proves, against a REAL git repository,
 * that the policy seam changes where work goes without changing the
 * legacy path.
 *
 * The two halves are deliberately asymmetric:
 *
 *  - the legacy half asserts SAMENESS: `shared-direct` and "no policy at
 *    all" must produce the identical commit-and-move-HEAD behaviour, and
 *    the port that would have re-routed them must not even exist.
 *  - the WIP half asserts ABSENCE: the integration branch head did not
 *    move and `.git/index` is byte-identical afterwards. Those two facts
 *    are the whole safety claim of the model, and neither can be checked
 *    against a stubbed git runner — a stub would happily report success
 *    for a `git add` that really did contaminate the index.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWriteGitRunner } from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { DEFAULT_BRANCH_POLICY } from '../../../../src/lib/contracts/branch';
import type { ICommitPolicyOptions } from '../../../../src/lib/contracts/options';
import {
	createCommitPolicyEngine,
	type IEngineEvent,
	type IEngineOptions,
} from '../../../../src/lib/engine';
import { createPolicyPersistence } from '../../../../src/lib/persistence/wip-persistence';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
	vi.restoreAllMocks();
});

const commitPolicyOptions = (): ICommitPolicyOptions => ({
	gitTimeoutMs: 60_000,
	commit: {
		enabled: true,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	},
	stash: { enabled: false },
	// `repo`, not `global`: the fixture sets a repo-LOCAL identity and
	// `lint:no-global-git-config-in-tests` forbids touching the global
	// one. `global` made the driver refuse on any machine without it —
	// green locally, red in CI, unrelated to the parity checked here.
	identity: { mode: 'repo' },
	audit: { trailer: 'none', agentFormat: '${host}/${model}' },
	cadence: { triggers: [], sliceScoping: true, allowForeignChanges: false },
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master', 'develop'],
	},
});

const _hashIndex = async (repoCwd: string): Promise<string> =>
	createHash('sha256')
		.update(await readFile(join(repoCwd, '.git', 'index')))
		.digest('hex');

interface IHarness {
	readonly repo: Awaited<ReturnType<typeof createTempGitRepo>>;
	readonly cacheDir: string;
}

const harness = async (branch: string): Promise<IHarness> => {
	const repo = await createTempGitRepo({ branch });
	const cacheDir = await mkdtemp(join(tmpdir(), 'commit-policy-cache-'));
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(cacheDir, { recursive: true, force: true });
	});
	return { repo, cacheDir };
};

const driverFor = (h: IHarness): IEngineOptions['driver'] => {
	const run = createWriteGitRunner(h.repo.cwd);
	return {
		run,
		policy: commitPolicyOptions(),
		identityCtx: { run, envVars: Object.freeze({}) },
		auditAgent: null,
		workspaceRoot: h.repo.cwd,
		pluginCacheDir: h.cacheDir,
	};
};

const sliceEvent = (
	eventId: string,
	files: readonly string[],
): IEngineEvent => ({
	kind: 'slice',
	proposalId: 'f00500',
	sliceId: 'S1',
	files,
	eventId,
});

const _intervalEvent = (
	eventId: string,
	files: readonly string[],
): IEngineEvent => ({
	kind: 'interval',
	dirtyCount: files.length,
	files,
	eventId,
});

describe('commit-policy engine — legacy persistence is untouched', () => {
	it('shared-direct builds NO persistence port at all', async () => {
		const h = await harness('feature/x');
		expect(
			createPolicyPersistence({
				policy: expandProfile('shared-direct'),
				run: createWriteGitRunner(h.repo.cwd),
				agentId: 'agent-a',
			}),
		).toBeUndefined();
	});

	it('shared-direct and no-policy commit identically and move HEAD', async () => {
		const outcomes: Array<{
			readonly headMoved: boolean;
			readonly committed: boolean;
			readonly logDelta: number;
			readonly checkpoint: unknown;
			readonly refusal: string | undefined;
			readonly warnings: readonly string[] | undefined;
		}> = [];
		for (const withPolicy of [false, true]) {
			const h = await harness('feature/x');
			await writeFile(
				join(h.repo.cwd, 'src.ts'),
				'export const a = 1;\n',
			);
			const persistence = withPolicy
				? createPolicyPersistence({
						policy: expandProfile('shared-direct'),
						run: createWriteGitRunner(h.repo.cwd),
						agentId: 'agent-a',
					})
				: undefined;
			const before = await h.repo.logCount();
			const engine = createCommitPolicyEngine({
				driver: driverFor(h),
				branchPolicy: DEFAULT_BRANCH_POLICY,
				...(persistence !== undefined ? { persistence } : {}),
			});
			const headBefore = await h.repo.readHead();
			const result = await engine.handle(sliceEvent('e1', ['src.ts']));
			expect(result.ack).toBe('OK');
			if (result.ack !== 'OK') throw new Error('unreachable');
			outcomes.push({
				headMoved: (await h.repo.readHead()) !== headBefore,
				committed: result.committed,
				logDelta: (await h.repo.logCount()) - before,
				checkpoint: result.checkpoint,
				// Three OK paths do not commit, so the reason travels.
				refusal: result.refusal,
				warnings: result.warnings,
			});
		}
		const why = JSON.stringify(outcomes, null, 1);
		expect(outcomes[0], why).toEqual(outcomes[1]);
		expect(outcomes[0]?.headMoved, why).toBe(true);
		expect(outcomes[0]?.committed, why).toBe(true);
		expect(outcomes[0]?.logDelta, why).toBe(1);
		// The direct path never reports a checkpoint.
		expect(outcomes[0]?.checkpoint).toBeUndefined();
	});
});
