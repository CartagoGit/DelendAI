#!/usr/bin/env bun
/**
 * proposal-already-implemented.script.ts — R-2026-08-31.
 *
 * Lint that catches the most common "stuck proposal" pattern: a slice
 * whose declared `**Files**:` are ALREADY tracked in git (i.e. the
 * files exist on disk and are in the git index). When this happens the
 * slice cannot be re-claimed by an implementer (the lock file would
 * collide with the existing tracked artifacts) and the proposal
 * accumulates `pending-slice-verification-required` blockers in
 * `auto_work` until an operator hand-closes it.
 *
 * The script is advisory by default — it never fails `bun run validate`.
 * Each finding carries a concrete next-action the operator (or an
 * agent) can take to break the deadlock:
 *
 *  - **already-shipped**: every file exists AND is in the git index AND
 *    has a non-empty `shipped-in:` in the frontmatter → the slice is
 *    fully closed; flip `**Status**:` to `done`.
 *  - **files-already-tracked**: every file exists and is tracked but
 *    the proposal is missing `shipped-in:` → add it (find the SHA with
 *    `git log --oneline -- <file>`).
 *  - **partial**: only some files are tracked → the proposal is mid-
 *    implementation; review the slice and either finish the missing
 *    files or pivot the slice to a different `**Files**:` set.
 *
 * The scan only covers `ready/` and `in-progress/` (the folders where
 * this regression surfaces). Legacy / closed / done proposals are
 * skipped — a `done/` proposal whose `**Files**:` references a path
 * that has since been refactored is fine and out of scope for this
 * lint.
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-already-implemented.script.ts
 *   bun tools/scripts/lint/proposal-already-implemented.script.ts --strict
 *     # exit 1 when any ready/ proposal is reported (blocks CI)
 *   bun tools/scripts/lint/proposal-already-implemented.script.ts --proposal=<id>
 *     # restrict the scan to a single proposal id
 *
 * The script is wired into `bun run lint:proposals` (advisory) and
 * surfaced as its own `bun run lint:proposal-already-implemented` so
 * operators can run it standalone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { repoRoot } from '../lib/monorepo-paths';

const _PROPOSALS_ROOT = 'docs/mcp-vertex/proposals';
const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
const SCAN_DIRS: readonly string[] = ['ready', 'in-progress'];
const FILES_BLOCK_RE =
	/\*\*Files\*\*:\s*([\s\S]*?)(?=\n\s*-\s*\*\*|\n\n|\n#{2,3}\s|$)/g;

export type Finding =
	| {
			readonly relPath: string;
			readonly proposalId: string;
			readonly sliceId: string;
			readonly status: 'pending';
			readonly kind: 'already-shipped';
			readonly missing: 'shipped-in';
			readonly nextAction: string;
	  }
	| {
			readonly relPath: string;
			readonly proposalId: string;
			readonly sliceId: string;
			readonly status: 'pending';
			readonly kind: 'files-already-tracked';
			readonly missing: 'shipped-in' | 'slice-status';
			readonly nextAction: string;
	  }
	| {
			readonly relPath: string;
			readonly proposalId: string;
			readonly sliceId: string;
			readonly status: 'pending';
			readonly kind: 'partial';
			readonly missingFiles: readonly string[];
			readonly nextAction: string;
	  };

const extractPathCandidates = (block: string): string[] =>
	[...block.matchAll(/`([^`]+)`/g)]
		.map((m) => m[1] ?? '')
		.map((path) => path.trim())
		.filter((p) => {
			if (p.length < 4) return false;
			if (!p.includes('/')) return false;
			if (p.includes('*') || p.includes('<') || p.includes('{'))
				return false;
			if (p.toLowerCase() === 'none' || p.toLowerCase() === 'n/a')
				return false;
			return true;
		})
		.map((p) => p.replace(/:[\d,\-–]+$/, ''));

const walkMarkdown = (absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walkMarkdown(abs, out);
		else if (PROPOSAL_FILENAME.test(entry.name)) out.push(abs);
	}
};

const fileTracked = (root: string, file: string): boolean => {
	if (!existsSync(join(root, file))) return false;
	try {
		execFileSync(
			'git',
			['-C', root, 'ls-files', '--error-unmatch', '--', file],
			{ stdio: 'ignore' },
		);
		return true;
	} catch {
		return false;
	}
};

const readFrontmatter = (markdown: string): Record<string, unknown> => {
	const block = extractYamlBlock(markdown);
	if (block === null) return {};
	return parseFrontmatterBlock(block) as Record<string, unknown>;
};

const shippedInOk = (fm: Record<string, unknown>): boolean => {
	const list = fm['shipped-in'];
	if (!Array.isArray(list)) return false;
	return list.some(
		(v) => typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v.trim()),
	);
};

/** Iterate every slice body in the proposal markdown. Returns
 *  `{ sliceId, status, files }[]` with pending-only filter. */
const collectPendingSlices = (
	markdown: string,
): Array<{ sliceId: string; status: string; files: string[] }> => {
	const slices: Array<{ sliceId: string; status: string; files: string[] }> =
		[];
	// Find every `### S<n> — ...` heading.
	const headingRe = /^###\s+(S\d+)\b[^\n]*$/gm;
	const headings: Array<{ sliceId: string; start: number }> = [];
	for (const match of markdown.matchAll(headingRe)) {
		const sliceId = match[1] ?? '';
		headings.push({
			sliceId,
			start: match.index ?? 0,
		});
	}
	for (let i = 0; i < headings.length; i++) {
		const current = headings[i]!;
		const next = headings[i + 1];
		const bodyEnd = next ? next.start : markdown.length;
		const body = markdown.slice(current.start, bodyEnd);
		const statusMatch = body.match(/^\s*-\s*\*\*Status\*\*:\s*(\w+)/m);
		const status = statusMatch?.[1] ?? 'unknown';
		if (status !== 'pending') continue;
		const filesBlockMatch = body.match(FILES_BLOCK_RE);
		const files = filesBlockMatch
			? extractPathCandidates(filesBlockMatch[1] ?? '')
			: [];
		slices.push({ sliceId: current.sliceId, status, files });
	}
	return slices;
};

