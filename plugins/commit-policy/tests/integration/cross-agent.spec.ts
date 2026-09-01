import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BRANCH_POLICY } from '@mcp-vertex/commit-policy/lib/contracts/branch';
import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { createCommitPolicyEngine } from '@mcp-vertex/commit-policy/lib/engine';
import {
	computeSliceTriggerEventId,
	createSliceListener,
	type ITriggerAck,
	type ITriggerEvent,
} from '@mcp-vertex/commit-policy/lib/triggers/slice-listener';

import { createTempGitRepo, type ITempGitRepo } from './_fixtures/git-tmp';

type SliceSpec = {
	readonly id: string;
	readonly status: string;
	readonly files: readonly string[];
};

type ProposalSpec = {
	readonly id: string;
	readonly slices: readonly SliceSpec[];
};

type ScenarioSnapshot = {
	readonly committedFiles: readonly string[];
	readonly stagedAfter: readonly string[];
	readonly statusAfter: readonly string[];
};

const trackedRepos: ITempGitRepo[] = [];

afterEach(async () => {
	vi.useRealTimers();
	await Promise.all(trackedRepos.splice(0).map((repo) => repo.cleanup()));
});

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

const createRepo = async (): Promise<ITempGitRepo> => {
	const repo = await createTempGitRepo({
		branch: 'agent/t00018-s1',
		prefix: 'commit-policy-cross-agent-',
	});
	trackedRepos.push(repo);
	await mkdir(join(repo.cwd, 'proposals'), { recursive: true });
	return repo;
};

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

const writeProposalIndex = async (
	repo: ITempGitRepo,
	proposals: readonly ProposalSpec[],
): Promise<void> => {
	await writeFile(
		join(repo.cwd, 'proposals', 'index.json'),
		`${JSON.stringify({ proposals }, null, 2)}\n`,
		'utf8',
	);
};

const readCommitFiles = async (
	repo: ITempGitRepo,
	sha: string,
): Promise<string[]> => {
	const output = await repo.git(
		'show',
		'--pretty=format:',
		'--name-only',
		sha,
	);
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort();
};

const readStatus = async (repo: ITempGitRepo): Promise<string[]> => {
	const output = await repo.git('status', '--short', '--untracked-files=all');
	return output
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.sort();
};

const runSliceCommit = async (
	repo: ITempGitRepo,
	file: string,
	proposalId: string,
	sliceId: string,
) => {
	const engine = createEngine(repo);
	const headBefore = await repo.readHead();
	const result = await engine.handle({
		kind: 'slice',
		proposalId,
		sliceId,
		files: [file],
		eventId: `${proposalId}-${sliceId}-${file}`,
	});
	const headAfter = await repo.readHead();
	const snapshot: ScenarioSnapshot = {
		committedFiles:
			result.ack === 'OK' && headAfter !== headBefore
				? await readCommitFiles(repo, headAfter)
				: [],
		stagedAfter: await repo.stagedSet(),
		statusAfter: await readStatus(repo),
	};
	await engine.dispose();
	return { result, snapshot, headBefore, headAfter };
};

const createSliceHandler = (repo: ITempGitRepo, delivered: ITriggerEvent[]) => {
	const engine = createEngine(repo);
	const handler = async (event: ITriggerEvent): Promise<ITriggerAck> => {
		delivered.push(event);
		const result = await engine.handle({
			kind: 'slice',
			proposalId: event.proposalId ?? '',
			sliceId: event.sliceId ?? '',
			files: event.files?.paths ?? [],
			eventId: computeSliceTriggerEventId(event),
		});
		return result.ack === 'OK' || result.ack === 'ALREADY_PROCESSED'
			? { ack: 'OK' }
			: {
					ack: 'ERR',
					...('reason' in result && result.reason !== undefined
						? { reason: result.reason }
						: {}),
				};
	};
	return {
		engine,
		listener: createSliceListener(
			repo.cwd,
			'.',
			{ kind: 'slice', onStatuses: ['done'] },
			handler,
			60_000,
			'.',
		),
	};
};

