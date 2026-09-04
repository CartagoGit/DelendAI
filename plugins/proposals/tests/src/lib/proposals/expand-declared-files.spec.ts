/**
 * expand-declared-files.spec.ts
 *
 * x00158 S1 — the shared brace-aware `Files:` line parser. Both
 * `proposal-completeness.ts` and `proposal-slice-plan.ts` now import
 * this module instead of carrying their own (one buggy) duplicate.
 */
import { describe, expect, it } from 'vitest';

import {
	BACKTICKED,
	BRACE_PATTERN,
	expandDeclaredFiles,
} from '../../../../src/lib/proposals/expand-declared-files';

describe('expandDeclaredFiles', () => {
	it('exports the shared regex constants', () => {
		expect(BACKTICKED).toBeInstanceOf(RegExp);
		expect(BRACE_PATTERN).toBeInstanceOf(RegExp);
	});

	it('parses a plain comma-separated backticked list', () => {
		expect(expandDeclaredFiles('`a/b.ts`, `c/d.ts`')).toEqual([
			'a/b.ts',
			'c/d.ts',
		]);
	});

	it('expands a single brace pattern', () => {
		expect(expandDeclaredFiles('`dir/{a,b,c}.ts`')).toEqual([
			'dir/a.ts',
			'dir/b.ts',
			'dir/c.ts',
		]);
	});

	it('expands a brace pattern mixed with a sibling path across lines (x00155 S1 regression)', () => {
		const text = [
			'- **Files**:',
			'  - `docs/delendai/proposals/done/{resumes,chores,audits}/*` (frontmatter + slice rows in those proposals only)',
			'  - `tools/scripts/proposals/sync-proposal-registry.script.ts` (re-run at the end)',
		].join('\n');
		expect(expandDeclaredFiles(text)).toEqual([
			'docs/delendai/proposals/done/resumes/*',
			'docs/delendai/proposals/done/chores/*',
			'docs/delendai/proposals/done/audits/*',
			'tools/scripts/proposals/sync-proposal-registry.script.ts',
		]);
	});

	it('returns an empty list for empty or backtick-less input', () => {
		expect(expandDeclaredFiles('')).toEqual([]);
		expect(expandDeclaredFiles('no backticks here')).toEqual([]);
		expect(expandDeclaredFiles('``')).toEqual([]);
	});

	it('does not attempt to resolve nested braces (documented depth-1 limitation)', () => {
		// BRACE_PATTERN is greedy on the outer `{...}` capture, so a nested
		// brace is treated as one opaque choice list, not recursively
		// expanded. This pins the current (non-goal: "no new glob engine")
		// behavior rather than silently breaking on unexpected input.
		expect(expandDeclaredFiles('`a{b,{c,d}}.ts`')).toEqual([
			'a{b',
			'c}.ts',
			'd}.ts',
		]);
	});

	it('trims leading/trailing whitespace around each entry', () => {
		expect(expandDeclaredFiles('  `a.ts`  ,   `b.ts`   ')).toEqual([
			'a.ts',
			'b.ts',
		]);
	});

	it('ignores parenthetical annotations that sit outside the backticks', () => {
		expect(
			expandDeclaredFiles('`a.ts` (new file), `b.ts` (updated)'),
		).toEqual(['a.ts', 'b.ts']);
	});
});
