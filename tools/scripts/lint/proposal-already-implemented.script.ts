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
 *  - **files-already-tracked**: every file exists, is tracked, and was
 *    CREATED on or after the proposal's date, but the proposal is missing
 *    `shipped-in:` → add the creating commit(s), which the finding names.
 *  - **modifies-existing**: every file exists, but at least one was
 *    already in the repository BEFORE the proposal was written. The slice
 *    modifies those files, so their presence proves nothing about whether
 *    it is done. Reported apart, never with advice to close, and never
 *    blocking under `--strict`.
 *
 * WHY that last kind exists. Every file being tracked used to be read as
 * "implemented", and the advice was to add `shipped-in` and mark the
 * slice done. Measured on 2026-09-14: of the 29 pending slices whose
 * files were all present, 20 named files that predated their own
 * proposal. v00137 is the clearest — a perf change to three files created
 * in June and August, proposed in September, not started, and told to
 * close. Acting on that advice would have recorded unimplemented work as
 * shipped.
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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { gitFileOrigin, type IGitFileOrigin } from '../lib/git-file-origin';
import { repoRoot } from '../lib/monorepo-paths';

const _PROPOSALS_ROOT = 'docs/delendai/proposals';
const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
const SCAN_DIRS: readonly string[] = ['ready', 'in-progress'];
/**
 * NOT global. `String.prototype.match` with a `g` regex returns the
 * list of whole matches and DISCARDS the capture groups, so reading
 * `[1]` gave the second Files block — `undefined` for the one-block
 * shape every slice actually uses. Every slice then parsed as zero
 * files and was skipped, which is why this lint reported nothing for
 * as long as it has existed.
 */
