/**
 * server-registry.spec.ts — the lazy subprocess registry, the `status`
 * tool, the `call` invoke proxy (f00068 S2), and the gate-decision-8
 * usage-tracking round-trip.
 *
 * Everything runs against an INJECTED spawner + timer seam (no real
 * children here — the real-subprocess path is
 * `tests/e2e/filesystem-roundtrip.e2e.spec.ts`).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	ExternalServerRegistry,
	type IRegistryServerEntry,
	type IStdioChildProcess,
	type SetTimer,
	type StdioSpawner,
} from '../../../src/lib/subprocess/server-registry';
import {
	buildCallToolRegistration,
	CallOutputSchema,
	stripExtPrefix,
} from '../../../src/lib/tools/invoke-proxy';
import {
	buildStatusToolRegistration,
	StatusOutputSchema,
} from '../../../src/lib/tools/status.tool';

// Gate decision 8: tool names are opaque strings in the usage-tracking
// NDJSON log. Not part of the workspace alias table, so imported by
// relative path (same monorepo, same tsconfig base).
import { RecordBuffer } from '../../../../usage-tracking/src/lib/record-buffer';
import { buildRecord } from '../../../../usage-tracking/src/lib/record';
import {
	buildSummary,
	readInvocations,
} from '../../../../usage-tracking/src/lib/rollup';

// ─── seams ───────────────────────────────────────────────────────────

class FakeChild implements IStdioChildProcess {
	readonly written: string[] = [];
	readonly kills: string[] = [];
	private stdoutListeners: Array<(chunk: string) => void> = [];
	private exitListeners: Array<(code: number | null) => void> = [];
	private errorListeners: Array<(error: Error) => void> = [];

	constructor(readonly pid: number) {}

	onStdout(listener: (chunk: string) => void): void {
		this.stdoutListeners.push(listener);
	}
	onExit(listener: (code: number | null) => void): void {
		this.exitListeners.push(listener);
	}
	onError(listener: (error: Error) => void): void {
		this.errorListeners.push(listener);
	}
	write(line: string): void {
		this.written.push(line);
	}
	kill(signal: 'SIGTERM' | 'SIGKILL'): void {
		this.kills.push(signal);
	}

	emitStdout(chunk: string): void {
		for (const listener of this.stdoutListeners) listener(chunk);
	}
	emitExit(code: number | null): void {
		for (const listener of this.exitListeners) listener(code);
	}
	emitError(error: Error): void {
		for (const listener of this.errorListeners) listener(error);
	}

	/** Parse the i-th line written to stdin (a framed JSON-RPC request). */
	sent(index: number): { id: number; method: string; params: unknown } {
		const line = this.written[index];
		if (line === undefined) throw new Error(`nothing written at ${index}`);
		return JSON.parse(line) as {
			id: number;
			method: string;
			params: unknown;
		};
	}

	/** Frame + emit a JSON-RPC reply for the i-th request written. */
	reply(index: number, body: Record<string, unknown>): void {
		const { id } = this.sent(index);
		this.emitStdout(`${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`);
	}
}

interface IFakeTimer {
	readonly fn: () => void;
	readonly ms: number;
	cleared: boolean;
}

const makeTimerHarness = (): {
	timers: IFakeTimer[];
	setTimer: SetTimer;
	fireLast: () => void;
} => {
	const timers: IFakeTimer[] = [];
	const setTimer: SetTimer = (fn, ms) => {
		const timer: IFakeTimer = { fn, ms, cleared: false };
		timers.push(timer);
		return {
			clear: () => {
				timer.cleared = true;
			},
		};
	};
	return {
		timers,
		setTimer,
		fireLast: () => {
			const timer = timers[timers.length - 1];
			if (timer !== undefined && !timer.cleared) timer.fn();
		},
	};
};

const entry = (
	over: Partial<IRegistryServerEntry> = {},
): IRegistryServerEntry => ({
	version: '1.4.2',
	command: 'stub-mcp',
	args: ['--stdio'],
	...over,
});

interface IHarness {
	readonly registry: ExternalServerRegistry;
	readonly children: FakeChild[];
	readonly spawnCalls: Array<{
		command: string;
		args: readonly string[];
		cwd: string | undefined;
	}>;
	readonly timers: IFakeTimer[];
	readonly fireLast: () => void;
}

