import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_BRANCH_POLICY } from '@mcp-vertex/commit-policy/lib/contracts/branch';
import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { createCommitPolicyEngine } from '@mcp-vertex/commit-policy/lib/engine';

import { createTempGitRepo, type ITempGitRepo } from './_fixtures/git-tmp';

/**
 * AUD-CP-005.e2e (t00022) — the external reviewer's close-out delta on
 * t00018: a real, temporary Git repository, not `IGitRunner` fakes.
 * The quote that motivates this file:
 *
 *   "The test demonstrates that the function returns 'did not commit',
 *   but does not demonstrate that the commit did not happen."
 *
 * Every assertion below re-reads real Git state (`rev-parse HEAD`,
 * `rev-list --count`, `diff --cached --name-only`) after the engine
 * call returns, instead of trusting the engine's own report of itself.
 */

const trackedRepos: ITempGitRepo[] = [];

afterEach(async () => {
	await Promise.all(trackedRepos.splice(0).map((repo) => repo.cleanup()));
});

const createRepo = async (): Promise<ITempGitRepo> => {
	const repo = await createTempGitRepo({
		branch: 'agent/t00022-s2',
		prefix: 'commit-policy-cross-agent-real-',
	});
	trackedRepos.push(repo);
	return repo;
};

const basePolicy = (): ICommitPolicyOptions => ({
	gitTimeoutMs: 60_000,
	commit: {
		enabled: true,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	},
	stash: { enabled: false },
	identity: { mode: 'global' },
	audit: { trailer: 'none', agentFormat: '${host}/${model}' },
	cadence: {
		triggers: [],
		sliceScoping: true,
		allowForeignChanges: false,
	},
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master'],
	},
});

const createEngine = (repo: ITempGitRepo) =>
	createCommitPolicyEngine({
		driver: {
			run: repo.runner,
			policy: basePolicy(),
			identityCtx: {
				run: repo.runner,
				envVars: Object.freeze({}),
			},
			workspaceRoot: repo.cwd,
			pluginCacheDir: '.cache/mcp-vertex/commit-policy',
			auditAgent: null,
		},
		branchPolicy: DEFAULT_BRANCH_POLICY,
	});

const writeRepoFile = async (
	repo: ITempGitRepo,
	relativePath: string,
	contents: string,
): Promise<void> => {
	await writeFile(join(repo.cwd, relativePath), contents, 'utf8');
};

