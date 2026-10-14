import { describe, expect, it } from 'vitest';
import {
	FORGE_CI_STATUS_INPUT_SCHEMA,
	FORGE_CI_STATUS_OUTPUT_SCHEMA,
	FORGE_ISSUE_LIST_INPUT_SCHEMA,
	FORGE_ISSUE_SHOW_OUTPUT_SCHEMA,
	FORGE_PR_LIST_OUTPUT_SCHEMA,
	FORGE_PR_SHOW_INPUT_SCHEMA,
} from './forge-read.constant';
describe('forge read schemas', () => {
	it('accepts a valid PR list success envelope', () => {
		expect(
			FORGE_PR_LIST_OUTPUT_SCHEMA.safeParse({
				ok: true,
				provider: 'github',
				data: {
					prs: [
						{
							number: 12,
							title: 'feat: add forge read tools',
							branch: 'feat/forge-read',
							url: 'https://github.com/o/r/pull/12',
							draft: false,
							author: 'octocat',
							labels: ['feature'],
							ciSummary: {
								total: 2,
								successful: 1,
								failed: 1,
								pending: 0,
								running: 0,
							},
						},
					],
				},
			}).success,
		).toBe(true);
	});
	it('rejects unknown input keys on strict schemas', () => {
		expect(
			FORGE_PR_SHOW_INPUT_SCHEMA.safeParse({ pr: 1, extra: true })
				.success,
		).toBe(false);
		expect(
			FORGE_CI_STATUS_INPUT_SCHEMA.safeParse({ limit: 5, noisy: 'x' })
				.success,
		).toBe(false);
		expect(
			FORGE_ISSUE_LIST_INPUT_SCHEMA.safeParse({ state: 'open', other: 1 })
				.success,
		).toBe(false);
	});
	it('accepts failure envelopes with remediation', () => {
		expect(
			FORGE_CI_STATUS_OUTPUT_SCHEMA.safeParse({
				ok: false,
				provider: 'gitlab',
				error: {
					reason: 'glab is not installed',
					remediation: 'brew install glab',
				},
			}).success,
		).toBe(true);
		expect(
			FORGE_ISSUE_SHOW_OUTPUT_SCHEMA.safeParse({
				ok: false,
				error: { reason: 'issue not found' },
			}).success,
		).toBe(true);
	});
});
