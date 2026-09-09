#!/usr/bin/env bun
/**
 * proposal-cited-commits.script.ts — x00153 S4.
 *
 * Lint that audits commit hashes cited by `done/*` proposals
 * under `docs/delendai/proposals/done/`. Every backticked
 * 7+-char hex string is treated as a commit short-SHA and checked for
 * REACHABILITY from a ref. Anything a fresh clone could not follow is
 * reported as an orphan.
 *
 * History (from x00153's `why`):
 *   The 2026-07-25 pathology saw 17 commits cited by 11 `done/`
 *   proposals that did not exist in the repo — some were rebased
 *   away, some were typos, some referenced private forks. The
 *   `a00074 S1` shipped-in gate prevents the *forward* direction
 *   (a new proposal cannot be moved to `done/` without a real
 *   `shipped-in: [sha, …]`), but historical back-citations were
 *   never audited. This lint closes that gap.
 *
 * Baseline suppression:
 *   130 orphan citations are known, recorded in
 *   `proposal-cited-commits.baseline.json` so validate does not fail
 *   on history nobody can repair. That number jumped from 11 when the
 *   predicate was corrected (see `reachableCommits` below), and the
 *   jump is a MEASUREMENT, not a concession: the same citations were
 *   already failing this gate in CI on every run, while passing on
 *   developer machines whose object stores still held the
 *   rebased-away commits. The debt was always this size; only its
 *   visibility changed.
 *
 *   These are `done/` documents — closed, immutable records — citing
 *   commits that squash-merges destroyed. The objects are gone from
 *   the remote, so there is no SHA to correct them to. Suppression is
 *   the honest bookkeeping; deleting the citations would erase the
 *   audit trail, and leaving the gate red would mean it gates nothing.
 *
 *   What the baseline does NOT weaken: it keys on the exact
 *   (hash, proposal path) pair, so a NEW proposal citing any of these
 *   hashes still fails, and every future citation is checked against
 *   published history rather than against whatever happens to survive
 *   in the author's `.git`.
 *
 *   To re-baseline: run `--update` (newly-orphaned commits are
 *   appended with `status: 'known-orphan'`).
 *
 * SOLID notes:
 *   - **Pure over the input** (`extractCitedHashes`, `findOrphanHashes`):
 *     no I/O, no git, no filesystem. The caller does the wiring.
 *   - **Adapter for git**: `commitExists` shells out to `git rev-parse`
 *     and `git rev-list`.
 *   - **Adapter for disk**: `readBaseline` reads JSON; `writeBaseline`
 *     writes JSON. No exceptions, just empty defaults.
 *   - **CLI wrapper**: prints the verdict and exits 0/1.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const PROPOSALS_DIR = 'docs/delendai/proposals';
const DONE_DIRS = [
	'done/feats',
	'done/fixes',
	'done/refactors',
	'done/chores',
	'done/audits',
];
const BASELINE_REL = 'tools/scripts/lint/proposal-cited-commits.baseline.json';

/** Hash shape: 7-40 hex chars, surrounded by backticks. The `g` flag lets us catch multiple per line. */
const BACKTICKED_HASH_RE = /`([0-9a-f]{7,40})`/gi;

// Proposal ids such as `f00067a` are historical document references, not git
// object names. Keep them out of the commit-citation audit.
const PROPOSAL_ID_RE = /^[a-z]\d{5}[a-z]$/i;
const CI_RUN_ID_RE = /^\d{9,}$/;

/** A single orphan citation found in a proposal. */
export interface IOrphanCitation {
	readonly hash: string;
	readonly proposalRelPath: string;
	readonly line: number;
}

/** The verdict returned by `findOrphanHashes`. */
export interface IOrphanHashesVerdict {
	readonly orphans: readonly IOrphanCitation[];
	readonly checked: number;
}

/** A single entry in the suppression baseline. */
export interface IBaselineEntry {
	readonly hash: string;
	readonly proposals: readonly string[];
	readonly status: 'known-orphan';
	readonly expectedResolution: string;
	readonly recordedAt: string;
}

/** Top-level baseline shape. */
export interface IBaseline {
	readonly orphans: readonly IBaselineEntry[];
}

/**
 * Extract every backticked 7-40-char hex string from a markdown body
 * along with its 1-based line number. Pure over the input string.
 */
