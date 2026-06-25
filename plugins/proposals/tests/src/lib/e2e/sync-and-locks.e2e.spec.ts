/**
 * End-to-end: `sync_proposals` + `agent_lock` + `agent_worktree` +
 * `task_queue` over the real MCP protocol.
 *
 * Slice S4 of f00044. Drives the swarm-coordination tool surface
 * through a real `Client` connected to an assembled mcp-vertex server
 * over an in-memory transport. The `agent_lock` engine keys ownership
 * on the `agent` ARGUMENT (not the client connection), so a single
 * client driving two distinct `agent` values reproduces the two-agent
 * contention scenario without spawning a second transport.
 *
 * Scope notes:
 * - `await_lock` lives in the notification plugin (`notification_await_lock`),
 *   not loaded in this proposals-only harness, so the blocking
 *   acquire/resolve cycle is out of scope here.
 * - `task_queue subscribe` is a timing-dependent stream; this slice
 *   covers the deterministic `enqueue` + idempotency + `report`
 *   surface, which is what the cross-tool contract depends on.
 *
 * Every `it` runs against a fresh `mkdtempSync` workspace; the
 * `agent_worktree` test initialises a throwaway local git repo (no
 * remote — the safety invariant the slice pins).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

interface LockOutput {
	readonly action?: string;
	readonly claimed?: boolean;
	readonly blocked?: boolean;
	readonly blockerType?: string;
	readonly blocked_reason?: string;
	readonly conflicting_task?: string;
	readonly overlapping_files?: readonly string[];
	readonly removed?: number;
	readonly in_flight?: ReadonlyArray<{
		readonly task_id: string;
		readonly agent: string;
		readonly ownership: readonly string[];
	}>;
}

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

describe('e2e: sync_proposals + agent_lock + agent_worktree + task_queue', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('agent_lock claim records ownership; a conflicting claim is rejected; release frees it', async () => {
		const files = ['src/a.ts', 'src/b.ts'];
		const claim = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{ action: 'claim', task_id: 'task-A', agent: 'agent-A', files },
		);
		expect(claim.ok).toBe(true);
		expect(claim.structured.blocked).not.toBe(true);

		// Status reflects agent-A owning both files.
		const status = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{ action: 'status' },
		);
		const entryA = (status.structured.in_flight ?? []).find(
			(e) => e.task_id === 'task-A',
		);
		expect(entryA?.agent).toBe('agent-A');
		expect([...(entryA?.ownership ?? [])].sort()).toEqual(
			[...files].sort(),
		);

		// agent-B claiming an overlapping file is blocked, naming the
		// conflicting task and the overlapping file.
		const conflict = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{
				action: 'claim',
				task_id: 'task-B',
				agent: 'agent-B',
				files: ['src/a.ts'],
				onContention: 'fail',
			},
		);
		expect(conflict.structured.blocked).toBe(true);
		expect(conflict.structured.conflicting_task).toBe('task-A');
		expect(conflict.structured.overlapping_files).toContain('src/a.ts');

		// agent-A releases; the files leave the in-flight set.
		const release = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{ action: 'release', task_id: 'task-A', agent: 'agent-A' },
		);
		expect(release.ok).toBe(true);
		const after = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{ action: 'status' },
		);
		expect(
			(after.structured.in_flight ?? []).some(
				(e) => e.task_id === 'task-A',
			),
		).toBe(false);
	});

	it('sync_proposals picks up a freshly dropped proposal into the index', async () => {
		const before = await harness.callTool<{ count: number }>(
			'proposals_sync_proposals',
			{},
		);
		const baseline = before.structured.count;

		const dir = join(harness.workspace, PROPOSALS_RELDIR, 'ready');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'f07777-freshly-dropped.md'),
			`---
id: f07777
status: ready
type: proposal
track: plugins/proposals+tests
date: 2026-06-22
kind: feat
title: freshly dropped
---

# f07777 — freshly dropped

## goal

Seed for the sync e2e.
`,
			'utf8',
		);

		const after = await harness.callTool<{
			count: number;
			errors: unknown[];
		}>('proposals_sync_proposals', {});
		expect(after.ok).toBe(true);
		expect(after.structured.errors).toEqual([]);
		expect(after.structured.count).toBe(baseline + 1);
	});

	it('agent_worktree create returns a clean worktree with no origin remote (host enabled)', async () => {
		// f00052: the capability is off by default, so this test runs against
		// a harness that opted in via `--agent-worktree=true`.
		const enabled = await createAssembledProposalsServer({
			enableAgentWorktree: true,
		});
		try {
			// agent_worktree shells out to real git, so the workspace must be a
			// git repo with at least one commit. No remote is ever added — the
			// safety invariant is that commit-and-push could not reach the wire.
			const ws = enabled.workspace;
			git(ws, 'init', '-q');
			git(ws, 'config', 'user.email', 'e2e@example.com');
			git(ws, 'config', 'user.name', 'e2e');
			git(ws, 'config', 'commit.gpgsign', 'false');
			writeFileSync(join(ws, 'README.md'), '# e2e\n');
			git(ws, 'add', '.');
			git(ws, 'commit', '-q', '-m', 'initial');

			const res = await enabled.callTool<{
				ok: boolean;
				action: string;
				path?: string;
				created?: boolean;
			}>('proposals_agent_worktree', {
				action: 'create',
				agent: 'agent-A',
				base_branch: 'HEAD',
			});
			expect(res.ok).toBe(true);
			expect(res.structured.ok).toBe(true);
			expect(res.structured.path).toBeDefined();
			const wtPath = res.structured.path as string;
			expect(wtPath).toBe(
				join(ws, '.cache', 'mcp-vertex', '.worktrees', 'agent-a'),
			);
			expect(existsSync(wtPath)).toBe(true);

			// Clean working tree and — critically — no origin remote.
			expect(git(wtPath, 'status', '--porcelain').trim()).toBe('');
			expect(git(wtPath, 'remote', '-v').trim()).toBe('');
		} finally {
			await enabled.close();
		}
	});

	it('agent_worktree is disabled by default and returns the documented error (host not enabled)', async () => {
		// f00052: the default harness does NOT enable the capability, so the
		// tool stays registered but refuses with a structured ok:false error
		// and never shells out to git.
		const res = await harness.callTool<{
			ok: boolean;
			action: string;
			reason?: string;
		}>('proposals_agent_worktree', { action: 'create', agent: 'agent-A' });
		expect(res.ok).toBe(false);
		expect(res.structured.ok).toBe(false);
		expect(res.structured.action).toBe('create');
		expect(res.structured.reason).toBe(
			'agent_worktree is disabled by host configuration. Pass --agent-worktree=true (CLI) or set agentWorktree: true in mcp-vertex.config.json to enable.',
		);
	});

	it('task_queue enqueue returns queued; re-enqueueing the same taskId is idempotent', async () => {
		const enqueue = await harness.callTool<{
			taskId?: string;
			status?: string;
		}>('proposals_task_queue', {
			action: 'enqueue',
			params: {
				taskId: 'follow-up-1',
				agentName: 'agent-A',
				agentSlot: 'orchestrator',
				files: ['src/a.ts'],
			},
		});
		expect(enqueue.ok).toBe(true);
		expect(enqueue.structured.taskId).toBe('follow-up-1');
		expect(enqueue.structured.status).toBe('queued');

		// Idempotency: the same taskId enqueued again resolves to the same
		// task, not a duplicate.
		const again = await harness.callTool<{
			taskId?: string;
			status?: string;
		}>('proposals_task_queue', {
			action: 'enqueue',
			params: {
				taskId: 'follow-up-1',
				agentName: 'agent-A',
				agentSlot: 'orchestrator',
				files: ['src/a.ts'],
			},
		});
		expect(again.structured.taskId).toBe('follow-up-1');

		// report exposes the queue stats over the wire.
		const report = await harness.callTool<{ queuedCount?: number }>(
			'proposals_task_queue',
			{ action: 'report', params: {} },
		);
		expect(report.ok).toBe(true);
	});

	it('a successful lock claim satisfies the outputSchema parity invariant', async () => {
		const claim = await harness.callTool<LockOutput>(
			'proposals_agent_lock',
			{
				action: 'claim',
				task_id: 'task-P',
				agent: 'agent-P',
				files: ['src/p.ts'],
			},
		);
		// Success envelopes have exact text/structured parity (no logHint).
		expect(claim.text).toBe(JSON.stringify(claim.structured));
	});
});
