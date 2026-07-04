/**
 * mcp-client.ts — call an `mcp-server` provider as a JSON-RPC tool (S6).
 *
 * A `mcp-server` provider (e.g. one long-lived `codex mcp-server` process) is
 * reached with a `tools/call` JSON-RPC request over stdio. Cancellation
 * (CRITICAL I8) sends the standard `$/cancelRequest` notification carrying
 * the ACTIVE request id — no SIGKILL, because the server is long-lived and
 * shared across invocations.
 *
 * The JSON-RPC framing is spoken over an INJECTED transport seam, so this
 * whole file is unit-testable with a fake transport and never spawns a
 * subprocess. The real stdio transport (spawning `codex mcp-server` and
 * wiring it into the {@link SubprocessPool}) is a thin adapter deferred to
 * S10's live e2e — everything here is exercised without a live process.
 */
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from '../invoke/types';

/** A JSON-RPC message flowing in either direction. */
export interface IJsonRpcMessage {
	readonly jsonrpc: '2.0';
	readonly id?: number | string;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string };
}

/**
 * The stdio transport seam. `send` writes one framed JSON-RPC message; the
 * transport delivers server messages to the listener registered via
 * `onMessage`. `close` tears the transport down.
 */
export interface IJsonRpcTransport {
	send(message: IJsonRpcMessage): void;
	onMessage(listener: (message: IJsonRpcMessage) => void): void;
	close(): void;
}

export interface IMcpInvokerOptions {
	/** Creates a fresh transport for one server. Injected so tests fake it. */
	readonly transportFactory: (server: string) => IJsonRpcTransport;
}

/** Extract the assistant text + optional structured content from a result. */
const readToolResult = (result: unknown): IInvokeResult => {
	const r = result as
		| {
				content?: ReadonlyArray<{ type?: string; text?: string }>;
				structuredContent?: unknown;
		  }
		| undefined;
	const text = (r?.content ?? [])
		.filter((c) => c.type === 'text' && typeof c.text === 'string')
		.map((c) => c.text ?? '')
		.join('');
	return {
		text,
		...(r?.structuredContent !== undefined
			? { structuredContent: r.structuredContent }
			: {}),
	};
};

export const createMcpInvoker = (
	options: IMcpInvokerOptions,
): IKindInvoker => {
	let nextId = 1;

	return {
		start(request: IInvokeRequest): IActiveInvocation {
			if (request.invoke.kind !== 'mcp-server') {
				return {
					promise: Promise.reject(
						new Error(
							`mcp invoker got a ${request.invoke.kind} decision`,
						),
					),
					cancel: () => undefined,
				};
			}
			const invoke = request.invoke;
			const transport = options.transportFactory(invoke.server);
			const requestId = nextId++;
			let settled = false;

			const promise = new Promise<IInvokeResult>((resolve, reject) => {
				transport.onMessage((message) => {
					if (message.id !== requestId) return;
					settled = true;
					transport.close();
					if (message.error !== undefined) {
						reject(new Error(message.error.message));
						return;
					}
					resolve(readToolResult(message.result));
				});
				transport.send({
					jsonrpc: '2.0',
					id: requestId,
					method: 'tools/call',
					params: {
						name: invoke.tool,
						arguments: {
							...invoke.args,
							prompt: request.prompt,
						},
					},
				});
			});

			return {
				promise,
				cancel: () => {
					if (settled) return;
					settled = true;
					// Standard JSON-RPC cancellation: notify with the active
					// id, then release the transport. No SIGKILL — the server
					// is shared and long-lived.
					transport.send({
						jsonrpc: '2.0',
						method: '$/cancelRequest',
						params: { id: requestId },
					});
					transport.close();
				},
			};
		},
	};
};
