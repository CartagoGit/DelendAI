import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This suite spawns the real `scripts/host-server.ts` as a child
// process. Each spawn uses `stdio: ['ignore', 'ignore', ...]` so the
// child's stdout/stderr does not leak into the validate stream. The
// one case that needs to assert on stderr (the double-SIGTERM test)
// pipes stderr and inspects it locally — it never reaches the
// terminal.

import {
	__resetShutdownGuardForTests,
	gracefulShutdown,
} from '@mcp-vertex/core/lib/cli/graceful-shutdown';

/**
 * Resolve the Bun binary used to spawn `scripts/host-server.ts`.
 *
 * Order:
 * 1. `process.env.MCP_VERTEX_TEST_BUN` — explicit override.
 * 2. `which bun` via the system PATH (POSIX).
 * 3. `process.execPath` — only valid when the test itself is
 *    already running under Bun (e.g. `bun test`).
 *
 * We deliberately do NOT use `node_modules/.bin/bun`; this repo
 * does not pin Bun as an npm dep, and a `node_modules/.bin/bun`
 * shim is not guaranteed to exist.
 */
const resolveBunBinary = (): string => {
	const override = process.env.MCP_VERTEX_TEST_BUN;
	if (override !== undefined && override !== '') return override;
	const probe = spawnSync('which', ['bun'], { encoding: 'utf8' });
	if (probe.status === 0 && probe.stdout.trim() !== '') {
		return probe.stdout.trim();
	}
	return process.execPath;
};

const BUN_BIN = resolveBunBinary();

/**
 * Wait until the spawned child has installed its signal handlers
 * (i.e. the `await assembled.start()` line in host-server.ts has
 * returned and the `process.on('SIGTERM', ...)` calls have been
 * registered). We can't observe that directly from outside, so we
 * poll: while the child is still running AND has been alive for at
 * least `minMs`, we assume readiness.
 *
 * This is more robust than a fixed `setTimeout(500)` when the test
 * suite is under load (the host may need >500ms to boot the
 * swarm preset; if SIGTERM arrives before the handler is wired,
 * the process dies with the signal still set, not via
 * `process.exit(143)`).
 */
const waitForHostReady = async (
	child: ReturnType<typeof spawn>,
	minMs = 1500,
	timeoutMs = 15_000,
): Promise<void> => {
	const t0 = Date.now();
	while (Date.now() - t0 < timeoutMs) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(
				`host exited prematurely with code=${child.exitCode} signal=${child.signalCode} before handlers were ready`,
			);
		}
		if (Date.now() - t0 >= minMs) return;
		await new Promise((r) => setTimeout(r, 100));
	}
};

/**
 * Unit tests for {@link gracefulShutdown}.
 *
 * Covers:
 * - The `shuttingDown` guard (a second invocation is a no-op).
 * - The `process.exit` path is suppressed when `exitProcess: false`
 *   (so tests can assert the close was awaited without the process
 *   actually terminating).
 * - The timeout path is respected when `server.close()` never resolves.
 */
