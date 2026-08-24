#!/usr/bin/env bun
/**
 * file-conventions.script.ts — f00037 S1 (CLI shell).
 *
 * Companion to `file-conventions.ts`. The classifier is pure; this
 * script is the only piece that touches the filesystem (walks the
 * repo, prints a report, exits 0 when clean or 1 when drift is found).
 *
 * Usage:
 *   bun tools/scripts/lint/file-conventions.script.ts                  # check current repo
 *   bun tools/scripts/lint/file-conventions.script.ts --report         # only count, no findings
 *   bun tools/scripts/lint/file-conventions.script.ts --roots=docs,apps # limit scan
 *   bun tools/scripts/lint/file-conventions.script.ts --baseline=<path>       # ratchet: only NEW unmatched files fail
 *   bun tools/scripts/lint/file-conventions.script.ts --write-baseline=<path> # accept today's unmatched files as the floor
 *
 * Architecture (matches preset-drift.script.ts):
 *   - `IRoleFinding` (interface) — one row in the report.
 *   - `walkAndClassify(rootDir, scanRoots)` (pure engine over the
 *     filesystem) — returns findings for every `.ts`/`.tsx` file
 *     that the classifier maps to `'other'` (the only drift signal in
 *     S1; the strict-mode report in S7 widens this set).
 *   - `formatReport(findings)` (pure formatter) — prints to stderr.
 *   - `main()` (CLI shell) — parses args, runs the engine, formats,
 *     exits.
 *
 * SOLID: this file depends on the abstract `classifyPath` and the
 * `Role` union from `file-conventions.ts`. Tests can inject a fake
 * `classifyPath` without monkey-patching; the production wiring is
 * the default export.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { classifyPath, DEFAULT_TS_RULES, type Role } from './file-conventions';

export interface IRoleFinding {
	readonly relPath: string;
	readonly role: Role;
	readonly reason: 'unmatched' | 'rule-error';
}

/**
 * Ratchet baseline: the set of `relPath`s already accepted as
 * pre-existing debt. `--baseline=<path>` filters findings down to
 * only files NOT in this set (real repo migration has ~329+ files
 * that predate the convention — see types-in-contracts.script.ts's
 * identical rationale); `--write-baseline=<path>` accepts today's
 * findings as the new floor. Mirrors the pattern used by
 * `solid-compliance.lib.ts` / `proposal-files-exist.script.ts` /
 * `types-in-contracts.script.ts` so all four ratchets behave the same
 * way for a human running them.
 */
export const loadBaseline = async (
	path: string,
): Promise<ReadonlySet<string>> => {
	const raw = await readFile(path, 'utf8').catch(() => null);
	if (raw === null) return new Set();
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? new Set(parsed.filter((v): v is string => typeof v === 'string'))
			: new Set();
	} catch {
		return new Set();
	}
};

export const writeBaseline = async (
	path: string,
	relPaths: readonly string[],
): Promise<void> => {
	const sorted = [...relPaths].sort((a, b) => a.localeCompare(b));
	await writeFile(path, `${JSON.stringify(sorted, null, '\t')}\n`, 'utf8');
};

/** Pure: findings whose `relPath` is NOT already in the baseline. */
export const filterNewFindings = (
	findings: readonly IRoleFinding[],
	baseline: ReadonlySet<string>,
): readonly IRoleFinding[] => findings.filter((f) => !baseline.has(f.relPath));

/** Repo-relative POSIX path of a file (or null if `absPath` is outside `rootDir`). */
export const toRelPosix = (rootDir: string, absPath: string): string => {
	const rel = relative(rootDir, absPath);
	if (rel.startsWith('..') || rel === '') return rel;
	return rel.split(sep).join('/');
};

/**
 * Walk `scanRoots` (each relative to `rootDir`), classify every
 * TypeScript file, and return the findings. Pure except for the
 * `readdir` I/O — kept async because the engine is a hot path
 * (AGENTS.md #3).
 */
export const walkAndClassify = async (
	rootDir: string,
	scanRoots: readonly string[],
): Promise<readonly IRoleFinding[]> => {
	const findings: IRoleFinding[] = [];
	const stack: string[] = [...scanRoots];
	while (stack.length > 0) {
		const rel = stack.pop() as string;
		const abs = join(rootDir, rel);
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = await readdir(abs, { withFileTypes: true });
		} catch {
			// Missing root (e.g. `docs/` filtered out) — skip silently.
			continue;
		}
		for (const entry of entries) {
			const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'build'
				)
					continue;
				stack.push(childRel);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!/\.tsx?$/.test(entry.name)) continue;
			const role = classifyPath(childRel, DEFAULT_TS_RULES);
			if (role === 'other') {
				findings.push({ relPath: childRel, role, reason: 'unmatched' });
			}
		}
	}
	findings.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return findings;
};