export const scanAlreadyImplemented = (
	proposalsDirAbs: string,
	options: { readonly proposalId?: string } = {},
): readonly Finding[] => {
	const root = repoRoot();
	const findings: Finding[] = [];
	for (const dir of SCAN_DIRS) {
		const abs = join(proposalsDirAbs, dir);
		if (!existsSync(abs)) continue;
		const files: string[] = [];
		walkMarkdown(abs, files);
		for (const proposalAbs of files) {
			const rel = relative(root, proposalAbs).split('\\').join('/');
			const markdown = readFileSync(proposalAbs, 'utf8');
			const fm = readFrontmatter(markdown);
			const proposalId = typeof fm.id === 'string' ? fm.id : 'unknown';
			if (options.proposalId && proposalId !== options.proposalId) {
				continue;
			}
			for (const slice of collectPendingSlices(markdown)) {
				if (slice.files.length === 0) continue;
				const trackedFlags = slice.files.map((file) =>
					fileTracked(root, file),
				);
				const allTracked = trackedFlags.every(Boolean);
				const someTracked = trackedFlags.some(Boolean);
				if (!someTracked) continue;
				const missingFiles = slice.files.filter(
					(_f, idx) => !trackedFlags[idx],
				);
				const hasShippedIn = shippedInOk(fm);
				if (allTracked && hasShippedIn) {
					findings.push({
						relPath: rel,
						proposalId,
						sliceId: slice.sliceId,
						status: 'pending',
						kind: 'already-shipped',
						missing: 'shipped-in',
						nextAction:
							`${slice.sliceId} declares files that are already tracked AND the frontmatter has a valid shipped-in: [sha]. ` +
							`The slice is implemented; flip **Status**: pending → done and close the proposal with proposals_proposal_transition { id, to: "done", reason }.`,
					});
				} else if (allTracked && !hasShippedIn) {
					findings.push({
						relPath: rel,
						proposalId,
						sliceId: slice.sliceId,
						status: 'pending',
						kind: 'files-already-tracked',
						missing: 'shipped-in',
						nextAction:
							`${slice.sliceId} files are all tracked but the proposal frontmatter has no shipped-in: [...sha] entry. ` +
							`Add shipped-in: [<sha>] (find the SHA with \`git log --oneline -- <file>\`) and then mark the slice done.`,
					});
				} else if (someTracked) {
					findings.push({
						relPath: rel,
						proposalId,
						sliceId: slice.sliceId,
						status: 'pending',
						kind: 'partial',
						missingFiles,
						nextAction:
							`${slice.sliceId} is partial: ${missingFiles.length} of ${slice.files.length} files are not tracked yet. ` +
							`Either finish the slice (so all files land), or pivot the Files: list to the already-tracked subset and rename the slice to reflect the new scope.`,
					});
				}
			}
		}
	}
	findings.sort((a, b) =>
		a.relPath === b.relPath
			? a.sliceId.localeCompare(b.sliceId)
			: a.relPath.localeCompare(b.relPath),
	);
	return findings;
};

const render = (findings: readonly Finding[]): string => {
	if (findings.length === 0) {
		return '✓ proposal-already-implemented: no slices with already-tracked files in ready/ or in-progress/.';
	}
	const lines: string[] = [
		`✖ proposal-already-implemented: ${findings.length} slice(s) reference files that are already tracked in git. auto_work refuses to re-claim those slices and the proposal stays stuck until they are closed or pivoted.\n`,
	];
	for (const f of findings) {
		lines.push(`  ${f.relPath} :: ${f.sliceId} :: ${f.kind}`);
		lines.push(`    ${f.nextAction}`);
	}
	lines.push(
		`\n  Fix each finding with proposals_proposal_transition (when fully shipped) or by editing the **Files**: list to match the actually-delivered scope.`,
	);
	return lines.join('\n');
};

const main = (): number => {
	const args = new Set(process.argv.slice(2));
	const strict = args.has('--strict');
	const proposalArg = [...args]
		.find((arg) => arg.startsWith('--proposal='))
		?.split('=')[1];
	const proposalsDirAbs = join(repoRoot(), 'docs', 'mcp-vertex', 'proposals');
	const findings = scanAlreadyImplemented(proposalsDirAbs, {
		...(proposalArg !== undefined ? { proposalId: proposalArg } : {}),
	});
	process.stdout.write(`${render(findings)}\n`);

	if (!strict) return 0;
	// In strict mode only block on `ready/` findings — those are
	// the proposals that genuinely block the swarm.
	const blocking = findings.filter((f) => f.relPath.startsWith('ready/'));
	if (blocking.length > 0) {
		process.stderr.write(
			`� proposal-already-implemented (strict): ${blocking.length} ready/ proposal(s) are stuck.\n`,
		);
		return 1;
	}
	return 0;
};

if (import.meta.main) process.exit(main());

// Defensive: prevent `statSync` import from becoming a build-time
// dependency that the bundler treats as a side-effect.
if (false as boolean) statSync;
