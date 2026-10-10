/**
 * build-manager.ts — assemble the default {@link InvocationManager} (S6).
 *
 * Wires the four per-kind invokers to their real seams for production use:
 *  - `cli`  → `node:child_process.spawn` adapted to the CLI seam.
 *  - `api`  → the global `fetch` adapted to the HTTP seam.
 *  - `mcp-server` → the real NDJSON stdio transport (f00067a S3): the
 *    descriptor's `server` string is split into command + argv and spawned
 *    per invocation; a malformed (empty) `server` answers with a JSON-RPC
 *    error so the fallback chain routes past it rather than crashing.
 *  - `subscription` → the best-effort passthrough invoker.
 *
 * Tests never use this factory — they construct {@link InvocationManager}
 * directly with mock invokers so nothing spawns or spends. This file exists
 * only so `register()` gets a working default with zero extra ceremony.
 */
import { spawn } from 'node:child_process';

import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@delendai/core/public';

import type { IRoutingDecision } from '@delendai/core/public';

import type { HealthStore } from '../healthcheck/store';
import type { CostPreference } from '../types';
import type { FallbackStrategy } from './fallback';
import { InvocationManager } from './manager';
import type { SpendCheckOutcome } from './spend-guard';
import {
	createApiInvoker,
	type HttpFetch,
	type IHttpResponse,
} from '../subprocess/api';
import {
	createCliInvoker,
	type CliSpawner,
	type ICliChildProcess,
} from '../subprocess/cli';
import {
	createMcpInvoker,
	type IJsonRpcMessage,
	type IJsonRpcTransport,
} from '../subprocess/mcp-client';
import { createStdioTransport } from '../subprocess/stdio-transport';
import { createSubscriptionInvoker } from '../subprocess/subscription';

const nodeCliSpawner: CliSpawner = (command, args): ICliChildProcess => {
	const child = spawn(command, [...args], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return {
		on: (_event, listener) => {
			child.on('exit', (code) =>
				listener(typeof code === 'number' ? code : null),
			);
		},
		onStdout: (listener) => {
			child.stdout?.on('data', (chunk: Buffer) =>
				listener(chunk.toString()),
			);
		},
		onStderr: (listener) => {
			child.stderr?.on('data', (chunk: Buffer) =>
				listener(chunk.toString()),
			);
		},
		kill: (signal) => {
			child.kill(signal);
		},
	};
};

const globalHttpFetch: HttpFetch = (url, init) =>
	fetch(url, init) as unknown as Promise<IHttpResponse>;

/**
 * A transport that answers every request with a JSON-RPC error. Used when
 * the provider's `server` descriptor cannot be turned into a spawnable
 * command: the invoker then rejects with a clear message (instead of
 * crashing or hanging until the invoke timeout) and the fallback chain
 * routes past the provider.
 */
const failingTransport = (reason: string): IJsonRpcTransport => {
	let listener: ((message: IJsonRpcMessage) => void) | undefined;
	return {
		onMessage: (fn) => {
			listener = fn;
		},
		send: (message) => {
			if (message.id === undefined) return;
			const id = message.id;
			queueMicrotask(() => {
				listener?.({
					jsonrpc: '2.0',
					id,
					error: { code: -32602, message: reason },
				});
			});
		},
		close: () => undefined,
	};
};

/**
 * Map an `mcp-server` descriptor's `server` field to a spawnable command
 * line. The descriptor carries one string (e.g. `codex mcp-server`), so it
 * is split on whitespace: first token = command, rest = argv. Exported for
 * the stdio-transport spec.
 */
export const mcpServerTransportFactory = (
	server: string,
): IJsonRpcTransport => {
	const tokens = server
		.trim()
		.split(/\s+/u)
		.filter((token) => token.length > 0);
	const command = tokens[0];
	if (command === undefined) {
		return failingTransport(
			"mcp-server provider has an empty 'server' command; fix the provider's invoke descriptor",
		);
	}
	return createStdioTransport(command, tokens.slice(1));
};

export interface IBuildManagerOptions {
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly defaultCostPreference: CostPreference;
	readonly invokeTimeoutMs: number;
	readonly subprocessPoolSize: number;
	readonly concurrencyLimit: number;
	readonly maxFallbackDepth: number;
	readonly fallbackStrategy: FallbackStrategy;
	readonly executeApi: boolean;
	readonly confirmBeforeExecute: boolean;
	readonly autoBypassConfirmed: boolean;
	/** S7 circuit-breaker seam (see {@link InvocationManager}). */
	readonly checkSpend?: (
		decision: IRoutingDecision,
		strategy: FallbackStrategy,
	) => SpendCheckOutcome;
}

export const buildDefaultInvocationManager = (
	options: IBuildManagerOptions,
): InvocationManager => {
	const cliInvoker = createCliInvoker({ spawner: nodeCliSpawner });
	const apiInvoker = createApiInvoker({ fetchFn: globalHttpFetch });
	const mcpInvoker = createMcpInvoker({
		transportFactory: mcpServerTransportFactory,
	});
	const subscriptionInvoker = createSubscriptionInvoker();

	return new InvocationManager({
		providers: options.providers,
		availabilityOf: (id): IProviderAvailability => options.health.get(id),
		invokers: {
			cli: cliInvoker,
			api: apiInvoker,
			'mcp-server': mcpInvoker,
			subscription: subscriptionInvoker,
		},
		defaultCostPreference: options.defaultCostPreference,
		invokeTimeoutMs: options.invokeTimeoutMs,
		maxFallbackDepth: options.maxFallbackDepth,
		fallbackStrategy: options.fallbackStrategy,
		executeApi: options.executeApi,
		confirmBeforeExecute: options.confirmBeforeExecute,
		autoBypassConfirmed: options.autoBypassConfirmed,
		...(options.checkSpend !== undefined
			? { checkSpend: options.checkSpend }
			: {}),
	});
};
