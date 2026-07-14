/**
 * server-registry.ts — lazy subprocess lifecycle for declared external
 * MCP servers (f00068 S2).
 *
 * TRANSPORT MIRRORED FROM
 * `plugins/orchestrator-runner/src/lib/subprocess/stdio-transport.ts`
 * (f00067a) — that module is internal to orchestrator-runner (not on its
 * `./public` surface), so it cannot be imported across plugins. The
 * framing contract is kept faithful to the source:
 *
 *  - newline-delimited JSON-RPC over the child's stdio, with partial
 *    frames reassembled across chunks and non-JSON noise lines skipped
 *    silently (never parsed further, never echoed — they may carry
 *    secrets; stderr is drained but never read);
 *  - outgoing requests are tracked; if the child exits or fails to spawn
 *    before replying, a JSON-RPC error response is synthesized for each
 *    in-flight id so callers reject instead of hanging;
 *  - `close()` is idempotent: SIGTERM now, SIGKILL after an unref'd 2s
 *    grace timer that is cleared when the child exits first.
 *
 * Two additive deltas vs. the source: the child seam exposes `pid` (for
 * `external_mcp_status`) and the transport accepts an `onClosed` hook so
 * the registry can flip a server to `running:false` when its child dies.
 *
 * Registry semantics (proposal S2):
 *  - declared servers (the plugin options `servers` record) spawn LAZILY
 *    on the first `call()`; the child is cached per server id;
 *  - a per-server `eager: true` opt-out boots at plugin init via
 *    {@link ExternalServerRegistry.bootEager};
 *  - the child cwd comes from the INJECTED `workspaceRoot`
 *    (`ctx.workspace.root`) — never `process.cwd()` (AGENTS.md invariant);
 *  - the spawn step is fully synchronous (cache check → spawn → cache
 *    write with no interleaving point), which is the in-memory
 *    `withFileMutex`-style single-flight the proposal's concurrency note
 *    requires: two agents calling `status`/`call` concurrently can never
 *    double-spawn the same server id.
 */
import { spawn } from 'node:child_process';

import type { IServerEntry } from '../options-schema';

/** A JSON-RPC message flowing in either direction (mirrors the source). */
export interface IJsonRpcMessage {
	readonly jsonrpc: '2.0';
	readonly id?: number | string;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string };
}

/** The slice of a child process the stdio transport actually uses. */
export interface IStdioChildProcess {
	/** OS pid when the spawn succeeded (surfaced by `external_mcp_status`). */
	readonly pid?: number;
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

/** Spawns the external MCP server process. Injected so tests observe it. */
export type StdioSpawner = (
	command: string,
	args: readonly string[],
	options: IStdioSpawnOptions,
) => IStdioChildProcess;

/** Default seam over `node:child_process.spawn` (mirrors the source). */
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
		...(child.pid !== undefined ? { pid: child.pid } : {}),
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

/** Injectable timer handle (mirrors the source; default unref'd). */
export type SetTimer = (fn: () => void, ms: number) => { clear(): void };

const defaultSetTimer: SetTimer = (fn, ms) => {
	const handle = setTimeout(fn, ms);
	handle.unref?.();
	return { clear: () => clearTimeout(handle) };
};

/** One booted child: the transport plus the pid the seam reported. */
interface IChildTransport {
	readonly pid: number | undefined;
	send(message: IJsonRpcMessage): void;
	onMessage(listener: (message: IJsonRpcMessage) => void): void;
	close(): void;
}

interface IChildTransportOptions {
	readonly spawner: StdioSpawner;
	readonly cwd: string;
	readonly setTimer: SetTimer;
	readonly sigkillGraceMs: number;
	/**
	 * Fired exactly once when the transport stops being usable: `reason`
	 * is `null` for a deliberate `close()` and a message for a child that
	 * exited or failed to spawn on its own.
	 */
	readonly onClosed: (reason: string | null) => void;
}

/**
 * Spawn one child and speak NDJSON JSON-RPC to it. Faithful mirror of the
 * source `createStdioTransport` (see file header) + the `pid`/`onClosed`
 * deltas the registry needs.
 */
const createChildTransport = (
	command: string,
	args: readonly string[],
	options: IChildTransportOptions,
): IChildTransport => {
	const child = options.spawner(command, args, { cwd: options.cwd });

	let listener: ((message: IJsonRpcMessage) => void) | undefined;
	const queued: IJsonRpcMessage[] = [];
	/** ids of outgoing requests still awaiting a reply. */
	const pending = new Set<number | string>();
	let buffer = '';
	let closed = false;
	let exited = false;
	let notified = false;
	let killTimer: { clear(): void } | undefined;

	const notifyClosed = (reason: string | null): void => {
		if (notified) return;
		notified = true;
		options.onClosed(reason);
	};

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
		const reason = `external MCP child exited (${
			code === null ? 'signal' : `code ${code}`
		}) before replying`;
		failPending(reason);
		notifyClosed(reason);
	});

	child.onError((error) => {
		if (closed) return;
		closed = true;
		buffer = '';
		const reason = `external MCP child failed to spawn: ${error.message}`;
		failPending(reason);
		notifyClosed(reason);
	});

	return {
		pid: child.pid,
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
			notifyClosed(null);
			if (exited) return;
			child.kill('SIGTERM');
			killTimer = options.setTimer(() => {
				if (!exited) child.kill('SIGKILL');
			}, options.sigkillGraceMs);
		},
	};
};

