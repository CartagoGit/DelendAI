#!/usr/bin/env bun
/**
 * reclaim-orphans.script.ts — repo-local orphan reclamation (2026-08-24).
 *
 * This repo's policy: no stranded branches or stashes may remain. Every
 * orphan is either merged into `develop` (when it adds value, leaving the
 * tree 100% functional) or deleted (when it does not). This script is the
 * mechanical half of that policy:
 *
 *   - `--report` (default): classify every local branch and every stash,
 *     and print a copy-pasteable action for each. Read-only.
 *   - `--apply`: delete only the `delete-safe` branches (`ahead === 0` —
 *     the branch tip is fully contained in the base, so nothing is lost).
 *     `needs-review` branches and stashes are NEVER auto-deleted; they are
 *     reported for a value decision (merge to develop, or drop).
 *
 * Classification contract:
 *   - `delete-safe`  → `ahead === 0`: every commit is already reachable
 *     from the base branch. `git branch -D` loses nothing.
 *   - `needs-review` → `ahead > 0`: the branch carries unique commits.
 *     A human/LLM reviews the diff and either merges it into the base
 *     (fixing any discrepancy and leaving it functional) or deletes it.
 *
 * Stashes are always `needs-review`: their value can only be judged by
 * reading the diff (`git stash show -p <ref>`), so this script never
 * drops them automatically.
 *
 * The pure engine (`buildReclaimReport`) is exported for unit tests; the
 * CLI shell shells out to git. Mirrors the structure of the other
 * `tools/scripts/lint/*.script.ts` engines (pure core + thin CLI).
 */
import { spawnSync } from 'node:child_process';

/** One local branch with the facts needed to classify it. */
export interface IOrphanBranch {
	readonly name: string;
	/** Commits in this branch not in `baseBranch`. */
	readonly ahead: number;
	/** Commits in `baseBranch` not in this branch. */
	readonly behind: number;
	readonly lastCommitIso: string;
	readonly diffStat: string;
}

/** One stash entry. Value can only be judged by reading its diff. */
export interface IOrphanStash {
	readonly ref: string;
	readonly branch: string | null;
	readonly message: string;
	readonly date: string | null;
}

export type BranchVerdict = 'delete-safe' | 'needs-review';

export interface IReclaimInput {
	readonly branches: readonly IOrphanBranch[];
	readonly stashes: readonly IOrphanStash[];
	readonly currentBranch: string | null;
	readonly protectedBranches: readonly string[];
}

export interface IReclaimReport {
	readonly deleteSafeBranches: readonly IOrphanBranch[];
	readonly reviewBranches: readonly IOrphanBranch[];
	readonly stashes: readonly IOrphanStash[];
	/** Branches skipped because they are protected or currently checked out. */
	readonly skipped: readonly string[];
}

/** Pure classifier. `ahead === 0` is the lossless-delete signal. */
export const classifyBranch = (branch: IOrphanBranch): BranchVerdict =>
	branch.ahead === 0 ? 'delete-safe' : 'needs-review';

/** Pure decision engine. No I/O, no side effects. */
export const buildReclaimReport = (input: IReclaimInput): IReclaimReport => {
	const protectedSet = new Set(input.protectedBranches);
	const deleteSafe: IOrphanBranch[] = [];
	const review: IOrphanBranch[] = [];
	const skipped: string[] = [];
	for (const branch of input.branches) {
		if (
			branch.name === input.currentBranch ||
			protectedSet.has(branch.name)
		) {
			skipped.push(branch.name);
			continue;
		}
		(branch.ahead === 0 ? deleteSafe : review).push(branch);
	}
	return {
		deleteSafeBranches: deleteSafe,
		reviewBranches: review,
		stashes: [...input.stashes],
		skipped,
	};
};

// ---------- CLI shell ----------

const DEFAULT_PROTECTED_BRANCHES: readonly string[] = [
	'develop',
	'main',
	'master',
];

const runGit = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly output: string } => {
	const res = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
	if (res.status !== 0) return { ok: false, output: '' };
	return { ok: true, output: (res.stdout ?? '').trim() };
};

const readCurrentBranch = (cwd: string): string | null => {
	const out = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).output;
	if (out === '' || out === 'HEAD') return null;
	return out;
};

const readAllBranchNames = (cwd: string): readonly string[] => {
	const raw = runGit(cwd, [
		'for-each-ref',
		'--format=%(refname:short)',
		'refs/heads/',
	]).output;
	return raw.length === 0
		? []
		: raw
				.split('\n')
				.map((line) => line.trim())
				.filter((n) => n.length > 0);
};

const aheadBehind = (
	cwd: string,
	base: string,
	branch: string,
): { ahead: number; behind: number } => {
	const raw = runGit(cwd, [
		'rev-list',
		'--left-right',
		'--count',
		`${base}...${branch}`,
	]).output;
	const parts = raw.split(/\s+/u);
	const behind = Number.parseInt(parts[0] ?? '0', 10);
	const ahead = Number.parseInt(parts[1] ?? '0', 10);
	return {
		ahead: Number.isFinite(ahead) ? ahead : 0,
		behind: Number.isFinite(behind) ? behind : 0,
	};
};

const lastCommitIso = (cwd: string, branch: string): string =>
	runGit(cwd, ['log', '-1', '--format=%cI', branch]).output;

const diffStatFor = (cwd: string, base: string, branch: string): string =>
	runGit(cwd, ['diff', '--shortstat', `${base}...${branch}`]).output;

