import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentLockEngine } from '@mcp-vertex/proposals/lib/locks/agent-lock-engine';

/**
 * M28: `agent_lock` forwards `onContention` through to `withFileMutex`.
 * Simulates a holder that doesn't release within `timeoutMs` (a fresh,
 * non-stale sidecar) and a second claim attempt against the same lock
 * file: under `'fail'` it must reject without stealing; under `'steal'`
 * (the default, omitted) the historical reclaim-and-succeed behaviour is
 * unchanged. Mutex timings are tightened via the engine's internal
 * (test-only) `mutexTimeoutMs`/`mutexStaleMs`/`mutexPollMs` deps so the
 * spec runs fast and deterministically.
 */
describe('agent-lock — onContention forwarding (M28)', () => {
	let dir = '';
	let lockPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'agent-lock-contention-'));
		lockPath = join(dir, 'agents.lock.json');
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [],
			}),
		);
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("onContention:'fail' rejects instead of stealing a live holder's lock", async () => {
		const sidecar = `${lockPath}.mutex`;
		// A fresh (non-stale) sidecar simulates a holder that is alive but
		// has overrun the (tightened) contention timeout below.
		writeFileSync(sidecar, `${process.pid}\n${Date.now()}\nlive-holder`);

		const res = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 't-fail',
				agent: 'a1',
				files: ['src/a.ts'],
				onContention: 'fail',
			},
			{
				lockPath,
				mutexTimeoutMs: 120,
				mutexStaleMs: 30_000,
				mutexPollMs: 20,
			},
		);

		expect(res.isError).toBe(true);
		const text = res.content[0]?.text ?? '';
		expect(text).toContain('lock contention');
		// The live holder's lock must survive — not stolen.
		expect(existsSync(sidecar)).toBe(true);
	});

	it("onContention:'steal' (default, omitted) still reclaims a live lock past the timeout", async () => {
		const sidecar = `${lockPath}.mutex`;
		writeFileSync(sidecar, `${process.pid}\n${Date.now()}\nlive-holder`);

		const res = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 't-steal',
				agent: 'a1',
				files: ['src/b.ts'],
				// onContention omitted: must default to 'steal'.
			},
			{
				lockPath,
				mutexTimeoutMs: 120,
				mutexStaleMs: 30_000,
				mutexPollMs: 20,
			},
		);

		expect(res.isError).toBeFalsy();
		const text = res.content[0]?.text ?? '';
		expect(text).toContain('"claimed":true');
	});
});