/**
 * Format findings as a human-readable report. Pure.
 *
 * `reportOnly` (the `--report` flag, S2) collapses the output to the
 * single count line — the baseline number the migration burns down,
 * with no per-file noise. The default (check mode) lists the first 50
 * drift files so a contributor can see exactly what to rename.
 */
export const formatReport = (
	findings: readonly IRoleFinding[],
	reportOnly = false,
): string => {
	if (findings.length === 0) return 'file-conventions: 0 unmatched files\n';
	const header = `file-conventions: ${findings.length} unmatched files`;
	if (reportOnly) return `${header}\n`;
	const lines: string[] = [header];
	const limit = 50;
	for (let i = 0; i < Math.min(findings.length, limit); i++) {
		const f = findings[i];
		if (f) lines.push(`  ${f.relPath}`);
	}
	if (findings.length > limit) {
		lines.push(`  …and ${findings.length - limit} more`);
	}
	return `${lines.join('\n')}\n`;
};

/**
 * Pure policy: how should the CLI exit given the findings + flags?
 * SRP — separated from the engine so tests can assert the policy
 * without standing up the filesystem walker.
 */
export const decideExitCode = (
	findings: readonly IRoleFinding[],
	flags: { reportOnly: boolean; strict: boolean },
): number => {
	if (flags.reportOnly) return 0;
	if (findings.length === 0) return 0;
	// Default mode (no --strict) and --strict both fail on drift; the
	// flag is wired by f00037 S7 / f00049 S6 for the future moment
	// when the unmatched count reaches 0 and the lint flips to default
	// strict. Until then, `package.json` keeps `--report` so the gate
	// stays green while the migration backlog burns down.
	if (flags.strict) return 1;
	return 1;
};

/** CLI entrypoint. Side-effecting; isolated from the engine for testability. */
export const main = async (argv: readonly string[]): Promise<number> => {
	const args = argv.slice(2);
	const reportOnly = args.includes('--report');
	const strict = args.includes('--strict');
	const rootsFlag = args.find((a) => a.startsWith('--roots='));
	const scanRoots = rootsFlag
		? (rootsFlag
				.slice('--roots='.length)
				.split(',')
				.filter(Boolean) as string[])
		: ([
				'packages',
				'plugins',
				'extensions',
				'apps',
				'docs/mcp-vertex/examples',
				'tools',
			] as const);
	const rootDir = process.cwd();
	const findings = await walkAndClassify(rootDir, scanRoots);

	const writeBaselineFlag = args.find((a) =>
		a.startsWith('--write-baseline='),
	);
	if (writeBaselineFlag) {
		const path = writeBaselineFlag.slice('--write-baseline='.length);
		await writeBaseline(
			path,
			findings.map((f) => f.relPath),
		);
		process.stderr.write(
			`file-conventions: baseline updated — ${findings.length} accepted unmatched file(s) at ${path}\n`,
		);
		return 0;
	}

	const baselineFlag = args.find((a) => a.startsWith('--baseline='));
	if (baselineFlag) {
		const path = baselineFlag.slice('--baseline='.length);
		const baseline = await loadBaseline(path);
		const newFindings = filterNewFindings(findings, baseline);
		if (newFindings.length === 0) {
			const shrank = findings.length < baseline.size;
			process.stderr.write(
				shrank
					? `✓ file-conventions: no new unmatched files; debt shrank ${baseline.size} → ${findings.length}. Run --write-baseline to lock in the win.\n`
					: `✓ file-conventions: no new unmatched files (${findings.length} baselined).\n`,
			);
			return 0;
		}
		process.stderr.write(formatReport(newFindings, reportOnly));
		return decideExitCode(newFindings, { reportOnly, strict });
	}

	process.stderr.write(formatReport(findings, reportOnly));
	return decideExitCode(findings, { reportOnly, strict });
};

// Run when invoked directly (not when imported by tests).
if (import.meta.main) {
	main(process.argv).then((code) => process.exit(code));
}
