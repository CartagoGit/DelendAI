/**
 * invoke-real-subprocess.e2e.spec.ts — f00067 S10 live subprocess smoke.
 *
 * Acceptance: "boots a real subprocess and makes a round-trip call (no
 * network spend); asserts a structured routing decision + tool-call result."
 *
 * PATH TAKEN: the REAL stub-child round-trip (not the skipIf+mock fallback).
 * The production `createMcpInvoker` speaks JSON-RPC over an INJECTED
 * `IJsonRpcTransport` seam — the real stdio transport that spawns a
 * `codex mcp-server` was the thin adapter explicitly "deferred to S10". So
 * this test supplies exactly that adapter: a real stdio transport that
 * spawns a tiny stub MCP server as the child and speaks newline-delimited
 * JSON to it. That exercises the REAL invoker + a REAL subprocess + REAL
 * stdio, driven end-to-end through the REAL {@link InvocationManager} and
 * the REAL fallback planner — with zero network and zero API spend.
 *
 * The child is `process.execPath` (the same node/bun already running the
 * suite — always present, so no dependency on `codex` being installed),
 * evaluating an inline stub via `-e`. Every spawned child is tracked and
 * killed in afterEach so nothing leaks under the parallel suite.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderKind,
} from '@delendai/core/public';

import { InvocationManager } from '../../src/lib/invoke/manager';
import {
	createMcpInvoker,
	type IJsonRpcMessage,
	type IJsonRpcTransport,
} from '../../src/lib/subprocess/mcp-client';
import type { IKindInvoker } from '../../src/lib/invoke/types';

/**
 * A tiny stub MCP server. Reads newline-delimited JSON-RPC from stdin and,
 * for a `tools/call`, echoes the tool name + prompt back in a
 * `CallToolResult`-shaped result. No initialize handshake is needed — the
 * production `createMcpInvoker` sends only `tools/call`.
 */
const STUB_MCP_SERVER = `
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (d) => {
	buf += d;
	let i = buf.indexOf('\\n');
	while (i !== -1) {
		const line = buf.slice(0, i);
		buf = buf.slice(i + 1);
		i = buf.indexOf('\\n');
		if (line.trim() === '') continue;
		let msg;
		try { msg = JSON.parse(line); } catch (e) { continue; }
		if (msg.method === 'tools/call') {
			const args = (msg.params && msg.params.arguments) || {};
			const res = {
				jsonrpc: '2.0',
				id: msg.id,
				result: {
					content: [{ type: 'text', text: 'pong:' + (args.prompt || '') }],
					structuredContent: { echoedTool: msg.params && msg.params.name, ok: true },
				},
			};
			process.stdout.write(JSON.stringify(res) + '\\n');
		}
	}
});
`;

const children: ChildProcessWithoutNullStreams[] = [];

/**
 * The real stdio transport adapter (the seam deferred to S10). Spawns the
 * stub child and frames JSON-RPC as newline-delimited JSON. Messages that
 * arrive before a listener is registered are queued, so no reply is lost.
 */
const spawnStubTransport = (): IJsonRpcTransport => {
	const child = spawn(process.execPath, ['-e', STUB_MCP_SERVER], {
		stdio: ['pipe', 'pipe', 'pipe'],
	}) as ChildProcessWithoutNullStreams;
	children.push(child);

	let listener: ((message: IJsonRpcMessage) => void) | undefined;
	const queued: IJsonRpcMessage[] = [];
	let buf = '';
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (chunk: string) => {
		buf += chunk;
		let idx = buf.indexOf('\n');
		while (idx !== -1) {
			const line = buf.slice(0, idx);
			buf = buf.slice(idx + 1);
			idx = buf.indexOf('\n');
			if (line.trim() === '') continue;
			let msg: IJsonRpcMessage;
			try {
				msg = JSON.parse(line) as IJsonRpcMessage;
			} catch {
				continue;
			}
			if (listener !== undefined) listener(msg);
			else queued.push(msg);
		}
	});

	return {
		send: (message) => {
			child.stdin.write(`${JSON.stringify(message)}\n`);
		},
		onMessage: (fn) => {
			listener = fn;
			while (queued.length > 0) {
				const m = queued.shift();
				if (m !== undefined) fn(m);
			}
		},
		close: () => {
			child.kill('SIGKILL');
		},
	};
};

const mcpProvider = (): IProviderCapabilities => ({
	id: 'stub-codex',
	kind: 'mcp-server',
	invoke: { kind: 'mcp-server', server: 'stub', tool: 'echo', args: {} },
	modelId: 'stub-codex-model',
	contextWindow: 200_000,
	costTier: 3,
	strengths: ['code-edit'],
	weaknesses: [],
});

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

const failing: IKindInvoker = {
	start: () => ({
		promise: Promise.reject(new Error('wrong kind')),
		cancel: () => undefined,
	}),
};

describe('f00067 S10 — real subprocess round-trip (mcp-server)', () => {
	afterEach(() => {
		for (const child of children.splice(0)) {
			if (!child.killed) child.kill('SIGKILL');
		}
	});

	it('boots a real subprocess, round-trips a tool call, and returns a structured decision + result', async () => {
		const providers = [mcpProvider()];
		const invokers: Record<ProviderKind, IKindInvoker> = {
			cli: failing,
			api: failing,
			// The REAL invoker, wired to a REAL stdio transport + subprocess.
			'mcp-server': createMcpInvoker({
				transportFactory: () => spawnStubTransport(),
			}),
			subscription: failing,
		};
		const manager = new InvocationManager({
			providers,
			availabilityOf: available,
			invokers,
			defaultCostPreference: 'balanced',
			// Generous cap so subprocess spawn under parallel-suite load never
			// trips the timeout ladder (the round-trip is what we assert).
			invokeTimeoutMs: 20_000,
			maxFallbackDepth: 1,
			fallbackStrategy: 'rerank',
			// mcp-server is not a spend kind, so no confirmation gating applies.
			executeApi: false,
			confirmBeforeExecute: false,
			autoBypassConfirmed: false,
		});

		const out = await manager.invoke({
			task: 'ping',
			mode: 'implement',
			capabilityHints: ['code-edit'],
		});

		// Structured routing decision.
		expect(out.error).toBeUndefined();
		expect(out.decision.strategy).toBe('mcp-tool');
		expect(out.decision.targetProvider.kind).toBe('mcp-server');
		expect(out.decision.targetProvider.id).toBe('stub-codex');
		expect(out.decision.scoringTrace.length).toBeGreaterThan(0);

		// Tool-call result, produced by the real subprocess over real stdio.
		expect(out.result?.text).toBe('pong:ping');
		expect(out.result?.structuredContent).toEqual({
			echoedTool: 'echo',
			ok: true,
		});
	});
});