const makeHarness = (
	servers: Readonly<Record<string, IRegistryServerEntry>>,
	over: { callTimeoutMs?: number; now?: () => number } = {},
): IHarness => {
	const children: FakeChild[] = [];
	const spawnCalls: IHarness['spawnCalls'] = [];
	const spawner: StdioSpawner = (command, args, options) => {
		spawnCalls.push({ command, args, cwd: options.cwd });
		const child = new FakeChild(100 + children.length);
		children.push(child);
		return child;
	};
	const timerHarness = makeTimerHarness();
	const registry = new ExternalServerRegistry({
		servers,
		workspaceRoot: '/fake/workspace',
		spawner,
		setTimer: timerHarness.setTimer,
		...(over.callTimeoutMs !== undefined
			? { callTimeoutMs: over.callTimeoutMs }
			: {}),
		...(over.now !== undefined ? { now: over.now } : {}),
	});
	return {
		registry,
		children,
		spawnCalls,
		timers: timerHarness.timers,
		fireLast: timerHarness.fireLast,
	};
};

// The spec-side captureTool mirror used across this plugin's specs.
interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly config: { description: string; outputSchema: unknown };
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

const captureTool = async (reg: IToolRegistration): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			config: ICapturedTool['config'],
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, config, handler });
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('tool did not register');
	return tool;
};

// ─── registry: lazy boot + caching ───────────────────────────────────

describe('ExternalServerRegistry — lazy boot + caching', () => {
	it('spawns NOTHING at construction; declared servers start cold', () => {
		const h = makeHarness({ fs: entry(), gh: entry() });
		expect(h.spawnCalls).toHaveLength(0);
		expect(h.registry.status()).toEqual([
			{ id: 'fs', declared: true, running: false },
			{ id: 'gh', declared: true, running: false },
		]);
	});

	it('boots on the FIRST call and reuses the cached child on the second', async () => {
		const h = makeHarness({ fs: entry() });
		const first = h.registry.call('fs', 'read_file', { path: 'a.txt' });
		expect(h.spawnCalls).toHaveLength(1);
		h.children[0]?.reply(0, { result: { content: [] } });
		expect((await first).ok).toBe(true);

		const second = h.registry.call('fs', 'read_file', { path: 'b.txt' });
		expect(h.spawnCalls).toHaveLength(1); // cached — no second spawn
		h.children[0]?.reply(1, { result: { content: [] } });
		expect((await second).ok).toBe(true);
	});

	it('spawns with the declared command/args and the INJECTED workspace cwd (never process.cwd)', () => {
		const h = makeHarness({
			fs: entry({ command: 'npx', args: ['-y', 'pkg@1.4.2'] }),
		});
		void h.registry.call('fs', 'ping', {});
		expect(h.spawnCalls[0]).toEqual({
			command: 'npx',
			args: ['-y', 'pkg@1.4.2'],
			cwd: '/fake/workspace',
		});
	});

	it('forwards a JSON-RPC tools/call frame with the tool name + arguments', () => {
		const h = makeHarness({ fs: entry() });
		void h.registry.call('fs', 'read_file', { path: 'x.txt' });
		const sent = h.children[0]?.sent(0);
		expect(sent?.method).toBe('tools/call');
		expect(sent?.params).toEqual({
			name: 'read_file',
			arguments: { path: 'x.txt' },
		});
	});

	it('bootEager boots ONLY the eager:true servers at init', () => {
		const h = makeHarness({
			lazy: entry(),
			hot: entry({ eager: true, command: 'hot-cmd' }),
		});
		h.registry.bootEager();
		expect(h.spawnCalls).toHaveLength(1);
		expect(h.spawnCalls[0]?.command).toBe('hot-cmd');
		const rows = h.registry.status();
		expect(rows.find((r) => r.id === 'hot')?.running).toBe(true);
		expect(rows.find((r) => r.id === 'lazy')?.running).toBe(false);
	});

	it('single-flights the spawn: two in-flight calls share ONE child', async () => {
		const h = makeHarness({ fs: entry() });
		const a = h.registry.call('fs', 'one', {});
		const b = h.registry.call('fs', 'two', {});
		expect(h.spawnCalls).toHaveLength(1);
		const child = h.children[0];
		expect(child?.sent(0).id).not.toBe(child?.sent(1).id);
		child?.reply(0, { result: { n: 1 } });
		child?.reply(1, { result: { n: 2 } });
		expect(await a).toEqual({ ok: true, result: { n: 1 } });
		expect(await b).toEqual({ ok: true, result: { n: 2 } });
	});
});