const FILES_BLOCK_RE =
	/\*\*Files\*\*:\s*([\s\S]*?)(?=\n\s*-\s*\*\*|\n\n|\n#{2,3}\s|$)/;

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
			/** The commits that created the slice's files, oldest first. */
			readonly evidence: readonly string[];
			readonly nextAction: string;
	  }
	| {
			readonly relPath: string;
			readonly proposalId: string;
			readonly sliceId: string;
			readonly status: 'pending';
			readonly kind: 'modifies-existing';
			/** Files that already existed before the proposal was written. */
			readonly preExisting: readonly string[];
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
/**
 * Exported for its regression test: the parsing is where this lint went
 * silent, and a spec on the pure function is what keeps it honest
 * without needing a git fixture.
 */
export const collectPendingSlices = (
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

/**
 * Whether a slice whose files are ALL tracked has evidence of being done.
 *
 * Pure, so the rule is pinned by cases rather than by a repository. A
 * file created before the proposal's date is something the slice
 * modifies; its presence is not evidence. Without a proposal date nothing
 * can be proven either way, and the previous classification is kept —
 * hiding the finding would be the quieter failure.
 */
export const classifyFullyTracked = (
	proposalDate: string | undefined,
	origins: readonly {
		readonly file: string;
		readonly origin: IGitFileOrigin | undefined;
	}[],
):
	| {
			readonly kind: 'modifies-existing';
			readonly preExisting: readonly string[];
	  }
	| {
			readonly kind: 'files-already-tracked';
			readonly evidence: readonly string[];
	  } => {
	const preExisting =
		proposalDate === undefined
			? []
			: origins
					.filter(
						({ origin }) =>
							origin !== undefined && origin.date < proposalDate,
					)
					.map(({ file }) => file);
	if (preExisting.length > 0)
		return { kind: 'modifies-existing', preExisting };
	const evidence = [
		...new Set(
			origins
				.flatMap(({ origin }) => (origin === undefined ? [] : [origin]))
				.sort((left, right) => left.iso.localeCompare(right.iso))
				.map((origin) => origin.sha),
		),
	];
	return { kind: 'files-already-tracked', evidence };
};

const proposalDateOf = (fm: Record<string, unknown>): string | undefined => {
	const value = fm.date;
	const text =
		typeof value === 'string'
			? value
			: value instanceof Date
				? value.toISOString()
				: undefined;
	return text !== undefined && /^\d{4}-\d{2}-\d{2}/u.test(text)
		? text.slice(0, 10)
		: undefined;
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
				const classified = allTracked
					? classifyFullyTracked(
							proposalDateOf(fm),
							slice.files.map((file) => ({
								file,
								origin: gitFileOrigin(root, file, {
									follow: true,
								}),
							})),
						)
					: undefined;
				if (classified?.kind === 'modifies-existing') {
					findings.push({
						relPath: rel,
						proposalId,
						sliceId: slice.sliceId,
						status: 'pending',
						kind: 'modifies-existing',
						preExisting: classified.preExisting,
						nextAction:
							`${slice.sliceId} names ${classified.preExisting.length} file(s) that existed before this proposal was written (${classified.preExisting.join(', ')}). ` +
							`Their presence is not evidence the slice is done — check its acceptance and gate before closing it.`,
					});
				} else if (allTracked && hasShippedIn) {
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
					const evidence =
						classified?.kind === 'files-already-tracked'
							? classified.evidence
							: [];
					findings.push({
						relPath: rel,
						proposalId,
						sliceId: slice.sliceId,
						status: 'pending',
						kind: 'files-already-tracked',
						missing: 'shipped-in',
						evidence,
						nextAction:
							`${slice.sliceId} files were all created on or after this proposal's date and are tracked, but the frontmatter has no shipped-in entry. ` +
							`Confirm the acceptance holds, then add shipped-in: [${evidence.map((sha) => sha.slice(0, 9)).join(', ')}] and mark the slice done.`,
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

/** Findings that say something may be done, as opposed to merely touched. */
const isStuck = (finding: Finding): boolean =>
	finding.kind !== 'modifies-existing';

const render = (findings: readonly Finding[]): string => {
	const stuck = findings.filter(isStuck);
	const touched = findings.filter((finding) => !isStuck(finding));
	if (stuck.length === 0 && touched.length === 0) {
		return '✓ proposal-already-implemented: no slices with already-tracked files in ready/ or in-progress/.';
	}
	const lines: string[] =
		stuck.length === 0
			? [
					'✓ proposal-already-implemented: no slice has evidence of being done while still pending.',
				]
			: [
					`✖ proposal-already-implemented: ${stuck.length} slice(s) reference files that are already tracked in git. auto_work refuses to re-claim those slices and the proposal stays stuck until they are closed or pivoted.\n`,
				];
	for (const f of stuck) {
		lines.push(`  ${f.relPath} :: ${f.sliceId} :: ${f.kind}`);
		lines.push(`    ${f.nextAction}`);
	}
	if (stuck.length > 0)
		lines.push(
			`\n  Fix each finding with proposals_proposal_transition (when fully shipped) or by editing the **Files**: list to match the actually-delivered scope.`,
		);
	if (touched.length > 0) {
		lines.push(
			`\n  ${touched.length} more slice(s) only MODIFY files that predate their proposal. That is not evidence of completion, so they are listed for information and never counted as stuck:`,
		);
		for (const f of touched) lines.push(`  ${f.relPath} :: ${f.sliceId}`);
	}
	return lines.join('\n');
};

const main = (): number => {
	const args = new Set(process.argv.slice(2));
	const strict = args.has('--strict');
	const proposalArg = [...args]
		.find((arg) => arg.startsWith('--proposal='))
		?.split('=')[1];
	const proposalsDirAbs = join(repoRoot(), 'docs', 'delendai', 'proposals');
	const findings = scanAlreadyImplemented(proposalsDirAbs, {
		...(proposalArg !== undefined ? { proposalId: proposalArg } : {}),
	});
	process.stdout.write(`${render(findings)}\n`);

	if (!strict) return 0;
	// In strict mode only block on `ready/` findings — those are
	// the proposals that genuinely block the swarm.
	const blocking = findings.filter(
		(f) => isStuck(f) && f.relPath.startsWith('ready/'),
	);
	if (blocking.length > 0) {
		process.stderr.write(
			`� proposal-already-implemented (strict): ${blocking.length} ready/ proposal(s) are stuck.\n`,
		);
		return 1;
	}
	return 0;
};

if (import.meta.main) process.exit(main());