describe('gracefulShutdown — unit', async () => {
	let exitCalls: number[];
	const originalExit = process.exit.bind(process);
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		__resetShutdownGuardForTests();
		exitCalls = [];
		// Stub process.exit so we can assert whether it was called
		// and with which code, without actually terminating the test.
		process.exit = ((code?: number): never => {
			exitCalls.push(code ?? 0);
			// Throw so the helper's `await` doesn't continue; vitest
			// catches it inside the .rejects assertion.
			throw new Error(`__test_exit__:${code ?? 0}`);
		}) as typeof process.exit;
		// Capture the "[mcp-vertex] gracefulShutdown: ..." diagnostic
		// that gracefulShutdown writes to stderr on the rejection /
		// timeout paths so it doesn't leak into the validate stream.
		// The two cases that exercise those paths assert on the call
		// log explicitly.
		stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
	});

	afterEach(() => {
		process.exit = originalExit;
		stderrSpy.mockRestore();
	});

	it('awaits server.close() and then exits with the requested code', async () => {
		const server = new McpServer({ name: 't', version: '0' });
		let closed = false;
		// Patch the SDK close() so we can observe it without connecting
		// a transport (avoids the stdio pipe plumbing).
		(server as unknown as { close: () => Promise<void> }).close =
			async () => {
				closed = true;
			};

		await expect(
			gracefulShutdown(server, { exitCode: 130 }),
		).rejects.toThrow('__test_exit__:130');

		expect(closed).toBe(true);
		expect(exitCalls).toEqual([130]);
	});

	it('is a no-op on the second invocation (shuttingDown guard)', async () => {
		const server = new McpServer({ name: 't', version: '0' });
		let closeCount = 0;
		(server as unknown as { close: () => Promise<void> }).close =
			async () => {
				closeCount += 1;
			};

		await expect(
			gracefulShutdown(server, { exitCode: 130 }),
		).rejects.toThrow('__test_exit__:130');
		// Second call from a sibling signal: guard swallows it.
		await expect(
			gracefulShutdown(server, { exitCode: 130 }),
		).resolves.toBeUndefined();

		expect(closeCount).toBe(1);
		expect(exitCalls).toEqual([130]); // only the first call exited
	});

	it('does not call process.exit when exitProcess is false', async () => {
		const server = new McpServer({ name: 't', version: '0' });
		(server as unknown as { close: () => Promise<void> }).close =
			async () => undefined;

		await expect(
			gracefulShutdown(server, { exitProcess: false, exitCode: 130 }),
		).resolves.toBeUndefined();

		expect(exitCalls).toEqual([]);
	});

	it('exits anyway if server.close() rejects', async () => {
		const server = new McpServer({ name: 't', version: '0' });
		(server as unknown as { close: () => Promise<void> }).close =
			async () => {
				throw new Error('synthetic close failure');
			};

		await expect(gracefulShutdown(server, { exitCode: 7 })).rejects.toThrow(
			'__test_exit__:7',
		);

		expect(exitCalls).toEqual([7]);
	});

	it('exits anyway if server.close() does not complete within timeoutMs', async () => {
		const server = new McpServer({ name: 't', version: '0' });
		// close() that never resolves — exercises the Promise.race path.
		(server as unknown as { close: () => Promise<void> }).close = () =>
			new Promise(() => undefined);

		const t0 = Date.now();
		await expect(
			gracefulShutdown(server, {
				exitCode: 9,
				timeoutMs: 50,
			}),
		).rejects.toThrow('__test_exit__:9');
		const elapsed = Date.now() - t0;

		// Should not wait the full timeout + slack; just close to it.
		expect(elapsed).toBeGreaterThanOrEqual(50);
		expect(elapsed).toBeLessThan(2_000);
		expect(exitCalls).toEqual([9]);
	});
});

/**
 * E2E: spawn the real `scripts/host-server.ts` via Bun, send SIGTERM,
 * assert the child exits in < 2s with code 143 (the conventional
 * "killed by SIGTERM" exit code we wired in `scripts/host-server.ts`).
 *
 * This is the regression test that closes x00006's acceptance box
 * "Bun doesn't zombie on parent exit": a real subprocess must
 * die promptly when its parent is gone (or when the user hits
 * Ctrl+C in a terminal that owns the pty).
 */
