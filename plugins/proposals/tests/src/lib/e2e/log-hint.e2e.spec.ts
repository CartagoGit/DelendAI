/**
 * End-to-end: a tool failure carries a well-formed `logHint` over the
 * real MCP protocol (f00045 S4, server side).
 *
 * The core `create-mcp-project` wrapper augments every `isError` result
 * with a `logHint { path, line, ts }` pointing at the per-day JSONL log
 * the `logs` plugin writes (S1). This spec drives a real failure — an
 * illegal `proposal_transition` — through the assembled server and
 * asserts the hint's shape over the wire.
 *
 * The client-side extraction (`logHintFromResult` →
 * `McpToolError.logHint`, S2) is covered by the client unit specs at
 * `packages/client/tests/transport/mcp-stdio-client.spec.ts`; this spec
 * deliberately does NOT import `@mcp-vertex/client` so the proposals
 * test package keeps a clean dependency surface (core only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';

interface LogHint {
	readonly path: string;
	readonly line: number;
	readonly ts: string;
}

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

const seedReady = async (
	server: IAssembledProposalsServer,
	id: string,
): Promise<void> => {
	const dir = join(server.workspace, PROPOSALS_RELDIR, 'ready');
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}-log-hint-seed.md`),
		`---
id: ${id}
status: ready
type: proposal
track: plugins/proposals+tests
date: 2026-06-22
kind: feat
title: log hint seed
---

# ${id} — log hint seed

## goal

Seed for the log-hint e2e.
`,
		'utf8',
	);
	const sync = await server.callTool<{ ok: boolean }>(
		'proposals_sync_proposals',
		{},
	);
	expect(sync.ok).toBe(true);
};

describe('e2e: tool failure carries a logHint over the wire (f00045 S4)', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('an illegal transition failure carries a well-formed logHint', async () => {
		await seedReady(harness, 'f06001');

		// ready → done is an illegal skip; the engine returns ok:false and
		// the wrapper augments it with a logHint.
		const res = await harness.callTool<{
			ok: boolean;
			logHint?: LogHint;
		}>('proposals_proposal_transition', {
			id: 'f06001',
			to: 'done',
			reason: 'force an error',
		});

		// Read the hint from whichever envelope carries it (structured or
		// the parsed text), matching how a client extracts it.
		const fromStructured = res.structured.logHint;
		const fromText = (JSON.parse(res.text) as { logHint?: LogHint })
			.logHint;
		const hint = fromStructured ?? fromText;

		expect(hint).toBeDefined();
		expect(hint?.path).toMatch(/[/\\]logs[/\\]\d{4}-\d{2}-\d{2}\.jsonl$/);
		// The hint points under THIS workspace's cache, never a shared path.
		expect(hint?.path).toContain(harness.workspace);
		expect(typeof hint?.line).toBe('number');
		expect(Number.isFinite(hint?.line)).toBe(true);
		// `ts` is an ISO-8601 timestamp.
		expect(Number.isNaN(Date.parse(hint?.ts ?? 'x'))).toBe(false);
	});

	it('a successful transition carries NO logHint (only failures get one)', async () => {
		await seedReady(harness, 'f06002');

		const res = await harness.callTool<{
			ok: boolean;
			logHint?: LogHint;
		}>('proposals_proposal_transition', {
			id: 'f06002',
			to: 'in-progress',
			reason: 'legal move',
		});

		expect(res.structured.ok).toBe(true);
		expect(res.structured.logHint).toBeUndefined();
		expect(
			(JSON.parse(res.text) as { logHint?: LogHint }).logHint,
		).toBeUndefined();
	});
});