// ─── registry: NDJSON framing ────────────────────────────────────────

describe('ExternalServerRegistry — NDJSON framing', () => {
	it('reassembles a JSON frame split across stdout chunks', async () => {
		const h = makeHarness({ fs: entry() });
		const pending = h.registry.call('fs', 'read_file', {});
		const child = h.children[0];
		const { id } = child?.sent(0) ?? { id: -1 };
		const frame = JSON.stringify({
			jsonrpc: '2.0',
			id,
			result: { whole: true },
		});
		child?.emitStdout(frame.slice(0, 7));
		child?.emitStdout(`${frame.slice(7)}\n`);
		expect(await pending).toEqual({ ok: true, result: { whole: true } });
	});

	it('skips non-JSON noise lines silently and still delivers the reply', async () => {
		const h = makeHarness({ fs: entry() });
		const pending = h.registry.call('fs', 'read_file', {});
		const child = h.children[0];
		child?.emitStdout('booting stub mcp v1...\n\n');
		child?.reply(0, { result: { ok: 1 } });
		expect(await pending).toEqual({ ok: true, result: { ok: 1 } });
	});
});

// ─── registry: failure paths (structured, never a crash) ────────────

describe('ExternalServerRegistry — failure paths', () => {
	it('unknown server → {ok:false, code:unknown-server} and NO spawn', async () => {
		const h = makeHarness({ fs: entry() });
		const outcome = await h.registry.call('nope', 'x', {});
		expect(outcome).toEqual({
			ok: false,
			code: 'unknown-server',
			message: expect.stringContaining('"nope" is not declared'),
		});
		expect(h.spawnCalls).toHaveLength(0);
	});

	it('a JSON-RPC error reply → {ok:false, code:call-failed} with the child message', async () => {
		const h = makeHarness({ fs: entry() });
		const pending = h.registry.call('fs', 'read_file', {});
		h.children[0]?.reply(0, {
			error: { code: -32601, message: 'unknown tool' },
		});
		expect(await pending).toEqual({
			ok: false,
			code: 'call-failed',
			message: 'unknown tool',
		});
	});

	it('child exits before replying → synthesized call-failed + status shows lastError', async () => {
		const h = makeHarness({ fs: entry() });
		const pending = h.registry.call('fs', 'read_file', {});
		h.children[0]?.emitExit(1);
		const outcome = await pending;
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.code).toBe('call-failed');
			expect(outcome.message).toContain('exited');
		}
		expect(h.registry.status()).toEqual([
			{
				id: 'fs',
				declared: true,
				running: false,
				pid: 100,
				bootedAt: expect.any(String),
				lastError: expect.stringContaining('exited'),
			},
		]);
	});

	it('spawn failure → synthesized call-failed + lastError, never a throw', async () => {
		const h = makeHarness({ fs: entry() });
		const pending = h.registry.call('fs', 'read_file', {});
		h.children[0]?.emitError(new Error('ENOENT: stub-mcp'));
		const outcome = await pending;
		expect(outcome).toEqual({
			ok: false,
			code: 'call-failed',
			message: expect.stringContaining('failed to spawn'),
		});
		expect(h.registry.status()[0]?.lastError).toContain('failed to spawn');
	});

	it('no reply within the deadline → {ok:false, code:call-timeout} (timer unblocks the caller)', async () => {
		const h = makeHarness({ fs: entry() }, { callTimeoutMs: 5000 });
		const pending = h.registry.call('fs', 'slow', {});
		h.fireLast(); // the call-timeout timer
		const outcome = await pending;
		expect(outcome).toEqual({
			ok: false,
			code: 'call-timeout',
			message: expect.stringContaining('5000ms'),
		});
		// A late reply after the timeout must not crash or double-settle.
		h.children[0]?.reply(0, { result: { late: true } });
	});

	it('re-boots a fresh child on the next call after the cached one died', async () => {
		const h = makeHarness({ fs: entry() });
		const first = h.registry.call('fs', 'x', {});
		h.children[0]?.emitExit(1);
		await first;
		const second = h.registry.call('fs', 'x', {});
		expect(h.spawnCalls).toHaveLength(2);
		h.children[1]?.reply(0, { result: { revived: true } });
		expect(await second).toEqual({ ok: true, result: { revived: true } });
		// A fresh boot clears the sticky lastError.
		expect(h.registry.status()[0]?.lastError).toBeUndefined();
	});
});