export const extractCitedHashes = (
	markdown: string,
): readonly { hash: string; line: number }[] => {
	const out: { hash: string; line: number }[] = [];
	const lines = markdown.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		for (const match of line.matchAll(BACKTICKED_HASH_RE)) {
			const hash = match[1];
			if (
				hash !== undefined &&
				!PROPOSAL_ID_RE.test(hash) &&
				!CI_RUN_ID_RE.test(hash)
			) {
				out.push({ hash: hash.toLowerCase(), line: i + 1 });
			}
		}
	}
	return out;
};

/**
 * Every commit reachable from a PUBLISHED ref, as full object ids.
 *
 * This is the whole reason the check is trustworthy. The original
 * predicate was `git cat-file -t <hash>`, which answers "is this object
 * in the local store" — and a store keeps rebased-away commits alive for
 * weeks through the reflog. So the gate returned PASS on the machine of
 * whoever wrote the citation and FAIL in CI, where the clone has only
 * what the remote publishes. A gate whose verdict depends on the
 * developer's garbage collector cannot gate anything: it was red on
 * `develop` continuously, which means it had stopped catching new
 * orphans entirely.
 *
 * `--remotes --tags` and deliberately NOT `--all`: `--all` includes
 * LOCAL branches, which a clone does not reproduce either. That is not
 * hypothetical — a stale local `main` here kept six citations alive that
 * CI correctly reported as orphaned, which is the same class of bug one
 * layer up. Remote-tracking refs and tags are what every clone gets, so
 * they are the only honest definition of "published".
 *
 * One walk builds the set; each citation is then a set lookup rather
 * than another git process.
 */
const reachableCommits = (
	git: (args: readonly string[]) => { stdout: string; status: number },
): ReadonlySet<string> => {
	const res = git(['rev-list', '--remotes', '--tags']);
	if (res.status !== 0) return new Set<string>();
	return new Set(
		res.stdout
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length === 40),
	);
};

/**
 * True when `hash` names a commit that is reachable from at least one
 * ref. A dangling object — present locally, published nowhere — is NOT
 * a valid citation: a reader who clones the repo cannot follow it.
 */
export const commitExists = (
	hash: string,
	git: (args: readonly string[]) => {
		stdout: string;
		status: number;
	} = defaultGit,
	reachable?: ReadonlySet<string>,
): boolean => {
	const resolved = git(['rev-parse', '--verify', `${hash}^{commit}`]);
	if (resolved.status !== 0) return false;
	const full = resolved.stdout.trim();
	if (full.length !== 40) return false;
	return (reachable ?? reachableCommits(git)).has(full);
};

const defaultGit = (
	args: readonly string[],
): { stdout: string; status: number } => {
	const res = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
	return { stdout: res.stdout ?? '', status: res.status ?? 1 };
};

/**
 * Walk all .md files under the given `done/` subdirectories and
 * return the orphan citations (hashes that look like short-SHAs but
 * do not exist in git). Pure I/O: takes the proposals dir as input.
 */
export const findOrphanHashes = async (
	proposalsDirAbs: string,
	doneDirs: readonly string[],
	git: (args: readonly string[]) => {
		stdout: string;
		status: number;
	} = defaultGit,
): Promise<IOrphanHashesVerdict> => {
	const orphans: IOrphanCitation[] = [];
	let checked = 0;
	// Walked ONCE for the whole run, not once per citation.
	const reachable = reachableCommits(git);
	for (const rel of doneDirs) {
		const abs = join(proposalsDirAbs, rel);
		if (!existsSync(abs)) continue;
		const names = await readdir(abs, { recursive: true });
		for (const name of names) {
			if (!name.endsWith('.md')) continue;
			const filePath = join(abs, name);
			const markdown = readFileSync(filePath, 'utf8');
			const cited = extractCitedHashes(markdown);
			// Dedupe per file so a hash cited 3 times in one proposal is
			// reported as 3 line-numbered entries, not 1 entry + 1 line.
			for (const { hash, line } of cited) {
				checked += 1;
				if (!commitExists(hash, git, reachable)) {
					orphans.push({
						hash,
						proposalRelPath: relative(REPO_ROOT, filePath),
						line,
					});
				}
			}
		}
	}
	return { orphans, checked };
};

