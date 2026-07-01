/**
 * filename-linter.ts
 *
 * Pure filename + folder validation extracted from
 * `proposal-scaffold-linter.ts`. Owns ONLY the question "given a
 * proposal's path + frontmatter, do the filename and the folder
 * hierarchy agree with the canonical conventions?".
 *
 * SRP: no frontmatter field linting (that's `frontmatter-linter.ts`),
 * no body-section linting (that's `section-linter.ts`-future), no
 * slice linting. This file is a pure function over
 * `(path, frontmatter) → ILintIssue[]`.
 *
 * Pre-refactor: the 70-line `lintFilenameAndFolder` was a private
 * helper inside `proposal-scaffold-linter.ts` (881 lines total,
 * mixing 6 responsibilities). Extracting it here:
 *   - lets the orchestrator shrink to a thin composer,
 *   - lets the linter rule "file in the right status folder" be
 *     understood (and tested) in isolation from the rest of the
 *     frontmatter rules,
 *   - lets a future `proposals_locate` tool warn on proposal files
 *     in the wrong folder without re-implementing the rule.
 *
 * Pure: no I/O, no globals, no Date.now.
 */

import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type {
	IProposalKind,
	IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import type { ILintIssue } from './frontmatter-linter';

/** Canonical filename pattern: `<prefix><5+ digits>-<kebab-slug>.md`. */
const FILENAME_RE = /^([a-z])(\d{5,})-[a-z0-9-]+\.md$/;

/**
 * Validate that a proposal's filename + folder agree with the
 * canonical conventions:
 *
 *   1. Filename matches `<prefix><5+digits>-<kebab-slug>.md`.
 *   2. The filename's prefix is a known kind prefix.
 *   3. The filename's prefix matches the frontmatter `kind`.
 *   4. The file lives under the folder implied by `frontmatter.status`
 *      (status-driven, ancestor-walk — robust against nested subfolders
 *      like `done/audits/2024/...`).
 */
export const lintFilenameAndFolder = (
	path: string,
	frontmatter: Readonly<Record<string, unknown>>,
): readonly ILintIssue[] => {
	const issues: ILintIssue[] = [];

	const filename = path.split('/').pop() ?? path;
	const m = filename.match(FILENAME_RE);
	if (m === null) {
		issues.push({
			line: 0,
			message: `filename "${filename}" does not match the canonical pattern`,
			fix: 'Rename to `<prefix><NNN>-<kebab-slug>.md` (lowercase prefix, ≥5 digits).',
		});
		return issues;
	}

	issues.push(...checkPrefixMatchesKind(m[1] ?? '', frontmatter));
	issues.push(...checkFolderMatchesStatus(path, frontmatter));

	return issues;
};

// ---------------------------------------------------------------------------
// Individual checks — each is a focused, named rule.
// ---------------------------------------------------------------------------

/**
 * Filename prefix must be a known kind prefix AND must agree with
 * the frontmatter `kind` (when one is present).
 */
const checkPrefixMatchesKind = (
	prefix: string,
	frontmatter: Readonly<Record<string, unknown>>,
): readonly ILintIssue[] => {
	const kindFromPrefix = PROPOSAL_KIND_BY_PREFIX[prefix];
	if (kindFromPrefix === undefined) {
		return [
			{
				line: 0,
				message: `filename prefix "${prefix}" is not a known kind prefix`,
				fix: `Use one of: ${Object.values(PROPOSAL_KINDS)
					.map((k) => k.prefix)
					.join(', ')} (or the retired legacy "p").`,
			},
		];
	}
	const kind = frontmatter.kind;
	if (typeof kind === 'string' && kind !== kindFromPrefix) {
		return [
			{
				line: 0,
				message: `filename starts with "${prefix}" (kind=${kindFromPrefix}) but frontmatter.kind = "${kind}"`,
				fix: `Either rename the file to start with "${
					PROPOSAL_KINDS[kind as IProposalKind]?.prefix ?? '?'
				}", or set frontmatter kind: ${kindFromPrefix}.`,
			},
		];
	}
	return [];
};

/**
 * Status-driven folder check. f00001 makes this trickier than a simple
 * parent-of-file comparison: terminal statuses (`done`, `retired`) may
 * live under a kind sub-folder (e.g. `done/audits/a00007-...`) as a
 * filesystem-only organisation convention.
 *
 * The check is **status-driven, not position-driven**: walk the
 * ancestor chain from the file upward; the FIRST ancestor whose name
 * matches a known status folder is the file's effective status folder.
 * That ancestor must equal the expected folder. This is robust
 * against future re-orderings of path segments, against any number of
 * nested sub-folders (e.g. `done/audits/2024/...`), and against paths
 * that don't start with `docs/mcp-vertex/proposals/` (e.g. absolute or
 * relative-from-cwd).
 */
const checkFolderMatchesStatus = (
	path: string,
	frontmatter: Readonly<Record<string, unknown>>,
): readonly ILintIssue[] => {
	const status = frontmatter.status;
	if (typeof status !== 'string' || !(status in PROPOSAL_STATUSES)) {
		// Status itself is malformed — frontmatter-linter will already
		// surface that. Don't double-report here.
		return [];
	}

	const expectedFolder = STATUS_TO_FOLDER[status as IProposalStatus];
	const statusFolderNames = new Set<string>(Object.values(STATUS_TO_FOLDER));

	const pathParts = path.split('/');
	const ancestorFolders = pathParts.slice(0, -1);
	const nearestStatusAncestor = ancestorFolders.find((seg) =>
		statusFolderNames.has(seg),
	);
	const matches = nearestStatusAncestor === expectedFolder;
	if (matches) return [];

	const immediateParent = pathParts[pathParts.length - 2];
	return [
		{
			line: 0,
			message: `frontmatter status "${status}" expects folder "${expectedFolder}" but the nearest status ancestor is "${nearestStatusAncestor ?? '(none)'}" (immediate parent: "${immediateParent}")`,
			fix: `Move the file to docs/mcp-vertex/proposals/${expectedFolder}/ (or to docs/mcp-vertex/proposals/${expectedFolder}/<kind-subfolder>/ for terminal statuses), or update status to match its current folder.`,
		},
	];
};
