#!/usr/bin/env bun
/**
 * single-frontmatter.script.spec.ts — x00297 acceptance.
 *
 * `findFrontmatterIdLines` is the pure detector; `detectMultipleFrontmatter`
 * is the filesystem-walking half, exercised against a `mkdtemp` fixture
 * tree (mirrors `check-proposal-id-drift.script.spec.ts`).
 *
 * Fixtures pin the three shapes that matter:
 *   1. A clean file (one frontmatter block) → no violation.
 *   2. A two-block file, including the exact f00067a corruption shape
 *      (second `---` fused onto the tail of an unrelated line rather
 *      than starting its own line) → violation.
 *   3. A fenced ```yaml example quoting another proposal's frontmatter
 *      in the body (the a00043/a00044/a00072/c00011/c00075 shape) →
 *      must NOT false-positive.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	collectProposalMarkdownFiles,
	detectMultipleFrontmatter,
	findFrontmatterIdLines,
} from './single-frontmatter.script.ts';

describe('findFrontmatterIdLines', () => {
	it('finds exactly one id-line in a clean single-frontmatter file', () => {
		const markdown = [
			'---',
			'id: f00100',
			'status: done',
			'---',
			'',
			'# f00100 — a clean proposal',
			'',
			'## Goal',
			'',
			'Body text with no other id: lines.',
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2]);
	});

	it('finds zero id-lines in a file with no frontmatter at all', () => {
		expect(findFrontmatterIdLines('# README\n\nJust prose.\n')).toEqual([]);
	});

	it('finds two id-lines in a standard two-block concatenation', () => {
		const markdown = [
			'---',
			'id: f00200',
			'status: done',
			'---',
			'',
			'# body',
			'',
			'---',
			'id: f00200',
			'status: ready',
			'---',
			'',
			'# stale duplicate body',
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2, 9]);
	});

	it('finds the f00067a shape: the second `---` fused onto an unrelated line, not on its own line', () => {
		// Reproduces the real corruption byte-for-byte in miniature: the
		// acceptance-bullet regex runs straight into `---` with no
		// newline before it, then `id:` starts its own line immediately
		// after — exactly what an ambiguous patch-anchor match produced.
		const markdown = [
			'---',
			'id: f00067a',
			'status: done',
			'---',
			'',
			'- acceptance: "regex `^[a-z][a-z0-9-]+---',
			'id: f00067a',
			'status: ready',
			'---',
			'',
			'), more text finishing the sentence."',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2, 7]);
	});

	it('does NOT count a fenced ```yaml block quoting another proposal id as frontmatter (the a00044/a00043 shape)', () => {
		const markdown = [
			'---',
			'id: a00044',
			'status: done',
			'---',
			'',
			'## Findings',
			'',
			'The duplicated content is literally:',
			'',
			'```yaml',
			'---',
			'id: f00058',
			'status: done',
			'---',
			'```',
			'',
			'That duplication is the bug this audit reports.',
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2]);
	});

	it('does NOT count a fenced ~~~ block either', () => {
		const markdown = [
			'---',
			'id: c00075',
			'status: done',
			'---',
			'',
			'~~~yaml',
			'---',
			'id: c00075',
			'status: paused',
			'paused-reason: "example"',
			'---',
			'~~~',
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2]);
	});

	it('does NOT match a quoted-field id that only resembles a key (round_context shape)', () => {
		const markdown = [
			'---',
			'id: a00083',
			'status: done',
			'---',
			'',
			"id: 'round_context',",
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2]);
	});

	it('does NOT match a template placeholder id (the f00175 `id: <id>` shape)', () => {
		const markdown = [
			'---',
			'id: f00175',
			'status: done',
			'---',
			'',
			'```md',
			'---',
			'id: <id>',
			'package: <package>',
			'---',
			'```',
			'',
		].join('\n');
		expect(findFrontmatterIdLines(markdown)).toEqual([2]);
	});
});

describe('collectProposalMarkdownFiles + detectMultipleFrontmatter', () => {
	let root: string;
	let proposalsDirAbs: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'single-frontmatter-'));
		proposalsDirAbs = join(root, 'docs', 'delendai', 'proposals');
		mkdirSync(join(proposalsDirAbs, 'done', 'feats'), { recursive: true });
		mkdirSync(join(proposalsDirAbs, 'legacy', 'closed', 'feats'), {
			recursive: true,
		});
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const write = (relPath: string, content: string): void => {
		const abs = join(proposalsDirAbs, relPath);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, content, 'utf8');
	};

	it('excludes anything under legacy/', async () => {
		write(
			'legacy/closed/feats/f00001-old.md',
			'---\nid: f00001\nstatus: done\n---\n---\nid: f00001\nstatus: ready\n---\n',
		);
		write(
			'done/feats/f00002-clean.md',
			'---\nid: f00002\nstatus: done\n---\n# ok\n',
		);
		const files = await collectProposalMarkdownFiles(proposalsDirAbs);
		expect(files).toHaveLength(1);
		expect(files[0]).toContain('f00002-clean.md');

		const violations = await detectMultipleFrontmatter(proposalsDirAbs);
		expect(violations).toEqual([]);
	});

	it('reports a real two-block file and stays silent on a fenced-example file', async () => {
		write(
			'done/feats/f00067a-corrupt.md',
			[
				'---',
				'id: f00067a',
				'status: done',
				'---',
				'',
				'- acceptance: "regex `^[a-z]+---',
				'id: f00067a',
				'status: ready',
				'---',
				'',
				') finishing the sentence."',
			].join('\n'),
		);
		write(
			'done/feats/a00044-audit-with-fenced-quote.md',
			[
				'---',
				'id: a00044',
				'status: done',
				'---',
				'',
				'```yaml',
				'---',
				'id: f00058',
				'status: done',
				'---',
				'```',
			].join('\n'),
		);

		const violations = await detectMultipleFrontmatter(proposalsDirAbs);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.relPath.replace(/\\/g, '/')).toBe(
			'done/feats/f00067a-corrupt.md',
		);
		expect(violations[0]?.idLines).toEqual([2, 7]);
	});
});
