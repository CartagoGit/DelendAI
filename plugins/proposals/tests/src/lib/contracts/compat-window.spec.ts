import { describe, expect, it } from 'vitest';
import z from 'zod';

import {
	defineCompatWindow,
	parseWithCompatWindow,
} from '../../../../src/lib/contracts/compat-window';

describe('parseWithCompatWindow (f00152 S3)', () => {
	const pair = defineCompatWindow({
		v2: {
			version: 'v2',
			schema: z.object({
				id: z.string(),
				newField: z.boolean().optional(),
			}),
			sinceVersion: '0.5.0',
			removedIn: 'never',
			migrationHint: 'Add `newField` if you need the v2 extra column.',
			translate: () => ({ id: '', newField: false }),
		},
		v1: {
			version: 'v1',
			schema: z.object({ id: z.string() }),
			sinceVersion: '0.1.0',
			removedIn: '1.0.0',
			migrationHint: 'v1 still parses; migrate to v2 before 1.0.0.',
			translate: (old) => ({
				id: (old as { id: string }).id,
				newField: false,
			}),
		},
	});

	describe('v2 path', () => {
		it('returns the parsed value and a null warning', () => {
			const r = parseWithCompatWindow(pair, {
				id: 'f00152',
				newField: true,
			});
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.shapeUsed).toBe('v2');
				expect(r.warning).toBeNull();
				expect(r.value).toEqual({ id: 'f00152', newField: true });
			}
		});

		it('accepts v2 input that omits an optional field', () => {
			const r = parseWithCompatWindow(pair, { id: 'f00152' });
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.shapeUsed).toBe('v2');
				expect(r.value).toEqual({ id: 'f00152' });
			}
		});
	});

	describe('v1 fallback', () => {
		it('translates v1 input and emits a warning', () => {
			const r = parseWithCompatWindow(pair, { id: 'f00152' });
			// The v2 schema is a SUPERSET of v1, so v2 also matches. The
			// contract is: when the input matches BOTH shapes, v2 wins.
			// To exercise the v1 path we need a v2-only field that the
			// v1 schema ignores — but the v1 schema still matches because
			// it is narrower. So we need a pair where v2 is STRICTER
			// (requires a field v1 lacks) to force v1 fallback.
			//
			// This assertion documents the current behaviour: v2 is a
			// superset, so v2 wins. The v1-only test below uses a stricter
			// v2 schema.
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.shapeUsed).toBe('v2');
			}
		});
	});

	describe('strict v2 + loose v1', () => {
		const strictPair = defineCompatWindow({
			v2: {
				version: 'v2',
				schema: z.object({ id: z.string(), newField: z.boolean() }),
				sinceVersion: '0.5.0',
				removedIn: 'never',
				migrationHint: 'Add `newField`.',
				translate: () => ({ id: '', newField: false }),
			},
			v1: {
				version: 'v1',
				schema: z.object({ id: z.string() }),
				sinceVersion: '0.1.0',
				removedIn: '1.0.0',
				migrationHint: 'Migrate to v2.',
				translate: (old) => ({
					id: (old as { id: string }).id,
					newField: false,
				}),
			},
		});

		it('falls back to v1 when v2 fails (missing required newField)', () => {
			const r = parseWithCompatWindow(strictPair, { id: 'f00152' });
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.shapeUsed).toBe('v1');
				expect(r.value).toEqual({ id: 'f00152', newField: false });
				expect(r.warning).not.toBeNull();
				expect(r.warning?.version).toBe('v1');
				expect(r.warning?.migrationHint).toContain('Migrate to v2');
			}
		});
	});

	describe('error path', () => {
		const strictPair = defineCompatWindow({
			v2: {
				version: 'v2',
				schema: z.object({ id: z.string(), newField: z.boolean() }),
				sinceVersion: '0.5.0',
				removedIn: 'never',
				migrationHint: 'Add `newField`.',
				translate: () => ({ id: '', newField: false }),
			},
			v1: {
				version: 'v1',
				schema: z.object({ id: z.string(), otherField: z.string() }),
				sinceVersion: '0.1.0',
				removedIn: '1.0.0',
				migrationHint: 'Migrate to v2.',
				translate: (old) => ({
					id: (old as { id: string }).id,
					newField: false,
				}),
			},
		});

		it('returns ok:false when neither schema matches', () => {
			const r = parseWithCompatWindow(strictPair, { wrong: 'shape' });
			expect(r.ok).toBe(false);
		});
	});
});
