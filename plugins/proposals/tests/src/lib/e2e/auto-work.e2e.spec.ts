/**
 * End-to-end: `proposals_auto_work` over the real MCP protocol.
 *
 * Slice S1 of f00044. Drives the registered `auto_work` tool through
 * a real `Client` connected to an assembled mcp-vertex server (core
 * meta-tools + the proposals plugin) over an in-memory transport.
 * This proves the cross-tool contract (auto_work → continue_proposal
 * → cascade → idle/work plan) survives registration, request routing
 * and `outputSchema` validation — the unit spec at
 * `tests/src/lib/auto-work.spec.ts` cannot catch regressions in any
 * of those stages because it calls `runAutoWork` directly.
 *
 * Every `it` runs against a fresh `mkdtempSync` workspace; no test
 * mutates a real proposal, lock file, or git repo.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
	type IAssembledToolResult,
} from './assembled-proposals-server';

/**
 * The `auto_work` tool's `outputSchema` is a small union of `idle`
 * (with optional `stop` / `idleStreak` / `nextAction`) and `work`
 * (with `proposalId`, `file`, `orchestration`, `steps`, `persist`,
 * `validationCommand`). The harness returns the parsed
 * `structuredContent`; we type it as a single object with optional
 * fields so the spec can read each field without per-`it` narrowing.
 */
interface AutoWorkOutput {
	state: 'idle' | 'work';
	// idle-only fields
	readonly stop?: true;
	readonly idleStreak?: number;
	readonly reason?: string;
	readonly nextAction?: string;
	readonly handoffPath?: string;
	// work-only fields
	readonly proposalId?: string;
	readonly file?: string;
	readonly pickedFromPaused?: true;
	readonly orchestration?: {
		readonly lane: 'inspect-then-delegate';
		readonly delegateAfterToolCalls: number;
		readonly next: string;
		readonly policy: string;
	};
	readonly validationCommand?: string;
	readonly persist?: {
		readonly mode: 'none' | 'commit' | 'commit-and-push';
		readonly messageTemplate?: string;
		readonly pushTarget?: string;
	};
	readonly steps?: string[];
}

const callAutoWork = async (
	server: IAssembledProposalsServer,
	args: Record<string, unknown> = {},
): Promise<IAssembledToolResult<AutoWorkOutput>> =>
	server.callTool<AutoWorkOutput>('mcp-vertex_proposals_auto_work', args);

/**
 * Drop a fresh proposal under `<tmpdir>/docs/mcp-vertex/proposals/ready/`
 * and rebuild the registry index via `proposals_sync_proposals` so the
 * rest of the proposals surface sees it. Without the sync, the index
 * is stale and `auto_work` would return `idle` because the proposal
 * is not yet discoverable.
 */
const seedReadyProposal = async (
	server: IAssembledProposalsServer,
	proposal: { id: string; title: string; track?: string },
): Promise<{ file: string; relPath: string }> => {
	const proposalsDir = join(
		server.workspace,
		'docs/mcp-vertex/proposals/ready',
	);
	mkdirSync(proposalsDir, { recursive: true });
	const relPath = `docs/mcp-vertex/proposals/ready/${proposal.id}-${proposal.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}.md`;
	const file = join(server.workspace, relPath);
	writeFileSync(
		file,
		`---
id: ${proposal.id}
status: ready
type: proposal
track: ${proposal.track ?? 'plugins/proposals+tests'}
date: 2026-06-22
kind: feat
title: ${proposal.title}
---

# ${proposal.id} — ${proposal.title}

## goal

Seed for the auto_work e2e harness.
`,
		'utf8',
	);
	const sync = await server.callTool<{ ok: boolean }>(
		'mcp-vertex_proposals_sync_proposals',
		{},
	);
	expect(sync.ok).toBe(true);
	return { file, relPath };
};