describe('cross-agent slice staging (t00018 S1)', () => {
	it('commits only B files when A already has staged work in the same repo', async () => {
		const repo = await createRepo();
		await writeRepoFile(repo, 'a.ts', 'export const a = 1;\n');
		await repo.git('add', '--', 'a.ts');
		await writeRepoFile(repo, 'b.ts', 'export const b = 1;\n');

		const { result, snapshot } = await runSliceCommit(
			repo,
			'b.ts',
			'p-b',
			'S1',
		);

		expect(result.ack).toBe('OK');
		expect(snapshot).toMatchInlineSnapshot(`
			{
			  "committedFiles": [
			    "b.ts",
			  ],
			  "stagedAfter": [
			    "a.ts",
			  ],
			  "statusAfter": [
			    "A  a.ts",
			  ],
			}
		`);
	});

	it('leaves A dirty when B commits its slice from an isolated index', async () => {
		const repo = await createRepo();
		await writeRepoFile(repo, 'a.ts', 'export const a = 1;\n');
		await writeRepoFile(repo, 'b.ts', 'export const b = 1;\n');

		const { result, snapshot } = await runSliceCommit(
			repo,
			'b.ts',
			'p-b',
			'S1',
		);

		expect(result.ack).toBe('OK');
		expect(snapshot).toMatchInlineSnapshot(`
			{
			  "committedFiles": [
			    "b.ts",
			  ],
			  "stagedAfter": [],
			  "statusAfter": [
			    "?? a.ts",
			  ],
			}
		`);
	});

	it('keeps commits isolated while listeners observe the shared proposal registry', async () => {
		const repo = await createRepo();
		const deliveredA: ITriggerEvent[] = [];
		const deliveredB: ITriggerEvent[] = [];
		const a = createSliceHandler(repo, deliveredA);
		const b = createSliceHandler(repo, deliveredB);

		await writeProposalIndex(repo, [
			{
				id: 'p-a',
				slices: [{ id: 'S1', status: 'pending', files: ['a.ts'] }],
			},
			{
				id: 'p-b',
				slices: [{ id: 'S1', status: 'pending', files: ['b.ts'] }],
			},
		]);
		await Promise.all([a.listener.check(), b.listener.check()]);

		await writeRepoFile(repo, 'a.ts', 'export const a = 1;\n');
		await repo.git('add', '--', 'a.ts');
		await writeRepoFile(repo, 'b.ts', 'export const b = 1;\n');
		const headBeforeB = await repo.readHead();

		await writeProposalIndex(repo, [
			{
				id: 'p-a',
				slices: [{ id: 'S1', status: 'pending', files: ['a.ts'] }],
			},
			{
				id: 'p-b',
				slices: [{ id: 'S1', status: 'done', files: ['b.ts'] }],
			},
		]);
		await b.listener.check();

		const headAfterB = await repo.readHead();
		const afterB = {
			committedFiles:
				headAfterB !== headBeforeB
					? await readCommitFiles(repo, headAfterB)
					: [],
			stagedAfter: await repo.stagedSet(),
			statusAfter: await readStatus(repo),
		};

		const headBeforeA = await repo.readHead();
		await writeProposalIndex(repo, [
			{
				id: 'p-a',
				slices: [{ id: 'S1', status: 'done', files: ['a.ts'] }],
			},
			{
				id: 'p-b',
				slices: [{ id: 'S1', status: 'done', files: ['b.ts'] }],
			},
		]);
		await a.listener.check();

		const headAfterA = await repo.readHead();
		expect(headAfterB).not.toBe(headBeforeB);
		expect(afterB).toMatchInlineSnapshot(`
			{
			  "committedFiles": [
			    "b.ts",
			  ],
			  "stagedAfter": [
			    "a.ts",
			  ],
			  "statusAfter": [
			    "?? proposals/index.json",
			    "A  a.ts",
			  ],
			}
		`);
		expect(headAfterA).not.toBe(headBeforeA);
		expect(await readCommitFiles(repo, headAfterA)).toEqual(['a.ts']);
		expect(deliveredA.map((event) => event.proposalId)).toEqual([
			'p-a',
			'p-b',
		]);
		expect(deliveredB.map((event) => event.proposalId)).toEqual(['p-b']);

		a.listener.stop();
		b.listener.stop();
		await Promise.all([a.engine.dispose(), b.engine.dispose()]);
	});

	it('commits once after a listener reload when the old listener was stopped before the transition', async () => {
		const repo = await createRepo();
		const firstPass: ITriggerEvent[] = [];
		const reloadedPass: ITriggerEvent[] = [];
		const initial = createSliceHandler(repo, firstPass);

		await writeProposalIndex(repo, [
			{
				id: 'p-b',
				slices: [{ id: 'S1', status: 'pending', files: ['b.ts'] }],
			},
		]);
		await initial.listener.check();
		initial.listener.stop();
		await initial.engine.dispose();

		const reloaded = createSliceHandler(repo, reloadedPass);
		await reloaded.listener.check();
		await writeRepoFile(repo, 'b.ts', 'export const b = 1;\n');
		await writeProposalIndex(repo, [
			{
				id: 'p-b',
				slices: [{ id: 'S1', status: 'done', files: ['b.ts'] }],
			},
		]);
		await reloaded.listener.check();

		expect(reloadedPass).toHaveLength(1);
		expect(await repo.logCount()).toBe(2);
		expect(await readCommitFiles(repo, await repo.readHead())).toEqual([
			'b.ts',
		]);

		reloaded.listener.stop();
		await reloaded.engine.dispose();
	});

	it('serializes parallel A/B slice commits so each commit contains only its own file', async () => {
		const repo = await createRepo();
		const engineA = createEngine(repo);
		const engineB = createEngine(repo);
		await writeRepoFile(repo, 'a.ts', 'export const a = 1;\n');
		await writeRepoFile(repo, 'b.ts', 'export const b = 1;\n');

		const [resultA, resultB] = await Promise.all([
			engineA.handle({
				kind: 'slice',
				proposalId: 'p-a',
				sliceId: 'S1',
				files: ['a.ts'],
				eventId: 'evt-a',
			}),
			engineB.handle({
				kind: 'slice',
				proposalId: 'p-b',
				sliceId: 'S1',
				files: ['b.ts'],
				eventId: 'evt-b',
			}),
		]);

		const recent = (await repo.git('log', '--pretty=%H', '-2'))
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		const fileSets = (
			await Promise.all(recent.map((sha) => readCommitFiles(repo, sha)))
		).sort((left, right) => left.join(',').localeCompare(right.join(',')));

		expect(resultA.ack).toBe('OK');
		expect(resultB.ack).toBe('OK');
		expect(fileSets).toMatchInlineSnapshot(`
			[
			  [
			    "a.ts",
			  ],
			  [
			    "b.ts",
			  ],
			]
		`);

		await Promise.all([engineA.dispose(), engineB.dispose()]);
	});
});