/**
 * A declared server as the REGISTRY consumes it. `eager` is registry-level
 * for now: the S1 config schema (`options-schema.ts`, strict) does not
 * accept the key yet — wiring it into the config contract is a follow-up
 * outside the S2 file set.
 */
export interface IRegistryServerEntry extends IServerEntry {
	/** Boot at plugin init instead of on the first call (lazy default). */
	readonly eager?: boolean;
}

export interface IServerRegistryOptions {
	/** The declared roster (plugin options `servers`, id → entry). */
	readonly servers: Readonly<Record<string, IRegistryServerEntry>>;
	/** Child cwd — `ctx.workspace.root`, NEVER `process.cwd()`. */
	readonly workspaceRoot: string;
	/** Injectable spawner (tests observe the children). Default: real spawn. */
	readonly spawner?: StdioSpawner;
	/** Injectable timer (tests). Default real `setTimeout` (unref'd). */
	readonly setTimer?: SetTimer;
	/** ms between close()'s SIGTERM and the escalating SIGKILL. Default 2000. */
	readonly sigkillGraceMs?: number;
	/** Per-call reply deadline before a structured timeout. Default 30000. */
	readonly callTimeoutMs?: number;
	/** Clock seam for `bootedAt` stamps (tests). Default `Date.now`. */
	readonly now?: () => number;
}

/** One compact `external_mcp_status` row. */
export interface IServerStatusRow {
	readonly id: string;
	readonly declared: true;
	readonly running: boolean;
	readonly pid?: number;
	readonly bootedAt?: string;
	readonly lastError?: string;
}

export type ExternalCallFailureCode =
	| 'unknown-server'
	| 'call-failed'
	| 'call-timeout';

/** Structured outcome of one routed call — never a thrown crash. */
export type IExternalCallOutcome =
	| { readonly ok: true; readonly result: unknown }
	| {
			readonly ok: false;
			readonly code: ExternalCallFailureCode;
			readonly message: string;
	  };

const DEFAULT_SIGKILL_GRACE_MS = 2000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;

/** Mutable per-server runtime state behind the status rows. */
interface IServerRuntime {
	transport: IChildTransport | null;
	running: boolean;
	pid: number | undefined;
	bootedAt: string | undefined;
	lastError: string | undefined;
	/** In-flight request id → settle callback (one reply each). */
	readonly waiters: Map<number | string, (msg: IJsonRpcMessage) => void>;
}

/**
 * The per-boot subprocess registry: one cached child per declared server
 * id, spawned lazily on first call (or at init for `eager: true`).
 */
export class ExternalServerRegistry {
	private readonly runtime = new Map<string, IServerRuntime>();
	private readonly spawner: StdioSpawner;
	private readonly setTimer: SetTimer;
	private readonly sigkillGraceMs: number;
	private readonly callTimeoutMs: number;
	private readonly now: () => number;
	private nextId = 1;

	constructor(private readonly options: IServerRegistryOptions) {
		this.spawner = options.spawner ?? nodeStdioSpawner;
		this.setTimer = options.setTimer ?? defaultSetTimer;
		this.sigkillGraceMs =
			options.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;
		this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
		this.now = options.now ?? Date.now;
	}

	/** Sorted declared server ids (the roster keys). */
	declaredIds(): readonly string[] {
		return Object.keys(this.options.servers).sort();
	}

	/** True iff `id` is in the declared roster. */
	has(id: string): boolean {
		return Object.hasOwn(this.options.servers, id);
	}

