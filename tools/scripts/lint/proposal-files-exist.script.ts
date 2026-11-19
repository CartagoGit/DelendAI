#!/usr/bin/env bun
/**
 * proposal-files-exist.script.ts — ratchet lint: every backtick-quoted
 * path in a proposal's **Files**: line should exist on disk.
 *
 * Proposal docs freeze the record of a slice at closing time, but the
 * `Files:` list drifts from what actually shipped more often than it
 * should: writers copy the originally-planned file names and never go
 * back to correct them after a mid-build re-scope (a00057 found this in
 * f00097, f00112, f00113, f00116, r00009, t00002, x00102 and x00103 —
 * the same class of defect an independent peer review caught in f00118
 * before q00002 could close). Only `done/`, `review/` and
 * `in-progress/` are scanned — `ready/`/`paused/` describe future work
 * that legitimately doesn't exist yet.
 *
 * Ratchet, like types-in-contracts: a baseline records today's known
 * violations (real historical debt, some of it legitimate — files
 * later refactored away after a proposal closed, or a documented
 * `oldPath` → `newPath` rename note where only the old path is
 * backtick-quoted on its own line); only NEW violations in NEW or
 * newly-transitioned proposals fail the gate.
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-files-exist.script.ts            # check
 *   bun tools/scripts/lint/proposal-files-exist.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/proposal-files-exist.script.ts --report   # counts only
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

import { withoutNewMarker } from '../../../plugins/proposals/src/lib/proposals/expand-declared-files';
import { declaredPathExists } from './lib/declared-path-exists.lib';
import { basename, join, relative, resolve } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import { lintRepoRoot, refuseMissingScanRoots } from './lib/scan-roots.lib';

const SCAN_DIRS: readonly string[] = ['done', 'review', 'in-progress'];
const PROPOSALS_ROOT = 'docs/delendai/proposals';
const BASELINE_REL = 'tools/scripts/lint/proposal-files-exist.baseline.json';

const NON_PATH = new Set(['none', 'n/a', 'tbd']);

/**
 * Matches a `- **Files**:` list through its continuation lines, stopping
 * at the next bullet, blank line, or heading.
 *
 * The leading `- ` is load-bearing. Without it the pattern also matched
 * `**Files**:` written mid-sentence — and a proposal about the proposal
 * FORMAT quotes that syntax while explaining it. x00098 does exactly that,
 * and the block then ran on into prose four lines below and reported
 * `ready/` and `in-progress/` as missing deliverables. They are status
 * folder names in a sentence describing where a file gets created.
 *
 * A Files declaration is a bullet, not a phrase.
 */
export const FILES_BLOCK_RE =
	/^\s*-\s+\*\*Files\*\*:\s*([\s\S]*?)(?=\n\s*-\s*\*\*|\n\n|\n#{2,3}\s|$)/gm;

/**
 * The declared paths in a `**Files**:` block.
 *
 * A Files block comes in two shapes, and the difference matters. Inline —
 * `` `a.ts`, `b.ts` `` — every backticked token is a path. As a bullet
 * list, each line is `` - `path` — prose explaining it ``, and that prose
 * routinely mentions other paths in backticks: a directory the code reads,
 * a constant, a file that was deleted.
 *
 * Taking every backticked token from the block therefore reported prose as
 * a missing deliverable. x00423 was refused for naming `.commit-policy/`
 * while EXPLAINING what happens when that directory is absent — a
 * sentence that is correct precisely because the path does not exist.
 *
 * So on a bullet line only the FIRST backticked token counts: what comes
 * after the em dash is commentary, not a declaration. Inline blocks are
 * unaffected.
 */
const pathsFromLine = (line: string): string[] => {
	const ticked = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
	return /^\s*-\s/.test(line) ? ticked.slice(0, 1) : ticked;
};

export const extractPathCandidates = (block: string): string[] =>
	block
		.split('\n')
		.flatMap(pathsFromLine)
		.map((path) => path.trim())
		.filter((p) => {
			if (p.length < 4) return false;
			if (!p.includes('/')) return false;
			if (p.includes('*') || p.includes('<') || p.includes('{'))
				return false;
			if (NON_PATH.has(p.toLowerCase())) return false;
			return true;
		});

/** The glob patterns a Files block declares, which name no shipped file. */
export const globCandidates = (block: string): string[] =>
	block
		.split('\n')
		.flatMap(pathsFromLine)
		.map((path) => path.trim())
		.filter((p) => p.includes('/') && p.includes('*'));

export const stripLineRefs = (p: string): string =>
	p.replace(/:[\d,\-–]+$/, '');

export const walkMarkdown = (absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walkMarkdown(abs, out);
		else if (entry.name.endsWith('.md')) out.push(abs);
	}
};

/**
 * Paths that only ever exist at runtime: the plugin cache/results tree.
 * They are gitignored by design, so their absence in a clean checkout is
 * correct, not drift.
 */
export const isRuntimeStatePath = (candidate: string): boolean =>
	candidate.startsWith('.cache/') || candidate.includes('/.cache/');

