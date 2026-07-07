/**
 * stdio-transport.ts — the production stdio adapter for `mcp-server`
 * providers (f00067a S3).
 *
 * This is the "thin adapter deferred to S10" that {@link createMcpInvoker}
 * was designed around: it spawns the MCP server process and speaks
 * newline-delimited JSON-RPC (NDJSON) over its stdio — the exact framing the
 * S10 e2e proved against a real subprocess. One transport = one child; the
 * invoker creates a fresh transport per invocation and `close()`s it when
 * the call settles or is cancelled.
 *
 * Robustness contract:
 *  - stdout is line-buffered, so a JSON frame split across chunks is
 *    reassembled; non-JSON lines (banners, log noise) are skipped silently —
 *    never parsed further, never echoed anywhere (they may carry secrets).
 *  - outgoing requests (messages carrying an `id`) are tracked; if the child
 *    exits or fails to spawn before replying, the transport synthesizes a
 *    JSON-RPC error response for each in-flight id, so the invoker rejects
 *    instead of hanging until the invoke timeout.
 *  - `close()` is idempotent: SIGTERM now, SIGKILL after `sigkillGraceMs` if
 *    the child has not exited. The grace timer is `unref()`'d and cleared on
 *    exit, so a closed transport never keeps the host process alive.
 *
 * The child is reached through an INJECTED spawner seam (house style: see
 * `cli.ts`), with a default that wraps `node:child_process.spawn`. The child
 * env is inherited unless `env` is given, in which case ONLY those variables
 * are passed. `cwd` comes from options — never `process.cwd()`.
 */
import { spawn } from 'node:child_process';

import type { IJsonRpcMessage, IJsonRpcTransport } from './mcp-client';

/** The slice of a child process the stdio transport actually uses. */
export interface IStdioChildProcess {
	onStdout(listener: (chunk: string) => void): void;
	onExit(listener: (code: number | null) => void): void;
	onError(listener: (error: Error) => void): void;
	/** Write one already-framed line to stdin. Must never throw. */
	write(line: string): void;
	kill(signal: 'SIGTERM' | 'SIGKILL'): void;
}

/** Spawn options forwarded to the seam. No secrets are ever logged. */
export interface IStdioSpawnOptions {
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
}

/** Spawns the MCP server process. Injected so tests can observe it. */
export type StdioSpawner = (
	command: string,
	args: readonly string[],
	options: IStdioSpawnOptions,
) => IStdioChildProcess;

/** Default seam over `node:child_process.spawn`. */
export const nodeStdioSpawner: StdioSpawner = (
	command,
	args,
	options,
): IStdioChildProcess => {
	const child = spawn(command, [...args], {
		stdio: ['pipe', 'pipe', 'pipe'],
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.env !== undefined ? { env: { ...options.env } } : {}),
	});
	child.stdout?.setEncoding('utf8');
	// stdin can EPIPE when the server dies mid-write; swallow it so a dead
	// child never crashes the host process.
	child.stdin?.on('error', () => undefined);
	// stderr is drained (backpressure) but never parsed or persisted — it may
	// carry secrets.
	child.stderr?.on('data', () => undefined);
	return {
		onStdout: (listener) => {
			child.stdout?.on('data', (chunk: string | Buffer) =>
				listener(chunk.toString()),
			);
		},
		onExit: (listener) => {
			child.on('exit', (code) =>
				listener(typeof code === 'number' ? code : null),
			);
		},
		onError: (listener) => {
			child.on('error', listener);
		},
		write: (line) => {
			if (child.stdin?.writable) {
				child.stdin.write(line);
			}
		},
		kill: (signal) => {
			child.kill(signal);
		},
	};
};

