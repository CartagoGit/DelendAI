/**
 * strict-latest.spec.ts — the invariant the whole engine exists for: a
 * candidate validated against integration head `A` must not merge once
 * the head is `A+X`.
 *
 * The failure this prevents cannot be reproduced with one pull request,
 * so these specs always build TWO independently-green candidates and let
 * the first one land. What must then be true of the second is not "it was
 * rejected" but something stronger and checkable in real history: its ref
 * was replayed onto the commit that actually landed, its verdict was
 * thrown away, and the merge only happened after a new one was earned.
 *
 * The compare-and-swap spec closes the last gap — the head moving between
 * the validation read and the merge call — by moving it from inside that
 * very window.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, prPolicy, type IHarness } from './harness';
import { advanceIntegration, serverTreePaths } from './integration-repo';

/** Re-describe a candidate after its ref was replayed onto a new base. */
const rebased = (
	candidate: Awaited<ReturnType<IHarness['checkpoint']>>,
	sha: string,
	base: string,
): typeof candidate => ({
	...candidate,
	wipHeadSha: sha,
	baseIntegrationSha: base,
});

describe('strict latest integration', () => {
	let h: IHarness;

	beforeEach(async () => {
		h = await createHarness();
	});
	afterEach(() => {
		h.cleanup();
	});

	it('re-validates a green pull request once the integration head moves', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-b',
			path: 'src/b.ts',
			content: 'export const b = 1;\n',
			slice: 's2',
		});
		h.forge.setGreen(candidate.wipHeadSha);
		// It was green against the head it was built on...
		expect(
			(
				await h.engine.runIntegrationCycle({
					policy: prPolicy(),
					candidate,
				})
			).status,
		).toBe('merged');

		// ...but a second candidate built on the SAME old head is now stale.
		const stale = await h.checkpoint({
			agent: 'agent-c',
			path: 'src/c.ts',
			content: 'export const c = 1;\n',
			slice: 's3',
			baseSha: candidate.baseIntegrationSha,
		});
		h.forge.setGreen(stale.wipHeadSha);
		const newHead = h.repo.serverHead();
		expect(newHead).not.toBe(stale.baseIntegrationSha);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: stale,
		});

		expect(result.status).toBe('revalidating');
		expect(h.forge.mergeCount()).toBe(1);
		// The ref was really replayed onto the head that actually landed.
		expect(result.candidateSha).not.toBe(stale.wipHeadSha);
		expect(h.repo.localRef(stale.wipRef)).toBe(result.candidateSha);
		expect(h.repo.git('rev-parse', `${result.candidateSha}^`)).toBe(
			newHead,
		);
		// The old verdict was thrown away, not carried forward.
		const generation = h.state
			.generations()
			.find((entry) => entry.wipRef === stale.wipRef);
		expect(generation?.validationState).toBe('pending');
		expect(generation?.integratedSha).toBeNull();
	});

	it('lets the rebased candidate merge once it is green against the new head', async () => {
		const first = await h.checkpoint({
			agent: 'agent-b',
			path: 'src/b.ts',
			content: 'export const b = 1;\n',
			slice: 's2',
		});
		const second = await h.checkpoint({
			agent: 'agent-c',
			path: 'src/c.ts',
			content: 'export const c = 1;\n',
			slice: 's3',
		});
		h.forge.setGreen(first.wipHeadSha);
		h.forge.setGreen(second.wipHeadSha);

		await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: first,
		});
		const stalePass = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: second,
		});
		expect(stalePass.status).toBe('revalidating');
		// Being green on the OLD sha buys the replayed candidate nothing.
		expect(h.forge.mergeCount()).toBe(1);

		h.forge.setGreen(stalePass.candidateSha);
		const merged = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: rebased(
				second,
				stalePass.candidateSha,
				stalePass.integrationHeadSha,
			),
		});

		expect(merged.status).toBe('merged');
		expect(h.forge.mergeCount()).toBe(2);
		expect(h.forge.openCount()).toBe(2);
		const head = h.repo.serverHead();
		expect(serverTreePaths(h.repo, head)).toEqual(
			expect.arrayContaining(['src/b.ts', 'src/c.ts']),
		);
	});

	it('refuses the merge when the head changes between validation and merge', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		h.forge.setGreen(candidate.wipHeadSha);
		// Fire inside the critical section, after the head was read and the
		// verdict taken, immediately before the merge call.
		h.forge.beforeMerge = () => {
			advanceIntegration(h.repo);
			h.forge.beforeMerge = undefined;
		};

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(result.status).toBe('stale');
		expect(result.reason).toContain('compare-and-swap');
		expect(h.forge.mergeCount()).toBe(0);
		expect(h.state.generations()[0]?.integratedSha).toBeNull();
		expect(serverTreePaths(h.repo, h.repo.serverHead())).not.toContain(
			'src/a.ts',
		);
	});

	it('serialises only the merge, and the second candidate loses the race cleanly', async () => {
		const first = await h.checkpoint({
			agent: 'agent-b',
			path: 'src/b.ts',
			content: 'export const b = 1;\n',
			slice: 's2',
		});
		const second = await h.checkpoint({
			agent: 'agent-c',
			path: 'src/c.ts',
			content: 'export const c = 1;\n',
			slice: 's3',
		});
		h.forge.setGreen(first.wipHeadSha);
		h.forge.setGreen(second.wipHeadSha);

		// Both cycles are started concurrently, as a swarm would.
		const [a, b] = await Promise.all([
			h.engine.runIntegrationCycle({
				policy: prPolicy(),
				candidate: first,
			}),
			h.engine.runIntegrationCycle({
				policy: prPolicy(),
				candidate: second,
			}),
		]);

		const statuses = [a.status, b.status].sort();
		expect(statuses).toEqual(['merged', 'revalidating']);
		// Exactly one merge happened, and the loser was rebased, not lost.
		expect(h.forge.mergeCount()).toBe(1);
		const loser = a.status === 'merged' ? second : first;
		const loserResult = a.status === 'merged' ? b : a;
		expect(h.repo.localRef(loser.wipRef)).toBe(loserResult.candidateSha);
		expect(loserResult.candidateSha).not.toBe(loser.wipHeadSha);
	});
});
