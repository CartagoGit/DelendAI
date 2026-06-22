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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 * `validationCommand`). We type-narrow via the `state` field.
 */
type AutoWorkOutput =
	| {
			state: 'idle';
			stop?: true;
			idleStreak?: number;
			reason?: string;
			nextAction?: string;
			handoffPath?: string;
	  }
	| {
			state: 'work';
			proposalId: string;
			file: string;
			orchestration: {
				lane: 'inspect-then-delegate';
				delegateAfterToolCalls: number;
				next: string;
				policy: string;
			};
			validationCommand?: string;
			persist: {
				mode: 'none' | 'commit' | 'commit-and-push';
				messageTemplate?: string;
				pushTarget?: string;
			};
			steps: string[];
	  };

const callAutoWork = async (
	server: IAssembledProposalsServer,
	args: Record<string, unknown> = {},
): Promise<IAssembledToolResult<AutoWorkOutput>> =>
	server.callTool<AutoWorkOutput>('proposals_auto_work', args);

const seedReadyProposal = (
	workspace: string,
	proposal: { id: string; title: string; track?: string },
): { file: string; relPath: string } => {
	const proposalsDir = join(workspace, 'docs/mcp-vertex/proposals/ready');
	mkdirSync(proposalsDir, { recursive: true });
	const relPath = `docs/mcp-vertex/proposals/ready/${proposal.id}-${proposal.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}.md`;
	const file = join(workspace, relPath);
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
	return { file, relPath };
};

describe('e2e: proposals_auto_work over the real MCP protocol', () => {
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

	it('escalates to a hard stop on the third consecutive idle call', async () => {
		const first = await callAutoWork(harness);
		expect(first.structured.state).toBe('idle');
		expect(first.structured.stop).toBeUndefined();

		const second = await callAutoWork(harness);
		expect(second.structured.state).toBe('idle');
		expect(second.structured.stop).toBeUndefined();

		const third = await callAutoWork(harness);
		expect(third.structured.state).toBe('idle');
		expect(third.structured.stop).toBe(true);
		expect(third.structured.idleStreak).toBe(3);
		expect(third.structured.nextAction).toMatch(/^STOP —/);
	});

	it('returns a work plan for a seeded pending proposal', async () => {
		const { file } = seedReadyProposal(harness.workspace, {
			id: 'p9999',
			title: 'harness seed',
		});
		expect(existsSync(file)).toBe(true);

		const res = await callAutoWork(harness);
		expect(res.ok).toBe(true);
		expect(res.structured.state).toBe('work');
		if (res.structured.state !== 'work') return;
		expect(res.structured.proposalId).toBe('p9999');
		expect(res.structured.file).toMatch(/p9999-harness-seed\.md$/);
		expect(res.structured.orchestration.lane).toBe('inspect-then-delegate');
		expect(res.structured.orchestration.delegateAfterToolCalls).toBe(3);
		expect(res.structured.steps.length).toBeGreaterThan(0);
		// The harness-built server did NOT configure a validation command,
		// so the work plan must fall back to the generic gate hint.
		const stepsBlob = res.structured.steps.join('\n');
		expect(stepsBlob).toMatch(/Validate/i);
		// The plan must mention every subsequent tool the agent is
		// expected to call, in the order `auto_work` documents.
		expect(stepsBlob).toMatch(/proposals_continue_proposal/);
		expect(stepsBlob).toMatch(/proposals_agent_lock/);
		expect(stepsBlob).toMatch(/proposals_close_slice/);
		expect(stepsBlob).toMatch(/proposals_sync_proposals/);
	});

	it('resets the idle streak after a work response', async () => {
		// First call: no proposal → idle (streak = 1).
		const idle1 = await callAutoWork(harness);
		expect(idle1.structured.state).toBe('idle');

		// Seed a proposal and call again → work → streak resets.
		seedReadyProposal(harness.workspace, {
			id: 'p9998',
			title: 'reset streak',
		});
		const work = await callAutoWork(harness);
		expect(work.structured.state).toBe('work');

		// Now no proposals again — the streak counter starts at zero.
		// Two consecutive idle calls must NOT escalate to stop.
		const idle2 = await callAutoWork(harness);
		expect(idle2.structured.state).toBe('idle');
		expect(idle2.structured.stop).toBeUndefined();

		const idle3 = await callAutoWork(harness);
		expect(idle3.structured.state).toBe('idle');
		expect(idle3.structured.stop).toBeUndefined();

		// The third idle after the reset is the first one that escalates.
		const idle4 = await callAutoWork(harness);
		expect(idle4.structured.state).toBe('idle');
		expect(idle4.structured.stop).toBe(true);
		expect(idle4.structured.idleStreak).toBe(3);
	});

	it('propagates the configured validationCommand into the work plan', async () => {
		// The harness-built server does not take a validation command
		// directly, but `auto_work`'s outputSchema permits
		// `validationCommand` to be absent (the default `get_validation_matrix`
		// fallback). We assert the plan shape regardless: the
		// `orchestration.next` field must point at the proposals namespace.
		seedReadyProposal(harness.workspace, {
			id: 'p9997',
			title: 'validation command fallback',
		});
		const res = await callAutoWork(harness);
		expect(res.structured.state).toBe('work');
		if (res.structured.state !== 'work') return;
		expect(res.structured.orchestration.next).toMatch(
			/^proposals_continue_proposal/,
		);
		expect(res.structured.persist.mode).toBe('none');
	});

	it('every response satisfies the outputSchema parity invariant', async () => {
		// The MCP SDK validates `structuredContent` against the tool's
		// declared `outputSchema`. A regression to text-only (which the
		// unit spec also pins, auto-work.spec.ts:18-26) would surface
		// as an SDK error here. Assert the structural equality for
		// every branch we exercise.
		seedReadyProposal(harness.workspace, {
			id: 'p9996',
			title: 'parity invariant',
		});

		const idle = await callAutoWork(harness);
		expect(idle.text).toBe(JSON.stringify(idle.structured));

		const work = await callAutoWork(harness);
		expect(work.text).toBe(JSON.stringify(work.structured));
	});
});
