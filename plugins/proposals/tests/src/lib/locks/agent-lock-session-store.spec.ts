/**
 * Unit specs for `agent-lock-session-store` (x00153 S1).
 *
 * Covers the durable JSONL session counter used by `agent_lock` so
 * claim/release imbalance survives MCP-server restarts.
 */

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	appendSessionEntry,
	readSessionBalance,
	resetSessionBalance,
	sessionLogPath,
} from '../../../../src/lib/locks/agent-lock-session-store';

describe('agent-lock-session-store', () => {
	let workspace = '';

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'agent-lock-session-'));
		resetSessionBalance();
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it('appends one entry and reads it back as balance', async () => {
		await appendSessionEntry(
			{
				ts: '2026-07-26T00:00:00.000Z',
				agent: 'agent-a',
				action: 'claim',
				ok: true,
			},
			workspace,
		);
		expect(await readSessionBalance(workspace)).toEqual({
			claims: 1,
			releases: 0,
			imbalance: 1,
		});
	});

	it('sums only ok:true entries across many lines', async () => {
		await appendSessionEntry(
			{
				ts: '2026-07-26T00:00:00.000Z',
				agent: 'agent-a',
				action: 'claim',
				ok: true,
			},
			workspace,
		);
		await appendSessionEntry(
			{
				ts: '2026-07-26T00:00:01.000Z',
				agent: 'agent-b',
				action: 'claim',
				ok: false,
			},
			workspace,
		);
		await appendSessionEntry(
			{
				ts: '2026-07-26T00:00:02.000Z',
				agent: 'agent-a',
				action: 'release',
				ok: true,
			},
			workspace,
		);
		expect(await readSessionBalance(workspace)).toEqual({
			claims: 1,
			releases: 1,
			imbalance: 0,
		});
	});

	it('returns zeros for an empty or missing file', async () => {
		expect(await readSessionBalance(workspace)).toEqual({
			claims: 0,
			releases: 0,
			imbalance: 0,
		});
	});

	it('ignores corrupt JSONL lines and keeps valid history', async () => {
		const path = sessionLogPath(workspace);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			path,
			'{"ts":"2026-07-26T00:00:00.000Z","agent":"agent-a","action":"claim","ok":true}\nnot-json\n{"ts":"2026-07-26T00:00:01.000Z","agent":"agent-a","action":"release","ok":true}\n',
		);
		expect(await readSessionBalance(workspace)).toEqual({
			claims: 1,
			releases: 1,
			imbalance: 0,
		});
	});

	it('serializes concurrent appends via the file mutex', async () => {
		await Promise.all([
			appendSessionEntry(
				{
					ts: '2026-07-26T00:00:00.000Z',
					agent: 'agent-a',
					action: 'claim',
					ok: true,
				},
				workspace,
			),
			appendSessionEntry(
				{
					ts: '2026-07-26T00:00:01.000Z',
					agent: 'agent-b',
					action: 'release',
					ok: true,
				},
				workspace,
			),
		]);
		expect(
			readFileSync(sessionLogPath(workspace), 'utf8').trim().split('\n'),
		).toHaveLength(2);
	});
});
