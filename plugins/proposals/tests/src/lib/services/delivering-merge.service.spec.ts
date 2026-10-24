/**
 * delivering-merge.service.spec.ts — what a slice declares, matched
 * against the paths a delivery changed (x00746).
 */
import { describe, expect, it } from 'vitest';

import { touchesDeclared } from '@delendai/proposals/lib/services/delivering-merge.service';

describe('touchesDeclared', () => {
	const changed = new Set([
		'packages/context-compiler/src/lib/context-compiler.ts',
		'README.md',
	]);

	it('matches a declared file, and a declared directory by what is under it', () => {
		expect(touchesDeclared(['README.md'], changed)).toBe(true);
		expect(
			touchesDeclared(['packages/context-compiler/src'], changed),
		).toBe(true);
		expect(
			touchesDeclared(['packages/context-compiler/src/'], changed),
		).toBe(true);
	});

	it('does not read a sibling that shares a prefix as under the directory', () => {
		expect(touchesDeclared(['packages/context-compiler/sr'], changed)).toBe(
			false,
		);
		expect(touchesDeclared(['packages/context'], changed)).toBe(false);
		expect(touchesDeclared([''], changed)).toBe(false);
	});
});
