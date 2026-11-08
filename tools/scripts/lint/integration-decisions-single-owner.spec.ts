/**
 * integration-decisions-single-owner.spec.ts — a second implementation of
 * an integration decision is refused, by name and by signature, and the
 * module itself is allowed.
 */
import { describe, expect, it } from 'vitest';

import {
	DECISIONS_MODULE,
	findReimplementations,
} from './integration-decisions-single-owner.script';

describe('integration decisions have one owner', () => {
	it('[<20ms] refuses a function that carries the name of a decision', () => {
		const found = findReimplementations(
			'tools/scripts/forge/mine.ts',
			'export const overlapBetween = (a: Set<string>) => a.size > 0;\n',
		);
		expect(found).toEqual([
			'tools/scripts/forge/mine.ts:1 — defines overlapBetween',
		]);
	});

	it('[<20ms] refuses the namespace strip written by hand, under any name', () => {
		const found = findReimplementations(
			'plugins/x/src/a.ts',
			"const bare = (p: string) =>\n\tp.replace(/^refs\\//u, '').replace(/^heads\\//u, '');\n",
		);
		expect(found).toHaveLength(1);
		expect(found[0]).toContain('computes a ref namespace');
	});

	it('[<20ms] refuses a culprit marker read off a branch', () => {
		const found = findReimplementations(
			'tools/scripts/git/a.ts',
			'if (branch.startsWith(`${prefix}culprit/`)) return 1;\n',
		);
		expect(found[0]).toContain('culprit marker');
	});

	it('[<20ms] allows the module itself and ignores comments', () => {
		const text = 'export const overlapBetween = () => undefined;\n';
		expect(
			findReimplementations(`${DECISIONS_MODULE}overlap.ts`, text),
		).toEqual([]);
		expect(
			findReimplementations(
				'tools/a.ts',
				"// .replace(/^refs\\//u, '').replace(/^heads\\//u, '')\n",
			),
		).toEqual([]);
	});

	it('[<20ms] a file that only uses a decision is clean', () => {
		expect(
			findReimplementations(
				'tools/a.ts',
				"import { overlapBetween } from '@delendai/core/cli';\noverlapBetween(a, b);\n",
			),
		).toEqual([]);
	});
});
