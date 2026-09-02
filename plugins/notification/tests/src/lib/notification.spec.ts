import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	awaitLockRelease,
	createReleaseWatcher,
	createHandoffWatcher,
	diffReleased,
	readInFlight,
	type IReleasedClaim,
	type IHandoffEvent,
} from '@mcp-vertex/notification/lib/services/watcher';
import plugin from '@mcp-vertex/notification';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

const lock = (
	entries: Array<{
		task_id: string;
		agent?: string;
		ownership?: string[];
		last_seen?: string;
		host?: string;
		pid?: number;
	}>,
) =>
	JSON.stringify({
		version: 1,
		stale_after_minutes: 10,
		// A real entry always carries `last_seen` — the engine writes it on
		// every claim and heartbeat — and an entry that cannot say when it
		// was last alive is not treated as held by anyone. Default to
		// "just now" so each test states only what it is actually about.
		in_flight: entries.map((entry) => ({
			last_seen: new Date().toISOString(),
			...entry,
		})),
	});

describe('lock-release watcher [N14]', async () => {
	let dir = '';
	let lockFile = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'notify-'));
		lockFile = join(dir, 'agents.lock.json');
	});

	it('does not treat a claim from a dead agent as in flight', async () => {
		// The point of the shared expiry rule: the lock engine drops a
		// claim whose owning process is gone, so a waiter that still saw
		// it would wait out its whole timeout for an agent that stopped
		// working — a lock simultaneously free and held.
		writeFileSync(
			lockFile,
			lock([
				{
					task_id: 't-dead',
					ownership: ['f.ts'],
					host: hostname(),
					// Never a live pid: the max on Linux is 2^22.
					pid: 2 ** 26,
				},
			]),
		);
		expect((await readInFlight(lockFile)).has('t-dead')).toBe(false);
	});

	it('does not treat a claim past its heartbeat window as in flight', async () => {
		writeFileSync(
			lockFile,
			lock([
				{
					task_id: 't-stale',
					ownership: ['f.ts'],
					last_seen: new Date(Date.now() - 11 * 60_000).toISOString(),
				},
			]),
		);
		expect((await readInFlight(lockFile)).has('t-stale')).toBe(false);
	});

	it('still holds a claim from a live process on this host', async () => {
		// The other half: a slow-but-alive holder must never be released
		// early, or two agents write the same files believing they own them.
		writeFileSync(
			lockFile,
			lock([
				{
					task_id: 't-live',
					ownership: ['f.ts'],
					host: hostname(),
					pid: process.pid,
				},
			]),
		);
		expect((await readInFlight(lockFile)).has('t-live')).toBe(true);
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('readInFlight maps claims by task_id (empty on missing/corrupt)', async () => {
		expect((await readInFlight(lockFile)).size).toBe(0);
		writeFileSync(lockFile, '{{{ corrupt');
		expect((await readInFlight(lockFile)).size).toBe(0);
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'a', ownership: ['f.ts'] }]),
		);
		expect((await readInFlight(lockFile)).get('t1')?.files).toEqual([
			'f.ts',
		]);
	});

	it('diffReleased reports claims gone since the previous scan', async () => {
		const prev = await readInFlight(lockFile);
		writeFileSync(lockFile, lock([{ task_id: 't1' }, { task_id: 't2' }]));
		const curr = await readInFlight(lockFile);
		// t1,t2 are new (not releases). Now release t1:
		writeFileSync(lockFile, lock([{ task_id: 't2' }]));
		const after = await readInFlight(lockFile);
		expect(diffReleased(prev, curr)).toEqual([]);
		expect(diffReleased(curr, after).map((c) => c.taskId)).toEqual(['t1']);
	});

	it('watcher.check fires onRelease exactly for freed claims', async () => {
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'falcon', ownership: ['src/a.ts'] }]),
		);
		const seen: IReleasedClaim[] = [];
		const watcher = createReleaseWatcher({
			lockFile,
			onRelease: (r) => seen.push(...r),
		});
		// First check() only establishes the baseline (no prior scan to diff
		// against yet), mirroring the old constructor-time sync pre-scan.
		expect(await watcher.check()).toEqual([]);
		// No change yet:
		expect(await watcher.check()).toEqual([]);
		// Release t1:
		writeFileSync(lockFile, lock([]));
		const released = await watcher.check();
		watcher.stop();
		expect(released.map((c) => c.taskId)).toEqual(['t1']);
		expect(seen.map((c) => c.taskId)).toEqual(['t1']);
		expect(seen[0]?.files).toEqual(['src/a.ts']);
	});

	it('stop() resets prev so a restart does not emit stale releases (a00085 #7)', async () => {
		writeFileSync(lockFile, lock([{ task_id: 't1' }]));
		const seen: IReleasedClaim[] = [];
		const watcher = createReleaseWatcher({
			lockFile,
			onRelease: (released) => seen.push(...released),
		});
		expect(await watcher.check()).toEqual([]);
		watcher.stop();
		writeFileSync(lockFile, lock([]));
		expect(await watcher.check()).toEqual([]);
		watcher.stop();
		expect(seen).toEqual([]);
	});

	// a00084 F14: start() used to only arm the interval/fs.watch — the very
	// first tick, whatever triggered it (timer OR a file-change event), was
	// always treated as the priming scan (prev starts undefined, so it can
	// never report a diff). If a peer released its lock milliseconds after
	// this watcher booted, and THAT write was what caused the first-ever
	// tick to run, the release was silently swallowed into the baseline —
	// a subscriber that starts watching right after a peer's release would
	// wait for the NEXT release instead of hearing about this one. Fixed
	// by priming eagerly inside start() itself, decoupled from whatever
	// external event happens to fire next.
	it('start() primes the baseline eagerly so a release right after boot is not swallowed', async () => {
		writeFileSync(
			lockFile,
			lock([{ task_id: 't1', agent: 'falcon', ownership: ['src/a.ts'] }]),
		);
		const seen: IReleasedClaim[] = [];
		// A deliberately huge interval: if start() did NOT prime eagerly,
		// nothing would establish the baseline until this timer fires (or
		// fs.watch races the release itself into being the first tick),
		// so this test would only pass by accident, not by design.
		const watcher = createReleaseWatcher({
			lockFile,
			onRelease: (r) => seen.push(...r),
			intervalMs: 5 * 60_000,
		});
		watcher.start();
		// Let the eager priming tick's async body (readInFlight) settle.
		await new Promise((r) => setTimeout(r, 20));
		// Release t1 — this is the file-change event fs.watch reacts to.
		writeFileSync(lockFile, lock([]));
		await new Promise((r) => setTimeout(r, 100));
		watcher.stop();
		expect(seen.map((c) => c.taskId)).toEqual(['t1']);
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

describe('handoff watcher', async () => {
	let dir = '';
	let handoffDir = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'handoff-'));
		handoffDir = join(dir, 'handoff');
		require('node:fs').mkdirSync(handoffDir);
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('ignores pre-existing files in the handoff directory', async () => {
		writeFileSync(
			join(handoffDir, 'prev.json'),
			JSON.stringify({
				schema: 'mcp-vertex/handoff/1',
				reason: 'exact-repeat',
				from: { agent: 'a1' },
			}),
		);

		const seen: IHandoffEvent[] = [];
		const watcher = createHandoffWatcher({
			handoffDir,
			onHandoff: (e) => seen.push(...e),
		});

		// First check() primes seenFiles from the pre-existing file, no events.
		expect(await watcher.check()).toEqual([]);
		expect(seen).toEqual([]);
		watcher.stop();
	});

	it('detects newly created valid handoff files', async () => {
		const seen: IHandoffEvent[] = [];
		const watcher = createHandoffWatcher({
			handoffDir,
			onHandoff: (e) => seen.push(...e),
		});

		expect(await watcher.check()).toEqual([]);

		writeFileSync(
			join(handoffDir, 'new.json'),
			JSON.stringify({
				schema: 'mcp-vertex/handoff/1',
				reason: 'no-progress',
				from: { agent: 'a2' },
			}),
		);

		const events = await watcher.check();
		watcher.stop();

		expect(events.length).toBe(1);
		expect(events[0]?.agent).toBe('a2');
		expect(events[0]?.reason).toBe('no-progress');
		expect(seen.length).toBe(1);
		expect(seen[0]?.agent).toBe('a2');
	});

	it('ignores invalid JSON or non-handoff schema files', async () => {
		const seen: IHandoffEvent[] = [];
		const watcher = createHandoffWatcher({
			handoffDir,
			onHandoff: (e) => seen.push(...e),
		});

		// Prime first (no pre-existing files yet).
		expect(await watcher.check()).toEqual([]);

		writeFileSync(join(handoffDir, 'bad1.json'), '{ corrupt json');
		writeFileSync(
			join(handoffDir, 'bad2.json'),
			JSON.stringify({ schema: 'other/schema', reason: 'no-progress' }),
		);

		expect(await watcher.check()).toEqual([]);
		expect(seen).toEqual([]);
		watcher.stop();
	});
});

