#!/usr/bin/env bun
/**
 * no-proposal-id-comments-in-source.script.ts — c00141 (Track H of q00006).
 *
 * Architectural rule: source-code comments that reference proposal ids
 * (`// f00087 S2`, `// x00241`, `// b00236 — privacy predecessor`) are
 * forbidden. The code must be atemporal: traceability lives in
 *
 *   - commit messages (`<kind>(<id>): …` per Conventional Commits);
 *   - the proposal graph (`docs/mcp-vertex/proposals/**`);
 *   - `git log --grep=<id>`.
 *
 * The pattern matched is
 *
 *     /\/\/\s*[a-z]\d{4,5}(?:\s|$|S\d|—|-)/
 *
 * (4- or 5-digit proposal id followed by a separator: EOL, whitespace,
 * slice tag like `S2`, em-dash, or hyphen). The current proposal-id
 * format is `c/f/d/x/r/b/t/p/a/l/u/s` + 5 digits (the first digit is
 * padded to width 5 by `proposal-id-allocator.ts`). The 4-digit form
 * is grandfathered in `c00141` itself (the proposal id starts with
 * `c0014`) so both shapes are accepted.
 *
 * Scope:
 *   - Production source under packages, plugins, apps, extensions.
 *     (The `src/**` glob is expanded by `walk`; recursing into
 *     `node_modules`, `dist`, `build`, `coverage` is forbidden.)
 *   - Test specs: `*.spec.ts` is allowed to carry `// repro for
 *     xNNNNN` style notes — these are legitimate regression markers,
 *     not provenance.
 *
 * Baseline:
 *   The repo already carries a non-trivial number of legacy comments
 *   (see `no-proposal-id-comments-in-source.baseline.json`). The lint
 *   reports any violation whose `path:line` is NOT in the baseline;
 *   baseline violations stay silenced until a dedicated cleanup
 *   daughter removes them. Future comments MUST NOT add new violations
 *   — CI fails when a new (unbaselined) match lands.
 *
 * Exit codes:
 *   0 — every detected comment is in the baseline (or the file is in
 *       a legitimate exception set).
 *   1 — at least one new violation was detected.
 */

import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** Default scan roots (workspace-relative). */
const DEFAULT_SCAN_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'apps',
	'extensions',
];

/** Subtrees that legitimately contain fNNNNN-style markers (fixtures, generated). */
const SCAN_EXCLUDE_PREFIXES: readonly string[] = [
	// Test specs MAY carry `// repro for xNNNNN` style markers — these
	// are legitimate regression provenance, not author commentary.
	'.spec.ts',
	// Generated trees + examples are not produced by humans.
	'dist/',
	'build/',
	'node_modules/',
	'docs/mcp-vertex/plugins/auto-generated/',
	'docs/mcp-vertex/generated/',
	'apps/web/src/generated/',
	'apps/web/public/generated/',
	'apps/web/src/data/plugins/', // also auto-generated
];

/**
 * The proposal-id comment pattern. The separator right after the id
 * must be one of:
 *   - end-of-line (`$`);
 *   - whitespace (`\s`);
 *   - a slice token (`S\d`, e.g. `// f00087 S2: …`);
 *   - a colon (`:`) — common in `f00087: …` style comments;
 *   - an em-dash (`—`) — used in `b00236 — …` provenance notes;
 *   - a hyphen (`-`) — used in `x00241-…`.
 *
 * Anchoring to a separator prevents false positives on identifiers
 * and imports that happen to contain a 4- or 5-digit substring
 * (e.g. function names like `f9001`).
 */
const PROPOSAL_ID_COMMENT = /\/\/\s*([a-z])(\d{4,5})(?:\s|:|$|S\d|—|-)/g;

/**
 * Allowlist of substrings that prove the comment is NOT author
 * commentary on a proposal — even if it incidentally contains a
 * digit sequence. These patterns must always be matched BEFORE
 * `PROPOSAL_ID_COMMENT` runs.
 */
const NON_AUTHOR_MARKERS: readonly RegExp[] = [
	/\/\/\s*TODO\b/,
	/\/\/\s*FIXME\b/,
	/\/\/\s*NOTE\b/,
	/\/\/\s*XXX\b/,
	/\/\/\s*HACK\b/,
	/\/\/\s*repro(?:duction)?\s+for\s+[a-z]\d{4,5}\b/i,
	/\/\/\s*@ts-(?:expect-error|ignore|nocheck|expec)/,
];

const TS_FILE = /\.ts$/;
const TSX_FILE = /\.tsx$/;

