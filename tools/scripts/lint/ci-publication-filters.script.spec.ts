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

	it('reads the prefixes each filter names', () => {
		expect(workflowPublicationFilters(workflow)).toEqual([
			['delendai/pr/', 'pr/'],
			['delendai/pr/', 'pr/'],
		]);
	});

	it('accepts filters that name both prefixes in the transition', () => {
		expect(() =>
			assertPublicationFilters(workflow, ['pr/', 'delendai/pr/']),
		).not.toThrow();
	});

	it('refuses a filter the policy does not read from', () => {
		expect(() =>
			assertPublicationFilters(workflow, ['delendai/pr/']),
		).toThrow(/policy owns delendai\/pr\//u);
	});
});
