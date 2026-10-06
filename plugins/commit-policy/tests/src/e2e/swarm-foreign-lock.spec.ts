/**
 * The swarm case, against real Git.
 *
 * This repo's own policy is the dangerous combination on purpose:
 * `sliceScoping: false` + `allowForeignChanges: true` + a 5-minute
 * interval trigger + `push.onCommit` on the shared branch. That reads as
 * "commit everything dirty, every five minutes, and push it", and no
 * care inside the policy can avoid catching a file another agent is
 * midway through writing — which is how the shared branch goes red with
 * nobody having broken it, and every agent's closing gate then refuses.
 *
 * The lock file is what makes it safe without changing the policy.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import {
	createAgentLockForeignLockProvider,
	deriveAgentLockPath,
} from '../../../src/lib/services/agent-lock-foreign-locks';
import { runCommitDriver } from '../../../src/lib/services/commit-driver';
import {
	cleanupDogfoodRepo,
	createDogfoodRepo,
	git,
} from './_fixtures/dogfood-repo';

const SWEEP_EVERYTHING = CommitPolicyOptionsSchema.parse({
	commit: { enabled: true },
	identity: { mode: 'global' },
	cadence: {
		triggers: [{ kind: 'interval', minutes: 5 }],
		sliceScoping: false,
		allowForeignChanges: true,
	},
	push: { enabled: false },
});

describe('commit-policy E2E — a swarm sweep never commits a held file', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	const writeLock = async (inFlight: readonly unknown[]): Promise<void> => {
		const lockFileAbs = deriveAgentLockPath(workspace);
		await mkdir(dirname(lockFileAbs), { recursive: true });
		await writeFile(
			lockFileAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: inFlight,
			}),
			'utf8',
		);
	};

	const provider = () =>
		createAgentLockForeignLockProvider({
			lockFileAbs: deriveAgentLockPath(workspace),
			policy: { staleAfterMinutes: 10 },
		});

	const committedFiles = async (): Promise<readonly string[]> => {
		const { stdout } = await git(
			workspace,
			'show',
			'--pretty=format:',
			'--name-only',
			'HEAD',
		);
		return stdout.split('\n').filter(Boolean).sort();
	};

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
		await git(workspace, 'checkout', '-q', 'develop');
	});
	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('commits its own work and leaves the other agent’s file alone', async () => {
		await writeFile(join(workspace, 'mine.ts'), 'export const a = 1;\n');
		await writeFile(join(workspace, 'theirs.ts'), 'half written\n');
		await writeLock([
			{
				task_id: 'f00002-S1',
				agent: 'agent-b',
				ownership: ['theirs.ts'],
				last_seen: new Date().toISOString(),
			},
		]);

		const result = await runCommitDriver(
			{
				message: 'chore: interval sweep',
				triggerContext: {
					kind: 'interval',
					files: ['mine.ts', 'theirs.ts'],
				},
			},
			{
				run: runner,
				policy: SWEEP_EVERYTHING,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
				foreignLocks: provider(),
				selfAgent: 'agent-a',
			},
		);

		expect(result.committed).toBe(true);
		expect(await committedFiles()).toEqual(['mine.ts']);
		expect(result.withheldForeignLocks).toEqual(['theirs.ts']);
		// The other agent's work is untouched and still theirs to commit.
		const { stdout } = await git(workspace, 'status', '--porcelain');
		expect(stdout).toContain('theirs.ts');
	});

	it('refuses, with a next step, when every file is held', async () => {
		await writeFile(join(workspace, 'theirs.ts'), 'half written\n');
		await writeLock([
			{
				task_id: 'f00002-S1',
				agent: 'agent-b',
				ownership: ['theirs.ts'],
				last_seen: new Date().toISOString(),
			},
		]);

		const before = (await git(workspace, 'rev-parse', 'HEAD')).stdout;
		const result = await runCommitDriver(
			{
				message: 'chore: interval sweep',
				triggerContext: { kind: 'interval', files: ['theirs.ts'] },
			},
			{
				run: runner,
				policy: SWEEP_EVERYTHING,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
				foreignLocks: provider(),
				selfAgent: 'agent-a',
			},
		);

		expect(result.committed).toBe(false);
		expect(result.refusal).toContain('FOREIGN_LOCK_HELD');
		expect(result.refusal).toContain('agent-b');
		expect(result.refusal).toContain('await_lock');
		// Refusing must not move HEAD.
		expect((await git(workspace, 'rev-parse', 'HEAD')).stdout).toBe(before);
	});

	it('still sweeps everything when the claim has expired', async () => {
		// A claim whose owner stopped working must not stall commits
		// forever: the lock engine already treats it as free, and the two
		// readers have to agree or a file is free and held at once.
		await writeFile(join(workspace, 'theirs.ts'), 'finished\n');
		await writeLock([
			{
				task_id: 'f00002-S1',
				agent: 'agent-b',
				ownership: ['theirs.ts'],
				last_seen: new Date(Date.now() - 45 * 60_000).toISOString(),
			},
		]);

		const result = await runCommitDriver(
			{
				message: 'chore: interval sweep',
				triggerContext: { kind: 'interval', files: ['theirs.ts'] },
			},
			{
				run: runner,
				policy: SWEEP_EVERYTHING,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
				foreignLocks: provider(),
				selfAgent: 'agent-a',
			},
		);

		expect(result.committed).toBe(true);
		expect(await committedFiles()).toEqual(['theirs.ts']);
	});

	it('never withholds from a commit whose files the caller named', async () => {
		// The safeguard must not be able to refuse an agent committing
		// its own claimed slice. Whether an entry is "someone else's"
		// depends on this plugin's idea of who it is matching the lock
		// file's, which it cannot guarantee — so an explicitly named
		// file list is never filtered, and a wrong guess can never turn
		// a safeguard against deadlock into a cause of one.
		await writeFile(join(workspace, 'ours.ts'), 'export const a = 1;\n');
		await writeLock([
			{
				task_id: 'f00002-S1',
				agent: 'whatever-the-lock-calls-us',
				ownership: ['ours.ts'],
				last_seen: new Date().toISOString(),
			},
		]);

		const result = await runCommitDriver(
			{
				message: 'feat: my own slice',
				files: ['ours.ts'],
			},
			{
				run: runner,
				policy: SWEEP_EVERYTHING,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
				foreignLocks: provider(),
				selfAgent: 'a-name-that-does-not-match',
			},
		);

		expect(result.committed).toBe(true);
		expect(await committedFiles()).toEqual(['ours.ts']);
		expect(result.withheldForeignLocks).toBeUndefined();
	});

	it('behaves exactly as before when no provider is wired', async () => {
		// A host without the proposals plugin is a supported setup and
		// must see no change at all.
		await writeFile(join(workspace, 'a.ts'), 'export const a = 1;\n');
		const result = await runCommitDriver(
			{
				message: 'chore: interval sweep',
				triggerContext: { kind: 'interval', files: ['a.ts'] },
			},
			{
				run: runner,
				policy: SWEEP_EVERYTHING,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.withheldForeignLocks).toBeUndefined();
	});
});