/** One detected violation. */
export interface IProposalIdCommentFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly column: number;
	readonly match: string;
	readonly proposalPrefix: string;
	readonly proposalDigits: string;
}

/** Parse a single file's text and emit proposal-id comment findings. */
export const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): readonly IProposalIdCommentFinding[] => {
	const findings: IProposalIdCommentFinding[] = [];
	for (const match of text.matchAll(PROPOSAL_ID_COMMENT)) {
		const start = match.index ?? 0;
		// Walk back to the start of the line so we can inspect the line
		// context for the non-author markers (TODO / FIXME / repro-for
		// / @ts-*). match.index may not be at column 0, but the WHOLE
		// comment is `^\s*//[^\n]*`, so we slice from the last `\n` to
		// the next `\n`.
		const lineStart = text.lastIndexOf('\n', start) + 1;
		const lineEnd = text.indexOf('\n', start);
		const line = text.slice(
			lineStart,
			lineEnd === -1 ? text.length : lineEnd,
		);
		if (NON_AUTHOR_MARKERS.some((re) => re.test(line))) continue;
		const prefix = (match[1] ?? '').toLowerCase();
		const digits = match[2] ?? '';
		findings.push({
			absPath,
			relPath,
			line: lineForOffset(text, start),
			column: start - lineStart + 1,
			match: match[0].trim(),
			proposalPrefix: prefix,
			proposalDigits: digits,
		});
	}
	return findings;
};

const lineForOffset = (text: string, offset: number): number => {
	let line = 1;
	for (let i = 0; i < offset; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
};

/** Recursively walk `root` collecting `.ts`/`.tsx` paths. */
const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'build' ||
					entry.name === 'coverage' ||
					entry.name === '.git'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (
				entry.isFile() &&
				(TS_FILE.test(entry.name) || TSX_FILE.test(entry.name))
			) {
				out.push(full);
			}
		}
	}
	return out;
};

const isExcluded = (relPath: string): boolean =>
	SCAN_EXCLUDE_PREFIXES.some((prefix) => {
		if (prefix.endsWith('.ts')) {
			// `.spec.ts` → match the suffix, not the prefix.
			return relPath.endsWith(prefix);
		}
		return relPath.startsWith(prefix) || relPath.includes(`/${prefix}`);
	});

/** A baseline entry: known legacy comment at a specific file:line. */
export interface IBaselineEntry {
	readonly path: string;
	readonly lines: readonly number[];
	readonly reason: string;
}

/**
 * Load the baseline JSON from disk. Returns an empty map when the file
 * is missing so a fresh checkout does not crash — the FIRST run after
 * `git pull` reports ALL violations as new and is expected to fail
 * (operators regenerate the baseline with
 * `bun tools/scripts/lint/no-proposal-id-comments-in-source.script.ts
 * --write-baseline`, mirroring the workflow used by other waivers:
 * `style-integrity.waivers.json`, `content-integrity.waivers.json`).
 */
export const loadBaseline = async (
	baselinePath: string,
): Promise<ReadonlyMap<string, ReadonlySet<number>>> => {
	const map = new Map<string, ReadonlySet<number>>();
	try {
		const text = await readFile(baselinePath, 'utf8');
		const entries = JSON.parse(text) as readonly IBaselineEntry[];
		for (const entry of entries) {
			map.set(entry.path, new Set(entry.lines));
		}
	} catch {
		// Missing or unreadable baseline → empty (all violations are new).
	}
	return map;
};

/**
 * Per-file budget: how many baselined comments a file is allowed to
 * still carry.
 *
 * The baseline records `path:line`, but matching on the exact line made
 * the lint fail on edits that changed nothing but line offsets —
 * removing three lines near the top of a file "reintroduced" every
 * baselined comment below it. With many agents committing concurrently
 * that is not an edge case, it is the normal state, and because
 * `bun run validate` is the evidence `close_slice` /
 * `proposal_transition` require, a red lint here blocked every proposal
 * from closing. A file may carry as many baselined comments as the
 * baseline recorded, no more — so a genuinely NEW comment still fails.
 */
export const buildBaselineBudget = (
	baseline: ReadonlyMap<string, ReadonlySet<number>>,
): Map<string, number> => {
	const budget = new Map<string, number>();
	for (const [path, lines] of baseline) {
		budget.set(path, lines.size);
	}
	return budget;
};