describe('notification plugin', async () => {
	const contextWithPaths = (
		root: string,
		options: Readonly<Record<string, unknown>>,
	): IMcpPluginContext => ({
		workspace: { root, resolve: (p: string) => join(root, p) },
		corePaths: {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		keepLegacy: false,
		pluginCacheDir: '.cache/mcp-vertex/notification',
		pluginDocsDir: 'docs/mcp-vertex/notification',
		namespacePrefix: 'notification',
		options,
		args: {},
	});

	it('accepts contained custom watch paths', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-paths-'));
		expect(() =>
			plugin.register(
				contextWithPaths(dir, {
					watchLockFile: 'custom/agents.lock.json',
					watchHandoffDir: 'custom/handoff',
				}),
			),
		).not.toThrow();
		rmSync(dir, { recursive: true, force: true });
	});

	it('rejects watch path traversal outside the workspace', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-paths-'));
		expect(() =>
			plugin.register(
				contextWithPaths(dir, { watchLockFile: '../agents.lock.json' }),
			),
		).toThrow(/invalid watchLockFile: path escapes workspace/);
		expect(() =>
			plugin.register(
				contextWithPaths(dir, { watchHandoffDir: '../../handoff' }),
			),
		).toThrow(/invalid watchHandoffDir: path escapes workspace/);
		rmSync(dir, { recursive: true, force: true });
	});

	it('rejects absolute watch paths', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-paths-'));
		expect(() =>
			plugin.register(
				contextWithPaths(dir, {
					watchLockFile: join(dir, 'lock.json'),
				}),
			),
		).toThrow(/invalid watchLockFile: absolute path not allowed/);
		expect(() =>
			plugin.register(
				contextWithPaths(dir, {
					watchHandoffDir: join(dir, 'handoff'),
				}),
			),
		).toThrow(/invalid watchHandoffDir: absolute path not allowed/);
		rmSync(dir, { recursive: true, force: true });
	});

	it('registers notify_status + knowledge and emits on release and handoff', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-plug-'));
		const ctx = {
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/notification',
			pluginDocsDir: 'docs/mcp-vertex/notification',
			namespacePrefix: 'notification',
			options: {
				intervalMs: 50,
			},
			args: {},
		} satisfies IMcpPluginContext;

		const reg = await plugin.register(ctx);
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'notify_status',
			'await_lock',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('lock-notifications');

		// Create handoff directory
		const handoffDir = join(dir, '.cache/mcp-vertex/handoff');
		require('node:fs').mkdirSync(handoffDir, { recursive: true });

		// Wire a fake server to capture logging notifications + the tool handler.
		const logs: any[] = [];
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

		// Let the watcher's async prime pass observe the empty directory first.
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Write a new handoff file
		writeFileSync(
			join(handoffDir, 'stuck-agent.json'),
			JSON.stringify({
				schema: 'mcp-vertex/handoff/1',
				reason: 'exact-repeat',
				from: { agent: 'my-agent' },
			}),
		);

		// Wait for the watcher to poll and trigger — poll the logs
		// array with a short retry loop instead of a fixed setTimeout
		// because the watcher cadence is load-dependent (flaked at 150ms
		// under parallel test load; 500ms × 10 retries is the smallest
		// deterministic upper bound).
		let stuckEvent: (typeof logs)[number] | undefined;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 50));
			stuckEvent = logs.find((l) => l.data?.event === 'stuck-detected');
			if (stuckEvent) break;
		}
		expect(
			stuckEvent,
			'stuck-detected log should appear after polling',
		).toBeDefined();
		expect(stuckEvent?.level).toBe('warning');
		expect(stuckEvent?.data?.agent).toBe('my-agent');
		expect(stuckEvent?.data?.handoffPath).toBe(
			'.cache/mcp-vertex/handoff/stuck-agent.json',
		);

		// stop the watcher via the server onclose hook (no leaked timer)
		fakeServer.server.onclose?.();
		rmSync(dir, { recursive: true, force: true });
	});

	it('registers await_lock with anti-polling guidance in the description', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'notify-await-'));
		const ctx = {
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/notification',
			pluginDocsDir: 'docs/mcp-vertex/notification',
			namespacePrefix: 'notification',
			options: { intervalMs: 50 },
			args: {},
		} satisfies IMcpPluginContext;

		const reg = await plugin.register(ctx);
		const descriptors: Array<{ name: string; description?: string }> = [];
		const fakeServer = {
			sendLoggingMessage: async () => {},
			server: { onclose: undefined as undefined | (() => void) },
			registerTool: (
				name: string,
				descriptor: { description?: string },
			) => {
				descriptors.push({
					name,
					...(descriptor.description === undefined
						? {}
						: { description: descriptor.description }),
				});
			},
		};
		await reg.tools![1]!.register(fakeServer as never);
		expect(descriptors).toHaveLength(1);
		expect(descriptors[0]?.name).toBe('notification_await_lock');
		expect(descriptors[0]?.description).toContain(
			'do NOT poll agent_lock status',
		);
		fakeServer.server.onclose?.();
		rmSync(dir, { recursive: true, force: true });
	});
});