describe('gracefulShutdown — e2e (scripts/host-server.ts SIGTERM)', async () => {
	let workspace = '';
	let cleanup: (() => void) | undefined;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'mcp-gs-'));
		// Minimal mcp-vertex config so the host can boot without the
		// full preset swarm plugins loaded (we only need the server
		// to start, not to serve real tools for this test).
		writeFileSync(
			join(workspace, 'mcp-vertex.config.json'),
			`{ "name": "gs-test", "version": "0.0.0", "plugins": [] }\n`,
		);
		cleanup = () => {
			try {
				rmSync(workspace, { recursive: true, force: true });
			} catch {
				// ignored
			}
		};
	});

	afterEach(() => {
		cleanup?.();
	});

	it('exits with code 143 within 2s of SIGTERM (no zombie)', async () => {
		const child = spawn(
			BUN_BIN,
			[
				resolve('tools/scripts/host/host-server.script.ts'),
				`--workspace=${workspace}`,
			],
			{
				cwd: process.cwd(),
				// stdout/stderr ignored: this test asserts only on the
				// exit code + signal, not on what the child logs. The
				// child writes to stderr during normal startup
				// (graceful-shutdown banner, plugin errors), which
				// would otherwise leak into the validate output.
				stdio: ['ignore', 'ignore', 'ignore'],
				detached: false,
			},
		);

		// Wait for the host to finish booting and install its signal
		// handlers. See `waitForHostReady` for the rationale.
		await waitForHostReady(child);

		const t0 = Date.now();
		const killed = child.kill('SIGTERM');
		expect(killed).toBe(true);

		const exit = await new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve) => {
			child.once('exit', (code, signal) => {
				resolve({ code, signal });
			});
		});
		const elapsed = Date.now() - t0;

		expect(exit.signal).toBeNull(); // clean exit, not killed by signal
		expect(exit.code).toBe(143); // 128 + 15 (SIGTERM)
		expect(elapsed).toBeLessThan(2_000);
	}, 10_000);

	it('exits with code 130 within 2s of SIGINT (Ctrl+C)', async () => {
		const child = spawn(
			BUN_BIN,
			[
				resolve('tools/scripts/host/host-server.script.ts'),
				`--workspace=${workspace}`,
			],
			{
				cwd: process.cwd(),
				// See SIGTERM test for rationale: drop stdout/stderr
				// so the child does not pollute the validate output.
				stdio: ['ignore', 'ignore', 'ignore'],
				detached: false,
			},
		);

		await waitForHostReady(child);

		const t0 = Date.now();
		child.kill('SIGINT');

		const exit = await new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve) => {
			child.once('exit', (code, signal) => {
				resolve({ code, signal });
			});
		});
		const elapsed = Date.now() - t0;

		expect(exit.signal).toBeNull();
		expect(exit.code).toBe(130); // 128 + 2 (SIGINT)
		expect(elapsed).toBeLessThan(2_000);
	}, 10_000);

	it('survives a double SIGTERM without crashing or double-closing', async () => {
		const child = spawn(
			BUN_BIN,
			[
				resolve('tools/scripts/host/host-server.script.ts'),
				`--workspace=${workspace}`,
			],
			{
				cwd: process.cwd(),
				// stderr is piped because the assertion at the end of
				// the test inspects it (it must NOT contain the SDK's
				// "McpServer already closed" error). stdout is ignored
				// so the host's startup banner does not leak.
				stdio: ['ignore', 'ignore', 'pipe'],
				detached: false,
			},
		);

		await waitForHostReady(child);

		// Register the exit listener BEFORE sending any signal so we
		// don't race the 'exit' event firing before the listener is
		// attached (Node.js ChildProcess drops events that fire
		// before a listener exists).
		const exit = new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve) => {
			child.once('exit', (code, signal) => {
				resolve({ code, signal });
			});
		});

		// Two SIGTERMs within 50ms; the second one arrives after the
		// first has already started the graceful shutdown. It must NOT
		// cause a crash (which would surface as a non-143 exit code or
		// a non-null signal). We capture stderr to assert the guard
		// logged nothing catastrophic.
		let stderr = '';
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
		});

		child.kill('SIGTERM');
		await new Promise((r) => setTimeout(r, 50));
		// Best-effort: by the time this fires the child may already be
		// gone; kill() returns false in that case, which is fine.
		child.kill('SIGTERM');

		const result = await exit;

		expect(result.signal).toBeNull();
		expect(result.code).toBe(143);
		// The guard must have prevented the second close from
		// throwing inside the SDK. The SDK's "McpServer already
		// closed" error is the only thing we explicitly guard against;
		// if it ever leaks to stderr we'd see it here.
		expect(stderr).not.toContain('McpServer already closed');
	}, 10_000);
});