export const detectProposalIdComments = async (
	options: {
		readonly roots?: readonly string[];
		readonly baselinePath?: string;
	} = {},
): Promise<{
	readonly findings: readonly IProposalIdCommentFinding[];
	readonly baselineSuppressed: number;
	readonly ok: boolean;
}> => {
	const roots = options.roots ?? DEFAULT_SCAN_ROOTS;
	const baseline = await loadBaseline(
		options.baselinePath ??
			join(
				REPO_ROOT,
				'tools/scripts/lint/no-proposal-id-comments-in-source.baseline.json',
			),
	);
	const all: IProposalIdCommentFinding[] = [];
	const remaining = buildBaselineBudget(baseline);
	let suppressed = 0;
	for (const root of roots) {
		// `isAbsolute` lets tests pass an arbitrary /tmp/... root without it
		// being silently rewritten onto the repo root by `path.join`.
		const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
		for (const file of await walk(absRoot)) {
			const rel = relative(REPO_ROOT, file);
			if (isExcluded(rel)) continue;
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			const findings = scanText(content, file, rel);
			for (const f of findings) {
				const left = remaining.get(rel) ?? 0;
				if (left > 0) {
					remaining.set(rel, left - 1);
					suppressed += 1;
					continue;
				}
				all.push(f);
			}
		}
	}
	return {
		findings: all,
		baselineSuppressed: suppressed,
		ok: all.length === 0,
	};
};

export const formatReport = (
	result: Awaited<ReturnType<typeof detectProposalIdComments>>,
): string => {
	if (result.ok) {
		return (
			`no-proposal-id-comments-in-source: 0 violations` +
			(result.baselineSuppressed > 0
				? ` (${result.baselineSuppressed} baseline comment(s) silenced).\n`
				: '.\n')
		);
	}
	const lines: string[] = [
		`no-proposal-id-comments-in-source: ${result.findings.length} new violation(s).`,
		'',
	];
	for (const f of result.findings) {
		lines.push(`  ${f.relPath}:${f.line}:${f.column}`);
		lines.push(`    matched: ${JSON.stringify(f.match)}`);
		lines.push(
			`    propose removing the comment; traceability lives in git + proposal graph.`,
		);
	}
	if (result.baselineSuppressed > 0) {
		lines.push('');
		lines.push(
			`  Note: ${result.baselineSuppressed} legacy comment(s) are silenced by the baseline.`,
		);
		lines.push(
			'  Refresh it with `--write-baseline` ONLY after cleaning up an entire file.',
		);
	}
	return `${lines.join('\n')}\n`;
};

/**
 * Regenerate the baseline JSON from a fresh scan (operator workflow:
 *   1. clean up a file (remove the proposal-id comments);
 *   2. `bun tools/scripts/lint/no-proposal-id-comments-in-source.script.ts
 *      --write-baseline` to drop those lines from the baseline;
 *   3. commit.
 * This is the same workflow used by `lint:style-integrity` and
 * `lint:content-integrity`.)
 */
export const writeBaseline = async (
	options: {
		readonly roots?: readonly string[];
		readonly baselinePath?: string;
	} = {},
): Promise<number> => {
	const roots = options.roots ?? DEFAULT_SCAN_ROOTS;
	const map = new Map<string, Set<number>>();
	for (const root of roots) {
		const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
		for (const file of await walk(absRoot)) {
			const rel = relative(REPO_ROOT, file);
			if (isExcluded(rel)) continue;
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			const findings = scanText(content, file, rel);
			if (findings.length === 0) continue;
			const set = map.get(rel) ?? new Set<number>();
			for (const f of findings) set.add(f.line);
			map.set(rel, set);
		}
	}
	const entries: IBaselineEntry[] = [...map.entries()]
		.map(([path, lines]) => ({
			path,
			lines: [...lines].sort((a, b) => a - b),
			reason: 'Legacy proposal-id reference carried in code from before c00141; cleanup pending in a follow-up slice.',
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
	const baselinePath =
		options.baselinePath ??
		join(
			REPO_ROOT,
			'tools/scripts/lint/no-proposal-id-comments-in-source.baseline.json',
		);
	const { writeFile } = await import('node:fs/promises');
	await writeFile(baselinePath, `${JSON.stringify(entries, null, '\t')}\n`);
	process.stdout.write(
		`no-proposal-id-comments-in-source: wrote baseline with ${entries.length} file(s) → ${relative(REPO_ROOT, baselinePath)}\n`,
	);
	return 0;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	if (argv.includes('--write-baseline')) {
		return writeBaseline();
	}
	const result = await detectProposalIdComments();
	process.stdout.write(formatReport(result));
	return result.ok ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
