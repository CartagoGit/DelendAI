#!/usr/bin/env bun
/**
 * proposal-filename-canonical.script.ts — reviewer point 2026-09-06.
 *
 * Every `.md` under `docs/delendai/proposals/` MUST match the canonical
 * f00016 filename pattern, full stop. Files that don't (e.g.
 * `2026-09-06-x00504-superseded-by-….md`, `xauto-…md` in `ready/repairs/`,
 * the legacy `v00122-…` and `n00001-…` ones from before f00016) are
 * silently dropped by `sync_proposals` — `isNewSystemFilename`
 * returns false because the first character isn't a known kind
 * prefix — but still live on disk as orphaned, invisible-to-everyone
 * noise that survives every lint because every lint pre-filters
 * with the same regex they violate.
 *
 * Pre-fix lints (`proposal-id-prefix`, `proposal-folder-drift`,
 * `proposal-hygiene`) all `walkMarkdown()` over the proposals tree
 * with a regex that *excludes* non-conforming files; the orphans
 * never appeared in any report. This gate walks the WHOLE tree
 * without filtering and reports every non-conforming file by
 * path with the exact fix.
 *
 * The regex is the same one `filename-linter.ts` and
 * `isNewSystemFilename` use:
 *
 *   ^([a-z])(\d{5,})-[a-z0-9-]+\.md$
 *
 *   - first character is a known kind prefix (validated against
 *     PROPOSAL_KIND_BY_PREFIX);
 *   - then 5 or more digits (f00016 serial);
 *   - then a kebab slug;
 *   - only lower-case ASCII letters / digits / dashes in the slug.
 *
 * Non-proposal `.md` files (README.md inside `proposals/<dir>/`)
 * and the `.gitkeep` placeholders are exempted by name.
 *
 * RATCHET: pre-fix the proposals tree had ~22 legacy / auto-repair
 * orphans on disk (the `v00122-v00134` perfs and `n00001-n00007`
 * resumes are pre-f00016 prefixes; the `2026-09-06-…`
 * auto-repair cascade is the offender that prompted this gate).
 * Re-permissioning them all is out of scope for this slice, so
 * the gate uses the same baseline pattern as `proposal-cited-commits`:
 * the first `--update` captures every existing violation into a
 * JSON baseline; the ratchet only fails on NEW violations in new
 * files. `--check` is what validate runs.
 *
 * Exit codes: 0 clean (or only baselined), 1 new violations, 2 bad
 * usage.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PROPOSALS_REL = 'docs/delendai/proposals';
const BASELINE_REL =
	'tools/scripts/lint/proposal-filename-canonical.baseline.json';

// Single source of truth: mirrors plugins/proposals/src/lib/proposals/filename-linter.ts:53 FILENAME_RE
// + the PROPOSAL_KIND_BY_PREFIX check inside isNewSystemFilename.
const CANONICAL_RE = /^([a-z])(\d{5,})-[a-z0-9-]+\.md$/;
const KNOWN_PREFIXES = new Set([
	'f', // feat
	'x', // fix
	'b', // breaking
	'a', // audit
	'c', // chore
	'd', // docs
	't', // test
	'i', // infra
	's', // spike
	'l', // legacy
	'm', // resume
	'q', // plan
	'r', // refactor
	'p', // perf
	'w', // repair
]);

const EXEMPT_NAMES = new Set(['readme.md', '.gitkeep', 'index.md']);

export interface IIssue {
	readonly relPath: string;
	readonly message: string;
}

const walkAllMarkdown = (root: string): string[] => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop() ?? '';
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const abs = join(dir, entry);
			let s;
			try {
				s = statSync(abs);
			} catch {
				continue;
			}
			if (s.isDirectory()) {
				stack.push(abs);
				continue;
			}
			if (
				s.isFile() &&
				entry.toLowerCase().endsWith('.md') &&
				!EXEMPT_NAMES.has(entry.toLowerCase())
			) {
				out.push(abs);
			}
		}
	}
	return out;
};

export const validate = (root: string): readonly IIssue[] => {
	const proposalsDirAbs = join(root, PROPOSALS_REL);
	const issues: IIssue[] = [];
	for (const abs of walkAllMarkdown(proposalsDirAbs)) {
		const rel = relative(proposalsDirAbs, abs).split(sep).join('/');
		const filename = rel.split('/').pop() ?? '';
		const m = CANONICAL_RE.exec(filename);
		if (m === null) {
			issues.push({
				relPath: rel,
				message: `filename "${filename}" does not match the canonical pattern \`<prefix><NNNNN>-<kebab-slug>.md\` — known prefix + 5+ digits + kebab slug (lowercase ASCII letters / digits / dashes only)`,
			});
			continue;
		}
		const prefix = m[1] ?? '';
		if (!KNOWN_PREFIXES.has(prefix)) {
			issues.push({
				relPath: rel,
				message: `filename prefix "${prefix}" is not a known proposal kind prefix (one of ${[...KNOWN_PREFIXES].sort().join(', ')})`,
			});
		}
	}
	issues.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return issues;
};

const readBaseline = (root: string): Set<string> => {
	const baselineAbs = join(root, BASELINE_REL);
	try {
		const raw = readFileSync(baselineAbs, 'utf8');
		const parsed = JSON.parse(raw) as {
			readonly entries?: readonly string[];
		};
		return new Set(parsed.entries ?? []);
	} catch {
		return new Set();
	}
};

const writeBaseline = (root: string, relPaths: readonly string[]): void => {
	const baselineAbs = join(root, BASELINE_REL);
	mkdirSync(join(root, 'tools/scripts/lint'), { recursive: true });
	writeFileSync(
		baselineAbs,
		`${JSON.stringify({ entries: relPaths }, null, '\t')}\n`,
	);
};

type Mode = 'check' | 'update' | 'report';

const parseMode = (argv: readonly string[]): Mode => {
	for (const arg of argv) {
		if (arg === '--update') return 'update';
		if (arg === '--report') return 'report';
		if (arg === '--check' || arg === '--help' || arg === '-h')
			return 'check';
	}
	return 'check';
};

export const runOnRoot = async (
	argv: readonly string[],
	root: string,
): Promise<number> => {
	const mode = parseMode(argv);
	const allIssues = validate(root);
	const baseline = readBaseline(root);

	const newIssues = allIssues.filter((i) => !baseline.has(i.relPath));

	if (mode === 'update') {
		const allRelPaths = allIssues.map((i) => i.relPath);
		writeBaseline(root, allRelPaths);
		console.log(
			`✓ proposal-filename-canonical: wrote ${String(allRelPaths.length)} entries to ${BASELINE_REL}`,
		);
		return 0;
	}

	if (mode === 'report') {
		console.log(
			`proposal-filename-canonical: ${String(allIssues.length)} total, ${String(newIssues.length)} new (vs baseline of ${String(baseline.size)})`,
		);
		return 0;
	}

	// --check (default)
	if (newIssues.length > 0) {
		console.log(
			`proposal-filename-canonical: ${String(newIssues.length)} NEW non-canonical filename(s) (${String(allIssues.length)} total, ${String(baseline.size)} baselined):`,
		);
		for (const i of newIssues) {
			console.log(`  ${i.relPath}`);
			console.log(`    ${i.message}`);
		}
		console.log(
			'\nRename to `<prefix><NNNNN>-<kebab-slug>.md` (lowercase prefix, ≥5 digits) and park under the matching `STATUS_TO_FOLDER`. Or run with --update to baseline known historical debt.',
		);
		return 1;
	}
	console.log(
		`✓ proposal-filename-canonical: 0 new violations (${String(allIssues.length)} baselined)`,
	);
	return 0;
};

export const main = async (
	argv: readonly string[] = process.argv,
): Promise<number> => {
	return await runOnRoot(argv, repoRoot());
};

// Entry-point: only run the CLI when invoked directly, never when
// imported by a test or another script.
if (
	typeof process !== 'undefined' &&
	process.argv[1] !== undefined &&
	(process.argv[1].endsWith('proposal-filename-canonical.script.ts') ||
		process.argv[1].endsWith('proposal-filename-canonical.script'))
) {
	process.exit(await main());
}