describe('AUD-CP-005.e2e — cross-agent contamination with real Git (t00022 S2)', () => {
	it('Test 1 — a foreign staged file never enters the commit, and stays staged for its own agent', async () => {
		// What the audit actually demanded: prove from real Git that the
		// intruder did not get committed — not that the engine SAID it
		// refused.
		//
		// This test used to expect `ERR CROSS_AGENT_CONTAMINATION`, which
		// was the pre-x00270 implementation's way of guaranteeing that:
		// abort the whole commit whenever anything foreign was staged.
		// The isolated index guarantees it structurally instead — the tree
		// is built from `read-tree HEAD` plus the allowList, so a foreign
		// path cannot be in it — and that is a stronger guarantee, not a
		// weaker one.
		//
		// It also matters for a swarm. `allowForeignChanges: false` is
		// documented as "do not INCLUDE other agents' changes", not "refuse
		// while other agents have work staged". In a shared checkout the
		// latter reading means every agent aborts whenever any other agent
		// has staged anything, which is most of the time — agents stall
		// with nothing to do and no way to make progress. Excluding the
		// foreign work and committing your own is what the option says and
		// what keeps the swarm moving.
		const repo = await createRepo();
		await writeRepoFile(repo, 'intruder.ts', '// staged by other agent\n');
		await repo.git('add', '--', 'intruder.ts');
		await writeRepoFile(repo, 'agent-a.ts', '// work of agent A\n');

		const logCountBefore = await repo.logCount();

		const engine = createEngine(repo);
		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'p001',
			sliceId: 'S1',
			files: ['agent-a.ts'],
			eventId: 'evt-1',
		});
		await engine.dispose();

		expect(result.ack).toBe('OK');

		// Re-read real Git state; never trust the engine's own report
		// of itself (this is the exact gap the external audit found).
		expect(await repo.logCount()).toBe(logCountBefore + 1);
		const committed = (
			await repo.git('show', '--pretty=format:', '--name-only', 'HEAD')
		)
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		expect(committed).toEqual(['agent-a.ts']);
		expect(committed).not.toContain('intruder.ts');

		// The other agent's work is untouched: still staged, still
		// uncommitted. Stealing or resetting it would be its own kind of
		// cross-agent contamination.
		expect(await repo.stagedSet()).toEqual(['intruder.ts']);
	});

	it('Test 2 — control: an allowList covering the intruder file commits successfully (rules out a false positive)', async () => {
		const repo = await createRepo();
		await writeRepoFile(repo, 'intruder.ts', '// staged by other agent\n');
		await repo.git('add', '--', 'intruder.ts');
		await writeRepoFile(repo, 'agent-a.ts', '// work of agent A\n');

		const headBefore = await repo.readHead();
		const logCountBefore = await repo.logCount();

		const engine = createEngine(repo);
		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'p001',
			sliceId: 'S1',
			files: ['agent-a.ts', 'intruder.ts'],
			eventId: 'evt-2',
		});
		await engine.dispose();

		expect(result.ack).toBe('OK');
		if (result.ack === 'OK') {
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			expect(result.headMoved).toBe(true);
		}

		const headAfter = await repo.readHead();
		expect(headAfter).not.toBe(headBefore);
		expect(await repo.logCount()).toBe(logCountBefore + 1);
		expect(await repo.stagedSet()).toEqual([]);

		const log = await repo.git('log', '-1', '--pretty=%s');
		expect(log).toContain('feat(p001):');
	});

	it('Test 3 — concurrency: 8 disjoint slices in parallel each commit exactly their own file, HEAD advances by 8', async () => {
		const repo = await createRepo();
		const sliceCount = 8;
		const specs = Array.from({ length: sliceCount }, (_unused, index) => ({
			proposalId: `p-${index}`,
			sliceId: 'S1',
			file: `agent-${index}.ts`,
		}));

		await Promise.all(
			specs.map((spec) =>
				writeRepoFile(
					repo,
					spec.file,
					`// work of ${spec.proposalId}\n`,
				),
			),
		);

		const logCountBefore = await repo.logCount();
		const engines = specs.map(() => createEngine(repo));

		const results = await Promise.all(
			specs.map((spec, index) =>
				engines[index]?.handle({
					kind: 'slice',
					proposalId: spec.proposalId,
					sliceId: spec.sliceId,
					files: [spec.file],
					eventId: `evt-${spec.proposalId}`,
				}),
			),
		);
		await Promise.all(engines.map((engine) => engine?.dispose()));

		for (const result of results) {
			expect(result?.ack).toBe('OK');
			if (result?.ack === 'OK') {
				expect(result.committed).toBe(true);
			}
		}

		expect(await repo.logCount()).toBe(logCountBefore + sliceCount);
		expect(await repo.stagedSet()).toEqual([]);

		// Every commit created by the run stages exactly its own file —
		// no cross-slice contamination under real concurrent writers.
		const shas = (await repo.git('log', '--pretty=%H', `-${sliceCount}`))
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		expect(shas).toHaveLength(sliceCount);
		const fileSets = await Promise.all(
			shas.map(async (sha) => {
				const output = await repo.git(
					'show',
					'--pretty=format:',
					'--name-only',
					sha,
				);
				return output
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			}),
		);
		for (const fileSet of fileSets) {
			expect(fileSet).toHaveLength(1);
		}
		const committedFiles = fileSets.flat().sort();
		expect(committedFiles).toEqual(specs.map((spec) => spec.file).sort());
	});
});
