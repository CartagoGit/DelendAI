#!/usr/bin/env bun
/**
 * lint-proposals.ts — f00016 S3: walk every `.md` under `docs/mcp-vertex/proposals/`
 * and run `lintProposalMarkdown` (S2) against it.
 *
 * The legacy proposals — `pNNN-*.md` (pre-S11), `lNNN-*.md` (post-
 * S11/S12, `kind: legacy`), and proposals already archived under
 * `done/` — are skipped by this executable lint. S12's own non-goal is "do NOT rewrite
 * the prose" — these are historical, mostly `done`, documents that
 * predate the scaffold; several don't have a 1:1 mapping onto Goal/
 * Why/Non-goals/Slices/Acceptance at all (one proposal-FOR-a-decision
 * doc has no Slices section by design), and their slice sub-format
 * predates the `### S<N> —` heading shape entirely. Forcing 100%
 * conformance would mean rewriting historical meaning into documents
 * that shouldn't change. Active and newly-authored proposals remain
 * linted normally.
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
// `docs/mcp-vertex/proposals/` also holds non-proposal documents this linter must
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

/**
 * Group of proposal files that share the same `id:` in their frontmatter.
 * `a00044` H5 (a00044 robustness audit): the previous lint only ever checked
 * each file in isolation, so two `.md` files claiming `id: f00058` (one in
 * `done/`, one in `ready/`) sailed through `bun run validate` without a
 * single warning. This struct is the per-id collision payload surfaced by
 * {@link detectDuplicateProposalIds}.
 */
export interface IDuplicateProposalIdGroup {
	readonly id: string;
	readonly absPaths: readonly string[];
}

/**
 * Walk `files` and group them by the `id:` field in their frontmatter.
 * Returns only the groups that have >= 2 members — a single-occurrence
 * `id:` is the expected case and is omitted from the result.
 *
 * Pure over its inputs (filesystem + the list of abs paths); does NOT
 * recurse into subdirectories — pass an already-walked list. Reads
 * each file's first ~4 KiB because frontmatter always lives in the
 * first 100 lines or so.
 */
export const detectDuplicateProposalIds = async (
	files: readonly string[],
	proposalsDirAbs: string,
): Promise<readonly IDuplicateProposalIdGroup[]> => {
	const idPattern = /^id:\s*([a-z]\d{5})\s*$/m;
	const byId = new Map<string, string[]>();
	for (const abs of files) {
		const markdown = await readFile(abs, 'utf8').catch(() => '');
		// Only inspect the frontmatter block (between the leading `---`
		// markers) so a `id:` mention in the body never trips the check.
		const fenceEnd = markdown.indexOf('\n---', 3);
		const head =
			fenceEnd === -1
				? markdown.slice(0, 4096)
				: markdown.slice(0, fenceEnd);
		const match = idPattern.exec(head);
		if (match === null) continue;
		// `idPattern` always captures exactly one group; with
		// `noUncheckedIndexedAccess` TS still types it as `string | undefined`.
		// The regex above guarantees presence, so narrow with `??`.
		const id = match[1] ?? '';
		if (id.length === 0) continue;
		const list = byId.get(id) ?? [];
		list.push(abs);
		byId.set(id, list);
	}
	const out: IDuplicateProposalIdGroup[] = [];
	for (const [id, absPaths] of byId) {
		if (absPaths.length < 2) continue;
		// Sort so the output is deterministic across machines — important
		// for snapshot-style gates and for humans comparing two runs.
		const sorted = [...absPaths].sort((a, b) => a.localeCompare(b));
		out.push({
			id,
			absPaths: sorted.map((p) => relative(proposalsDirAbs, p)),
		});
	}
	out.sort((a, b) => a.id.localeCompare(b.id));
	return out;
};

export interface ILintProposalsSummary {
	readonly filesChecked: number;
	readonly legacySkipped: number;
	readonly fatalErrors: number;
	readonly duplicateIds: readonly IDuplicateProposalIdGroup[];
	readonly ok: boolean;
}

export const lintProposalsDir = async (
	proposalsDirAbs: string,
): Promise<ILintProposalsSummary> => {
	const files = await walkMarkdown(proposalsDirAbs);
	let legacySkipped = 0;
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
		if (legacy) {
			legacySkipped += 1;
			continue;
		}
		// Heuristic: an issue is fatal only when it indicates a real
		// authoring problem (`unrecognized` heading, `missing required`
		// section, `duplicate` section). Cosmetic issues (`out of
		// canonical order` on a proposal that already has all required
		// sections in semantic order) are downgraded to warnings so the
		// tool surfaces them without blocking CI.
		const hasFatalIssue = result.issues.some(
			(i) => !i.message.includes('out of canonical order'),
		);
		const fatal = hasFatalIssue;
		const label = fatal ? 'ERROR' : 'WARN';
		console.log(`\n${label} ${relPath}`);
		for (const issue of result.issues) {
			console.log(`  line ${issue.line}: ${issue.message}`);
			console.log(`    fix: ${issue.fix}`);
		}
		if (fatal) fatalErrors += 1;
	}

	// a00044 H5: duplicate-id check. Runs after the per-file lint so the
	// per-file errors appear first in the output. The check walks every
	// file again (cheap: only reads the first 4 KiB of each) and groups
	// by the `id:` field. Every group with >= 2 members is fatal because
	// it would corrupt the canonical `proposals/index.json` registry.
	const duplicateIds = await detectDuplicateProposalIds(
		files,
		proposalsDirAbs,
	);
	for (const group of duplicateIds) {
		fatalErrors += 1;
		console.log(
			`\nERROR duplicate proposal id "${group.id}" in ${group.absPaths.length} files:`,
		);
		for (const p of group.absPaths) {
			console.log(`  - ${p}`);
		}
		console.log(
			'  fix: rename one of them (next free id) or merge them into a single proposal.',
		);
	}

	return {
		filesChecked: files.length,
		legacySkipped,
		fatalErrors,
		duplicateIds,
		ok: fatalErrors === 0,
	};
};

// CLI ------------------------------------------------------------------------
if (import.meta.main) {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
	const proposalsDirAbs = join(repoRoot, 'docs', 'mcp-vertex', 'proposals');
	const summary = await lintProposalsDir(proposalsDirAbs);
	const duplicateNote =
		summary.duplicateIds.length === 0
			? ''
			: `, ${summary.duplicateIds.length} duplicate id(s)`;
	console.log(
		`\n${summary.filesChecked} files checked, ${summary.legacySkipped} legacy file(s) skipped, ${summary.fatalErrors} fatal error(s)${duplicateNote}.`,
	);
	if (!summary.ok) process.exit(1);
}
