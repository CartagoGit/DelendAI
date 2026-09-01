#!/usr/bin/env bun
/**
 * single-frontmatter.script.ts — x00297.
 *
 * Zero-tolerance gate: fails when a proposal `.md` file contains more
 * than one YAML-frontmatter block. Every proposal lint in this repo
 * (`extractYamlBlock` in `frontmatter-parser.ts`) reads only the FIRST
 * `---...---` block at the top of the file — anything concatenated
 * after it is silently ignored by `lint:proposals`,
 * `proposal-folder-drift`, and every tool that renders the document.
 *
 * The failure mode this catches: an editing tool (apply_patch / a close-
 * slice write) matches an insertion anchor ambiguously and splices an
 * entire stale copy of the document — frontmatter included — into the
 * middle of the current one, sometimes mid-string (the injected `---`
 * lands at the tail of an unrelated line rather than on its own line).
 * `f00067a-provider-schema-catalog-surface-f00067-s1-residual.md` was
 * found in exactly this state: a `done` frontmatter block, then 18 lines
 * later, fused onto the end of an acceptance-bullet regex, a second
 * `ready` frontmatter block followed by a duplicate Goal/Slices header.
 *
 * Detection is NOT "count `---` lines": a legitimate `---` frontmatter
 * delimiter also appears inside fenced ```yaml/```markdown code blocks
 * that *quote* another proposal's frontmatter as evidence (audits do
 * this routinely — see a00043/a00044/a00072/c00011/c00075, all of which
 * looked corrupted under a naive `grep -c '^id: '` scan but are in fact
 * single-frontmatter files with a fenced excerpt in the body). So this
 * scans for lines shaped like a frontmatter `id:` root key
 * (`^id: <prefix><digits>`, the one line every real frontmatter block
 * has and prose/fenced examples in this repo do not coincidentally
 * reproduce) while tracking fence state and skipping matches inside
 * ``` / ~~~ fences. More than one such line outside fences means more
 * than one frontmatter block.
 *
 * Scope: `docs/mcp-vertex/proposals/**​/*.md`, excluding `legacy/` (the
 * frozen archive is covered by `closed-frozen-guard`, not this gate).
 *
 * Exit codes:
 *   0 — every scanned file has exactly one (or zero, e.g. a non-
 *       proposal README) frontmatter-shaped `id:` line outside fences.
 *   1 — at least one file has more than one.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/**
 * Matches a root-level YAML `id:` key shaped like a proposal id
 * (`f00067a`, `a00072`, `c00011`, `x00297`, legacy short forms like
 * `l99`/`p5`) on a line by itself. Deliberately narrower than "starts
 * with `id:`" — `id: 'round_context'` (a tool-definition field quoted in
 * a fenced code sample) and `id: <id>` (a template placeholder in a
 * fenced doc example) must NOT match; both appear for real in this repo.
 */
export const PROPOSAL_ID_LINE = /^id:\s*[a-z]\d{1,6}[a-z]?\s*$/i;

/**
 * Scans markdown for lines matching `PROPOSAL_ID_LINE`, skipping any
 * line inside a fenced code block (``` or ~~~, toggled per fence
 * marker). Returns the 1-based line numbers found, in file order — so
 * `result.length > 1` means more than one frontmatter block, and
 * `result.slice(1)` are the extra ones to report.
 *
 * Pure over its input string; no filesystem access, so the corruption
 * shape above (and the fenced-excerpt non-corruption shape) can be
 * pinned directly in the spec without touching disk.
 */
export const findFrontmatterIdLines = (markdown: string): readonly number[] => {
	const lines = markdown.split('\n');
	let inFence = false;
	const found: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const trimmed = line.trim();
		if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (PROPOSAL_ID_LINE.test(line)) found.push(i + 1);
	}
	return found;
};

/** One file with more than one frontmatter block. */
export interface IMultiFrontmatterViolation {
	readonly relPath: string;
	/** 1-based line numbers of every frontmatter-shaped `id:` line found. */
	readonly idLines: readonly number[];
}

/**
 * Recursively collects every `.md` file under `proposalsDirAbs`,
 * excluding any path with a `legacy` segment (the frozen archive is
 * covered by `closed-frozen-guard`, which has its own drift model for
 * content that is expected to never change again).
 */
export const collectProposalMarkdownFiles = async (
	proposalsDirAbs: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	const walk = async (dirAbs: string): Promise<void> => {
		const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of dirents) {
			if (entry.name === 'legacy') continue;
			const abs = join(dirAbs, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				out.push(abs);
			}
		}
	};
	await walk(proposalsDirAbs);
	return out.sort((a, b) => a.localeCompare(b));
};

/**
 * Reads every file `collectProposalMarkdownFiles` finds and reports the
 * ones with more than one frontmatter-shaped `id:` line outside fences.
 */
export const detectMultipleFrontmatter = async (
	proposalsDirAbs: string,
): Promise<readonly IMultiFrontmatterViolation[]> => {
	const files = await collectProposalMarkdownFiles(proposalsDirAbs);
	const violations: IMultiFrontmatterViolation[] = [];
	for (const abs of files) {
		const markdown = await readFile(abs, 'utf8');
		const idLines = findFrontmatterIdLines(markdown);
		if (idLines.length > 1) {
			violations.push({
				relPath: abs
					.slice(proposalsDirAbs.length)
					.replace(/^[/\\]+/, ''),
				idLines,
			});
		}
	}
	return violations;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const proposalsDirAbs = join(root, 'docs', 'mcp-vertex', 'proposals');
		const violations = await detectMultipleFrontmatter(proposalsDirAbs);

		if (violations.length === 0) {
			console.log(
				'✓ single-frontmatter: every proposal file has exactly one frontmatter block',
			);
			return;
		}

		console.error(
			`✖ single-frontmatter: ${violations.length} file(s) with more than one frontmatter block:`,
		);
		for (const v of violations) {
			console.error(
				`  ${relative(root, join(proposalsDirAbs, v.relPath))}: id-lines at ${v.idLines.join(', ')}`,
			);
		}
		console.error(
			'  fix: reconstruct one coherent document — check `git log --follow -p` to see ' +
				'which block is the current one and whether the other holds content the ' +
				'current one lost before deleting it.',
		);
		process.exit(1);
	})();
}
