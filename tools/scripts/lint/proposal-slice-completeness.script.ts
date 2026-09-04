#!/usr/bin/env bun

/**
 * proposal-slice-completeness.script.ts
 *
 * `bun run lint:proposal-slice-completeness` — blocks `bun run validate`
 * whenever any proposal marked `status: done` has:
 *   - a `### S<n>` slice whose `**Status**:` is anything other than `done`
 *   - a `### S<n>` slice whose `Files:` lists paths that no longer exist
 *     (e.g. after a forgotten revert that the agent never re-shipped).
 *
 * This is the user-facing companion to the in-process
 * `proposal-completeness.ts` service (which gates `proposal_transition`
 * at runtime). The lint catches **drift**: a proposal whose status was
 * flipped to `done` historically but whose body no longer matches the
 * workspace today.
 *
 * Ratchet (mirrors `proposal-files-exist.script.ts`, the closest
 * sibling lint over the same `done/` tree): hundreds of `done/`
 * proposals predate this check, so a hard gate would be permanently
 * red. A JSON baseline records each proposal's ACCEPTED issue count;
 * the gate fails only when a proposal's count exceeds its baseline or
 * a newly-`done` proposal has any issue at all.
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-slice-completeness.script.ts            # check
 *   bun tools/scripts/lint/proposal-slice-completeness.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/proposal-slice-completeness.script.ts --report   # counts only
 */

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { dirname, extname, join } from 'node:path';

import { collectSliceStatuses } from '../../../plugins/proposals/src/lib/services/proposal-completeness';
import { repoRoot } from '../lib/monorepo-paths';

const BASELINE_REL =
	'tools/scripts/lint/proposal-slice-completeness.baseline.json';

const PROPOSAL_KINDS = [
	'audits',
	'feats',
	'fixes',
	'chores',
	'docs',
	'refactors',
	'perfs',
	'tests',
	'plans',
	'resumes',
];

const frontmatter = (content: string): Record<string, string> => {
	const match = /^---\n([\s\S]+?)\n---/.exec(content);
	if (match === null) return {};
	const lines = (match[1] ?? '').split('\n');
	const out: Record<string, string> = {};
	for (const line of lines) {
		const colonIdx = line.indexOf(':');
		if (colonIdx < 0) continue;
		const key = line.slice(0, colonIdx).trim();
		const value = line.slice(colonIdx + 1).trim();
		if (key !== '') out[key] = value;
	}
	return out;
};

export interface IIssue {
	readonly proposal: string;
	readonly kind: 'pending-slice' | 'missing-file' | 'ignored-file';
	readonly detail: string;
}

/**
 * Paths git is told to ignore, out of a candidate list, in one call.
 *
 * A slice that names a gitignored path can NEVER be committed: `git add`
 * refuses it, and no retry changes `.gitignore`. Observed live on
 * 2026-09-03 — x00213 S3 declared `.cache/delendai/agent-queue/queue.json`
 * and commit-policy re-emitted the event several times a second for as
 * long as the server ran, because the refusal was not recognised as
 * terminal. That classification is fixed, but a terminal refusal is
 * still a refusal: the slice can never ship. This catches it while the
 * proposal is being written, which is the only point where it is free
 * to fix.
 *
 * Batched through `--stdin` because a per-path call over every slice of
 * every proposal is thousands of processes.
 */
const gitIgnoredPaths = (
	root: string,
	candidates: readonly string[],
): ReadonlySet<string> => {
	if (candidates.length === 0) return new Set();
	try {
		const stdout = execFileSync('git', ['check-ignore', '--stdin'], {
			cwd: root,
			input: `${candidates.join('\n')}\n`,
			encoding: 'utf8',
			maxBuffer: 16 * 1024 * 1024,
		});
		return new Set(
			stdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		);
	} catch (error) {
		// `git check-ignore` exits 1 when NOTHING matched, which is the
		// good case and not an error. Any other failure (not a repo, git
		// missing) contributes nothing rather than failing the gate for
		// an unrelated reason.
		const result = error as { status?: number; stdout?: string };
		if (result.status === 1) {
			return new Set(
				(result.stdout ?? '')
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0),
			);
		}
		return new Set();
	}
};

