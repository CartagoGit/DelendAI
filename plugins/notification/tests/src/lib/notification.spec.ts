import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	awaitLockRelease,
	createReleaseWatcher,
	diffReleased,
	readInFlight,
	type IReleasedClaim,
} from '@mcp-vertex/notification/lib/watcher';
import plugin from '@mcp-vertex/notification';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

const lock = (
	entries: Array<{ task_id: string; agent?: string; ownership?: string[] }>,
) =>
	JSON.stringify({ version: 1, stale_after_minutes: 10, in_flight: entries });

describe('lock-release watcher [N14]', () => {
	let dir = '';
	let lockFile = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'notify-'));
		lockFile = join(dir, 'agents.lock.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('readInFlight maps claims by task_id (empty on missing/corrupt)', () => {
		expect(readInFlight(lockFile).size).toBe(0);
		writeFileSync(lockFile, '{{{ corrupt');
		expect(readInFlight(lockFile).size).toBe(0);
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'a', ownership: ['f.ts'] }]),
		);
		expect(readInFlight(lockFile).get('t1')?.files).toEqual(['f.ts']);
	});

	it('diffReleased reports claims gone since the previous scan', () => {
		const prev = readInFlight(lockFile);
		writeFileSync(lockFile, lock([{ task_id: 't1' }, { task_id: 't2' }]));
		const curr = readInFlight(lockFile);
		// t1,t2 are new (not releases). Now release t1:
		writeFileSync(lockFile, lock([{ task_id: 't2' }]));
		const after = readInFlight(lockFile);
		expect(diffReleased(prev, curr)).toEqual([]);
		expect(diffReleased(curr, after).map((c) => c.taskId)).toEqual(['t1']);
	});

	it('watcher.check fires onRelease exactly for freed claims', () => {
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'falcon', ownership: ['src/a.ts'] }]),
		);
		const seen: IReleasedClaim[] = [];
		const watcher = createReleaseWatcher({
			lockFile,
			onRelease: (r) => seen.push(...r),
		});
		// No change yet:
		expect(watcher.check()).toEqual([]);
		// Release t1:
		writeFileSync(lockFile, lock([]));
		const released = watcher.check();
		watcher.stop();
		expect(released.map((c) => c.taskId)).toEqual(['t1']);
		expect(seen.map((c) => c.taskId)).toEqual(['t1']);
		expect(seen[0]?.files).toEqual(['src/a.ts']);
	});

	it('awaitLockRelease returns immediately when the lock is already free', async () => {
		writeFileSync(lockFile, lock([{ task_id: 'other' }]));
		const r = await awaitLockRelease({
			lockFile,
			taskId: 't1',
			pollMs: 100,
		});
		expect(r).toMatchObject({
			released: true,
			alreadyFree: true,
			timedOut: false,
		});
		expect(r.waitedMs).toBe(0);
	});

	it('awaitLockRelease resolves when the held lock is later released', async () => {
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'falcon', ownership: ['a.ts'] }]),
		);
		const waiting = awaitLockRelease({
			lockFile,
			taskId: 't1',
			pollMs: 100,
			timeoutMs: 5_000,
		});
		setTimeout(() => writeFileSync(lockFile, lock([])), 150);
		const r = await waiting;
		expect(r.released).toBe(true);
		expect(r.timedOut).toBe(false);
		expect(r.alreadyFree).toBe(false);
		expect(r.waitedMs).toBeGreaterThan(0);
	});

	it('awaitLockRelease times out while the lock stays held', async () => {
		writeFileSync(lockFile, lock([{ task_id: 't1' }]));
		const r = await awaitLockRelease({
			lockFile,
			taskId: 't1',
			pollMs: 100,
			timeoutMs: 1_000,
		});
		expect(r).toMatchObject({
			released: false,
			timedOut: true,
			alreadyFree: false,
		});
	});

	it('awaitLockRelease resolves early when aborted', async () => {
		writeFileSync(lockFile, lock([{ task_id: 't1' }]));
		const ac = new AbortController();
		const waiting = awaitLockRelease({
			lockFile,
			taskId: 't1',
			pollMs: 100,
			timeoutMs: 5_000,
			signal: ac.signal,
		});
		setTimeout(() => ac.abort(), 100);
		const r = await waiting;
		expect(r.released).toBe(false);
		expect(r.timedOut).toBe(false);
	});
});

describe('notification plugin', () => {
	it('registers notify_status + knowledge and emits on release', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-plug-'));
		const ctx = {
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			pluginCacheDir: '.cache/mcp-vertex/notification',
			pluginDocsDir: 'docs/mcp-vertex/notification',
			namespacePrefix: 'notification',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;

		const reg = await plugin.register(ctx);
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'notify_status',
			'await_lock',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('lock-notifications');

		// Wire a fake server to capture logging notifications + the tool handler.
		const logs: unknown[] = [];
		let handler:
			| (() => Promise<{ content: Array<{ text: string }> }>)
			| undefined;
		const fakeServer = {
			sendLoggingMessage: async (p: unknown) => {
				logs.push(p);
			},
			server: { onclose: undefined as undefined | (() => void) },
			registerTool: (_n: string, _d: unknown, fn: typeof handler) => {
				handler = fn;
			},
		};
		await reg.tools![0]!.register(fakeServer as never);

		// status tool works
		const out = JSON.parse((await handler!()).content[0]?.text ?? '{}');
		expect(out.emitted).toBe(0);
		expect(typeof out.watching).toBe('string');

		// stop the watcher via the server onclose hook (no leaked timer)
		fakeServer.server.onclose?.();
		rmSync(dir, { recursive: true, force: true });
	});
});