// ─── registry: close semantics (SIGTERM → SIGKILL) ───────────────────

describe('ExternalServerRegistry — close semantics', () => {
	it('closeAll SIGTERMs the child and escalates to SIGKILL after the grace timer', () => {
		const h = makeHarness({ fs: entry() });
		void h.registry.call('fs', 'x', {});
		h.registry.closeAll();
		expect(h.children[0]?.kills).toEqual(['SIGTERM']);
		h.fireLast(); // the sigkill grace timer
		expect(h.children[0]?.kills).toEqual(['SIGTERM', 'SIGKILL']);
	});

	it('clears the grace timer when the child exits in time (no SIGKILL)', () => {
		const h = makeHarness({ fs: entry() });
		void h.registry.call('fs', 'x', {});
		h.registry.closeAll();
		h.children[0]?.emitExit(0);
		h.fireLast(); // cleared — must be a no-op
		expect(h.children[0]?.kills).toEqual(['SIGTERM']);
	});

	it('a deliberate close flips running:false WITHOUT recording a lastError', () => {
		const h = makeHarness({ fs: entry() });
		void h.registry.call('fs', 'x', {});
		h.registry.closeAll();
		expect(h.registry.status()[0]).toEqual({
			id: 'fs',
			declared: true,
			running: false,
			pid: 100,
			bootedAt: expect.any(String),
		});
	});
});

// ─── status tool ─────────────────────────────────────────────────────

describe('status tool (compact, literal-precise rows)', () => {
	it('registers under the plugin namespace and returns schema-exact rows', async () => {
		const h = makeHarness(
			{ fs: entry() },
			{ now: () => Date.UTC(2026, 6, 9, 12, 0, 0) },
		);
		const tool = await captureTool(
			buildStatusToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
			}),
		);
		expect(tool.name).toBe('external-mcps_status');

		const cold = StatusOutputSchema.parse(
			(await tool.handler({})).structuredContent,
		);
		expect(cold).toEqual({
			ok: true,
			servers: [{ id: 'fs', declared: true, running: false }],
		});

		const pending = h.registry.call('fs', 'x', {});
		h.children[0]?.reply(0, { result: {} });
		await pending;
		const warm = StatusOutputSchema.parse(
			(await tool.handler({})).structuredContent,
		);
		expect(warm.servers).toEqual([
			{
				id: 'fs',
				declared: true,
				running: true,
				pid: 100,
				bootedAt: '2026-07-09T12:00:00.000Z',
			},
		]);
	});
});

// ─── invoke proxy tool ───────────────────────────────────────────────

