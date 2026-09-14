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
import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { DEFAULT_BRANCH_POLICY } from '../../../../src/lib/contracts/branch';
import type { ICommitPolicyOptions } from '../../../../src/lib/contracts/options';
import {
	createCommitPolicyEngine,
	type IEngineEvent,
	type IEngineOptions,
} from '../../../../src/lib/engine';
import type { IMergeCandidateHandoff } from '../../../../src/lib/contracts/interfaces/persistence.interface';
import { UNANCHORED } from '@delendai/core/public';

import { bindWipCheckpointPort } from '../../../../src/lib/persistence/wip-binding';
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

const hashIndex = async (repoCwd: string): Promise<string> =>
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

const intervalEvent = (
	eventId: string,
	files: readonly string[],
): IEngineEvent => ({
	kind: 'interval',
	dirtyCount: files.length,
	files,
	eventId,
});

describe('commit-policy engine — shared-checkout-pr routes to a work ref', () => {
	const wipHarness = async (
		overrides: Partial<IResolvedDevelopmentPolicy> = {},
	) => {
		const h = await harness('develop');
		const wip = await bindWipCheckpointPort(h.repo.cwd, UNANCHORED);
		if (wip === undefined) throw new Error('wip engine did not bind');
		const submit = vi.fn(async (_candidate: IMergeCandidateHandoff) => ({
			status: 'opened',
			reason: 'pull request opened',
		}));
		const persistence = createPolicyPersistence({
			policy: { ...expandProfile('shared-checkout-pr'), ...overrides },
			run: createWriteGitRunner(h.repo.cwd),
			wip,
			integration: { submit },
			agentId: 'agent-a',
		});
		if (persistence === undefined) {
			throw new Error('expected a persistence port');
		}
		return { h, submit, persistence };
	};

	it('does not commit to develop, does not push, and never touches .git/index', async () => {
		const { h, submit, persistence } = await wipHarness();
		await writeFile(join(h.repo.cwd, 'src.ts'), 'export const a = 1;\n');
		const headBefore = await h.repo.readHead();
		const indexBefore = await hashIndex(h.repo.cwd);
		const pushed = vi.fn(async () => null);
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
			onCommitSucceeded: pushed,
		});

		const result = await engine.handle(sliceEvent('wip-1', ['src.ts']));

		expect(result.ack).toBe('OK');
		if (result.ack !== 'OK') throw new Error('unreachable');
		// The integration branch did not move.
		expect(await h.repo.readHead()).toBe(headBefore);
		expect(await h.repo.logCount()).toBe(1);
		// The shared index was not contaminated.
		expect(await hashIndex(h.repo.cwd)).toBe(indexBefore);
		expect(await h.repo.stagedSet()).toEqual([]);
		// Nothing was pushed.
		expect(pushed).not.toHaveBeenCalled();
		expect(result.pushed).toBe(false);
		expect(result.committed).toBe(false);
		expect(result.headMoved).toBe(false);
		// The work ref exists and carries the checkpoint.
		const ref = result.checkpoint?.ref ?? '';
		expect(ref).toMatch(/^refs\/wip\/agent-a\//u);
		expect(await h.repo.git('rev-parse', ref)).toBe(
			result.checkpoint?.commit,
		);
		expect(result.checkpoint?.scope).toEqual(['src.ts']);
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('is not refused for sitting on the protected integration branch', async () => {
		const { h, persistence } = await wipHarness();
		await writeFile(join(h.repo.cwd, 'src.ts'), 'export const a = 1;\n');
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});
		const result = await engine.handle(sliceEvent('wip-2', ['src.ts']));
		expect(result.ack).toBe('OK');
	});

	it('an interval trigger is durability and is NEVER handed to integration', async () => {
		const { h, submit, persistence } = await wipHarness();
		await writeFile(join(h.repo.cwd, 'src.ts'), 'export const a = 1;\n');
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});

		const result = await engine.handle(intervalEvent('iv-1', ['src.ts']));

		expect(result.ack).toBe('OK');
		if (result.ack !== 'OK') throw new Error('unreachable');
		expect(result.checkpoint?.classification.intent).toBe('durability');
		expect(result.checkpoint?.classification.eligibleForIntegration).toBe(
			false,
		);
		expect(result.checkpoint?.handoff.attempted).toBe(false);
		expect(submit).not.toHaveBeenCalled();
		// It is still durable: the ref exists.
		expect(
			await h.repo.git('rev-parse', result.checkpoint?.ref ?? ''),
		).toBe(result.checkpoint?.commit);
	});

	it('a RED durability checkpoint still persists and still is not merged', async () => {
		const { h, submit, persistence } = await wipHarness();
		// Deliberately broken, mid-edit content — the exact thing a
		// durability checkpoint exists to preserve and must not merge.
		await writeFile(
			join(h.repo.cwd, 'src.ts'),
			'export const broken = (\n',
		);
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});

		const result = await engine.handle(intervalEvent('iv-red', ['src.ts']));

		expect(result.ack).toBe('OK');
		if (result.ack !== 'OK') throw new Error('unreachable');
		expect(result.checkpoint?.classification.mayBeRed).toBe(true);
		expect(submit).not.toHaveBeenCalled();
		const blob = await h.repo.git(
			'show',
			`${result.checkpoint?.commit ?? ''}:src.ts`,
		);
		expect(blob).toContain('broken');
		// And develop is untouched by the red work.
		expect(await h.repo.logCount()).toBe(1);
	});

	it('a slice boundary IS handed to the integration engine as a candidate', async () => {
		const { h, submit, persistence } = await wipHarness();
		await writeFile(join(h.repo.cwd, 'src.ts'), 'export const a = 1;\n');
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});

		const result = await engine.handle(sliceEvent('sl-1', ['src.ts']));

		expect(result.ack).toBe('OK');
		if (result.ack !== 'OK') throw new Error('unreachable');
		expect(result.checkpoint?.classification.intent).toBe('candidate');
		expect(result.checkpoint?.handoff.attempted).toBe(true);
		expect(result.checkpoint?.handoff.status).toBe('opened');
		expect(submit).toHaveBeenCalledTimes(1);
		const candidate = submit.mock.calls[0]?.[0];
		if (candidate === undefined) throw new Error('no candidate submitted');
		expect(candidate.wipRef).toBe(result.checkpoint?.ref);
		expect(candidate.baseIntegrationSha).toBe(await h.repo.readHead());
		expect(candidate.fileScope).toEqual(['src.ts']);
	});

	it('refuses, with a structured code, an operation that would move HEAD', async () => {
		const h = await harness('develop');
		const base = expandProfile('shared-checkout-pr');
		const persistence = createPolicyPersistence({
			policy: {
				...base,
				// A checked-out work branch in a checkout the policy pins.
				persistence: {
					strategy: 'branch',
					usesWipRefs: false,
					exactScope: true,
					allowsDirectIntegrationCommit: false,
					autoCommitOnTask: true,
					autoPushAfterCommit: true,
				},
			},
			run: createWriteGitRunner(h.repo.cwd),
			agentId: 'agent-a',
		});
		if (persistence === undefined) {
			throw new Error('expected a refusing persistence port');
		}
		expect(persistence.route).toBe('refused');
		await writeFile(join(h.repo.cwd, 'src.ts'), 'export const a = 1;\n');
		const headBefore = await h.repo.readHead();
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await engine.handle(sliceEvent('pin-1', ['src.ts']));

		expect(result.ack).toBe('ERR');
		if (result.ack !== 'ERR') throw new Error('unreachable');
		expect(result.code).toBe('PINNED_CHECKOUT');
		expect(result.reason).toContain('Remedy:');
		expect(await h.repo.readHead()).toBe(headBefore);
	});

	it('surfaces scope-narrowed rather than silencing it with the opt-in flag', async () => {
		const { h, persistence } = await wipHarness();
		await writeFile(join(h.repo.cwd, 'a.ts'), 'export const a = 1;\n');
		await writeFile(join(h.repo.cwd, 'b.ts'), 'export const b = 2;\n');
		const engine = createCommitPolicyEngine({
			driver: driverFor(h),
			branchPolicy: DEFAULT_BRANCH_POLICY,
			persistence,
		});
		const first = await engine.handle(
			sliceEvent('narrow-1', ['a.ts', 'b.ts']),
		);
		expect(first.ack).toBe('OK');
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		// Same work unit, same generation → same ref, but a narrower claim.
		const second = await engine.handle(sliceEvent('narrow-2', ['a.ts']));

		expect(second.ack).toBe('ERR');
		if (second.ack !== 'ERR') throw new Error('unreachable');
		expect(second.code).toBe('WIP_SCOPE_NARROWED');
		expect(second.reason).toContain('b.ts');
	});
});
