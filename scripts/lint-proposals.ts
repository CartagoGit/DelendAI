#!/usr/bin/env bun
/**
 * lint-proposals.ts — f113 S3: walk every `.md` under `docs/proposals/`
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
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintProposalMarkdown } from '../plugins/proposals/src/lib/proposals/proposal-scaffold-linter';

// Loose on purpose, same reasoning as PROPOSAL_FILENAME below: l99 (2
// digits) must classify as "legacy warning", not "fatal error". `l` is
// included alongside `p` — post-migration legacy keeps the same
// permanently-lenient tier, see the module doc comment above.
const isLegacyFilename = (filename: string, absPath: string): boolean => {
	if (absPath.includes('/done/')) return true;
	return /^[pl]\d+-/.test(filename);
};

// Only files shaped like a proposal (legacy `pNNN-…`, including the
// 2-digit `l99-…`, or a new kind prefix) are proposals at all.
// `docs/proposals/` also holds non-proposal documents this linter must
// never touch: audit session reports under `audits/` (and some loose
// ones that ended up in `done/`), `RESUMEN-*` session notes,
// `index.json`, READMEs. Those aren't "legacy proposals that need
// migrating" — they were never proposals, so flagging them as scaffold
// violations would be noise, not signal.
//
// Deliberately looser than the canonical `^[a-z]\d{3,}-…` pattern
// (proposal-scaffold-linter's `lintFilenameAndFolder` and the glossary's
// id regex both require ≥3 digits): a strict filter here would silently
// *skip* `l99-feat-multi-model-audit-plugin.md` (2 digits) instead of
// surfacing it as a finding — invisible is worse than flagged. The
// walker's job is "is this plausibly a proposal", the linter's stricter
// job is "does it conform"; the file still goes through
// `lintProposalMarkdown` and gets flagged there for the short id.
const PROPOSAL_FILENAME = /^[a-z]\d+-[a-z0-9-]+\.md$/;
const isProposalFilename = (filename: string): boolean =>
	PROPOSAL_FILENAME.test(filename);

const walkMarkdown = async (root: string): Promise<string[]> => {
	const entries = await readdir(root, { withFileTypes: true }).catch(
		() => null,
	);
	if (entries === null) return [];
	const out: string[] = [];
	for (const entry of entries) {
		const abs = join(root, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkMarkdown(abs)));
		} else if (entry.isFile() && isProposalFilename(entry.name)) {
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
		const label = legacy ? 'WARN (legacy)' : 'ERROR';
		console.log(`\n${label} ${relPath}`);
		for (const issue of result.issues) {
			console.log(`  line ${issue.line}: ${issue.message}`);
			console.log(`    fix: ${issue.fix}`);
		}
		if (legacy) legacyWarnings += 1;
		else fatalErrors += 1;
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
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
	const proposalsDirAbs = join(repoRoot, 'docs', 'proposals');
	const summary = await lintProposalsDir(proposalsDirAbs);
	console.log(
		`\n${summary.filesChecked} files checked, ${summary.legacyWarnings} legacy warning(s), ${summary.fatalErrors} fatal error(s).`,
	);
	if (!summary.ok) process.exit(1);
}