/**
 * The slice a `**Files**:` block belongs to has a status, and a slice
 * that has not run yet declares the files it INTENDS to create.
 *
 * The lint scans `in-progress/` because a proposal being mid-flight is no
 * excuse for its finished slices to misname what they shipped. But an
 * in-progress proposal is, by definition, one with slices still pending,
 * and those name future files for exactly the reason the header gives for
 * skipping `ready/` and `paused/`: they "describe future work that
 * legitimately doesn't exist yet". f00509 is the case that surfaced it —
 * S1 done, S2-S5 pending, and the four pending slices' observer files
 * reported as drift.
 *
 * So the unit is the slice, not the file: blocks under a `pending`
 * slice are skipped, and everything else is still checked. A slice that
 * claims `done` while naming files that do not exist is still a failure,
 * which is the defect this lint exists to catch.
 */
// A retired slice delivered nothing: its files are a plan given up.
const PENDING_SLICE_STATUS_RE =
	/^\s*-\s+\*\*Status\*\*:\s*(?:pending\s*$|retired\b)/i;

export const isInsidePendingSlice = (
	text: string,
	blockIndex: number,
): boolean => {
	const before = text.slice(0, blockIndex);
	// The nearest preceding slice heading bounds the slice this block is in.
	const headingIndex = before.search(/### [^\n]*$(?![\s\S]*^### )/m);
	const sliceStart = before.lastIndexOf('\n### ');
	if (sliceStart === -1 && headingIndex === -1) return false;
	const sliceText = text.slice(
		sliceStart === -1 ? 0 : sliceStart,
		blockIndex,
	);
	return sliceText
		.split('\n')
		.some((line) => PENDING_SLICE_STATUS_RE.test(line));
};

/** The id and status of the slice a Files block sits in, when it has its own. */
export const sliceOfBlock = (
	text: string,
	blockIndex: number,
): { readonly id: string; readonly status: string | undefined } => {
	const before = text.slice(0, blockIndex);
	const start = before.lastIndexOf('\n### ');
	const body = before.slice(start === -1 ? 0 : start + 1);
	return {
		id: /^### (\S+)/u.exec(body)?.[1] ?? 'proposal',
		status: /\*\*Status\*\*:\s*([a-z-]+)/iu.exec(body)?.[1]?.toLowerCase(),
	};
};

/**
 * Whether the work a block declares is delivered. The slice's own status
 * wins; a slice with none takes its proposal's folder.
 */
export const isDelivered = (
	sliceStatus: string | undefined,
	folder: string,
): boolean =>
	sliceStatus === undefined
		? folder === 'review' || folder === 'done'
		: sliceStatus === 'review' || sliceStatus === 'done';

/** The commits a proposal records as what delivered it (frontmatter and slice lines). */
export const shippedInCommits = (text: string): readonly string[] => [
	...new Set(
		[
			...text.matchAll(
				/shipped-in:([^\n]*(?:\n\s+-\s*"?[0-9a-f]{7,40}"?)*)/gu,
			),
		].flatMap((match) => match[1]?.match(/\b[0-9a-f]{7,40}\b/gu) ?? []),
	),
];

/**
 * Whether `path` existed in a commit that shipped the proposal. Files name
 * what shipped: a file a later change deleted (c00534 removed a package
 * x00987 had edited) still names what x00987 delivered.
 */
const existedWhenShipped = (
	root: string,
	commits: readonly string[],
	path: string,
): boolean =>
	commits.some((commit) => {
		// Only a commit the checked-out history holds: an object a local
		// clone keeps without any ref (a rewritten or never-pushed commit)
		// does not exist in CI, so counting it made a local `--update`
		// differ from the forge's count.
		if (!inHistory(root, commit)) return false;
		try {
			execFileSync('git', ['cat-file', '-e', `${commit}:${path}`], {
				cwd: root,
				stdio: 'ignore',
			});
			return true;
		} catch {
			return false;
		}
	});

const historyChecks = new Map<string, boolean>();

/**
 * Whether `commit` is in the history a checkout of the forge holds: an
 * ancestor of HEAD, or on a remote branch (CI fetches every one).
 */
const inHistory = (root: string, commit: string): boolean => {
	const key = `${root}\0${commit}`;
	const known = historyChecks.get(key);
	if (known !== undefined) return known;
	const git = (args: readonly string[]): string | undefined => {
		try {
			return execFileSync('git', [...args], {
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			});
		} catch {
			return undefined;
		}
	};
	const held =
		git(['merge-base', '--is-ancestor', commit, 'HEAD']) !== undefined ||
		(
			git([
				'for-each-ref',
				'--count=1',
				'--contains',
				commit,
				'refs/remotes',
				'refs/tags',
			]) ?? ''
		).trim().length > 0;
	historyChecks.set(key, held);
	return held;
};

/**
 * The files git tracks under `root`, or undefined when `root` is no git
 * checkout. The count a baseline records must be the one CI reads, and CI
 * has only what is tracked: an ignored local file made `--update` differ.
 */
export const trackedFilesOf = (
	root: string,
): ReadonlySet<string> | undefined => {
	try {
		const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		if (resolve(top) !== resolve(root)) return undefined;
		const listed = execFileSync('git', ['ls-files', '-z'], {
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 1 << 28,
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return new Set(listed.split('\0').filter((name) => name.length > 0));
	} catch {
		return undefined;
	}
};

/** Whether a tracked file, or a directory holding one, is `path`. */
const isTrackedPath = (tracked: ReadonlySet<string>, path: string): boolean => {
	if (tracked.has(path)) return true;
	const prefix = path.endsWith('/') ? path : `${path}/`;
	for (const name of tracked) if (name.startsWith(prefix)) return true;
	return false;
};

/** Returns `{ relProposalPath: [missingPath, ...] }` for proposals with dangling Files: refs. */
export const scanMissingFiles = (root: string): Record<string, string[]> => {
	const result: Record<string, string[]> = {};
	const tracked = trackedFilesOf(root);
	const trackedProposalNames = new Set(
		[...(tracked ?? [])]
			.filter((name) => name.startsWith(`${PROPOSALS_ROOT}/`))
			.map((name) => basename(name)),
	);
	const present = (path: string): boolean => {
		if (tracked === undefined) return declaredPathExists(root, path);
		// A proposal is one document wherever its status folder puts it.
		const isProposal =
			path.startsWith(`${PROPOSALS_ROOT}/`) && path.endsWith('.md');
		return isProposal
			? trackedProposalNames.has(basename(path))
			: isTrackedPath(tracked, path) && existsSync(join(root, path));
	};
	for (const dir of SCAN_DIRS) {
		const abs = join(root, PROPOSALS_ROOT, dir);
		if (!existsSync(abs)) continue;
		const files: string[] = [];
		walkMarkdown(abs, files);
		for (const proposalAbs of files) {
			const proposalRel = relative(root, proposalAbs)
				.split('\\')
				.join('/');
			if (tracked !== undefined && !tracked.has(proposalRel)) continue;
			const text = readFileSync(proposalAbs, 'utf8');
			const missing: string[] = [];
			const shipped = shippedInCommits(text);
			for (const m of text.matchAll(FILES_BLOCK_RE)) {
				if (isInsidePendingSlice(text, m.index ?? 0)) continue;
				// A slice that ran names the files it shipped: a pattern
				// names none of them.
				for (const pattern of globCandidates(m[1] ?? ''))
					missing.push(
						`${pattern} (a pattern, not the files that shipped)`,
					);
				const slice = sliceOfBlock(text, m.index ?? 0);
				const delivered = isDelivered(slice.status, dir);
				for (const marked of extractPathCandidates(m[1] ?? '')) {
					// `new:` says the slice creates the file: until it is
					// delivered the file may be absent; after, it may not.
					const created = marked !== withoutNewMarker(marked);
					const p = withoutNewMarker(marked);
					if (created && !delivered) continue;
					if (p.startsWith(`${PROPOSALS_ROOT}/ready/`)) continue;
					// Runtime state under the cache dir is generated at
					// use time and is gitignored, so it exists on the
					// machine that ran the slice and never in a fresh
					// checkout. Asserting it made this lint pass locally
					// and fail in CI — the split that hides a break from
					// the only person who can fix it.
					if (isRuntimeStatePath(p)) continue;
					const base = stripLineRefs(p);
					if (
						!present(base) &&
						!existedWhenShipped(root, shipped, base)
					)
						missing.push(
							created
								? `${p} (${slice.id} creates it with new:, but it was never created)`
								: p,
						);
				}
			}
			if (missing.length > 0) {
				result[relative(root, proposalAbs).split('\\').join('/')] =
					missing;
			}
		}
	}
	return result;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const main = (): number => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));
	const current = scanMissingFiles(root);
	const currentCounts: Record<string, number> = {};
	for (const [rel, missing] of Object.entries(current))
		currentCounts[rel] = missing.length;

	if (args.has('--update')) {
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(currentCounts, null, '\t')}\n`,
			'utf8',
		);
		const total = Object.values(currentCounts).reduce((a, b) => a + b, 0);
		process.stderr.write(
			`proposal-files-exist: baseline updated — ${Object.keys(currentCounts).length} proposals, ${total} dangling refs.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, missing] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (missing.length > allowed) {
			regressions.push(
				`  ${rel}: ${missing.map((p) => `\`${p}\``).join(', ')}`,
			);
		}
	}

	const totalCur = Object.values(currentCounts).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		process.stderr.write(
			`proposal-files-exist: ${Object.keys(currentCounts).length} proposals / ${totalCur} dangling refs (baseline ${totalBase}).\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ proposal-files-exist: ${regressions.length} proposal(s) have Files: entries that don't exist on disk:\n${regressions.join('\n')}\n\n` +
				`  Fix the Files: list to name what actually shipped, not what was originally planned.\n` +
				`  If this is a documented oldPath → newPath rename note, run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline.\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ proposal-files-exist: no new dangling refs; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ proposal-files-exist: no new dangling Files: refs (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) {
	if (
		refuseMissingScanRoots(
			'proposal-files-exist',
			lintRepoRoot(import.meta.url),
			['docs/delendai/proposals'],
		)
	)
		process.exit(1);
	process.exit(main());
}
