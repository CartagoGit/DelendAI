/**
 * pull-request-cycle.spec.ts — the everyday path: a green checkpoint
 * becomes a pull request, a red one goes nowhere, and a green one
 * advances the integration branch.
 *
 * Every assertion is against a real ref in a real repository. "A pull
 * request was opened" is checked as one pull request in the forge's
 * ledger AND one push landing on the server; "the branch advanced" is
 * checked as the server's `develop` pointing somewhere new with the
 * candidate's file in its tree. A spec that only inspected the returned
 * object would pass just as happily if nothing had been pushed at all.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { createHarness, prPolicy, type IHarness } from './harness';
import { serverTreePaths } from './integration-repo';

describe('runIntegrationCycle — pull request lifecycle', () => {
	let h: IHarness;

	beforeEach(async () => {
		h = await createHarness();
	});
	afterEach(() => {
		h.cleanup();
	});

	it('opens a pull request for a checkpoint, and never a second one', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});

		const first = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});
		expect(first.status).toBe('opened');
		expect(first.pullRequest?.number).toBe(1);
		expect(h.forge.openCount()).toBe(1);
		// The candidate really reached the server.
		expect(h.repo.serverHead('wip/agent-a/p1-s1-g1')).toBe(
			candidate.wipHeadSha,
		);

		const second = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});
		expect(second.pullRequest?.number).toBe(1);
		expect(h.forge.openCount()).toBe(1);
		expect(h.forge.pullRequests).toHaveLength(1);
	});

	it('advances the same pull request when the checkpoint moves', async () => {
		const first = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: first,
		});

		const second = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 2;\n',
			baseSha: first.baseIntegrationSha,
		});
		expect(second.wipHeadSha).not.toBe(first.wipHeadSha);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate: second,
		});
		expect(result.status).toBe('updated');
		expect(h.forge.openCount()).toBe(1);
		expect(h.repo.serverHead('wip/agent-a/p1-s1-g1')).toBe(
			second.wipHeadSha,
		);
	});

	it('refuses to merge a candidate whose required check is red', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		const before = h.repo.serverHead();
		h.forge.setRed(candidate.wipHeadSha);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(result.status).toBe('blocked');
		expect(result.validation?.failed).toEqual(['ci-complete']);
		expect(h.forge.mergeCount()).toBe(0);
		expect(h.repo.serverHead()).toBe(before);
		expect(h.state.generations()[0]?.integratedSha).toBeNull();
	});

	it('holds a candidate whose checks have not concluded', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		h.forge.setChecks(candidate.wipHeadSha, [
			{ name: 'ci-complete', state: 'in_progress' },
		]);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(result.status).toBe('opened');
		expect(result.validation?.verdict).toBe('pending');
		expect(h.forge.mergeCount()).toBe(0);
	});

	it('merges a green candidate and advances the integration branch', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		const before = h.repo.serverHead();
		const head = h.repo.headState();
		h.forge.setGreen(candidate.wipHeadSha);

		const result = await h.engine.runIntegrationCycle({
			policy: prPolicy(),
			candidate,
		});

		expect(result.status).toBe('merged');
		expect(result.mergeSha).toBeTruthy();
		const after = h.repo.serverHead();
		expect(after).not.toBe(before);
		expect(serverTreePaths(h.repo, after)).toContain('src/a.ts');
		expect(h.state.generations()[0]?.integratedSha).toBe(result.mergeSha);
		// The shared checkout never moved.
		expect(h.repo.headState()).toEqual(head);
	});

	it('declines rather than forcing a pull request on a direct policy', async () => {
		const candidate = await h.checkpoint({
			agent: 'agent-a',
			path: 'src/a.ts',
			content: 'export const a = 1;\n',
		});
		const before = h.repo.serverHead();

		const result = await h.engine.runIntegrationCycle({
			policy: expandProfile('shared-direct'),
			candidate,
		});

		expect(result.status).toBe('declined');
		expect(result.reason).toContain("integration.strategy is 'direct'");
		expect(h.forge.openCount()).toBe(0);
		expect(h.forge.pullRequests).toHaveLength(0);
		expect(h.repo.serverHead()).toBe(before);
		expect(h.state.generations()).toHaveLength(0);
	});
});
