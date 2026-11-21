import { describe, expect, it } from 'vitest';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
	parseProposalMarkdown,
	parseSliceSections,
} from '../../../src/lib/markdown-parser';

const DOC = `---
id: x00512
title: Capability resolver
kind: fix
status: ready
type: proposal
track: architecture
tags:
  - sqlite
  - proposals
---

# x00512 — Capability resolver

## Goal

Make the capability surface lazy.
`;

describe('markdown-parser (q00022 S2)', () => {
	it('extracts and parses the yaml block', () => {
		expect(extractYamlBlock(DOC)).toContain('id: x00512');
		const parsed = parseFrontmatterBlock(extractYamlBlock(DOC) ?? '');
		expect(parsed.id).toBe('x00512');
		expect(parsed.kind).toBe('fix');
		expect(parsed.tags).toEqual(['sqlite', 'proposals']);
	});

	it('parses a proposal markdown into frontmatter, title, and body hash', () => {
		const parsed = parseProposalMarkdown('ready/fixes/x00512.md', DOC);
		expect(parsed.title).toBe('Capability resolver');
		expect(parsed.body).toContain('## Goal');
		expect(parsed.bodyHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('reads a key whatever whitespace surrounds its colon', () => {
		// The key/value split stopped being a regular expression (it
		// backtracked polynomially on a line of whitespace), so what it
		// accepts has to be pinned: padding on either side of the colon,
		// a value that contains further colons, and a line with no colon
		// at all, which is skipped rather than parsed.
		const parsed = parseFrontmatterBlock(
			[
				'id \t:   x00512',
				'title: a: b: c',
				'no-colon-here',
				': novalue',
			].join('\n'),
		);

		expect(parsed.id).toBe('x00512');
		expect(parsed.title).toBe('a: b: c');
		expect(Object.keys(parsed)).toEqual(['id', 'title']);
	});

	it('parses a pathological whitespace line in linear time', () => {
		// 40k spaces and no colon: the pattern this replaced would scan
		// the line once per starting offset. Frontmatter arrives from any
		// file the workspace happens to contain, so the bound matters.
		const startedAt = performance.now();
		const parsed = parseFrontmatterBlock(
			`${'id: x00512\n'}${' '.repeat(40_000)}`,
		);

		expect(parsed.id).toBe('x00512');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});

	it('rejects markdown without frontmatter', () => {
		expect(() =>
			parseProposalMarkdown(
				'ready/fixes/x00512.md',
				'# missing frontmatter',
			),
		).toThrow(/Missing YAML frontmatter/);
	});
});

// js/polynomial-redos: a long whitespace run must not be quadratic.
describe('markdown-parser stays linear on pathological lines', () => {
	const spaces = ' '.repeat(100_000);
	const timed = (run: () => unknown): number => {
		const start = performance.now();
		run();
		return performance.now() - start;
	};

	it('reads the title past a 100000-space line', () => {
		const raw = `---\nid: x1\n---\n#${spaces}x`;
		let title = '';
		expect(
			timed(() => {
				title = parseProposalMarkdown('p.md', raw).title;
			}),
		).toBeLessThan(500);
		expect(title).toBe('x');
	});

	it('parses slice headings and status through long runs of spaces', () => {
		const body = [
			'## Slices',
			`###${spaces}S1${spaces}x`,
			`###${spaces}`,
			`### S2${spaces}— t`,
			`-${spaces}**Status**${spaces}:${spaces}`,
			`-${spaces}**Status**${spaces}: pending${spaces}`,
		].join('\n');
		let parsed: ReturnType<typeof parseSliceSections> = [];
		expect(
			timed(() => {
				parsed = parseSliceSections(body);
			}),
		).toBeLessThan(500);
		expect(parsed).toEqual([
			{ sliceId: 'S2', title: 't', status: 'pending' },
		]);
	});

	it('keeps the tolerant slice grammar', () => {
		expect(
			parseSliceSections(
				'## Slices\n### F2-S1 - hello\n- **Status**: done\n### prose — no\n## Next',
			),
		).toEqual([{ sliceId: 'F2-S1', title: 'hello', status: 'done' }]);
	});
});