	/** Boot every `eager: true` server now (plugin init opt-out of lazy). */
	bootEager(): void {
		for (const [id, entry] of Object.entries(this.options.servers)) {
			if (entry.eager === true) this.ensureBooted(id);
		}
	}

	/** Compact per-server rows for `external_mcp_status`. */
	status(): IServerStatusRow[] {
		return this.declaredIds().map((id) => {
			const state = this.runtime.get(id);
			return {
				id,
				declared: true,
				running: state?.running ?? false,
				...(state?.pid !== undefined ? { pid: state.pid } : {}),
				...(state?.bootedAt !== undefined
					? { bootedAt: state.bootedAt }
					: {}),
				...(state?.lastError !== undefined
					? { lastError: state.lastError }
					: {}),
			};
		});
	}

	/**
	 * Route one `ext.<server>.<tool>` invocation: boot the child if needed,
	 * forward a JSON-RPC `tools/call`, and settle with a structured outcome
	 * (reply, synthesized child-death error, or timeout) — never a crash.
	 */
	async call(
		server: string,
		tool: string,
		args: Readonly<Record<string, unknown>> = {},
	): Promise<IExternalCallOutcome> {
		if (!this.has(server)) {
			const declared = this.declaredIds();
			return {
				ok: false,
				code: 'unknown-server',
				message: `"${server}" is not declared under plugins.external-mcps.servers (declared: ${
					declared.length > 0 ? declared.join(', ') : 'none'
				})`,
			};
		}
		const state = this.ensureBooted(server);
		const transport = state.transport;
		if (transport === null) {
			return {
				ok: false,
				code: 'call-failed',
				message: state.lastError ?? `"${server}" transport unavailable`,
			};
		}
		const id = this.nextId++;
		return await new Promise<IExternalCallOutcome>((resolve) => {
			let settled = false;
			const timer = this.setTimer(() => {
				if (settled) return;
				settled = true;
				state.waiters.delete(id);
				resolve({
					ok: false,
					code: 'call-timeout',
					message: `"${server}".${tool} did not reply within ${this.callTimeoutMs}ms`,
				});
			}, this.callTimeoutMs);
			state.waiters.set(id, (msg) => {
				if (settled) return;
				settled = true;
				timer.clear();
				if (msg.error !== undefined) {
					resolve({
						ok: false,
						code: 'call-failed',
						message: msg.error.message,
					});
					return;
				}
				resolve({ ok: true, result: msg.result });
			});
			transport.send({
				jsonrpc: '2.0',
				id,
				method: 'tools/call',
				params: { name: tool, arguments: { ...args } },
			});
		});
	}

	/** SIGTERM every cached child (SIGKILL after the unref'd grace). */
	closeAll(): void {
		for (const state of this.runtime.values()) {
			state.transport?.close();
		}
	}

	/**
	 * Return the cached runtime for `id`, spawning the child when absent
	 * or no longer running. Fully synchronous — the cache-check→spawn→
	 * cache-write sequence has no interleaving point, so it acts as the
	 * in-memory single-flight lock around the spawn step.
	 */
	private ensureBooted(id: string): IServerRuntime {
		const cached = this.runtime.get(id);
		if (cached?.running) return cached;

		const entry = this.options.servers[id];
		if (entry === undefined) {
			throw new Error(
				`ensureBooted called for undeclared server "${id}"`,
			);
		}
		const state: IServerRuntime = {
			transport: null,
			running: false,
			pid: undefined,
			bootedAt: undefined,
			lastError: cached?.lastError,
			waiters: cached?.waiters ?? new Map(),
		};
		this.runtime.set(id, state);
		const transport = createChildTransport(entry.command, entry.args, {
			spawner: this.spawner,
			cwd: this.options.workspaceRoot,
			setTimer: this.setTimer,
			sigkillGraceMs: this.sigkillGraceMs,
			onClosed: (reason) => {
				state.running = false;
				state.transport = null;
				if (reason !== null) state.lastError = reason;
			},
		});
		transport.onMessage((msg) => {
			if (msg.id === undefined) return;
			const waiter = state.waiters.get(msg.id);
			if (waiter === undefined) return;
			state.waiters.delete(msg.id);
			waiter(msg);
		});
		state.transport = transport;
		state.running = true;
		state.pid = transport.pid;
		state.bootedAt = new Date(this.now()).toISOString();
		state.lastError = undefined;
		return state;
	}
}
