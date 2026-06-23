#!/usr/bin/env bun
/**
 * canonicalize-headings.script.ts — auto-fix utility for the proposal
 * scaffold linter.
 *
 * The linter (`tools/scripts/lint/proposals.script.ts` →
 * `lintProposalMarkdown`) accepts a fixed set of canonical H2 headings
 * (`goal`, `why`, `non-goals`, `slices`, `acceptance`, `notes`, …). When
 * an agent writes `## Acceptance (end-to-end)` or `## Goal`, the linter
 * flags it as `unrecognized section heading`. Historically this has been
 * fixed by hand, one heading at a time, in proposals like f00049 and
 * paused/f00050 — a 700-line churn that grows linearly with the number
 * of long-running proposals.
 *
 * This script applies the canonical mapping mechanically. It is **opt-in**
 * (`--write`) — by default it prints a dry-run diff so a human can review
 * the changes before they land. The mapping table is the same set of
 * canonical headings the linter uses (`PROPOSAL_CANONICAL_ORDER` +
 * `AUDIT_CANONICAL_ORDER`); we resolve it dynamically from the lint
 * module so the two cannot drift.
 *
 * Usage:
 *   bun tools/scripts/proposals/canonicalize-headings.script.ts <file>...
 *   bun tools/scripts/proposals/canonicalize-headings.script.ts --write <file>...
 *
 * Architecture (SOLID):
 *   - `IHeadingMatch` / `IHeadingFix` (interfaces) — input/output shape.
 *   - `loadCanonicalHeadings()` (engine) — read the canonical set from
 *     the linter; fail closed if the linter module is missing the export.
 *   - `normalizeHeading(text)` (pure mapper) — `## Acceptance (e2e)` →
 *     `acceptance`. Lowercases, strips parentheticals, aliases known
 *     synonyms.
 *   - `planFixes(markdown, canonical)` (pure engine) — diff-free plan:
 *     one entry per non-canonical H2.
 *   - `applyFixes(markdown, fixes)` (pure engine) — returns the rewritten
 *     markdown; does not touch I/O.
 *   - `formatPlan(file, fixes)` (pure formatter) — diff for stdout.
 *   - `main()` (CLI shell) — parses args, calls engines, writes on
 *     `--write`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
	PROPOSAL_CANONICAL_ORDER,
	AUDIT_CANONICAL_ORDER,
} from '../../../plugins/proposals/src/lib/proposals/proposal-scaffold-linter';

interface IHeadingMatch {
	readonly line: number;
	readonly raw: string;
	readonly canonical: string;
}

interface IHeadingFix {
	readonly line: number;
	readonly before: string;
	readonly after: string;
}

/** Map known non-canonical headings to the canonical form. The keys are
 * lowercase, trimmed, with parentheticals removed. */
const SYNONYMS: Readonly<Record<string, string>> = {
	goal: 'goal',
	why: 'why',
	'why this design': 'why this design',
	'non-goals': 'non-goals',
	architecture: 'architecture',
	slices: 'slices',
	'dependency graph': 'dependency graph',
	acceptance: 'acceptance',
	'risks and mitigations': 'risks and mitigations',
	notes: 'notes',
	'see also': 'notes',
	risks: 'risks and mitigations',
	// Heading-stripped variants the agent sometimes writes
	acceptancecriteria: 'acceptance',
	acceptancecriteriae2e: 'acceptance',
};

const stripParenthetical = (s: string): string =>
	s.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** Pure: returns the canonical form of an H2 text or null if it is
 * already canonical and recognised. */
export const normalizeHeading = (
	raw: string,
	canonical: readonly string[],
): string | null => {
	const text = raw.replace(/^##\s+/, '').trim();
	if (text === '') return null;
	const stripped = stripParenthetical(text).toLowerCase();
	if (canonical.includes(stripped)) return null;
	if (stripped in SYNONYMS) return SYNONYMS[stripped] ?? null;
	// Last-ditch heuristic: case-insensitive equality with a canonical
	// heading (handles `## Goal`, `##  GOAL `, etc).
	const hit = canonical.find((c) => c.toLowerCase() === stripped);
	return hit ?? null;
};

/** Pure: walk the markdown line-by-line and emit one IHeadingFix per
 * non-canonical H2. */
export const planFixes = (
	markdown: string,
	canonical: readonly string[],
): readonly IHeadingFix[] => {
	const fixes: IHeadingFix[] = [];
	const lines = markdown.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const m = line.match(/^##\s+(.+?)\s*$/);
		if (!m) continue;
		const replacement = normalizeHeading(m[1] ?? '', canonical);
		if (replacement === null) continue;
		fixes.push({
			line: i + 1,
			before: line,
			after: `## ${replacement}`,
		});
	}
	return fixes;
};

/** Pure: return the rewritten markdown. */
export const applyFixes = (
	markdown: string,
	fixes: readonly IHeadingFix[],
): string => {
	if (fixes.length === 0) return markdown;
	const lines = markdown.split('\n');
	for (const fix of fixes) {
		const idx = fix.line - 1;
		if (idx >= 0 && idx < lines.length) {
			lines[idx] = fix.after;
		}
	}
	return lines.join('\n');
};

export const loadCanonicalHeadings = async (
	auditMode: boolean,
): Promise<readonly string[]> => {
	const set = auditMode ? AUDIT_CANONICAL_ORDER : PROPOSAL_CANONICAL_ORDER;
	return Array.from(set);
};

const isAuditFile = (path: string): boolean => path.includes('/audits/');

export const formatPlan = (
	file: string,
	fixes: readonly IHeadingFix[],
): string => {
	if (fixes.length === 0) return `✓ ${basename(file)}: already canonical.`;
	const lines = [`→ ${basename(file)}: ${fixes.length} heading(s) to fix`];
	for (const f of fixes) {
		lines.push(`    line ${f.line}: ${f.before}`);
		lines.push(`         → ${f.after}`);
	}
	return lines.join('\n');
};

export interface ICanonicalizeOptions {
	readonly write: boolean;
	readonly files: readonly string[];
}

export const main = async (opts: ICanonicalizeOptions): Promise<number> => {
	let totalFixed = 0;
	let totalClean = 0;
	for (const file of opts.files) {
		const markdown = await readFile(file, 'utf8');
		const canonical = await loadCanonicalHeadings(isAuditFile(file));
		const fixes = planFixes(markdown, canonical);
		if (fixes.length === 0) {
			totalClean++;
			console.log(`✓ ${basename(file)}: already canonical.`);
			continue;
		}
		console.log(formatPlan(file, fixes));
		if (opts.write) {
			const next = applyFixes(markdown, fixes);
			if (next !== markdown) {
				await writeFile(file, next, 'utf8');
				totalFixed++;
			}
		}
	}
	if (opts.write) {
		console.log(
			`\ncanonicalize: wrote ${totalFixed} file(s); ${totalClean} already canonical.`,
		);
	} else {
		console.log(
			`\ncanonicalize (dry-run): ${totalFixed + totalClean} file(s); pass --write to apply.`,
		);
	}
	return 0;
};

if (import.meta.main) {
	const argv = process.argv.slice(2);
	const write = argv.includes('--write');
	const files = argv.filter((a) => a !== '--write');
	if (files.length === 0) {
		console.error(
			'usage: canonicalize-headings.script.ts [--write] <file>...',
		);
		process.exit(2);
	}
	process.exit(await main({ write, files }));
}
