import { describe, expect, it } from 'vitest';

import {
	FORGE_ISSUE_CREATE_INPUT_SCHEMA,
	FORGE_ISSUE_CREATE_OUTPUT_SCHEMA,
	FORGE_PR_COMMENT_INPUT_SCHEMA,
	FORGE_PR_CREATE_INPUT_SCHEMA,
	FORGE_PR_CREATE_OUTPUT_SCHEMA,
} from './forge-write.constant';

describe('forge write schemas', () => {
	it('accepts a valid PR create success envelope', () => {
		expect(
			FORGE_PR_CREATE_OUTPUT_SCHEMA.safeParse({
				ok: true,
				provider: 'github',
				data: {
					pr: {
						number: 21,
						title: 'feat(f00121): forge plugin write surface',
						url: 'https://github.com/o/r/pull/21',
						body: '# Summary',
						draft: true,
						base: 'develop',
						head: 'agent/copilot-minimax-m3-f00121-s2',
					},
				},
			}).success,
		).toBe(true);
	});

	it('keeps write input schemas strict', () => {
		expect(
			FORGE_PR_CREATE_INPUT_SCHEMA.safeParse({
				title: 'x',
				confirm: true,
				extra: true,
			}).success,
		).toBe(false);
		expect(
			FORGE_PR_COMMENT_INPUT_SCHEMA.safeParse({
				number: 7,
				body: 'hello',
				other: 1,
			}).success,
		).toBe(false);
		expect(
			FORGE_ISSUE_CREATE_INPUT_SCHEMA.safeParse({
				title: 'bug',
				labels: ['triage'],
				noise: 'x',
			}).success,
		).toBe(false);
	});

	it('accepts failure envelopes for confirm gating', () => {
		expect(
			FORGE_ISSUE_CREATE_OUTPUT_SCHEMA.safeParse({
				ok: false,
				error: { reason: 'confirm: true required' },
			}).success,
		).toBe(true);
	});
});
