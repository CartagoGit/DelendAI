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
	it('[<8ms] refuses a function that carries the name of a decision', () => {
		const found = findReimplementations(
			'tools/scripts/forge/mine.ts',
			'export const overlapBetween = (a: Set<string>) => a.size > 0;\n',
		);
		expect(found).toEqual([
			'tools/scripts/forge/mine.ts:1 — defines overlapBetween',
		]);
	});

	it('[<8ms] refuses the namespace strip written by hand, under any name', () => {
		const found = findReimplementations(
			'plugins/x/src/a.ts',
			"const bare = (p: string) =>\n\tp.replace(/^refs\\//u, '').replace(/^heads\\//u, '');\n",
		);
		expect(found).toHaveLength(1);
		expect(found[0]).toContain('computes a ref namespace');
	});

	it('[<5ms] refuses a culprit marker read off a branch', () => {
		const found = findReimplementations(
			'tools/scripts/git/a.ts',
			'if (branch.startsWith(`${prefix}culprit/`)) return 1;\n',
		);
		expect(found[0]).toContain('culprit marker');
	});

	it('[<5ms] refuses retired roots built from the owned namespaces by hand (carried-work)', () => {
		const old =
			"namespace === '' ? 'refs/retired/' : `refs/${namespace}/retired/`,\n";
		const found = findReimplementations('plugins/proposals/a.ts', old);
		expect(found).toHaveLength(1);
		expect(found[0]).toContain('retired roots');
		expect(
			findReimplementations(
				'plugins/proposals/a.ts',
				'const roots = retiredRefRoots(shape);\n',
			),
		).toEqual([]);
	});

	it('[<5ms] allows the module itself and ignores comments', () => {
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

	it('[<5ms] a file that only uses a decision is clean', () => {
		expect(
			findReimplementations(
				'tools/a.ts',
				"import { overlapBetween } from '@delendai/core/cli';\noverlapBetween(a, b);\n",
			),
		).toEqual([]);
	});
});
