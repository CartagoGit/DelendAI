/**
 * Unit specs for `runAgentLockEngine` (t00001 S1 / audit H2).
 *
 * The 412-line lock engine had no direct unit coverage — only the
 * f00044 e2e exercised it over the wire. These specs drive it directly
 * against a throwaway lock file (injected `deps.lockPath`, the
 * Dependency-Inversion seam), covering claim / refresh / conflict /
 * release / status / stale-GC / invalid-input without a server.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	claimWithFileLocks,
	getAgentLockSessionBalance,
	releaseAgentSessionClaims,
	resetAgentLockSessionBalance,
	runAgentLockEngine,
	type IAgentLockArgs,
	type IAgentLockDeps,
	type ILockFile,
} from '../../../../src/lib/locks/agent-lock-engine';
import { runAgentLockEngine as runAgentLockEngineFromPublic } from '../../../../src/lib/locks/public';
import { RELEASE_AUDIT_LOG_RELATIVE_PATH } from '../../../../src/lib/contracts/constants/agents-lock.constants';
import {
	readSessionBalance,
	sessionLogPath,
} from '../../../../src/lib/locks/agent-lock-session-store';
import {
	deriveFileLockTablePath,
	readFileLockTable,
} from '../../../../src/lib/locks/file-lock-table';

let workspace = '';
let lockPath = '';

const deps = (over: Partial<IAgentLockDeps> = {}): IAgentLockDeps => ({
	lockPath,
	toolName: 'proposals_agent_lock',
	lockFileLabel: '.cache/agents.lock.json',
	...over,
});

const run = (args: IAgentLockArgs, over: Partial<IAgentLockDeps> = {}) =>
	runAgentLockEngine(args, deps(over));

const body = (res: { content: Array<{ text: string }> }) =>
	JSON.parse(res.content[0]?.text ?? '{}');

const readLockFile = (): ILockFile =>
	JSON.parse(readFileSync(lockPath, 'utf8')) as ILockFile;

const readSessionLog = (): string =>
	readFileSync(sessionLogPath(workspace), 'utf8');

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), 'agent-lock-'));
	lockPath = join(workspace, 'agents.lock.json');
	resetAgentLockSessionBalance();
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe('agent lock public surface', async () => {
	it('re-exports the lock engine from the explicit public entrypoint', async () => {
		const result = await runAgentLockEngineFromPublic(
			{
				action: 'claim',
				task_id: 'task-public',
				agent: 'agent-public',
				files: ['src/public.ts'],
			},
			deps(),
		);
		expect(body(result).claimed).toBe(true);
	});
});

describe('runAgentLockEngine — claim', async () => {
	it('requires an injected lock path instead of guessing the workspace', async () => {
		await expect(
			runAgentLockEngine({
				action: 'claim',
				task_id: 'task-A',
				agent: 'agent-A',
				files: ['src/a.ts'],
			}),
		).rejects.toThrow('deps.lockPath is required');
	});

	it('records a new claim with its file ownership', async () => {
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts', 'src/b.ts'],
		});
		expect(res.isError).not.toBe(true);
		expect(body(res).ok).toBe(true);
		expect(body(res).blocked).not.toBe(true);
		const lock = readLockFile();
		const entry = lock.in_flight.find((e) => e.task_id === 'task-A');
		expect(entry?.agent).toBe('agent-A');
		expect([...(entry?.ownership ?? [])].sort()).toEqual([
			'src/a.ts',
			'src/b.ts',
		]);
	});

	it('refreshes (not duplicates) a re-claim of the same task_id', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		expect(body(res).refreshed).toBe(true);
		expect(
			readLockFile().in_flight.filter((e) => e.task_id === 'task-A'),
		).toHaveLength(1);
	});

	it('adds conflict-free new files on a re-claim (no silent drop)', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts', 'src/b.ts'],
		});
		expect(body(res).refreshed).toBe(true);
		expect(body(res).added_files).toEqual(['src/b.ts']);
		const entry = readLockFile().in_flight.find(
			(e) => e.task_id === 'task-A',
		);
		expect([...(entry?.ownership ?? [])].sort()).toEqual([
			'src/a.ts',
			'src/b.ts',
		]);
	});

	it('surfaces (does not grant) re-claim files owned by another task', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		await run({
			action: 'claim',
			task_id: 'task-B',
			agent: 'agent-B',
			files: ['src/b.ts'],
		});
		// task-A re-claims and tries to grab task-B's file: heartbeat still
		// succeeds, but the contested file is reported, not swallowed.
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts', 'src/b.ts'],
		});
		expect(body(res).refreshed).toBe(true);
		expect(body(res).ok).toBe(false);
		expect(body(res).not_granted).toEqual([
			{ file: 'src/b.ts', conflicting_task: 'task-B' },
		]);
		const entry = readLockFile().in_flight.find(
			(e) => e.task_id === 'task-A',
		);
		expect(entry?.ownership).toEqual(['src/a.ts']);
	});

	it('blocks a claim whose files overlap another live task', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({
			action: 'claim',
			task_id: 'task-B',
			agent: 'agent-B',
			files: ['src/a.ts', 'src/c.ts'],
		});
		const out = body(res);
		expect(out.blocked).toBe(true);
		expect(out.ok).toBe(false);
		expect(out.blockerType).toBe('lock-conflict');
		expect(out.conflicting_task).toBe('task-A');
		expect(out.overlapping_files).toEqual(['src/a.ts']);
		expect(out.nextAction).toContain('notification_await_lock');
		// The blocked claim must NOT be persisted.
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'task-B'),
		).toBe(false);
	});

	it('rejects an invalid claim (missing files) as a structured error', async () => {
		const res = await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
		});
		expect(res.isError).toBe(true);
		expect(body(res).blockerType).toBe('invalid-input');
	});
});

describe('runAgentLockEngine — release / status', async () => {
	it('session cleanup releases only claims owned by the closing host process', async () => {
		await run(
			{
				action: 'claim',
				task_id: 'owned-task',
				agent: 'agent-A',
				files: ['src/owned.ts'],
			},
			{ nowHostId: () => ({ host: 'host-a', pid: 100 }) },
		);
		await run(
			{
				action: 'claim',
				task_id: 'other-task',
				agent: 'agent-B',
				files: ['src/other.ts'],
			},
			{ nowHostId: () => ({ host: 'host-b', pid: 200 }) },
		);

		const result = await releaseAgentSessionClaims({
			lockPath,
			nowHostId: () => ({ host: 'host-a', pid: 100 }),
		});

		expect(result.releasedTaskIds).toEqual(['owned-task']);
		expect(readLockFile().in_flight.map((entry) => entry.task_id)).toEqual([
			'other-task',
		]);
	});

	it('heartbeat refreshes a long-running claim without changing ownership', async () => {
		await run(
			{
				action: 'claim',
				task_id: 'task-A',
				agent: 'agent-A',
				files: ['src/a.ts'],
			},
			{ now: () => '2026-08-31T00:00:00.000Z' },
		);
		const before = readLockFile().in_flight[0];
		const result = await run(
			{
				action: 'heartbeat',
				task_id: 'task-A',
				agent: 'agent-A',
			},
			{ now: () => '2026-08-31T00:05:00.000Z' },
		);
		const after = readLockFile().in_flight[0];

		expect(body(result)).toMatchObject({
			ok: true,
			refreshed: true,
			action: 'heartbeat',
		});
		expect(after?.ownership).toEqual(before?.ownership);
		expect(after?.last_seen).toBe('2026-08-31T00:05:00.000Z');
	});

	it('heartbeat rejects a different agent and an unknown task', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const mismatch = await run({
			action: 'heartbeat',
			task_id: 'task-A',
			agent: 'agent-B',
		});
		const missing = await run({
			action: 'heartbeat',
			task_id: 'missing',
			agent: 'agent-A',
		});

		expect(mismatch.isError).toBe(true);
		expect(body(mismatch).blockerType).toBe('invalid-input');
		expect(missing.isError).toBe(true);
		expect(body(missing).blockerType).toBe('invalid-input');
	});

	it('release removes the task from the in-flight set', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		await run({ action: 'release', task_id: 'task-A' });
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'task-A'),
		).toBe(false);
	});

	it('status reports the current in-flight claims', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts'],
		});
		const res = await run({ action: 'status' });
		const out = body(res);
		const inFlight = (out.in_flight ?? []) as Array<{ task_id: string }>;
		expect(inFlight.some((e) => e.task_id === 'task-A')).toBe(true);
	});
});

describe('runAgentLockEngine — stale GC', async () => {
	it('drops a claim older than stale_after_minutes on the next read', async () => {
		// Claim "10 minutes ago"; the default stale window evicts it.
		const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		await run(
			{
				action: 'claim',
				task_id: 'old-task',
				agent: 'agent-A',
				files: ['src/a.ts'],
			},
			{ now: () => past },
		);
		// A fresh status read removes the stale entry (removeStale).
		const res = await run({ action: 'status' });
		const inFlight = (body(res).in_flight ?? []) as Array<{
			task_id: string;
		}>;
		expect(inFlight.some((e) => e.task_id === 'old-task')).toBe(false);
	});

	// t00002 S1: error/edge branches that only the wire e2e touched.
	describe('validation and needs-worktree branches', () => {
		it('claim without files[] is an invalid-input error', async () => {
			const res = await run({
				action: 'claim',
				task_id: 't1',
				agent: 'a1',
			} as IAgentLockArgs);
			expect(res.isError).toBe(true);
			expect(body(res).blockerType).toBe('invalid-input');
		});

		it('release without task_id is an invalid-input error', async () => {
			const res = await run({ action: 'release' } as IAgentLockArgs);
			expect(res.isError).toBe(true);
			expect(body(res).blockerType).toBe('invalid-input');
		});

		it('unknown action falls through to the unreachable guard', async () => {
			const res = await run({ action: 'bogus' } as never);
			expect(res.isError).toBe(true);
			expect(body(res).error).toBe('unreachable');
		});

		it('claim with the worktree gate on refuses a non-agent branch', async () => {
			const res = await run(
				{
					action: 'claim',
					task_id: 't1',
					agent: 'a1',
					files: ['src/a.ts'],
				},
				{
					agentWorktreeEnabled: true,
					currentBranchOverride: 'develop',
				},
			);
			expect(res.isError).toBe(true);
			expect(body(res).blockerType).toBe('needs-worktree');
		});

		it('claim with the gate on succeeds from an agent/<name> branch', async () => {
			const res = await run(
				{
					action: 'claim',
					task_id: 't1',
					agent: 'a1',
					files: ['src/a.ts'],
				},
				{
					agentWorktreeEnabled: true,
					currentBranchOverride: 'agent/a1',
				},
			);
			expect(res.isError).not.toBe(true);
			expect(readLockFile().in_flight).toHaveLength(1);
		});

		it('gate on + unreadable branch (no git repo) refuses with needs-worktree', async () => {
			// The lock lives in a plain temp dir — `git rev-parse` fails, the
			// engine resolves the branch to null and refuses the claim.
			const res = await run(
				{
					action: 'claim',
					task_id: 't1',
					agent: 'a1',
					files: ['src/a.ts'],
				},
				{ agentWorktreeEnabled: true },
			);
			expect(res.isError).toBe(true);
			expect(body(res).blockerType).toBe('needs-worktree');
			expect(body(res).summary).toContain('unreadable');
		});

		it('gate on + a REAL git branch is read via rev-parse (success path)', async () => {
			// Init a real repo around the lock file so the execFile success
			// branch runs; `main` is not an agent/ branch, so the claim is
			// refused with the branch echoed back.
			execSync(
				'git init -q -b main && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m x',
				{ cwd: workspace },
			);
			const res = await run(
				{
					action: 'claim',
					task_id: 't1',
					agent: 'a1',
					files: ['src/a.ts'],
				},
				{ agentWorktreeEnabled: true },
			);
			expect(res.isError).toBe(true);
			expect(body(res).blockerType).toBe('needs-worktree');
			expect(JSON.stringify(body(res))).toContain('main');
		});
	});
});

describe('runAgentLockEngine — file-level claims', async () => {
	it('lets disjoint file claims succeed without reporting contention', async () => {
		const started = Date.now();
		const [first, second] = await Promise.all([
			claimWithFileLocks(
				{
					taskId: 'task-A',
					agentId: 'agent-A',
					files: ['src/a.ts'],
				},
				deps({
					mutexTimeoutMs: 500,
					mutexStaleMs: 5_000,
					mutexPollMs: 5,
				}),
			),
			claimWithFileLocks(
				{
					taskId: 'task-B',
					agentId: 'agent-B',
					files: ['src/b.ts'],
				},
				deps({
					mutexTimeoutMs: 500,
					mutexStaleMs: 5_000,
					mutexPollMs: 5,
				}),
			),
		]);
		expect(body(first).ok).toBe(true);
		expect(body(second).ok).toBe(true);
		expect(body(first).heldFiles).toEqual(['src/a.ts']);
		expect(body(second).heldFiles).toEqual(['src/b.ts']);
		expect(Date.now() - started).toBeLessThan(700);
	});

	it('keeps overlapping file claims in normal contention', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/shared.ts'],
		});
		const res = await claimWithFileLocks(
			{
				taskId: 'task-B',
				agentId: 'agent-B',
				files: ['src/shared.ts'],
			},
			deps(),
		);
		expect(body(res).ok).toBe(false);
		expect(body(res).blocked).toBe(true);
		expect(body(res).overlapping_files).toEqual(['src/shared.ts']);
	});

	it('release also clears the file-lock table entries it held', async () => {
		await run({
			action: 'claim',
			task_id: 'task-A',
			agent: 'agent-A',
			files: ['src/a.ts', 'src/b.ts'],
		});
		await run({ action: 'release', task_id: 'task-A' });
		const table = await readFileLockTable({
			tablePath: deriveFileLockTablePath(lockPath),
		});
		expect(table).toEqual({});
	});
});

// x00163 regression — every existing fixture in this file puts
// `agents.lock.json` either directly in the workspace or one level
// under `.cache/`, neither of which exercises the REAL production
// shape (`<root>/.cache/delendai/agents.lock.json`, an extra
// `delendai` segment from the plugin cache dir). That real shape
// made `resolveSessionWorkspaceRoot` return the CACHE DIR itself
// instead of the workspace root, and `sessionLogPath` then re-joined
// `.cache/delendai` onto it a second time — confirmed live: this
// exact doubly-nested path
// (`.cache/delendai/.cache/delendai/agents.lock.session.jsonl`)
// existed on disk in this very repo's own `.cache/`.
describe('runAgentLockEngine — session log path with the real .cache/delendai/ shape (x00163)', () => {
	it('writes the session log under <root>/.cache/delendai/, not doubly nested', async () => {
		const realLockPath = join(
			workspace,
			'.cache',
			'delendai',
			'agents.lock.json',
		);
		await run(
			{
				action: 'claim',
				task_id: 'task-x163',
				agent: 'agent-x163',
				files: ['src/x163.ts'],
			},
			{ lockPath: realLockPath },
		);
		const expectedSessionPath = sessionLogPath(workspace);
		expect(expectedSessionPath).toBe(
			join(workspace, '.cache/delendai', 'agents.lock.session.jsonl'),
		);
		expect(readFileSync(expectedSessionPath, 'utf8').trim()).not.toBe('');
		// The bug's exact symptom: a doubly-nested path must NOT exist.
		const doublyNested = join(
			workspace,
			'.cache',
			'delendai',
			'.cache',
			'delendai',
			'agents.lock.session.jsonl',
		);
		expect(() => readFileSync(doublyNested, 'utf8')).toThrow();
	});
});

describe('runAgentLockEngine — a00069 S8 ok + session balance', async () => {
	it('stamps ok:true + session on successful claim and release', async () => {
		const claim = body(
			await run({
				action: 'claim',
				task_id: 'task-S8',
				agent: 'agent-S8',
				files: ['src/s8.ts'],
			}),
		);
		expect(claim.ok).toBe(true);
		expect(claim.session).toEqual({ claims: 1, releases: 0, imbalance: 1 });
		expect(await getAgentLockSessionBalance()).toEqual({
			claims: 1,
			releases: 0,
			imbalance: 1,
		});
		expect(readSessionLog().trim().split('\n')).toHaveLength(1);

		const release = body(
			await run({ action: 'release', task_id: 'task-S8' }),
		);
		expect(release.ok).toBe(true);
		expect(release.released).toBe(true);
		expect(release.session).toEqual({
			claims: 1,
			releases: 1,
			imbalance: 0,
		});
		expect(readSessionLog().trim().split('\n')).toHaveLength(2);
	});

	it('stamps ok:false + await_lock nextAction on lock-conflict', async () => {
		await run({
			action: 'claim',
			task_id: 'holder',
			agent: 'a1',
			files: ['src/shared.ts'],
		});
		const out = body(
			await run({
				action: 'claim',
				task_id: 'waiter',
				agent: 'a2',
				files: ['src/shared.ts'],
			}),
		);
		expect(out.ok).toBe(false);
		expect(out.blocked).toBe(true);
		expect(out.nextAction).toContain('notification_await_lock');
		expect(typeof out.session?.claims).toBe('number');
	});

	it('stamps ok:false on invalid-input', async () => {
		const res = await run({
			action: 'claim',
			task_id: 'x',
			agent: 'y',
		});
		expect(res.isError).toBe(true);
		const out = body(res);
		expect(out.ok).toBe(false);
		expect(out.session).toBeDefined();
	});

	it('does not count claim on lock-conflict (imbalance stays from prior success)', async () => {
		await run({
			action: 'claim',
			task_id: 'h',
			agent: 'a',
			files: ['src/a.ts'],
		});
		await run({
			action: 'claim',
			task_id: 'w',
			agent: 'b',
			files: ['src/a.ts'],
		});
		expect((await getAgentLockSessionBalance()).claims).toBe(1);
		expect((await getAgentLockSessionBalance()).imbalance).toBe(1);
	});

	it('survives a simulated restart because the balance is persisted', async () => {
		await run({
			action: 'claim',
			task_id: 'persisted',
			agent: 'agent-persisted',
			files: ['src/persisted.ts'],
		});
		resetAgentLockSessionBalance();
		expect(await getAgentLockSessionBalance()).toEqual({
			claims: 1,
			releases: 0,
			imbalance: 1,
		});
	});

	it('serializes concurrent successful claims into two JSONL entries', async () => {
		await Promise.all([
			run({
				action: 'claim',
				task_id: 'task-concurrent-a',
				agent: 'agent-a',
				files: ['src/a.ts'],
			}),
			run({
				action: 'claim',
				task_id: 'task-concurrent-b',
				agent: 'agent-b',
				files: ['src/b.ts'],
			}),
		]);
		expect(readSessionLog().trim().split('\n')).toHaveLength(2);
		expect(await readSessionBalance(workspace)).toEqual({
			claims: 2,
			releases: 0,
			imbalance: 2,
		});
	});
});

// x00155 S2 / x00153 S5 — cross-process release. The test cluster
// drives `agent_lock` with an injected `nowHostId` so we can simulate
// the "host restart: same agent name, different pid" scenario that
// used to return `released: false` and hang the notification
// plugin's `await_lock`.
describe('runAgentLockEngine — cross-process release (x00155 S2)', async () => {
	const readReleaseAudit = (): Array<Record<string, unknown>> => {
		const auditPath = join(workspace, RELEASE_AUDIT_LOG_RELATIVE_PATH);
		try {
			const text = readFileSync(auditPath, 'utf8');
			return text
				.split('\n')
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line) as Record<string, unknown>);
		} catch {
			return [];
		}
	};

	const fakeHost = (pid: number) => (): { host: string; pid: number } => ({
		host: 'test-host',
		pid,
	});

	it('release after host restart takes ownership and releases', async () => {
		// Original process claims with pid 100.
		await run(
			{
				action: 'claim',
				task_id: 'restart-task',
				agent: 'vscode-copilot-m3',
				files: ['src/restart.ts'],
			},
			{ nowHostId: fakeHost(100) },
		);
		const claimed = readLockFile().in_flight.find(
			(e) => e.task_id === 'restart-task',
		);
		expect(claimed?.pid).toBe(100);
		expect(claimed?.host).toBe('test-host');

		// New process (pid 200) inherits the lock and releases. The
		// release is treated as a "host-restart cleanup" because the
		// recorded pid no longer matches the live caller.
		const res = await run(
			{ action: 'release', task_id: 'restart-task' },
			{ nowHostId: fakeHost(200) },
		);
		const out = body(res);
		expect(out.released).toBe(true);
		expect(out.removed).toBe(1);
		expect(out.cross_process_release).toBe(true);
		expect(out.original_pid).toBe(100);
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'restart-task'),
		).toBe(false);

		// Audit line was written with the recorded (host, pid) and
		// the releasing (host, pid) plus the canonical reason.
		const audit = readReleaseAudit();
		expect(audit).toHaveLength(1);
		const line = audit[0]!;
		expect(line).toMatchObject({
			task_id: 'restart-task',
			agent: 'vscode-copilot-m3',
			originalHost: 'test-host',
			originalPid: 100,
			releasingHost: 'test-host',
			releasingPid: 200,
			reason: 'cross-process release',
		});
		expect(typeof line.ts).toBe('string');
	});

	it('cross-process release without matching agent name is refused', async () => {
		// Original process claims with agent A and pid 100.
		await run(
			{
				action: 'claim',
				task_id: 'mismatch-task',
				agent: 'agent-A',
				files: ['src/mismatch.ts'],
			},
			{ nowHostId: fakeHost(100) },
		);

		// New process (pid 200) calls release but identifies itself
		// as a DIFFERENT agent. The agent-name check is the
		// stable identity across process restarts, so the release
		// is refused even though the file lock could technically be
		// removed.
		const res = await run(
			{
				action: 'release',
				task_id: 'mismatch-task',
				agent: 'agent-B',
			},
			{ nowHostId: fakeHost(200) },
		);
		expect(res.isError).toBe(true);
		const out = body(res);
		expect(out.blockerType).toBe('invalid-input');
		expect(out.error).toContain('agent-A');
		expect(out.error).toContain('agent-B');
		// The entry is NOT removed; the lock survives.
		const stillThere = readLockFile().in_flight.find(
			(e) => e.task_id === 'mismatch-task',
		);
		expect(stillThere?.agent).toBe('agent-A');
		// And no audit line is written for a refused release.
		expect(readReleaseAudit()).toEqual([]);
	});

	it('release from the same pid is NOT flagged as cross-process', async () => {
		// Same process, same pid — the release is a normal release.
		await run(
			{
				action: 'claim',
				task_id: 'same-pid-task',
				agent: 'agent-A',
				files: ['src/same-pid.ts'],
			},
			{ nowHostId: fakeHost(100) },
		);
		const res = await run(
			{ action: 'release', task_id: 'same-pid-task' },
			{ nowHostId: fakeHost(100) },
		);
		const out = body(res);
		expect(out.released).toBe(true);
		expect(out.cross_process_release).not.toBe(true);
		expect(out.original_pid).toBeUndefined();
		// No audit line for a normal release.
		expect(readReleaseAudit()).toEqual([]);
	});

	it('release of an entry that pre-dates host/pid tracking is allowed', async () => {
		// Manually write a lock file with an entry that has no
		// host/pid (the pre-S5 shape). The release must succeed
		// without an audit line — the entry predates the tracking
		// and the caller's choice is respected.
		const legacyLock: ILockFile = {
			version: 1,
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'legacy-task',
					agent: 'agent-legacy',
					ownership: ['src/legacy.ts'],
					started_at: '2026-01-01T00:00:00.000Z',
					last_seen: '2026-01-01T00:00:00.000Z',
				},
			],
		};
		// Avoid stale-GC eviction by writing a fresh last_seen.
		legacyLock.in_flight[0]!.last_seen = new Date().toISOString();
		writeFileSync(lockPath, JSON.stringify(legacyLock, null, '\t'));

		const res = await run(
			{ action: 'release', task_id: 'legacy-task' },
			{ nowHostId: fakeHost(process.pid + 1) },
		);
		const out = body(res);
		expect(out.released).toBe(true);
		expect(out.cross_process_release).not.toBe(true);
		expect(
			readLockFile().in_flight.some((e) => e.task_id === 'legacy-task'),
		).toBe(false);
		// No audit line: the entry was missing host/pid so the engine
		// did not detect a "real" cross-process case.
		expect(readReleaseAudit()).toEqual([]);
	});

	it('claim stamps host/pid on the new in_flight entry', async () => {
		await run(
			{
				action: 'claim',
				task_id: 'stamp-task',
				agent: 'agent-stamp',
				files: ['src/stamp.ts'],
			},
			{ nowHostId: fakeHost(7777) },
		);
		const entry = readLockFile().in_flight.find(
			(e) => e.task_id === 'stamp-task',
		);
		expect(entry?.pid).toBe(7777);
		expect(entry?.host).toBe('test-host');
	});
});