const readBranches = (cwd: string, base: string): readonly IOrphanBranch[] => {
	const names = readAllBranchNames(cwd);
	return names.map((name) => {
		const { ahead, behind } = aheadBehind(cwd, base, name);
		return {
			name,
			ahead,
			behind,
			lastCommitIso: lastCommitIso(cwd, name),
			diffStat: diffStatFor(cwd, base, name),
		};
	});
};

const trimOrNull = (raw: string | undefined): string | null => {
	if (raw === undefined) return null;
	const trimmed = raw.trim();
	return trimmed.length === 0 ? null : trimmed;
};

const parseStashLine = (line: string): IOrphanStash | null => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const sep1 = trimmed.indexOf('|');
	if (sep1 === -1) return null;
	const sep2 = trimmed.indexOf('|', sep1 + 1);
	if (sep2 === -1) return null;
	const ref = trimmed.slice(0, sep1);
	const subject = trimmed.slice(sep1 + 1, sep2);
	const date = trimOrNull(trimmed.slice(sep2 + 1));
	const colonIdx = subject.indexOf(':');
	let branch: string | null;
	let message: string;
	if (colonIdx > 0) {
		const candidate = subject.slice(0, colonIdx).trim();
		if (candidate.length > 0 && !/\s/u.test(candidate)) {
			branch = candidate;
			message = subject.slice(colonIdx + 1).trim();
		} else {
			branch = null;
			message = subject.trim();
		}
	} else {
		branch = null;
		message = subject.trim();
	}
	return {
		ref,
		branch,
		message: message.length === 0 ? subject : message,
		date,
	};
};

const readStashes = (cwd: string): readonly IOrphanStash[] => {
	const raw = runGit(cwd, ['stash', 'list', '--format=%gd|%gs|%gD']).output;
	if (raw.length === 0) return [];
	return raw
		.split('\n')
		.map(parseStashLine)
		.filter((entry): entry is IOrphanStash => entry !== null);
};

const deleteBranch = (cwd: string, name: string): boolean =>
	runGit(cwd, ['branch', '-D', name]).ok;

interface ICliArgs {
	readonly cwd: string;
	readonly base: string;
	readonly apply: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	let base = 'develop';
	let apply = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--base':
				base = argv[++i] ?? base;
				break;
			case '--apply':
				apply = true;
				break;
			default:
				break;
		}
	}
	return { cwd, base, apply };
};

const renderReport = (report: IReclaimReport, base: string): string => {
	const lines: string[] = [];
	lines.push(`base branch: ${base}`);
	lines.push('');
	if (report.deleteSafeBranches.length === 0) {
		lines.push('delete-safe branches: none');
	} else {
		lines.push(
			`delete-safe branches (${report.deleteSafeBranches.length}) — ahead 0, safe to delete:`,
		);
		for (const b of report.deleteSafeBranches) {
			lines.push(
				`  - ${b.name}  (behind ${b.behind}; ${b.diffStat || 'no diff'})`,
			);
			lines.push(`      git branch -D ${b.name}`);
		}
	}
	lines.push('');
	if (report.reviewBranches.length === 0) {
		lines.push('needs-review branches: none');
	} else {
		lines.push(
			`needs-review branches (${report.reviewBranches.length}) — unique commits, review then merge or delete:`,
		);
		for (const b of report.reviewBranches) {
			lines.push(
				`  - ${b.name}  ahead ${b.ahead}, behind ${b.behind}; ${b.diffStat || 'no diff'}; last ${b.lastCommitIso || '?'}`,
			);
			lines.push(
				`      review:  git log ${base}..${b.name} && git diff ${base}...${b.name}`,
			);
			lines.push(
				`      merge:   git switch ${base} && git merge --no-ff ${b.name}  (then fix + validate + commit)`,
			);
			lines.push(`      delete:  git branch -D ${b.name}`);
		}
	}
	lines.push('');
	if (report.stashes.length === 0) {
		lines.push('stashes: none');
	} else {
		lines.push(
			`stashes (${report.stashes.length}) — review then pop/apply or drop:`,
		);
		for (const s of report.stashes) {
			const when = s.date !== null ? ` (${s.date})` : '';
			lines.push(
				`  - ${s.ref}${s.branch !== null ? ` on ${s.branch}` : ''}${when}: ${s.message}`,
			);
			lines.push(`      review: git stash show -p ${s.ref}`);
			lines.push(
				`      apply:  git stash pop ${s.ref}   (or: drop it after review)`,
			);
		}
	}
	if (report.skipped.length > 0) {
		lines.push('');
		lines.push(
			`skipped (protected or current): ${report.skipped.join(', ')}`,
		);
	}
	return lines.join('\n');
};

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	const currentBranch = readCurrentBranch(args.cwd);
	const branches = readBranches(args.cwd, args.base);
	const stashes = readStashes(args.cwd);
	const report = buildReclaimReport({
		branches,
		stashes,
		currentBranch,
		protectedBranches: DEFAULT_PROTECTED_BRANCHES,
	});

	if (!args.apply) {
		process.stdout.write(`${renderReport(report, args.base)}\n`);
		return 0;
	}

	// --apply: delete only the provably-lossless branches.
	let deleted = 0;
	for (const branch of report.deleteSafeBranches) {
		if (deleteBranch(args.cwd, branch.name)) {
			process.stdout.write(`deleted ${branch.name}\n`);
			deleted += 1;
		} else {
			process.stderr.write(`FAILED to delete ${branch.name}\n`);
		}
	}
	process.stdout.write(
		`reclaim-orphans: deleted ${deleted} delete-safe branch(es); ${report.reviewBranches.length} needs-review, ${report.stashes.length} stash(es) left for manual review.\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