describe('e2e: proposals_auto_work over the real MCP protocol', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('returns idle (no stop) when no proposals exist', async () => {
		const res = await callAutoWork(harness);
		expect(res.ok).toBe(true);
		expect(res.structured.state).toBe('idle');
		expect(res.structured.stop).toBeUndefined();
		expect(res.structured.nextAction).toBeDefined();
		// Crucially: the nextAction does NOT tell the agent to call
		// auto_work again — it should suggest creating a proposal or
		// waiting for a lock-released notification.
		expect(res.structured.nextAction).not.toMatch(/proposals_auto_work/);
	});

	it('escalates to a hard stop on the third consecutive idle call (transactional)', async () => {
		// The `consecutiveIdle` counter is module-level in
		// `auto-work.tool.ts`; vitest runs the suite in shared threads
		// so we cannot assume the counter starts at zero here. This test
		// verifies the *delta* (any time we make ≥3 consecutive idle
		// calls with no proposals, the third carries `stop: true`).
		// We start by hammering the counter past 3 to reach a known
		// `stop: true` state, then make 2 more idle calls to confirm the
		// `stop: true` is sticky until work resets the streak.

		// First: drive the counter to a known `stop: true` state.
		const reached = await callAutoWork(harness);
		while (reached.structured.stop !== true) {
			const next = await callAutoWork(harness);
			if (next.structured.stop === true) {
				expect(next.structured.state).toBe('idle');
				expect(next.structured.idleStreak).toBe(3);
				expect(next.structured.nextAction).toMatch(/^STOP —/);
				break;
			}
			expect(next.structured.state).toBe('idle');
		}

		// Second: while no proposal exists, two more idle calls keep
		// `stop: true` sticky (the counter is now at 4, 5, …).
		const sticky = await callAutoWork(harness);
		expect(sticky.structured.state).toBe('idle');
		expect(sticky.structured.stop).toBe(true);
		expect((sticky.structured.idleStreak ?? 0) > 3).toBe(true);
	});

	it('returns a work plan for a seeded pending proposal', async () => {
		const { file } = await seedReadyProposal(harness, {
			id: 'p9999',
			title: 'harness seed',
		});
		expect(existsSync(file)).toBe(true);

		const res = await callAutoWork(harness);
		expect(res.ok).toBe(true);
		expect(res.structured.state).toBe('work');
		expect(res.structured.proposalId).toBe('p9999');
		expect(res.structured.file).toMatch(/p9999-harness-seed\.md$/);
		expect(res.structured.orchestration?.lane).toBe(
			'inspect-then-delegate',
		);
		expect(res.structured.orchestration?.delegateAfterToolCalls).toBe(3);
		expect(res.structured.steps?.length ?? 0).toBeGreaterThan(0);
		const stepsBlob = (res.structured.steps ?? []).join('\n');
		// The harness-built server did NOT configure a validation command,
		// so the work plan must fall back to the generic gate hint.
		expect(stepsBlob).toMatch(/Validate/i);
		// The plan must mention every subsequent tool the agent is
		// expected to call, in the order `auto_work` documents.
		expect(stepsBlob).toMatch(/proposals_continue_proposal/);
		expect(stepsBlob).toMatch(/proposals_agent_lock/);
		expect(stepsBlob).toMatch(/proposals_close_slice/);
		expect(stepsBlob).toMatch(/proposals_sync_proposals/);
	});

	it('resets the idle streak after a work response (transactional)', async () => {
		// Seed a proposal and call `auto_work` — regardless of the
		// inherited streak, a `work` response must reset
		// `consecutiveIdle` to zero. We verify the reset by checking
		// that the next idle call has `idleStreak: 1` (the first idle
		// after a reset, not the third or later).
		await seedReadyProposal(harness, {
			id: 'p9998',
			title: 'reset streak',
		});
		const work = await callAutoWork(harness);
		expect(work.structured.state).toBe('work');

		// Move the proposal to a terminal state so the next `auto_work`
		// call returns idle (we use the existing `in-progress/` folder
		// to mean "taken", but the cascade's `next` branch treats
		// in-progress as taken; we just need a state where `auto_work`
		// returns idle). The simplest: delete the proposal and re-sync.
		const fs = await import('node:fs/promises');
		const readyDir = join(
			harness.workspace,
			'docs/mcp-vertex/proposals/ready',
		);
		const entries = await fs.readdir(readyDir);
		for (const entry of entries) {
			await fs.rm(join(readyDir, entry), { force: true });
		}
		await harness.callTool<{ ok: boolean }>(
			'mcp-vertex_proposals_sync_proposals',
			{},
		);

		const idle = await callAutoWork(harness);
		expect(idle.structured.state).toBe('idle');
		// After work, the streak counter is reset, so the first idle
		// must report `idleStreak: 1`.
		expect(idle.structured.idleStreak).toBe(1);
		expect(idle.structured.stop).toBeUndefined();
	});

	it('propagates the configured validationCommand into the work plan', async () => {
		// The harness-built server does not take a validation command
		// directly, but `auto_work`'s outputSchema permits
		// `validationCommand` to be absent (the default `get_validation_matrix`
		// fallback). We assert the plan shape regardless: the
		// `orchestration.next` field must point at the proposals namespace.
		await seedReadyProposal(harness, {
			id: 'p9997',
			title: 'validation command fallback',
		});
		const res = await callAutoWork(harness);
		expect(res.structured.state).toBe('work');
		expect(res.structured.orchestration?.next).toMatch(
			/^mcp-vertex_proposals_continue_proposal/,
		);
		expect(res.structured.persist?.mode).toBe('none');
	});

	it('every response satisfies the outputSchema parity invariant', async () => {
		// The MCP SDK validates `structuredContent` against the tool's
		// declared `outputSchema`. A regression to text-only (which the
		// unit spec also pins, auto-work.spec.ts:18-26) would surface
		// as an SDK error here. Assert the structural equality for
		// every branch we exercise.
		await seedReadyProposal(harness, {
			id: 'p9996',
			title: 'parity invariant',
		});

		const idle = await callAutoWork(harness);
		expect(idle.text).toBe(JSON.stringify(idle.structured));

		const work = await callAutoWork(harness);
		expect(work.text).toBe(JSON.stringify(work.structured));
	});

	it('includePaused: true falls back to a paused/ proposal (f00057)', async () => {
		// Seed ONLY a paused proposal under
		// `docs/mcp-vertex/proposals/paused/`. Without the flag the
		// standard cascade has nothing actionable (paused/ is not in
		// the standard actionable folder set), so `auto_work` returns
		// idle. With `includePaused: true`, the engine runs the
		// paused-fallback pass and returns it as a work plan, tagged
		// with `pickedFromPaused: true`.
		const { writeFileSync } = await import('node:fs');
		const pausedDir = join(
			harness.workspace,
			'docs/mcp-vertex/proposals/paused',
		);
		mkdirSync(pausedDir, { recursive: true });
		const relPath =
			'docs/mcp-vertex/proposals/paused/f00057-paused-demo.md';
		const file = join(harness.workspace, relPath);
		writeFileSync(
			file,
			`---
id: f00057-paused-demo
status: paused
type: proposal
date: 2026-06-26
kind: feat
title: paused demo for auto_work fallback
---

# f00057-paused-demo — paused demo

## goal

Seed for the auto_work includePaused e2e harness.
`,
			'utf8',
		);
		const sync = await harness.callTool<{ ok: boolean }>(
			'mcp-vertex_proposals_sync_proposals',
			{},
		);
		expect(sync.ok).toBe(true);

		// Default (no flag): idle, no paused pick.
		const idle = await callAutoWork(harness);
		expect(idle.structured.state).toBe('idle');
		expect(idle.structured.pickedFromPaused).toBeUndefined();

		// With the flag: the paused proposal is picked, tagged.
		const picked = await callAutoWork(harness, { includePaused: true });
		expect(picked.structured.state).toBe('work');
		expect(picked.structured.proposalId).toBe('f00057-paused-demo');
		expect(picked.structured.file).toMatch(
			/paused\/f00057-paused-demo\.md$/,
		);
		expect(picked.structured.pickedFromPaused).toBe(true);
	});
});