export interface IStdioTransportOptions {
	/** Injectable spawner (tests observe the child). Default: real spawn. */
	readonly spawner?: StdioSpawner;
	/** Child working directory. NEVER defaulted from `process.cwd()`. */
	readonly cwd?: string;
	/**
	 * Exact child environment. When given, ONLY these variables reach the
	 * child; when omitted the child inherits the parent env (spawn default).
	 */
	readonly env?: Readonly<Record<string, string>>;
	/** ms between close()'s SIGTERM and the escalating SIGKILL. Default 2000. */
	readonly sigkillGraceMs?: number;
	/** Injectable timer (tests). Default real `setTimeout` (unref'd). */
	readonly setTimer?: (fn: () => void, ms: number) => { clear(): void };
}

const defaultSetTimer = (fn: () => void, ms: number): { clear(): void } => {
	const handle = setTimeout(fn, ms);
	handle.unref?.();
	return { clear: () => clearTimeout(handle) };
};

/**
 * Create an {@link IJsonRpcTransport} over a freshly spawned MCP server
 * process, framing JSON-RPC as newline-delimited JSON. Server messages that
 * arrive before `onMessage` registers a listener are queued, so no reply is
 * lost to the registration race.
 */
export const createStdioTransport = (
	command: string,
	args: readonly string[],
	options: IStdioTransportOptions = {},
): IJsonRpcTransport => {
	const graceMs = options.sigkillGraceMs ?? 2000;
	const setTimer = options.setTimer ?? defaultSetTimer;
	const spawner = options.spawner ?? nodeStdioSpawner;
	const child = spawner(command, args, {
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.env !== undefined ? { env: options.env } : {}),
	});

	let listener: ((message: IJsonRpcMessage) => void) | undefined;
	const queued: IJsonRpcMessage[] = [];
	/** ids of outgoing requests still awaiting a reply. */
	const pending = new Set<number | string>();
	let buffer = '';
	let closed = false;
	let exited = false;
	let killTimer: { clear(): void } | undefined;

	const deliver = (message: IJsonRpcMessage): void => {
		if (message.id !== undefined) pending.delete(message.id);
		if (listener !== undefined) listener(message);
		else queued.push(message);
	};

	/** Reject every in-flight request with a synthesized JSON-RPC error. */
	const failPending = (reason: string): void => {
		for (const id of [...pending]) {
			deliver({
				jsonrpc: '2.0',
				id,
				error: { code: -32000, message: reason },
			});
		}
		pending.clear();
	};

	const drainLine = (line: string): void => {
		if (line.trim().length === 0) return;
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			// Non-JSON noise (banner / log line). Skipped, never echoed.
			return;
		}
		if (message === null || typeof message !== 'object') return;
		deliver(message as IJsonRpcMessage);
	};

	child.onStdout((chunk) => {
		if (closed) return;
		buffer += chunk;
		let idx = buffer.indexOf('\n');
		while (idx !== -1) {
			drainLine(buffer.slice(0, idx));
			buffer = buffer.slice(idx + 1);
			idx = buffer.indexOf('\n');
		}
	});

	child.onExit((code) => {
		exited = true;
		killTimer?.clear();
		killTimer = undefined;
		if (closed) return;
		// A reply written without a trailing newline still counts.
		if (buffer.length > 0) drainLine(buffer);
		buffer = '';
		closed = true;
		failPending(
			`mcp-server stdio child exited (${
				code === null ? 'signal' : `code ${code}`
			}) before replying`,
		);
	});

	child.onError((error) => {
		if (closed) return;
		closed = true;
		buffer = '';
		failPending(`mcp-server stdio child failed to spawn: ${error.message}`);
	});

	return {
		send: (message) => {
			if (closed) return;
			if (message.id !== undefined) pending.add(message.id);
			child.write(`${JSON.stringify(message)}\n`);
		},
		onMessage: (fn) => {
			listener = fn;
			while (queued.length > 0) {
				const next = queued.shift();
				if (next !== undefined) fn(next);
			}
		},
		close: () => {
			if (closed) return; // idempotent; also a no-op after exit/error
			closed = true;
			buffer = '';
			queued.length = 0;
			pending.clear();
			if (exited) return;
			child.kill('SIGTERM');
			killTimer = setTimer(() => {
				if (!exited) child.kill('SIGKILL');
			}, graceMs);
		},
	};
};
