import { describe, expect, it } from 'vitest';

import type { IProviderCapabilities } from '@delendai/core/public';

import { HealthStore } from '../../../../src/lib/healthcheck/store';
import { buildDefaultInvocationManager } from '../../../../src/lib/invoke/build-manager';

const subscriptionProvider: IProviderCapabilities = {
	id: 'sub',
	kind: 'subscription',
	invoke: { kind: 'subscription', tool: 'host' },
	modelId: 'sub-model',
	contextWindow: 100_000,
	costTier: 1,
	strengths: ['code-edit'],
	weaknesses: [],
};

describe('buildDefaultInvocationManager environment', () => {
	it('hands the environment to the manager, which prepares and releases it', async () => {
		const calls: string[] = [];
		const manager = buildDefaultInvocationManager({
			providers: [subscriptionProvider],
			health: new HealthStore(),
			defaultCostPreference: 'balanced',
			invokeTimeoutMs: 1000,
			subprocessPoolSize: 1,
			concurrencyLimit: 1,
			maxFallbackDepth: 1,
			fallbackStrategy: 'rerank',
			executeApi: false,
			confirmBeforeExecute: true,
			autoBypassConfirmed: false,
			environment: {
				id: 'fake',
				prepare: async () => {
					calls.push('prepare');
					return { ok: true };
				},
				teardown: async () => {
					calls.push('teardown');
					return { ok: true };
				},
			},
		});
		const out = await manager.invoke({ task: 'do it' });
		expect(calls).toEqual(['prepare', 'teardown']);
		expect(out.environmentLog).toHaveLength(2);
	});

	it('runs a cli provider through the real spawner', async () => {
		const cliProvider: IProviderCapabilities = {
			...subscriptionProvider,
			id: 'node-cli',
			kind: 'cli',
			invoke: {
				kind: 'cli',
				command: process.execPath,
				args: ['-e', 'process.stdout.write("hi")'],
			},
		};
		const manager = buildDefaultInvocationManager({
			providers: [cliProvider],
			health: new HealthStore(),
			defaultCostPreference: 'balanced',
			invokeTimeoutMs: 20_000,
			subprocessPoolSize: 1,
			concurrencyLimit: 1,
			maxFallbackDepth: 1,
			fallbackStrategy: 'rerank',
			executeApi: true,
			confirmBeforeExecute: false,
			autoBypassConfirmed: true,
		});
		const out = await manager.invoke({ task: 'say hi' });
		expect(out.error).toBeUndefined();
		expect(out.result).toBeDefined();
	});
});