/** Pure over the filesystem it's given; every path check is rooted at `root`. */
export const findIssues = (root: string): readonly IIssue[] => {
	const out: IIssue[] = [];
	const doneRoot = join(root, 'docs', 'delendai', 'proposals', 'done');
	for (const kind of PROPOSAL_KINDS) {
		const dir = join(doneRoot, kind);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			if (extname(f) !== '.md' || f === 'README.md') continue;
			const path = join(dir, f);
			const content = readFileSync(path, 'utf8');
			const fm = frontmatter(content);
			const status = (fm.status ?? '').toLowerCase();
			if (status !== 'done') continue;
			const slices = collectSliceStatuses(content);
			for (const slice of slices) {
				if (slice.status !== 'done') {
					out.push({
						proposal: f,
						kind: 'pending-slice',
						detail: `${slice.id} status=${slice.status} title='${slice.title}'`,
					});
				}
				for (const file of slice.files) {
					// Declared paths are workspace-relative — resolve against
					// `root`, not the caller's cwd (a bug when this ran from
					// a different cwd, and the only reason a temp-dir test
					// of this function would have been impossible before).
					if (!existsSync(join(root, file))) {
						out.push({
							proposal: f,
							kind: 'missing-file',
							detail: `${slice.id} declares ${file} (not on disk)`,
						});
					}
				}
			}
		}
	}

	// The ignored-path check runs over EVERY state, not just `done`.
	// A slice in `ready` that names an ignored path is a storm waiting
	// to happen; by the time it reaches `done` the damage is done.
	const declared = new Map<string, { proposal: string; slice: string }>();
	for (const state of ['ready', 'done'] as const) {
		for (const kind of PROPOSAL_KINDS) {
			const dir = join(
				root,
				'docs',
				'delendai',
				'proposals',
				state,
				kind,
			);
			if (!existsSync(dir)) continue;
			for (const f of readdirSync(dir)) {
				if (extname(f) !== '.md' || f === 'README.md') continue;
				const content = readFileSync(join(dir, f), 'utf8');
				for (const slice of collectSliceStatuses(content)) {
					for (const file of slice.files) {
						if (!declared.has(file)) {
							declared.set(file, {
								proposal: f,
								slice: slice.id,
							});
						}
					}
				}
			}
		}
	}
	const ignored = gitIgnoredPaths(root, [...declared.keys()]);
	for (const path of ignored) {
		const origin = declared.get(path);
		if (origin === undefined) continue;
		out.push({
			proposal: origin.proposal,
			kind: 'ignored-file',
			detail: `${origin.slice} declares ${path}, which .gitignore excludes — git add can never stage it`,
		});
	}

	return out;
};

export const groupByProposal = (
	issues: readonly IIssue[],
): ReadonlyMap<string, readonly IIssue[]> => {
	const grouped = new Map<string, IIssue[]>();
	for (const issue of issues) {
		const arr = grouped.get(issue.proposal) ?? [];
		arr.push(issue);
		grouped.set(issue.proposal, arr);
	}
	return grouped;
};

export const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const printIssues = (grouped: ReadonlyMap<string, readonly IIssue[]>): void => {
	for (const [proposal, items] of grouped) {
		console.error(`  ${proposal}:`);
		for (const item of items) {
			console.error(`    - [${item.kind}] ${item.detail}`);
		}
	}
};

/** Testable core: takes `root`/`args` explicitly instead of reading globals. */
export const run = (root: string, args: ReadonlySet<string>): number => {
	const issues = findIssues(root);
	const grouped = groupByProposal(issues);
	const currentCounts: Record<string, number> = {};
	for (const [proposal, items] of grouped)
		currentCounts[proposal] = items.length;

	if (args.has('--update')) {
		const baselinePath = join(root, BASELINE_REL);
		mkdirSync(dirname(baselinePath), { recursive: true });
		writeFileSync(
			baselinePath,
			`${JSON.stringify(currentCounts, null, '\t')}\n`,
			'utf8',
		);
		const total = Object.values(currentCounts).reduce((a, b) => a + b, 0);
		console.error(
			`proposal-slice-completeness: baseline updated — ${Object.keys(currentCounts).length} proposal(s), ${total} accepted issue(s).`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressed = new Map<string, IIssue[]>();
	for (const [proposal, items] of grouped) {
		const allowed = baseline[proposal] ?? 0;
		if (items.length > allowed) regressed.set(proposal, [...items]);
	}

	const totalCur = Object.values(currentCounts).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		console.error(
			`proposal-slice-completeness: ${Object.keys(currentCounts).length} proposal(s) / ${totalCur} issue(s) (baseline ${totalBase}).`,
		);
		return 0;
	}

	if (regressed.size > 0) {
		const regressedTotal = [...regressed.values()].reduce(
			(a, items) => a + items.length,
			0,
		);
		console.error(
			`✗ proposal-slice-completeness: ${regressedTotal} NEW issue(s) across ${regressed.size} proposal(s):`,
		);
		printIssues(regressed);
		console.error('');
		console.error(
			'fix: each proposal with pending slices must be `git mv` to ready/ and re-opened;',
		);
		console.error(
			'     each proposal with missing declared files must either re-ship the file or',
		);
		console.error(
			'     amend the proposal body to reflect what actually shipped.',
		);
		console.error(
			'If this is a documented pre-existing case, run --update to accept it into the baseline.',
		);
		return 1;
	}

	if (totalCur < totalBase) {
		console.log(
			`✓ proposal-slice-completeness: no new issues; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.`,
		);
		return 0;
	}
	console.log(
		`✓ proposal-slice-completeness: no new issues (${totalCur} baselined).`,
	);
	return 0;
};

const main = (): number => run(repoRoot(), new Set(process.argv.slice(2)));

// Run when invoked directly (not when imported by tests).
if (import.meta.main) {
	process.exit(main());
}
