import { describe, expect, it } from 'vitest';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
	parseProposalMarkdown,
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

	it('rejects markdown without frontmatter', () => {
		expect(() =>
			parseProposalMarkdown(
				'ready/fixes/x00512.md',
				'# missing frontmatter',
			),
		).toThrow(/Missing YAML frontmatter/);
	});
});
