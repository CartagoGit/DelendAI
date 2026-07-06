/**
 * stdio-transport.spec.ts — f00067a S3 unit spec for the production stdio
 * transport. Same CI-friendly pattern as the S10 e2e: every child is the
 * already-running node (`process.execPath -e <stub>`), so no codex, no
 * network, deterministic and fast. Cleanup: every transport is close()'d in
 * afterEach (SIGTERM + unref'd SIGKILL escalation), so nothing leaks under
 * the parallel suite.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { mcpServerTransportFactory } from '../../../../src/lib/invoke/build-manager';
import type {
	IJsonRpcMessage,
	IJsonRpcTransport,
} from '../../../../src/lib/subprocess/mcp-client';
import {
	createStdioTransport,
	nodeStdioSpawner,
	type IStdioTransportOptions,
	type StdioSpawner,
} from '../../../../src/lib/subprocess/stdio-transport';

/** Echoes `tools/call` requests back as one whole NDJSON reply line. */
const STUB_ECHO = `
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
			process.stdout.write(JSON.stringify({
				jsonrpc: '2.0',
				id: msg.id,
				result: { content: [{ type: 'text', text: 'pong:' + (args.prompt || '') }] },
			}) + '\\n');
		}
	}
});
`;

/** Replies to the first request, but writes the frame in two split chunks. */
const STUB_SPLIT = `
process.stdin.setEncoding('utf8');
process.stdin.once('data', (d) => {
	const msg = JSON.parse(d.slice(0, d.indexOf('\\n')));
	const full = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'split-ok' }] } }) + '\\n';
	const cut = Math.floor(full.length / 2);
	process.stdout.write(full.slice(0, cut));
	setTimeout(() => process.stdout.write(full.slice(cut)), 40);
});
`;

/** Emits garbage lines (banner + broken JSON) before the real reply. */
const STUB_GARBAGE = `
process.stdin.setEncoding('utf8');
process.stdout.write('starting stub mcp server...\\n');
process.stdout.write('{"jsonrpc": <-- not json\\n');
process.stdin.once('data', (d) => {
	const msg = JSON.parse(d.slice(0, d.indexOf('\\n')));
	process.stdout.write('\\n');
	process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'after-garbage' }] } }) + '\\n');
});
`;

/** Crashes (exit 3) as soon as the first request arrives — no reply. */
const STUB_CRASH = `
process.stdin.setEncoding('utf8');
process.stdin.once('data', () => process.exit(3));
`;

/** Stays alive forever and dies on SIGTERM (default node behaviour). */
const STUB_HANG = `setInterval(() => {}, 1000);`;

/** Stays alive AND ignores SIGTERM — only SIGKILL can end it. */
const STUB_STUBBORN = `
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`;

const transports: IJsonRpcTransport[] = [];

/** Spawn a stub child through the REAL transport, tracked for cleanup. */
const stubTransport = (
	script: string,
	options: IStdioTransportOptions = {},
): IJsonRpcTransport => {
	const transport = createStdioTransport(
		process.execPath,
		['-e', script],
		options,
	);
	transports.push(transport);
	return transport;
};

/** Wraps the production spawner so a test can await the child's exit. */
const observeExit = (): {
	spawner: StdioSpawner;
	exited: Promise<number | null>;
} => {
	let resolveExit!: (code: number | null) => void;
	const exited = new Promise<number | null>((resolve) => {
		resolveExit = resolve;
	});
	const spawner: StdioSpawner = (command, args, options) => {
		const child = nodeStdioSpawner(command, args, options);
		child.onExit((code) => resolveExit(code));
		return child;
	};
	return { spawner, exited };
};

/** Buffers incoming messages; `next()` resolves with the following one. */
const collect = (transport: IJsonRpcTransport) => {
	const messages: IJsonRpcMessage[] = [];
	const waiters: Array<(message: IJsonRpcMessage) => void> = [];
	transport.onMessage((message) => {
		const waiter = waiters.shift();
		if (waiter !== undefined) waiter(message);
		else messages.push(message);
	});
	return {
		next: (): Promise<IJsonRpcMessage> => {
			const head = messages.shift();
			if (head !== undefined) return Promise.resolve(head);
			return new Promise((resolve) => waiters.push(resolve));
		},
	};
};