/** Read the baseline file. Returns an empty baseline if the file is missing or malformed. */
export const readBaseline = (baselineAbs: string): IBaseline => {
	if (!existsSync(baselineAbs)) return { orphans: [] };
	try {
		const raw = readFileSync(baselineAbs, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'orphans' in parsed &&
			Array.isArray((parsed as { orphans: unknown }).orphans)
		) {
			return parsed as IBaseline;
		}
	} catch {
		// Fall through to empty default
	}
	return { orphans: [] };
};

const writeBaseline = (baselineAbs: string, baseline: IBaseline): void => {
	writeFileSync(
		baselineAbs,
		`${JSON.stringify(baseline, null, '\t')}\n`,
		'utf8',
	);
};

/**
 * Apply the baseline: filter the orphan list so the report only
 * surfaces **new** orphans (not in the baseline).
 */
export const applyBaseline = (
	orphans: readonly IOrphanCitation[],
	baseline: IBaseline,
): readonly IOrphanCitation[] => {
	const known = new Set(
		baseline.orphans.map((e) => `${e.hash}\x00${e.proposals.join(',')}`),
	);
	return orphans.filter(
		(o) => !known.has(`${o.hash}\x00${o.proposalRelPath}`),
	);
};

const formatReport = (
	verdict: IOrphanHashesVerdict,
	baseline: IBaseline,
	proposalsRoot: string,
): string => {
	const known = baseline.orphans.length;
	const lines: string[] = [];
	lines.push(
		`proposal-cited-commits: ${verdict.checked} hash(es) checked across done/* proposals`,
	);
	if (verdict.orphans.length === 0) {
		lines.push('✓ no new orphan commits cited');
		if (known > 0) {
			lines.push(`(${known} known orphan(s) suppressed by baseline)`);
		}
	} else {
		lines.push(`✗ ${verdict.orphans.length} NEW orphan commit(s) cited:`);
		lines.push('');
		for (const o of verdict.orphans) {
			const rel = relative(proposalsRoot, o.proposalRelPath);
			lines.push(`  - ${o.hash} (${rel}:${o.line})`);
		}
	}
	return `${lines.join('\n')}\n`;
};

export interface ICliOptions {
	readonly cwd: string;
	readonly update: boolean;
	readonly json: boolean;
}

const printJson = (
	verdict: IOrphanHashesVerdict,
	baseline: IBaseline,
): void => {
	const out = {
		checked: verdict.checked,
		newOrphans: verdict.orphans,
		knownOrphans: baseline.orphans.length,
	};
	console.log(JSON.stringify(out, null, 2));
};

const main = async (argv: readonly string[]): Promise<number> => {
	const update = argv.includes('--update');
	const json = argv.includes('--json');
	const proposalsDirAbs = join(REPO_ROOT, PROPOSALS_DIR);
	const baselineAbs = join(REPO_ROOT, BASELINE_REL);

	const verdict = await findOrphanHashes(proposalsDirAbs, DONE_DIRS);
	const baseline = readBaseline(baselineAbs);

	if (update) {
		// Append every currently-orphaned (hash, proposalRelPath) pair to the
		// baseline, regardless of whether it was already there. Idempotent
		// because we de-dupe by (hash, proposalRelPath).
		const now = new Date().toISOString();
		const known = new Map<string, IBaselineEntry>();
		for (const e of baseline.orphans) {
			known.set(`${e.hash}\x00${e.proposals.join(',')}`, e);
		}
		for (const o of verdict.orphans) {
			const key = `${o.hash}\x00${o.proposalRelPath}`;
			if (!known.has(key)) {
				known.set(key, {
					hash: o.hash,
					proposals: [o.proposalRelPath],
					status: 'known-orphan',
					expectedResolution:
						'amend on next close (replace with real shipped-in SHA)',
					recordedAt: now,
				});
			}
		}
		const newBaseline: IBaseline = { orphans: Array.from(known.values()) };
		writeBaseline(baselineAbs, newBaseline);
		console.log(
			`✓ proposal-cited-commits: baseline updated (${newBaseline.orphans.length} entries)`,
		);
		return 0;
	}

	const newOrphans = applyBaseline(verdict.orphans, baseline);
	const finalVerdict: IOrphanHashesVerdict = {
		...verdict,
		orphans: newOrphans,
	};

	if (json) {
		printJson(finalVerdict, baseline);
	} else {
		console.log(formatReport(finalVerdict, baseline, proposalsDirAbs));
	}

	return finalVerdict.orphans.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
