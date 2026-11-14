/**
 * `parseInputSchema` — JSON Schema → flat field list for the docs site.
 *
 * The MCP `listTools` endpoint returns `inputSchema` as a JSON Schema
 * object (the SDK converts the Zod schema at registration time). The
 * docs site renders this as an "Argument · Type · Required · Description"
 * table per tool. This spec pins the parser behaviour so future MCP SDK
 * upgrades cannot silently break the table.
 */
import { describe, expect, it } from 'vitest';

import {
	parseInputSchema,
	type IParsedInputSchema,
} from '../lib/parse-input-schema';

describe('parseInputSchema', () => {
	it('returns undefined for null/undefined/non-object input', () => {
		expect(parseInputSchema(null)).toBeUndefined();
		expect(parseInputSchema(undefined)).toBeUndefined();
		expect(parseInputSchema('string')).toBeUndefined();
		expect(parseInputSchema(42)).toBeUndefined();
		expect(parseInputSchema([])).toBeUndefined();
	});

	it('returns undefined when properties is missing (no schema declared)', () => {
		expect(parseInputSchema({ type: 'object' })).toBeUndefined();
	});

	it('returns empty fields when properties is an empty object', () => {
		const out: IParsedInputSchema | undefined = parseInputSchema({
			type: 'object',
			properties: {},
		});
		expect(out).toEqual({ fields: [] });
	});

	it('extracts name, type, required and description per field', () => {
		const out = parseInputSchema({
			type: 'object',
			properties: {
				compact: { type: 'boolean', description: 'shrink payload' },
				tag: { type: 'string', description: 'filter by tag' },
			},
			required: ['compact'],
		});
		expect(out?.fields).toEqual([
			{
				name: 'compact',
				type: 'boolean',
				required: true,
				description: 'shrink payload',
			},
			{
				name: 'tag',
				type: 'string',
				required: false,
				description: 'filter by tag',
			},
		]);
	});

	it('sorts required fields first, then alphabetical within each group', () => {
		const out = parseInputSchema({
			type: 'object',
			properties: {
				zeta: { type: 'string' },
				alpha: { type: 'string' },
				beta: { type: 'string' },
			},
			required: ['zeta'],
		});
		// required group first (alphabetical: just `zeta`), then optional (alpha, beta).
		expect(out?.fields.map((f) => f.name)).toEqual([
			'zeta',
			'alpha',
			'beta',
		]);
	});

	it('handles union types (e.g. ["string","null"]) by picking the non-null variant', () => {
		const out = parseInputSchema({
			type: 'object',
			properties: {
				optional: { type: ['string', 'null'] },
			},
		});
		expect(out?.fields[0]?.type).toBe('string');
	});

	it('falls back to "unknown" when the prop has no type', () => {
		const out = parseInputSchema({
			type: 'object',
			properties: {
				anything: { description: 'no type field' },
			},
		});
		expect(out?.fields[0]?.type).toBe('unknown');
	});

	it('skips non-string entries in the required list defensively', () => {
		const out = parseInputSchema({
			type: 'object',
			properties: {
				id: { type: 'string' },
			},
			required: ['id', 42, null],
		});
		expect(out?.fields[0]?.required).toBe(true);
	});
});
