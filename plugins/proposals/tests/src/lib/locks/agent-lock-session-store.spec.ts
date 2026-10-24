/**
 * Unit specs for `agent-lock-session-store` (x00153 S1).
 *
 * Covers the durable JSONL session counter used by `agent_lock` so
 * claim/release imbalance survives MCP-server restarts.
 */

import {
	chmodSync,
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
	SessionLogUnreadableError,
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

	// x00154 S6 — the prefix read inside `appendSessionEntry` must
	// distinguish a missing log (ENOENT) from a real read failure
	// (ENOTDIR, EACCES, …). The previous `.catch(() => '')` silently
	// overwrote the durable counter on every failure mode, which is
	// what this slice is closing.
	describe('appendSessionEntry prefix read (x00154 S6)', () => {
		it('treats a missing log as the normal "first append" case (ENOENT → empty prefix)', async () => {
			// The session log path is intentionally never created.
			await expect(
				appendSessionEntry(
					{
						ts: '2026-07-26T00:00:00.000Z',
						agent: 'agent-a',
						action: 'claim',
						ok: true,
					},
					workspace,
				),
			).resolves.toBeUndefined();
			const onDisk = readFileSync(sessionLogPath(workspace), 'utf8');
			expect(onDisk.trim()).toBe(
				'{"ts":"2026-07-26T00:00:00.000Z","agent":"agent-a","action":"claim","ok":true}',
			);
		});

		it('throws SessionLogUnreadableError when the prefix read fails for a non-ENOENT reason', async () => {
			// The session-log path is computed from the workspace, so we
			// cannot inject a bogus path directly. The most reliable
			// cross-platform way to provoke a non-ENOENT read failure is
			// to pre-create the log file (so the read can't fall through
			// to ENOENT) and then strip read permission on the file
			// itself. The parent directory stays writable so the
			// `withFileMutex` `mkdir` and the post-prefix `writeFileAtomic`
			// would succeed if the prefix read were ever to return — only
			// the prefix `readFile` fails with EACCES.
			// Skip on Windows where chmod semantics differ.
			if (process.platform === 'win32') return;
			const cacheDir = dirname(sessionLogPath(workspace));
			mkdirSync(cacheDir, { recursive: true });
			const logPath = sessionLogPath(workspace);
			// Pre-create the log so the prefix read doesn't short-circuit
			// through the ENOENT branch.
			writeFileSync(
				logPath,
				'{"ts":"2026-07-26T00:00:00.000Z","agent":"seed","action":"claim","ok":true}\n',
				'utf8',
			);
			const previousMode = 0o644;
			chmodSync(logPath, 0o000);
			try {
				await expect(
					appendSessionEntry(
						{
							ts: '2026-07-26T00:00:00.000Z',
							agent: 'agent-a',
							action: 'claim',
							ok: true,
						},
						workspace,
					),
				).rejects.toBeInstanceOf(SessionLogUnreadableError);
			} finally {
				chmodSync(logPath, previousMode);
			}
		});

		it('exposes the failing path on the typed error for diagnostics', () => {
			const sample = new SessionLogUnreadableError(
				'/tmp/whatever',
				new Error('EACCES'),
			);
			expect(sample.name).toBe('SessionLogUnreadableError');
			expect(sample.path).toBe('/tmp/whatever');
			expect(sample.message).toContain('/tmp/whatever');
		});
	});
});
