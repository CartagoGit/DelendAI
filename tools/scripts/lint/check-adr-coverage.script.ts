#!/usr/bin/env bun
/**
 * check-adr-coverage.script.ts — d00012 (Track C.adr).
 *
 * ADRs under `docs/delendai/adr/**` reference the proposals that
 * produced them, superseded them, or depend on them (usually under a
 * `## References` heading, e.g. "`r00028` — subpath exports
 * implementation"). Those references are prose, not structured data,
 * so they rot silently: a proposal gets renamed, retired, or its file
 * moves between lifecycle folders, and the ADR keeps citing a dead
 * id with nobody noticing.
 *
 * This lint extracts every proposal-id-shaped token
 * (`[a-z]\d{4,5}`, e.g. `r00028`, `d00012`, `q00006`, `x00241`) from
 * every ADR file and verifies each one resolves to a real proposal
 * file somewhere under `docs/delendai/proposals/**` (in ANY
 * lifecycle folder — a retired or done proposal is still a valid
 * reference; only a reference to an id that never existed on disk is
 * an error).
 *
 * This is deliberately permissive: it does not require ADRs to use
 * YAML frontmatter (the repo's existing ADRs — 0007, 0014-0018,
 * d00014, ADR-0008 — do not), and it does not police *which* ids an
 * ADR must cite, only that the ones it does cite are real.
 *
 * Usage:
 *   bun tools/scripts/lint/check-adr-coverage.script.ts
 *   bun run lint:check-adr-coverage
 *
 * Exit codes:
 *   0 — every referenced id resolves to a real proposal file.
 *   1 — at least one ADR cites an id with no matching proposal file.
 */
import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const ADR_DIR = 'docs/delendai/adr';
const PROPOSALS_DIR = 'docs/delendai/proposals';

// Proposal id shapes used across the repo: one letter + 4-5 digits.
// `\d{4,5}` covers both the legacy 4-digit ids and the current 5-digit
// scheme; word-boundaries keep it from matching inside longer tokens
// like commit shas or version strings.
const ID_RE = /\b([a-z]\d{4,5})\b/g;

// Tokens that match the id shape but are not proposal ids (commit-sha
// fragments, version-like strings that happen to start with a letter,
// etc.) never appear in practice for this length window, so no
// denylist is needed today; keep this comment as the place to add one
// if a false positive shows up.

export interface IAdrReferenceIssue {
	readonly adrFile: string;
	readonly referencedId: string;
}

const listMarkdownFiles = (absDir: string): string[] => {
	let entries: Dirent[];
	try {
		entries = readdirSync(absDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			out.push(...listMarkdownFiles(join(absDir, entry.name)));
		} else if (entry.name.endsWith('.md')) {
			out.push(join(absDir, entry.name));
		}
	}
	return out;
};

/** Pure: extract every unique proposal-id-shaped token from ADR text. */
export const extractReferencedIds = (text: string): string[] => {
	const ids = new Set<string>();
	for (const match of text.matchAll(ID_RE)) {
		const id = match[1];
		if (id !== undefined) ids.add(id);
	}
	return [...ids].sort();
};

/** Pure: does any proposal file on disk start with `${id}-`? */
export const idHasProposalFile = (
	id: string,
	proposalBasenames: readonly string[],
): boolean =>
	proposalBasenames.some(
		(name) => name === `${id}.md` || name.startsWith(`${id}-`),
	);

export const checkAdrCoverage = (
	root: string,
): { readonly issues: IAdrReferenceIssue[]; readonly adrCount: number } => {
	const adrFilesAbs = listMarkdownFiles(join(root, ADR_DIR));
	const proposalBasenames = listMarkdownFiles(join(root, PROPOSALS_DIR)).map(
		(abs) => abs.split('/').pop() ?? '',
	);

	const issues: IAdrReferenceIssue[] = [];
	for (const adrAbs of adrFilesAbs) {
		const text = readFileSync(adrAbs, 'utf8');
		const ids = extractReferencedIds(text);
		for (const id of ids) {
			if (!idHasProposalFile(id, proposalBasenames)) {
				issues.push({
					adrFile: adrAbs.slice(root.length + 1),
					referencedId: id,
				});
			}
		}
	}
	return { issues, adrCount: adrFilesAbs.length };
};

const main = (): number => {
	const root = repoRoot();
	const { issues, adrCount } = checkAdrCoverage(root);
	if (issues.length > 0) {
		process.stderr.write(
			`✗ check-adr-coverage: ${issues.length} dangling reference(s) across ${adrCount} ADR(s):\n`,
		);
		for (const issue of issues) {
			process.stderr.write(
				`  ${issue.adrFile} → ${issue.referencedId}\n`,
			);
		}
		return 1;
	}
	process.stdout.write(
		`✓ check-adr-coverage: ${adrCount} ADR(s) checked, every referenced id resolves.\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
