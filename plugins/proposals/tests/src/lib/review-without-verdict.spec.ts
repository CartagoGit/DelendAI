/**
 * review-without-verdict.spec.ts — a reviewer who could not verify a
 * slice is pointed to giving the claim back, not to a request for changes.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import {
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';
import { buildProposalWorkflow } from '@delendai/proposals/lib/knowledge/proposal-workflow';

describe('a review that could not run', () => {
	it('the review tool sends the reviewer to review_claim release', async () => {
		let description = '';
		await buildReviewRegistration(
			fakePartial<IAuthoringToolOptions>({ namespacePrefix: 'acme' }),
		).register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					description = String(
						(tool.config as { description?: string }).description,
					);
				},
			}),
		);
		expect(description).toContain('a slice you could not verify');
		expect(description).toContain(
			'Give the claim back instead, with review_claim { release',
		);
	});

	it('the review workflow says the same', () => {
		expect(
			JSON.stringify(
				buildProposalWorkflow('docs/proposals', 'index.json'),
			),
		).toContain('give the claim back with review_claim { release');
	});
});
