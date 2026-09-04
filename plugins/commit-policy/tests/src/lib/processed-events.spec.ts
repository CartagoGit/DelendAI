/**
 * processed-events.spec.ts — covers f00183 (AUD-CP-012)
 * idempotency store: key computation, persistence, TTL prune.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import { DEFAULT_BRANCH_POLICY } from '@mcp-vertex/commit-policy/lib/contracts/branch';
import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import {
	createCommitPolicyEngine,
	type IEngineEvent,
} from '@mcp-vertex/commit-policy/lib/engine';
import {
	computeIdempotencyKey,
	createProcessedEventsStore,
	ProcessedEventsStoreReadError,
} from '@mcp-vertex/commit-policy/lib/processed-events';

let workspace = '';

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (currentBranch: string, commits: string[]): IGitRunner => {
	let head = 'aaaaaaaa';
	let staged: string[] = [];
	let commitCount = 0;
	return (async (args: readonly string[]): Promise<IGitRunResult> => {
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return ok(`${currentBranch}\n`);
		}
		if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
			return ok(`${head}\n`);
		}
		if (args[0] === 'rev-parse' && args[1] === 'HEAD^{tree}') {
			return ok(`tree-${head}\n`);
		}
		if (
			args[0] === 'rev-parse' &&
			args[1] === '--short' &&
			args[2] === 'HEAD'
		) {
			return ok(`${head.slice(0, 7)}\n`);
		}
		if (args[0] === 'read-tree') {
			return ok('read-tree\n');
		}
		if (args[0] === 'write-tree') {
			return ok(`tree-${commitCount + 1}\n`);
		}
		if (args[0] === 'commit-tree') {
			commitCount += 1;
			head = `${commitCount}`.padStart(8, '0');
			commits.push(args.join(' '));
			return ok(`${head}\n`);
		}
		if (args[0] === 'update-ref') {
			return ok('updated-ref\n');
		}
		if (args[0] === 'commit') {
			commits.push(args.join(' '));
			commitCount += 1;
			head = `${commitCount}`.padStart(8, '0');
			staged = [];
			return ok('committed\n');
		}
		if (args[0] === 'add') {
			const marker = args.indexOf('--');
			const additions = (
				marker >= 0 ? args.slice(marker + 1) : args.slice(1)
			).filter((path) => path.length > 0);
			staged = [...new Set([...staged, ...additions])];
			return ok('added\n');
		}
		if (
			args[0] === 'diff' &&
			args[1] === '--cached' &&
			args[2] === '--name-only'
		) {
			return ok(`${staged.join('\n')}${staged.length > 0 ? '\n' : ''}`);
		}
		if (args[0] === 'reset' && args[1] === 'HEAD' && args[2] === '--') {
			staged = [];
			return ok('unstaged\n');
		}
		if (args[0] === 'status') {
			return ok('');
		}
		if (args[0] === 'push') {
			return ok('pushed\n');
		}
		if (args[0] === 'config') {
			return ok('cartago@example.com\n');
		}
		return fail(`not stubbed: ${args.join(' ')}`);
	}) as IGitRunner;
};

const basePolicy = (
	overrides: Partial<ICommitPolicyOptions> = {},
): ICommitPolicyOptions => ({
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
		// This suite does not exercise the quiet period.
		quietPeriodMs: 0,
	},
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master', 'develop'],
		...overrides.push,
	},
	...overrides,
});

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'commit-policy-idempotency-'));
	await writeFile(
		join(workspace, 'only-this.ts'),
		'export const touched = true;\n',
	);
});

afterEach(async () => {
	if (workspace.length > 0) {
		await rm(workspace, { recursive: true, force: true });
	}
});

describe('computeIdempotencyKey', () => {
	it.each<readonly [string, IEngineEvent, string]>([
		[
			'slice base case',
			{
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S3',
				files: ['x.ts'],
				eventId: 'e1',
			},
			'commit-policy:f00181:S3:e1',
		],
		[
			'slice varies by sliceId',
			{
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S4',
				files: ['x.ts'],
				eventId: 'e1',
			},
			'commit-policy:f00181:S4:e1',
		],
		[
			'slice varies by eventId',
			{
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S3',
				files: ['x.ts'],
				eventId: 'e2',
			},
			'commit-policy:f00181:S3:e2',
		],
		[
			'threshold base case',
			{
				kind: 'threshold',
				files: ['x.ts'],
				dirtyCount: 3,
				eventId: 't1',
			},
			'commit-policy:threshold:t1:3',
		],
		[
			'threshold varies by dirtyCount',
			{
				kind: 'threshold',
				files: ['x.ts'],
				dirtyCount: 4,
				eventId: 't1',
			},
			'commit-policy:threshold:t1:4',
		],
		[
			'interval base case',
			{
				kind: 'interval',
				files: ['x.ts'],
				dirtyCount: 1,
				eventId: 'i1',
			},
			'commit-policy:interval:i1:1',
		],
		[
			'interval varies by dirtyCount',
			{
				kind: 'interval',
				files: ['x.ts'],
				dirtyCount: 2,
				eventId: 'i1',
			},
			'commit-policy:interval:i1:2',
		],
		[
			'manual uses eventId',
			{
				kind: 'manual',
				message: 'feat: x',
				eventId: 'm1',
			},
			'commit-policy:manual:m1',
		],
	])('%s', (_label, event, expected) => {
		expect(computeIdempotencyKey(event)).toBe(expected);
	});

	it('is reproducible across calls', () => {
		const event: IEngineEvent = {
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S3',
			files: ['x.ts'],
			eventId: 'e1',
		};
		expect(computeIdempotencyKey(event)).toBe(computeIdempotencyKey(event));
	});
});

describe('createProcessedEventsStore', () => {
	const now = Date.now();

	it('returns false for unknown keys', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await store.has('nope')).toBe(false);
	});

	it('persists a key after add()', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		await store.add('commit-policy:f00181:S3:e1', 'abc123', now);
		expect(await store.has('commit-policy:f00181:S3:e1')).toBe(true);
	});

	it('persists to the JSONL file', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		await store.add('k1', 'sha1', now);
		const raw = await readFile(
			join(workspace, '.commit-policy/processed-events.jsonl'),
			'utf8',
		);
		expect(raw).toContain('"key":"k1"');
		expect(raw).toContain('"sha":"sha1"');
	});

	it('reloads the in-memory map from disk on next call', async () => {
		const storeA = createProcessedEventsStore({ workspaceRoot: workspace });
		await storeA.add('k1', 'sha1', now);
		// Discard the in-memory cache; a fresh instance should
		// re-hydrate from the file.
		await storeA.dispose();
		const storeB = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await storeB.has('k1')).toBe(true);
		await storeB.dispose();
	});

	it('merges concurrent writers without losing either idempotency key', async () => {
		const storeA = createProcessedEventsStore({ workspaceRoot: workspace });
		const storeB = createProcessedEventsStore({ workspaceRoot: workspace });
		await Promise.all([
			storeA.add('writer-a', 'sha-a', now),
			storeB.add('writer-b', 'sha-b', now + 1),
		]);
		const storeC = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await storeC.has('writer-a')).toBe(true);
		expect(await storeC.has('writer-b')).toBe(true);
	});

	it('reloads persisted idempotency state after a store restart', async () => {
		const first = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await first.has('restart-event')).toBe(false);
		await first.add('restart-event', 'sha-restart', now);
		await first.dispose();

		const restarted = createProcessedEventsStore({
			workspaceRoot: workspace,
		});
		expect(await restarted.has('restart-event')).toBe(true);
		await restarted.dispose();
	});

	it('prune() removes entries older than ttlMs', async () => {
		const store = createProcessedEventsStore({
			workspaceRoot: workspace,
			ttlMs: 1_000,
		});
		await store.add('old', 'sha1', now);
		const removed = await store.prune(now + 2_000);
		expect(removed).toBe(1);
		expect(await store.has('old')).toBe(false);
		await store.add('new', 'sha2', now + 2_000);
		expect(await store.has('new')).toBe(true);
		await store.dispose();
	});

	it('rejects corrupt JSONL instead of treating it as an empty store', async () => {
		const path = '.commit-policy/processed-events.jsonl';
		await mkdir(join(workspace, '.commit-policy'), { recursive: true });
		await writeFile(join(workspace, path), '{not-json}\n');
		const store = createProcessedEventsStore({ workspaceRoot: workspace });

		await expect(store.has('any-key')).rejects.toBeInstanceOf(
			ProcessedEventsStoreReadError,
		);
	});

	it('rejects non-ENOENT read errors', async () => {
		const path = '.commit-policy/processed-events.jsonl';
		await mkdir(join(workspace, path), { recursive: true });
		const store = createProcessedEventsStore({ workspaceRoot: workspace });

		await expect(store.has('any-key')).rejects.toBeInstanceOf(
			ProcessedEventsStoreReadError,
		);
	});

	it('replays the same persisted event as already processed after an engine restart', async () => {
		const commits: string[] = [];
		const runner = buildRunner('feature/x', commits);
		const event: IEngineEvent = {
			kind: 'manual',
			message: 'feat: persist replay marker',
			files: ['only-this.ts'],
			eventId: 'persisted-replay-1',
		};

		const firstEngine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: createProcessedEventsStore({
				workspaceRoot: workspace,
			}),
		});

		expect(await firstEngine.handle(event)).toMatchObject({
			ack: 'OK',
			commitCreated: true,
		});
		await firstEngine.dispose();

		const restartedEngine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: createProcessedEventsStore({
				workspaceRoot: workspace,
			}),
		});

		const replay = await restartedEngine.handle(event);
		expect(replay).toEqual({
			ack: 'ALREADY_PROCESSED',
			key: computeIdempotencyKey(event),
		});
		expect(commits).toHaveLength(1);
		await restartedEngine.dispose();
	});

	it('serializes three concurrent handles on one engine for the same event into one commit', async () => {
		const commits: string[] = [];
		const runner = buildRunner('feature/x', commits);
		const event: IEngineEvent = {
			kind: 'manual',
			message: 'feat: race replay guard',
			files: ['only-this.ts'],
			eventId: 'race-1',
		};
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: createProcessedEventsStore({
				workspaceRoot: workspace,
			}),
		});

		const results = await Promise.all(
			Array.from({ length: 3 }, () => engine.handle(event)),
		);
		const committed = results.filter(
			(result) => result.ack === 'OK' && result.commitCreated,
		);
		const replayed = results.filter(
			(result) => result.ack === 'ALREADY_PROCESSED',
		);

		expect(committed).toHaveLength(1);
		expect(replayed).toHaveLength(2);
		expect(commits).toHaveLength(1);
		await engine.dispose();
	});
});
