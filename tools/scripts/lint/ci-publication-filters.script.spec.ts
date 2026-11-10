import { describe, expect, it } from 'vitest';

import {
	assertPublicationFilters,
	workflowPublicationFilters,
} from './ci-publication-filters.script';

describe('publication filters in ci.yml (f00808)', () => {
	const workflow = [
		"        if: ${{ startsWith(github.head_ref, 'delendai/pr/') || startsWith(github.head_ref, 'pr/') }}",
		"        if: ${{ startsWith(github.ref, 'refs/heads/delendai/pr/') || startsWith(github.ref, 'refs/heads/pr/') }}",
		"        if: ${{ startsWith(github.ref, 'refs/tags/') }}",
	].join('\n');

	it('[<20ms] reads the prefixes each filter names', () => {
		expect(workflowPublicationFilters(workflow)).toEqual([
			['delendai/pr/', 'pr/'],
			['delendai/pr/', 'pr/'],
		]);
	});

	it('[<20ms] accepts filters that name both prefixes in the transition', () => {
		expect(() =>
			assertPublicationFilters(workflow, ['pr/', 'delendai/pr/']),
		).not.toThrow();
	});

	it('[<20ms] refuses a filter the policy does not read from', () => {
		expect(() =>
			assertPublicationFilters(workflow, ['delendai/pr/']),
		).toThrow(/policy owns delendai\/pr\//u);
	});

	it('[<20ms] holds the queue train filters to the owned train prefixes', () => {
		const trains =
			"        if: ${{ startsWith(github.ref, 'refs/heads/delendai/pr/') || startsWith(github.ref, 'refs/heads/pr/') || startsWith(github.ref, 'refs/heads/train/') || startsWith(github.ref, 'refs/heads/delendai/train/') }}";
		expect(workflowPublicationFilters(trains, 'train/')).toEqual([
			['train/', 'delendai/train/'],
		]);
		expect(() =>
			assertPublicationFilters(
				trains,
				['train/', 'delendai/train/'],
				'train/',
			),
		).not.toThrow();
		expect(() =>
			assertPublicationFilters(trains, ['train/'], 'train/'),
		).toThrow(/train\/ refs/u);
	});
});
