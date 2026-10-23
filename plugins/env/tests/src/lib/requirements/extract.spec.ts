/**
 * extract.spec.ts — pull env-var requirements out of a zod options schema.
 */
import { describe, expect, it } from 'vitest';
import z from 'zod';

import { extractRequirements } from '@delendai/env/lib/requirements/extract';
import type { IZodLike } from '@delendai/env/lib/requirements/extract';

/**
 * A zod schema already satisfies the structural `IZodLike` shape at runtime;
 * the cast is confined to this one helper so the spec body stays free of
 * repeated `as unknown` double-casts (test-unsafe-casts ratchet).
 */
const asZodLike = (schema: z.ZodType): IZodLike =>
	schema as unknown as IZodLike;

describe('extractRequirements', () => {
	it('returns an empty list when the schema has no env markers', () => {
		const schema = z.object({
			name: z.string().describe('A friendly name'),
		});
		const result = extractRequirements('test', asZodLike(schema));
		expect(result).toEqual([]);
	});

	it('extracts one requirement per env:VAR marker', () => {
		const schema = z.object({
			token: z
				.string()
				.describe(
					'GitHub token — env:GH_TOKEN, provider:github, capability:GitHub API auth',
				),
		});
		const result = extractRequirements('github', asZodLike(schema));
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			var: 'GH_TOKEN',
			plugin: 'github',
			capability: 'GitHub token —',
			provider: 'github',
			required: true,
		});
	});

	it('marks required: false when describe text includes "optional"', () => {
		const schema = z.object({
			token: z
				.string()
				.optional()
				.describe(
					'Optional token — env:OPTIONAL_TOKEN, provider:foo, capability:foo API',
				),
		});
		const result = extractRequirements('foo', asZodLike(schema));
		expect(result[0]?.required).toBe(false);
	});

	it('omits provider when no provider: marker is present', () => {
		const schema = z.object({
			key: z
				.string()
				.describe('Some key — env:MY_KEY, capability:My capability'),
		});
		const result = extractRequirements('myplugin', asZodLike(schema));
		expect(result[0]?.provider).toBeUndefined();
	});

	it('deduplicates when the same var appears in two fields', () => {
		const schema = z.object({
			primary: z.string().describe('env:DUP_VAR, capability:A'),
			secondary: z.string().describe('env:DUP_VAR, capability:B'),
		});
		const result = extractRequirements('test', asZodLike(schema));
		expect(result).toHaveLength(1);
		expect(result[0]?.var).toBe('DUP_VAR');
	});

	it('only includes fields that contain an env: marker', () => {
		const schema = z.object({
			envField: z.string().describe('env:REAL_VAR, capability:X'),
			plainField: z.string().describe('No marker here'),
		});
		const result = extractRequirements('test', asZodLike(schema));
		expect(result).toHaveLength(1);
		expect(result[0]?.var).toBe('REAL_VAR');
	});

	it('keeps the exact capability label before the env marker', () => {
		const schema = z.object({
			token: z
				.string()
				.describe(
					'GitHub token   env:GH_TOKEN, provider:github, capability:GitHub API auth',
				),
		});
		expect(extractRequirements('github', asZodLike(schema))).toEqual([
			{
				var: 'GH_TOKEN',
				plugin: 'github',
				capability: 'GitHub token',
				provider: 'github',
				required: true,
			},
		]);
	});

	it('handles a long describe prefix before env without pathological slowdown', () => {
		const schema = z.object({
			token: z
				.string()
				.describe(
					`${'GitHub token '.repeat(20_000)} env:GH_TOKEN, provider:github, capability:GitHub API auth`,
				),
		});
		const startedAt = performance.now();
		const [result] = extractRequirements('github', asZodLike(schema));
		expect(result).toEqual({
			var: 'GH_TOKEN',
			plugin: 'github',
			capability: 'GitHub token '.repeat(20_000).trim(),
			provider: 'github',
			required: true,
		});
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
