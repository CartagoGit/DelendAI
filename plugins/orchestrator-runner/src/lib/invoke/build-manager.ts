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
import { splitCommandLine } from '@delendai/core/runtime';
import { spawn } from 'node:child_process';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	IRoutingDecision,
} from '@delendai/core/public';
import type { IProviderAccount } from '@delendai/core/contracts';

import type { ILifecycleEnvironment } from '../contracts/interfaces/execution-env-lifecycle.interface';
import type { IInvocationJournal } from '../contracts/interfaces/invocation-journal.interface';
import type { IQuotaHold } from '../contracts/interfaces/quota-reservation.interface';
import { accountEnvironment } from '../services/account-environment.service';
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

const nodeCliSpawner: CliSpawner = (command, args, env): ICliChildProcess => {
	const child = spawn(command, [...args], {
		stdio: ['ignore', 'pipe', 'pipe'],
		...(env === undefined ? {} : { env: { ...env } }),
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
 * line. The descriptor carries one string (e.g. `codex mcp-server`), read
 * the way a shell reads its quotes (`node "my tools/server.js"` keeps the
 * path whole): first token = command, rest = argv. Exported for the
 * stdio-transport spec.
 */
export const mcpServerTransportFactory = (
	server: string,
): IJsonRpcTransport => {
	const tokens = splitCommandLine(server);
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
	/** The accounts roster entries run on; their processes get only their own environment. */
	readonly accounts?: readonly IProviderAccount[];
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
	/** Environment prepared before and released after each invocation. */
	readonly environment?: ILifecycleEnvironment;
	/** Holds room in the account's quota pools while a hop runs. */
	readonly holdQuota?: IQuotaHold;
	/** Records each hop's start and end. */
	readonly journal?: IInvocationJournal;
	/** S7 circuit-breaker seam (see {@link InvocationManager}). */
	readonly checkSpend?: (
		decision: IRoutingDecision,
		strategy: FallbackStrategy,
	) => SpendCheckOutcome;
}

export const buildDefaultInvocationManager = (
	options: IBuildManagerOptions,
): InvocationManager => {
	const accounts = new Map(
		(options.accounts ?? []).map((account) => [account.accountId, account]),
	);
	const cliInvoker = createCliInvoker({
		spawner: nodeCliSpawner,
		environmentFor: (request, args) => {
			const accountId = request.decision.targetProvider.accountId;
			return accountEnvironment({
				command:
					request.invoke.kind === 'cli' ? request.invoke.command : '',
				args,
				accountId,
				account:
					accountId === undefined
						? undefined
						: accounts.get(accountId),
				parentEnv: process.env,
			});
		},
	});
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
		...(options.environment !== undefined
			? { environment: options.environment }
			: {}),
		...(options.holdQuota !== undefined
			? { holdQuota: options.holdQuota }
			: {}),
		...(options.journal !== undefined ? { journal: options.journal } : {}),
		...(options.checkSpend !== undefined
			? { checkSpend: options.checkSpend }
			: {}),
	});
};
