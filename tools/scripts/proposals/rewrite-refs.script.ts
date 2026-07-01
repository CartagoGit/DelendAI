#!/usr/bin/env bun
/**
 * rewrite-proposal-refs.ts — f00016 S11 companion.
 *
 * Greps the repo for literal `pNNN-<slug>` references (markdown links,
 * prose mentions, path strings) and rewrites the prefix to `lNNN-<slug>`
 * — the exact rename `migrate-legacy-proposals.ts` performs. Only
 * rewrites references to ids that script actually has a plan for (so a
 * coincidental `p\d+-` substring that isn't a real legacy proposal id
 * is never touched). Dry-run by default; `--apply` writes the changes.
 *
 *   bun scripts/rewrite-proposal-refs.ts             # dry-run (default)
 *   bun scripts/rewrite-proposal-refs.ts --apply      # rewrite for real
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planMigration } from './migrate-legacy.script';

const SEARCH_EXTENSIONS = new Set(['.md', '.ts', '.astro', '.json']);
const SKIP_DIR_NAMES = new Set([
	'node_modules',
	'.git',
	'.cache',
	'dist',
	'build',
]);

export interface IRefRewrite {
	readonly absPath: string;
	readonly occurrences: number;
}

const walkFiles = async (root: string): Promise<string[]> => {
	const out: string[] = [];
	const entries = await readdir(root, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry.name)) continue;
			out.push(...(await walkFiles(join(root, entry.name))));
		} else if (entry.isFile()) {
			// Generated artefacts (the proposals registry) are rebuilt by
			// sync_proposals right after the migration — rewriting their text
			// directly would be redundant and could drift from what the real
			// generator would have produced.
			if (entry.name === 'index.json') continue;
			const dot = entry.name.lastIndexOf('.');
			if (dot === -1) continue;
			if (SEARCH_EXTENSIONS.has(entry.name.slice(dot))) {
				out.push(join(root, entry.name));
			}
		}
	}
	return out;
};

/**
 * Builds two rewrite rules per migrated id, in order (full-stem first,
 * so a subsequent bare-id rule never re-matches inside what the first
 * rule already rewrote):
 *
 * 1. The full `pNNN-<slug>` stem (e.g. `l99-feat-multi-model-audit-
 *    plugin`) -> `lNNN-<slug>`, anchored to the EXACT slug from the
 *    migration plan so a coincidental `p\d+-` elsewhere is never
 *    touched.
 * 2. The bare `\bpNNN\b` mention (no slug) -> `lNNN` — common in prose
 *    like "Quality gates multi-lenguaje (l107)", which the full-stem
 *    rule alone would miss even on the same line as a full link.
 */
export const buildRewrites = (
	plans: readonly { oldFilename: string; newFilename: string }[],
): ReadonlyArray<{ from: RegExp; to: string }> => {
	const out: Array<{ from: RegExp; to: string }> = [];
	for (const plan of plans) {
		const oldStem = plan.oldFilename.replace(/\.md$/, '');
		const newStem = plan.newFilename.replace(/\.md$/, '');
		const escapedStem = oldStem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		out.push({ from: new RegExp(escapedStem, 'g'), to: newStem });

		const idMatch = plan.oldFilename.match(/^p(\d+)-/);
		if (idMatch) {
			const num = idMatch[1] ?? '';
			out.push({ from: new RegExp(`\\bp${num}\\b`, 'g'), to: `l${num}` });
		}
	}
	return out;
};

export const rewriteRefsInFile = (
	content: string,
	rewrites: ReadonlyArray<{ from: RegExp; to: string }>,
): { content: string; occurrences: number } => {
	let occurrences = 0;
	let next = content;
	for (const { from, to } of rewrites) {
		// `from` is the exact old stem (e.g. "l99-feat-multi-model-audit-plugin")
		// anchored to one specific migration plan, so every match IS the
		// whole token — a flat replacement, no captured groups needed.
		next = next.replace(from, () => {
			occurrences += 1;
			return to;
		});
	}
	return { content: next, occurrences };
};

// CLI ------------------------------------------------------------------------
if (import.meta.main) {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
	const proposalsDirAbs = join(repoRoot, 'docs', 'mcp-vertex', 'proposals');
	const plans = await planMigration(proposalsDirAbs);
	const rewrites = buildRewrites(plans);
	const files = await walkFiles(repoRoot);
	const apply = process.argv.includes('--apply');

	let totalOccurrences = 0;
	let totalFiles = 0;
	for (const absPath of files) {
		const content = await readFile(absPath, 'utf8');
		const { content: rewritten, occurrences } = rewriteRefsInFile(
			content,
			rewrites,
		);
		if (occurrences === 0) continue;
		totalFiles += 1;
		totalOccurrences += occurrences;
		console.log(`${absPath}: ${occurrences} occurrence(s)`);
		if (apply) await writeFile(absPath, rewritten, 'utf8');
	}
	console.log(
		`\n${totalOccurrences} occurrence(s) across ${totalFiles} file(s).`,
	);
	if (!apply)
		console.log('\nDry-run only — pass --apply to rewrite for real.');
}
