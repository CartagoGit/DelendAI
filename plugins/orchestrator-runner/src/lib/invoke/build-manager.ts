/**
 * build-manager.ts — assemble the default {@link InvocationManager} (S6).
 *
 * Wires the four per-kind invokers to their real seams for production use:
 *  - `cli`  → `node:child_process.spawn` adapted to the CLI seam.
 *  - `api`  → the global `fetch` adapted to the HTTP seam.
 *  - `mcp-server` → DEFERRED to S10's live e2e (a real `codex mcp-server`
 *    subprocess + stdio transport). Until then it fails gracefully so the
 *    fallback chain routes past it rather than crashing.
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
} from '@mcp-vertex/core/public';

import type { HealthStore } from '../healthcheck/store';
import type { CostPreference } from '../types';
import type { FallbackStrategy } from './fallback';
import { InvocationManager } from './manager';
import type { IKindInvoker } from './types';
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

/** mcp-server default: deferred to S10, fails gracefully (no crash). */
const deferredMcpInvoker: IKindInvoker = {
	start: () => ({
		promise: Promise.reject(
			new Error(
				'mcp-server invocation is deferred to S10 (live codex mcp-server round-trip); inject an mcp invoker to use it now',
			),
		),
		cancel: () => undefined,
	}),
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
}

export const buildDefaultInvocationManager = (
	options: IBuildManagerOptions,
): InvocationManager => {
	const cliInvoker = createCliInvoker({ spawner: nodeCliSpawner });
	const apiInvoker = createApiInvoker({ fetchFn: globalHttpFetch });
	const subscriptionInvoker = createSubscriptionInvoker();

	return new InvocationManager({
		providers: options.providers,
		availabilityOf: (id): IProviderAvailability => options.health.get(id),
		invokers: {
			cli: cliInvoker,
			api: apiInvoker,
			'mcp-server': deferredMcpInvoker,
			subscription: subscriptionInvoker,
		},
		defaultCostPreference: options.defaultCostPreference,
		invokeTimeoutMs: options.invokeTimeoutMs,
		maxFallbackDepth: options.maxFallbackDepth,
		fallbackStrategy: options.fallbackStrategy,
		executeApi: options.executeApi,
		confirmBeforeExecute: options.confirmBeforeExecute,
		autoBypassConfirmed: options.autoBypassConfirmed,
	});
};
