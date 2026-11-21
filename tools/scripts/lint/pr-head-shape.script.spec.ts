/**
 * A pull request is opened from a well-shaped publication ref (f00644).
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import { prHeadProblem } from './pr-head-shape.script';

const BRANCHES = {
	workRefTemplate: 'heads/delendai/wip/${kind}/${agent}/${scope}/${topic}',
	workRefPrefix: 'heads/delendai/wip/',
	publicationRefPrefix: 'delendai/pr/',
};

describe('prHeadProblem', () => {
	it('[<20ms] accepts a publication of the shape, and one in the shape it replaced', () => {
		expect(
			prHeadProblem(
				'delendai/pr/review/claude-opus-5-5/x00001-all/batch',
				BRANCHES,
			),
		).toBeUndefined();
		// The shape the default replaced still reads (f00808 S8).
		expect(
			prHeadProblem(
				'delendai/pr/claude-opus-5-5/implement/x00001-S1-g1/t',
				BRANCHES,
			),
		).toBeUndefined();
	});

	it('[<20ms] refuses a pull request opened from a work ref', () => {
		expect(
			prHeadProblem(
				'delendai/wip/review/minimax-m3/x00558-all/review',
				BRANCHES,
			),
		).toContain('is a work ref');
	});

	it('[<20ms] refuses an agent named after the program it runs in (x00694)', () => {
		expect(
			prHeadProblem(
				'delendai/pr/review/copilot/batch-all/close-the-ready-review-batches',
				BRANCHES,
			),
		).toContain('the program the agent runs in');
	});

	it('[<20ms] refuses an agent that spells the kind of work', () => {
		expect(
			prHeadProblem(
				'delendai/pr/review/minimax-m3-review-20260926/x00558-S1/review',
				BRANCHES,
			),
		).toContain('spells the kind of work');
	});

	it('[<20ms] refuses a name with no shape at all', () => {
		expect(
			prHeadProblem('delendai/pr/proposal-f00643', BRANCHES),
		).toContain('does not have the shape');
		expect(prHeadProblem('feature/whatever', BRANCHES)).toContain(
			'outside',
		);
	});
});

describe('prHeadProblem in a namespace transition (f00808)', () => {
	const moved = resolveDevelopmentPolicy({
		development: {
			branches: {
				namespacePrefix: '',
				formerNamespacePrefixes: ['delendai'],
			},
		},
	}).branches;

	it('[<20ms] accepts a publication of either prefix, and nothing outside them', () => {
		expect(
			prHeadProblem('pr/implement/claude-opus-5-5/x00642-S2/t', moved),
		).toBeUndefined();
		expect(
			prHeadProblem(
				'delendai/pr/implement/claude-opus-5-5/x00642-S2/t',
				moved,
			),
		).toBeUndefined();
		expect(prHeadProblem('feature/mine', moved)).toContain('outside');
	});
});

describe('prHeadProblem under the policy of a base branch', () => {
	it('[<20ms] still yields delendai/pr/ for this project, and judges a head by the prefix its own policy names', () => {
		const project = resolveDevelopmentPolicy({
			development: { branches: { namespacePrefix: 'delendai' } },
		}).branches;
		expect(project.publicationRefPrefix).toBe('delendai/pr/');
		const run = resolveDevelopmentPolicy({
			development: {
				branches: {
					namespacePrefix: 'delendai',
					publicationRefPrefix: 'delendai/rehearsal/r1/',
				},
			},
		}).branches;
		const head =
			'delendai/rehearsal/r1/implement/rehearsal/x00000-S1/one-pr-a';
		expect(prHeadProblem(head, run)).toBeUndefined();
		// The project's own policy does not take it for a publication.
		expect(prHeadProblem(head, project)).toContain('outside');
	});
});

describe('prHeadProblem for a batch land opened', () => {
	const { branches } = {
		branches: resolveDevelopmentPolicy({
			development: { branches: { namespacePrefix: 'delendai' } },
		}).branches,
	};

	it('[<20ms] accepts a head under the batch namespace and still refuses a stray branch', () => {
		expect(
			prHeadProblem('delendai/queue/batch-2236+2240', branches),
		).toBeUndefined();
		expect(prHeadProblem('feature/batch-1', branches)).toContain('outside');
	});
});
