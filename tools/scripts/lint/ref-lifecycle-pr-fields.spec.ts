import { describe, expect, it } from 'vitest';

import { PULL_REQUEST_FIELDS } from './ref-lifecycle-guard.script';

/**
 * Every pull request of the repository, bodies included, outgrew the 32 MB
 * the lint reads and broke it on every pull request (ENOBUFS, run
 * 42749758353). The list is asked for with only the fields it reads.
 */
describe('the pull requests ref-lifecycle reads', () => {
	it('[<20ms] are asked for with the fields the lint reads, and no body', () => {
		for (const field of [
			'number',
			'state',
			'merged_at',
			'closed_at',
			'ref: .head.ref',
			'sha: .head.sha',
		]) {
			expect(PULL_REQUEST_FIELDS).toContain(field);
		}
		expect(PULL_REQUEST_FIELDS).not.toMatch(/\bbody\b/u);
		expect(PULL_REQUEST_FIELDS.startsWith('.[] | {')).toBe(true);
	});
});
