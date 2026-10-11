import { describe, expect, it } from 'vitest';

import { RunInputSchema } from '../../../../src/lib/tools/audit-run.schemas';

const baseArgs = {
	targets: [{ provider: 'openai', model: 'gpt-4o', apiKey: 'k' }],
};

// x00165 (S-B): `proposalPrefix` used to be a closed enum hardcoding a
// stale, diverged copy of the proposal-kind-prefix taxonomy (missing
// real current prefixes like `b`/`v`/`i`/`s`, and including a
// nonexistent `u`). It is now a generic single-lowercase-letter shape
// validator, decoupled from any specific host's kind taxonomy.
describe('RunInputSchema — proposalPrefix (x00165)', () => {
	it('accepts a prefix the old enum used to reject (e.g. "b")', () => {
		const result = RunInputSchema.safeParse({
			...baseArgs,
			proposalPrefix: 'b',
		});
		expect(result.success).toBe(true);
	});

	it('accepts every prefix the old enum used to allow', () => {
		for (const prefix of [
			'f',
			'x',
			'c',
			'r',
			'd',
			'a',
			't',
			'n',
			'q',
			'l',
		]) {
			const result = RunInputSchema.safeParse({
				...baseArgs,
				proposalPrefix: prefix,
			});
			expect(result.success).toBe(true);
		}
	});

	it('rejects a multi-character prefix', () => {
		const result = RunInputSchema.safeParse({
			...baseArgs,
			proposalPrefix: 'fix',
		});
		expect(result.success).toBe(false);
	});

	it('rejects an uppercase or non-letter prefix', () => {
		expect(
			RunInputSchema.safeParse({ ...baseArgs, proposalPrefix: 'F' })
				.success,
		).toBe(false);
		expect(
			RunInputSchema.safeParse({ ...baseArgs, proposalPrefix: '1' })
				.success,
		).toBe(false);
	});

	it('omitting proposalPrefix is still valid (optional)', () => {
		const result = RunInputSchema.safeParse(baseArgs);
		expect(result.success).toBe(true);
	});

	it('accepts shared detail levels', () => {
		const result = RunInputSchema.safeParse({
			...baseArgs,
			detail: 'compact',
		});
		expect(result.success).toBe(true);
	});
});
