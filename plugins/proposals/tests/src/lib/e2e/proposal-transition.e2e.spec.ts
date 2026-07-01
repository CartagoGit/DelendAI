/**
 * End-to-end: `proposals_proposal_transition` over the real MCP protocol.
 *
 * Slice S3 of f00044. Drives the registered `proposal_transition` tool
 * through a real `Client` connected to an assembled mcp-vertex server
 * over an in-memory transport, proving the DFA enforcement the unit
 * spec exercises is exactly what the wire delivers — including the
 * folder move and the structured rejection envelope for illegal
 * transitions.
 *
 * The DFA: `ready → in-progress → review → done` is the legal forward
 * path; skips (`ready → done`) and reverses (`in-progress → ready`)
 * are rejected with `ok: false` and a `nextAction` naming the legal
 * targets, and the file does NOT move. The transition does a `git mv`
 * when the workspace is a git repo and falls back to a plain rename
 * otherwise (the e2e tmpdir is not a git repo, so the rename path runs).
 *
 * Every `it` runs against a fresh `mkdtempSync` workspace.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
	type IAssembledToolResult,
} from './assembled-proposals-server';

interface TransitionOutput {
	readonly ok: boolean;
	readonly id?: string;
	readonly from?: string;
	readonly to?: string;
	readonly movedFrom?: string;
	readonly movedTo?: string;
	readonly error?: {
		readonly reason: string;
		readonly nextAction?: string;
	};
}

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

const callTransition = async (
	server: IAssembledProposalsServer,
	args: { id: string; to: string; reason: string },
): Promise<IAssembledToolResult<TransitionOutput>> =>
	server.callTool<TransitionOutput>(
		'mcp-vertex_proposals_proposal_transition',
		args,
	);

/** Seed a feat proposal in `ready/` and rebuild the index. */
const seedReady = async (
	server: IAssembledProposalsServer,
	id: string,
	title: string,
): Promise<string> => {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const dir = join(server.workspace, PROPOSALS_RELDIR, 'ready');
	mkdirSync(dir, { recursive: true });
	const relName = `${id}-${slug}.md`;
	writeFileSync(
		join(dir, relName),
		`---
id: ${id}
status: ready
type: proposal
track: plugins/proposals+tests
date: 2026-06-22
kind: feat
title: ${title}
---

# ${id} — ${title}

## goal

Seed for the proposal_transition e2e harness.
`,
		'utf8',
	);
	const sync = await server.callTool<{ ok: boolean }>(
		'mcp-vertex_proposals_sync_proposals',
		{},
	);
	expect(sync.ok).toBe(true);
	return relName;
};

const folderPath = (
	server: IAssembledProposalsServer,
	folder: string,
	relName: string,
): string => join(server.workspace, PROPOSALS_RELDIR, folder, relName);

describe('e2e: proposals_proposal_transition over the real MCP protocol', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('legal path ready → in-progress moves the file and returns ok:true', async () => {
		const relName = await seedReady(harness, 'f08001', 'legal forward');
		expect(existsSync(folderPath(harness, 'ready', relName))).toBe(true);

		const res = await callTransition(harness, {
			id: 'f08001',
			to: 'in-progress',
			reason: 'begin work',
		});
		expect(res.structured.ok).toBe(true);
		expect(res.structured.from).toBe('ready');
		expect(res.structured.to).toBe('in-progress');
		expect(existsSync(folderPath(harness, 'ready', relName))).toBe(false);
		expect(existsSync(folderPath(harness, 'in-progress', relName))).toBe(
			true,
		);
	});

	it('two legal transitions in sequence: ready → in-progress → review', async () => {
		const relName = await seedReady(harness, 'f08002', 'two hops');

		const first = await callTransition(harness, {
			id: 'f08002',
			to: 'in-progress',
			reason: 'start',
		});
		expect(first.structured.ok).toBe(true);

		const second = await callTransition(harness, {
			id: 'f08002',
			to: 'review',
			reason: 'ready for review',
		});
		expect(second.structured.ok).toBe(true);
		expect(second.structured.from).toBe('in-progress');
		expect(second.structured.to).toBe('review');
		expect(existsSync(folderPath(harness, 'review', relName))).toBe(true);
		expect(existsSync(folderPath(harness, 'in-progress', relName))).toBe(
			false,
		);
	});

	it('illegal skip ready → done is rejected and the file stays put', async () => {
		const relName = await seedReady(harness, 'f08003', 'illegal skip');

		const res = await callTransition(harness, {
			id: 'f08003',
			to: 'done',
			reason: 'try to skip',
		});
		expect(res.structured.ok).toBe(false);
		expect(res.structured.error?.reason).toMatch(/illegal transition/i);
		// The rejection names the legal next step so the agent knows the path.
		expect(res.structured.error?.nextAction ?? '').toMatch(/in-progress/);
		// No move happened.
		expect(existsSync(folderPath(harness, 'ready', relName))).toBe(true);
		expect(existsSync(folderPath(harness, 'done', relName))).toBe(false);
	});

	it('illegal reverse in-progress → ready is rejected with no folder move', async () => {
		const relName = await seedReady(harness, 'f08004', 'illegal reverse');
		const forward = await callTransition(harness, {
			id: 'f08004',
			to: 'in-progress',
			reason: 'start',
		});
		expect(forward.structured.ok).toBe(true);

		const reverse = await callTransition(harness, {
			id: 'f08004',
			to: 'ready',
			reason: 'try to go back',
		});
		expect(reverse.structured.ok).toBe(false);
		expect(reverse.structured.error?.reason).toMatch(/illegal transition/i);
		// File stays in in-progress/.
		expect(existsSync(folderPath(harness, 'in-progress', relName))).toBe(
			true,
		);
		expect(existsSync(folderPath(harness, 'ready', relName))).toBe(false);
	});

	it('success has exact text/structured parity; errors carry only an extra logHint', async () => {
		await seedReady(harness, 'f08005', 'parity');

		// Success: structuredContent is byte-identical to content[0].text.
		const ok = await callTransition(harness, {
			id: 'f08005',
			to: 'in-progress',
			reason: 'start',
		});
		expect(ok.text).toBe(JSON.stringify(ok.structured));

		// Error: the envelope may additionally carry a `logHint` (the
		// clickable-log-link diagnostic surface). Stripping it from both
		// sides must leave identical payloads — i.e. the error envelope's
		// text and structuredContent agree on everything but that hint.
		const rejected = await callTransition(harness, {
			id: 'f08005',
			to: 'ready',
			reason: 'reverse',
		});
		const { logHint: _t, ...textPayload } = JSON.parse(
			rejected.text,
		) as Record<string, unknown>;
		const { logHint: _s, ...structuredPayload } =
			rejected.structured as unknown as Record<string, unknown>;
		expect(textPayload).toEqual(structuredPayload);
		expect(structuredPayload.ok).toBe(false);
	});
});