const callTool = (id: number, prompt: string): IJsonRpcMessage => ({
	jsonrpc: '2.0',
	id,
	method: 'tools/call',
	params: { name: 'echo', arguments: { prompt } },
});

describe('createStdioTransport (f00067a S3 — production NDJSON stdio)', () => {
	afterEach(() => {
		for (const transport of transports.splice(0)) transport.close();
	});

	it('round-trips a JSON-RPC request/response over a real child', async () => {
		const transport = stubTransport(STUB_ECHO);
		const inbox = collect(transport);
		transport.send(callTool(1, 'ping'));
		const reply = await inbox.next();
		expect(reply.id).toBe(1);
		expect(reply.error).toBeUndefined();
		expect(reply.result).toEqual({
			content: [{ type: 'text', text: 'pong:ping' }],
		});
	});

	it('reassembles a frame split across two stdout chunks', async () => {
		const transport = stubTransport(STUB_SPLIT);
		const inbox = collect(transport);
		transport.send(callTool(7, 'x'));
		const reply = await inbox.next();
		expect(reply.id).toBe(7);
		expect(reply.result).toEqual({
			content: [{ type: 'text', text: 'split-ok' }],
		});
	});

	it('skips non-JSON noise lines and still delivers the real reply', async () => {
		const transport = stubTransport(STUB_GARBAGE);
		const inbox = collect(transport);
		transport.send(callTool(2, 'x'));
		const reply = await inbox.next();
		expect(reply.id).toBe(2);
		expect(reply.result).toEqual({
			content: [{ type: 'text', text: 'after-garbage' }],
		});
	});

	it('synthesizes an error reply for in-flight requests when the child crashes', async () => {
		const transport = stubTransport(STUB_CRASH);
		const inbox = collect(transport);
		transport.send(callTool(3, 'x'));
		const reply = await inbox.next();
		expect(reply.id).toBe(3);
		expect(reply.result).toBeUndefined();
		expect(reply.error?.message).toMatch(/exited \(code 3\) before replying/);
	});

	it('close() kills the child, is idempotent, and send() after close is a no-op', async () => {
		const { spawner, exited } = observeExit();
		const transport = stubTransport(STUB_HANG, { spawner });
		transport.close();
		transport.close(); // idempotent — no throw, no double escalation
		expect(() => transport.send(callTool(4, 'x'))).not.toThrow();
		const code = await exited; // SIGTERM ends the default node child
		expect(code).toBeNull(); // signal exit → null code
	});

	it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
		const { spawner, exited } = observeExit();
		const transport = stubTransport(STUB_STUBBORN, {
			spawner,
			sigkillGraceMs: 100,
		});
		transport.close();
		const code = await exited; // only the escalated SIGKILL ends it
		expect(code).toBeNull();
	});

	it('does not deliver crash errors for requests that already settled', async () => {
		const transport = stubTransport(STUB_ECHO);
		const inbox = collect(transport);
		transport.send(callTool(5, 'done'));
		const reply = await inbox.next();
		expect(reply.id).toBe(5);
		transport.close(); // settled → client closes; the exit must stay silent
		// Nothing further may arrive; give the exit handler a beat to run.
		let extra: IJsonRpcMessage | undefined;
		void inbox.next().then((m) => {
			extra = m;
		});
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(extra).toBeUndefined();
	});
});

describe('mcpServerTransportFactory (build-manager wiring)', () => {
	afterEach(() => {
		for (const transport of transports.splice(0)) transport.close();
	});

	it('answers with a JSON-RPC error for an empty server descriptor', async () => {
		const transport = mcpServerTransportFactory('   ');
		transports.push(transport);
		const inbox = collect(transport);
		transport.send(callTool(1, 'x'));
		const reply = await inbox.next();
		expect(reply.id).toBe(1);
		expect(reply.error?.message).toMatch(/empty 'server' command/);
	});

	it('whitespace-splits the server string into command + argv and spawns it', async () => {
		// A real spawn through the factory: the child exits immediately, so
		// the pending request gets the synthesized exit error — proving the
		// tokenized command line actually ran.
		const transport = mcpServerTransportFactory(
			`${process.execPath} -e process.exit(0)`,
		);
		transports.push(transport);
		const inbox = collect(transport);
		transport.send(callTool(9, 'x'));
		const reply = await inbox.next();
		expect(reply.id).toBe(9);
		expect(reply.error?.message).toMatch(/exited \(code 0\) before replying/);
	});
});
