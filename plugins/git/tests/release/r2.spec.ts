import { describe, expect, it } from 'vitest';

import {
	createReleaseCandidateStore,
	releasePrepareDryRun,
	releasePrepareExecute,
	releaseStatus,
} from '../../src/lib/release';
import type { IGitRunner } from '../../src/lib/services/git';

const makeRun =
	(state: { develop: string; main: string; version: string }): IGitRunner =>
	async (args) => {
		if (args[0] === 'rev-parse' && args[1] === 'develop')
			return { ok: true, output: `${state.develop}\n` };
		if (args[0] === 'rev-parse' && args[1] === 'main')
			return { ok: true, output: `${state.main}\n` };
		if (args[0] === 'show')
			return {
				ok: true,
				output: JSON.stringify({ version: state.version }),
			};
		return { ok: false, output: '', reason: 'unexpected git command' };
	};

describe('release R2 git adapter', () => {
	it('rejects stale expected state in dry-run and execute', async () => {
		const state = { develop: '3333333', main: '2222222', version: '1.4.2' };
		const input = {
			type: 'patch' as const,
			slug: 'r2-state',
			actor: 'release-agent',
			expected: {
				sourceDevelopSha: '1111111',
				mainSha: '2222222',
				mainVersion: '1.4.2',
			},
		};
		for (const prepare of [releasePrepareDryRun, releasePrepareExecute]) {
			await expect(
				prepare(makeRun(state), createReleaseCandidateStore(), input),
			).rejects.toMatchObject({
				code: 'stale-source',
			});
		}
	});

	it('preserves the source SHA and is idempotent on retry', async () => {
		const state = { develop: '1111111', main: '2222222', version: '1.4.2' };
		const store = createReleaseCandidateStore();
		const input = {
			type: 'patch' as const,
			slug: 'r2-idempotent',
			actor: 'release-agent',
			idempotencyKey: 'retry-1',
			expected: {
				sourceDevelopSha: '1111111',
				mainSha: '2222222',
				mainVersion: '1.4.2',
			},
		};
		const first = await releasePrepareExecute(makeRun(state), store, input);
		state.develop = '3333333';
		const retry = await releasePrepareExecute(makeRun(state), store, input);
		expect(retry.created).toBe(false);
		expect(retry.candidate).toBe(first.candidate);
		expect(releaseStatus(store, input.slug)).toMatchObject({
			sourceDevelopSha: '1111111',
			targetVersion: '1.4.3',
		});
	});

	it('keeps dry-run side-effect free when an execute follows it', async () => {
		const state = { develop: '1111111', main: '2222222', version: '1.4.2' };
		const store = createReleaseCandidateStore();
		const input = {
			type: 'patch' as const,
			slug: 'r2-dry-run',
			actor: 'agent',
			expected: {
				sourceDevelopSha: '1111111',
				mainSha: '2222222',
				mainVersion: '1.4.2',
			},
		};
		const preview = await releasePrepareDryRun(
			makeRun(state),
			store,
			input,
		);
		expect(preview.candidate.state).toBe('draft');
		expect(store.list()).toHaveLength(0);
		await releasePrepareExecute(makeRun(state), store, input);
		expect(store.list()).toHaveLength(1);
	});

	it('allows a retry after develop advances once the candidate is cut', async () => {
		const state = { develop: '1111111', main: '2222222', version: '1.4.2' };
		const store = createReleaseCandidateStore();
		const input = {
			type: 'patch' as const,
			slug: 'r2-develop-advanced',
			actor: 'agent',
			idempotencyKey: 'develop-retry',
			expected: {
				sourceDevelopSha: '1111111',
				mainSha: '2222222',
				mainVersion: '1.4.2',
			},
		};
		const first = await releasePrepareExecute(makeRun(state), store, input);
		state.develop = '3333333';
		const retry = await releasePrepareExecute(makeRun(state), store, input);
		expect(retry).toMatchObject({
			created: false,
			candidate: first.candidate,
		});
	});

	it('restarts an aborted candidate only with a new idempotency key', async () => {
		const state = { develop: '1111111', main: '2222222', version: '1.4.2' };
		const store = createReleaseCandidateStore();
		const input = {
			type: 'patch' as const,
			slug: 'r2-restart',
			actor: 'agent',
			idempotencyKey: 'restart-1',
			expected: {
				sourceDevelopSha: '1111111',
				mainSha: '2222222',
				mainVersion: '1.4.2',
			},
		};
		const first = await releasePrepareExecute(makeRun(state), store, input);
		store.put('restart-1', { ...first.candidate, state: 'aborted' });
		const restarted = await releasePrepareExecute(makeRun(state), store, {
			...input,
			idempotencyKey: 'restart-2',
		});
		expect(restarted.created).toBe(true);
		expect(restarted.candidate.state).toBe('cut');
		expect(store.list()).toHaveLength(2);
	});

	it('reserves one candidate under concurrent patch/patch and minor/patch races', async () => {
		const state = { develop: '1111111', main: '2222222', version: '1.4.2' };
		for (const [firstType, secondType, shouldCollide] of [
			['patch', 'patch', true],
			['minor', 'minor', true],
			['minor', 'patch', false],
		] as const) {
			const store = createReleaseCandidateStore();
			const base = {
				actor: 'agent',
				expected: {
					sourceDevelopSha: '1111111',
					mainSha: '2222222',
					mainVersion: '1.4.2',
				},
			};
			const results = await Promise.allSettled([
				releasePrepareExecute(makeRun(state), store, {
					...base,
					type: firstType,
					slug: `race-${firstType}-one`,
					idempotencyKey: `race-${firstType}-one`,
				}),
				releasePrepareExecute(makeRun(state), store, {
					...base,
					type: secondType,
					slug: `race-${secondType}-two`,
					idempotencyKey: `race-${secondType}-two`,
				}),
			]);
			const fulfilled = results.filter(
				(result) => result.status === 'fulfilled',
			);
			expect(fulfilled).toHaveLength(shouldCollide ? 1 : 2);
			expect(store.list()).toHaveLength(shouldCollide ? 1 : 2);
		}
	});
});
