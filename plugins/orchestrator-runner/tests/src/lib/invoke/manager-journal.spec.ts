/**
 * manager-journal.spec.ts — each hop is journalled as it runs, and a hop
 * an account's quota refuses is journalled as blocked, never as run.
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderKind,
} from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import type { IInvocationJournalEntry } from '../../../../src/lib/contracts/interfaces/invocation-journal.interface';
import type { IQuotaHold } from '../../../../src/lib/contracts/interfaces/quota-reservation.interface';
import { InvocationManager } from '../../../../src/lib/invoke/manager';
import type { IKindInvoker } from '../../../../src/lib/invoke/types';

const provider: IProviderCapabilities = {
	id: 'claude-work',
	kind: 'cli',
	invoke: { kind: 'cli', command: 'claude', args: ['-p'] },
	modelId: 'claude-model',
	contextWindow: 100_000,
	costTier: 2,
	strengths: ['code-edit'],
	weaknesses: [],
	accountId: 'work',
};

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

const invoker = (outcome: 'ok' | 'fail'): IKindInvoker => ({
	start: () => ({
		promise:
			outcome === 'ok'
				? Promise.resolve({ text: 'done' })
				: Promise.reject(new Error('cli exited with code 2')),
		cancel: () => undefined,
	}),
});

const run = async (outcome: 'ok' | 'fail', holdQuota?: IQuotaHold) => {
	const entries: Omit<IInvocationJournalEntry, 'at' | 'pid'>[] = [];
	const cli = invoker(outcome);
	const invokers: Record<ProviderKind, IKindInvoker> = {
		cli,
		api: cli,
		'mcp-server': cli,
		subscription: cli,
	};
	await new InvocationManager({
		providers: [provider],
		availabilityOf: available,
		invokers,
		defaultCostPreference: 'balanced',
		invokeTimeoutMs: 1000,
		maxFallbackDepth: 1,
		fallbackStrategy: 'rerank',
		executeApi: true,
		confirmBeforeExecute: false,
		autoBypassConfirmed: true,
		journal: async (entry) => {
			entries.push(entry);
		},
		...(holdQuota === undefined ? {} : { holdQuota }),
	}).invoke({ task: 'rename a to b' });
	return entries.map((entry) => [entry.state, entry.accountId, entry.detail]);
};

describe('the invocation journal', () => {
	it('records a hop as running, then completed', async () => {
		expect(await run('ok')).toEqual([
			['running', 'work', undefined],
			['completed', 'work', undefined],
		]);
	});

	it('records a failed hop with its reason', async () => {
		expect(await run('fail')).toEqual([
			['running', 'work', undefined],
			['failed', 'work', 'cli exited with code 2'],
		]);
	});

	it('records a hop the quota refused as blocked, and nothing ran', async () => {
		const refused: IQuotaHold = async () => ({
			kind: 'refused',
			reason: 'quota group "work-5h" has never been observed',
		});
		expect(await run('ok', refused)).toEqual([
			[
				'blocked',
				'work',
				'quota group "work-5h" has never been observed',
			],
		]);
	});
});
