#!/usr/bin/env bun
/**
 * lint-proposals.ts — f00016 S3: walk every `.md` under `docs/proposals/`
 * and run `lintProposalMarkdown` (S2) against it.
 *
 * The legacy proposals — `pNNN-*.md` (pre-S11) and `lNNN-*.md` (post-
 * S11/S12, `kind: legacy`) — are warn-only **permanently**, not just
 * during the migration window. S12's own non-goal is "do NOT rewrite
 * the prose" — these are historical, mostly `done`, documents that
 * predate the scaffold; several don't have a 1:1 mapping onto Goal/
 * Why/Non-goals/Slices/Acceptance at all (one proposal-FOR-a-decision
 * doc has no Slices section by design), and their slice sub-format
 * predates the `### S<N> —` heading shape entirely. Forcing 100%
 * conformance would mean either rewriting meaning into documents that
 * shouldn't change, or never finishing. `kind: legacy` (prefix `l`) IS
 * the signal "imported, evaluated leniently" — same tier as the
 * pre-migration `p` prefix, not a stricter one.
 *
 *   bun scripts/lint-proposals.ts
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintProposalMarkdown } from '../../../plugins/proposals/src/lib/proposals/proposal-scaffold-linter';

// Post-padding, legacy proposals still remain warn-only, but proposal
// filenames themselves are now expected to use a fixed 5-digit id.
const isLegacyFilename = (filename: string, absPath: string): boolean => {
	if (absPath.includes('/done/')) return true;
	return /^[pl]\d{5}-/.test(filename);
};

// Only files shaped like a proposal with the canonical padded id are
// proposals at all.
// `docs/proposals/` also holds non-proposal documents this linter must
// never touch: audit session reports under `audits/` (and some loose
// ones that ended up in `done/`), `n00001-*` session notes,
// `index.json`, READMEs. Those aren't "legacy proposals that need
// migrating" — they were never proposals, so flagging them as scaffold
// violations would be noise, not signal.
//
// Keep the walker's filter aligned with the canonical fixed-width id
// scheme so stray historical filenames are treated as non-proposal docs
// unless they are restored intentionally.
const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
const isProposalFilename = (filename: string): boolean =>
	PROPOSAL_FILENAME.test(filename);

const walkMarkdown = async (root: string): Promise<string[]> => {
	const entries = await readdir(root).catch(() => null);
	if (entries === null) return [];
	const out: string[] = [];
	for (const entry of entries) {
		const abs = join(root, entry);
		const info = await stat(abs).catch(() => null);
		if (info === null) continue;
		if (info.isDirectory()) {
			out.push(...(await walkMarkdown(abs)));
		} else if (info.isFile() && isProposalFilename(entry)) {
			out.push(abs);
		}
	}
	return out;
};

export interface ILintProposalsSummary {
	readonly filesChecked: number;
	readonly legacyWarnings: number;
	readonly fatalErrors: number;
	readonly ok: boolean;
}

export const lintProposalsDir = async (
	proposalsDirAbs: string,
): Promise<ILintProposalsSummary> => {
	const files = await walkMarkdown(proposalsDirAbs);
	let legacyWarnings = 0;
	let fatalErrors = 0;

	for (const absPath of files) {
		const markdown = await readFile(absPath, 'utf8');
		const relPath = relative(proposalsDirAbs, absPath);
		const result = lintProposalMarkdown({ path: absPath, markdown });
		if (result.ok) continue;

		const legacy = isLegacyFilename(
			absPath.split('/').pop() ?? '',
			absPath,
		);
		// Heuristic: an issue is fatal only when it indicates a real
		// authoring problem (`unrecognized` heading, `missing required`
		// section, `duplicate` section). Cosmetic issues (`out of
		// canonical order` on a proposal that already has all required
		// sections in semantic order) are downgraded to warnings so the
		// tool surfaces them without blocking CI.
		const hasFatalIssue = result.issues.some((i) =>
			/unrecognized|missing required|duplicate/i.test(i.message),
		);
		const fatal = !legacy && hasFatalIssue;
		const label = legacy ? 'WARN (legacy)' : fatal ? 'ERROR' : 'WARN';
		console.log(`\n${label} ${relPath}`);
		for (const issue of result.issues) {
			console.log(`  line ${issue.line}: ${issue.message}`);
			console.log(`    fix: ${issue.fix}`);
		}
		if (legacy) legacyWarnings += 1;
		else if (fatal) fatalErrors += 1;
	}

	return {
		filesChecked: files.length,
		legacyWarnings,
		fatalErrors,
		ok: fatalErrors === 0,
	};
};

// CLI ------------------------------------------------------------------------
if (import.meta.main) {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
	const proposalsDirAbs = join(repoRoot, 'docs', 'proposals');
	const summary = await lintProposalsDir(proposalsDirAbs);
	console.log(
		`\n${summary.filesChecked} files checked, ${summary.legacyWarnings} legacy warning(s), ${summary.fatalErrors} fatal error(s).`,
	);
	if (!summary.ok) process.exit(1);
}
