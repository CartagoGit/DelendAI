/**
 * cleanup-and-progress.spec.ts — what happens AFTER a merge: the ref is
 * deleted only on evidence, the slice keeps going from the new head, and
 * running the whole thing again changes nothing.
 *
 * The cleanup specs are the ones most worth having. "Deleted the merged
 * ref" and "deleted an agent's unfinished work" are the same code path
 * with different inputs, so both directions are asserted against the real
 * ref: gone when the evidence is complete, still there and RECOVERABLE
 * when any part of it is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, prPolicy, type IHarness } from './harness';
import { serverTreePaths } from './integration-repo';

describe('cleanup, green progress and idempotency', () => {
	let h: IHarness;

	beforeEach(async () => {
		h = await createHarness();
	});
	afterEach(() => {
		h.cleanup();
	});

	it('deletes a merged work ref, on evidence', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		h.forge.setGreen(candidate.wipHeadSha);
		expect(h.repo.localRef(candidate.wipRef)).toBe(candidate.wipHeadSha);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(result.status).toBe('merged');
		expect(result.disposition?.action).toBe('deleted');
		expect(result.disposition?.classification).toBe('integrated');
		expect(result.disposition?.evidence.pullRequestMerged).toBe(true);
		expect(result.disposition?.evidence.integratedSha).toBe(
			result.mergeSha,
		);
		// The ref is really gone, locally and on the server.
		expect(h.repo.localRef(candidate.wipRef)).toBe('');
		expect(h.repo.serverHead('wip/agent-a/p1-s1-g1')).toBe('');
	});

	it('never deletes unmerged work — it reports it RECOVERABLE', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		await h.engine.runIntegrationCycle({ policy: prPolicy(), candidate });

		const disposition = await h.engine.disposeWorkRef({
			policy: prPolicy(),
			candidate,
			mergeSha: '',
			integratedSha: '',
			integrationHeadSha: h.repo.serverHead(),
			wipHeadSha: candidate.wipHeadSha,
		});

		expect(disposition.classification).toBe('RECOVERABLE');
		expect(disposition.action).toBe('retained');
		expect(disposition.evidence.pullRequestMerged).toBe(false);
		expect(h.repo.localRef(candidate.wipRef)).toBe(candidate.wipHeadSha);
	});

	it('keeps a merged ref when the policy says not to delete it', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		const base = prPolicy();
		const policy = {
			...base,
			integration: { ...base.integration, deleteMergedWorkRef: false },
		};
		h.forge.setGreen(candidate.wipHeadSha);

		const result = await h.engine.runIntegrationCycle({
			policy,
			candidate,
		});

		expect(result.status).toBe('merged');
		expect(result.disposition?.action).toBe('retained');
		expect(result.disposition?.classification).toBe('integrated');
		expect(h.repo.localRef(candidate.wipRef)).toBe(candidate.wipHeadSha);
	});

	it('keeps the slice in progress and bases its next generation on the new head', async () => {
		const first = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		h.forge.setGreen(first.wipHeadSha);
		const merged = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: first,
		});

		const newHead = h.repo.serverHead();
		expect(merged.nextGeneration).toEqual({
			generation: 2,
			baseIntegrationSha: newHead,
		});
		expect(newHead).not.toBe(first.baseIntegrationSha);

		// The slice continues from the head its own work produced.
		h.fetchIntegration();
		const second = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a2.ts',
			content: 'export const a2 = 2;\n',
			generation: merged.nextGeneration?.generation ?? 2,
			baseSha: merged.nextGeneration?.baseIntegrationSha ?? newHead,
		});
		expect(h.repo.git('rev-parse', `${second.wipHeadSha}^`)).toBe(newHead);

		h.forge.setGreen(second.wipHeadSha);
		const again = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: second,
		});

		expect(again.status).toBe('merged');
		expect(serverTreePaths(h.repo, h.repo.serverHead())).toEqual(
			expect.arrayContaining(['src/a.ts', 'src/a2.ts']),
		);
		// Both generations of the same slice are recorded, side by side.
		const slice = h.state
			.generations()
			.filter((entry) => entry.workUnitUid === first.workUnitUid);
		expect(slice.map((entry) => entry.generation).sort()).toEqual([1, 2]);
		expect(slice.every((entry) => entry.integratedSha !== null)).toBe(true);
	});

	it('is idempotent: no duplicate pull request, generation or journal event', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		h.forge.setGreen(candidate.wipHeadSha);

		const first = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});
		const journalAfterFirst = h.state.journal().length;
		const headAfterFirst = h.repo.serverHead();

		const second = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(first.status).toBe('merged');
		expect(second.status).toBe('merged');
		expect(second.idempotentReplay).toBe(true);
		expect(second.integratedSha).toBe(first.integratedSha);
		expect(h.forge.openCount()).toBe(1);
		expect(h.forge.pullRequests).toHaveLength(1);
		expect(h.forge.mergeCount()).toBe(1);
		expect(h.state.generations()).toHaveLength(1);
		expect(h.state.journal()).toHaveLength(journalAfterFirst);
		expect(journalAfterFirst).toBe(2);
		expect(h.repo.serverHead()).toBe(headAfterFirst);
		expect(second.disposition?.action).toBe('deleted');
	});
});