describe('call tool (the ext.<server>.<tool> invocation surface)', () => {
	it('refuses with {ok:false, code:ack-required} by default (no acks recorded, S3 ships the ack tool) and does NOT boot', async () => {
		const h = makeHarness({ fs: entry() });
		const tool = await captureTool(
			buildCallToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
				requireHumanAckWhenLlmDecides: true,
			}),
		);
		expect(tool.name).toBe('external-mcps_call');
		const result = await tool.handler({ server: 'fs', tool: 'read_file' });
		const payload = CallOutputSchema.parse(result.structuredContent);
		expect(payload.ok).toBe(false);
		expect(payload.code).toBe('ack-required');
		expect(payload.hint).toContain('ack');
		expect(result.isError).toBeUndefined(); // structured, not a crash
		expect(h.spawnCalls).toHaveLength(0);
	});

	it('proceeds when the injected predicate reports a recorded ack', async () => {
		const h = makeHarness({ fs: entry() });
		const tool = await captureTool(
			buildCallToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
				requireHumanAckWhenLlmDecides: true,
				hasRecordedAck: (id) => id === 'fs',
			}),
		);
		const pending = tool.handler({
			server: 'fs',
			tool: 'read_file',
			args: { path: 'a.txt' },
		});
		h.children[0]?.reply(0, { result: { content: [] } });
		const payload = CallOutputSchema.parse(
			(await pending).structuredContent,
		);
		expect(payload).toEqual({ ok: true, result: { content: [] } });
	});

	it('proceeds without any ack when the knob is off', async () => {
		const h = makeHarness({ fs: entry() });
		const tool = await captureTool(
			buildCallToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
				requireHumanAckWhenLlmDecides: false,
			}),
		);
		const pending = tool.handler({ server: 'fs', tool: 'ping' });
		h.children[0]?.reply(0, { result: { pong: true } });
		expect(
			CallOutputSchema.parse((await pending).structuredContent),
		).toEqual({ ok: true, result: { pong: true } });
	});

	it('unknown/malformed server → structured {ok:false, code:unknown-server}, never a protocol error', async () => {
		const h = makeHarness({ fs: entry() });
		const tool = await captureTool(
			buildCallToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
				requireHumanAckWhenLlmDecides: true,
			}),
		);
		const result = await tool.handler({ server: 'gh ', tool: 'x' });
		const payload = CallOutputSchema.parse(result.structuredContent);
		expect(payload.ok).toBe(false);
		expect(payload.code).toBe('unknown-server');
		expect(payload.hint).toContain('declared: fs');
		expect(result.isError).toBeUndefined();
	});

	it('accepts the fully-qualified ext.<server>.<tool> form and forwards the bare name', async () => {
		expect(stripExtPrefix('fs', 'ext.fs.read_file')).toBe('read_file');
		expect(stripExtPrefix('fs', 'read_file')).toBe('read_file');
		expect(stripExtPrefix('fs', 'ext.gh.read_file')).toBe(
			'ext.gh.read_file',
		);

		const h = makeHarness({ fs: entry() });
		const tool = await captureTool(
			buildCallToolRegistration({
				namespacePrefix: 'external-mcps',
				registry: h.registry,
				requireHumanAckWhenLlmDecides: false,
			}),
		);
		const pending = tool.handler({
			server: 'fs',
			tool: 'ext.fs.read_file',
		});
		expect(h.children[0]?.sent(0).params).toEqual({
			name: 'read_file',
			arguments: {},
		});
		h.children[0]?.reply(0, { result: {} });
		await pending;
	});
});

// ─── gate decision 8: usage-tracking record→report round-trip ────────

describe('gate decision 8 — ext.* names round-trip usage-tracking record→report unchanged', () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir !== undefined) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it('records an ext.*-named call through the REAL record path and reads it back byte-identical', async () => {
		dir = await mkdtemp(join(tmpdir(), 'ext-usage-'));
		const logPath = join(dir, 'invocations.jsonl');
		const extName = 'ext.filesystem.read_file';

		// Record path: buildRecord (tool names are opaque strings) →
		// RecordBuffer NDJSON append (the plugin's durable writer).
		const record = buildRecord({
			toolName: extName,
			corePrefix: 'mcp-vertex',
			peerPrefixes: ['external-mcps', 'usage-tracking'],
			agent: { id: 'spec', kind: 'test', extension: 'vitest' },
			sessionId: 's-1',
			args: {},
			result: { content: [{ type: 'text', text: 'ok' }] },
			endedAt: Date.UTC(2026, 6, 9, 12, 0, 0),
			costOf: () => null,
		});
		expect(record.tool).toBe(extName); // opaque — no prefix mangling
		const buffer = new RecordBuffer(logPath);
		buffer.push(record);
		await buffer.close();

		// Report path: parse the NDJSON log + fold the summary.
		const parsed = await readInvocations(logPath);
		expect(parsed).toEqual([record]); // the whole row round-trips
		expect(parsed[0]?.tool).toBe(extName); // the name is UNCHANGED
		const summary = buildSummary(parsed, 30, Date.UTC(2026, 6, 10));
		expect(summary.totals.calls).toBe(1);
		expect(summary.byPlugin.map((b) => b.key)).toContain(record.plugin);
	});
});
